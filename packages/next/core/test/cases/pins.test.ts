import { test, expect } from 'vitest';
import { ScriptedModel, callStep, finishStep } from '../fixtures/scripted-model.js';
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

test('precondition binds the tool OWN entity — two entities share the id x_1, the booking wins', async () => {
  const TWO = world({
    records: {
      bookings: { x_1: { status: 'CONFIRMED', paid: true } },
      invoices: { x_1: { paid: false } }
    },
    destructive: { cancelBooking: { form: 'remove', entity: 'bookings',
      label: 'Cancel the booking' } }
  });
  const facts = factsFromWorld(TWO);
  const compiled = new AgentFactory().governed(
    { name: 'desk', persona: 'You are the desk.' },
    { name: 'two-entities', guards: [
      precondition('cancelBooking', ({ record }) => record?.paid === true,
        'Only paid bookings cancel.')
    ] }, facts);
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'x_1' }),
    finishStep('Waiting for approval.', [{ tool: 'cancelBooking', target: 'x_1', word: 'held' }])
  ]);
  const targets = scriptedTargets(1);
  const built = new WorldBuilder().build(TWO);
  const engine = Engine.create({ compiled, toolPort: built, recordsPort: built,
    seat: ModelSeat.create(targets, targets[0].id, () => model) });

  const r = await engine.chat('s1', 'cancel x_1');
  // the booking record (paid: true) passed the check — had the invoice been read,
  // the call would have been blocked instead of held
  expect(r.acts[0]).toMatchObject({ status: 'not-done', reason: 'held' });
});

test('the simulated-result wording is a contract override away', async () => {
  const model = new ScriptedModel([
    callStep('cancelBooking', { id: 'bk_9' }),
    finishStep('Approval needed.', [{ tool: 'cancelBooking', target: 'bk_9', word: 'held' }])
  ]);
  const { engine } = caseRig({ model, contract: {
    wording: { sentence: { simulatedResult: 'A dry look at the outcome:' } } } });

  const r = await engine.chat('s1', 'cancel bk_9');
  expect(r.text).toContain('A dry look at the outcome:');
  expect(r.text).not.toContain('simulated result');
});

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
