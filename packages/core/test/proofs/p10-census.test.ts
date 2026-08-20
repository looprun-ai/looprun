import { test, expect } from 'vitest';
import { maxCalls, onlyAfter } from '../../src/cards/catalog.js';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { BOOKING_SURFACE, install, testEngine } from '../fixtures/compiled-agents.js';

// P10 · R1.5 — guards() returns THE SAME guard objects the phase checks iterate;
// the census is never a parallel copy.
test('the census rows are the very objects the rulebook runs, in priority order', () => {
  const inputGuard = install(
    { name: 'no-shouting', rule: 'Read the text calmly.', on: 'input', deny: () => null },
    'spec', 'custom');
  const only = onlyAfter('cancelBooking', 'getBooking').compile('contract', BOOKING_SURFACE);
  const max = maxCalls('sendEmail', 1, { scope: 'conversation', reason: 'One email, ever.' })
    .compile('contract', BOOKING_SURFACE);
  const { engine } = testEngine({ model: new ScriptedModel([]), guards: [inputGuard, only, max] });

  const first = engine.guards();
  const second = engine.guards();

  expect(first.guards.slice(0, 3).map(g => g.name))
    .toEqual(['no-shouting', 'onlyAfter:cancelBooking', 'maxCalls:sendEmail']);
  expect(first.guards.slice(3).every(g => g.home === 'engine')).toBe(true);
  first.guards.forEach((g, i) => expect(second.guards[i]).toBe(g));
  expect(first.guards[1]).toBe(only);
  expect(first.guards[2]).toBe(max);
  expect(first.limits).toEqual({ calls: 10, destructive: 1, retries: 2, questionTurns: 3 });
  expect(first.rewrites).toEqual([]);
  expect(first.guards[1].installedBecause).toBe('declared on the contract card');
});
