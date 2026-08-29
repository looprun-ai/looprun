import { test, expect } from 'vitest';
import type { ModelPort } from '../../src/contract/ports.js';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep } from '../fixtures/scripted-model.js';
import { caseRig } from '../fixtures/case-rig.js';

/** The main-loop steps come from the script; a composer request (empty surface) is
 *  answered by echoing the prompt's numbered fact lines — so the gate's ids, figures
 *  and code are always carried and the composed path is exercised for real. */
function smartPort(steps: ReturnType<typeof callStep>[]): ModelPort {
  const scripted = new ScriptedModel(steps);
  return { step: async input => {
    if (input.tools.length === 0) {
      const t = input.messages[input.messages.length - 1].text;
      const facts = t.slice(t.indexOf('PROVEN FACTS'), t.indexOf('\n\nDESK DRAFT'));
      return { calls: [], text: `Composed. ${facts.split('\n').join(' ')}` };
    }
    return scripted.step(input);
  } };
}

test('a held turn delivers through the composer — the marks say so', async () => {
  const model = smartPort([callStep('cancelBooking', { id: 'bk_9' })]);
  const { engine } = caseRig({ model: model as never });

  const r = await engine.chat('s1', 'cancel booking bk_9');
  const code = r.questions.issued[0].code;
  expect(r.delivery.by).toBe('composer');
  expect(r.delivery.retried).toBe(false);
  expect(r.delivery.facts.map(f => f.kind)).toEqual(['ask', 'code']);
  expect(r.text.startsWith('Composed.')).toBe(true);
  expect(r.text).toContain(code);
  expect(r.text).not.toContain('— not-done');
});

test('a composition that fails the gate twice floors — nothing is ever lost', async () => {
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_9' }),
    { calls: [], text: 'no code here' },
    { calls: [], text: 'still none' }
  ]);
  const { engine } = caseRig({ model });

  const r = await engine.chat('s1', 'cancel booking bk_9');
  const code = r.questions.issued[0].code;
  expect(r.delivery.by).toBe('floor');
  expect(r.delivery.retried).toBe(true);
  expect(r.text).toContain(code);            // the floor reprints the ask and its code
});

import { proseDropsReads } from '../../src/run/turn.js';

const readAct = (result: unknown): never => ({ id: 'a1', turn: 1, origin: 'model',
  effect: 'read', call: { tool: 'getLog', args: {}, key: 'k' }, said: 'yes',
  status: 'done', reason: null, evidence: 'executor', sentence: 'getLog() — done.',
  owed: null, result, questionId: null, guard: null }) as never;

test('prose that carries none of a read\'s identifiers drops the read', () => {
  const acts = [readAct({ entries: [{ actor: 'mb_1', detail: 'in_9 issued' }] })];
  expect(proseDropsReads(acts, 'The log shows the recent activity.')).toBe(true);
  expect(proseDropsReads(acts, 'mb_1 issued in_9.')).toBe(false);
});

test('a read returning no identifiers demands nothing of the prose', () => {
  expect(proseDropsReads([readAct({ holds: [], count: 0 })],
    'No freeze stands on the machine.')).toBe(false);
  expect(proseDropsReads([], 'Nothing was read this turn.')).toBe(false);
});
