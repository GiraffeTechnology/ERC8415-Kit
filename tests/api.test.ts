import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { handle } from '../api/routes.ts';
import { createApi } from '../api/server.ts';
import { ALICE, BOB, admit, commitment, entry, harness } from './support/fixtures.ts';

const TOKEN = 1n;

const seeded = () => {
  const h = harness();
  admit(h, TOKEN, entry({ version: 1n, holder: ALICE, effectiveAt: 100n, recordCommitment: commitment(1) }));
  admit(h, TOKEN, entry({
    version: 2n, holder: BOB, effectiveAt: 130n,
    recordCommitment: commitment(2), previousCommitment: commitment(1),
  }));
  return h;
};

const get = (h: ReturnType<typeof harness>, path: string) => handle(h.store, { method: 'GET', path });

test('the temporal routes answer each question separately', () => {
  const h = seeded();

  const holder = get(h, '/projection/1/holder/as-of/120');
  assert.equal(holder.status, 200);
  assert.deepEqual(holder.body, {
    tokenId: '1', instant: '120', holder: ALICE, provisional: false,
  });

  const finality = get(h, '/projection/1/finality/as-of/120');
  assert.equal(finality.status, 200);
  assert.deepEqual(finality.body, { tokenId: '1', instant: '120', final: true, openGap: null });

  const asOf = get(h, '/projection/1/entry/as-of/120');
  assert.equal(asOf.status, 200);
  assert.equal((asOf.body as { entry: { holder: string } }).entry.holder, ALICE);

  const entries = get(h, '/projection/1/entries');
  assert.equal(entries.status, 200);
  assert.equal((entries.body as { entryCount: number }).entryCount, 2);
});

test('an uncovered instant is 404, and finality still answers there', () => {
  const h = seeded();
  assert.equal(get(h, '/projection/1/holder/as-of/99').status, 404);
  assert.equal(get(h, '/projection/1/entry/as-of/99').status, 404);

  const finality = get(h, '/projection/1/finality/as-of/99');
  assert.equal(finality.status, 200);
  assert.equal((finality.body as { final: boolean }).final, false);
});

test('uint64 values cross the wire as strings', () => {
  const h = harness();
  // An instant a JSON number cannot hold exactly.
  const effectiveAt = 2n ** 53n + 1n;
  admit(h, TOKEN, entry({ version: 1n, holder: ALICE, effectiveAt, recordCommitment: commitment(1) }));

  const body = get(h, `/projection/1/entry/as-of/${effectiveAt}`).body as { entry: { effectiveAt: string } };
  assert.equal(body.entry.effectiveAt, effectiveAt.toString());
  assert.equal(BigInt(body.entry.effectiveAt), effectiveAt);
});

test('admission is a POST that returns the admitted entry', () => {
  const h = harness();
  const response = handle(h.store, {
    method: 'POST',
    path: '/projection/1/admission',
    body: {
      entry: {
        version: '1',
        holder: ALICE,
        effectiveAt: '100',
        recordCommitment: commitment(1),
        previousCommitment: `0x${'0'.repeat(64)}`,
        registryReference: 'registry://test/record',
      },
      proof: { profile: 'test:open', remoteHeight: '5', payload: {} },
    },
  });
  assert.equal(response.status, 201);
  assert.equal(h.store.entryCount(TOKEN), 1);
  assert.equal((response.body as { gapClosed: boolean }).gapClosed, false);
});

test('a refused admission writes nothing and says why', () => {
  const h = harness();
  const response = handle(h.store, {
    method: 'POST',
    path: '/projection/1/admission',
    body: {
      entry: {
        version: '1', holder: ALICE, effectiveAt: '100',
        recordCommitment: commitment(1), previousCommitment: `0x${'0'.repeat(64)}`,
        registryReference: 'registry://test/record',
      },
      proof: { profile: 'test:closed', remoteHeight: '5', payload: {} },
    },
  });
  assert.equal(response.status, 422);
  assert.equal((response.body as { error: string }).error, 'PROOF_PROFILE_REJECTED');
  assert.equal(h.store.entryCount(TOKEN), 0);
});

test('no route mutates or deletes an admitted entry', () => {
  const h = seeded();
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    for (const path of ['/projection/1/entries', '/projection/1/entry/as-of/120', '/projection/1']) {
      assert.equal(handle(h.store, { method, path }).status, 404, `${method} ${path} is routable`);
    }
  }
  assert.equal(h.store.entryCount(TOKEN), 2);
});

test('no route writes finality', () => {
  const h = seeded();
  for (const method of ['POST', 'PUT', 'PATCH']) {
    const response = handle(h.store, {
      method,
      path: '/projection/1/finality/as-of/120',
      body: { final: true },
    });
    assert.equal(response.status, 404);
  }
  assert.equal(h.store.isFinalAsOf(TOKEN, 999n), false);
});

test('a malformed token id or instant is rejected', () => {
  const h = seeded();
  assert.equal(get(h, '/projection/abc/entries').status, 400);
  assert.equal(get(h, '/projection/1/holder/as-of/-1').status, 400);
  assert.equal(get(h, '/projection/1/holder/as-of/12.5').status, 400);
});

test('the server serves the route table over a socket', async () => {
  const h = seeded();
  const server = createApi(h.store);
  server.listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/projection/1/holder/as-of/120`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      tokenId: '1', instant: '120', holder: ALICE, provisional: false,
    });

    const admission = await fetch(`http://127.0.0.1:${port}/projection/1/admission`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        entry: {
          version: '3', holder: BOB, effectiveAt: '200',
          recordCommitment: commitment(3), previousCommitment: commitment(2),
          registryReference: 'registry://test/record',
        },
        proof: { profile: 'test:open', remoteHeight: '99', payload: {} },
      }),
    });
    assert.equal(admission.status, 201);
    assert.equal(h.store.entryCount(TOKEN), 3);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
