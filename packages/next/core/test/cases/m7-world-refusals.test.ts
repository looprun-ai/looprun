import { test, expect } from 'vitest';
import { ScriptedModel, callStep, finishStep } from '../fixtures/scripted-model.js';
import { precondition } from '../../src/cards/catalog.js';
import { caseRig } from '../fixtures/case-rig.js';

// M7 — three refusal sources, each with its own evidence: the WORLD's gate (no
// guard fired — the refusal is the executor's own), a contract precondition over
// the target record (engine veto), and the custom executor's audited patches.

test('M7 — the world refuses a MAINTENANCE cancel on execution; no guard involved', async () => {
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_66' }),
    finishStep('I need your approval.', [{ tool: 'cancelBooking', target: 'bk_66', word: 'held' }]),
    { calls: [], text: '' },
    finishStep('The hotel refused it.', [{ tool: 'cancelBooking', target: 'bk_66', word: 'refused' }])
  ]);
  const { engine, world } = caseRig({ model });

  const r1 = await engine.chat('s1', 'cancel the maintenance room booking bk_66');
  const code = r1.questions.issued[0].code;
  const r2 = await engine.chat('s1', `approve ${code}`);

  expect(r2.acts[0]).toMatchObject({ origin: 'licence', status: 'not-done',
    reason: 'refused', evidence: 'executor' });
  expect(world.snapshot().bookings.bk_66).toBeDefined();
});

test('M7 — a contract precondition vetoes before consent even asks', async () => {
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep('The invoice is unpaid, so I cannot cancel.',
      [{ tool: 'cancelBooking', target: 'bk_9', word: 'blocked' }])
  ]);
  const { engine } = caseRig({ model, contract: { guards: [
    precondition('cancelBooking',
      ({ state }) => state.invoices?.inv_1?.paid === true,
      'The invoice must be paid before cancelling.')
  ] } });

  const r = await engine.chat('s1', 'cancel bk_9');
  expect(r.acts[0]).toMatchObject({ status: 'not-done', reason: 'blocked', evidence: 'engine' });
  expect(r.questions.issued).toHaveLength(0);
  expect(r.text).toContain('The invoice must be paid before cancelling.');
});

test('M7 — the custom executor lands audited patches through the shared path', async () => {
  const model = new ScriptedModel([
    callStep('compRoom', { id: 'bk_9' }),
    finishStep('Comped.', [{ tool: 'compRoom', target: 'bk_9', word: 'done' }])
  ]);
  const { engine, world } = caseRig({ model });

  const r = await engine.chat('s1', 'comp the room on bk_9');
  expect(r.acts[0]).toMatchObject({ status: 'done' });
  expect(world.snapshot().bookings.bk_9.room).toBe('suite');
  expect(world.audit().at(-1)).toMatchObject({ executor: 'custom', done: 'yes' });
});
