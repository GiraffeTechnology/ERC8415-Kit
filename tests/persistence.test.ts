import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileJournal, nullJournal } from '../engine/persistence/journal.ts';
import { restoreProjectionStore } from '../engine/persistence/restore.ts';
import { ProjectionStore } from '../engine/projection/store.ts';
import { ProjectionError } from '../engine/projection/errors.ts';
import { ZERO_BYTES32 } from '../engine/projection/types.ts';
import { ALICE, BOB, admit, commitment, entry, gap, harness } from './support/fixtures.ts';

const TOKEN = 1n;
const scratch = () => join(mkdtempSync(join(tmpdir(), 'erc8415-journal-')), 'projection.ndjson');

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
  assert.deepEqual(nullJournal.read(), { records: [], truncatedTail: false });
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

  const line = JSON.parse(readFileSync(path, 'utf8').trim()) as { entry: Record<string, unknown> };
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
  const lines = readFileSync(path, 'utf8').trim().split('\n');
  writeFileSync(path, `${lines[1]}\n${lines[0]}\n`);

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
    read: () => ({ records: [], truncatedTail: false }),
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

test('a recovered journal can be appended to and reread', () => {
  const path = scratch();
  const h = durable(path);
  admit(h, TOKEN, entry({ version: 1n, holder: ALICE, effectiveAt: 100n, recordCommitment: commitment(1) }));

  // A process killed mid-append leaves a line with no terminating newline.
  appendFileSync(path, '{"kind":"admitted","tokenId":"1","entry":{"vers');

  const restored = reopen(path, h);
  assert.equal(restored.truncatedTail, true);

  // The torn bytes are gone from the file, not merely parsed around. Left in
  // place they would be concatenated with the next record, and the combined
  // line would fail to parse on every later read - turning the loss of one
  // unacknowledged record into the loss of the whole journal.
  assert.equal(readFileSync(path, 'utf8').endsWith('\n'), true, 'the torn tail is still on disk');

  admit({ ...h, store: restored.store }, TOKEN, entry({
    version: 2n, holder: BOB, effectiveAt: 130n,
    recordCommitment: commitment(2), previousCommitment: commitment(1),
  }));

  const again = reopen(path, h);
  assert.equal(again.truncatedTail, false, 'the journal was corrupted by the append after recovery');
  assert.equal(again.applied, 2);
  assert.equal(again.store.entryCount(TOKEN), 2);
  assert.equal(again.store.holderAsOf(TOKEN, 130n), BOB);
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
