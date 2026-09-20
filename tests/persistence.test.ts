import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileJournal, JournalIdentityMismatchError, nullJournal } from '../engine/persistence/journal.ts';
import { restoreProjectionStore } from '../engine/persistence/restore.ts';
import { ProjectionStore } from '../engine/projection/store.ts';
import { ProjectionError } from '../engine/projection/errors.ts';
import { ZERO_BYTES32 } from '../engine/projection/types.ts';
import { ALICE, BOB, admit, commitment, entry, gap, harness } from './support/fixtures.ts';

const TOKEN = 1n;
const scratch = () => join(mkdtempSync(join(tmpdir(), 'erc8415-journal-')), 'projection.ndjson');

/** The journal's mutation lines, without the identity header it opens with. */
const recordLines = (path: string) =>
  readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .filter((line) => !line.startsWith('{"kind":"header"'));

/** The header line, as written. */
const headerLine = (path: string) =>
  readFileSync(path, 'utf8').split('\n').find((line) => line.startsWith('{"kind":"header"'))!;

/** A harness whose store journals to `path`, sharing the fixture's profiles. */
const durable = (path: string) => {
  const base = harness();
  const store = new ProjectionStore({
    registerId: base.store.registerId,
    verificationProfile: base.store.verificationProfile,
    profiles: base.profiles,
    adapter: base.adapter,
    journal: new FileJournal(path),
  });
  return { ...base, store };
};

/** Reopen the same journal into a fresh store, as a restart would. */
const reopen = (path: string, base: ReturnType<typeof harness>) =>
  restoreProjectionStore({
    registerId: base.store.registerId,
    verificationProfile: base.store.verificationProfile,
    profiles: base.profiles,
    adapter: base.adapter,
    journal: new FileJournal(path),
  });

test('a store with no journal behaves exactly as before', () => {
  const h = harness();
  admit(h, TOKEN, entry({ version: 1n, holder: ALICE, effectiveAt: 100n, recordCommitment: commitment(1) }));
  assert.equal(h.store.entryCount(TOKEN), 1);
  assert.equal(h.store.poisonedReason, undefined);
  assert.deepEqual(nullJournal.read(), { records: [], identity: undefined, truncatedTail: false });
});

test('admitted entries survive a restart', () => {
  const path = scratch();
  const h = durable(path);
  admit(h, TOKEN, entry({ version: 1n, holder: ALICE, effectiveAt: 100n, recordCommitment: commitment(1) }));
  admit(h, TOKEN, entry({
    version: 2n, holder: BOB, effectiveAt: 130n,
    recordCommitment: commitment(2), previousCommitment: commitment(1),
  }));

  const before = {
    count: h.store.entryCount(TOKEN),
    holder: h.store.holderAsOf(TOKEN, 120n),
    final: h.store.isFinalAsOf(TOKEN, 120n),
    superseded: h.store.entryAt(TOKEN, 1n).supersededAt,
  };

  // A different process, the same file.
  const restored = reopen(path, h);

  assert.equal(restored.applied, 2);
  assert.equal(restored.truncatedTail, false);
  assert.equal(restored.store.entryCount(TOKEN), before.count);
  assert.equal(restored.store.holderAsOf(TOKEN, 120n), before.holder);
  assert.equal(restored.store.isFinalAsOf(TOKEN, 120n), before.final);
  // supersededAt is derived by replaying the admission, not copied blindly.
  assert.equal(restored.store.entryAt(TOKEN, 1n).supersededAt, before.superseded);
  assert.equal(before.superseded, 130n);
});

test('gap state and its outcome survive a restart', () => {
  const path = scratch();
  const h = durable(path);
  admit(h, TOKEN, entry({ version: 1n, holder: ALICE, effectiveAt: 100n, recordCommitment: commitment(1) }));

  const cancelled = h.store.openGap(TOKEN, gap({ settlementId: commitment(0x81) }));
  h.store.cancelGap(TOKEN);
  const open = h.store.openGap(TOKEN, gap({ settlementId: commitment(0x82) }));

  const restored = reopen(path, h).store;
  assert.equal(restored.openGapOf(TOKEN), open.settlementId);
  assert.equal(restored.settlement(open.settlementId).status, 'OPEN');
  // The cancelled settlement keeps its outcome rather than vanishing.
  assert.equal(restored.settlement(cancelled.settlementId).status, 'CANCELLED');
});

test('an admission that closed a gap replays with the gap closed', () => {
  const path = scratch();
  const h = durable(path);
  admit(h, TOKEN, entry({ version: 1n, holder: ALICE, effectiveAt: 100n, recordCommitment: commitment(1) }));
  const opened = h.store.openGap(TOKEN, gap({ settlementId: commitment(0x83) }));
  admit(h, TOKEN, entry({
    version: 2n, holder: BOB, effectiveAt: 130n,
    recordCommitment: commitment(2), previousCommitment: commitment(1),
  }));

  const restored = reopen(path, h).store;
  assert.equal(restored.openGapOf(TOKEN), ZERO_BYTES32);
  assert.equal(restored.settlement(opened.settlementId).status, 'ADMITTED');
  assert.equal(restored.entryCount(TOKEN), 2);
});

test('a torn final line is discarded, and the records before it survive', () => {
  const path = scratch();
  const h = durable(path);
  admit(h, TOKEN, entry({ version: 1n, holder: ALICE, effectiveAt: 100n, recordCommitment: commitment(1) }));
  admit(h, TOKEN, entry({
    version: 2n, holder: BOB, effectiveAt: 130n,
    recordCommitment: commitment(2), previousCommitment: commitment(1),
  }));

  // A process killed mid-append leaves a line with no terminating newline.
  appendFileSync(path, '{"kind":"admitted","tokenId":"1","entry":{"vers');

  const restored = reopen(path, h);
  assert.equal(restored.truncatedTail, true, 'the torn tail was not detected');
  assert.equal(restored.applied, 2, 'a complete record was lost');
  assert.equal(restored.store.entryCount(TOKEN), 2);
  assert.equal(restored.store.holderAsOf(TOKEN, 130n), BOB);
});

test('every journaled uint64 is a decimal string, never a JSON number', () => {
  const path = scratch();
  const h = durable(path);
  const huge = 2n ** 53n + 1n;
  admit(h, TOKEN, entry({ version: 1n, holder: ALICE, effectiveAt: huge, recordCommitment: commitment(1) }));

  const line = JSON.parse(recordLines(path)[0]!) as { entry: Record<string, unknown> };
  assert.equal(typeof line.entry['effectiveAt'], 'string');
  assert.equal(line.entry['effectiveAt'], huge.toString());

  // And it round-trips exactly, which a JSON number would not.
  const restored = reopen(path, h).store;
  assert.equal(restored.entryAt(TOKEN, 1n).effectiveAt, huge);
});

test('a tampered journal fails to replay rather than loading quietly', () => {
  const path = scratch();
  const h = durable(path);
  admit(h, TOKEN, entry({ version: 1n, holder: ALICE, effectiveAt: 100n, recordCommitment: commitment(1) }));
  admit(h, TOKEN, entry({
    version: 2n, holder: BOB, effectiveAt: 130n,
    recordCommitment: commitment(2), previousCommitment: commitment(1),
  }));

  // Swap the two records, breaking the commitment link and the version order.
  const lines = recordLines(path);
  writeFileSync(path, `${headerLine(path)}\n${lines[1]}\n${lines[0]}\n`);

  assert.throws(() => reopen(path, h), (error: unknown) => {
    assert.ok(error instanceof ProjectionError, `expected a ProjectionError, got ${String(error)}`);
    return true;
  });
});

test('replay does not extend the journal it read', () => {
  const path = scratch();
  const h = durable(path);
  admit(h, TOKEN, entry({ version: 1n, holder: ALICE, effectiveAt: 100n, recordCommitment: commitment(1) }));
  const before = readFileSync(path, 'utf8');

  reopen(path, h);

  assert.equal(readFileSync(path, 'utf8'), before, 'replay rewrote or appended to the journal');
});

test('a restored store keeps journaling new mutations', () => {
  const path = scratch();
  const h = durable(path);
  admit(h, TOKEN, entry({ version: 1n, holder: ALICE, effectiveAt: 100n, recordCommitment: commitment(1) }));

  const restored = reopen(path, h);
  restored.store.openGap(TOKEN, gap({ settlementId: commitment(0x91) }));

  // The new mutation is durable too: a second restart still sees it.
  const again = reopen(path, h).store;
  assert.equal(again.openGapOf(TOKEN), commitment(0x91));
});

test('a store that cannot journal refuses further writes instead of drifting', () => {
  const failing = {
    append: () => { throw new Error('disk full'); },
    read: () => ({ records: [], identity: undefined, truncatedTail: false }),
    bind: () => {},
    close: () => {},
  };
  const base = harness();
  const store = new ProjectionStore({
    registerId: base.store.registerId,
    verificationProfile: base.store.verificationProfile,
    profiles: base.profiles,
    adapter: base.adapter,
    journal: failing,
  });

  assert.throws(() => store.openGap(TOKEN, gap({ settlementId: commitment(0x95) })), /disk full/);
  assert.equal(store.poisonedReason, 'disk full');

  // Fail closed: it does not keep accepting writes it cannot record.
  assert.throws(() => store.openGap(2n, gap({ settlementId: commitment(0x96) })), (error: unknown) => {
    assert.ok(error instanceof ProjectionError);
    assert.equal(error.code, 'STORE_NOT_WRITABLE');
    return true;
  });
});

test('an append after a torn tail does not glue itself onto the fragment', () => {
  // The torn-tail test above proves recovery reads past a fragment. This is
  // the other half, and the one that bites: the process comes back up and
  // keeps writing. If the next record lands concatenated onto the dead one it
  // is fsynced and reported committed, and the restart after that cannot parse
  // the journal at all - so the mutation the caller was told had survived is
  // the one that takes every later record down with it.
  const path = scratch();
  const h = durable(path);
  admit(h, TOKEN, entry({ version: 1n, holder: ALICE, effectiveAt: 100n, recordCommitment: commitment(1) }));
  appendFileSync(path, '{"kind":"admitted","tokenId":"1","entry":{"vers');

  // The process comes back, replays what survived, and carries on writing.
  const second = reopen(path, h);
  assert.equal(second.truncatedTail, true, 'the fragment was not seen on recovery');
  admit({ ...h, store: second.store }, TOKEN, entry({
    version: 2n, holder: BOB, effectiveAt: 130n,
    recordCommitment: commitment(2), previousCommitment: commitment(1),
  }));

  // Every line is a whole record, and the fragment is gone.
  for (const line of recordLines(path)) JSON.parse(line);
  assert.equal(recordLines(path).length, 2);

  const restored = reopen(path, h);
  assert.equal(restored.applied, 2, 'the acknowledged mutation did not survive');
  assert.equal(restored.store.holderAsOf(TOKEN, 130n), BOB);
  assert.equal(restored.truncatedTail, false, 'the fragment was already discarded');
});

test('a journal is refused by a store for a different projection', () => {
  const path = scratch();
  const h = durable(path);
  admit(h, TOKEN, entry({ version: 1n, holder: ALICE, effectiveAt: 100n, recordCommitment: commitment(1) }));

  // Replay does not re-verify proofs, on purpose. So a journal reused under a
  // different register identity would have its entries presented as records of
  // a projection they were never bound to, with nothing left to catch it.
  const other = harness();
  assert.throws(
    () =>
      restoreProjectionStore({
        registerId: commitment(0x77),
        verificationProfile: other.store.verificationProfile,
        profiles: other.profiles,
        adapter: other.adapter,
        journal: new FileJournal(path),
      }),
    (error: unknown) => {
      assert.ok(error instanceof JournalIdentityMismatchError, String(error));
      assert.equal(error.field, 'registerId');
      return true;
    },
  );

  // And the same journal still opens under the identity that wrote it.
  assert.equal(reopen(path, h).applied, 1);
});

test('a journal with no identity header is not replayed', () => {
  // Every journal this code writes opens with a header, so one without a
  // header and with records in it was written by something else. Replaying it
  // would be the same exposure as replaying a mismatched one, minus the
  // evidence.
  const path = scratch();
  const h = harness();
  writeFileSync(
    path,
    '{"kind":"admitted","tokenId":"1","entry":{"version":"1","holder":"' +
      `${ALICE}","effectiveAt":"100","supersededAt":"0","recordCommitment":"${commitment(1)}",` +
      `"previousCommitment":"${ZERO_BYTES32}","registryReference":"${commitment(0xab)}"},` +
      '"remoteHeight":"1","settlementId":null}\n',
  );
  assert.throws(() => reopen(path, h), JournalIdentityMismatchError);
});

test('a journal opening two gaps on one token fails to replay', () => {
  const path = scratch();
  const h = durable(path);
  h.store.openGap(TOKEN, gap({ settlementId: commitment(0x81) }));

  // The live path rejects a second opening with GAP_ALREADY_OPEN. A journal
  // carrying one replays into a state the store cannot otherwise reach: one
  // open-gap pointer, two settlements left OPEN, and no way to tell which one
  // a later cancellation closed.
  const opened = recordLines(path)[0]!;
  writeFileSync(
    path,
    `${headerLine(path)}\n${opened}\n${opened.replace(commitment(0x81), commitment(0x82))}\n`,
  );

  assert.throws(() => reopen(path, h), (error: unknown) => {
    assert.ok(error instanceof ProjectionError, String(error));
    assert.equal(error.code, 'GAP_ALREADY_OPEN');
    return true;
  });
});

test('a journal cancelling a gap that is not open fails to replay', () => {
  const path = scratch();
  const h = durable(path);
  h.store.openGap(TOKEN, gap({ settlementId: commitment(0x83) }));
  h.store.cancelGap(TOKEN);

  // Drop the opening and keep the cancellation: a reordered or forged record,
  // not a recoverable state.
  const cancelled = recordLines(path).find((line) => line.includes('gap-cancelled'))!;
  writeFileSync(path, `${headerLine(path)}\n${cancelled}\n`);

  assert.throws(() => reopen(path, h), (error: unknown) => {
    assert.ok(error instanceof ProjectionError, String(error));
    assert.equal(error.code, 'NO_OPEN_GAP');
    return true;
  });
});

/** A real journal that can be made to fail on demand, as a full disk would. */
const breakable = (path: string) => {
  const inner = new FileJournal(path);
  let broken = false;
  return {
    break: () => { broken = true; },
    journal: {
      append: (record: Parameters<FileJournal['append']>[0]) => {
        if (broken) throw new Error('disk full');
        inner.append(record);
      },
      read: () => inner.read(),
      bind: (identity: Parameters<FileJournal['bind']>[0]) => inner.bind(identity),
      close: () => inner.close(),
    },
  };
};

test('an admission that cannot be journaled is undone rather than left in memory', () => {
  const path = scratch();
  const base = harness();
  const { journal, break: breakIt } = breakable(path);
  const h = {
    ...base,
    store: new ProjectionStore({
      registerId: base.store.registerId,
      verificationProfile: base.store.verificationProfile,
      profiles: base.profiles,
      adapter: base.adapter,
      journal,
    }),
  };

  admit(h, TOKEN, entry({ version: 1n, holder: ALICE, effectiveAt: 100n, recordCommitment: commitment(1) }));

  const before = {
    count: h.store.entryCount(TOKEN),
    holder: h.store.holderAsOf(TOKEN, 100n),
    supersededAt: h.store.entryAt(TOKEN, 1n).supersededAt,
    height: base.adapter.acceptedHeight(TOKEN),
    final: h.store.isFinalAsOf(TOKEN, 100n),
  };

  breakIt();
  assert.throws(() => admit(h, TOKEN, entry({
    version: 2n, holder: BOB, effectiveAt: 130n,
    recordCommitment: commitment(2), previousCommitment: commitment(1),
  })), /disk full/);

  // The caller was told it failed, so nothing may be able to observe it having
  // happened. Without the rollback the entry is readable here and disappears
  // at the next restart.
  assert.equal(h.store.entryCount(TOKEN), before.count, 'the phantom entry is still readable');
  assert.equal(h.store.holderAsOf(TOKEN, 130n), before.holder);
  assert.equal(h.store.entryAt(TOKEN, 1n).supersededAt, before.supersededAt, 'the prior interval was left closed');
  assert.equal(base.adapter.acceptedHeight(TOKEN), before.height, 'the remote height was left advanced');
  assert.equal(h.store.isFinalAsOf(TOKEN, 100n), before.final, 'a failed admission conferred finality');

  // Memory now matches the disk, which is the point.
  const restored = reopen(path, base);
  assert.equal(restored.store.entryCount(TOKEN), before.count);
  assert.equal(restored.store.holderAsOf(TOKEN, 100n), before.holder);

  // The store still fails closed: a failed append may have written bytes
  // before it threw, so what the journal holds is not knowable from here.
  assert.equal(h.store.poisonedReason, 'disk full');
});

test('a gap whose open cannot be journaled is undone', () => {
  const path = scratch();
  const base = harness();
  const { journal, break: breakIt } = breakable(path);
  const store = new ProjectionStore({
    registerId: base.store.registerId,
    verificationProfile: base.store.verificationProfile,
    profiles: base.profiles,
    adapter: base.adapter,
    journal,
  });

  breakIt();
  assert.throws(() => store.openGap(TOKEN, gap({ settlementId: commitment(0x98) })), /disk full/);

  // No gap is reported open, and the settlement record does not exist either.
  assert.equal(store.openGapOf(TOKEN), ZERO_BYTES32);
  assert.equal(store.settlement(commitment(0x98)).status, 'NONE');
});

test('a cancellation that cannot be journaled leaves the gap open', () => {
  const path = scratch();
  const base = harness();
  const { journal, break: breakIt } = breakable(path);
  const store = new ProjectionStore({
    registerId: base.store.registerId,
    verificationProfile: base.store.verificationProfile,
    profiles: base.profiles,
    adapter: base.adapter,
    journal,
  });

  store.openGap(TOKEN, gap({ settlementId: commitment(0x99) }));
  breakIt();
  assert.throws(() => store.cancelGap(TOKEN), /disk full/);

  // Cancellation settles nothing even when it succeeds; one that failed must
  // not have closed the gap either.
  assert.equal(store.openGapOf(TOKEN), commitment(0x99));
  assert.equal(store.settlement(commitment(0x99)).status, 'OPEN');
});
