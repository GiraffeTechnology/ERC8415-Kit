import { TokenProjection } from './kernel.ts';
import { reject, ProjectionError } from './errors.ts';
import type { CandidateEntry, Gap, HolderAnswer, Instant, ProjectionEntry, TokenId } from './types.ts';
import type { ProofMaterial, ProofProfile, ProofProfileRegistry } from '../proof/profile.ts';
import type { RemoteChainAdapter } from '../ports.ts';

export interface AdmissionResult {
  readonly entry: ProjectionEntry;
  readonly gapClosed: boolean;
  readonly remoteHeight: bigint;
}

export interface StoreOptions {
  readonly registerId: string;
  readonly verificationProfile: string;
  readonly profiles: ProofProfileRegistry;
  readonly adapter: RemoteChainAdapter;
}

/**
 * One register's projections: the per-token append-only histories, the gap
 * records beside them, and the admission path that writes to both.
 *
 * Reads never mutate. Admission is the only writer, and it is atomic: proof
 * verification, entry admission, remote-height advancement and gap closure
 * either all happen or none do.
 */
export class ProjectionStore {
  readonly #projections = new Map<string, TokenProjection>();
  readonly #gaps = new Map<string, Gap>();
  readonly #options: StoreOptions;

  constructor(options: StoreOptions) {
    this.#options = options;
  }

  get registerId(): string {
    return this.#options.registerId;
  }

  get verificationProfile(): string {
    return this.#options.verificationProfile;
  }

  tokens(): readonly TokenId[] {
    return [...this.#projections.keys()].map((key) => BigInt(key)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  entryCount(tokenId: TokenId): number {
    return this.#projections.get(key(tokenId))?.length ?? 0;
  }

  entryAt(tokenId: TokenId, index: number): ProjectionEntry {
    return this.#require(tokenId).entryAt(index);
  }

  currentEntry(tokenId: TokenId): ProjectionEntry {
    return this.#require(tokenId).currentEntry();
  }

  entries(tokenId: TokenId): readonly ProjectionEntry[] {
    return this.#projections.get(key(tokenId))?.entries() ?? [];
  }

  entryAsOf(tokenId: TokenId, instant: Instant): ProjectionEntry {
    return this.#require(tokenId).entryAsOf(instant);
  }

  holderAsOf(tokenId: TokenId, instant: Instant): HolderAnswer {
    return this.#require(tokenId).holderAsOf(instant);
  }

  /** Never reverts. An uncovered instant is not final; it is not an error. */
  isFinalAsOf(tokenId: TokenId, instant: Instant): boolean {
    return this.#projections.get(key(tokenId))?.isFinalAsOf(instant) ?? false;
  }

  openGapOf(tokenId: TokenId): Gap | undefined {
    return this.#gaps.get(key(tokenId));
  }

  /**
   * Record an open gap. At most one per token.
   *
   * Opening a gap does not touch the projection and does not block any
   * transfer. The settlement workflow that drives this is Stage 4; the record
   * lives here because admission has to be able to close it atomically.
   */
  openGap(tokenId: TokenId, gap: Gap): Gap {
    if (this.#gaps.has(key(tokenId))) {
      reject('GAP_ALREADY_OPEN', `token ${tokenId} already has an open gap`);
    }
    this.#gaps.set(key(tokenId), gap);
    return gap;
  }

  /**
   * Close an open gap without admitting anything.
   *
   * This settles nothing. The projection is unchanged and every instant that
   * was provisional stays provisional.
   */
  cancelGap(tokenId: TokenId): Gap {
    const gap = this.#gaps.get(key(tokenId));
    if (gap === undefined) {
      return reject('NO_OPEN_GAP', `token ${tokenId} has no open gap`);
    }
    this.#gaps.delete(key(tokenId));
    return gap;
  }

  /**
   * Admit a candidate entry.
   *
   * Order matters. Everything that can refuse runs before anything mutates:
   * the profile must exist, the remote height must be finalized and must not
   * go backwards, the proof must verify, and the candidate must satisfy every
   * append-only invariant. Only then are the entry, the height and the gap
   * written, and none of those three can fail.
   */
  admit(tokenId: TokenId, candidate: CandidateEntry, material: ProofMaterial): AdmissionResult {
    const profile = this.#resolveProfile(material.profile);
    const adapter = this.#options.adapter;
    const acceptedRemoteHeight = adapter.acceptedHeight(tokenId);

    if (!adapter.isFinalized(material.remoteHeight)) {
      reject('PROOF_PROFILE_REJECTED', `remote height ${material.remoteHeight} is not finalized`);
    }
    if (material.remoteHeight <= acceptedRemoteHeight) {
      reject(
        'PROOF_PROFILE_REJECTED',
        `remote height must exceed the accepted height ${acceptedRemoteHeight}`,
      );
    }

    const gap = this.#gaps.get(key(tokenId));
    const projection = this.#projections.get(key(tokenId));
    const priorCommitment = projection?.length ? projection.currentEntry().recordCommitment : candidate.previousCommitment;

    const verdict = profile.verify(material, {
      binding: {
        chainId: adapter.chainId,
        contract: adapter.contract,
        tokenId,
        settlementId: gap?.settlementId ?? '',
        holder: candidate.holder,
        priorCommitment,
        nextCommitment: candidate.recordCommitment,
        version: candidate.version,
        effectiveAt: candidate.effectiveAt,
      },
      candidate,
      acceptedRemoteHeight,
      remoteFinalized: true,
    });

    if (!verdict.admitted) {
      reject('PROOF_PROFILE_REJECTED', verdict.reason);
    }

    // Past this line nothing refuses: the kernel validates before it appends,
    // so a rejected candidate leaves the height and the gap untouched.
    const target = this.#projections.get(key(tokenId)) ?? new TokenProjection();
    const entry = target.admit(candidate);
    this.#projections.set(key(tokenId), target);
    adapter.advanceHeight(tokenId, material.remoteHeight);
    const gapClosed = this.#gaps.delete(key(tokenId));

    return { entry, gapClosed, remoteHeight: material.remoteHeight };
  }

  #resolveProfile(id: string): ProofProfile {
    const profile = this.#options.profiles.get(id);
    if (profile === undefined) {
      return reject('PROOF_PROFILE_REJECTED', `unknown proof profile: ${id}`);
    }
    return profile;
  }

  #require(tokenId: TokenId): TokenProjection {
    const projection = this.#projections.get(key(tokenId));
    if (projection === undefined) {
      return reject('UNKNOWN_TOKEN', `no projection for token ${tokenId}`);
    }
    return projection;
  }
}

const key = (tokenId: TokenId): string => tokenId.toString();

export { ProjectionError };
