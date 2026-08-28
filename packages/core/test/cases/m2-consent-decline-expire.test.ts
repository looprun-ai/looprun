import { test, expect } from 'vitest';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { caseRig } from '../fixtures/case-rig.js';

// M2 — the closed half of the lifecycle: NO plus the code has no effect — the
// question stands and the type-only-the-code notice is delivered; a question
// ignored past limits.questionTurns closes 'expired' by the sweep; EVERY closure
// is delivered; a stale code consumes nothing.

test('M2 — NO plus the code has no effect: the question stands, the notice is delivered', async () => {
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep('Approval needed.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'held' }]),
    { calls: [], text: '' },
    finishStep('Kept as is.', [])
  ]);
  const { engine, world } = caseRig({ model });

  const r1 = await engine.chat('s1', 'cancel bk_9');
  const code = r1.questions.issued[0].code;

  const r2 = await engine.chat('s1', `no, keep it — NO ${code}`);
  expect(r2.questions.closed).toHaveLength(0);
  expect(r2.questions.consumed).toHaveLength(0);
  expect(r2.text).toContain('To confirm, reply with only the code — nothing else.');
  expect(r2.text).toContain(code);
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
