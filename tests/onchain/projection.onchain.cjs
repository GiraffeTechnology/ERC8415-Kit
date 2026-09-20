const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

/**
 * Stage 3 on-chain delivery.
 *
 * Everything here runs against a real EVM: the contract is deployed by a real
 * transaction, every admission is a signed transaction that is mined, and the
 * events are read back from receipts and logs rather than asserted in the
 * abstract. This is the flow the in-process suites deliberately do not cover.
 */
describe("ERC-8415 projection on chain", function () {
  const REGISTER_ID = ethers.id("register:land/v1");
  const reference = (n) => ethers.id(`registry-reference-${n}`);
  const commitment = (n) => ethers.id(`record-commitment-${n}`);

  let projection;
  let authority;
  let alice;
  let bob;
  let outsider;
  let deploymentReceipt;

  beforeEach(async () => {
    [authority, alice, bob, outsider] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("RegisterProjection", authority);
    projection = await factory.deploy(REGISTER_ID, authority.address);
    await projection.waitForDeployment();
    deploymentReceipt = await projection.deploymentTransaction().wait();
  });

  it("deploys as a real contract with code at its address", async () => {
    const address = await projection.getAddress();
    assert.equal(deploymentReceipt.status, 1);
    assert.ok(deploymentReceipt.contractAddress);

    // Code actually exists at the address, so this is a deployment rather than
    // a compiled artifact that was never put on a chain.
    const code = await ethers.provider.getCode(address);
    assert.ok(code.length > 2, "no runtime bytecode at the deployed address");
    assert.equal(await projection.registerId(), REGISTER_ID);
    assert.equal(await projection.sourceAuthority(), authority.address);
  });

  it("advertises the frozen projection identifier from the deployed code", async () => {
    assert.equal(await projection.supportsInterface("0x6309e170"), true);
    assert.equal(await projection.supportsInterface("0x01ffc9a7"), true);
    // Settlement conformance is not claimed by this contract.
    assert.equal(await projection.supportsInterface("0xf4a7d71b"), false);
  });

  it("submits an initialization transaction and emits RegisterInitialized", async () => {
    const tx = await projection.initialize(1n, commitment(1), reference(1), alice.address, 1000n);
    const receipt = await tx.wait();

    assert.equal(receipt.status, 1, "the transaction reverted");
    assert.ok(receipt.gasUsed > 0n, "no gas was consumed");
    assert.ok(receipt.blockNumber > 0, "the transaction was not mined");

    // The event is decoded from the receipt's own logs.
    const parsed = receipt.logs
      .map((log) => projection.interface.parseLog(log))
      .filter((log) => log && log.name === "RegisterInitialized");
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].args.tokenId, 1n);
    assert.equal(parsed[0].args.recordCommitment, commitment(1));
    assert.equal(parsed[0].args.holder, alice.address);
    assert.equal(parsed[0].args.version, 1n);
    assert.equal(parsed[0].args.effectiveAt, 1000n);
  });

  it("submits an admission transaction and emits RegisterSuperseded", async () => {
    await (await projection.initialize(1n, commitment(1), reference(1), alice.address, 1000n)).wait();
    const receipt = await (
      await projection.admit(1n, commitment(2), commitment(1), reference(2), bob.address, 2000n)
    ).wait();

    assert.equal(receipt.status, 1);
    const parsed = receipt.logs
      .map((log) => projection.interface.parseLog(log))
      .filter((log) => log && log.name === "RegisterSuperseded");
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].args.version, 2n);
    assert.equal(parsed[0].args.previousCommitment, commitment(1));
    assert.equal(parsed[0].args.holder, bob.address);
  });

  it("verifies the event history by querying logs from the chain", async () => {
    await (await projection.initialize(1n, commitment(1), reference(1), alice.address, 1000n)).wait();
    await (await projection.admit(1n, commitment(2), commitment(1), reference(2), bob.address, 2000n)).wait();
    await (await projection.admit(1n, commitment(3), commitment(2), reference(3), alice.address, 3000n)).wait();

    // Read back from the chain's log index rather than from receipts, which is
    // how an indexer reconstructs a projection it did not submit.
    const initialized = await projection.queryFilter(projection.filters.RegisterInitialized());
    const superseded = await projection.queryFilter(projection.filters.RegisterSuperseded());

    assert.equal(initialized.length, 1);
    assert.equal(superseded.length, 2);
    assert.deepEqual(superseded.map((event) => event.args.version), [2n, 3n]);
    assert.deepEqual(
      superseded.map((event) => event.args.holder),
      [bob.address, alice.address]
    );

    // The log-derived history matches what the contract reports.
    assert.equal(await projection.entryCount(1n), 3n);
    assert.equal((await projection.currentEntry(1n)).version, 3n);
  });

  it("closes the preceding interval on chain with the register's effective time", async () => {
    await (await projection.initialize(1n, commitment(1), reference(1), alice.address, 1000n)).wait();
    assert.equal((await projection.entryAt(1n, 1n)).supersededAt, 0n);

    await (await projection.admit(1n, commitment(2), commitment(1), reference(2), bob.address, 2000n)).wait();

    assert.equal((await projection.entryAt(1n, 1n)).supersededAt, 2000n);
    assert.equal((await projection.entryAt(1n, 2n)).supersededAt, 0n);
    // Nothing else about the closed entry moved.
    assert.equal((await projection.entryAt(1n, 1n)).holder, alice.address);
    assert.equal((await projection.entryAt(1n, 1n)).effectiveAt, 1000n);
  });

  it("answers the finality rule from deployed code", async () => {
    await (await projection.initialize(1n, commitment(1), reference(1), alice.address, 1000n)).wait();
    // One entry closes no interval.
    assert.equal(await projection.isFinalAsOf(1n, 1000n), false);
    assert.equal(await projection.isFinalAsOf(1n, 999n), false);

    await (await projection.admit(1n, commitment(2), commitment(1), reference(2), bob.address, 2000n)).wait();

    assert.equal(await projection.isFinalAsOf(1n, 999n), false, "precedes the first entry");
    assert.equal(await projection.isFinalAsOf(1n, 1000n), true);
    assert.equal(await projection.isFinalAsOf(1n, 1999n), true);
    assert.equal(await projection.isFinalAsOf(1n, 2000n), false, "the latest interval is open-ended");
    assert.equal(await projection.holderAsOf(1n, 1999n), alice.address);
    assert.equal(await projection.holderAsOf(1n, 2000n), bob.address);
  });

  it("reverts an uncovered instant while finality still answers", async () => {
    await (await projection.initialize(1n, commitment(1), reference(1), alice.address, 1000n)).wait();
    await assert.rejects(projection.entryAsOf(1n, 999n));
    await assert.rejects(projection.holderAsOf(1n, 999n));
    assert.equal(await projection.isFinalAsOf(1n, 999n), false);
  });

  it("rejects every invariant violation as a reverted transaction", async () => {
    await (await projection.initialize(1n, commitment(1), reference(1), alice.address, 1000n)).wait();

    // Broken commitment link.
    await assert.rejects(projection.admit(1n, commitment(9), commitment(8), reference(9), bob.address, 2000n));
    // Equal and decreasing effective time.
    await assert.rejects(projection.admit(1n, commitment(9), commitment(1), reference(9), bob.address, 1000n));
    await assert.rejects(projection.admit(1n, commitment(9), commitment(1), reference(9), bob.address, 999n));
    // Reused commitment inside the token.
    await assert.rejects(projection.admit(1n, commitment(1), commitment(1), reference(9), bob.address, 2000n));
    // Re-initialization.
    await assert.rejects(projection.initialize(1n, commitment(9), reference(9), bob.address, 5000n));
    // Not the source authority.
    await assert.rejects(
      projection.connect(outsider).admit(1n, commitment(9), commitment(1), reference(9), bob.address, 2000n)
    );

    // A rejected transaction writes nothing.
    assert.equal(await projection.entryCount(1n), 1n);
    assert.equal((await projection.currentEntry(1n)).version, 1n);
  });

  it("keeps commitment uniqueness per token, not across tokens", async () => {
    await (await projection.initialize(1n, commitment(1), reference(1), alice.address, 1000n)).wait();
    // The same commitment on a different token is admitted on chain.
    const receipt = await (
      await projection.initialize(2n, commitment(1), reference(1), bob.address, 1000n)
    ).wait();
    assert.equal(receipt.status, 1);
    assert.equal(await projection.entryCount(2n), 1n);
    assert.equal(await projection.holderAsOf(2n, 1000n), bob.address);
  });

  it("reproduces the shared conformance vectors from deployed code", async () => {
    // The same file the in-process kernel and downstream consumers run
    // against. A deployed contract that disagreed with them would be a
    // divergence no single-implementation suite could see.
    const vectors = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "..", "..", "conformance", "projection-vectors.json"),
      "utf8"
    );
    const { cases } = JSON.parse(vectors);
    const holders = { A: alice.address, B: bob.address, C: outsider.address };

    for (const [index, testCase] of cases.entries()) {
      if (testCase.entries.length === 0) continue; // no token exists to query
      const tokenId = BigInt(1000 + index);

      const first = testCase.entries[0];
      await (
        await projection.initialize(
          tokenId,
          ethers.id(`${testCase.id}-1`),
          ethers.id(`${testCase.id}-ref-1`),
          holders[first.holder],
          BigInt(first.effectiveAt)
        )
      ).wait();

      for (let i = 1; i < testCase.entries.length; i += 1) {
        const item = testCase.entries[i];
        await (
          await projection.admit(
            tokenId,
            ethers.id(`${testCase.id}-${i + 1}`),
            ethers.id(`${testCase.id}-${i}`),
            ethers.id(`${testCase.id}-ref-${i + 1}`),
            holders[item.holder],
            BigInt(item.effectiveAt)
          )
        ).wait();
      }

      for (const expectation of testCase.expect) {
        const instant = BigInt(expectation.instant);
        assert.equal(
          await projection.isFinalAsOf(tokenId, instant),
          expectation.final,
          `${testCase.id}: isFinalAsOf(${expectation.instant})`
        );
        if (expectation.holder === null) {
          await assert.rejects(
            projection.holderAsOf(tokenId, instant),
            `${testCase.id}: holderAsOf(${expectation.instant}) should revert`
          );
        } else {
          assert.equal(
            await projection.holderAsOf(tokenId, instant),
            holders[expectation.holder],
            `${testCase.id}: holderAsOf(${expectation.instant})`
          );
        }
      }
    }
  });

  it("exposes no freeze, revoke, override or rollback on the deployed surface", async () => {
    const names = projection.interface.fragments
      .filter((fragment) => fragment.type === "function")
      .map((fragment) => fragment.name.toLowerCase());
    for (const forbidden of ["freeze", "revoke", "override", "rollback", "setfinal", "updatestate", "delete"]) {
      assert.ok(!names.some((name) => name.includes(forbidden)), `deployed contract exposes ${forbidden}`);
    }
  });
});
