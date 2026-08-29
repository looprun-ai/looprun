import { test, expect } from 'vitest';
import { onlyAfter } from '../../src/cards/catalog.js';
import { fact } from '../fixtures/compiled-agents.js';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { testEngine } from '../fixtures/compiled-agents.js';

// A gated call pays EVERY owed read this turn, one micro-step per debt, bounded by
// the guards that owe; and an unpaid debt refuses with the words of the guard that
// raised it — never a sibling's rule.

const TWO_GATES = {
  tools: {
    getBooking: fact({ name: 'getBooking', effect: 'read', target: 'bookingRef',
      schema: { type: 'object', properties: { bookingRef: { type: 'string' } }, required: ['bookingRef'] },
      does: 'Reads one booking by its reference.' }),
    getPolicy: fact({ name: 'getPolicy', effect: 'read', target: 'policyId',
      schema: { type: 'object', properties: { policyId: { type: 'string' } }, required: ['policyId'] },
      does: 'Reads the cancellation policy.' }),
    cancelBooking: fact({ name: 'cancelBooking', effect: 'write', target: 'id',
      label: 'Cancel the booking',
      schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      does: 'Cancels one booking by id.' })
  }
} as const;

const BEHAVIORS = {
  getBooking: (call: { args: Readonly<Record<string, unknown>> }) =>
    ({ result: { bookingRef: call.args.bookingRef as string }, done: 'yes' as const }),
  getPolicy: (call: { args: Readonly<Record<string, unknown>> }) =>
    ({ result: { policyId: call.args.policyId as string, fee: 0 }, done: 'yes' as const }),
  cancelBooking: () => ({ result: { cancelled: true }, done: 'yes' as const })
};

const guards = () => [
  onlyAfter('cancelBooking', 'getBooking').compile('contract', TWO_GATES),
  onlyAfter('cancelBooking', 'getPolicy').compile('contract', TWO_GATES)
];

test('every prerequisite is paid in one turn — one micro-step per debt, then the call runs', async () => {
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_9' }),
    callStep('getBooking', { bookingRef: 'bk_9' }),
    callStep('getPolicy', { policyId: 'bk_9' }),
    finishStep('Cancelled bk_9.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }]),
    { calls: [], text: '' },
    { calls: [], text: '' }
  ]);
  const { engine, port } = testEngine({
    model, guards: guards(), facts: TWO_GATES, behaviors: BEHAVIORS
  });

  const r = await engine.chat('s1', 'cancel booking bk_9');

  expect(port.log.map(c => c.tool)).toEqual(['getBooking', 'getPolicy', 'cancelBooking']);
  expect(r.acts.map(a => [a.call.tool, a.origin, a.status])).toEqual([
    ['getBooking', 'engine', 'done'],
    ['getPolicy', 'engine', 'done'],
    ['cancelBooking', 'model', 'done']
  ]);
});

test('an unpayable second debt refuses with the guard that raised it, never a sibling rule', async () => {
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_9' }),
    callStep('getBooking', { bookingRef: 'bk_9' }),
    { calls: [], text: 'I am not sure which policy.' },
    finishStep('I could not cancel bk_9 — the policy read did not run.',
      [{ tool: 'cancelBooking', target: 'bk_9', word: 'refused' }]),
    { calls: [], text: '' },
    { calls: [], text: '' }
  ]);
  const { engine } = testEngine({
    model, guards: guards(), facts: TWO_GATES, behaviors: BEHAVIORS
  });

  const r = await engine.chat('s1', 'cancel booking bk_9');

  const refused = r.acts.find(a => a.call.tool === 'cancelBooking');
  expect(refused?.status).toBe('not-done');
  expect(refused?.sentence).toContain('Run getPolicy before cancelBooking.');
  expect(refused?.sentence).not.toContain('Run getBooking before cancelBooking.');
});
