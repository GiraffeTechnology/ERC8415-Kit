import type { CandidateEntry, Commitment, Instant, TokenId } from '../projection/types.ts';

/**
 * What an admission proof is checked against.
 *
 * The binding is what stops a proof produced for one place being replayed in
 * another: it names the local chain and contract, the token and settlement it
 * belongs to, the holder and commitments it claims, and the version and
 * effective time it carries.
 */
export interface AdmissionBinding {
  readonly chainId: bigint;
  readonly contract: string;
  readonly tokenId: TokenId;
  readonly settlementId: string;
  readonly holder: string;
  readonly priorCommitment: Commitment;
  readonly nextCommitment: Commitment;
  readonly version: bigint;
  readonly effectiveAt: Instant;
}

/** The proof material a relayer submits alongside a candidate entry. */
export interface ProofMaterial {
  readonly profile: string;
  /** Height of the remote state the proof claims inclusion in. */
  readonly remoteHeight: bigint;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ProofContext {
  readonly binding: AdmissionBinding;
  readonly candidate: CandidateEntry;
  /** Highest remote height already accepted for this token. */
  readonly acceptedRemoteHeight: bigint;
  /** Whether the adapter considers the claimed remote height finalized. */
  readonly remoteFinalized: boolean;
}

export type ProofVerdict = { readonly admitted: true } | { readonly admitted: false; readonly reason: string };

export const admitted: ProofVerdict = { admitted: true };
export const refused = (reason: string): ProofVerdict => ({ admitted: false, reason });

/**
 * A proof profile decides whether evidence may admit an entry.
 *
 * It MUST NOT set finality. A verdict of `admitted` means the entry enters
 * history; whether any instant is final is computed from that history
 * afterwards, by the later-admission rule and by nothing else.
 */
export interface ProofProfile {
  readonly id: string;
  verify(material: ProofMaterial, context: ProofContext): ProofVerdict;
}

export class ProofProfileRegistry {
  readonly #profiles = new Map<string, ProofProfile>();

  register(profile: ProofProfile): void {
    this.#profiles.set(profile.id, profile);
  }

  get(id: string): ProofProfile | undefined {
    return this.#profiles.get(id);
  }

  ids(): readonly string[] {
    return [...this.#profiles.keys()].sort();
  }
}
