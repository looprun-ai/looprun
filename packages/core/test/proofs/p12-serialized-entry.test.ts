import { test, expect } from 'vitest';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { testEngine } from '../fixtures/compiled-agents.js';

// P12 · R8.3 — two concurrent chat calls on one session serialize; the second turn
// sees the first's sealed record, never a torn draft.
test('two concurrent chats on one session serialize in arrival order', async () => {
  const model = new ScriptedModel([
    callStep('getBooking', { id: 'bk_1001' }),
    finishStep('First done.'),
    finishStep('Second done.')
  ]);
  const { engine } = testEngine({ model });

  const [r1, r2] = await Promise.all([
    engine.chat('s1', 'first message'),
    engine.chat('s1', 'second message')
  ]);

  expect(r1.turn).toBe(1);
  expect(r2.turn).toBe(2);
  expect(r1.finish?.message).toBe('First done.');
  expect(r2.finish?.message).toBe('Second done.');
  const lastInput = model.seen.at(-1);
  if (!lastInput) throw new Error('the model never served turn 2');
  // Turn 2 re-reads turn 1 as the model's OWN memory: the prose plus every settled
  // act sentence — never the operator's slimmed delivery.
  expect(lastInput.messages.some(m => m.role === 'assistant'
    && m.text.startsWith('First done.')
    && m.text.includes(r1.acts[0].sentence))).toBe(true);
});
