import { test, expect } from 'vitest';
import type { Json } from '../../src/contract/vocabulary.js';
import { resultSatisfiesCondition } from '../../src/cards/catalog.js';
import { callStep, finishStep, payingDesk } from '../fixtures/scripted-model.js';
import { ScriptedModel } from '../../src/run/scripted-model.js';
import { BOOKING_SURFACE, testEngine } from '../fixtures/compiled-agents.js';

// A result check that fails is owed to the operator: the note rides the delivery with
// the check's own words where it spoke and the guard's rule where it did not, and a
// finish that does not express it is redriven — a result that fails its declared check
// is never reported as a plain success.

const RULE = 'sendEmail\'s own answer says whether the mail was delivered. When it was not, say '
  + 'so and name the bounce — never report a delivery the result does not show.';

/** The check the emitter writes: the bare empty string on failure, no words of its own. */
const silentCheck = resultSatisfiesCondition('sendEmail', ctx => {
  const result = ctx.result as { readonly [k: string]: Json } | null;
  return result?.delivered === 'yes' ? null : '';
});
const spokenCheck = resultSatisfiesCondition('sendEmail', ctx => {
  const result = ctx.result as { readonly [k: string]: Json } | null;
  return result?.delivered === 'yes' ? null : `the mail bounced: ${String(result?.bounce)}`;
});
const withRule = (guard: typeof silentCheck) =>
  ({ ...guard.compile('contract', BOOKING_SURFACE), rule: RULE });

const BOUNCING = { sendEmail: () => ({ result: { delivered: 'no', bounce: 'mailbox_full' }, done: 'yes' as const }) };
const DELIVERED = { sendEmail: () => ({ result: { delivered: 'yes' }, done: 'yes' as const }) };

test('a failed check with no words of its own owes the guard\'s rule as a note', async () => {
  const model = payingDesk([
    callStep('sendEmail', { to: 'ana@example.com' }),
    finishStep('Sent the confirmation to ana@example.com.',
      [{ tool: 'sendEmail', target: 'ana@example.com', word: 'done' }])
  ]);
  const { engine } = testEngine({ model, guards: [withRule(silentCheck)], behaviors: BOUNCING });

  const r = await engine.chat('s1', 'email ana@example.com the confirmation');

  expect(r.corrections).toContainEqual({ kind: 'postToolFinding',
    guardName: 'resultSatisfiesCondition:sendEmail', detail: '' });
  expect(r.delivery.facts).toContainEqual({ kind: 'note', text: RULE, state: null });
  expect(r.delivery.by).toBe('prose');
});

test('a check that spoke for itself owes its own words', async () => {
  const model = payingDesk([
    callStep('sendEmail', { to: 'ana@example.com' }),
    finishStep('The mail to ana@example.com bounced: mailbox_full.',
      [{ tool: 'sendEmail', target: 'ana@example.com', word: 'done' }])
  ]);
  const { engine } = testEngine({ model, guards: [withRule(spokenCheck)], behaviors: BOUNCING });

  const r = await engine.chat('s1', 'email ana@example.com the confirmation');

  expect(r.delivery.facts).toContainEqual({ kind: 'note', text: 'the mail bounced: mailbox_full',
    state: null });
});

test('a finish that does not express the note is redriven', async () => {
  // A bare script: the desk names the facts itself, and the first finish names none.
  const model = new ScriptedModel([
    callStep('sendEmail', { to: 'ana@example.com' }),
    finishStep('Sent the confirmation to ana@example.com.',
      [{ tool: 'sendEmail', target: 'ana@example.com', word: 'done' }], []),
    finishStep('Sent to ana@example.com, but it bounced.',
      [{ tool: 'sendEmail', target: 'ana@example.com', word: 'done' }], ['F1', 'F2'])
  ]);
  const { engine } = testEngine({ model, guards: [withRule(silentCheck)], behaviors: BOUNCING });

  const r = await engine.chat('s1', 'email ana@example.com the confirmation');

  const corrected = r.corrections.flatMap(c =>
    c.kind === 'redrive' && c.guardName === 'owedFactIsExpressed' ? [c.detail] : []);
  expect(corrected.some(d => d.includes('name F2') && d.includes(RULE))).toBe(true);
  expect(r.text).toBe('Sent to ana@example.com, but it bounced.');
});

test('a result that passes its check owes nothing', async () => {
  const model = payingDesk([
    callStep('sendEmail', { to: 'ana@example.com' }),
    finishStep('Sent the confirmation to ana@example.com.',
      [{ tool: 'sendEmail', target: 'ana@example.com', word: 'done' }])
  ]);
  const { engine } = testEngine({ model, guards: [withRule(silentCheck)], behaviors: DELIVERED });

  const r = await engine.chat('s1', 'email ana@example.com the confirmation');

  expect(r.corrections.some(c => c.kind === 'postToolFinding')).toBe(false);
  expect(r.delivery.facts.some(f => f.kind === 'note')).toBe(false);
});
