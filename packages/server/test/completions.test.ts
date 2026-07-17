/** Ephemeral-port integration: a real HTTP round-trip through a governed turn — offline. */
import { afterEach, describe, expect, it } from 'vitest';
import type { ScriptStep } from '@looprun-ai/mastra/testing';
import { createModelServer } from '../src/index.js';
import type { ModelServer, TurnEvent } from '../src/index.js';
import { HAPPY_SCRIPT, makeAgent } from './helpers.js';

let server: ModelServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function startServer(script: ScriptStep[]) {
  const { agent, worlds } = makeAgent(script);
  const turns: TurnEvent[] = [];
  server = await createModelServer({
    agents: { 'fixture-agent': agent },
    onTurn: (event) => turns.push(event),
  });
  return { agent, worlds, turns, url: server.url };
}

function post(url: string, body: unknown): Promise<Response> {
  return fetch(`${url}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /v1/chat/completions — governed turn behind the facade', () => {
  it('returns the governed reply with usage and looprun metadata', async () => {
    const { url } = await startServer(HAPPY_SCRIPT);
    const res = await post(url, {
      model: 'fixture-agent',
      messages: [
        { role: 'system', content: 'You are HarnessBot with many rules.' },
        { role: 'user', content: 'find alpha' },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe('chat.completion');
    expect(body.choices[0].message).toEqual({ role: 'assistant', content: 'Found alpha.' });
    expect(body.choices[0].finish_reason).toBe('stop');
    expect(body.usage.total_tokens).toBeGreaterThan(0);
    expect(body.looprun.sessionId).toMatch(/^fp-/);
    expect(body.looprun.corrections).toEqual([]);
  });

  it('vetoes a guard violation inside the request and reports the correction', async () => {
    const { url, worlds, turns } = await startServer([
      [{ tool: 'updateItem', args: { id: 'i1', title: 'x' } }], // vetoed: requiresBefore(searchItem)
      [{ tool: 'searchItem', args: { query: 'i1' } }],
      [{ tool: 'updateItem', args: { id: 'i1', title: 'x' } }],
      [{ tool: 'replyToUser', args: { text: 'Updated i1.' } }],
    ]);
    const res = await post(url, { model: 'fixture-agent', messages: [{ role: 'user', content: 'update i1' }] });
    const body = await res.json();
    expect(body.choices[0].message.content).toBe('Updated i1.');
    expect(body.looprun.corrections).toContain('spatial:requiresBefore:updateItem');

    // The vetoed call never reached the world: the first world-visible updateItem comes AFTER searchItem.
    const world = worlds.get(body.looprun.sessionId)!;
    const domainCalls = world.toolCalls.map((c) => c.name);
    expect(domainCalls.indexOf('searchItem')).toBeLessThan(domainCalls.indexOf('updateItem'));
    expect(turns).toHaveLength(1);
    expect(turns[0]!.meta.observed.map((o) => `${o.name}:${o.ok}`)).toEqual([
      'updateItem:false',
      'searchItem:true',
      'updateItem:true',
      'replyToUser:true',
    ]);
  });

  it('keeps one session across requests sharing the first user message (fingerprint) and forks on a new one', async () => {
    const script: ScriptStep[] = [
      [{ tool: 'createItem', args: { title: 'alpha' } }],
      [{ tool: 'replyToUser', args: { text: 'Created alpha.' } }],
      [{ tool: 'listItems', args: {} }],
      [{ tool: 'replyToUser', args: { text: 'You have items.' } }],
      [{ tool: 'listItems', args: {} }],
      [{ tool: 'replyToUser', args: { text: 'Fresh session.' } }],
    ];
    const { url, turns } = await startServer(script);

    const first = await (await post(url, { model: 'fixture-agent', messages: [{ role: 'user', content: 'create alpha' }] })).json();
    const second = await (
      await post(url, {
        model: 'fixture-agent',
        messages: [
          { role: 'user', content: 'create alpha' },
          { role: 'assistant', content: 'Created alpha.' },
          { role: 'user', content: 'list my items' },
        ],
      })
    ).json();
    expect(second.looprun.sessionId).toBe(first.looprun.sessionId);
    expect(turns.map((t) => t.meta.turnIndex)).toEqual([0, 1]);

    const third = await (await post(url, { model: 'fixture-agent', messages: [{ role: 'user', content: 'hello again' }] })).json();
    expect(third.looprun.sessionId).not.toBe(first.looprun.sessionId);
    expect(turns[2]!.meta.turnIndex).toBe(0); // fresh session, fresh world
  });

  it('honors the explicit session header over the fingerprint', async () => {
    const { url } = await startServer(HAPPY_SCRIPT);
    const res = await fetch(`${url}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-looprun-session': 'conv-42' },
      body: JSON.stringify({ model: 'fixture-agent', messages: [{ role: 'user', content: 'find alpha' }] }),
    });
    expect((await res.json()).looprun.sessionId).toBe('conv-42');
  });
});
