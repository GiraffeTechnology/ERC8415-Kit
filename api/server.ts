import { createServer, type Server } from 'node:http';
import { handle, type ApiRequest } from './routes.ts';
import type { ProjectionStore } from '../engine/projection/store.ts';

/**
 * Requests are bounded before they are parsed, so an oversized body is
 * refused rather than buffered. Ported from the body-limit middleware in the
 * closed codex/stage6-infrastructure branch, which had this right.
 */
export const DEFAULT_BODY_LIMIT = 64 * 1024;

/**
 * Thin transport around the route table. The routing and every semantic
 * decision live in routes.ts, so the same behaviour is exercised by the suite
 * without a socket.
 */
export const createApi = (store: ProjectionStore, bodyLimit = DEFAULT_BODY_LIMIT): Server =>
  createServer((incoming, outgoing) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let refused = false;

    incoming.on('data', (chunk: Buffer) => {
      if (refused) return;
      size += chunk.length;
      if (size > bodyLimit) {
        refused = true;
        outgoing.writeHead(413, { 'content-type': 'application/json' });
        outgoing.end(JSON.stringify({ error: 'BODY_TOO_LARGE' }));
        incoming.destroy();
        return;
      }
      chunks.push(chunk);
    });

    incoming.on('end', () => {
      if (refused) return;
      const raw = Buffer.concat(chunks).toString('utf8');
      let body: unknown;
      if (raw.length > 0) {
        try {
          body = JSON.parse(raw);
        } catch {
          outgoing.writeHead(400, { 'content-type': 'application/json' });
          outgoing.end(JSON.stringify({ error: 'MALFORMED_JSON' }));
          return;
        }
      }

      const url = new URL(incoming.url ?? '/', 'http://api.invalid');
      const request: ApiRequest = {
        method: incoming.method ?? 'GET',
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        ...(body === undefined ? {} : { body }),
      };

      const response = handle(store, request);
      outgoing.writeHead(response.status, { 'content-type': 'application/json' });
      outgoing.end(JSON.stringify(response.body));
    });
  });
