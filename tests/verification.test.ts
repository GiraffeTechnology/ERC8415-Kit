import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectionStore } from '../engine/projection/store.ts';
import { ProofProfileRegistry } from '../engine/proof/profile.ts';
import { MerkleProofProfile, merklePath, merkleRoot } from '../engine/proof/merkleProfile.ts';
import { MockZkProofProfile } from '../engine/proof/zkProfile.ts';
import { bindingDigest } from '../engine/proof/binding.ts';
import { MemoryChainAdapter } from '../adapters/memory/memoryChain.ts';
import { ZERO_COMMITMENT, type CandidateEntry } from '../engine/projection/types.ts';
import { ProjectionError } from '../engine/projection/errors.ts';
import { ALICE, BOB, commitment } from './support/fixtures.ts';

const TOKEN = 1n;
const HEIGHT = 42n;
const noise = (n: number) => `0x${n.toString(16).padStart(64, 'f')}`;

const candidate: CandidateEntry = {
  version: 1n,
  holder: ALICE,
  effectiveAt: 100n,
  recordCommitment: commitment(1),
  previousCommitment: ZERO_COMMITMENT,
  registryReference: 'registry://deed/0001',
};

/**
 * Build a store whose only profiles are the real ones, and publish a state
 * root at HEIGHT containing the binding digest for `entry`.
 */
const engine = (entry: CandidateEntry = candidate, settlementId = '') => {
  const adapter = new MemoryChainAdapter();
  const merkle = new MerkleProofProfile(adapter);
  const zk = new MockZkProofProfile(adapter);
  const profiles = new ProofProfileRegistry();
  profiles.register(merkle);
  profiles.register(zk);
  const store = new ProjectionStore({
    registerId: 'register:land',
    verificationProfile: merkle.id,
    profiles,
    adapter,
  });

  const binding = {
    chainId: adapter.chainId,
    contract: adapter.contract,
    tokenId: TOKEN,
    settlementId,
    holder: entry.holder,
    priorCommitment: entry.previousCommitment,
    nextCommitment: entry.recordCommitment,
    version: entry.version,
    effectiveAt: entry.effectiveAt,
  };
  const digest = bindingDigest(binding, entry);
  const leaves = [noise(1), digest, noise(2), noise(3)];
  adapter.setStateRoot(HEIGHT, merkleRoot(leaves));

  const context = { binding, candidate: entry, acceptedRemoteHeight: 0n, remoteFinalized: true };
  return { adapter, store, merkle, zk, digest, path: merklePath(leaves, 1), context };
};

const rejects = (code: string, run: () => unknown): void => {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof ProjectionError);
    assert.equal(error.code, code);
    return true;
  });
};

test('a valid merkle inclusion proof admits', () => {
  const e = engine();
  const result = e.store.admit(TOKEN, candidate, {
    profile: e.merkle.id, remoteHeight: HEIGHT, payload: { path: e.path },
  });
  assert.equal(result.entry.holder, ALICE);
  assert.equal(e.store.entryCount(TOKEN), 1);
});

test('a merkle proof for a different admission does not verify', () => {
  const e = engine();
  // Same path, but the entry that gets submitted claims a different holder,
  // so the leaf recomputed from the binding no longer sits under the root.
  rejects('PROOF_PROFILE_REJECTED', () =>
    e.store.admit(TOKEN, { ...candidate, holder: BOB }, {
      profile: e.merkle.id, remoteHeight: HEIGHT, payload: { path: e.path },
    }));
  assert.equal(e.store.entryCount(TOKEN), 0);
});

test('every bound field changes the digest', () => {
  const e = engine();
  const base = bindingDigest(e.context.binding, candidate);

  const variants = [
    { ...e.context.binding, chainId: 999n },
    { ...e.context.binding, contract: `0x${'22'.repeat(20)}` },
    { ...e.context.binding, tokenId: 2n },
    { ...e.context.binding, settlementId: 'settlement:other' },
    { ...e.context.binding, holder: BOB },
    { ...e.context.binding, priorCommitment: commitment(9) },
    { ...e.context.binding, nextCommitment: commitment(9) },
    { ...e.context.binding, version: 2n },
    { ...e.context.binding, effectiveAt: 101n },
  ];
  for (const binding of variants) {
    assert.notEqual(bindingDigest(binding, candidate), base);
  }
  // And the entry's own registry reference is bound too.
  assert.notEqual(bindingDigest(e.context.binding, { ...candidate, registryReference: 'registry://other' }), base);
});

test('a tampered merkle path is refused', () => {
  const e = engine();
  const tampered = e.path.map((step) => ({ ...step, hash: noise(7) }));
  rejects('PROOF_PROFILE_REJECTED', () =>
    e.store.admit(TOKEN, candidate, { profile: e.merkle.id, remoteHeight: HEIGHT, payload: { path: tampered } }));

  // A flipped sibling side reorders the hash and fails the same way.
  const flipped = e.path.map((step) => ({ ...step, side: step.side === 'left' ? 'right' : 'left' }));
  rejects('PROOF_PROFILE_REJECTED', () =>
    e.store.admit(TOKEN, candidate, { profile: e.merkle.id, remoteHeight: HEIGHT, payload: { path: flipped } }));

  assert.equal(e.store.entryCount(TOKEN), 0);
});

test('a malformed proof payload is refused, not crashed on', () => {
  const e = engine();
  for (const payload of [{}, { path: 'nope' }, { path: [{ hash: 'short', side: 'left' }] }, { path: [{ hash: noise(1) }] }]) {
    rejects('PROOF_PROFILE_REJECTED', () =>
      e.store.admit(TOKEN, candidate, { profile: e.merkle.id, remoteHeight: HEIGHT, payload }));
  }
});

test('a proof against a height with no accepted root is refused', () => {
  const e = engine();
  rejects('PROOF_PROFILE_REJECTED', () =>
    e.store.admit(TOKEN, candidate, { profile: e.merkle.id, remoteHeight: 41n, payload: { path: e.path } }));
});

test('the zk profile verifies a proof bound to this admission', () => {
  const e = engine();
  const proof = e.zk.prove({ remoteHeight: HEIGHT }, e.context);
  const result = e.store.admit(TOKEN, candidate, {
    profile: e.zk.id, remoteHeight: HEIGHT, payload: { proof },
  });
  assert.equal(result.entry.version, 1n);
});

test('a zk proof does not carry to another admission', () => {
  const e = engine();
  const proof = e.zk.prove({ remoteHeight: HEIGHT }, e.context);

  rejects('PROOF_PROFILE_REJECTED', () =>
    e.store.admit(TOKEN, { ...candidate, effectiveAt: 101n }, {
      profile: e.zk.id, remoteHeight: HEIGHT, payload: { proof },
    }));
  rejects('PROOF_PROFILE_REJECTED', () =>
    e.store.admit(2n, candidate, { profile: e.zk.id, remoteHeight: HEIGHT, payload: { proof } }));
  rejects('PROOF_PROFILE_REJECTED', () =>
    e.store.admit(TOKEN, candidate, { profile: e.zk.id, remoteHeight: HEIGHT, payload: { proof: 'forged' } }));
});

test('a verified proof is not finality', () => {
  const e = engine();
  e.store.admit(TOKEN, candidate, { profile: e.merkle.id, remoteHeight: HEIGHT, payload: { path: e.path } });

  // The proof verified and the entry is in history. Nothing about that makes
  // the instant final: only a strictly later admitted entry does.
  assert.equal(e.store.holderAsOf(TOKEN, 100n).holder, ALICE);
  assert.equal(e.store.isFinalAsOf(TOKEN, 100n), false);
  assert.equal(e.store.holderAsOf(TOKEN, 100n).provisional, true);
});

test('the verification engine has no mutable asset state machine', () => {
  const e = engine();
  const surface = [
    ...Object.getOwnPropertyNames(Object.getPrototypeOf(e.store)),
    ...Object.getOwnPropertyNames(Object.getPrototypeOf(e.merkle)),
  ];
  for (const forbidden of ['freeze', 'revoke', 'activate', 'settle', 'setState', 'transition', 'setFinal']) {
    assert.ok(!surface.includes(forbidden), `the engine exposes ${forbidden}`);
  }
  // No profile can report a verdict that means anything but "admitted or not".
  const verdict = e.merkle.verify({ profile: e.merkle.id, remoteHeight: HEIGHT, payload: { path: e.path } }, e.context);
  assert.deepEqual(Object.keys(verdict).sort(), ['admitted']);
});

test('an admission refused by the profile advances no remote height', () => {
  const e = engine();
  assert.equal(e.adapter.acceptedHeight(TOKEN), 0n);
  rejects('PROOF_PROFILE_REJECTED', () =>
    e.store.admit(TOKEN, candidate, { profile: e.merkle.id, remoteHeight: HEIGHT, payload: { path: [] } }));
  assert.equal(e.adapter.acceptedHeight(TOKEN), 0n);
  assert.equal(e.store.entryCount(TOKEN), 0);
});
