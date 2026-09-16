import type { Gap, ProjectionEntry } from '../engine/projection/types.ts';

/**
 * Wire shapes. Every uint64 crosses as a decimal string: an instant, a version
 * or a token id can exceed what a JSON number holds exactly, and a silently
 * rounded instant would resolve to the wrong entry.
 */
export const entryJson = (entry: ProjectionEntry) => ({
  version: entry.version.toString(),
  holder: entry.holder,
  effectiveAt: entry.effectiveAt.toString(),
  recordCommitment: entry.recordCommitment,
  previousCommitment: entry.previousCommitment,
  registryReference: entry.registryReference,
});

export const gapJson = (gap: Gap) => ({
  openedAt: gap.openedAt.toString(),
  settlementId: gap.settlementId,
});

const UINT64_MAX = (1n << 64n) - 1n;

/** Parse a path segment as a uint64, rejecting anything else. */
export const parseUint64 = (raw: string): bigint | undefined => {
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) return undefined;
  const value = BigInt(raw);
  return value <= UINT64_MAX ? value : undefined;
};
