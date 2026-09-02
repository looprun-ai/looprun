/** THE ACT MICRO-STEP: a message that asks this house to change something ends its turn
 *  on the record, not in words. A desk about to close such a turn with nothing attempted
 *  gets ONE step carrying the cards that CHANGE something and the order to make the call.
 *  It calls, and the turn goes on with the attempt standing; or it calls nothing, and the
 *  turn ends the way a turn with no intent would. One step per turn, and none at all on a
 *  no or unclear turn. */
import { test, expect } from 'vitest';
import type { StepInput } from '../../src/contract/vocabulary.js';
import { callStep, finishStep, payingDesk } from '../fixtures/scripted-model.js';
import { testEngine } from '../fixtures/compiled-agents.js';

/** The act micro-step is the only step whose surface carries no finish. */
const actSteps = (seen: readonly StepInput[]): readonly StepInput[] =>
  seen.filter(s => !s.tools.some(t => t.name === 'finish'));

const names = (s: StepInput): readonly string[] => s.tools.map(t => t.name);

test('an act turn closed in words alone is driven to the call first', async () => {
  const model = payingDesk([
    finishStep('I cannot do that.', []),
    callStep('sendEmail', { to: 'ana@example.com' }),
    finishStep('Email sent.', [{ tool: 'sendEmail', target: 'ana@example.com', word: 'done' }])
  ]);
  const { engine } = testEngine({ model, guards: [] });

  const r = await engine.chat('s1', 'email ana@example.com the confirmation', { act: 'yes' });

  expect('acts' in r).toBe(true);
  if (!('acts' in r)) return;
  // Every main-loop step keeps the finish; exactly one step is the act micro-step, and
  // its surface is the cards that change something — no reads, no finish.
  expect(actSteps(model.seen).length).toBe(1);
  expect([...names(actSteps(model.seen)[0])].sort()).toEqual(['cancelBooking', 'sendEmail']);
  expect(r.acts.map(a => a.call.tool)).toContain('sendEmail');
  expect(r.closedBy).toBe('model');
});

test('a desk that calls nothing on the act step ends the turn as it would have', async () => {
  const model = payingDesk([
    finishStep('I cannot do that.', []),
    // the act micro-step: the desk answers with no call at all
    { calls: [], usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0,
      reasoningTokens: 0 } }
  ]);
  const { engine } = testEngine({ model, guards: [] });

  const r = await engine.chat('s1', 'post a paper copy to the customer', { act: 'yes' });

  expect('acts' in r).toBe(true);
  if (!('acts' in r)) return;
  expect(actSteps(model.seen).length).toBe(1);
  expect(r.acts.filter(a => a.effect !== 'read').length).toBe(0);
  expect(r.text).toBe('I cannot do that.');
  expect(r.closedBy).toBe('model');
});

test('a no turn and an unclear turn are never driven to a call', async () => {
  for (const act of ['no', 'unclear'] as const) {
    const model = payingDesk([finishStep('Here is what the records say.', [])]);
    const { engine } = testEngine({ model, guards: [] });

    const r = await engine.chat('s1', 'what is on file?', { act });

    expect('acts' in r && r.closedBy).toBe('model');
    expect(actSteps(model.seen).length).toBe(0);
    expect(model.seen[0].tools.some(t => t.name === 'finish')).toBe(true);
  }
});

test('the act step is spent once — a second refusal is not driven again', async () => {
  const model = payingDesk([
    finishStep('I cannot do that.', []),
    { calls: [], usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0,
      reasoningTokens: 0 } },
    finishStep('Still no.', [])
  ]);
  const { engine } = testEngine({ model, guards: [] });

  await engine.chat('s1', 'email ana@example.com the confirmation', { act: 'yes' });

  expect(actSteps(model.seen).length).toBe(1);
});
