import { test, expect } from 'vitest';
import type { ModelPort } from '../../src/contract/ports.js';
import type { ModelStep, StepInput, TurnRecord } from '../../src/contract/vocabulary.js';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { caseRig } from '../fixtures/case-rig.js';

// The owed facts of a turn gate the desk's OWN message. They ride numbered in the
// prompt, the finish names the ids its message expresses, and a miss redrives the
// same model on the same prefix with the record's own sentence quoted back. The
// figures of the text the operator actually reads are walked on both close paths.

/** The composer request is the step with no tool on the surface: the script never
 *  answers it, `compose` does — so a script step is always a main-loop step. */
function riggedPort(steps: readonly ModelStep[], compose: (brief: string, nth: number) => string):
  ModelPort & { readonly seen: StepInput[] } {
  const scripted = new ScriptedModel(steps);
  const seen: StepInput[] = [];
  let nth = 0;
  return { seen, step: async input => {
    seen.push(input);
    if (input.tools.length > 0) return scripted.step(input);
    const last = input.messages[input.messages.length - 1];
    nth += 1;
    return { calls: [], text: compose('text' in last ? last.text : '', nth) };
  } };
}

/** Echo the fact lines back without their numbering, so every id, figure and code the
 *  gate owes is carried, the composed path runs for real, and no list ordinal enters
 *  the prose as a figure of its own. */
function echoFacts(brief: string): string {
  const block = brief.slice(brief.indexOf('PROVEN FACTS'), brief.indexOf('\n\nDESK DRAFT'));
  return `Composed. ${block.split('\n').map(l => l.replace(/^\d+\. /u, '')).join(' ')}`;
}

const redrivesFor = (r: TurnRecord, guardName: string): readonly string[] =>
  r.corrections.flatMap(c => c.kind === 'redrive' && c.guardName === guardName ? [c.detail] : []);

const figureMarks = (r: TurnRecord): readonly string[] =>
  r.corrections.flatMap(c => c.kind === 'deliveryFigure' ? [c.detail] : []);

const HELD_CANCEL = { disclosure: { cancelBooking: {
  needs: { booking: 'getBooking' },
  before: 'Cancelling room {booking.room} is permanent.',
  after: 'Cancelled room {booking.room}.'
} } };

/** The same contract with another receipt sentence — the owed fact under test. */
const withReceipt = (after: string): typeof HELD_CANCEL =>
  ({ disclosure: { cancelBooking: { ...HELD_CANCEL.disclosure.cancelBooking, after } } });

// ---------------------------------------------------------------- the omission shapes

/** Five owed facts whose every literal already rides in the reply for another reason:
 *  the presence gate is clean, the figure walk is clean, and only the fact-id channel
 *  can see the sentence go missing. */
const OMISSION_SHAPES = [
  { name: 'a damage claim nobody opened',
    after: 'Cancelled room {booking.room}; no damage claim was opened for it.',
    omits: 'Room 12 is cancelled.',
    states: 'Room 12 is cancelled and no damage claim was opened for it.' },
  { name: 'a deposit nobody returned',
    after: 'Cancelled room {booking.room}; the deposit on room {booking.room} was not returned.',
    omits: 'Room 12 is cancelled.',
    states: 'Room 12 is cancelled; the deposit on room 12 was not returned.' },
  { name: 'a room that came back in order',
    after: 'Room {booking.room} came back in good order; no claim was opened.',
    omits: 'Room 12 came back in good order.',
    states: 'Room 12 came back in good order and no claim was opened.' },
  { name: 'work that no longer stands',
    after: 'Cancelled room {booking.room} on {booking.day}; no further work stands on it.',
    omits: 'Room 12 is cancelled on Tuesday.',
    states: 'Room 12 is cancelled on Tuesday and no further work stands on it.' },
  { name: 'the member the roster names',
    after: 'Cancelled room {booking.room}; the member on duty is the one the roster names.',
    omits: 'Room 12 is cancelled.',
    states: 'Room 12 is cancelled; the member on duty is the one the roster names.' }
] as const;

for (const shape of OMISSION_SHAPES) {
  test(`an owed fact the message drops is refused and quoted back — ${shape.name}`, async () => {
    const port = riggedPort([
      callStep('cancelBooking', { id: 'bk_9' }),
      finishStep(shape.omits, [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }], []),
      finishStep(shape.states, [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }], ['F1'])
    ], echoFacts);
    const { engine } = caseRig({ model: port, contract: withReceipt(shape.after) });

    const r1 = await engine.chat('s1', 'cancel booking bk_9');
    const r2 = await engine.chat('s1', r1.questions.issued[0].code);

    const owed = r2.delivery.facts.find(f => f.kind === 'receipt');
    expect(owed).toBeDefined();
    const refused = redrivesFor(r2, 'owedFactIsExpressed');
    expect(refused).toHaveLength(1);
    expect(refused[0]).toContain('F1');
    expect(refused[0]).toContain(owed?.text ?? '');
    expect(r2.finish?.message).toBe(shape.states);
  });
}

test('a finish that claims every owed id seals with no redrive', async () => {
  const shape = OMISSION_SHAPES[0];
  const port = riggedPort([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep(shape.states, [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }], ['F1'])
  ], echoFacts);
  const { engine } = caseRig({ model: port, contract: withReceipt(shape.after) });

  const r1 = await engine.chat('s1', 'cancel booking bk_9');
  const r2 = await engine.chat('s1', r1.questions.issued[0].code);

  expect(r2.corrections.filter(c => c.kind === 'redrive')).toEqual([]);
  expect(r2.closedBy).toBe('model');
});

// ---------------------------------------------------------------- the presence gate

test('an owed literal the message drops is refused before any composition', async () => {
  const after = 'Cancelled room {booking.room} on {booking.day}; 250 stays owed.';
  const port = riggedPort([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep('Room 12 is cancelled on Tuesday.',
      [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }], ['F1']),
    finishStep('Room 12 is cancelled on Tuesday and 250 stays owed.',
      [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }], ['F1'])
  ], echoFacts);
  const { engine } = caseRig({ model: port, contract: withReceipt(after) });

  const r1 = await engine.chat('s1', 'cancel booking bk_9');
  const r2 = await engine.chat('s1', r1.questions.issued[0].code);

  const refused = redrivesFor(r2, 'owedFactIsCarried');
  expect(refused).toHaveLength(1);
  expect(refused[0]).toContain('250');
  expect(r2.finish?.message).toContain('250 stays owed');
});

// ---------------------------------------------------------------- the list reads both ways

test('a fact id this turn owes nothing for is refused, and the owed ids are named back', async () => {
  const shape = OMISSION_SHAPES[0];
  const port = riggedPort([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep(shape.states, [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }],
      ['F1', 'F2', 'F7']),
    finishStep(shape.states, [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }], ['F1'])
  ], echoFacts);
  const { engine } = caseRig({ model: port, contract: withReceipt(shape.after) });

  const r1 = await engine.chat('s1', 'cancel booking bk_9');
  const r2 = await engine.chat('s1', r1.questions.issued[0].code);

  const refused = redrivesFor(r2, 'claimedFactIsOwed');
  expect(refused).toHaveLength(1);
  expect(refused[0]).toContain('F2, F7');
  expect(refused[0]).toContain('the ids numbered for you are F1');
  expect(r2.finish?.facts).toEqual(['F1']);
});

test('a turn owing nothing refuses a finish that claims a fact anyway', async () => {
  const port = riggedPort([
    callStep('getBooking', { id: 'bk_9' }),
    finishStep('Room 12 is booked on Tuesday.', [], ['F1']),
    finishStep('Room 12 is booked on Tuesday.', [], [])
  ], echoFacts);
  const { engine } = caseRig({ model: port });

  const r = await engine.chat('s1', 'check booking bk_9');

  const refused = redrivesFor(r, 'claimedFactIsOwed');
  expect(refused).toHaveLength(1);
  expect(refused[0]).toContain('nothing is numbered for you this turn');
});

test('a claimed id pays its debt through surrounding space and a lowercase letter', async () => {
  const shape = OMISSION_SHAPES[0];
  const port = riggedPort([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep(shape.states, [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }], [' f1 '])
  ], echoFacts);
  const { engine } = caseRig({ model: port, contract: withReceipt(shape.after) });

  const r1 = await engine.chat('s1', 'cancel booking bk_9');
  const r2 = await engine.chat('s1', r1.questions.issued[0].code);

  expect(r2.corrections.filter(c => c.kind === 'redrive')).toEqual([]);
  expect(r2.closedBy).toBe('model');
});

// ---------------------------------------------------------------- same prefix

test('the redrive runs the same model on the same prefix — the correction is appended', async () => {
  const shape = OMISSION_SHAPES[0];
  const port = riggedPort([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep(shape.omits, [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }], []),
    finishStep(shape.states, [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }], ['F1'])
  ], echoFacts);
  const { engine } = caseRig({ model: port, contract: withReceipt(shape.after) });

  const r1 = await engine.chat('s1', 'cancel booking bk_9');
  await engine.chat('s1', r1.questions.issued[0].code);

  const loop = port.seen.filter(s => s.tools.length > 0);
  const attempt = loop[loop.length - 2];
  const redrive = loop[loop.length - 1];
  expect(redrive.system).toBe(attempt.system);
  expect(redrive.messages.slice(0, attempt.messages.length)).toEqual(attempt.messages);
  expect(redrive.messages).toHaveLength(attempt.messages.length + 2);
  const correction = redrive.messages[redrive.messages.length - 1];
  expect('text' in correction ? correction.text : '').toContain(shape.after.replace('{booking.room}', '12'));
});

test('the owed facts reach the desk numbered, before it writes', async () => {
  const shape = OMISSION_SHAPES[0];
  const port = riggedPort([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep(shape.states, [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }], ['F1'])
  ], echoFacts);
  const { engine } = caseRig({ model: port, contract: withReceipt(shape.after) });

  const r1 = await engine.chat('s1', 'cancel booking bk_9');
  await engine.chat('s1', r1.questions.issued[0].code);

  const closing = port.seen.filter(s => s.tools.length > 0).slice(-1)[0];
  expect(closing.system).toContain('[F1] ');
  expect(closing.system).toContain('Cancelled room 12; no damage claim was opened for it.');
});

// ---------------------------------------------------------------- the delivered walk

test('a figure the delivered text states and no record carries is refused, then rewritten', async () => {
  const port = riggedPort([
    callStep('cancelBooking', { id: 'bk_9' })
  ], (brief, nth) => nth === 1
    ? `${echoFacts(brief)} Seven nights would come to 364.`
    : echoFacts(brief));
  const { engine } = caseRig({ model: port, contract: HELD_CANCEL });

  const r = await engine.chat('s1', 'cancel booking bk_9');

  const walked = figureMarks(r);
  expect(walked).toHaveLength(1);
  expect(walked[0]).toContain('364');
  expect(r.text).not.toContain('364');
  expect(r.delivery.retried).toBe(true);
});

test('a delivered figure ungrounded twice floors — the operator never reads it', async () => {
  const port = riggedPort([
    callStep('cancelBooking', { id: 'bk_9' })
  ], brief => `${echoFacts(brief)} Seven nights would come to 364.`);
  const { engine } = caseRig({ model: port, contract: HELD_CANCEL });

  const r = await engine.chat('s1', 'cancel booking bk_9');

  expect(r.delivery.by).toBe('floor');
  expect(r.text).not.toContain('364');
  expect(r.text).toContain(r.questions.issued[0].code);
});

test('the delivered walk charges the model close path too', async () => {
  const port = riggedPort([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep('Cancelled room 12.',
      [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }], ['F1']),
    finishStep('Cancelled room 12.',
      [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }], ['F1'])
  ], (brief, nth) => nth === 2                 // the ask composes first; this is the close
    ? `${echoFacts(brief)} And 364 stays owed on it.`
    : echoFacts(brief));
  const { engine } = caseRig({ model: port, contract: HELD_CANCEL });

  const r1 = await engine.chat('s1', 'cancel booking bk_9');
  const r2 = await engine.chat('s1', r1.questions.issued[0].code);

  expect(r2.closedBy).toBe('model');
  expect(figureMarks(r2).some(d => d.includes('364'))).toBe(true);
  expect(r2.text).not.toContain('364');
});

test('a delivered figure the records carry passes the walk', async () => {
  const port = riggedPort([
    callStep('cancelBooking', { id: 'bk_9' })
  ], brief => `${echoFacts(brief)} Room 12 stands cancelled.`);
  const { engine } = caseRig({ model: port, contract: HELD_CANCEL });

  const r = await engine.chat('s1', 'cancel booking bk_9');

  expect(figureMarks(r)).toEqual([]);
  expect(r.delivery.by).toBe('composer');
  expect(r.delivery.retried).toBe(false);
});
