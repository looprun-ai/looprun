import { test, expect } from 'vitest';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { caseRig } from '../fixtures/case-rig.js';

// M1 — the consent lifecycle end to end through the author door: a destructive call
// HOLDS with a coded question, the quoted code consumes the licence, the engine
// executes the held call itself, and an executed act closes every open sibling.

test('M1 — hold, approve by code, licensed execution', async () => {
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep('I need your approval to cancel bk_9.',
      [{ tool: 'cancelBooking', target: 'bk_9', word: 'held' }]),
    { calls: [], text: '' },
    finishStep('Cancelled bk_9.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }])
  ]);
  const { engine, world } = caseRig({ model });

  const r1 = await engine.chat('s1', 'cancel booking bk_9');
  expect(r1.acts[0]).toMatchObject({ call: { tool: 'cancelBooking' },
    status: 'not-done', reason: 'held', evidence: 'engine' });
  expect(world.snapshot().bookings.bk_9).toBeDefined();
  expect(r1.questions.issued).toHaveLength(1);
  const code = r1.questions.issued[0].code;
  expect(r1.text).toContain(code);

  const r2 = await engine.chat('s1', code);
  expect(r2.acts[0]).toMatchObject({ call: { tool: 'cancelBooking' },
    origin: 'licence', status: 'done' });
  expect(world.snapshot().bookings.bk_9).toBeUndefined();
  expect(r2.questions.consumed).toContain(r1.questions.issued[0].id);
  expect(r2.closedBy).toBe('model');
});

test('M1 — an identical re-proposal returns the SAME question; a sibling call births its own; the executed act supersedes the sibling', async () => {
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_9' }),
    callStep('cancelBooking', { id: 'bk_9' }),
    callStep('cancelBooking', { id: 'bk_7' }),
    finishStep('Cancelled bk_9.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }])
  ]);
  const { engine } = caseRig({ model });

  const r1 = await engine.chat('s1', 'cancel bk_9');
  const first = r1.questions.issued[0];

  const r2 = await engine.chat('s1', 'do it anyway');
  expect(r2.questions.issued).toHaveLength(0);          // same question, no second live code
  expect(r2.text).toContain(first.code);                // every delivery reprints the open code

  const r3 = await engine.chat('s1', 'and the Friday one too');
  expect(r3.questions.issued).toHaveLength(1);          // a sibling question, its own code
  const sibling = r3.questions.issued[0];
  expect(sibling.code).not.toBe(first.code);

  const r4 = await engine.chat('s1', first.code);
  expect(r4.acts[0]).toMatchObject({ origin: 'licence', status: 'done' });
  // the sibling asked for a DIFFERENT target, so it stays open — same tool, other record
  expect(r4.text).toContain(sibling.code);
});
