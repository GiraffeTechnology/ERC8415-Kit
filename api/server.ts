import { createServer, type Server } from 'node:http';
import { handle, type ApiRequest } from './routes.ts';
import type { ProjectionStore } from '../engine/projection/store.ts';

/**
 * Thin transport around the route table. The routing and every semantic
 * decision live in routes.ts, so the same behaviour is exercised by the suite
 * without a socket.
 */
export const createApi = (store: ProjectionStore): Server =>
  createServer((incoming, outgoing) => {
    const chunks: Buffer[] = [];
    incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
    incoming.on('end', () => {
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

      const request: ApiRequest = {
        method: incoming.method ?? 'GET',
        path: (incoming.url ?? '/').split('?')[0] ?? '/',
        ...(body === undefined ? {} : { body }),
      };

      const response = handle(store, request);
      outgoing.writeHead(response.status, { 'content-type': 'application/json' });
      outgoing.end(JSON.stringify(response.body));
    });
  });
