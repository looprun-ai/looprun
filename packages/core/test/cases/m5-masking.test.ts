import { test, expect } from 'vitest';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { caseRig } from '../fixtures/case-rig.js';

// M5 — the declared secret is masked at the RECORDING seam, so history, prompt
// state and the report read safe data by construction; a figure the model states
// on its own grounds on no record and is redriven — the leak never delivers.

const PAN = '4111111111111111';

test('M5 — the secret never reaches the record or the delivery; the leak attempt is redriven', async () => {
  const model = new ScriptedModel([
    callStep('getBooking', { id: 'bk_66' }),
    finishStep(`The card on file is ${PAN}.`, []),
    finishStep('The card on file is ****.', [])
  ]);
  const { engine } = caseRig({ model, contract: { secrets: ['cardNumber'] } });

  const r = await engine.chat('s1', 'what card is on booking bk_66?');

  const recorded = r.acts[0].result as { cardNumber: string };
  expect(recorded.cardNumber).toBe('****');
  expect(r.text).not.toContain(PAN);
  expect(r.text).toContain('****');
  // The stated PAN appears in no record, so the finish is corrected, never delivered.
  expect(r.corrections.some(c => c.kind === 'redrive' && c.guardName === 'figureIsGrounded')).toBe(true);
  // Everything the RECORD feeds the model is masked: the inputs before the model's
  // own leak attempt are clean, and the acts it re-reads afterwards stay clean —
  // the attempt rides back only as the model's own words.
  expect(JSON.stringify(model.seen.slice(0, 2))).not.toContain(PAN);
  const redriveInput = model.seen[2];
  expect(redriveInput.system).not.toContain(PAN);
  expect(JSON.stringify(redriveInput.messages.filter(m => m.role === 'acts'))).not.toContain(PAN);
});
