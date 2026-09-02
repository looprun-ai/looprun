/** The answered-ask licence: `valueFromUser` licenses a value the operator never wrote
 *  when the SAME act was refused over this argument on the latest past turn — the ask
 *  was delivered — and the operator has spoken since. The engine checks structure
 *  (a recorded refusal naming the argument, the turn boundary) and reads no word of
 *  any language; mapping "boa" to the record's own token is the model's work. */
import { test, expect } from 'vitest';
import type { Act, CallCtx, Json } from '../../src/contract/vocabulary.js';
import { NO_READS } from '../../src/contract/vocabulary.js';
import { valueFromUser } from '../../src/cards/catalog.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { HOSTILE } from '../fixtures/hostile-world.js';

const FACTS = factsFromWorld(HOSTILE);

function refusedAct(tool: string, sentence: string, turn: number): Act {
  return { id: 'a1', turn, origin: 'model',
    call: { tool, args: {}, key: 'k' }, effect: 'write', said: null,
    status: 'not-done', reason: 'blocked', evidence: 'engine', sentence,
    owed: null, result: null, questionId: null, guard: null } as unknown as Act;
}

function ctx(tool: string, args: Record<string, Json>, pastActs: readonly Act[],
             userTexts: readonly string[]): CallCtx {
  return { call: { tool, args, key: 'k' }, effect: 'write', consented: false,
    reads: NO_READS, userText: userTexts[0] ?? '', userTexts, turnActs: [], pastActs };
}

const g = valueFromUser('completeMaintenance', 'condition').compile('contract', FACTS);

test('a value the operator never wrote is licensed after the refused ask of the latest turn', () => {
  const past = [refusedAct('completeMaintenance',
    "completeMaintenance(ast_1) — not-done ('condition' is not written in the user's own words)", 4)];
  expect(g.deny(ctx('completeMaintenance', { condition: 'good' }, past,
    ['Saiu boa.', 'O serviço terminou — põe de volta em serviço.']))).toBeNull();
});

test('a missing-argument refusal carries the licence too', () => {
  const past = [refusedAct('completeMaintenance',
    "completeMaintenance(ast_1) — not-done (arg 'condition' is missing or not usable as declared)", 4)];
  expect(g.deny(ctx('completeMaintenance', { condition: 'good' }, past,
    ['Saiu boa.']))).toBeNull();
});

test('no refusal on record — the invented value stays refused', () => {
  expect(g.deny(ctx('completeMaintenance', { condition: 'good' }, [],
    ['O serviço terminou — põe de volta em serviço.']))).toContain('condition');
});

test('a stale refusal two turns back licenses nothing', () => {
  const past = [
    refusedAct('completeMaintenance',
      "completeMaintenance(ast_1) — not-done ('condition' is not written in the user's own words)", 2),
    refusedAct('getBooking', 'getBooking(bk_1) — not-done (x)', 4)];
  expect(g.deny(ctx('completeMaintenance', { condition: 'good' }, past,
    ['Saiu boa.']))).toContain('condition');
});

test('a refusal of another argument licenses nothing', () => {
  const past = [refusedAct('completeMaintenance',
    "completeMaintenance(ast_1) — not-done (arg 'assetId' is missing or not usable as declared)", 4)];
  expect(g.deny(ctx('completeMaintenance', { condition: 'good' }, past,
    ['Saiu boa.']))).toContain('condition');
});
