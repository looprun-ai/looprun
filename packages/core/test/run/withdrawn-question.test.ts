import { test, expect } from 'vitest';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { closeIds, closingPort } from '../fixtures/close-step.js';
import { caseRig } from '../fixtures/case-rig.js';

// A desk that calls a destructive tool and then, writing the close, reports it `refused`
// has decided not to put it up. The engine takes the desk at its word: the question closes
// `withdrawn`, its code licenses nothing, and the operator reads the refusal alone — never
// a refusal with a code bolted on.

const HELD_CANCEL = { disclosure: { cancelBooking: {
  needs: { booking: 'getBooking' },
  before: 'Cancelling room {booking.room} is permanent.',
  after: 'Cancelled room {booking.room}.'
} } };

const REFUSED_ROW = [{ tool: 'cancelBooking', target: 'bk_9', word: 'refused' }];
const HELD_ROW = [{ tool: 'cancelBooking', target: 'bk_9', word: 'held' }];

test('a closing report that refuses the held call withdraws its question', async () => {
  const port = closingPort([callStep('cancelBooking', { id: 'bk_9' })],
    () => finishStep('I cannot cancel bk_9: a hold stands over it, so nothing ran.', REFUSED_ROW));
  const { engine } = caseRig({ model: port, contract: HELD_CANCEL });

  const r = await engine.chat('s1', 'cancel booking bk_9');

  const asked = r.questions.issued[0];
  expect(r.questions.closed).toEqual([{ id: asked.id, why: 'withdrawn' }]);
  expect(r.acts.at(-1)).toMatchObject({ call: { tool: 'cancelBooking' }, status: 'not-done',
    reason: 'blocked', evidence: 'engine' });
  expect(r.acts.at(-1)?.sentence).toContain('the desk withdrew it');
  expect(r.delivery.by).toBe('desk');
  expect(r.delivery.retried).toBe(false);
  expect(r.text).not.toContain(asked.code);
  expect(r.delivery.facts.map(f => f.kind)).not.toContain('code');
  expect(r.delivery.facts.map(f => f.kind)).not.toContain('ask');
  expect(r.delivery.facts.map(f => f.kind)).not.toContain('closure');
});

test('a desk that names the ask and the code it read still withdraws cleanly', async () => {
  // The real desk answers the instruction it read, naming F1 (the ask) and F2 (the code);
  // the withdrawal renumbers the facts and its claims follow them.
  const port = closingPort([callStep('cancelBooking', { id: 'bk_9' })],
    input => finishStep('I cannot cancel bk_9: a hold stands over it, so nothing ran.',
      REFUSED_ROW, closeIds(input)));
  const { engine } = caseRig({ model: port, contract: HELD_CANCEL });

  const r = await engine.chat('s1', 'cancel booking bk_9');

  expect(r.delivery.by).toBe('desk');
  expect(r.delivery.retried).toBe(false);
  expect(r.text).toBe('I cannot cancel bk_9: a hold stands over it, so nothing ran.');
});

test('the code of a withdrawn question licenses nothing', async () => {
  const port = closingPort([callStep('cancelBooking', { id: 'bk_9' }), finishStep('Nothing to do.')],
    () => finishStep('I cannot cancel bk_9: a hold stands over it, so nothing ran.', REFUSED_ROW));
  const { engine } = caseRig({ model: port, contract: HELD_CANCEL });

  const r1 = await engine.chat('s1', 'cancel booking bk_9');
  const r2 = await engine.chat('s1', r1.questions.issued[0].code);

  expect(r2.acts.some(a => a.origin === 'licence')).toBe(false);
  expect(r2.questions.consumed).toEqual([]);
  expect(r2.acts.filter(a => a.effect !== 'read')).toEqual([]);
});

test('a closing report that holds the call keeps the question and its code', async () => {
  const port = closingPort([callStep('cancelBooking', { id: 'bk_9' })],
    () => finishStep('Cancelling room 12 is permanent. To proceed, reply with the code shown.', HELD_ROW));
  const { engine } = caseRig({ model: port, contract: HELD_CANCEL });

  const r = await engine.chat('s1', 'cancel booking bk_9');

  expect(r.questions.closed).toEqual([]);
  expect(r.acts.at(-1)).toMatchObject({ reason: 'held' });
  expect(r.text).toContain(r.questions.issued[0].code);
});
