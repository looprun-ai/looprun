/** The declined act still answers: a `no_tool_called` report row runs the named act's
 *  own walk without executing — every deny becomes a refused act whose sentence is a
 *  spoken owed fact — and a turn with no write, no question and no declination row
 *  does not close. */
import { test, expect } from 'vitest';
import { precondition } from '../../src/cards/catalog.js';
import { callStep, finishStep, payingDesk } from '../fixtures/scripted-model.js';
import { BOOKING_SURFACE, testEngine } from '../fixtures/compiled-agents.js';

test('a named declination mints the walk refusal — the blocker speaks without execution', async () => {
  const guard = precondition('sendEmail', () => 'An open claim stands against this record.',
    'No mail goes out while a claim is open.').compile('contract', BOOKING_SURFACE);
  const declines = [{ tool: 'sendEmail', target: 'ana@example.com', word: 'no_tool_called' }];
  const model = payingDesk([
    finishStep('I am not sending that — a claim is open.', declines),
    finishStep('I am not sending that — a claim is open.', declines),
    finishStep('I am not sending that — a claim is open.', declines)
  ]);
  const { engine } = testEngine({ model, guards: [guard] });
  const r = await engine.chat('s1', 'email ana@example.com the confirmation');
  const declined = r.acts.find(a => a.call.tool === 'sendEmail');
  expect(declined).toBeDefined();
  expect(declined?.status).toBe('not-done');
  expect(declined?.origin).toBe('engine');
  expect(r.text).toContain('claim');
});
