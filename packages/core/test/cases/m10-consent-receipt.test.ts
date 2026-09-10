import { test, expect } from 'vitest';
import { callStep, finishStep, payingDesk } from '../fixtures/scripted-model.js';
import { caseRig } from '../fixtures/case-rig.js';

// M10 — the after-sentence of a CONSENTED act. The engine runs the held call itself once
// the code arrives, and renders the authored after-sentence from the answer. A slot the
// answer cannot fill leaves the sentence silent and the act's own receipt stands — the
// turn never dies after an irreversible act has run.

const idle = { calls: [], text: '' };

function approving(message: string) {
  return payingDesk([
    callStep('cancelBooking', { id: 'bk_9' }), idle, idle, idle,
    finishStep(message, [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }]), idle, idle, idle
  ]);
}

test('M10a — a slot the answer lacks: the act ran, the turn closes, the receipt is the act\'s own', async () => {
  const model = approving('Cancelled bk_9.');
  const { engine, world } = caseRig({ model,
    contract: { disclosure: { cancelBooking: { after: 'Cancelled for {result.guest}.' } } } });

  const r1 = await engine.chat('s1', 'cancel booking bk_9');
  const code = r1.questions.issued[0].code;
  const r2 = await engine.chat('s1', code);

  expect(world.snapshot().bookings.bk_9).toBeUndefined();
  expect(r2.acts[0]).toMatchObject({ call: { tool: 'cancelBooking' }, origin: 'licence', status: 'done', owed: null });
  expect(r2.text).not.toBe('');
  expect(r2.text).not.toContain('{result.');
  expect(r2.text).toContain('cancelBooking call ran and took effect');
});

test('M10b — a slot the answer fills is delivered as authored', async () => {
  const model = approving('Cancelled bk_9.');
  const { engine } = caseRig({ model,
    contract: { disclosure: { cancelBooking: { after: 'Booking {result.removed} is gone for good.' } } } });

  const r1 = await engine.chat('s1', 'cancel booking bk_9');
  const r2 = await engine.chat('s1', r1.questions.issued[0].code);

  expect(r2.acts[0]).toMatchObject({ origin: 'licence', status: 'done',
    owed: { kind: 'receipt', text: 'Booking bk_9 is gone for good.' } });
  expect(r2.text).toContain('Booking bk_9 is gone for good.');
});
