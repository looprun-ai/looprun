/**
 * node:http adapter around the fetch-style handler — no framework (the surface is two routes;
 * WHATWG Request/Response are native on Node >= 22).
 */
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { createOpenAiHandler } from './handler.js';
import { SessionLocks, SessionTtl } from './session.js';
import type { ModelServer, ModelServerConfig } from './types.js';

function toRequest(req: IncomingMessage, base: string): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) for (const v of value) headers.append(key, v);
  }
  const method = req.method ?? 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : (Readable.toWeb(req) as ReadableStream<Uint8Array>);
  return new Request(new URL(req.url ?? '/', base), {
    method,
    headers,
    body,
    // Node requires this flag for streamed request bodies.
    ...( body ? { duplex: 'half' } : {}),
  } as RequestInit);
}

async function writeResponse(res: Response, out: ServerResponse): Promise<void> {
  out.statusCode = res.status;
  res.headers.forEach((value, key) => out.setHeader(key, value));
  if (res.body) {
    for await (const chunk of Readable.fromWeb(res.body as import('node:stream/web').ReadableStream<Uint8Array>)) {
      out.write(chunk);
    }
  }
  out.end();
}

export async function createModelServer(config: ModelServerConfig): Promise<ModelServer> {
  const locks = new SessionLocks();
  const ttl = new SessionTtl();
  const handler = createOpenAiHandler(config, { locks, ttl });

  let sweeper: NodeJS.Timeout | undefined;
  if (config.sessionTtlMs && config.sessionTtlMs > 0) {
    const ttlMs = config.sessionTtlMs;
    sweeper = setInterval(() => {
      for (const expired of ttl.sweep(ttlMs)) {
        config.agents[expired.model]?.endSession(expired.sessionId);
      }
    }, Math.min(ttlMs, 60_000));
    sweeper.unref();
  }

  const hostname = config.hostname ?? '127.0.0.1';
  let port = config.port ?? 0;
  const server: Server = createServer((req, res) => {
    const base = `http://${hostname}:${port}`;
    void handler(toRequest(req, base))
      .then((response) => writeResponse(response, res))
      .catch((error) => {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: { message: String(error), type: 'api_error', param: null, code: 'api_error' } }));
      });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, hostname, () => resolve());
  });
  const address = server.address();
  if (address && typeof address === 'object') port = address.port;

  return {
    url: `http://${hostname}:${port}/v1`,
    port,
    handler,
    close: () =>
      new Promise<void>((resolve, reject) => {
        if (sweeper) clearInterval(sweeper);
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
