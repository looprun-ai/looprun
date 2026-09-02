/** A card's rule states the law that refuses. A check that could not run has not been refused
 *  BY that law, and saying so in the law's words tells the operator something untrue of them —
 *  so a check may speak for itself, and its words stand where the rule would have. */
import { test, expect } from 'vitest';
import { precondition } from '../../src/cards/catalog.js';
import { callStep, finishStep, payingDesk } from '../fixtures/scripted-model.js';
import { caseRig } from '../fixtures/case-rig.js';

const LAW = 'Cancelling a booking needs the booking capability, and the acting member\'s '
  + 'recorded role does not carry it.';

const guardWhose = (verdict: false | { says: string }) =>
  precondition('cancelBooking', () => verdict, LAW);

const refusalOf = async (verdict: false | { says: string }): Promise<string> => {
  const model = payingDesk([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep('That cannot be done.',
      [{ tool: 'cancelBooking', target: 'bk_9', word: 'refused' }]),
    finishStep('That cannot be done.',
      [{ tool: 'cancelBooking', target: 'bk_9', word: 'refused' }]),
    finishStep('That cannot be done.',
      [{ tool: 'cancelBooking', target: 'bk_9', word: 'refused' }])
  ]);
  const { engine } = caseRig({ model, contract: { guards: [guardWhose(verdict)] } });
  const r = await engine.chat('s1', 'cancel booking bk_9');
  if (!('acts' in r)) return '';
  return r.acts.find(a => a.call.tool === 'cancelBooking')?.sentence ?? '';
};

test('the law refusing with nothing to add is spoken by the card\'s rule', async () => {
  expect(await refusalOf(false)).toContain(LAW);
});

test('a check speaking for itself stands where the rule would have', async () => {
  const spoken = 'the acting member record was not read this conversation, so nothing here '
    + 'has judged the role — read it and call again';
  const sentence = await refusalOf({ says: spoken });
  expect(sentence).toContain(spoken);
  expect(sentence).not.toContain(LAW);
});
