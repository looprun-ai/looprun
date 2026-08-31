import { test, expect } from 'vitest';
import { callStep, finishStep, payingDesk } from '../fixtures/scripted-model.js';
import { testEngine } from '../fixtures/compiled-agents.js';

// P12 · R8.3 — two concurrent chat calls on one session serialize; the second turn
// sees the first's sealed record, never a torn draft.
test('two concurrent chats on one session serialize in arrival order', async () => {
  const model = payingDesk([
    callStep('getBooking', { id: 'bk_1001' }),
    finishStep('First done.'),
    { calls: [], text: '' },
    { calls: [], text: '' },
    finishStep('Second done.')
  ]);
  const { engine } = testEngine({ model });

  const [r1, r2] = await Promise.all([
    engine.chat('s1', 'first message'),
    engine.chat('s1', 'second message')
  ]);

  expect(r1.turn).toBe(1);
  expect(r2.turn).toBe(2);
  expect(r1.finish?.message.startsWith('First done.')).toBe(true);
  expect(r2.finish?.message.startsWith('Second done.')).toBe(true);
  const lastInput = model.seen.at(-1);
  if (!lastInput) throw new Error('the model never served turn 2');
  expect(lastInput.messages.some(m => m.role === 'assistant' && m.text.startsWith(r1.text))).toBe(true);
});
