/** The tool list is the law: on an act turn the finish is not among the tools until a
 *  non-read attempt stands; a finish called anyway is refused with the correction; on
 *  no/unclear turns nothing changes. */
import { test, expect } from 'vitest';
import { callStep, finishStep, payingDesk } from '../fixtures/scripted-model.js';
import { BOOKING_SURFACE, testEngine } from '../fixtures/compiled-agents.js';

test('an act turn withholds the finish until a write attempt stands', async () => {
  const model = payingDesk([
    finishStep('All set, trust me.', []),
    callStep('sendEmail', { to: 'ana@example.com' }),
    finishStep('Email sent.', [{ tool: 'sendEmail', target: 'ana@example.com', word: 'done' }])
  ]);
  const { engine } = testEngine({ model, guards: [] });
  const r = await engine.chat('s1', 'email ana@example.com the confirmation', { act: 'yes' });
  expect('acts' in r).toBe(true);
  if (!('acts' in r)) return;
  expect(model.seen[0].tools.some(t => t.name === 'finish')).toBe(false);
  expect(r.corrections.some(c => c.kind === 'redrive'
    && c.guardName === 'finishWithheld')).toBe(true);
  expect(model.seen[2].tools.some(t => t.name === 'finish')).toBe(true);
  expect(r.closedBy).toBe('model');
});

test('a no turn and an unclear turn keep the finish on the table', async () => {
  for (const act of ['no', 'unclear'] as const) {
    const model = payingDesk([finishStep('Here is what the records say.', [])]);
    const { engine } = testEngine({ model, guards: [] });
    const r = await engine.chat('s1', 'what is on file?', { act });
    expect('acts' in r && r.closedBy).toBe('model');
    expect(model.seen[0].tools.some(t => t.name === 'finish')).toBe(true);
  }
});
