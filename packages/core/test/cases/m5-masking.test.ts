import { test, expect } from 'vitest';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { caseRig } from '../fixtures/case-rig.js';

// M5 — the declared secret is masked at the RECORDING seam, so history, prompt
// state, delivery and the report read safe data by construction; a leak in model
// prose is scrubbed by the collected literal.

const PAN = '4111111111111111';

test('M5 — the secret never reaches the record, the model, or the delivery', async () => {
  const model = new ScriptedModel([
    callStep('getBooking', { id: 'bk_66' }),
    finishStep(`The card on file is ${PAN}.`, [])
  ]);
  const { engine } = caseRig({ model, contract: { secrets: ['cardNumber'] } });

  const r = await engine.chat('s1', 'what card is on booking bk_66?');

  const recorded = r.acts[0].result as { cardNumber: string };
  expect(recorded.cardNumber).toBe('****');
  expect(r.text).not.toContain(PAN);
  expect(r.text).toContain('****');
  for (const seen of model.seen) {
    expect(JSON.stringify(seen)).not.toContain(PAN);
  }
});
