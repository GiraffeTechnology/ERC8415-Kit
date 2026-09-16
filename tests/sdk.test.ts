import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { NotCoveredError, ProjectionClient, ProjectionClientError } from '../sdk/js/index.ts';
import { createApi } from '../api/server.ts';
import { SettlementEngine } from '../engine/settlement/engine.ts';
import { AllowListAuthority } from '../engine/settlement/authority.ts';
import { ALICE, BOB, admit, commitment, entry, harness } from './support/fixtures.ts';

const TOKEN = 1n;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Run the SDK against the real API over a real socket. */
const withServer = async (run: (client: ProjectionClient, h: ReturnType<typeof harness>) => Promise<void>) => {
  const h = harness();
  admit(h, TOKEN, entry({ version: 1n, holder: ALICE, effectiveAt: 100n, recordCommitment: commitment(1) }));
  admit(h, TOKEN, entry({
    version: 2n, holder: BOB, effectiveAt: 130n,
    recordCommitment: commitment(2), previousCommitment: commitment(1),
  }));

  const server = createApi(h.store);
  server.listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  try {
    await run(new ProjectionClient({ baseUrl: `http://127.0.0.1:${port}` }), h);
  } finally {
    server.close();
    await once(server, 'close');
  }
};

test('the SDK answers the three questions as three methods', async () => {
  await withServer(async (client) => {
    assert.equal(await client.holderAsOf(TOKEN, 120n), ALICE);
    assert.equal(await client.isFinalAsOf(TOKEN, 120n), true);
    assert.equal(await client.openGapOf(TOKEN), null);

    assert.equal(await client.holderAsOf(TOKEN, 130n), BOB);
    assert.equal(await client.isFinalAsOf(TOKEN, 130n), false);
  });
});

test('the SDK exposes no single collapsed status', () => {
  const surface = Object.getOwnPropertyNames(ProjectionClient.prototype);
  for (const forbidden of ['status', 'getStatus', 'state', 'isSettled', 'isConfirmed']) {
    assert.ok(!surface.includes(forbidden), `the client exposes ${forbidden}`);
  }
});

test('resolve returns three labelled facts, not one verdict', async () => {
  await withServer(async (client) => {
    const resolution = await client.resolve(TOKEN, 120n);
    assert.deepEqual(Object.keys(resolution).sort(), ['final', 'holder', 'openGap']);
    assert.equal(resolution.holder, ALICE);
    assert.equal(resolution.final, true);
    assert.equal(resolution.openGap, null);
  });
});

test('uint64 values decode as bigint, never as number', async () => {
  await withServer(async (client) => {
    const first = await client.entryAt(TOKEN, 1n);
    assert.equal(typeof first.version, 'bigint');
    assert.equal(typeof first.effectiveAt, 'bigint');
    assert.equal(typeof first.supersededAt, 'bigint');
    // The closed entry carries the register's own effective time.
    assert.equal(first.supersededAt, 130n);
    assert.equal((await client.entryAt(TOKEN, 2n)).supersededAt, 0n);
  });
});

test('an instant the projection does not cover raises its own error type', async () => {
  await withServer(async (client) => {
    await assert.rejects(() => client.holderAsOf(TOKEN, 99n), NotCoveredError);
    await assert.rejects(() => client.entryAsOf(TOKEN, 99n), NotCoveredError);
    // Finality answers there rather than raising, as the standard requires.
    assert.equal(await client.isFinalAsOf(TOKEN, 99n), false);
  });
});

test('an unknown version surfaces with its code', async () => {
  await withServer(async (client) => {
    await assert.rejects(() => client.entryAt(TOKEN, 9n), (error: unknown) => {
      assert.ok(error instanceof ProjectionClientError);
      assert.equal(error.code, 'UNKNOWN_VERSION');
      assert.equal(error.status, 404);
      return true;
    });
  });
});

test('the SDK reports an open gap without letting it touch finality', async () => {
  await withServer(async (client, h) => {
    const engine = new SettlementEngine({
      store: h.store,
      authority: new AllowListAuthority([ALICE]),
      clock: { now: () => 1_000n },
      settlementPeriod: 86_400n,
    });
    engine.begin({
      tokenId: TOKEN,
      settlementId: commitment(0x5e77),
      initiator: ALICE,
      expectedHolder: BOB,
      snapshotHash: commitment(0x5a),
      deadline: 4_000n,
    });

    const gap = await client.openGapOf(TOKEN);
    assert.equal(gap?.status, 'OPEN');
    assert.equal(gap?.expectedHolder, BOB);
    assert.equal(typeof gap?.openedAt, 'bigint');

    // The gap is open and finality is exactly where it was.
    assert.equal(await client.isFinalAsOf(TOKEN, 120n), true);
    assert.equal(await client.isFinalAsOf(TOKEN, 140n), false);
  });
});

test('the entry walk reads the whole history', async () => {
  await withServer(async (client) => {
    assert.equal(await client.entryCount(TOKEN), 2);
    const all = await client.entries(TOKEN);
    assert.deepEqual(all.map((item) => item.version), [1n, 2n]);
    assert.deepEqual(all.map((item) => item.holder), [ALICE, BOB]);
  });
});

test('the python SDK suite passes', () => {
  // Same guarantees, same wire format, a second language. Runs the Python
  // suite in-process with the repository's own interpreter.
  const output = execFileSync('python3', ['sdk/python/test_client.py'], { cwd: root, encoding: 'utf8' });
  assert.match(output, /all python sdk checks passed/);
  assert.ok(!output.includes('failed:'), output);
});
