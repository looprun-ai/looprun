import { test, expect } from 'vitest';
import type { ModelPort } from '../../src/contract/ports.js';
import type { Act, ReportLine } from '../../src/contract/vocabulary.js';
import { world } from '../../src/world/world.js';
import { WorldBuilder } from '../../src/world/world-builder.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { AgentFactory } from '../../src/cards/agent-factory.js';
import { Engine } from '../../src/run/engine.js';
import { ModelSeat } from '../../src/run/model-seat.js';
import { HonestyCheck } from '../../src/run/honesty-check.js';
import { callStep, finishStep, payingDesk } from '../fixtures/scripted-model.js';
import { scriptedTargets } from '../fixtures/compiled-agents.js';

// M8 — a report row on a TARGET-LESS act. A make mints its record; a run whose schema
// declares no target argument names none:
// the desk reports the record the answer returned, or the act by its own name. Such a
// row is the act's own row, not a question nobody put to the surface — only a target
// the call neither carried nor answered is impossible.

const QUOTES = world({
  records: { quotes: { qt_1: { tier: 'silver', status: 'OPEN' } } },
  creates: ['openQuote'],
  reads: { getQuote: { form: 'get', entity: 'quotes', label: 'Look up a quote' } },
  writes: {
    openQuote: { form: 'make', entity: 'quotes', label: 'Open a quote' },
    rateQuote: { form: 'run', entity: 'quotes', label: 'Rate a quote',
      schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'],
                additionalProperties: false } }
  },
  presets: { standard: [] }
}, {
  rateQuote: ({ args }) => ({
    result: { quote: { id: typeof args.id === 'string' ? args.id : '', tier: 'gold' } },
    patches: []
  })
});

function rig(model: ModelPort) {
  const built = new WorldBuilder().build(QUOTES);
  const compiled = new AgentFactory().governed(
    { name: 'clerk', persona: 'You are the quotes desk.' },
    { name: 'quotes' }, factsFromWorld(QUOTES));
  const targets = scriptedTargets(1);
  const seat = ModelSeat.create(targets, targets[0].id, () => model);
  return { engine: Engine.create({ compiled, toolPort: built, seat }), world: built };
}

const idle = { calls: [], text: '' };

test('M8a — the minted record named on a make row is the act\'s own row', async () => {
  const model = payingDesk([
    callStep('openQuote', { fields: { tier: 'gold' } }),
    finishStep('Opened quotes_m1.', [{ tool: 'openQuote', target: 'quotes_m1', word: 'done' }]),
    idle, idle, idle, idle
  ]);
  const { engine, world: built } = rig(model);

  const r = await engine.chat('s1', 'open a gold quote');

  expect(built.snapshot().quotes.quotes_m1).toEqual({ tier: 'gold' });
  expect(r.corrections.filter(c => c.kind === 'rowDropped')).toEqual([]);
  expect(r.closedBy).toBe('model');
  expect(r.finish?.report).toEqual([{ tool: 'openQuote', target: 'quotes_m1', word: 'done' }]);
});

test('M8b — the act\'s own name on a run row is the act\'s own row', async () => {
  const model = payingDesk([
    callStep('rateQuote', { id: 'qt_1' }),
    finishStep('Rated qt_1 gold.', [{ tool: 'rateQuote', target: 'rateQuote', word: 'done' }]),
    idle, idle, idle, idle
  ]);
  const { engine } = rig(model);

  const r = await engine.chat('s1', 'rate qt_1');

  expect(r.corrections.filter(c => c.kind === 'rowDropped')).toEqual([]);
  expect(r.closedBy).toBe('model');
});

test('M8c — a target the call neither carried nor answered is still impossible', async () => {
  const model = payingDesk([
    callStep('openQuote', { fields: { tier: 'gold' } }),
    finishStep('Opened quotes_m9.', [{ tool: 'openQuote', target: 'quotes_m9', word: 'done' }]),
    finishStep('Opened quotes_m1.', [{ tool: 'openQuote', target: 'quotes_m1', word: 'done' }]),
    idle, idle, idle
  ]);
  const { engine } = rig(model);

  const r = await engine.chat('s1', 'open a gold quote');

  expect(r.corrections).toContainEqual({ kind: 'rowDropped', tool: 'openQuote', target: 'quotes_m9' });
  expect(r.closedBy).toBe('model');
});

test('M8d — impossibleRows, row by row', () => {
  const check = new HonestyCheck(factsFromWorld(QUOTES));
  const made: Act = {
    id: 'a1', turn: 1, origin: 'model', call: { tool: 'openQuote', args: { fields: { tier: 'gold' } }, key: 'k1' },
    effect: 'write', said: 'yes', status: 'done', reason: null, evidence: 'executor',
    sentence: 'openQuote() — done', owed: null, result: { made: 'quotes_m1' }, questionId: null, guard: null
  };
  const row = (target: string): ReportLine => ({ tool: 'openQuote', target, word: 'done' });
  const dropped = (target: string) => check.impossibleRows([row(target)], [made]).length === 1;

  expect(dropped('')).toBe(false);
  expect(dropped('openQuote')).toBe(false);
  expect(dropped('quotes_m1')).toBe(false);
  expect(dropped('gold')).toBe(false);
  expect(dropped('quotes_m9')).toBe(true);
});
