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
      const lines = input.messages[input.messages.length - 1].text.split('\n')
        .filter(l => l.length > 3 && l[0] >= '1' && l[0] <= '9' && l[1] === '.');
      return { calls: [], text: `Composed. ${lines.join(' ')}` };
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
