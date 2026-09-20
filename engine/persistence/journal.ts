import {
  closeSync,
  fsyncSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
  existsSync,
} from 'node:fs';
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
/**
 * What projection a journal belongs to, written once as its first line.
 *
 * A journal is a file path, and a path can be reused. Without this, a store
 * configured for a different register, verification profile or chain would
 * replay the old file's entries and expose them as its own records — entries
 * whose proofs were verified against identities that are no longer the ones
 * being claimed. Replay does not re-verify proofs, by design, so the binding
 * has to be checked instead of re-derived.
 */
export interface JournalIdentity {
  /** bytes32, as `registerId()` returns. */
  readonly registerId: string;
  /** bytes32, as `verificationProfile()` returns. */
  readonly verificationProfile: string;
  /** The chain the adapter reads, as a decimal string, when it names one. */
  readonly chainId?: string;
  /** The projection contract the adapter reads, when it names one. */
  readonly contract?: string;
}

export class JournalIdentityMismatchError extends Error {
  readonly field: string;
  readonly stored: string | undefined;
  readonly supplied: string | undefined;

  constructor(field: string, stored: string | undefined, supplied: string | undefined) {
    super(
      `journal belongs to a different projection: ${field} is ${String(stored)} on disk, ` +
        `${String(supplied)} in the supplied options`,
    );
    this.name = 'JournalIdentityMismatchError';
    this.field = field;
    this.stored = stored;
    this.supplied = supplied;
  }
}

export type JournalRecord =
  | { readonly kind: 'admitted'; readonly tokenId: string; readonly entry: Record<string, string>; readonly remoteHeight: string; readonly settlementId: string | null }
  | { readonly kind: 'gap-opened'; readonly tokenId: string; readonly settlement: Record<string, string> }
  | { readonly kind: 'gap-cancelled'; readonly tokenId: string; readonly settlementId: string };

export interface JournalReadResult {
  readonly records: readonly JournalRecord[];
  /**
   * The identity the journal was created with, or undefined for a journal
   * that predates the header or has never been written to.
   */
  readonly identity: JournalIdentity | undefined;
  /**
   * A trailing line that was not a complete record. It means the process died
   * mid-append; the record was never acknowledged to a caller, so discarding
   * it is the correct recovery and not data loss.
   */
  readonly truncatedTail: boolean;
}

export interface Journal {
  append(record: JournalRecord): void;
  read(): JournalReadResult;
  /**
   * Bind an empty journal to a projection, or check an existing one against
   * it. Throws `JournalIdentityMismatchError` when they disagree.
   */
  bind(identity: JournalIdentity): void;
  close(): void;
}

/** A journal that keeps nothing. The default, so existing callers are unchanged. */
export const nullJournal: Journal = {
  append: () => {},
  read: () => ({ records: [], identity: undefined, truncatedTail: false }),
  bind: () => {},
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

  /**
   * Bind an empty journal to a projection, or check an existing one.
   *
   * An empty journal gets the header written. A journal that already carries
   * one is compared against it, field by field. A journal that has records but
   * no header is refused: this code writes a header before any record, so a
   * headerless file with content was written by something else, and replaying
   * it would present its entries as records of a projection nothing ever bound
   * them to — which is the whole reason the header exists.
   */
  bind(identity: JournalIdentity): void {
    const { records, identity: stored } = this.read();
    if (stored !== undefined) {
      for (const field of ['registerId', 'verificationProfile', 'chainId', 'contract'] as const) {
        if (stored[field] !== identity[field]) {
          throw new JournalIdentityMismatchError(field, stored[field], identity[field]);
        }
      }
      return;
    }
    if (records.length > 0) {
      throw new JournalIdentityMismatchError('header', undefined, identity.registerId);
    }
    this.#write({ kind: 'header', identity });
  }

  append(record: JournalRecord): void {
    this.#write(record);
  }

  /** Pure: it reports a torn tail, and changes nothing on disk. */
  read(): JournalReadResult {
    const empty = { records: [], identity: undefined, truncatedTail: false } as const;
    if (!existsSync(this.#path)) return empty;
    const raw = readFileSync(this.#path, 'utf8');
    if (raw.length === 0) return empty;

    const lines = raw.split('\n');
    // A complete file ends with a newline, so the final split element is ''.
    const tail = lines.pop();
    const truncatedTail = tail !== '';

    const records: JournalRecord[] = [];
    let identity: JournalIdentity | undefined;
    for (const line of lines) {
      if (line.length === 0) continue;
      const parsed = JSON.parse(line) as JournalRecord | JournalHeader;
      if (parsed.kind === 'header') {
        identity = parsed.identity;
        continue;
      }
      records.push(parsed);
    }
    return { records, identity, truncatedTail };
  }

  close(): void {
    if (this.#fd !== undefined) {
      closeSync(this.#fd);
      this.#fd = undefined;
    }
  }

  #write(record: JournalRecord | JournalHeader): void {
    const fd = this.#open();
    const line = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
    // writeSync may write fewer bytes than it was given. Treating one call as
    // complete is how a torn record gets created without a crash, so loop
    // until the whole line is on the file.
    let written = 0;
    while (written < line.length) {
      written += writeSync(fd, line, written, line.length - written);
    }
    // Durable before the caller is told anything succeeded.
    fsyncSync(fd);
  }

  /**
   * Open for appending, discarding a torn tail first.
   *
   * A process that died mid-append leaves a fragment with no newline. Writing
   * the next record onto it produces one glued line that fsyncs, is reported
   * committed, and then takes the whole journal down at the following restart:
   * JSON.parse throws on the joined line and every record after it is
   * unreachable. So the fragment goes before anything is appended. It costs a
   * record that was never acknowledged to a caller and saves every record that
   * was.
   */
  #open(): number {
    if (this.#fd !== undefined) return this.#fd;
    if (existsSync(this.#path)) {
      const raw = readFileSync(this.#path, 'utf8');
      const complete = raw.lastIndexOf('\n') + 1;
      if (raw.length > complete) this.#truncateTo(complete);
    }
    // 'a' is append-only at the OS level: concurrent writers cannot interleave
    // a partial record over another's bytes.
    this.#fd = openSync(this.#path, 'a');
    return this.#fd;
  }

  /** Cut the file back to `length` bytes and make the cut durable. */
  #truncateTo(length: number): void {
    const fd = openSync(this.#path, 'r+');
    try {
      ftruncateSync(fd, length);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
}

/** The journal's first line. Not a mutation, so it is not a `JournalRecord`. */
type JournalHeader = { readonly kind: 'header'; readonly identity: JournalIdentity };
