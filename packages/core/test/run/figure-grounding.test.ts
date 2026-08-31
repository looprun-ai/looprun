import { test, expect } from 'vitest';
import { callStep, finishStep, payingDesk } from '../fixtures/scripted-model.js';
import { caseRig } from '../fixtures/case-rig.js';
import { withoutFactLabels } from '../../src/run/delivery-facts.js';

// Every figure the message states is one the records carry; a report the settled
// record contradicts never delivers. Both are corrections that TEACH — the redrive
// carries the reason, and the corrected attempt is what reaches the operator.

test('a figure no record carries is corrected — the redrive names it', async () => {
  const model = payingDesk([
    callStep('getBooking', { id: 'bk_9' }),
    finishStep('Room 12 is booked; a 150 processing fee applies.'),
    finishStep('Room 12 is booked on Tuesday.')
  ]);
  const { engine } = caseRig({ model });

  const r = await engine.chat('s1', 'check booking bk_9');
  expect(r.corrections.some(c => c.kind === 'redrive'
    && c.guardName === 'figureIsGrounded' && (c.detail ?? '').includes('150'))).toBe(true);
  expect(r.text).toBe('Room 12 is booked on Tuesday.');
});

test('a canonical form of a recorded figure does not fire', async () => {
  const model = payingDesk([
    callStep('getBooking', { id: 'bk_9' }),
    finishStep('Room 12.0 on Tuesday.')
  ]);
  const { engine } = caseRig({ model });

  const r = await engine.chat('s1', 'check booking bk_9');
  expect(r.corrections.filter(c => 'guardName' in c && c.guardName === 'figureIsGrounded')).toEqual([]);
  expect(r.text).toBe('Room 12.0 on Tuesday.');
});

test('a report the settled record contradicts is corrected, never delivered', async () => {
  const model = payingDesk([
    callStep('cancelBooking', { id: 'bk_66' }),
    { calls: [], text: '' },
    { calls: [], text: '' },
    { calls: [], text: '' },
    finishStep('The cancellation went through.',
      [{ tool: 'cancelBooking', target: 'bk_66', word: 'done' }]),
    finishStep('The cancellation could not run — the booking is under maintenance.',
      [{ tool: 'cancelBooking', target: 'bk_66', word: 'refused' }]),
    { calls: [], text: '' },
    { calls: [], text: '' }
  ]);
  const { engine } = caseRig({ model });

  const r1 = await engine.chat('s1', 'cancel bk_66');
  const r = await engine.chat('s1', r1.questions.issued[0].code);
  expect(r.corrections.some(c => c.kind === 'redrive'
    && c.guardName === 'reportContradictsRecord')).toBe(true);
  expect(r.text).not.toContain('went through');
});

// A desk citing the OWED FACTS block writes the label the prompt printed — `As F1
// states`. The number counts the block; it is not an amount the records owe.
test('a fact label is not walked as a figure', () => {
  expect(withoutFactLabels('As F1 states, and as F2 explains, wo_1 stands cancelled.'))
    .toBe('As    states, and as    explains, wo_1 stands cancelled.');
  expect(withoutFactLabels('[F1] [F12] the mooring is ended.'))
    .toBe('[  ] [   ] the mooring is ended.');
  expect(withoutFactLabels('986 stays owed on F1A and berth A-05.'))
    .toBe('986 stays owed on F1A and berth A-05.');
});

test('a message citing F1 and F2 is not corrected for stating 1 and 2', async () => {
  const model = payingDesk([
    callStep('getBooking', { id: 'bk_9' }),
    finishStep('As F1 states, booking bk_9 has room 12 on Tuesday, and as F2 explains, '
      + 'nothing else changed.')
  ]);
  const { engine } = caseRig({ model });

  const r = await engine.chat('s1', 'check booking bk_9');
  expect(r.corrections.filter(c => c.kind === 'redrive'
    && c.guardName === 'figureIsGrounded')).toEqual([]);
  expect(r.text).toContain('As F1 states');
});
