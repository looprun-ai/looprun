import { test, expect } from 'vitest';
import { callStep, finishStep, payingDesk } from '../fixtures/scripted-model.js';
import { caseRig } from '../fixtures/case-rig.js';

// M4 — the three tenses end to end: the ENGINE performs the declared read before the
// question (origin engine, audited), the before-tense fills its slots on the consent
// question beside the simulated result, the after-tense rides the licensed act's
// record line, and the later-tense stands in a following turn.

test('M4 — before with slots + simulated result, after on execution, later standing', async () => {
  const model = payingDesk([
    callStep('cancelBooking', { id: 'bk_9' }),
    { calls: [], text: '' },
    { calls: [], text: '' },
    { calls: [], text: '' },
    finishStep('Done as asked.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'done' }]),
    { calls: [], text: '' },
    { calls: [], text: '' },
    { calls: [], text: '' },
    finishStep('Anything else?', []),
    { calls: [], text: '' },
    { calls: [], text: '' },
  ]);
  const { engine, world } = caseRig({ model, contract: { disclosure: { cancelBooking: {
    needs: { booking: 'getBooking' },
    before: 'Cancelling room {booking.room} on {booking.day} is permanent.',
    after: 'Cancelled room {booking.room}.',
    later: 'Booking {args.id} stays cancelled.'
  } } } });

  const r1 = await engine.chat('s1', 'cancel booking bk_9');
  expect(world.audit()[0]).toMatchObject({ call: { tool: 'getBooking' } });
  expect(r1.acts.map(a => [a.call.tool, a.origin])).toEqual(
    [['getBooking', 'engine'], ['cancelBooking', 'model']]);
  expect(r1.text).toContain('Cancelling room 12 on Tuesday is permanent.');
  expect(r1.text).toContain('simulated result');
  expect(world.snapshot().bookings.bk_9).toBeDefined();

  const code = r1.questions.issued[0].code;
  const r2 = await engine.chat('s1', code);
  expect(r2.acts[0]).toMatchObject({ origin: 'licence', status: 'done' });
  expect(r2.text).toContain('Cancelled room 12.');
  expect(world.snapshot().bookings.bk_9).toBeUndefined();

  const r3 = await engine.chat('s1', 'thanks');
  expect(r3.text).toContain('Booking bk_9 stays cancelled.');
});
