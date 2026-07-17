/** SSE contract: role delta → keepalive-safe stream → one content delta → finish → [DONE]. */
import { describe, expect, it } from 'vitest';
import { createOpenAiHandler } from '../src/index.js';
import { HAPPY_SCRIPT, makeAgent } from './helpers.js';

function parseSse(raw: string): { chunks: Array<Record<string, any>>; done: boolean; comments: number } {
  const chunks: Array<Record<string, any>> = [];
  let done = false;
  let comments = 0;
  for (const line of raw.split('\n')) {
    if (line.startsWith(':')) comments++;
    else if (line === 'data: [DONE]') done = true;
    else if (line.startsWith('data: ')) chunks.push(JSON.parse(line.slice(6)));
  }
  return { chunks, done, comments };
}

describe('stream: true', () => {
  it('emits a valid single-delta SSE stream carrying the governed reply', async () => {
    const { agent } = makeAgent(HAPPY_SCRIPT);
    const handler = createOpenAiHandler({ agents: { 'fixture-agent': agent } });
    const res = await handler(
      new Request('http://server.test/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'fixture-agent', stream: true, messages: [{ role: 'user', content: 'find alpha' }] }),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const { chunks, done } = parseSse(await res.text());
    expect(done).toBe(true);
    expect(chunks.length).toBe(3);
    expect(chunks[0]!.object).toBe('chat.completion.chunk');
    expect(chunks[0]!.choices[0].delta.role).toBe('assistant');
    expect(chunks[1]!.choices[0].delta.content).toBe('Found alpha.');
    expect(chunks[2]!.choices[0].finish_reason).toBe('stop');
    expect(chunks[2]!.usage.total_tokens).toBeGreaterThan(0);
    expect(chunks[2]!.looprun.sessionId).toMatch(/^fp-/);
  });

  it('streams an OpenAI-shaped error event when the turn fails', async () => {
    const { agent } = makeAgent(HAPPY_SCRIPT);
    agent.generate = async () => {
      throw new Error('turn exploded');
    };
    const handler = createOpenAiHandler({ agents: { 'fixture-agent': agent } });
    const res = await handler(
      new Request('http://server.test/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'fixture-agent', stream: true, messages: [{ role: 'user', content: 'boom' }] }),
      }),
    );
    const { chunks, done } = parseSse(await res.text());
    expect(done).toBe(false);
    const errorEvent = chunks.find((c) => c.error);
    expect(errorEvent?.error.message).toBe('turn exploded');
  });
});
