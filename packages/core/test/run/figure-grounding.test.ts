import { test, expect } from 'vitest';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { caseRig } from '../fixtures/case-rig.js';

// Every figure the message states is one the records carry; a report the settled
// record contradicts never delivers. Both are corrections that TEACH — the redrive
// carries the reason, and the corrected attempt is what reaches the operator.

test('a figure no record carries is corrected — the redrive names it', async () => {
  const model = new ScriptedModel([
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
  const model = new ScriptedModel([
    callStep('getBooking', { id: 'bk_9' }),
    finishStep('Room 12.0 on Tuesday.')
  ]);
  const { engine } = caseRig({ model });

  const r = await engine.chat('s1', 'check booking bk_9');
  expect(r.corrections.filter(c => c.guardName === 'figureIsGrounded')).toEqual([]);
  expect(r.text).toBe('Room 12.0 on Tuesday.');
});

test('a report the settled record contradicts is corrected, never delivered', async () => {
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_66' }),
    finishStep('The cancellation went through.',
      [{ tool: 'cancelBooking', target: 'bk_66', word: 'done' }]),
    finishStep('The cancellation could not run — the booking is under maintenance.',
      [{ tool: 'cancelBooking', target: 'bk_66', word: 'refused' }]),
    { calls: [], text: '' },
    { calls: [], text: '' }
  ]);
  const { engine } = caseRig({ model });

  const r = await engine.chat('s1', 'cancel bk_66');
  expect(r.corrections.some(c => c.kind === 'redrive'
    && c.guardName === 'reportContradictsRecord')).toBe(true);
  expect(r.text).not.toContain('went through');
});
