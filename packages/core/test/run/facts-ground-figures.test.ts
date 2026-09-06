import { test, expect } from 'vitest';
import { finishStep, payingDesk } from '../fixtures/scripted-model.js';
import { caseRig } from '../fixtures/case-rig.js';

// A figure the contract's own facts state — a reference date, a currency, a ceiling — was
// handed to the desk by the engine: a reply that repeats it states nothing the records do
// not carry.

test('a figure stated in a contract fact grounds the reply that repeats it', async () => {
  const model = payingDesk([finishStep('The reference date here is 2026-07-01, so June is last month.', [])]);
  const { engine } = caseRig({ model,
    contract: { facts: ['The reference date in this workspace is 2026-07-01.'] } });

  const r = await engine.chat('s1', 'what month was last month?');

  expect(r.corrections.some(c => c.kind === 'redrive' && c.guardName === 'figureIsGrounded')).toBe(false);
  expect(r.text).toContain('2026-07-01');
});

test('a figure no fact and no record carries is still refused', async () => {
  const model = payingDesk([finishStep('The reference date here is 2031-01-01.', []),
    finishStep('I cannot say which month that was.', [])]);
  const { engine } = caseRig({ model,
    contract: { facts: ['The reference date in this workspace is 2026-07-01.'] } });

  const r = await engine.chat('s1', 'what month was last month?');

  expect(r.corrections.some(c => c.kind === 'redrive' && c.guardName === 'figureIsGrounded')).toBe(true);
});
