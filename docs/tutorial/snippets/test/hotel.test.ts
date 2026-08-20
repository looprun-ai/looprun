/** Every claim the tutorial makes about the hotel, asserted against the real engine
 *  over a scripted model — the lessons quote these files, so a lesson that drifts
 *  from the engine fails here. */
import { test, expect } from 'vitest';
import { LoopRunAgent } from 'looprun';
import type { ModelStep } from 'looprun';
import { pairing } from '@looprun-ai/eval';
import { hotel, gatedHotel } from '../hotel/world.js';
import { concierge, hotelContract } from '../hotel/cards.js';

const call = (tool: string, args: Record<string, unknown>): ModelStep =>
  ({ calls: [{ tool, args }], text: '' });
const finish = (message: string,
  report: readonly { tool: string; target: string; word: string }[] = []): ModelStep =>
  ({ calls: [{ tool: 'finish', args: { message, report } }], text: '' });

test('lesson 2 — a destructive tool is held, and the question carries a code', async () => {
  const agent = new LoopRunAgent({
    spec: concierge, world: hotel,
    model: { scripted: { steps: [
      call('cancelBooking', { id: 'bk_1' }),
      finish('I can cancel bk_1, but that needs your OK first.',
        [{ tool: 'cancelBooking', target: 'bk_1', word: 'held' }])
    ] } }
  });

  const reply = await agent.generate('Please cancel booking bk_1.', { session: 'lesson2' });

  expect(reply.loopRun.acts[0]).toMatchObject({
    call: { tool: 'cancelBooking' }, status: 'not-done', reason: 'held', evidence: 'engine'
  });
  const question = reply.loopRun.questions.issued[0];
  expect(reply.text).toContain(question.code);
});

test('lesson 2 — the typed approval releases exactly that call', async () => {
  const agent = new LoopRunAgent({
    spec: concierge, world: hotel,
    model: { scripted: { steps: [
      call('cancelBooking', { id: 'bk_1' }),
      finish('That needs your OK first.',
        [{ tool: 'cancelBooking', target: 'bk_1', word: 'held' }]),
      { calls: [], text: '' },
      finish('Cancelled the Blue Room on Friday.',
        [{ tool: 'cancelBooking', target: 'bk_1', word: 'done' }])
    ] } }
  });

  const held = await agent.generate('Please cancel booking bk_1.', { session: 'lesson2b' });
  const code = held.loopRun.questions.issued[0].code;
  const done = await agent.generate(`approve ${code}`, { session: 'lesson2b' });

  expect(done.loopRun.acts[0]).toMatchObject({
    call: { tool: 'cancelBooking' }, origin: 'licence', status: 'done'
  });
});

test('lesson 3 — the owed read is collected by the engine, in one forced micro-step', async () => {
  const agent = new LoopRunAgent({
    spec: concierge, contract: hotelContract, world: hotel,
    model: { scripted: { steps: [
      // The model goes straight for the cancel. `onlyAfter` owes getInvoice, so the
      // engine stops and asks the model for THAT ONE call before anything else runs.
      call('cancelBooking', { id: 'bk_1' }),
      call('getInvoice', { id: 'bk_1' }),
      finish('240 is still owed on bk_1. Shall I cancel it?',
        [{ tool: 'cancelBooking', target: 'bk_1', word: 'held' }])
    ] } }
  });

  const reply = await agent.generate('Cancel bk_1 right now.', { session: 'lesson3' });

  const order = reply.loopRun.acts.map(a => a.call.tool);
  expect(order).toContain('getInvoice');
  expect(order.indexOf('getInvoice')).toBeLessThan(order.lastIndexOf('cancelBooking'));
  // The debt was the engine's to collect: the act carries the engine as its origin.
  expect(reply.loopRun.acts.find(a => a.call.tool === 'getInvoice')?.origin).toBe('engine');
});

test('lesson 4 — the census carries the authored guards, the engine floor, and the limits', async () => {
  const agent = new LoopRunAgent({
    spec: concierge, contract: hotelContract, world: hotel,
    model: { scripted: { steps: [finish('hello')] } }
  });

  // The census exists once construction settles, which the first turn awaits.
  await agent.generate('hello', { session: 'lesson4' });
  const census = agent.guards();
  const names = census.guards.map(g => g.name);

  // authored on the concierge spec, where the system prefix carries its sentence
  expect(names).toContain('no-promises');
  // installed by the engine itself — an author never declares these
  expect(names).toContain('questionAnswered');
  expect(names).toContain('confirmFirst:cancelBooking');
  // every guard prints the one sentence that is also its denial
  expect(census.guards.every(g => g.rule.length > 0)).toBe(true);
  // the rewrites are their own section, and the limits are resolved
  expect(census.rewrites.map(r => r.kind)).toContain('maskPattern');
  expect(census.limits.destructive).toBe(1);
});

test('lesson 6 — a world gate refuses a checked-in booking, whatever the user says', async () => {
  const agent = new LoopRunAgent({
    spec: concierge, world: gatedHotel,
    model: { scripted: { steps: [
      call('cancelBooking', { id: 'bk_9' }),
      finish('I could not cancel bk_9.'),
      finish('I could not cancel bk_9.'),
      finish('I could not cancel bk_9.')
    ] } }
  });

  const reply = await agent.generate('Cancel bk_9, the guest never showed up.', { session: 'lesson6' });

  const act = reply.loopRun.acts.find(a => a.call.tool === 'cancelBooking');
  expect(act?.status).not.toBe('done');
});

test('the hotel snippet passes the pairing lint the lesson teaches', () => {
  expect(pairing(new URL('../hotel', import.meta.url).pathname)).toEqual([]);
});
