import { test, expect } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import type { Act, ProviderOptions, StepInput } from '@looprun-ai/core';
import { TurnFailure } from '@looprun-ai/core';
import { MastraModelPort } from '../src/mastra-model-port.js';

type MockCtor = ConstructorParameters<typeof MockLanguageModelV3>[0];
type DoGenerate = Extract<NonNullable<NonNullable<MockCtor>['doGenerate']>, (...a: never[]) => unknown>;
type GenOpts = Parameters<DoGenerate>[0];
type GenResult = Awaited<ReturnType<DoGenerate>>;

const USAGE: GenResult['usage'] = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined }
};

function mock(onCapture: (o: GenOpts) => void,
              content: GenResult['content'] = [{ type: 'text', text: 'ok' }]) {
  return new MockLanguageModelV3({
    doGenerate: (opts) => {
      onCapture(opts);
      return Promise.resolve({ finishReason: { unified: 'stop' as const, raw: undefined },
        usage: USAGE, content, warnings: [] });
    }
  });
}

const ACT: Act = {
  id: 'a1', turn: 1, origin: 'model', guard: null,
  call: { tool: 'getBooking', args: { id: 'bk_9' }, key: 'getBooking|{"id":"bk_9"}' },
  effect: 'read', said: 'yes', status: 'done', reason: null, evidence: 'executor',
      owed: null,
  sentence: 'getBooking — done', result: { status: 'CONFIRMED', day: 'Tuesday' },
  questionId: null
};

const CARD = { name: 'getBooking', does: 'Reads one booking.',
  schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } };
const FINISH = { name: 'finish', does: 'Closes the turn.',
  schema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } };

function input(over: Partial<StepInput> = {}): StepInput {
  return { system: 'You are the desk.',
    messages: [{ role: 'user', text: 'is bk_9 confirmed?' }],
    tools: [CARD, FINISH], forceFinish: false, llmParams: {}, ...over };
}

test('acts replay the provider\'s OWN assistant message; without one they ride as record lines', async () => {
  let seen: GenOpts | null = null;
  const port = new MastraModelPort(mock(o => { seen = o; }, [
    { type: 'tool-call', toolCallId: 'prov_1', toolName: 'getBooking',
      input: JSON.stringify({ id: 'bk_9' }) }
  ]), {});
  // Step 1: the model makes the call — the port caches the provider's assistant message.
  await port.step(input());
  // Step 2: the engine's acts message for that call replays the ORIGINAL parts.
  await port.step(input({ messages: [
    { role: 'user', text: 'is bk_9 confirmed?' },
    { role: 'acts', acts: [ACT] }
  ] }));
  const prompt = (seen as unknown as GenOpts).prompt;
  expect(prompt.map(m => m.role)).toEqual(['system', 'user', 'assistant', 'tool']);
  const flat = JSON.stringify(prompt);
  expect(flat).toContain('prov_1');
  expect(flat).toContain('"tool-result"');
  expect(flat).toContain('Tuesday');
  expect(flat).not.toContain('TOOL RESULTS');

  // A fresh port has no original message — the acts ride as a record line, never
  // a signature-less synthetic functionCall.
  let cold: GenOpts | null = null;
  await new MastraModelPort(mock(o => { cold = o; }), {}).step(input({ messages: [
    { role: 'user', text: 'is bk_9 confirmed?' },
    { role: 'acts', acts: [ACT] }
  ] }));
  const coldPrompt = (cold as unknown as GenOpts).prompt;
  expect(coldPrompt.map(m => m.role)).toEqual(['system', 'user', 'user']);
  expect(JSON.stringify(coldPrompt)).toContain('[record]');
});

test('a model tool call comes back as a RawCall; text comes back as text', async () => {
  const port = new MastraModelPort(mock(() => {}, [
    { type: 'tool-call', toolCallId: 'c1', toolName: 'getBooking', input: JSON.stringify({ id: 'bk_9' }) }
  ]), {});
  const step = await port.step(input());
  expect(step.calls).toEqual([{ tool: 'getBooking', args: { id: 'bk_9' } }]);
});

test('forceFinish forces the finish card by name through toolChoice', async () => {
  let seen: GenOpts | null = null;
  const port = new MastraModelPort(mock(o => { seen = o; }), {});
  await port.step(input({ forceFinish: true }));
  expect((seen as unknown as GenOpts).toolChoice).toMatchObject({ type: 'tool', toolName: 'finish' });
});

test('llmParams verifiably reach the provider call', async () => {
  let seen: GenOpts | null = null;
  const port = new MastraModelPort(mock(o => { seen = o; }), { temperature: 0.1, maxOutputTokens: 64 });
  await port.step(input());
  expect((seen as unknown as GenOpts).temperature).toBe(0.1);
  expect((seen as unknown as GenOpts).maxOutputTokens).toBe(64);
});

// What a local llama.cpp target declares in packages/models. The port never spells
// the field itself — it forwards the declaration.
const LOCAL_LLAMACPP: ProviderOptions = { llamacpp: { cache_prompt: true } };

test('a local target asks for the prompt cache on EVERY call — opening, redrive, close', async () => {
  const seen: GenOpts[] = [];
  const port = new MastraModelPort(mock(o => { seen.push(o); }), {}, LOCAL_LLAMACPP);
  await port.step(input());
  await port.step(input({ messages: [
    { role: 'user', text: 'is bk_9 confirmed?' },
    { role: 'acts', acts: [ACT] }
  ] }));
  await port.step(input({ forceFinish: true }));
  expect(seen).toHaveLength(3);
  for (const opts of seen) {
    expect(opts.providerOptions?.llamacpp).toEqual({ cache_prompt: true });
  }
});

test('a cloud target carries no cache_prompt — the flag rides local llama.cpp alone', async () => {
  let seen: GenOpts | null = null;
  const port = new MastraModelPort(mock(o => { seen = o; }), {});
  await port.step(input());
  const opts = seen as unknown as GenOpts;
  expect(JSON.stringify(opts.providerOptions ?? {})).not.toContain('cache_prompt');
  expect(opts.providerOptions?.google).toEqual({ thinkingConfig: { thinkingBudget: 0 } });
});

test('a target\'s own namespace survives the engine\'s: both fields ride, neither erases', async () => {
  let seen: GenOpts | null = null;
  const port = new MastraModelPort(mock(o => { seen = o; }), {},
    { google: { safetySettings: 'BLOCK_NONE' } });
  await port.step(input());
  expect((seen as unknown as GenOpts).providerOptions?.google).toEqual({
    safetySettings: 'BLOCK_NONE',
    thinkingConfig: { thinkingBudget: 0 }
  });
});

test('the thinking-on preset spends thought and still carries the target\'s own options', async () => {
  let seen: GenOpts | null = null;
  const port = new MastraModelPort(mock(o => { seen = o; }), { preset: 'gemini:thinking-on' },
    { google: { safetySettings: 'BLOCK_NONE' } });
  await port.step(input());
  const opts = seen as unknown as GenOpts;
  expect(opts.providerOptions?.google).toEqual({ safetySettings: 'BLOCK_NONE' });
  expect(JSON.stringify(opts.providerOptions ?? {})).not.toContain('cache_prompt');
});

test('a provider error rejects as TurnFailure with a single-line detail', async () => {
  const boom = new MockLanguageModelV3({
    doGenerate: () => Promise.reject(new Error('upstream exploded\n    at deep.stack (x.js:1)'))
  });
  const port = new MastraModelPort(boom, {});
  const failed = await port.step(input()).catch((e: unknown) => e);
  expect(failed).toBeInstanceOf(TurnFailure);
  expect((failed as TurnFailure).kind).toBe('network');
  expect((failed as TurnFailure).detail).not.toContain('\n');
  expect((failed as TurnFailure).detail).not.toContain('at deep.stack');
});
