import { test, expect } from 'vitest';
import type { TurnRecord } from '@looprun-ai/core';
import { toEnvelope, toSse } from '../src/wire.js';

const RECORD: TurnRecord = {
  turn: 1, servedBy: 'scripted', userText: 'is bk_9 confirmed?',
  acts: [], questions: { issued: [], consumed: [], closed: [] },
  finish: { message: 'bk_9 is confirmed for Tuesday.', report: [] },
  corrections: [], text: 'bk_9 is confirmed for Tuesday.', closedBy: 'model',
  delivery: { by: 'floor' as const, retried: false, facts: [] },
  usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0, modelCalls: 1 }
};

test('the envelope carries the delivery, estimated usage and the whole record', () => {
  const env = toEnvelope(RECORD, 'hotel');
  expect(env.object).toBe('chat.completion');
  expect(env.model).toBe('hotel');
  expect(env.choices[0].message.content).toContain('Tuesday');
  expect(env.usage.estimated).toBe(true);
  expect(env.usage.total_tokens).toBe(env.usage.prompt_tokens + env.usage.completion_tokens);
  expect(env.meta.loopRun.turn).toBe(1);
});

test('the SSE frames parse, end with DONE, and the closing chunk carries the record', () => {
  const frames = toSse(RECORD, 'hotel');
  expect(frames.at(-1)).toBe('data: [DONE]\n\n');
  const parsed = frames.slice(0, -1).map(f => JSON.parse(f.replace(/^data: /, '')) as {
    choices: [{ delta: Record<string, unknown>; finish_reason: string | null }];
    meta?: { loopRun: TurnRecord };
  });
  expect(parsed[0].choices[0].delta.role).toBe('assistant');
  expect(parsed[1].choices[0].delta.content).toContain('Tuesday');
  expect(parsed.at(-1)?.choices[0].finish_reason).toBe('stop');
  expect(parsed.at(-1)?.meta?.loopRun.text).toContain('Tuesday');
});
