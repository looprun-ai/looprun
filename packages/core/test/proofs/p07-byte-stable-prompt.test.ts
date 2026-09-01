import { test, expect } from 'vitest';
import { needs } from '../../src/cards/catalog.js';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { callStep, finishStep } from '../fixtures/scripted-model.js';
import { BOOKING_SURFACE, install, testEngine } from '../fixtures/compiled-agents.js';

// P7 · R7.3 — system() is byte-identical across turns; only the tail varies. The
// channel law: a CONTRACT tool guard's rule rides its tool's own card; a SPEC
// guard's rule rides the per-agent block of the shared prefix.
test('every step of every turn shares one byte-identical system prefix; only the tail varies', async () => {
  const model = new ScriptedModel([
    callStep('getBooking', { id: 'bk_1' }),
    finishStep('Found bk_1.'),
    finishStep('Nothing more.'),
    finishStep('Still nothing.')
  ]);
  const { engine } = testEngine({ model });

  await engine.chat('s1', 'check bk_1');
  await engine.chat('s1', 'thanks');
  await engine.chat('s1', 'bye');

  expect(model.seen.length).toBeGreaterThanOrEqual(4);
  const prefixes = model.seen.map(s => s.system.split('\nREADS: ')[0]);
  for (const p of prefixes) expect(p).toBe(prefixes[0]);
  const tails = model.seen.map(s => s.system.slice(prefixes[0].length));
  expect(tails[0]).not.toBe(tails[2]);
});

test('a contract tool guard rule rides the tool card; a spec rule rides the system prefix', async () => {
  const contractGuard = needs('cancelBooking', { read: 'getBooking' }).compile('contract', BOOKING_SURFACE);
  const specGuard = install(
    { name: 'no-prices', rule: 'The desk never discusses prices.', on: 'reply', deny: () => null },
    'spec', 'custom');
  const model = new ScriptedModel([finishStep('Hello.')]);
  const { engine } = testEngine({ model, guards: [specGuard, contractGuard] });

  await engine.chat('s1', 'hi');

  const input = model.seen[0];
  const cancelCard = input.tools.find(t => t.name === 'cancelBooking');
  expect(cancelCard?.does).toContain('Run getBooking before cancelBooking.');
  expect(input.system).toContain('The desk never discusses prices.');
  expect(input.system).not.toContain('Run getBooking before cancelBooking.');
  expect(input.tools.some(t => t.does.includes('never discusses prices'))).toBe(false);
});
