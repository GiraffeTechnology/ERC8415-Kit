const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

/**
 * The read-and-act boundary, exercised rather than described.
 *
 * The Kit recommends that a consumer perform its projection read inside the
 * transaction that acts on it. These cases hold `contracts/examples/
 * RecordDateClaim.sol` to that: the same-block case is the one documentation
 * cannot demonstrate, because it is precisely the case where a read taken one
 * block earlier would still have looked right.
 */
describe("Example: record-date claim across the read-and-act boundary", function () {
  const REGISTER_ID = ethers.id("register:example/record-date");
  const PROFILE_ID = ethers.id("profile:attestation/secp256k1");
  const SETTLEMENT_PERIOD = 7n * 24n * 60n * 60n;

  const TOKEN = 1n;
  const GENESIS_AT = 1_000n;
  /** Between the genesis entry and every later one: provisional until one lands. */
  const RECORD_DATE = 1_500n;
  const CONFIRMING_AT = 2_000n;
  const LATER_AT = 3_000n;
  const AMOUNT = ethers.parseEther("1");

  const reference = (n) => ethers.id(`registry-reference-${n}`);
  const commitment = (n) => ethers.id(`record-commitment-${n}`);
  const snapshot = (n) => ethers.id(`snapshot-${n}`);
  const gapId = (n) => ethers.id(`settlement-${n}`);

  let projection, settlement, verifier, claim;
  let deployer, registrar, attestor, alice, bob;

  const now = async () => BigInt((await ethers.provider.getBlock("latest")).timestamp);

  const attest = async (settlementId, recordCommitment, registryReference, effectiveAt) =>
    attestor.signMessage(ethers.getBytes(
      await settlement.admissionBinding(settlementId, recordCommitment, registryReference, effectiveAt)
    ));

  /** Open a gap naming `holder`, then admit it with a real signature. */
  const admit = async (n, holder, effectiveAt) => {
    const id = gapId(n);
    await (await settlement.connect(registrar)
      .beginSettlement(TOKEN, id, holder, snapshot(n), (await now()) + 3600n)).wait();
    const proof = await attest(id, commitment(n), reference(n), effectiveAt);
    await (await settlement.connect(registrar)
      .finalizeSettlement(id, commitment(n), reference(n), effectiveAt, proof)).wait();
    return id;
  };

  beforeEach(async () => {
    [deployer, registrar, attestor, alice, bob] = await ethers.getSigners();

    const verifierFactory = await ethers.getContractFactory("AttestationProofVerifier", deployer);
    verifier = await verifierFactory.deploy(PROFILE_ID, attestor.address);
    await verifier.waitForDeployment();

    const settlementNonce = await ethers.provider.getTransactionCount(deployer.address);
    const settlementAddress = ethers.getCreateAddress({ from: deployer.address, nonce: settlementNonce + 1 });

    const projectionFactory = await ethers.getContractFactory("RegisterProjection", deployer);
    projection = await projectionFactory.deploy(REGISTER_ID, settlementAddress);
    await projection.waitForDeployment();

    const settlementFactory = await ethers.getContractFactory("ProjectionSettlement", deployer);
    settlement = await settlementFactory.deploy(
      await projection.getAddress(), await verifier.getAddress(), SETTLEMENT_PERIOD, [registrar.address]
    );
    await settlement.waitForDeployment();

    const genesisProof = await attestor.signMessage(ethers.getBytes(
      await settlement.initializationBinding(TOKEN, commitment(1), reference(1), alice.address, GENESIS_AT)
    ));
    await (await settlement.connect(registrar)
      .initializeRegister(TOKEN, commitment(1), reference(1), alice.address, GENESIS_AT, genesisProof)).wait();

    const claimFactory = await ethers.getContractFactory("RecordDateClaim", deployer);
    claim = await claimFactory.deploy(
      await projection.getAddress(), await settlement.getAddress(), RECORD_DATE, AMOUNT, { value: AMOUNT * 4n }
    );
    await claim.waitForDeployment();
  });

  it("refuses while the record date is still provisional, however right the holder looks", async () => {
    // The register already confirms alice at the record date...
    assert.equal(await projection.holderAsOf(TOKEN, RECORD_DATE), alice.address);
    // ...but no later entry has been admitted, so the answer can still change.
    assert.equal(await projection.isFinalAsOf(TOKEN, RECORD_DATE), false);

    await assert.rejects(claim.connect(alice).claim(TOKEN), /RecordDateNotFinal/);
    const [eligible, reason] = await claim.claimability(TOKEN, alice.address);
    assert.equal(eligible, false);
    assert.equal(ethers.decodeBytes32String(reason), "RECORD_DATE_NOT_FINAL");
  });

  it("a confirming entry for the same holder makes the record date final without a change of hands", async () => {
    await admit(2, alice.address, CONFIRMING_AT);

    // Nothing changed hands: the same holder, one version later.
    assert.equal(await projection.holderAsOf(TOKEN, RECORD_DATE), alice.address);
    assert.equal((await projection.currentEntry(TOKEN)).holder, alice.address);
    assert.equal(await projection.isFinalAsOf(TOKEN, RECORD_DATE), true);

    const before = await ethers.provider.getBalance(alice.address);
    const receipt = await (await claim.connect(alice).claim(TOKEN)).wait();
    const spent = receipt.gasUsed * receipt.gasPrice;
    assert.equal(await ethers.provider.getBalance(alice.address), before + AMOUNT - spent);
    assert.equal(await claim.claimed(TOKEN), true);
  });

  it("pays the holder at the record date, not whoever the register confirms now", async () => {
    await admit(2, alice.address, CONFIRMING_AT);
    await admit(3, bob.address, LATER_AT);

    // bob is the current confirmed holder; the record date still answers alice.
    assert.equal((await projection.currentEntry(TOKEN)).holder, bob.address);
    assert.equal(await projection.holderAsOf(TOKEN, RECORD_DATE), alice.address);

    await assert.rejects(claim.connect(bob).claim(TOKEN), /NotConfirmed/);
    await (await claim.connect(alice).claim(TOKEN)).wait();
    assert.equal(await claim.claimed(TOKEN), true);
  });

  it("pays once, and a second claim finds the state already spent", async () => {
    await admit(2, alice.address, CONFIRMING_AT);
    await (await claim.connect(alice).claim(TOKEN)).wait();
    await assert.rejects(claim.connect(alice).claim(TOKEN), /AlreadyClaimed/);

    const [eligible, reason] = await claim.claimability(TOKEN, alice.address);
    assert.equal(eligible, false);
    assert.equal(ethers.decodeBytes32String(reason), "ALREADY_CLAIMED");
  });

  it("refuses on an open gap as this consumer's policy, while the claim is otherwise eligible", async () => {
    await admit(2, alice.address, CONFIRMING_AT);

    await (await settlement.connect(registrar)
      .beginSettlement(TOKEN, gapId(9), bob.address, snapshot(9), (await now()) + 3600n)).wait();

    // Everything the PROTOCOL is asked stays satisfied while the gap is open:
    // an open gap does not make an already-final historical instant non-final.
    assert.notEqual(await settlement.openGapOf(TOKEN), ethers.ZeroHash);
    assert.equal(await projection.isFinalAsOf(TOKEN, RECORD_DATE), true);
    assert.equal(await projection.holderAsOf(TOKEN, RECORD_DATE), alice.address);

    // So the refusal is attributable to this contract's policy, and says so.
    await assert.rejects(claim.connect(alice).claim(TOKEN), /GapOpenPolicy/);
    const [, reason] = await claim.claimability(TOKEN, alice.address);
    assert.equal(ethers.decodeBytes32String(reason), "GAP_OPEN_POLICY");

    // Closing the gap by admission leaves the claim payable, which is what
    // makes the refusal above a policy rather than an ineligibility.
    const proof = await attest(gapId(9), commitment(9), reference(9), LATER_AT);
    await (await settlement.connect(registrar)
      .finalizeSettlement(gapId(9), commitment(9), reference(9), LATER_AT, proof)).wait();
    await (await claim.connect(alice).claim(TOKEN)).wait();
    assert.equal(await claim.claimed(TOKEN), true);
  });

  it("reads inside the acting transaction: the admission that makes it eligible lands in the same block", async () => {
    const id = gapId(2);
    await (await settlement.connect(registrar)
      .beginSettlement(TOKEN, id, alice.address, snapshot(2), (await now()) + 3600n)).wait();
    const proof = await attest(id, commitment(2), reference(2), CONFIRMING_AT);

    // Immediately before the block, the claim fails on both counts: the gap it
    // is waiting on is open, and the record date is still provisional. The
    // refusal names the first check, which is this consumer's own policy.
    assert.notEqual(await settlement.openGapOf(TOKEN), ethers.ZeroHash);
    assert.equal(await projection.isFinalAsOf(TOKEN, RECORD_DATE), false);
    await assert.rejects(claim.connect(alice).claim.staticCall(TOKEN), /GapOpenPolicy/);

    await ethers.provider.send("evm_setAutomine", [false]);
    let admission, claiming;
    try {
      // Ordered within the one block by priority fee, so the claim is mined
      // after the admission rather than merely near it.
      admission = await settlement.connect(registrar)
        .finalizeSettlement(id, commitment(2), reference(2), CONFIRMING_AT, proof,
          { maxPriorityFeePerGas: 2_000_000_000n });
      claiming = await claim.connect(alice).claim(TOKEN, { maxPriorityFeePerGas: 1_000_000_000n });
      await ethers.provider.send("evm_mine", []);
    } finally {
      await ethers.provider.send("evm_setAutomine", [true]);
    }
    const admitted = await admission.wait();
    const claimed = await claiming.wait();

    assert.equal(admitted.status, 1);
    assert.equal(claimed.status, 1, "the claim read the entry admitted earlier in its own block");
    assert.equal(claimed.blockNumber, admitted.blockNumber, "the two are in one block or this proves nothing");

    // Both conditions flipped inside that block: the admission closed the gap
    // and made the record date final. No read taken before this transaction
    // could have authorized it, which is the whole point of reading here.
    assert.equal(await settlement.openGapOf(TOKEN), ethers.ZeroHash);
    assert.equal(await projection.isFinalAsOf(TOKEN, RECORD_DATE), true);

    // The claim acted on the entry admitted in this very block, not on a
    // snapshot from the block before, where it was not yet eligible.
    const event = claimed.logs
      .map((log) => { try { return claim.interface.parseLog(log); } catch { return null; } })
      .find((parsed) => parsed?.name === "Claimed");
    assert.ok(event, "no Claimed event");
    assert.equal(event.args.holder, alice.address);
    assert.equal(event.args.entryEffectiveAt, GENESIS_AT, "the record date resolves to the genesis entry");
    assert.equal(await claim.claimed(TOKEN), true);
  });

  it("accepts no caller-supplied reading, so an earlier snapshot cannot authorize it", () => {
    const entry = claim.interface.getFunction("claim");
    assert.deepEqual(entry.inputs.map((input) => input.type), ["uint256"],
      "claim must take only a token id: any holder, version or instant parameter would be a stale read");
    assert.equal(entry.stateMutability, "nonpayable");
  });
});
