import { test, expect } from 'vitest';
import { world } from '../../src/world/world.js';
import { WorldBuilder } from '../../src/world/world-builder.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { AgentFactory } from '../../src/cards/agent-factory.js';
import { ModelSeat } from '../../src/run/model-seat.js';
import { Engine } from '../../src/run/engine.js';
import { callStep, finishStep, payingDesk } from '../fixtures/scripted-model.js';
import { scriptedTargets } from '../fixtures/compiled-agents.js';

// A tool destructive ONLY on some of its calls declares the branch as DATA on its
// entry: a call matching `when` holds for consent; any other call runs as a write.
const LOCKS = world({
  records: { locks: { lock_1: { scope: 'room', active: true } },
             counters: { counters: { lock: 1 } } },
  destructive: {
    lockArea: { form: 'run', entity: 'locks', label: 'Locking down the entire building',
                when: { arg: 'scope', oneOf: ['building'] },
                schema: { type: 'object', properties: {
                  scope: { type: 'string' }, reason: { type: 'string' } },
                  required: ['scope', 'reason'] } }
  }
}, { lockArea: ctx => ({ result: { locked: ctx.args.scope }, patches: [] }) });

function rig(steps: ReturnType<typeof callStep>[]) {
  const built = new WorldBuilder().build(LOCKS);
  const compiled = new AgentFactory().governed(
    { name: 'frontdesk', persona: 'You are the front desk.' }, undefined,
    factsFromWorld(LOCKS));
  const targets = scriptedTargets(1);
  const seat = ModelSeat.create(targets, targets[0].id, () => payingDesk(steps));
  return Engine.create({ compiled, toolPort: built, seat });
}

test('a non-matching call runs unheld — the branch is a write', async () => {
  const engine = rig([
    callStep('lockArea', { scope: 'room', reason: 'safety' }),
    finishStep('The room is locked.', [{ tool: 'lockArea', target: '', word: 'done' }]),
    { calls: [], text: '' },
    { calls: [], text: '' }
  ]);
  const rec = await engine.chat('s1', 'lock the room');
  expect(rec.questions.issued).toHaveLength(0);
  expect(rec.acts[0]).toMatchObject({ call: { tool: 'lockArea' }, status: 'done' });
});

test('a matching call holds for consent like any destructive act', async () => {
  const engine = rig([
    callStep('lockArea', { scope: 'building', reason: 'evacuation drill' }),
    { calls: [], text: '' },
    { calls: [], text: '' },
    finishStep('I need your approval to lock down the building.',
      [{ tool: 'lockArea', target: '', word: 'held' }])
  ]);
  const rec = await engine.chat('s1', 'lock everything down');
  expect(rec.questions.issued).toHaveLength(1);
  expect(rec.acts[0]).toMatchObject({ call: { tool: 'lockArea' },
    status: 'not-done', reason: 'held' });
});
