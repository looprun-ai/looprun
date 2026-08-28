import { test, expect } from 'vitest';
import { onlyAfter } from '../../src/cards/catalog.js';
import { fact } from '../fixtures/compiled-agents.js';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { BOOKING_SURFACE, testEngine } from '../fixtures/compiled-agents.js';
import { RecordsPortStub } from '../fixtures/records-port-stub.js';

// P4 · R5.2 — owe: the engine pays the owed read with ONE forced micro-step where
// the session's own model fills the args over a single-tool surface; the read runs
// origin 'engine', recorded, BEFORE the gated call's re-check. An unpaid debt
// refuses — the turn still answers the user.

/** A surface where the read's arg name differs from the gated tool's — the model
 *  fills the read's own args from its schema; the engine derives nothing. */
const MISMATCHED = {
  tools: {
    getBooking: fact({ name: 'getBooking', effect: 'read', target: 'bookingRef',
      schema: { type: 'object', properties: { bookingRef: { type: 'string' } }, required: ['bookingRef'] },
      does: 'Reads one booking by its reference.' }),
    cancelBooking: fact({ name: 'cancelBooking', effect: 'write', target: 'id',
      label: 'Cancel the booking',
      schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      does: 'Cancels one booking by id.' })
  }
} as const;

const MISMATCHED_BEHAVIORS = {
  getBooking: (call: { args: Readonly<Record<string, unknown>> }) =>
    ({ result: { bookingRef: call.args.bookingRef as string }, done: 'yes' as const }),
  cancelBooking: () => ({ result: { cancelled: true }, done: 'yes' as const })
};

test('the micro-step pays the debt: single-tool surface, model-filled args, engine origin, order kept', async () => {
  const guard = onlyAfter('cancelBooking', 'getBooking').compile('contract', MISMATCHED);
  const records = new RecordsPortStub();
  records.set('bookings', 'bk_9', { status: 'CONFIRMED', customer: 'c_42' });
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_9' }),
    callStep('getBooking', { bookingRef: 'bk_9' }),
    finishStep('Cancelled bk_9.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }])
  ]);
  const { engine, port } = testEngine({
    model, guards: [guard], facts: MISMATCHED, behaviors: MISMATCHED_BEHAVIORS, records
  });

  const r = await engine.chat('s1', 'cancel booking bk_9');

  const micro = model.seen[1];
  expect(micro.tools.map(t => t.name)).toEqual(['getBooking']);
  const microLast = micro.messages.at(-1);
  expect(microLast?.role === 'acts' ? '' : microLast?.text).toContain('call getBooking now');
  expect(micro.system).toContain('STATE: ');
  expect(micro.system).toContain('c_42');
  expect(port.log).toEqual([
    { tool: 'getBooking', args: { bookingRef: 'bk_9' } },
    { tool: 'cancelBooking', args: { id: 'bk_9' } }
  ]);
  expect(r.acts.map(a => [a.call.tool, a.origin, a.status])).toEqual([
    ['getBooking', 'engine', 'done'],
    ['cancelBooking', 'model', 'done']
  ]);
});

test('a satisfied prerequisite owes nothing — the read is not repeated', async () => {
  const guard = onlyAfter('cancelBooking', 'getBooking').compile('contract', BOOKING_SURFACE);
  const model = new ScriptedModel([
    { calls: [{ tool: 'getBooking', args: { id: 'bk_9' } }, { tool: 'cancelBooking', args: { id: 'bk_9' } }], text: '' },
    finishStep('Cancelled bk_9.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }])
  ]);
  const { engine, port } = testEngine({ model, guards: [guard] });

  const r = await engine.chat('s1', 'check then cancel bk_9');

  expect(port.log.map(c => c.tool)).toEqual(['getBooking', 'cancelBooking']);
  expect(r.acts.map(a => a.origin)).toEqual(['model', 'model']);
});

test('a micro-step that fills nothing refuses the gated call — the turn still answers the user', async () => {
  const guard = onlyAfter('cancelBooking', 'getBooking').compile('contract', MISMATCHED);
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_9' }),
    { calls: [], text: 'I am not sure which booking.' },
    finishStep('I could not cancel bk_9 — I could not read it first.',
      [{ tool: 'cancelBooking', target: 'bk_9', word: 'refused' }])
  ]);
  const { engine, port } = testEngine({
    model, guards: [guard], facts: MISMATCHED, behaviors: MISMATCHED_BEHAVIORS
  });

  const r = await engine.chat('s1', 'cancel booking bk_9');

  expect(port.log).toHaveLength(0);
  expect(r.acts).toHaveLength(1);
  expect(r.acts[0]).toMatchObject({
    call: { tool: 'cancelBooking' }, status: 'not-done', reason: 'blocked', evidence: 'engine'
  });
  expect(r.acts[0].sentence).toContain('Run getBooking before cancelBooking.');
  expect(r.closedBy).toBe('model');
  expect(r.text).toContain('Run getBooking before cancelBooking.');
  const finishInput = model.seen.at(-1);
  expect(finishInput?.messages.some(m => m.role === 'acts'
    ? m.acts.some(a => a.sentence.includes('Run getBooking before cancelBooking.'))
    : m.text.includes('Run getBooking before cancelBooking.'))).toBe(true);
});

test('a paid read that FAILS refuses the gated call with the rule — never a dead turn', async () => {
  const guard = onlyAfter('cancelBooking', 'getBooking').compile('contract', MISMATCHED);
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_9' }),
    callStep('getBooking', { bookingRef: 'bk_9' }),
    finishStep('I could not cancel bk_9.',
      [{ tool: 'cancelBooking', target: 'bk_9', word: 'refused' }])
  ]);
  const { engine } = testEngine({
    model, guards: [guard], facts: MISMATCHED,
    behaviors: {
      getBooking: () => ({ result: { refused: 'not found' }, done: 'no' }),
      cancelBooking: () => ({ result: { cancelled: true }, done: 'yes' })
    }
  });

  const r = await engine.chat('s1', 'cancel booking bk_9');

  expect(r.acts.map(a => [a.call.tool, a.origin, a.status])).toEqual([
    ['getBooking', 'engine', 'not-done'],
    ['cancelBooking', 'model', 'not-done']
  ]);
  expect(r.acts[1].sentence).toContain('Run getBooking before cancelBooking.');
  expect(r.closedBy).toBe('model');
});
