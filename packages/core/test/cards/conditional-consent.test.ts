import { test, expect } from 'vitest';
import { world } from '../../src/world/world.js';
import { WorldBuilder } from '../../src/world/world-builder.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { AgentFactory } from '../../src/cards/agent-factory.js';
import { ModelSeat } from '../../src/run/model-seat.js';
import { Engine } from '../../src/run/engine.js';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { scriptedTargets } from '../fixtures/compiled-agents.js';

// A tool destructive ONLY on some of its calls declares the branch as DATA on its
// entry: a call matching `when` holds for consent; any other call runs as a write.
const FREEZES = world({
  records: { holds: { hold_1: { scope: 'asset', active: true } },
             counters: { counters: { hold: 1 } } },
  destructive: {
    placeHold: { form: 'run', entity: 'holds', label: 'Freezing the entire workspace',
                 when: { arg: 'scope', oneOf: ['workspace'] },
                 schema: { type: 'object', properties: {
                   scope: { type: 'string' }, reason: { type: 'string' } },
                   required: ['scope', 'reason'] } }
  }
}, { placeHold: ctx => ({ result: { placed: ctx.args.scope }, patches: [] }) });

function rig(steps: Parameters<typeof ScriptedModel.prototype.step>[0][] | ReturnType<typeof callStep>[]) {
  const built = new WorldBuilder().build(FREEZES);
  const compiled = new AgentFactory().governed(
    { name: 'compliance', persona: 'You are the compliance desk.' }, undefined,
    factsFromWorld(FREEZES));
  const targets = scriptedTargets(1);
  const seat = ModelSeat.create(targets, targets[0].id, () => new ScriptedModel(steps as never));
  return Engine.create({ compiled, toolPort: built, recordsPort: built, seat });
}

test('a non-matching call runs unheld — the branch is a write', async () => {
  const engine = rig([
    callStep('placeHold', { scope: 'asset', reason: 'safety' }),
    finishStep('The asset is frozen.', [{ tool: 'placeHold', target: '', word: 'done' }])
  ]);
  const rec = await engine.chat('s1', 'freeze the excavator');
  expect(rec.questions.issued).toHaveLength(0);
  expect(rec.acts[0]).toMatchObject({ call: { tool: 'placeHold' }, status: 'done' });
});

test('a matching call holds for consent like any destructive act', async () => {
  const engine = rig([
    callStep('placeHold', { scope: 'workspace', reason: 'litigation' }),
    { calls: [], text: '' },
    { calls: [], text: '' },
    finishStep('I need your approval to freeze the workspace.',
      [{ tool: 'placeHold', target: '', word: 'held' }])
  ]);
  const rec = await engine.chat('s1', 'freeze everything');
  expect(rec.questions.issued).toHaveLength(1);
  expect(rec.acts[0]).toMatchObject({ call: { tool: 'placeHold' },
    status: 'not-done', reason: 'held' });
});
