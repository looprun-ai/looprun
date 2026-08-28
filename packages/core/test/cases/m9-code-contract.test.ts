import { test, expect } from 'vitest';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { caseRig } from '../fixtures/case-rig.js';

// M9 — the code contract end to end: alone it licenses, wrapped it teaches,
// expired it is gone. The notice and the closure both reach the operator.

const FLOOR2 = [{ calls: [], text: '' }, { calls: [], text: '' }];

test('M9 — CONFIRM plus the code is a wrapped code: nothing licenses, the notice delivers', async () => {
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_9' }), ...FLOOR2,
    { calls: [], text: '' }, finishStep('Waiting on you.', []), ...FLOOR2
  ]);
  const { engine, world } = caseRig({ model });

  const r1 = await engine.chat('s1', 'cancel bk_9');
  const code = r1.questions.issued[0].code;
  expect(code).toMatch(/^\d{6}$/);

  const r2 = await engine.chat('s1', `CONFIRM ${code}`);
  expect(r2.questions.consumed).toHaveLength(0);
  expect(r2.text).toContain('To confirm, reply with only the code — nothing else.');
  expect(r2.text).toContain(code);
  expect(world.snapshot().bookings.bk_9).toBeDefined();
});

test('M9 — the code inside a sentence licenses nothing either', async () => {
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_9' }), ...FLOOR2,
    { calls: [], text: '' }, finishStep('Still waiting on you.', []), ...FLOOR2
  ]);
  const { engine, world } = caseRig({ model });

  const r1 = await engine.chat('s1', 'cancel bk_9');
  const code = r1.questions.issued[0].code;

  const r2 = await engine.chat('s1', `${code} please, go ahead`);
  expect(r2.questions.consumed).toHaveLength(0);
  expect(r2.text).toContain('To confirm, reply with only the code — nothing else.');
  expect(world.snapshot().bookings.bk_9).toBeDefined();
});

test('M9 — a code older than five minutes expires, the closure delivers, and the late code is inert', async () => {
  let clock = 1_000_000;
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_9' }), ...FLOOR2,
    { calls: [], text: '' }, finishStep('That approval has lapsed.', []), ...FLOOR2
  ]);
  const { engine, world } = caseRig({ model, now: () => clock });

  const r1 = await engine.chat('s1', 'cancel bk_9');
  const code = r1.questions.issued[0].code;

  clock += 5 * 60_000 + 1;
  const r2 = await engine.chat('s1', code);
  expect(r2.questions.consumed).toHaveLength(0);
  expect(r2.questions.closed).toEqual([{ id: r1.questions.issued[0].id, why: 'expired' }]);
  expect(r2.text.toLowerCase()).toContain('expired');
  expect(world.snapshot().bookings.bk_9).toBeDefined();
});
