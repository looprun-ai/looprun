import { test, expect } from 'vitest';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { caseRig } from '../fixtures/case-rig.js';

// M2 — the closed half of the lifecycle: a quoted decline literal closes 'declined';
// a question ignored past limits.questionTurns closes 'expired' by the sweep; EVERY
// closure is delivered; a stale code consumes nothing.

test('M2 — the decline literal closes the question and the world stays untouched', async () => {
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep('Approval needed.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'held' }]),
    { calls: [], text: '' },
    finishStep('Kept as is.', [])
  ]);
  const { engine, world } = caseRig({ model });

  const r1 = await engine.chat('s1', 'cancel bk_9');
  const code = r1.questions.issued[0].code;
  const decline = code.replace('CONFIRM', 'NO');

  const r2 = await engine.chat('s1', `no, keep it — ${decline}`);
  expect(r2.questions.closed).toEqual([{ id: r1.questions.issued[0].id, why: 'declined' }]);
  expect(r2.text.toLowerCase()).toContain('declined');
  expect(world.snapshot().bookings.bk_9).toBeDefined();
  expect(world.audit().every(row => row.call.args.simulate === true)).toBe(true);
});

test('M2 — an ignored question expires by the sweep, delivered; a stale code consumes nothing', async () => {
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep('Approval needed.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'held' }]),
    { calls: [], text: '' },
    finishStep('Noted.', []),
    { calls: [], text: '' },
    finishStep('Noted again.', []),
    { calls: [], text: '' },
    finishStep('Nothing ran.', [])
  ]);
  const { engine, world } = caseRig({ model, spec: { limits: { questionTurns: 1 } } });

  const r1 = await engine.chat('s1', 'cancel bk_9');
  const code = r1.questions.issued[0].code;

  const r2 = await engine.chat('s1', 'tell me about the weather');
  expect(r2.questions.closed).toEqual([{ id: r1.questions.issued[0].id, why: 'expired' }]);
  expect(r2.text.toLowerCase()).toContain('expired');

  const r3 = await engine.chat('s1', `approve ${code}`);
  expect(r3.questions.consumed).toHaveLength(0);
  expect(r3.acts).toHaveLength(0);
  expect(world.audit().every(row => row.call.args.simulate === true)).toBe(true);
  expect(world.snapshot().bookings.bk_9).toBeDefined();
});
