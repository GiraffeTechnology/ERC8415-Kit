/** 0x-prefixed 20-byte hex, lowercase. */
export type Address = string;

/** 0x-prefixed 32-byte hex, lowercase. */
export type Commitment = string;

/** Seconds since the Unix epoch, on the same scale as `block.timestamp`. */
export type Instant = bigint;

export type TokenId = bigint;

/**
 * One admitted holder entry. An entry's interval runs from its own
 * `effectiveAt` up to, but not including, the next entry's.
 *
 * Nothing here is mutable after admission: no rewrite, no delete, no
 * retroactive change to `effectiveAt`, commitment or holder.
 */
export interface ProjectionEntry {
  readonly version: bigint;
  readonly holder: Address;
  readonly effectiveAt: Instant;
  readonly recordCommitment: Commitment;
  readonly previousCommitment: Commitment;
  readonly registryReference: string;
}

/** A candidate entry, before admission has accepted it. */
export type CandidateEntry = ProjectionEntry;

/**
 * The answer to `holderAsOf`. `provisional` is the negation of `isFinalAsOf`
 * at the same instant: a holder can be known while the answer can still move.
 */
export interface HolderAnswer {
  readonly holder: Address;
  readonly provisional: boolean;
}

/**
 * A settlement gap: a change is in flight. `openedAt` is the instant from
 * which the token is contested.
 *
 * An open gap never blocks an ERC-721 transfer, and it does not make any
 * instant final or provisional on its own.
 */
export interface Gap {
  readonly openedAt: Instant;
  readonly settlementId: string;
}

export const ZERO_COMMITMENT: Commitment = `0x${'0'.repeat(64)}`;

export const UINT64_MAX = (1n << 64n) - 1n;

const ADDRESS = /^0x[0-9a-f]{40}$/;
const COMMITMENT = /^0x[0-9a-f]{64}$/;

export const isAddress = (value: unknown): value is Address =>
  typeof value === 'string' && ADDRESS.test(value);

export const isCommitment = (value: unknown): value is Commitment =>
  typeof value === 'string' && COMMITMENT.test(value);

export const isUint64 = (value: bigint): boolean => value >= 0n && value <= UINT64_MAX;
