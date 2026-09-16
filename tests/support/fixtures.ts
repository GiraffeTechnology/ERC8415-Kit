import { ProjectionStore } from '../../engine/projection/store.ts';
import { ProofProfileRegistry, admitted, refused, type ProofProfile } from '../../engine/proof/profile.ts';
import { MemoryChainAdapter } from '../../adapters/memory/memoryChain.ts';
import { ZERO_COMMITMENT, type CandidateEntry } from '../../engine/projection/types.ts';

export const ALICE = '0x' + 'aa'.repeat(20);
export const BOB = '0x' + 'bb'.repeat(20);
export const CAROL = '0x' + 'cc'.repeat(20);

export const commitment = (n: number): string => '0x' + n.toString(16).padStart(64, '0');

/**
 * A profile that admits anything. It exists so Stage 1 can exercise the
 * admission path before Stage 2 supplies real profiles; it is a test double,
 * never a default in the engine.
 */
export const openProfile: ProofProfile = {
  id: 'test:open',
  verify: () => admitted,
};

/** Refuses everything, to prove a refused proof admits nothing. */
export const closedProfile: ProofProfile = {
  id: 'test:closed',
  verify: () => refused('this profile refuses every proof'),
};

export interface Harness {
  readonly store: ProjectionStore;
  readonly adapter: MemoryChainAdapter;
  height: bigint;
}

export const harness = (): Harness => {
  const profiles = new ProofProfileRegistry();
  profiles.register(openProfile);
  profiles.register(closedProfile);
  const adapter = new MemoryChainAdapter();
  const store = new ProjectionStore({
    registerId: 'register:test',
    verificationProfile: 'test:open',
    profiles,
    adapter,
  });
  return { store, adapter, height: 0n };
};

export interface EntrySpec {
  readonly version: bigint;
  readonly holder: string;
  readonly effectiveAt: bigint;
  readonly recordCommitment: string;
  readonly previousCommitment?: string;
  readonly registryReference?: string;
}

export const entry = (spec: EntrySpec): CandidateEntry => ({
  version: spec.version,
  holder: spec.holder,
  effectiveAt: spec.effectiveAt,
  recordCommitment: spec.recordCommitment,
  previousCommitment: spec.previousCommitment ?? ZERO_COMMITMENT,
  registryReference: spec.registryReference ?? 'registry://test/record',
});

/** Admit a candidate, advancing the remote height so each proof is fresh. */
export const admit = (h: Harness, tokenId: bigint, candidate: CandidateEntry, profile = 'test:open') => {
  h.height += 1n;
  return h.store.admit(tokenId, candidate, { profile, remoteHeight: h.height, payload: {} });
};
