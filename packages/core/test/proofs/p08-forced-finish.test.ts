import { test, expect } from 'vitest';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { testEngine } from '../fixtures/compiled-agents.js';

// P8 · R7.2 — forced finish on exhaustion; the closure is a pure function of the
// recorded acts — never empty, never fabricated.
test('exhaustion forces one finish step; a model that still will not finish is closed by the engine', async () => {
  const model = new ScriptedModel([
    { calls: [
      { tool: 'getBooking', args: { id: 'bk_1' } },
      { tool: 'getBooking', args: { id: 'bk_2' } }
    ], text: '' },
    callStep('getBooking', { id: 'bk_3' })
  ]);
  const { engine } = testEngine({ model, limits: { calls: 2 } });

  const r = await engine.chat('s1', 'check bk_1 and bk_2');

  expect(model.seen).toHaveLength(2);
  expect(model.seen[0].forceFinish).toBe(false);
  expect(model.seen[1].forceFinish).toBe(true);
  expect(r.closedBy).toBe('engine');
  expect(r.finish).toBeNull();
  expect(r.corrections).toContainEqual({ kind: 'forcedFinish' });
  // No trustworthy prose exists, so the settled record speaks: every act's own
  // sentence, one line per call.
  expect(r.text).toContain('getBooking(bk_1) — done');
  expect(r.text).toContain('getBooking(bk_2) — done');
  expect(r.acts.filter(a => a.status === 'done')).toHaveLength(2);
});

test('a finish beside domain calls defers with earlyFinish — the call runs, the finish waits', async () => {
  const model = new ScriptedModel([
    { calls: [
      { tool: 'getBooking', args: { id: 'bk_1' } },
      { tool: 'finish', args: { message: 'Done early.', report: [] } }
    ], text: '' },
    finishStep('Now truly done.')
  ]);
  const { engine, port } = testEngine({ model });

  const r = await engine.chat('s1', 'check bk_1');

  expect(port.log.map(c => c.tool)).toEqual(['getBooking']);
  expect(r.corrections).toContainEqual({ kind: 'earlyFinish' });
  expect(r.finish?.message).toBe('Now truly done.');
  expect(r.closedBy).toBe('model');
});

test('an act-free exhausted turn closes with "Nothing changed." — never silence', async () => {
  const model = new ScriptedModel([
    { calls: [], text: 'thinking...' },
    { calls: [], text: 'still thinking...' }
  ]);
  const { engine } = testEngine({ model });

  const r = await engine.chat('s1', 'hello');

  expect(r.closedBy).toBe('engine');
  expect(r.text).toContain('Nothing changed.');
});
