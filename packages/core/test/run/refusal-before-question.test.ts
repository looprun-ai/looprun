import { test, expect } from 'vitest';
import type { Act, CallCtx } from '../../src/contract/vocabulary.js';
import { NO_READS } from '../../src/contract/vocabulary.js';
import { AgentFactory } from '../../src/cards/agent-factory.js';
import { needs, precondition } from '../../src/cards/catalog.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { Rulebook } from '../../src/run/rulebook.js';
import { HOSTILE } from '../fixtures/hostile-world.js';

// The preTool walk refuses before it asks: everything the records settle — a duplicate to
// restate, a read owed, a refusal — finishes across ALL covering rows before any question
// reaches the operator. An approval can never buy a refusal.

const FACTS = factsFromWorld(HOSTILE);
const f = new AgentFactory();

const spent: Act = { id: 'a_1', call: { tool: 'cancelBooking', args: { id: 'bk_9' }, key: 'cancel:bk_9' },
  effect: 'destructive', status: 'done', result: { id: 'bk_9' },
  sentence: 'cancelBooking(bk_9) — done' } as unknown as Act;

const call = (tool: string, args: Record<string, string>, key: string,
              turnActs: readonly Act[] = []): CallCtx => ({
  call: { tool, args, key }, effect: 'destructive', consented: false, reads: NO_READS,
  userText: 'cancel bk_9 and bk_2', userTexts: ['cancel bk_9 and bk_2'], turnActs, pastActs: [] });

test('a later deny beats an earlier hold — the budget refuses before consent asks', () => {
  const rulebook = new Rulebook(f.governed({ name: 'a', persona: 'p' }, undefined, FACTS));
  const verdict = rulebook.checkPreTool(call('cancelBooking', { id: 'bk_2' }, 'cancel:bk_2', [spent]));
  expect(verdict).toMatchObject({ kind: 'refuse', guardName: 'maxDestructive' });
});

test('a question opens where nothing refuses', () => {
  const rulebook = new Rulebook(f.governed({ name: 'a', persona: 'p' }, undefined, FACTS));
  const verdict = rulebook.checkPreTool(call('cancelBooking', { id: 'bk_2' }, 'cancel:bk_2'));
  expect(verdict).toMatchObject({ kind: 'hold' });
});

test('refusals keep declaration order — the earlier row speaks', () => {
  const rulebook = new Rulebook(f.governed(
    { name: 'a', persona: 'p',
      guards: [{ name: 'spec-no', rule: 'No.', on: 'preTool', deny: () => 'the spec refuses' }] },
    { name: 'd', guards: [precondition('cancelBooking', () => false, 'The contract refuses.')] },
    FACTS));
  const verdict = rulebook.checkPreTool(call('cancelBooking', { id: 'bk_2' }, 'cancel:bk_2'));
  expect(verdict).toMatchObject({ kind: 'refuse', guardName: 'spec-no' });
});

test('a duplicate restates before anything else speaks', () => {
  const rulebook = new Rulebook(f.governed({ name: 'a', persona: 'p' }, undefined, FACTS));
  const verdict = rulebook.checkPreTool(call('cancelBooking', { id: 'bk_9' }, 'cancel:bk_9', [spent]));
  expect(verdict).toEqual({ kind: 'restate', actId: 'a_1' });
});

test('an owed read still precedes the consent question', () => {
  const rulebook = new Rulebook(f.governed(
    { name: 'a', persona: 'p' },
    { name: 'd', guards: [needs('cancelBooking', { read: 'getBooking' })] }, FACTS));
  const verdict = rulebook.checkPreTool(call('cancelBooking', { id: 'bk_2' }, 'cancel:bk_2'));
  expect(verdict).toMatchObject({ kind: 'owe' });
});
