/** Bare fetch-style handler: routing, validation and error mapping — no socket, no agent turn. */
import { describe, expect, it } from 'vitest';
import { createOpenAiHandler, DEFAULT_CONTEXT_LENGTH } from '../src/index.js';
import { HAPPY_SCRIPT, makeAgent } from './helpers.js';

const BASE = 'http://server.test';

function makeHandler(extra: Record<string, unknown> = {}) {
  const { agent } = makeAgent(HAPPY_SCRIPT);
  return createOpenAiHandler({ agents: { 'fixture-agent': agent }, ...extra });
}

function completionsReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('createOpenAiHandler — routing and validation', () => {
  it('lists registered agents as models with the context_length extension', async () => {
    const res = await makeHandler()(new Request(`${BASE}/v1/models`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe('list');
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: 'fixture-agent', object: 'model', owned_by: 'looprun' });
    expect(body.data[0].context_length).toBe(DEFAULT_CONTEXT_LENGTH);
  });

  it('404s an unknown model in OpenAI error shape', async () => {
    const res = await makeHandler()(completionsReq({ model: 'nope', messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('model_not_found');
    expect(body.error.type).toBe('invalid_request_error');
  });

  it('400s malformed JSON', async () => {
    const res = await makeHandler()(completionsReq('{not json'));
    expect(res.status).toBe(400);
    expect((await res.json()).error.type).toBe('invalid_request_error');
  });

  it('400s a request with no user message text', async () => {
    const res = await makeHandler()(
      completionsReq({ model: 'fixture-agent', messages: [{ role: 'system', content: 'harness prompt' }] }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.param).toBe('messages');
  });

  it('enforces the bearer key on every route when apiKey is set', async () => {
    const handler = makeHandler({ apiKey: 's3cret' });
    const denied = await handler(new Request(`${BASE}/v1/models`));
    expect(denied.status).toBe(401);
    expect((await denied.json()).error.code).toBe('invalid_api_key');
    const granted = await handler(new Request(`${BASE}/v1/models`, { headers: { authorization: 'Bearer s3cret' } }));
    expect(granted.status).toBe(200);
  });

  it('404s unknown paths', async () => {
    const res = await makeHandler()(new Request(`${BASE}/v1/embeddings`, { method: 'POST', body: '{}' }));
    expect(res.status).toBe(404);
  });
});
