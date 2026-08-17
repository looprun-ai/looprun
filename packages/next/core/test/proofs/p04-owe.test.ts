import { test, expect } from 'vitest';
import { onlyAfter } from '../../src/cards/catalog.js';
import { ScriptedModel, callStep, finishStep } from '../fixtures/scripted-model.js';
import { BOOKING_SURFACE, testEngine } from '../fixtures/compiled-agents.js';

// P4 · R5.2 — owe: a READ prerequisite runs engine-side (origin 'engine'), recorded,
// BEFORE the gated call's re-check and execution.
test('the owed read runs with origin engine before the gated call', async () => {
  const guard = onlyAfter('cancelBooking', 'getBooking').compile('contract', BOOKING_SURFACE);
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep('Cancelled bk_9.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }])
  ]);
  const { engine, port } = testEngine({ model, guards: [guard] });

  const r = await engine.chat('s1', 'cancel booking bk_9');

  expect(port.log.map(c => c.tool)).toEqual(['getBooking', 'cancelBooking']);
  expect(r.acts).toHaveLength(2);
  expect(r.acts[0]).toMatchObject({
    origin: 'engine', status: 'done', call: { tool: 'getBooking', args: { id: 'bk_9' } }
  });
  expect(r.acts[1]).toMatchObject({
    origin: 'model', status: 'done', call: { tool: 'cancelBooking', args: { id: 'bk_9' } }
  });
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
