/** The OpenAI facade over governed agents: GET /v1/models + POST /v1/chat/completions.
 *  Authentication is REQUIRED by the type — secure-by-omission is unrepresentable.
 *  A failed turn is an HTTP failure with a typed body, never a 200, in stream and
 *  non-stream shapes alike. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { TurnFailure } from '@looprun-ai/core';
import type { LoopRunAgent, RoutedAgent } from '@looprun-ai/mastra';
import { toEnvelope, toSse } from './wire.js';
import { WireSessions } from './wire-sessions.js';

export type ServerConfig = {
  readonly agents: Readonly<Record<string, LoopRunAgent | RoutedAgent>>;
  readonly auth: { readonly apiKeys: readonly string[] } | { readonly auth: 'disabled' };
  readonly port?: number;
  readonly bind?: string;
  readonly sessionTtlMs?: number;
};

const BODY_CAP = 1_048_576;

interface WireBody { model?: string; messages?: { role?: string; content?: unknown }[];
                     stream?: boolean; session?: string; user?: string }

function fail(res: ServerResponse, status: number, type: string, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { type, message } }));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_CAP) reject(new Error('body too large'));
      else chunks.push(chunk);
    });
    req.on('end', () => { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

export class WireHandler {
  private readonly cfg: ServerConfig;
  readonly sessions = new WireSessions();

  constructor(cfg: ServerConfig) {
    this.cfg = cfg;
  }

  /** null = not authenticated; otherwise the credential's hash — the session lane key. */
  private credential(req: IncomingMessage): string | null {
    if ('auth' in this.cfg.auth) return 'open';
    const header = req.headers.authorization ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!this.cfg.auth.apiKeys.includes(presented)) return null;
    return createHash('sha256').update(presented).digest('hex');
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const credential = this.credential(req);
    if (credential === null) { fail(res, 401, 'authentication_error', 'a valid api key is required'); return; }

    if (req.method === 'GET' && req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ object: 'list',
        data: Object.keys(this.cfg.agents).map(id =>
          ({ id, object: 'model', owned_by: 'looprun' })) }));
      return;
    }

    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      fail(res, 404, 'not_found', 'the routes are GET /v1/models and POST /v1/chat/completions');
      return;
    }

    let body: WireBody;
    try {
      body = JSON.parse(await readBody(req)) as WireBody;
    } catch {
      fail(res, 400, 'invalid_request', 'the body must be a json chat completion request');
      return;
    }
    const agent = body.model !== undefined ? this.cfg.agents[body.model] : undefined;
    if (!agent) { fail(res, 404, 'model_not_found', `no agent is named '${body.model ?? ''}'`); return; }
    const lastUser = [...(body.messages ?? [])].reverse().find(m => m.role === 'user');
    if (!lastUser || typeof lastUser.content !== 'string') {
      fail(res, 400, 'invalid_request', 'the last user message must carry string content');
      return;
    }

    const session = this.sessions.resolve(credential, body.session ?? body.user ?? 'default');
    try {
      const out = await agent.generate(lastUser.content, { session });
      if (body.stream === true) {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
        for (const frame of toSse(out.loopRun, body.model ?? '')) res.write(frame);
        res.end();
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(toEnvelope(out.loopRun, body.model ?? '')));
      }
    } catch (e: unknown) {
      if (e instanceof TurnFailure) fail(res, 502, `turn_failure:${e.kind}`, e.detail);
      else fail(res, 500, 'internal_error', 'the turn failed before sealing');
    }
  }
}
