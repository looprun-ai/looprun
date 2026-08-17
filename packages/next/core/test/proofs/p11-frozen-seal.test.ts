import { test, expect } from 'vitest';
import type { Act, InputCtx } from '../../src/contract/vocabulary.js';
import { ScriptedModel, callStep, finishStep } from '../fixtures/scripted-model.js';
import { install, testEngine } from '../fixtures/compiled-agents.js';

// P11 · R2.9 — the sealed TurnRecord and every ctx travel deep-frozen (mutation
// throws); sealed history is shared by reference across turns.
test('the sealed record is deep-frozen and mutation throws', async () => {
  const model = new ScriptedModel([
    callStep('getBooking', { id: 'bk_1001' }),
    finishStep('Found it.')
  ]);
  const { engine } = testEngine({ model });

  const r = await engine.chat('s1', 'check booking bk_1001');

  expect(Object.isFrozen(r)).toBe(true);
  expect(Object.isFrozen(r.acts)).toBe(true);
  expect(Object.isFrozen(r.acts[0])).toBe(true);
  expect(Object.isFrozen(r.acts[0].call.args)).toBe(true);
  expect(() => { (r.acts as Act[]).push(r.acts[0]); }).toThrow();
});

test('the guard ctx is frozen and carries the prior turn acts by reference', async () => {
  const box: { ctx: InputCtx | null } = { ctx: null };
  const capture = install(
    { name: 'capture', rule: 'Observes the ctx.', on: 'input',
      deny: ctx => { box.ctx = ctx; return null; } },
    'spec', 'custom');
  const model = new ScriptedModel([
    callStep('getBooking', { id: 'bk_1001' }),
    finishStep('Found it.'),
    finishStep('Nothing more to do.')
  ]);
  const { engine } = testEngine({ model, guards: [capture] });

  const r1 = await engine.chat('s1', 'check booking bk_1001');
  await engine.chat('s1', 'thanks');

  const ctx = box.ctx;
  if (ctx === null) throw new Error('the input guard never ran');
  expect(Object.isFrozen(ctx)).toBe(true);
  expect(ctx.pastActs).toHaveLength(1);
  expect(ctx.pastActs[0]).toBe(r1.acts[0]);
});
