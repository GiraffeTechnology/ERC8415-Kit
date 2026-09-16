import { ProjectionError } from '../engine/projection/errors.ts';
import type { ProjectionStore } from '../engine/projection/store.ts';
import type { CandidateEntry, ProjectionEntry } from '../engine/projection/types.ts';
import type { ProofMaterial } from '../engine/proof/profile.ts';
import { entryJson, gapJson, parseUint64 } from './serialize.ts';

export interface ApiRequest {
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
}

export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
}

const json = (status: number, body: unknown): ApiResponse => ({ status, body });

/**
 * "The projection does not cover this instant" is a 404, not a 400 and not a
 * 500: the query was well formed and the answer is that there is no record.
 * A malformed candidate is the client's fault; a refused proof is a 422,
 * because the request was understood and not accepted.
 */
const STATUS: Record<string, number> = {
  MALFORMED_ENTRY: 400,
  NON_CONSECUTIVE_VERSION: 409,
  EFFECTIVE_AT_NOT_INCREASING: 409,
  BROKEN_COMMITMENT_LINKAGE: 409,
  COMMITMENT_REUSED: 409,
  PROOF_PROFILE_REJECTED: 422,
  GAP_ALREADY_OPEN: 409,
  NO_OPEN_GAP: 404,
  UNKNOWN_TOKEN: 404,
  EMPTY_PROJECTION: 404,
  INDEX_OUT_OF_RANGE: 404,
  INSTANT_NOT_COVERED: 404,
};

export const handle = (store: ProjectionStore, request: ApiRequest): ApiResponse => {
  try {
    return route(store, request);
  } catch (error) {
    if (error instanceof ProjectionError) {
      return json(STATUS[error.code] ?? 400, { error: error.code, message: error.message });
    }
    throw error;
  }
};

const route = (store: ProjectionStore, request: ApiRequest): ApiResponse => {
  const segments = request.path.split('/').filter((segment) => segment.length > 0);

  if (segments[0] !== 'projection') return json(404, { error: 'NOT_FOUND' });

  const tokenRaw = segments[1];
  if (tokenRaw === undefined) return json(404, { error: 'NOT_FOUND' });
  const tokenId = parseUint64(tokenRaw);
  if (tokenId === undefined) return json(400, { error: 'MALFORMED_TOKEN_ID' });

  const tail = segments.slice(2);

  if (request.method === 'GET' && tail.length === 0) {
    return json(200, {
      registerId: store.registerId,
      verificationProfile: store.verificationProfile,
      tokenId: tokenId.toString(),
      entryCount: store.entryCount(tokenId),
      openGap: gapOrNull(store, tokenId),
    });
  }

  if (request.method === 'GET' && tail[0] === 'entries' && tail.length === 1) {
    return json(200, {
      tokenId: tokenId.toString(),
      entryCount: store.entryCount(tokenId),
      entries: store.entries(tokenId).map(entryJson),
    });
  }

  // /entry/as-of/{instant}, /holder/as-of/{instant}, /finality/as-of/{instant}
  if (request.method === 'GET' && tail[1] === 'as-of' && tail.length === 3) {
    const instant = parseUint64(tail[2] ?? '');
    if (instant === undefined) return json(400, { error: 'MALFORMED_INSTANT' });

    switch (tail[0]) {
      case 'entry':
        return json(200, { tokenId: tokenId.toString(), instant: tail[2], entry: entryJson(store.entryAsOf(tokenId, instant)) });
      case 'holder': {
        const answer = store.holderAsOf(tokenId, instant);
        return json(200, {
          tokenId: tokenId.toString(),
          instant: tail[2],
          holder: answer.holder,
          provisional: answer.provisional,
        });
      }
      case 'finality':
        // Never reverts, and reports the open gap beside the answer without
        // mixing them: a gap does not decide finality either way.
        return json(200, {
          tokenId: tokenId.toString(),
          instant: tail[2],
          final: store.isFinalAsOf(tokenId, instant),
          openGap: gapOrNull(store, tokenId),
        });
      default:
        return json(404, { error: 'NOT_FOUND' });
    }
  }

  if (request.method === 'POST' && tail[0] === 'admission' && tail.length === 1) {
    const parsed = parseAdmission(request.body);
    if (parsed === undefined) return json(400, { error: 'MALFORMED_ENTRY', message: 'admission body is not well formed' });
    const result = store.admit(tokenId, parsed.entry, parsed.proof);
    return json(201, {
      tokenId: tokenId.toString(),
      entry: entryJson(result.entry),
      gapClosed: result.gapClosed,
      remoteHeight: result.remoteHeight.toString(),
    });
  }

  return json(404, { error: 'NOT_FOUND' });
};

const gapOrNull = (store: ProjectionStore, tokenId: bigint) => {
  const gap = store.openGapOf(tokenId);
  return gap === undefined ? null : gapJson(gap);
};

interface ParsedAdmission {
  readonly entry: CandidateEntry;
  readonly proof: ProofMaterial;
}

const parseAdmission = (body: unknown): ParsedAdmission | undefined => {
  if (typeof body !== 'object' || body === null) return undefined;
  const { entry, proof } = body as { entry?: unknown; proof?: unknown };
  if (typeof entry !== 'object' || entry === null) return undefined;
  if (typeof proof !== 'object' || proof === null) return undefined;

  const e = entry as Record<string, unknown>;
  const p = proof as Record<string, unknown>;

  const version = uint64(e['version']);
  const effectiveAt = uint64(e['effectiveAt']);
  const remoteHeight = uint64(p['remoteHeight']);
  if (version === undefined || effectiveAt === undefined || remoteHeight === undefined) return undefined;
  if (typeof p['profile'] !== 'string') return undefined;

  // The shape is checked here only far enough to build the candidate. Every
  // semantic rule is the kernel's to enforce, so the API cannot accidentally
  // become a second, weaker validator.
  const candidate = {
    version,
    effectiveAt,
    holder: e['holder'],
    recordCommitment: e['recordCommitment'],
    previousCommitment: e['previousCommitment'],
    registryReference: e['registryReference'],
  } as ProjectionEntry;

  const payload = p['payload'];
  return {
    entry: candidate,
    proof: {
      profile: p['profile'],
      remoteHeight,
      payload: (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>,
    },
  };
};

const uint64 = (value: unknown): bigint | undefined => {
  if (typeof value === 'string') return parseUint64(value);
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  return undefined;
};
