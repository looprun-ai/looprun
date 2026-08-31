import { test, expect } from 'vitest';
import type { ModelStep, StepInput, TurnRecord } from '../../src/contract/vocabulary.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { closeIds, closeWords, closingPort, isClose } from '../fixtures/close-step.js';
import { caseRig } from '../fixtures/case-rig.js';

// The engine closes a turn when it raises a consent question or spends the turn's
// retries. The words the operator reads are still the DESK'S: one more user message on
// the conversation it has been reading all turn, carrying the numbered owed facts and
// the order to write the closing reply. That output answers to the same deterministic
// funnel the model close answers to, and a refusal redrives the desk on the same prefix.

/** What a desk closing this turn reports of the held cancellation. */
const HELD_ROW = [{ tool: 'cancelBooking', target: 'bk_9', word: 'held' }];
const DONE_ROW = [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }];

/** A desk that pays its close: every fact in its own words, every id named, and the
 *  report the record accounts for. */
const pays = (input: StepInput, prefix = 'Closing.',
              report: readonly { tool: string; target: string; word: string }[] = HELD_ROW):
  ModelStep => finishStep(`${prefix} ${closeWords(input)}`, report, closeIds(input));

const redrivesFor = (r: TurnRecord, guardName: string): readonly string[] =>
  r.corrections.flatMap(c => c.kind === 'redrive' && c.guardName === guardName ? [c.detail] : []);

const HELD_CANCEL = { disclosure: { cancelBooking: {
  needs: { booking: 'getBooking' },
  before: 'Cancelling room {booking.room} is permanent.',
  after: 'Cancelled room {booking.room}.'
} } };

// ---------------------------------------------------------------- the question path

test('a consent question closes in the desk\'s own words', async () => {
  const port = closingPort([callStep('cancelBooking', { id: 'bk_9' })], input => pays(input));
  const { engine } = caseRig({ model: port, contract: HELD_CANCEL });

  const r = await engine.chat('s1', 'cancel booking bk_9');

  expect(r.closedBy).toBe('engine');
  expect(r.delivery.by).toBe('desk');
  expect(r.delivery.retried).toBe(false);
  expect(r.text.startsWith('Closing.')).toBe(true);
  expect(r.text).toContain(r.questions.issued[0].code);
  expect(r.text).not.toContain('— not-done');
});

// ---------------------------------------------------------------- the exhaustion path

test('a turn that spends its retries closes in the desk\'s own words', async () => {
  const port = closingPort([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep(''), finishStep(''), finishStep('')
  ], input => pays(input, 'Closing.', DONE_ROW));
  const { engine } = caseRig({ model: port, contract: HELD_CANCEL });

  const r1 = await engine.chat('s1', 'cancel booking bk_9');
  const r2 = await engine.chat('s1', r1.questions.issued[0].code);

  expect(r2.closedBy).toBe('engine');
  expect(r2.delivery.by).toBe('desk');
  expect(r2.text.startsWith('Closing.')).toBe(true);
  expect(r2.text).toContain('Cancelled room 12.');
});

// ---------------------------------------------------------------- the warm prefix

test('the close call keeps the tool cards and the prefix the desk has been reading', async () => {
  const port = closingPort([callStep('cancelBooking', { id: 'bk_9' })], input => pays(input));
  const { engine } = caseRig({ model: port, contract: HELD_CANCEL });

  await engine.chat('s1', 'cancel booking bk_9');

  const drive = port.seen.filter(s => !isClose(s)).at(-1);
  const close = port.seen.find(isClose);
  expect(drive).toBeDefined();
  expect(close).toBeDefined();
  expect(close?.tools.map(t => t.name)).toEqual(drive?.tools.map(t => t.name));
  expect(close?.tools.length).toBeGreaterThan(1);
  expect(close?.system).toBe(drive?.system);
  expect(close?.forceFinish).toBe(true);
  expect(close?.messages.slice(0, drive?.messages.length)).toEqual(drive?.messages);
});

// ---------------------------------------------------------------- the bracketed code

test('a fact id stapled into the close is refused, and the rewrite ships', async () => {
  const port = closingPort([callStep('cancelBooking', { id: 'bk_9' })],
    (input, nth) => nth === 1 ? pays(input, 'Closing [F1].') : pays(input));
  const { engine } = caseRig({ model: port, contract: HELD_CANCEL });

  const r = await engine.chat('s1', 'cancel booking bk_9');

  const refused = redrivesFor(r, 'engineLabelIsUnspoken');
  expect(refused).toHaveLength(1);
  expect(refused[0]).toContain('[F1]');
  expect(r.delivery.by).toBe('desk');
  expect(r.delivery.retried).toBe(true);
  expect(r.text).not.toContain('[F1]');
});

test('a tag this turn never numbered is unspeakable too — the shape is the law', async () => {
  const port = closingPort([callStep('cancelBooking', { id: 'bk_9' })],
    (input, nth) => nth === 1 ? pays(input, 'Closing [F7].') : pays(input));
  const { engine } = caseRig({ model: port, contract: HELD_CANCEL });

  const r = await engine.chat('s1', 'cancel booking bk_9');

  const refused = redrivesFor(r, 'engineLabelIsUnspoken');   // the turn numbers F1, F2
  expect(refused).toHaveLength(1);
  expect(refused[0]).toContain('[F7]');
  expect(r.delivery.by).toBe('desk');
  expect(r.text).not.toContain('[F7]');
});

test('the close instruction forbids bracketed codes in the words the operator reads', async () => {
  const port = closingPort([callStep('cancelBooking', { id: 'bk_9' })], input => pays(input));
  const { engine } = caseRig({ model: port, contract: HELD_CANCEL });

  await engine.chat('s1', 'cancel booking bk_9');

  const close = port.seen.find(isClose);
  const instruction = close?.messages.at(-1);
  const text = instruction !== undefined && 'text' in instruction ? instruction.text : '';
  expect(text).toContain('no bracketed codes');
  expect(text).toContain('[F1] ');
});

// ---------------------------------------------------------------- what the close is charged

test('the close is charged on its words, not on a report the turn never keeps', async () => {
  const port = closingPort([callStep('cancelBooking', { id: 'bk_9' })],
    input => pays(input, 'Closing.', []));       // a report accounting for no act at all
  const { engine } = caseRig({ model: port, contract: HELD_CANCEL });

  const r = await engine.chat('s1', 'cancel booking bk_9');

  expect(redrivesFor(r, 'claimIsComplete')).toEqual([]);
  expect(r.finish).toBeNull();                   // the engine closed it; no report is sealed
  expect(r.delivery.by).toBe('desk');
  expect(r.text.startsWith('Closing.')).toBe(true);
});

// ---------------------------------------------------------------- the fact-id redrive

test('an owed fact the close drops is refused with the record\'s own sentence', async () => {
  const port = closingPort([callStep('cancelBooking', { id: 'bk_9' })],
    (input, nth) => nth === 1
      ? finishStep(`Closing. ${closeWords(input)}`, [], closeIds(input).slice(0, 1))
      : pays(input));
  const { engine } = caseRig({ model: port, contract: HELD_CANCEL });

  const r = await engine.chat('s1', 'cancel booking bk_9');

  const refused = redrivesFor(r, 'owedFactIsExpressed');
  expect(refused).toHaveLength(1);
  expect(refused[0]).toContain('F2');
  expect(r.delivery.by).toBe('desk');
  expect(r.delivery.retried).toBe(true);
});

// ---------------------------------------------------------------- the floor

test('a close refused three times floors — nothing engine-known is lost', async () => {
  let asked = 0;
  const port = closingPort([callStep('cancelBooking', { id: 'bk_9' })],
    () => { asked += 1; return finishStep('Nothing to report.', HELD_ROW); });
  const { engine } = caseRig({ model: port, contract: HELD_CANCEL });

  const r = await engine.chat('s1', 'cancel booking bk_9');

  expect(asked).toBe(3);                       // one write, then two rewrites
  expect(r.delivery.by).toBe('floor');
  expect(r.delivery.retried).toBe(true);
  expect(r.text).toContain(r.questions.issued[0].code);
});

test('every refused close attempt puts its own words on the record', async () => {
  const port = closingPort([callStep('cancelBooking', { id: 'bk_9' })],
    (input, nth) => nth === 1 ? pays(input, 'Closing [F1].') : pays(input));
  const { engine } = caseRig({ model: port, contract: HELD_CANCEL });

  const r = await engine.chat('s1', 'cancel booking bk_9');

  const written = r.corrections.flatMap(c =>
    c.kind === 'closeRefused' ? [{ attempt: c.attempt, text: c.text }] : []);
  expect(written).toHaveLength(1);
  expect(written[0].attempt).toBe(0);
  expect(written[0].text).toContain('[F1]');   // the words the ruler refused, verbatim
  expect(r.delivery.by).toBe('desk');
});

test('a turn owing nothing floors without spending a call', async () => {
  const port = closingPort([finishStep(''), finishStep(''), finishStep('')],
    () => { throw new Error('the close step must not run'); });
  const { engine } = caseRig({ model: port });

  const r = await engine.chat('s1', 'hello');

  expect(r.delivery.by).toBe('floor');
  expect(port.seen.filter(isClose)).toHaveLength(0);
});

// ---------------------------------------------------------------- the delivered walk

test('a figure the close states and no record carries is refused, then rewritten', async () => {
  const port = closingPort([callStep('cancelBooking', { id: 'bk_9' })],
    (input, nth) => nth === 1
      ? pays(input, 'Closing. Seven nights would come to 364.')
      : pays(input));
  const { engine } = caseRig({ model: port, contract: HELD_CANCEL });

  const r = await engine.chat('s1', 'cancel booking bk_9');

  const walked = redrivesFor(r, 'figureIsGrounded');
  expect(walked).toHaveLength(1);
  expect(walked[0]).toContain('364');
  expect(r.text).not.toContain('364');
  expect(r.delivery.by).toBe('desk');
  expect(r.delivery.retried).toBe(true);
});
