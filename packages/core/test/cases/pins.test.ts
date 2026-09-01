import { test, expect } from 'vitest';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep, payingDesk } from '../fixtures/scripted-model.js';
import { maskPattern, precondition } from '../../src/cards/catalog.js';
import { AgentFactory } from '../../src/cards/agent-factory.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { world } from '../../src/world/world.js';
import { WorldBuilder } from '../../src/world/world-builder.js';
import { Engine } from '../../src/run/engine.js';
import { ModelSeat } from '../../src/run/model-seat.js';
import { scriptedTargets } from '../fixtures/compiled-agents.js';
import { caseRig } from '../fixtures/case-rig.js';

// The inherited-agenda pins that no earlier suite carries.

test('a precondition refuses what this conversation has not read', async () => {
  const { compiled, TWO } = twoEntityRig();
  const model = payingDesk([
    callStep('cancelBooking', { id: 'x_1' }),
    finishStep('The booking was not read yet.', [{ tool: 'cancelBooking', target: 'x_1', word: 'refused' }]),
    { calls: [], text: '' },
    { calls: [], text: '' }
  ]);
  const r = await twoEntityChat(compiled, TWO, model, 'cancel x_1');
  expect(r.acts[0]).toMatchObject({ status: 'not-done', reason: 'blocked' });
  expect(r.acts[0].sentence).toContain('read it first');
});

test('the answer a read returned licenses the precondition, and consent asks', async () => {
  const { compiled, TWO } = twoEntityRig();
  const model = payingDesk([
    callStep('getBooking', { id: 'x_1' }),
    callStep('cancelBooking', { id: 'x_1' }),
    { calls: [], text: '' }, { calls: [], text: '' }, { calls: [], text: '' },
    { calls: [], text: '' }, { calls: [], text: '' }, { calls: [], text: '' },
    { calls: [], text: '' }, { calls: [], text: '' }, { calls: [], text: '' },
    { calls: [], text: '' }, { calls: [], text: '' }, { calls: [], text: '' }
  ]);
  const r = await twoEntityChat(compiled, TWO, model, 'read and cancel x_1');
  expect(r.acts[0]).toMatchObject({ call: { tool: 'getBooking' }, status: 'done' });
  expect(r.acts.at(-1)).toMatchObject({ status: 'not-done', reason: 'held' });
});

/** One world, one contract: the booking is paid on file, and the condition reads only
 *  what the conversation's own getBooking answered. */
function twoEntityRig(): { compiled: ReturnType<AgentFactory['governed']>;
                           TWO: ReturnType<typeof world> } {
  const TWO = world({
    records: {
      bookings: { x_1: { status: 'CONFIRMED', paid: true } },
      invoices: { x_1: { paid: false } }
    },
    reads: { getBooking: { form: 'get', entity: 'bookings', label: 'Look up a booking' } },
    destructive: { cancelBooking: { form: 'remove', entity: 'bookings',
      label: 'Cancel the booking' } }
  });
  const compiled = new AgentFactory().governed(
    { name: 'desk', persona: 'You are the desk.' },
    { name: 'two-entities', guards: [
      precondition('cancelBooking', ({ reads }) => {
        const answer = reads.latest('getBooking')?.answer as
          { paid?: boolean } | undefined;
        if (answer === undefined) return 'the booking was not read this conversation — read it first';
        return answer.paid === true;
      }, 'Only paid bookings cancel.')
    ] }, factsFromWorld(TWO));
  return { compiled, TWO };
}

async function twoEntityChat(compiled: ReturnType<AgentFactory['governed']>,
                             TWO: ReturnType<typeof world>, model: ReturnType<typeof payingDesk>,
                             text: string): ReturnType<Engine['chat']> {
  const targets = scriptedTargets(1);
  const built = new WorldBuilder().build(TWO);
  const engine = Engine.create({ compiled, toolPort: built, recordsPort: built,
    seat: ModelSeat.create(targets, targets[0].id, () => model) });
  return engine.chat('s1', text);
}

test('a contract rewrite fires on the delivered reply even with no secret declared', async () => {
  const model = new ScriptedModel([
    callStep('getBooking', { id: 'bk_66' }),
    finishStep('The card on file is 4111111111111111.', [])
  ]);
  const { engine } = caseRig({ model, contract: {
    rewrites: [maskPattern('card', /4111111111111111/)] } });

  const r = await engine.chat('s1', 'what card is on bk_66?');
  expect(r.text).not.toContain('4111111111111111');
  expect(r.text).toContain('****');
});
