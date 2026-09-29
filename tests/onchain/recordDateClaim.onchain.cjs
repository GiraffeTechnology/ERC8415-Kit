const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

/**
 * Non-normative consumer example: contracts/examples/RecordDateClaim.sol.
 *
 * AGENTS.md recommends reading the projection and acting on it in one transaction. These
 * cases pin that shape against the deployed register and settlement contracts:
 *   - a gap opened earlier in the SAME block is seen by the claim (and the claim would
 *     otherwise have been eligible);
 *   - after a confirming entry is admitted strictly after the record date, the claim
 *     succeeds exactly once.
 */
describe("ERC-8415 consumer example: record-date claim", function () {
  const REGISTER_ID = ethers.id("register:land/v1");
  const PROFILE_ID = ethers.id("profile:attestation/secp256k1");
  const SETTLEMENT_PERIOD = 7n * 24n * 60n * 60n;
  const TOKEN = 1n;
  const FIRST_AT = 1000n;
  const RECORD_DATE = 1500n;
  const CONFIRM_AT = 2000n;
  const AMOUNT = ethers.parseEther("1");

  const reference = (n) => ethers.id(`registry-reference-${n}`);
  const commitment = (n) => ethers.id(`record-commitment-${n}`);
  const snapshot = (n) => ethers.id(`snapshot-${n}`);
  const gapId = (n) => ethers.id(`settlement-${n}`);

  let projection, settlement, verifier, deployer, registrar, attestor, alice, bob;

  const now = async () => BigInt((await ethers.provider.getBlock("latest")).timestamp);

  const openGap = async (id, holder) =>
    (await settlement.connect(registrar).beginSettlement(TOKEN, id, holder, snapshot(1), (await now()) + 3600n)).wait();

  /** Close `id` by admitting an entry for its expected holder effective at `effectiveAt`. */
  const admit = async (id, n, effectiveAt) => {
    const binding = await settlement.admissionBinding(id, commitment(n), reference(n), effectiveAt);
    const proof = await attestor.signMessage(ethers.getBytes(binding));
    await (await settlement.connect(registrar).finalizeSettlement(id, commitment(n), reference(n), effectiveAt, proof)).wait();
  };

  const deployClaim = async () => {
    const factory = await ethers.getContractFactory("RecordDateClaim", deployer);
    const claim = await factory.deploy(
      await projection.getAddress(), await settlement.getAddress(), TOKEN, RECORD_DATE, AMOUNT, { value: AMOUNT }
    );
    await claim.waitForDeployment();
    return claim;
  };

  beforeEach(async () => {
    [deployer, registrar, attestor, alice, bob] = await ethers.getSigners();

    verifier = await (await ethers.getContractFactory("AttestationProofVerifier", deployer)).deploy(PROFILE_ID, attestor.address);
    await verifier.waitForDeployment();

    const nonce = await ethers.provider.getTransactionCount(deployer.address);
    const settlementAddress = ethers.getCreateAddress({ from: deployer.address, nonce: nonce + 1 });
    projection = await (await ethers.getContractFactory("RegisterProjection", deployer)).deploy(REGISTER_ID, settlementAddress);
    await projection.waitForDeployment();
    settlement = await (await ethers.getContractFactory("ProjectionSettlement", deployer)).deploy(
      await projection.getAddress(), await verifier.getAddress(), SETTLEMENT_PERIOD, [registrar.address]
    );
    await settlement.waitForDeployment();
    assert.equal(await settlement.getAddress(), settlementAddress, "address precomputation drifted");

    const binding = await settlement.initializationBinding(TOKEN, commitment(1), reference(1), alice.address, FIRST_AT);
    const proof = await attestor.signMessage(ethers.getBytes(binding));
    await (await settlement.connect(registrar).initializeRegister(TOKEN, commitment(1), reference(1), alice.address, FIRST_AT, proof)).wait();
  });

  it("refuses a claim when a gap is opened earlier in the same block, though it was otherwise eligible", async () => {
    // Make the record date final with a confirming entry for the same holder.
    await openGap(gapId(1), alice.address);
    await admit(gapId(1), 2, CONFIRM_AT);
    const claim = await deployClaim();

    // Eligible right now: final, alice is the holder of record, no open gap.
    assert.equal(await projection.isFinalAsOf(TOKEN, RECORD_DATE), true);
    await claim.connect(alice).claim.staticCall();

    // One block: the registrar opens a gap, then alice claims.
    await ethers.provider.send("evm_setAutomine", [false]);
    try {
      const deadline = (await now()) + 3600n;
      const begin = await settlement.connect(registrar)
        .beginSettlement(TOKEN, gapId(2), bob.address, snapshot(2), deadline, { gasLimit: 500000 });
      const attempt = await claim.connect(alice).claim({ gasLimit: 200000 });
      await ethers.provider.send("evm_mine", []);

      const beginReceipt = await ethers.provider.getTransactionReceipt(begin.hash);
      const claimReceipt = await ethers.provider.getTransactionReceipt(attempt.hash);
      assert.equal(beginReceipt.blockNumber, claimReceipt.blockNumber, "not the same block");
      assert.ok(beginReceipt.index < claimReceipt.index, "gap must be ordered first");
      assert.equal(beginReceipt.status, 1);
      assert.equal(claimReceipt.status, 0, "claim should revert on the open gap");
    } finally {
      await ethers.provider.send("evm_setAutomine", [true]);
    }

    // The refusal is the consumer's policy: finality at the record date is unchanged.
    assert.equal(await projection.isFinalAsOf(TOKEN, RECORD_DATE), true);
    await assert.rejects(claim.connect(alice).claim.staticCall(), /GapOpen/);
    assert.equal(await claim.claimed(), false);
  });

  it("pays exactly once after a confirming entry is admitted strictly after the record date", async () => {
    const claim = await deployClaim();

    // One entry only: the record date is covered but not final.
    assert.equal(await projection.isFinalAsOf(TOKEN, RECORD_DATE), false);
    await assert.rejects(claim.connect(alice).claim(), /NotFinal/);

    // Confirming entry for the same holder, no ownership change.
    await openGap(gapId(1), alice.address);
    await assert.rejects(claim.connect(alice).claim(), /NotFinal/);
    await admit(gapId(1), 2, CONFIRM_AT);
    assert.equal(await projection.isFinalAsOf(TOKEN, RECORD_DATE), true);
    assert.equal(await projection.holderAsOf(TOKEN, RECORD_DATE), alice.address);

    await assert.rejects(claim.connect(bob).claim(), /NotHolder/);

    const before = await ethers.provider.getBalance(await claim.getAddress());
    const receipt = await (await claim.connect(alice).claim()).wait();
    const event = receipt.logs.map((log) => claim.interface.parseLog(log)).find((e) => e && e.name === "Claimed");
    assert.equal(event.args.holder, alice.address);
    assert.equal(event.args.amount, AMOUNT);
    assert.equal(await ethers.provider.getBalance(await claim.getAddress()), before - AMOUNT);

    await assert.rejects(claim.connect(alice).claim(), /AlreadyClaimed/);
  });

  it("is not final when the admitted entry is effective exactly at the record date", async () => {
    const claim = await deployClaim();
    await openGap(gapId(1), alice.address);
    await admit(gapId(1), 2, RECORD_DATE);

    // The record date now falls inside the latest entry's open interval.
    assert.equal(await projection.isFinalAsOf(TOKEN, RECORD_DATE), false);
    await assert.rejects(claim.connect(alice).claim(), /NotFinal/);
  });
});
