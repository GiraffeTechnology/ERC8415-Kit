const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

/**
 * Stage 4 on-chain delivery.
 *
 * The in-process suites cover the settlement workflow as a state machine. This
 * one covers it as a deployed system: the settlement contract is the register's
 * source authority, every open, close and cancel is a mined transaction, the
 * proof is a real signature recovered on chain, and the finality claims are
 * read back from the deployed register rather than asserted in the abstract.
 */
describe("ERC-8415 settlement on chain", function () {
  const REGISTER_ID = ethers.id("register:land/v1");
  const PROFILE_ID = ethers.id("profile:attestation/secp256k1");
  const SETTLEMENT_PERIOD = 7n * 24n * 60n * 60n;

  const reference = (n) => ethers.id(`registry-reference-${n}`);
  const commitment = (n) => ethers.id(`record-commitment-${n}`);
  const snapshot = (n) => ethers.id(`snapshot-${n}`);
  const gapId = (n) => ethers.id(`settlement-${n}`);

  const TOKEN = 1n;
  const FIRST_AT = 1000n;
  const SECOND_AT = 2000n;

  let projection;
  let settlement;
  let verifier;
  let deployer;
  let registrar;
  let attestor;
  let alice;
  let bob;
  let relayer;
  let outsider;

  const now = async () => BigInt((await ethers.provider.getBlock("latest")).timestamp);

  const advanceTo = async (timestamp) => {
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
    await ethers.provider.send("evm_mine", []);
  };

  /** Sign whatever the deployed contract says this proof is allowed to admit. */
  const attest = async (settlementId, recordCommitment, registryReference, effectiveAt, signer = attestor) => {
    const binding = await settlement.admissionBinding(
      settlementId,
      recordCommitment,
      registryReference,
      effectiveAt
    );
    return signer.signMessage(ethers.getBytes(binding));
  };

  /** Sign whatever the deployed contract says a genesis proof may admit. */
  const attestGenesis = async (tokenId, recordCommitment, registryReference, holder, effectiveAt, signer = attestor) => {
    const binding = await settlement.initializationBinding(
      tokenId,
      recordCommitment,
      registryReference,
      holder,
      effectiveAt
    );
    return signer.signMessage(ethers.getBytes(binding));
  };

  const openGap = async (id, deadlineOffset = 3600n) => {
    const deadline = (await now()) + deadlineOffset;
    const tx = await settlement
      .connect(registrar)
      .beginSettlement(TOKEN, id, bob.address, snapshot(1), deadline);
    return { deadline, receipt: await tx.wait() };
  };

  beforeEach(async () => {
    [deployer, registrar, attestor, alice, bob, relayer, outsider] = await ethers.getSigners();

    const verifierFactory = await ethers.getContractFactory("AttestationProofVerifier", deployer);
    verifier = await verifierFactory.deploy(PROFILE_ID, attestor.address);
    await verifier.waitForDeployment();

    // The register's source authority is fixed at construction, so the
    // settlement address has to be known first. Precomputing it is what makes
    // settlement the only writer the register will ever accept.
    const settlementNonce = await ethers.provider.getTransactionCount(deployer.address);
    const settlementAddress = ethers.getCreateAddress({ from: deployer.address, nonce: settlementNonce + 1 });

    const projectionFactory = await ethers.getContractFactory("RegisterProjection", deployer);
    projection = await projectionFactory.deploy(REGISTER_ID, settlementAddress);
    await projection.waitForDeployment();

    const settlementFactory = await ethers.getContractFactory("ProjectionSettlement", deployer);
    settlement = await settlementFactory.deploy(
      await projection.getAddress(),
      await verifier.getAddress(),
      SETTLEMENT_PERIOD,
      [registrar.address]
    );
    await settlement.waitForDeployment();

    assert.equal(await settlement.getAddress(), settlementAddress, "address precomputation drifted");

    const genesisProof = await attestGenesis(TOKEN, commitment(1), reference(1), alice.address, FIRST_AT);
    await (
      await settlement
        .connect(registrar)
        .initializeRegister(TOKEN, commitment(1), reference(1), alice.address, FIRST_AT, genesisProof)
    ).wait();
  });

  it("deploys as the register's only writer", async () => {
    const code = await ethers.provider.getCode(await settlement.getAddress());
    assert.ok(code.length > 2, "no runtime bytecode at the settlement address");

    assert.equal(await projection.sourceAuthority(), await settlement.getAddress());
    assert.equal(await settlement.projection(), await projection.getAddress());
    assert.equal(await settlement.settlementPeriod(), SETTLEMENT_PERIOD);

    // Direct admission bypassing settlement is refused by the deployed code.
    await assert.rejects(
      projection.connect(registrar).admit(TOKEN, commitment(2), commitment(1), reference(2), bob.address, SECOND_AT),
      /NotSourceAuthority/
    );
  });

  it("advertises the frozen settlement identifier from the deployed code", async () => {
    assert.equal(await settlement.supportsInterface("0xf4a7d71b"), true);
    assert.equal(await settlement.supportsInterface("0x01ffc9a7"), true);
    // Projection conformance belongs to the register, not to settlement.
    assert.equal(await settlement.supportsInterface("0x6309e170"), false);
    assert.equal(await settlement.verificationProfile(), PROFILE_ID);
  });

  it("opens a gap and reports it as an open gap, not as a loss of finality", async () => {
    const { deadline, receipt } = await openGap(gapId(1));

    assert.equal(receipt.status, 1);
    const event = receipt.logs
      .map((log) => settlement.interface.parseLog(log))
      .find((parsed) => parsed && parsed.name === "SettlementStarted");
    assert.ok(event, "SettlementStarted was not emitted");
    assert.equal(event.args.settlementId, gapId(1));
    assert.equal(event.args.tokenId, TOKEN);
    assert.equal(event.args.initiator, registrar.address);
    assert.equal(event.args.expectedHolder, bob.address);
    assert.equal(event.args.deadline, deadline);

    const record = await settlement.settlement(gapId(1));
    assert.equal(record.status, 1n, "status is not OPEN");
    assert.equal(record.initiator, registrar.address);
    assert.equal(await settlement.openGapOf(TOKEN), gapId(1));

    // A single entry means nothing is final yet, and opening a gap did not
    // change that in either direction.
    assert.equal(await projection.isFinalAsOf(TOKEN, FIRST_AT), false);
    assert.equal(await projection.entryCount(TOKEN), 1n);
  });

  it("refuses to open a gap for anyone but a settlement authority", async () => {
    const deadline = (await now()) + 3600n;
    await assert.rejects(
      settlement.connect(outsider).beginSettlement(TOKEN, gapId(1), bob.address, snapshot(1), deadline),
      /NotSettlementAuthority/
    );
    assert.equal(await settlement.isSettlementAuthority(TOKEN, outsider.address), false);
    assert.equal(await settlement.isSettlementAuthority(TOKEN, registrar.address), true);
  });

  it("refuses a deadline in the past or beyond the settlement period", async () => {
    const current = await now();
    await assert.rejects(
      settlement.connect(registrar).beginSettlement(TOKEN, gapId(1), bob.address, snapshot(1), current),
      /DeadlineOutOfRange/
    );
    await assert.rejects(
      settlement
        .connect(registrar)
        .beginSettlement(TOKEN, gapId(1), bob.address, snapshot(1), current + SETTLEMENT_PERIOD + 600n),
      /DeadlineOutOfRange/
    );
  });

  it("allows one open gap per token and one record per identifier", async () => {
    await openGap(gapId(1));
    const deadline = (await now()) + 3600n;

    await assert.rejects(
      settlement.connect(registrar).beginSettlement(TOKEN, gapId(2), bob.address, snapshot(2), deadline),
      /GapAlreadyOpen/
    );
    await assert.rejects(
      settlement.connect(registrar).beginSettlement(9n, gapId(1), bob.address, snapshot(2), deadline),
      /SettlementExists/
    );
  });

  it("closes a gap by admitting the entry, and the register records it", async () => {
    await openGap(gapId(1));
    const proof = await attest(gapId(1), commitment(2), reference(2), SECOND_AT);

    // Anyone may relay: the relayer is neither the authority nor the attestor.
    const receipt = await (
      await settlement
        .connect(relayer)
        .finalizeSettlement(gapId(1), commitment(2), reference(2), SECOND_AT, proof)
    ).wait();

    assert.equal(receipt.status, 1);
    assert.ok(receipt.gasUsed > 0n);

    const finalized = receipt.logs
      .map((log) => {
        try {
          return settlement.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "SettlementFinalized");
    assert.ok(finalized, "SettlementFinalized was not emitted");
    assert.equal(finalized.args.recordCommitment, commitment(2));
    assert.equal(finalized.args.version, 2n);
    assert.equal(finalized.args.effectiveAt, SECOND_AT);

    // The same transaction produced the register's own supersession event.
    const superseded = receipt.logs
      .map((log) => {
        try {
          return projection.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "RegisterSuperseded");
    assert.ok(superseded, "RegisterSuperseded was not emitted by the admission");
    assert.equal(superseded.args.previousCommitment, commitment(1));

    const record = await settlement.settlement(gapId(1));
    assert.equal(record.status, 2n, "status is not ADMITTED");
    assert.equal(await settlement.openGapOf(TOKEN), ethers.ZeroHash);

    const entry = await projection.entryAt(TOKEN, 2n);
    assert.equal(entry.holder, bob.address);
    assert.equal(entry.previousCommitment, commitment(1));
    assert.equal(await projection.holderAsOf(TOKEN, SECOND_AT), bob.address);
  });

  it("closing a gap does not make the instant it admitted final", async () => {
    await openGap(gapId(1));
    const proof = await attest(gapId(1), commitment(2), reference(2), SECOND_AT);
    await (
      await settlement.connect(relayer).finalizeSettlement(gapId(1), commitment(2), reference(2), SECOND_AT, proof)
    ).wait();

    // The admission closed the interval that preceded it, because a strictly
    // later entry is the only thing that finalises one.
    assert.equal(await projection.isFinalAsOf(TOKEN, FIRST_AT), true);
    assert.equal(await projection.isFinalAsOf(TOKEN, SECOND_AT - 1n), true);

    // What settlement just admitted is not final, and the closed gap did not
    // make it so.
    assert.equal(await projection.isFinalAsOf(TOKEN, SECOND_AT), false);
    assert.equal(await projection.isFinalAsOf(TOKEN, SECOND_AT + 10_000n), false);

    // Nor is an instant the projection does not cover.
    assert.equal(await projection.isFinalAsOf(TOKEN, FIRST_AT - 1n), false);
  });

  it("refuses a proof bound to a different admission", async () => {
    await openGap(gapId(1));

    // Same settlement, different commitment.
    const wrongCommitment = await attest(gapId(1), commitment(3), reference(2), SECOND_AT);
    await assert.rejects(
      settlement.connect(relayer).finalizeSettlement(gapId(1), commitment(2), reference(2), SECOND_AT, wrongCommitment),
      /ProofRefused/
    );

    // Same commitment, different effective time.
    const wrongInstant = await attest(gapId(1), commitment(2), reference(2), SECOND_AT + 1n);
    await assert.rejects(
      settlement.connect(relayer).finalizeSettlement(gapId(1), commitment(2), reference(2), SECOND_AT, wrongInstant),
      /ProofRefused/
    );

    // A signature from someone who is not the attestor.
    const wrongSigner = await attest(gapId(1), commitment(2), reference(2), SECOND_AT, outsider);
    await assert.rejects(
      settlement.connect(relayer).finalizeSettlement(gapId(1), commitment(2), reference(2), SECOND_AT, wrongSigner),
      /ProofRefused/
    );

    // Garbage of the right length is refused rather than reverting inside the
    // verifier.
    await assert.rejects(
      settlement
        .connect(relayer)
        .finalizeSettlement(gapId(1), commitment(2), reference(2), SECOND_AT, `0x${"11".repeat(65)}`),
      /ProofRefused/
    );

    assert.equal(await projection.entryCount(TOKEN), 1n, "a refused proof still wrote an entry");
  });

  it("refuses to close a gap that ran past its deadline", async () => {
    const { deadline } = await openGap(gapId(1));
    const proof = await attest(gapId(1), commitment(2), reference(2), SECOND_AT);

    await advanceTo(deadline + 1n);

    await assert.rejects(
      settlement.connect(relayer).finalizeSettlement(gapId(1), commitment(2), reference(2), SECOND_AT, proof),
      /SettlementExpired/
    );

    // Expiry is not an outcome: the gap is still open and nothing was decided.
    assert.equal(await settlement.openGapOf(TOKEN), gapId(1));
    const record = await settlement.settlement(gapId(1));
    assert.equal(record.status, 1n, "an expired gap stopped being OPEN on its own");
    assert.equal(await projection.entryCount(TOKEN), 1n);
  });

  it("still enforces the register's invariants through settlement", async () => {
    await openGap(gapId(1));

    // Invariant 3: effectiveAt must strictly increase.
    const backwards = await attest(gapId(1), commitment(2), reference(2), FIRST_AT);
    await assert.rejects(
      settlement.connect(relayer).finalizeSettlement(gapId(1), commitment(2), reference(2), FIRST_AT, backwards),
      /EffectiveAtNotIncreasing/
    );

    // Invariant 4: a commitment is never reused inside one token.
    const reused = await attest(gapId(1), commitment(1), reference(2), SECOND_AT);
    await assert.rejects(
      settlement.connect(relayer).finalizeSettlement(gapId(1), commitment(1), reference(2), SECOND_AT, reused),
      /CommitmentReused/
    );
  });

  it("cancels only after the deadline, only by the initiator, and settles nothing", async () => {
    const { deadline } = await openGap(gapId(1));

    await assert.rejects(
      settlement.connect(registrar).cancelSettlement(gapId(1), ethers.id("reason:withdrawn")),
      /DeadlineOutOfRange/
    );

    await advanceTo(deadline + 1n);

    await assert.rejects(
      settlement.connect(outsider).cancelSettlement(gapId(1), ethers.id("reason:withdrawn")),
      /NotSettlementAuthority/
    );

    const before = await projection.currentEntry(TOKEN);
    const receipt = await (
      await settlement.connect(registrar).cancelSettlement(gapId(1), ethers.id("reason:withdrawn"))
    ).wait();

    const cancelled = receipt.logs
      .map((log) => settlement.interface.parseLog(log))
      .find((parsed) => parsed && parsed.name === "SettlementCancelled");
    assert.ok(cancelled, "SettlementCancelled was not emitted");
    assert.equal(cancelled.args.reasonHash, ethers.id("reason:withdrawn"));

    const record = await settlement.settlement(gapId(1));
    assert.equal(record.status, 3n, "status is not CANCELLED");
    assert.equal(await settlement.openGapOf(TOKEN), ethers.ZeroHash);

    // Cancellation settles nothing: the projection is byte-for-byte what it
    // was, and every instant that was provisional before is provisional after.
    const after = await projection.currentEntry(TOKEN);
    assert.equal(after.recordCommitment, before.recordCommitment);
    assert.equal(after.supersededAt, before.supersededAt);
    assert.equal(await projection.entryCount(TOKEN), 1n);
    assert.equal(await projection.isFinalAsOf(TOKEN, FIRST_AT), false);
  });

  it("refuses to close a gap that is no longer open, and reopens cleanly", async () => {
    const { deadline } = await openGap(gapId(1));
    const proof = await attest(gapId(1), commitment(2), reference(2), SECOND_AT);

    await advanceTo(deadline + 1n);
    await (await settlement.connect(registrar).cancelSettlement(gapId(1), ethers.ZeroHash)).wait();

    await assert.rejects(
      settlement.connect(relayer).finalizeSettlement(gapId(1), commitment(2), reference(2), SECOND_AT, proof),
      /NoOpenGap/
    );
    await assert.rejects(
      settlement.connect(registrar).cancelSettlement(gapId(1), ethers.ZeroHash),
      /NoOpenGap/
    );

    // The token is free to try again, and the second attempt succeeds.
    await openGap(gapId(2));
    const second = await attest(gapId(2), commitment(2), reference(2), SECOND_AT);
    await (
      await settlement.connect(relayer).finalizeSettlement(gapId(2), commitment(2), reference(2), SECOND_AT, second)
    ).wait();

    assert.equal(await projection.entryCount(TOKEN), 2n);
    assert.equal(await projection.holderAsOf(TOKEN, SECOND_AT), bob.address);
  });

  it("requires a bound proof for the register's first entry", async () => {
    const other = 7n;

    // The first entry names the register's opening holder and is as permanent
    // as any other, so it is not exempt from the proof profile.
    await assert.rejects(
      settlement
        .connect(registrar)
        .initializeRegister(other, commitment(9), reference(9), alice.address, FIRST_AT, "0x"),
      /ProofRefused/
    );

    // A signature from someone who is not the attestor.
    const wrongSigner = await attestGenesis(other, commitment(9), reference(9), alice.address, FIRST_AT, outsider);
    await assert.rejects(
      settlement
        .connect(registrar)
        .initializeRegister(other, commitment(9), reference(9), alice.address, FIRST_AT, wrongSigner),
      /ProofRefused/
    );

    // A genesis proof is bound to the holder it names, so it cannot be
    // redirected to another one.
    const forAlice = await attestGenesis(other, commitment(9), reference(9), alice.address, FIRST_AT);
    await assert.rejects(
      settlement
        .connect(registrar)
        .initializeRegister(other, commitment(9), reference(9), bob.address, FIRST_AT, forAlice),
      /ProofRefused/
    );

    // Nothing was written by any of the refusals.
    assert.equal(await projection.entryCount(other), 0n);

    // The bound proof admits, and only then.
    await (
      await settlement
        .connect(registrar)
        .initializeRegister(other, commitment(9), reference(9), alice.address, FIRST_AT, forAlice)
    ).wait();
    assert.equal(await projection.entryCount(other), 1n);
    assert.equal(await projection.holderAsOf(other, FIRST_AT), alice.address);

    // Still no finality: one entry means the whole span is provisional.
    assert.equal(await projection.isFinalAsOf(other, FIRST_AT), false);
  });

  it("does not let a genesis proof be replayed as an admission", async () => {
    await openGap(gapId(1));

    // The genesis binding carries version 1 and no settlement; an admission
    // binding carries version 2 or more, so neither can stand in for the other.
    const genesis = await attestGenesis(TOKEN, commitment(2), reference(2), bob.address, SECOND_AT);
    await assert.rejects(
      settlement.connect(relayer).finalizeSettlement(gapId(1), commitment(2), reference(2), SECOND_AT, genesis),
      /ProofRefused/
    );

    assert.equal(await projection.entryCount(TOKEN), 1n);
  });

  it("does not let settlement reach a register it is not the authority of", async () => {
    const otherFactory = await ethers.getContractFactory("RegisterProjection", deployer);
    const foreign = await otherFactory.deploy(REGISTER_ID, deployer.address);
    await foreign.waitForDeployment();

    const settlementFactory = await ethers.getContractFactory("ProjectionSettlement", deployer);
    const detached = await settlementFactory.deploy(
      await foreign.getAddress(),
      await verifier.getAddress(),
      SETTLEMENT_PERIOD,
      [registrar.address]
    );
    await detached.waitForDeployment();

    const binding = await detached.initializationBinding(
      TOKEN,
      commitment(1),
      reference(1),
      alice.address,
      FIRST_AT
    );
    const proof = await attestor.signMessage(ethers.getBytes(binding));

    await assert.rejects(
      detached
        .connect(registrar)
        .initializeRegister(TOKEN, commitment(1), reference(1), alice.address, FIRST_AT, proof),
      /NotSourceAuthority/
    );
  });
});
