import { ProjectionStore, type StoreOptions } from '../projection/store.ts';
import type { Journal, JournalRecord } from './journal.ts';
import type { Bytes32, CandidateEntry, Settlement, TokenId } from '../projection/types.ts';

export interface RestoreResult {
  readonly store: ProjectionStore;
  readonly applied: number;
  /** A partial record at the end of the journal was discarded. */
  readonly truncatedTail: boolean;
}

/**
 * Rebuild a store by replaying its journal.
 *
 * Replay does not re-verify proofs and does not re-run the admission path.
 * Those decisions were made when the record was first admitted; re-deciding
 * them here would let a restart change history, which is exactly what an
 * append-only projection must not do. A proof profile that has since been
 * rotated, or a remote height the adapter no longer serves, must not be able
 * to erase an entry the register already confirmed.
 *
 * What replay does preserve is the kernel's own invariants, because entries go
 * back in through the same admission the first write used. A journal that has
 * been tampered with - a reordered entry, a broken commitment link - therefore
 * fails to replay rather than loading quietly.
 */
export const restoreProjectionStore = (
  options: StoreOptions & { readonly journal: Journal },
): RestoreResult => {
  const { records, truncatedTail } = options.journal.read();
  // The journal is attached from the start; the replay methods append nothing,
  // so the file is read and then extended only by genuinely new mutations.
  const store = new ProjectionStore(options);

  for (const record of records) applyRecord(store, record);

  return { store, applied: records.length, truncatedTail };
};

const applyRecord = (store: ProjectionStore, record: JournalRecord): void => {
  switch (record.kind) {
    case 'gap-opened':
      store.replayGapOpened(toSettlement(record.settlement));
      return;
    case 'gap-cancelled':
      store.replayGapCancelled(BigInt(record.tokenId), record.settlementId as Bytes32);
      return;
    case 'admitted':
      store.replayAdmitted(
        BigInt(record.tokenId),
        toCandidate(record.entry),
        BigInt(record.remoteHeight),
        record.settlementId as Bytes32 | null,
      );
      return;
  }
};

const toCandidate = (raw: Record<string, string>): CandidateEntry => ({
  version: BigInt(raw['version'] as string),
  holder: raw['holder'] as string,
  effectiveAt: BigInt(raw['effectiveAt'] as string),
  recordCommitment: raw['recordCommitment'] as Bytes32,
  previousCommitment: raw['previousCommitment'] as Bytes32,
  registryReference: raw['registryReference'] as Bytes32,
});

const toSettlement = (raw: Record<string, string>): Settlement => ({
  settlementId: raw['settlementId'] as Bytes32,
  tokenId: BigInt(raw['tokenId'] as string) as TokenId,
  initiator: raw['initiator'] as string,
  expectedHolder: raw['expectedHolder'] as string,
  snapshotHash: raw['snapshotHash'] as Bytes32,
  openedAt: BigInt(raw['openedAt'] as string),
  deadline: BigInt(raw['deadline'] as string),
  status: raw['status'] as Settlement['status'],
});
