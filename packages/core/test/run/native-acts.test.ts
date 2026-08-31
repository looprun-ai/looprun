import { test, expect } from 'vitest';
import { callStep, finishStep, payingDesk } from '../fixtures/scripted-model.js';
import { caseRig } from '../fixtures/case-rig.js';

// The engine never composes tool results as prose: what a call did rides the
// StepInput as a typed acts message, and the seat decides how to render it.
test('tool results ride as a typed acts message, never as user-role text', async () => {
  const model = payingDesk([
    callStep('getBooking', { id: 'bk_9' }),
    finishStep('bk_9 is confirmed for Tuesday.', [])
  ]);
  const { engine } = caseRig({ model });
  const rec = await engine.chat('s1', 'is bk_9 confirmed?');
  expect(rec.text).toContain('Tuesday');

  const acts = model.seen.flatMap(i => i.messages.filter(m => m.role === 'acts'));
  expect(acts.length).toBeGreaterThan(0);
  expect(JSON.stringify(acts)).toContain('getBooking');
  expect(JSON.stringify(acts)).toContain('Tuesday');

  const texts = model.seen.flatMap(i =>
    i.messages.filter(m => m.role !== 'acts').map(m => (m as { text: string }).text));
  expect(texts.join('\n')).not.toContain('TOOL RESULTS');
});

// The licensed execution that runs BEFORE the model loop reaches the model the
// same typed way: the approval turn's first StepInput already carries the act.
test('a licensed execution arrives typed in the approval turn', async () => {
  const model = payingDesk([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep('I need your approval to cancel bk_9.',
      [{ tool: 'cancelBooking', target: 'bk_9', word: 'held' }]),
    { calls: [], text: '' },
    finishStep('Cancelled bk_9.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }])
  ,
    { calls: [], text: '' },
    { calls: [], text: '' }]);
  const { engine } = caseRig({ model });
  const first = await engine.chat('s1', 'cancel booking bk_9');
  const code = first.questions.issued[0].code;
  const stepsBefore = model.seen.length;
  await engine.chat('s1', code);
  const approvalInputs = model.seen.slice(stepsBefore);
  const acts = approvalInputs[0].messages.filter(m => m.role === 'acts');
  expect(JSON.stringify(acts)).toContain('cancelBooking');
});
