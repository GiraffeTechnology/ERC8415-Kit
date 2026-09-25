# Durable storage

The projection's history is append-only, so its durable form is too: an
append-only journal of every mutation, and the state is whatever replaying it
produces. There is no snapshot to fall out of step with the log.

## Files

| File | Role |
| --- | --- |
| `journal.ts` | newline-delimited JSON on disk, `fsync`ed on every append |
| `restore.ts` | replays a journal into a store |

`nullJournal` is the default, so a store constructed without one behaves
exactly as it did before durability existed.

## Ordering, and what a crash costs

A mutation is applied first and journaled second. The kernel validates while
applying, so only a known-good mutation is ever written down.

- **Crash between the apply and the `fsync`** loses that one mutation. The call
  had not returned, so no caller was told it succeeded, and replay produces a
  consistent state one mutation short.
- **The append itself fails** — a full disk, a read-only mount — and the
  mutation is undone. The process is still running, so the divergence would be
  observable: the caller is told the admission failed while every reader sees
  the entry, until a restart makes it vanish. What cannot be un-applied is a
  *journaled* history; a mutation that never reached the disk is not history,
  and no caller was told it was. The rollback puts back the entry, the
  `supersededAt` it wrote on the one before it, the remote height and the gap,
  because those three are one admission and have to fail as one.

  The store is poisoned even so. A failed append may have written bytes before
  it threw, so memory is now correct but what the journal holds is not knowable
  from here. It refuses every later write with `STORE_NOT_WRITABLE` rather than
  append behind a record it cannot account for.

Every append is followed by `fsyncSync`. Without it a write sits in the page
cache and a power loss silently discards records the caller was told were
committed, which is the failure this exists to prevent.

## Recovery repairs, it does not just tolerate

A crash mid-append leaves a final line with no terminating newline. Reading the
journal physically truncates those bytes away, so reading is the one operation
that may also write.

Parsing around the tail is not enough. The file is opened in append mode, so
the next record would be concatenated onto the orphaned bytes, and the combined
line would fail to parse on every later read — turning the loss of one
unacknowledged record into the permanent loss of the whole journal. Truncating
discards only the partial record, which no caller was ever told had succeeded.

## Replay does not re-decide

Replay skips proof verification and the remote-height checks. Those decisions
belong to the moment of admission. Re-deciding them at restart would let a
rotated proof profile, or a remote height the adapter no longer serves, erase
an entry the register already confirmed — a restart must not change history.

The kernel's invariants still apply, because entries go back in through the
same append the first write used. A journal that has been tampered with — a
reordered record, a broken commitment link — therefore fails to replay rather
than loading quietly.

## Format

Newline-delimited JSON. Every `uint64` is a decimal string, never a JSON
number: an instant or a version can exceed what a double holds exactly, and a
rounded instant replays as the wrong entry.

A trailing line without a newline means the process died mid-append. It is
discarded and reported as `truncatedTail`; the record was never acknowledged,
so this is recovery rather than data loss.
