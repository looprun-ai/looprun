/** The close request states the turn's facts ONCE. The desk is asked to close with a
 *  numbered list of what the turn did; that list is built after the calls ran, and it
 *  is the only numbering in the request — a second list under the same labels makes
 *  F1 name two different facts in one prompt, and ships a live approval code under
 *  two labels. */
import { test, expect } from 'vitest';
import type { StepInput, TurnRecord } from '../../src/contract/vocabulary.js';
import { payingDesk, callStep, finishStep } from '../fixtures/scripted-model.js';
import { fact, testEngine } from '../fixtures/compiled-agents.js';

const CONSENT_FACTS = { tools: {
  cancelBooking: fact({ name: 'cancelBooking', effect: 'destructive', target: 'id',
    label: 'Cancel the booking',
    schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    does: 'Cancels one booking by id.' })
} } as const;

/** The blocks of one request that open a numbered fact list. */
function factLists(input: StepInput): number {
  const texts = [input.system,
    ...input.messages.flatMap(m => m.role === 'acts' ? [] : [m.text])];
  return texts.filter(t => t.includes('[F1]')).length;
}

test('the close request numbers the turn\'s facts once, not twice', async () => {
  // Turn 1 holds a destructive act for consent. Turn 2 spends the code — the act runs,
  // a repeat is refused, and the retries run out — so the engine closes the turn with
  // a step whose prefix was built before those calls landed.
  const model = payingDesk([
    callStep('cancelBooking', { id: 'bk_9' }), finishStep('Held for your approval.'),
    { calls: [], text: '' }, { calls: [], text: '' },
    callStep('cancelBooking', { id: 'bk_9' }),
    callStep('cancelBooking', { id: 'bk_9' }),
    { calls: [], text: '' }, { calls: [], text: '' }, { calls: [], text: '' },
    { calls: [], text: '' }, { calls: [], text: '' }, { calls: [], text: '' }
  ]);
  const { engine } = testEngine({ model, facts: CONSENT_FACTS,
    behaviors: { cancelBooking: () => ({ result: { cancelled: true }, done: 'yes' }) } });

  const asked = await engine.chat('s1', 'cancel bk_9') as TurnRecord;
  const seenBefore = model.seen.length;
  const closed = await engine.chat('s1', asked.questions.issued[0].code) as TurnRecord;

  expect(closed.corrections.some(c => c.kind === 'forcedFinish')).toBe(true);
  const closeRequests = model.seen.slice(seenBefore).filter(s =>
    s.messages.some(m => m.role !== 'acts' && m.text.startsWith('THE DESK HOLDS')));
  expect(closeRequests.length).toBeGreaterThan(0);
  for (const request of closeRequests) expect(factLists(request)).toBe(1);
});
