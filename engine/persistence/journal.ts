import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, truncateSync, writeSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * An append-only journal of everything that changed the projection.
 *
 * The projection's own history is append-only, so its durable form is too: a
 * record is appended and never rewritten, and the state is whatever replaying
 * the file produces. There is no snapshot to fall out of step with the log.
 *
 * Every append is followed by `fsyncSync`. Without it a write sits in the page
 * cache and a power loss silently discards records the caller was told were
 * committed, which is the failure this whole file exists to prevent.
 *
 * Node's own `fs` is the only dependency. The Kit has no runtime dependencies
 * and durability is not a reason to acquire one.
 */
export type JournalRecord =
  | { readonly kind: 'admitted'; readonly tokenId: string; readonly entry: Record<string, string>; readonly remoteHeight: string; readonly settlementId: string | null }
  | { readonly kind: 'gap-opened'; readonly tokenId: string; readonly settlement: Record<string, string> }
  | { readonly kind: 'gap-cancelled'; readonly tokenId: string; readonly settlementId: string };

export interface JournalReadResult {
  readonly records: readonly JournalRecord[];
  /**
   * A trailing line that was not a complete record. It means the process died
   * mid-append; the record was never acknowledged to a caller, so discarding
   * it is the correct recovery and not data loss.
   *
   * When this is true the file has been physically truncated to the last
   * complete record, not merely parsed around.
   */
  readonly truncatedTail: boolean;
}

export interface Journal {
  append(record: JournalRecord): void;
  read(): JournalReadResult;
  close(): void;
}

/** A journal that keeps nothing. The default, so existing callers are unchanged. */
export const nullJournal: Journal = {
  append: () => {},
  read: () => ({ records: [], truncatedTail: false }),
  close: () => {},
};

/**
 * Newline-delimited JSON on disk.
 *
 * Every uint64 is written as a decimal string, never a JSON number: an instant
 * or a version can exceed what a double holds exactly, and a rounded instant
 * replays as the wrong entry.
 */
export class FileJournal implements Journal {
  readonly #path: string;
  #fd: number | undefined;

  constructor(path: string) {
    this.#path = path;
    mkdirSync(dirname(path), { recursive: true });
  }

  append(record: JournalRecord): void {
    if (this.#fd === undefined) {
      // 'a' is append-only at the OS level: concurrent writers cannot
      // interleave a partial record over another's bytes.
      this.#fd = openSync(this.#path, 'a');
    }
    const line = `${JSON.stringify(record)}\n`;
    writeSync(this.#fd, line);
    // Durable before the caller is told anything succeeded.
    fsyncSync(this.#fd);
  }

  /**
   * Read the journal, repairing a torn tail.
   *
   * Reading is where recovery happens, so it is also the only place that may
   * write: a partial final line is physically truncated away before anything
   * is appended after it. Parsing around the tail is not enough. The file is
   * opened in append mode, so the next record would be concatenated onto those
   * orphaned bytes and the combined line would fail to parse on every later
   * read - turning the loss of one unacknowledged record into the permanent
   * loss of the whole journal.
   *
   * Truncating discards only the partial record, which no caller was ever told
   * had succeeded.
   */
  read(): JournalReadResult {
    if (!existsSync(this.#path)) return { records: [], truncatedTail: false };
    const raw = readFileSync(this.#path, 'utf8');
    if (raw.length === 0) return { records: [], truncatedTail: false };

    const lines = raw.split('\n');
    // A complete file ends with a newline, so the final split element is ''.
    const tail = lines.pop();
    const truncatedTail = tail !== '';

    if (truncatedTail) {
      // Drop the orphaned bytes before any append can land behind them. An
      // open descriptor would keep writing past the old end, so close first.
      this.close();
      // Byte length, not character count: truncateSync takes bytes, and a
      // non-ASCII character in any field would otherwise cut the file in the
      // wrong place.
      const keep = Buffer.byteLength(raw, 'utf8') - Buffer.byteLength(tail as string, 'utf8');
      truncateSync(this.#path, keep);
    }

    const records: JournalRecord[] = [];
    for (const line of lines) {
      if (line.length === 0) continue;
      records.push(JSON.parse(line) as JournalRecord);
    }
    return { records, truncatedTail };
  }

  close(): void {
    if (this.#fd !== undefined) {
      closeSync(this.#fd);
      this.#fd = undefined;
    }
  }
}
