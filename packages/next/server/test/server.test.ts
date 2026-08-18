import { test, expect } from 'vitest';
import type { AgentSpec, ModelStep, TurnRecord } from '@looprun-ai/next-core';
import { world } from '@looprun-ai/next-core';
import { LoopRunAgent } from '@looprun-ai/next-mastra';
import { Server } from '../src/server.js';

const BOOKING = world({
  records: { bookings: { bk_9: { status: 'CONFIRMED', day: 'Tuesday' } } },
  reads: { getBooking: { form: 'get', entity: 'bookings', label: 'Look up the booking' } }
});
const SPEC: AgentSpec = { name: 'hotel', persona: 'You are the hotel desk.' };

const finishStep = (message: string): ModelStep =>
  ({ calls: [{ tool: 'finish', args: { message, report: [] } }], text: '' });

function agentWith(steps: readonly ModelStep[]): LoopRunAgent {
  return new LoopRunAgent({ spec: SPEC, model: { scripted: { steps } }, world: BOOKING });
}

async function post(url: string, key: string | null, body: unknown): Promise<Response> {
  return fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json',
               ...(key === null ? {} : { authorization: `Bearer ${key}` }) },
    body: JSON.stringify(body)
  });
}

const turnBody = (session: string, text = 'hi') =>
  ({ model: 'hotel', session, messages: [{ role: 'user', content: text }] });

test('models list, envelope, 401 and 404 — the whole non-stream wire', async () => {
  const server = await Server.start({
    agents: { hotel: agentWith([finishStep('Hello from the desk.')]) },
    auth: { apiKeys: ['k1'] }
  });
  try {
    const models = await fetch(`${server.url}/v1/models`,
      { headers: { authorization: 'Bearer k1' } });
    expect(models.status).toBe(200);
    expect(JSON.stringify(await models.json())).toContain('"hotel"');

    expect((await post(server.url, null, turnBody('s1'))).status).toBe(401);
    expect((await post(server.url, 'k1', { ...turnBody('s1'), model: 'ghost' })).status).toBe(404);

    const ok = await post(server.url, 'k1', turnBody('s1'));
    expect(ok.status).toBe(200);
    const env = await ok.json() as { choices: [{ message: { content: string } }];
      usage: { estimated: boolean }; meta: { loopRun: TurnRecord } };
    expect(env.choices[0].message.content).toContain('Hello');
    expect(env.usage.estimated).toBe(true);
    expect(env.meta.loopRun.turn).toBe(1);
  } finally { await server.close(); }
});

test('the same caller session under two credentials never merges', async () => {
  const server = await Server.start({
    agents: { hotel: agentWith([finishStep('one'), finishStep('two'), finishStep('three')]) },
    auth: { apiKeys: ['k1', 'k2'] }
  });
  try {
    await post(server.url, 'k1', turnBody('shared'));
    const other = await post(server.url, 'k2', turnBody('shared'));
    const env = await other.json() as { meta: { loopRun: TurnRecord } };
    expect(env.meta.loopRun.turn).toBe(1);
  } finally { await server.close(); }
});

test('a failed turn is a typed HTTP failure, never a 200', async () => {
  const server = await Server.start({
    agents: { hotel: agentWith([]) },       // the script runs dry on the first step
    auth: { apiKeys: ['k1'] }
  });
  try {
    const failed = await post(server.url, 'k1', turnBody('s1'));
    expect(failed.status).toBe(502);
    const body = await failed.json() as { error: { type: string; message: string } };
    expect(body.error.type).toContain('turn_failure');
  } finally { await server.close(); }
});

test('stream: true answers SSE of the COMPLETED turn ending in DONE', async () => {
  const server = await Server.start({
    agents: { hotel: agentWith([finishStep('Streamed hello.')]) },
    auth: { apiKeys: ['k1'] }
  });
  try {
    const res = await post(server.url, 'k1', { ...turnBody('s1'), stream: true });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const raw = await res.text();
    expect(raw.trim().endsWith('data: [DONE]')).toBe(true);
    expect(raw).toContain('Streamed hello.');
  } finally { await server.close(); }
});

test('the TTL sweep ends idle sessions — the next turn starts fresh', async () => {
  const server = await Server.start({
    agents: { hotel: agentWith([finishStep('a'), finishStep('b'), finishStep('c')]) },
    auth: { apiKeys: ['k1'] },
    sessionTtlMs: 60
  });
  try {
    await post(server.url, 'k1', turnBody('s1'));
    await new Promise(resolve => setTimeout(resolve, 250));
    const later = await post(server.url, 'k1', turnBody('s1'));
    const env = await later.json() as { meta: { loopRun: TurnRecord } };
    expect(env.meta.loopRun.turn).toBe(1);
  } finally { await server.close(); }
});
