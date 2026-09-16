import {
  isAddress,
  isCommitment,
  isUint64,
  ZERO_COMMITMENT,
  type CandidateEntry,
  type Commitment,
  type HolderAnswer,
  type Instant,
  type ProjectionEntry,
} from './types.ts';
import { ProjectionError, reject } from './errors.ts';

/**
 * The append-only projection history of one token, and the temporal queries
 * over it.
 *
 * The kernel holds no notion of current ERC-721 ownership and cannot be asked
 * for one. `holderAsOf` answers from admitted history alone; it is never an
 * alias for `ownerOf`, not even as a fallback.
 *
 * Finality is not stored. `isFinalAsOf` computes the later-admission rule on
 * every call, so admitting an entry changes the answer for earlier instants
 * without anything being written back.
 */
export class TokenProjection {
  readonly #entries: ProjectionEntry[] = [];
  readonly #commitments = new Set<Commitment>();

  get length(): number {
    return this.#entries.length;
  }

  entryAt(index: number): ProjectionEntry {
    const entry = this.#entries[index];
    if (entry === undefined) {
      return reject('INDEX_OUT_OF_RANGE', `no entry at index ${index}`);
    }
    return entry;
  }

  currentEntry(): ProjectionEntry {
    const entry = this.#entries.at(-1);
    if (entry === undefined) {
      return reject('EMPTY_PROJECTION', 'the projection has no entries');
    }
    return entry;
  }

  /**
   * Validate a candidate against every append-only invariant and, if it holds,
   * append it. The caller performs proof-profile verification and gap closure
   * around this call so that the whole admission is one atomic step.
   */
  admit(candidate: CandidateEntry): ProjectionEntry {
    this.#validateShape(candidate);

    const previous = this.#entries.at(-1);

    if (previous === undefined) {
      // Convention for the first entry: it anchors to the zero commitment,
      // because there is no earlier entry to link to. Confirm against the
      // standard before relying on it in a deployment.
      if (candidate.previousCommitment !== ZERO_COMMITMENT) {
        reject(
          'BROKEN_COMMITMENT_LINKAGE',
          'the first entry must anchor to the zero commitment',
        );
      }
    } else {
      if (candidate.version !== previous.version + 1n) {
        reject(
          'NON_CONSECUTIVE_VERSION',
          `version must be ${previous.version + 1n}, got ${candidate.version}`,
        );
      }
      if (candidate.effectiveAt <= previous.effectiveAt) {
        reject(
          'EFFECTIVE_AT_NOT_INCREASING',
          `effectiveAt must exceed ${previous.effectiveAt}, got ${candidate.effectiveAt}`,
        );
      }
      if (candidate.previousCommitment !== previous.recordCommitment) {
        reject(
          'BROKEN_COMMITMENT_LINKAGE',
          'previousCommitment does not match the preceding record commitment',
        );
      }
    }

    // Uniqueness is scoped to this token. A commitment held by a different
    // token is none of this projection's business: cross-token replay is a
    // registrar or application concern, and enforcing it here would require
    // global state the standard does not assume.
    if (this.#commitments.has(candidate.recordCommitment)) {
      reject('COMMITMENT_REUSED', 'this commitment is already in the token history');
    }

    const entry: ProjectionEntry = {
      version: candidate.version,
      holder: candidate.holder,
      effectiveAt: candidate.effectiveAt,
      recordCommitment: candidate.recordCommitment,
      previousCommitment: candidate.previousCommitment,
      registryReference: candidate.registryReference,
    };
    this.#entries.push(entry);
    this.#commitments.add(entry.recordCommitment);
    return entry;
  }

  /**
   * The entry whose effective interval covers `instant`.
   *
   * Reverts for an instant preceding the first entry. That is "the projection
   * does not cover this instant", not a failure of the query.
   */
  entryAsOf(instant: Instant): ProjectionEntry {
    const first = this.#entries[0];
    if (first === undefined || instant < first.effectiveAt) {
      return reject('INSTANT_NOT_COVERED', `the projection does not cover instant ${instant}`);
    }

    // Rightmost entry whose effectiveAt is at or before the instant.
    let low = 0;
    let high = this.#entries.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      const candidate = this.#entries[mid];
      if (candidate !== undefined && candidate.effectiveAt <= instant) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return this.entryAt(low);
  }

  holderAsOf(instant: Instant): HolderAnswer {
    const entry = this.entryAsOf(instant);
    return { holder: entry.holder, provisional: !this.isFinalAsOf(instant) };
  }

  /**
   * An instant is final if and only if it is at or after the first entry's
   * effectiveAt and strictly before the latest entry's.
   *
   * Equivalently: a strictly later admitted entry exists. A later entry may
   * admit the same holder — such a confirming entry finalises the preceding
   * interval without the holder having changed.
   *
   * Nothing else produces finality. Not a closed gap, not a cancellation, not
   * a verified proof, not block depth, not a timeout.
   *
   * Returns false, and does not revert, for an instant the projection does
   * not cover.
   */
  isFinalAsOf(instant: Instant): boolean {
    const first = this.#entries[0];
    const latest = this.#entries.at(-1);
    if (first === undefined || latest === undefined) return false;
    return instant >= first.effectiveAt && instant < latest.effectiveAt;
  }

  entries(): readonly ProjectionEntry[] {
    return this.#entries.slice();
  }

  #validateShape(candidate: CandidateEntry): void {
    const bad = (why: string): never => reject('MALFORMED_ENTRY', why);

    if (!isAddress(candidate.holder)) bad('holder is not a lowercase 0x address');
    if (!isCommitment(candidate.recordCommitment)) bad('recordCommitment is not a 32-byte hex value');
    if (!isCommitment(candidate.previousCommitment)) bad('previousCommitment is not a 32-byte hex value');
    if (typeof candidate.registryReference !== 'string' || candidate.registryReference.length === 0) {
      bad('registryReference is empty');
    }
    if (typeof candidate.effectiveAt !== 'bigint' || !isUint64(candidate.effectiveAt)) {
      bad('effectiveAt is not a uint64');
    }
    if (typeof candidate.version !== 'bigint' || !isUint64(candidate.version)) {
      bad('version is not a uint64');
    }
    if (candidate.recordCommitment === candidate.previousCommitment) {
      bad('recordCommitment repeats previousCommitment');
    }
  }
}

export { ProjectionError };
