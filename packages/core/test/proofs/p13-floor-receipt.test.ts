import { test, expect } from 'vitest';
import type { ModelPort } from '../../src/contract/ports.js';
import type { Act } from '../../src/contract/vocabulary.js';
import { world } from '../../src/world/world.js';
import { WorldBuilder } from '../../src/world/world-builder.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { AgentFactory } from '../../src/cards/agent-factory.js';
import type { DomainContract } from '../../src/cards/cards.js';
import { Engine } from '../../src/run/engine.js';
import { ModelSeat } from '../../src/run/model-seat.js';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { assembleFacts } from '../../src/run/delivery-facts.js';
import { callStep } from '../fixtures/scripted-model.js';
import { scriptedTargets } from '../fixtures/compiled-agents.js';

// P13 — a done write is never silent at the floor. Its receipt is a fact whatever the
// answer put into the sentence — a record rendered as JSON included — and a receipt the
// answer could not fill falls back to the act's own sentence. "Nothing changed" is the
// floor's word only for a turn in which nothing ran.

const QUOTES = world({
  records: { quotes: { qt_1: { tier: 'silver', status: 'OPEN' } } },
  reads: { getQuote: { form: 'get', entity: 'quotes', label: 'Look up a quote' } },
  writes: { rateQuote: { form: 'run', entity: 'quotes', label: 'Rate a quote' } },
  presets: { standard: [] }
}, {
  rateQuote: ({ args }) => ({
    result: { quote: { id: typeof args.id === 'string' ? args.id : '', tier: 'gold' } },
    patches: []
  })
});

function rig(model: ModelPort, contract: Partial<DomainContract>) {
  const built = new WorldBuilder().build(QUOTES);
  const compiled = new AgentFactory().governed(
    { name: 'clerk', persona: 'You are the quotes desk.' },
    { name: 'quotes', ...contract }, factsFromWorld(QUOTES));
  const targets = scriptedTargets(1);
  const seat = ModelSeat.create(targets, targets[0].id, () => model);
  return Engine.create({ compiled, toolPort: built, seat });
}

const idle = { calls: [], text: '' };
const NOTHING = 'Nothing here reaches what was asked, and nothing changed.';

function doneWrite(owed: Act['owed']): Act {
  return {
    id: 'a1', turn: 1, origin: 'model', call: { tool: 'rateQuote', args: { id: 'qt_1' }, key: 'k1' },
    effect: 'write', said: 'yes', status: 'done', reason: null, evidence: 'executor',
    sentence: 'rateQuote(qt_1) — done', owed, result: { quote: { id: 'qt_1', tier: 'gold' } }, questionId: null, guard: null
  };
}

test('P13a — a receipt carrying a record rendered as JSON is a fact', () => {
  const facts = assembleFacts([doneWrite({ kind: 'receipt', text: 'Rated {"id":"qt_1","tier":"gold"}.' })], [], [], []);
  expect(facts.map(f => [f.kind, f.text])).toEqual([['receipt', 'Rated {"id":"qt_1","tier":"gold"}.']]);
});

test('P13b — a receipt the answer could not fill falls back to the act\'s own sentence', () => {
  const facts = assembleFacts([doneWrite({ kind: 'receipt', text: 'Rated for {result.post}.' })], [], [], []);
  expect(facts.map(f => [f.kind, f.text])).toEqual([['receipt', 'The rateQuote call ran and took effect.']]);
});

test('P13c — the floor after a done write speaks its receipt, never "nothing changed"', async () => {
  const model = new ScriptedModel([callStep('rateQuote', { id: 'qt_1' }), idle, idle, idle, idle, idle, idle, idle]);
  const engine = rig(model, { disclosure: { rateQuote: { after: 'Rated {result.quote}.' } } });

  const r = await engine.chat('s1', 'rate qt_1');

  expect(r.closedBy).toBe('engine');
  expect(r.acts.filter(a => a.status === 'done' && a.effect !== 'read')).toHaveLength(1);
  expect(r.text).toContain('Rated {"id":"qt_1","tier":"gold"}.');
  expect(r.text).not.toContain(NOTHING);
});

test('P13d — a turn in which nothing ran still closes on the nothing-owed sentence', async () => {
  const model = new ScriptedModel([idle, idle, idle, idle, idle, idle]);
  const engine = rig(model, {});

  const r = await engine.chat('s1', 'hello');

  expect(r.closedBy).toBe('engine');
  expect(r.text).toContain(NOTHING);
});
