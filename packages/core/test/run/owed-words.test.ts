import { test, expect } from 'vitest';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { caseRig } from '../fixtures/case-rig.js';

// The owed word: an act carries the words the OPERATOR is owed, minted where its
// sentence is minted. Reads and teaching frames owe nothing; a refusal owes its
// reason frame-free; a licensed done write owes its filled after tense.

test('a read owes nothing, and a held act owes nothing — the ask lives on the question', async () => {
  const model = new ScriptedModel([
    callStep('getBooking', { id: 'bk_9' }),
    callStep('cancelBooking', { id: 'bk_9' }),
    { calls: [], text: '' },
    { calls: [], text: '' },
  ]);
  const { engine } = caseRig({ model });
  const r1 = await engine.chat('s1', 'cancel booking bk_9');
  const read = r1.acts.find(a => a.call.tool === 'getBooking');
  const held = r1.acts.find(a => a.call.tool === 'cancelBooking');
  expect(read?.owed).toBeNull();
  expect(held?.owed).toBeNull();
  expect(r1.questions.issued).toHaveLength(1);
});

test('a world-refused hold owes the refusal in words, frame-free', async () => {
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_66' }),
    finishStep('That booking is under maintenance and cannot be cancelled.',
      [{ tool: 'cancelBooking', target: 'bk_66', word: 'refused' }]),
    { calls: [], text: '' },
    { calls: [], text: '' },
  ]);
  const { engine } = caseRig({ model });
  const r1 = await engine.chat('s1', 'cancel bk_66');
  const act = r1.acts.find(a => a.call.tool === 'cancelBooking');
  expect(act?.status).toBe('not-done');
  expect(act?.owed?.kind).toBe('refusal');
  expect(act?.owed?.text.length).toBeGreaterThan(0);
  expect(act?.owed?.text).not.toMatch(/ — not-done/);
});

test('a licensed done write owes its filled after tense; a done write with no tense owes nothing', async () => {
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_9' }),
    { calls: [], text: '' },
    { calls: [], text: '' },
    { calls: [], text: '' },
    finishStep('Done.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }]),
    { calls: [], text: '' },
    { calls: [], text: '' },
    callStep('compRoom', { id: 'bk_7' }),
    finishStep('Comped.', [{ tool: 'compRoom', target: 'bk_7', word: 'done' }])
  ,
    { calls: [], text: '' },
    { calls: [], text: '' }]);
  const { engine } = caseRig({ model, contract: { disclosure: { cancelBooking: {
    needs: { booking: 'getBooking' },
    before: 'Cancelling room {booking.room} is permanent.',
    after: 'Cancelled room {booking.room}.'
  } } } });
  const r1 = await engine.chat('s1', 'cancel booking bk_9');
  const code = r1.questions.issued[0].code;
  const r2 = await engine.chat('s1', code);
  const licensed = r2.acts.find(a => a.origin === 'licence');
  expect(licensed?.owed).toEqual({ kind: 'receipt', text: 'Cancelled room 12.' });

  const r3 = await engine.chat('s1', 'comp bk_7');
  const comped = r3.acts.find(a => a.call.tool === 'compRoom');
  expect(comped?.status).toBe('done');
  expect(comped?.owed).toBeNull();
});
