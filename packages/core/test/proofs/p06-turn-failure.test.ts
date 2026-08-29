import { test, expect } from 'vitest';
import { TurnFailure, CardError } from '../../src/contract/vocabulary.js';
import { ModelSeat } from '../../src/run/model-seat.js';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { scriptedTargets, testEngine } from '../fixtures/compiled-agents.js';

// P6 · R2.10 — a TurnFailure mid-turn discards the draft: zero partial acts sealed,
// clean retry. The seat reroutes between attempts only.
test('a mid-turn failure seals nothing; the retry starts clean on the next target', async () => {
  const model = new ScriptedModel([
    callStep('getBooking', { id: 'bk_1' }),
    new TurnFailure('network', 'connection reset mid-turn'),
    callStep('getBooking', { id: 'bk_1' }),
    finishStep('Booking bk_1 found.')
  ]);
  const { engine } = testEngine({
    model,
    targets: scriptedTargets(2),
    choice: { targets: ['scripted-1', 'scripted-2'], strategy: 'sequential' }
  });

  await expect(engine.chat('s1', 'check bk_1')).rejects.toBeInstanceOf(TurnFailure);

  const r = await engine.chat('s1', 'check bk_1');
  expect(r.turn).toBe(1);
  expect(r.servedBy).toBe('scripted-2');
  expect(r.acts).toHaveLength(1);
  expect(r.finish?.message).toBe('Booking bk_1 found.');
});

test('an uncertified target cannot enter the seat', () => {
  const targets = [{ id: 'wild', provider: 'x', keyEnv: null, tier: 'cloud' as const, certified: false }];
  expect(() => ModelSeat.create(targets, 'wild', () => new ScriptedModel([])))
    .toThrow(CardError);
});

test('a local-tier target turns on the brakes: pinned decoding, hard output cap', async () => {
  const model = new ScriptedModel([finishStep('Nothing to do.')]);
  const { engine } = testEngine({
    model,
    targets: [{ id: 'llama-local', provider: 'llamacpp', keyEnv: null,
                tier: { local: 'qwen' }, certified: true }],
    choice: 'llama-local'
  });

  await engine.chat('s1', 'hello');

  expect(model.seen[0].llmParams.temperature).toBe(0);
  expect(model.seen[0].llmParams.maxOutputTokens).toBe(2048);
});
