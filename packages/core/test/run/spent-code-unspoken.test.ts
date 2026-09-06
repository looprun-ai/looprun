import { test, expect } from 'vitest';
import type { ModelStep, StepInput } from '../../src/contract/vocabulary.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { closeIds, closeWords, closingPort } from '../fixtures/close-step.js';
import { caseRig } from '../fixtures/case-rig.js';

// A code the operator already spent names nothing: sent again, the answer restates what the
// licensed act did and never carries the six digits back as if they were a fact.

const HELD_CANCEL = { disclosure: { cancelBooking: {
  needs: { booking: 'getBooking' },
  before: 'Cancelling room {booking.room} is permanent.',
  after: 'Cancelled room {booking.room}.'
} } };
const HELD_ROW = [{ tool: 'cancelBooking', target: 'bk_9', word: 'held' }];
const DONE_ROW = [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }];

/** A desk that pays its close from the instruction it read, reporting the act's true word. */
const pays = (input: StepInput): ModelStep => {
  const words = closeWords(input);
  return finishStep(`Closing. ${words}`, words.includes('Cancelled') ? DONE_ROW : HELD_ROW, closeIds(input));
};

test('a spent code sent again is answered without its digits', async () => {
  const port = closingPort([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep('Cancelled room 12.', DONE_ROW, ['F1']),
    ...Array.from({ length: 6 }, () =>
      finishStep('That confirmation was already answered — cancelled room 12.', [], ['F1']))
  ], input => pays(input));
  const { engine } = caseRig({ model: port, contract: HELD_CANCEL });

  const r1 = await engine.chat('s1', 'cancel booking bk_9');
  const code = r1.questions.issued[0].code;
  const r2 = await engine.chat('s1', code);
  const r3 = await engine.chat('s1', code);

  expect(r2.acts.some(a => a.origin === 'licence' && a.status === 'done')).toBe(true);
  expect(r3.acts.filter(a => a.effect !== 'read')).toEqual([]);
  const note = r3.delivery.facts.find(f => f.kind === 'note');
  expect(note?.text.startsWith('That confirmation was already answered')).toBe(true);
  expect(r3.delivery.facts.every(f => !f.text.includes(code))).toBe(true);
  expect(r3.text).not.toContain(code);
});
