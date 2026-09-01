import { test, expect } from 'vitest';
import type { Act, CallCtx } from '../../src/contract/vocabulary.js';
import { NO_READS } from '../../src/contract/vocabulary.js';
import { AgentFactory } from '../../src/cards/agent-factory.js';
import { needs } from '../../src/cards/catalog.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { Rulebook } from '../../src/run/rulebook.js';
import { HOSTILE } from '../fixtures/hostile-world.js';

// The one owed-read declaration: the read, its args as declared renames of the held
// call's own values, the pick, and the condition — the engine fills and runs the read itself.

const FACTS = factsFromWorld(HOSTILE);
const f = new AgentFactory();

const ctx = (turnActs: readonly Act[] = []): CallCtx => ({
  call: { tool: 'cancelBooking', args: { id: 'bk_9' }, key: 'cancel:bk_9' },
  effect: 'destructive', consented: false, reads: NO_READS,
  userText: 'cancel bk_9', userTexts: ['cancel bk_9'], turnActs, pastActs: [] });

const gated = (extra: Parameters<typeof needs>[1] = { read: 'getBooking', args: { bookingId: 'id' } }) =>
  f.governed({ name: 'a', persona: 'p' }, { name: 'd', guards: [needs('cancelBooking', extra)] }, FACTS);

test('an unpaid needs owes its read with the declared renames resolved', () => {
  const verdict = new Rulebook(gated()).checkPreTool(ctx());
  expect(verdict).toMatchObject({ kind: 'owe',
    reads: [{ alias: 'getBooking', tool: 'getBooking', args: { bookingId: 'bk_9' } }] });
});

test('a paid needs stands down and the consent question opens', () => {
  const done = { id: 'a_1', call: { tool: 'getBooking', args: { bookingId: 'bk_9' }, key: 'g' },
    effect: 'read', status: 'done', result: {},
    sentence: 'getBooking — done' } as unknown as Act;
  expect(new Rulebook(gated()).checkPreTool(ctx([done]))).toMatchObject({ kind: 'hold' });
});

test('a read attempted without success this turn refuses in words', () => {
  const failed = { id: 'a_1', call: { tool: 'getBooking', args: { bookingId: 'bk_9' }, key: 'g' },
    effect: 'read', status: 'not-done', reason: 'refused',
    sentence: 'getBooking — not-done' } as unknown as Act;
  const verdict = new Rulebook(gated()).checkPreTool(ctx([failed]));
  expect(verdict).toMatchObject({ kind: 'refuse', guardName: 'needs:cancelBooking' });
});

test('a when that answers false stands the whole guard down', () => {
  const verdict = new Rulebook(gated({ read: 'getBooking', args: { bookingId: 'id' },
    when: () => false })).checkPreTool(ctx());
  expect(verdict).toMatchObject({ kind: 'hold' });
});

test('a when that cannot tell binds fail-closed', () => {
  const verdict = new Rulebook(gated({ read: 'getBooking', args: { bookingId: 'id' },
    when: () => null })).checkPreTool(ctx());
  expect(verdict).toMatchObject({ kind: 'owe' });
});

test('the relation lands in the disclosure binding under the read alias', () => {
  expect(gated().disclosureBindings['cancelBooking'].needs['getBooking'])
    .toMatchObject({ tool: 'getBooking', args: { bookingId: 'id' } });
});

test('a doubled alias — disclosure needs AND a needs guard — throws at construction', () => {
  expect(() => f.governed({ name: 'a', persona: 'p' },
    { name: 'd',
      guards: [needs('cancelBooking', { read: 'getBooking', args: { bookingId: 'id' } })],
      disclosure: { cancelBooking: { needs: { getBooking: 'getBooking' } } } }, FACTS))
    .toThrow(/one declaration, one home/);
});
