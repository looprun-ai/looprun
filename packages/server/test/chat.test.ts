import { PassThrough } from 'node:stream';
import { test, expect } from 'vitest';
import { TurnFailure } from '@looprun-ai/core';
import type { TurnRouting } from '@looprun-ai/core';
import type { GovernedResult } from '@looprun-ai/mastra';
import { startChat, type ChatAgent } from '../src/chat.js';

function reply(text: string, routing?: TurnRouting): GovernedResult {
  return { text, loopRun: {
    turn: 1, servedBy: 'counter', userText: 'hello', acts: [],
    questions: { issued: [], consumed: [], closed: [] },
    finish: null, corrections: [], text, closedBy: 'model',
    usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0, modelCalls: 1 },
    ...(routing !== undefined ? { routing } : {}) } };
}

function collect(stream: PassThrough): { text(): string } {
  let seen = '';
  stream.on('data', (chunk: Buffer) => { seen += chunk.toString(); });
  return { text: () => seen };
}

test('the REPL prints the header, the routing line and the reply, then exits on /exit', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const out = collect(output);
  const seen: string[] = [];
  const agent: ChatAgent = {
    generate: (text, opts) => {
      seen.push(text);
      expect(opts).toEqual({ session: 'chat' });
      return Promise.resolve(reply(`counting: ${text}`, { desk: 'counter', returned: null }));
    }
  };

  const done = startChat({ agent, name: 'northgate', deskNames: ['counter', 'billing'],
                           input, output });
  input.write('hello\n');
  input.write('/exit\n');
  await done;

  expect(seen).toEqual(['hello']);
  expect(out.text()).toContain('northgate · 2 desks: counter billing');
  expect(out.text()).toContain('[router → counter]');
  expect(out.text()).toContain('counting: hello');
});

test('a returned routing and a null desk print their own lines', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const out = collect(output);
  let call = 0;
  const agent: ChatAgent = {
    generate: () => {
      call += 1;
      if (call === 1) {
        return Promise.resolve(reply('handled after a hand-back',
          { desk: 'counter', returned: { by: 'billing', reason: 'not billing\'s work' } }));
      }
      return Promise.resolve(reply('nobody handles this', { desk: null, returned: null }));
    }
  };

  const done = startChat({ agent, name: 'northgate', deskNames: ['counter'], input, output });
  input.write('first\n');
  input.write('second\n');
  input.write('/exit\n');
  await done;

  expect(out.text()).toContain('[billing returned → counter]');
  expect(out.text()).toContain('[none]');
});

test('a returned message that ends at no desk still names who returned it', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const out = collect(output);
  const agent: ChatAgent = {
    generate: () => Promise.resolve(reply('no desk performs this',
      { desk: null, returned: { by: 'billing', reason: 'not billing\'s work' } }))
  };

  const done = startChat({ agent, name: 'northgate', deskNames: ['counter'], input, output });
  input.write('who handles this\n');
  input.write('/exit\n');
  await done;

  expect(out.text()).toContain('[billing returned → none]');
});

test('/desks prints the desk list; the underlying agent is never called', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const out = collect(output);
  let calls = 0;
  const agent: ChatAgent = { generate: () => { calls += 1; return Promise.resolve(reply('unused')); } };

  const done = startChat({ agent, name: 'northgate', deskNames: ['counter', 'billing'],
                           input, output });
  input.write('/desks\n');
  input.write('/exit\n');
  await done;

  expect(calls).toBe(0);
  expect(out.text()).toContain('counter billing');
});

test('a TurnFailure prints kind and detail and the loop continues', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const out = collect(output);
  let call = 0;
  const agent: ChatAgent = {
    generate: () => {
      call += 1;
      if (call === 1) throw new TurnFailure('network', 'the provider timed out');
      return Promise.resolve(reply('recovered'));
    }
  };

  const done = startChat({ agent, name: 'northgate', deskNames: ['counter'], input, output });
  input.write('first\n');
  input.write('second\n');
  input.write('/exit\n');
  await done;

  expect(out.text()).toContain('turn failed: network — the provider timed out');
  expect(out.text()).toContain('recovered');
  expect(call).toBe(2);
});

test('the chat door survives its input closing mid-turn', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const out = collect(output);
  const agent: ChatAgent = {
    generate: async (text) => {
      // The turn is still in flight when the piped input below reaches EOF and the
      // readline Interface closes itself on its own — the race this flag closes.
      await new Promise((r) => setTimeout(r, 0));
      return reply(`counting: ${text}`);
    }
  };

  const done = startChat({ agent, name: 'northgate', deskNames: ['counter'], input, output });
  input.write('hello\n');
  input.write('/exit\n');
  input.end();               // a piped input, not a kept-open TTY: EOF right after the lines

  await expect(done).resolves.toBeUndefined();
  expect(out.text()).toContain('counting: hello');
});

test('a record with no routing field prints no routing line', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const out = collect(output);
  const agent: ChatAgent = { generate: () => Promise.resolve(reply('desk-pinned reply')) };

  const done = startChat({ agent, name: 'concierge', deskNames: [], input, output });
  input.write('hi\n');
  input.write('/exit\n');
  await done;

  expect(out.text()).not.toContain('[');
  expect(out.text()).toContain('desk-pinned reply');
});
