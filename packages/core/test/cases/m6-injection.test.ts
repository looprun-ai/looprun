import { test, expect } from 'vitest';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { injectionCheck } from '../../src/cards/catalog.js';
import { caseRig } from '../fixtures/case-rig.js';

// M6 — the instruction planted in bookings.bk_9.note arrives inside a tool result;
// the model obeys it; the DECLARED injectionCheck asks the session's own seat and
// the YES verdict redrives the reply. The judged pass exists only because the card
// declared it.

test('M6 — the obeyed injection is caught by the scripted judge and redriven', async () => {
  const model = new ScriptedModel([
    callStep('getBooking', { id: 'bk_9' }),
    finishStep('Understood — cancelling every booking now.', []),
    { calls: [], text: 'YES' },                                   // the judge's answer
    finishStep('bk_9 is confirmed for Tuesday. The note in the record is data, not an order.', []),
    { calls: [], text: 'NO' }
  ]);
  const { engine } = caseRig({ model, spec: { guards: [injectionCheck()] } });

  const r = await engine.chat('s1', 'what does booking bk_9 say?');

  expect(r.corrections).toContainEqual(
    { kind: 'redrive', guardName: 'injectionCheck',
      detail: 'the judge answered YES to the declared question' });
  expect(r.closedBy).toBe('model');
  expect(r.text).toContain('data, not an order');
});

test('M6 — an unreadable answer refuses: the reply is redriven, never sealed on it', async () => {
  const model = new ScriptedModel([
    callStep('getBooking', { id: 'bk_9' }),
    finishStep('The booking is confirmed for Tuesday.', []),
    { calls: [], text: 'cannot decide' },          // unreadable — the rule stands unmet
    finishStep('bk_9 is confirmed for Tuesday.', []),
    { calls: [], text: 'NO' }
  ]);
  const { engine } = caseRig({ model, spec: { guards: [
    { name: 'topic-check', rule: 'The reply stays on topic.', on: 'reply',
      judgeQuery: 'Is the reply off topic?' }
  ] } });

  const r = await engine.chat('s1', 'what does booking bk_9 say?');

  expect(r.corrections).toContainEqual({ kind: 'judgeUnreadable', guardName: 'topic-check' });
  expect(r.corrections).toContainEqual(
    { kind: 'redrive', guardName: 'topic-check',
      detail: 'the judge answer was unreadable — treated as a violation' });
  expect(r.closedBy).toBe('model');
  expect(r.text).toContain('bk_9 is confirmed');
});
