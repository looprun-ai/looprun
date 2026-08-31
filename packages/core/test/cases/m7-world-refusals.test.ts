import { test, expect } from 'vitest';
import { callStep, finishStep, payingDesk } from '../fixtures/scripted-model.js';
import { precondition } from '../../src/cards/catalog.js';
import { caseRig } from '../fixtures/case-rig.js';

// M7 — two refusal sources, each with its own evidence: a contract precondition
// over the target record (engine veto, before consent asks), and the custom
// executor's audited patches.

test('M7 — a contract precondition vetoes before consent even asks', async () => {
  const model = payingDesk([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep('The invoice is unpaid, so I cannot cancel.',
      [{ tool: 'cancelBooking', target: 'bk_9', word: 'refused' }]),
    { calls: [], text: '' },
    { calls: [], text: '' }
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
  const model = payingDesk([
    callStep('compRoom', { id: 'bk_9' }),
    finishStep('Comped.', [{ tool: 'compRoom', target: 'bk_9', word: 'done' }])
  ,
    { calls: [], text: '' },
    { calls: [], text: '' }]);
  const { engine, world } = caseRig({ model });

  const r = await engine.chat('s1', 'comp the room on bk_9');
  expect(r.acts[0]).toMatchObject({ status: 'done' });
  expect(world.snapshot().bookings.bk_9.room).toBe('suite');
  expect(world.audit().at(-1)).toMatchObject({ executor: 'custom', done: 'yes' });
});
