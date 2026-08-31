import { test, expect } from 'vitest';
import type { Act } from '../../src/contract/vocabulary.js';
import { AgentFactory } from '../../src/cards/agent-factory.js';
import { lieCheck, maskPattern, onlyAfter } from '../../src/cards/catalog.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { Rulebook } from '../../src/run/rulebook.js';
import { HOSTILE } from '../fixtures/hostile-world.js';

const FACTS = factsFromWorld(HOSTILE);
const f = new AgentFactory();

test('the guard walk prints spec → contract → consent → floor, each row with installedBecause', () => {
  const c = f.governed(
    { name: 'concierge', persona: 'You are the desk.',
      guards: [{ name: 'spec-rule', rule: 'Answer briefly.', on: 'reply', deny: () => null }] },
    { name: 'grandhotel', guards: [onlyAfter('cancelBooking', 'getBooking')] },
    FACTS);
  const names = c.guards.map(g => `${g.home}:${g.kind}`);
  expect(names[0]).toBe('spec:custom');
  expect(names[1]).toBe('contract:onlyAfter');
  const consentAt = names.indexOf('engine:confirmFirst');
  const floorAt = names.indexOf('engine:noDuplicateCall');
  expect(consentAt).toBeGreaterThan(1);
  expect(floorAt).toBeGreaterThan(consentAt);
  for (const g of c.guards) expect(g.installedBecause.length).toBeGreaterThan(3);
  expect(c.guards.filter(g => g.kind === 'argRequired').map(g => g.tools[0]).sort())
    .toEqual(['cancelBooking', 'compRoom', 'getBooking']);
  expect(c.guards.some(g => g.kind === 'maxDestructive')).toBe(true);
  expect(c.guards.some(g => g.kind === 'brokenReply')).toBe(true);
});

test('a re-proposed destructive call restates its first result; the budget refuses only fresh acts', () => {
  const c = f.governed({ name: 'a', persona: 'p' }, undefined, FACTS);
  const rulebook = new Rulebook(c);
  const first = { id: 'a_1', call: { tool: 'cancelBooking', args: { id: 'bk_9' }, key: 'cancel:bk_9' },
    effect: 'destructive', status: 'done', result: { id: 'bk_9' },
    sentence: 'cancelBooking(bk_9) — done' } as unknown as Act;
  const rerun = rulebook.checkPreTool({
    call: { tool: 'cancelBooking', args: { id: 'bk_9' }, key: 'cancel:bk_9' },
    effect: 'destructive', consented: false, state: null,
    userText: 'cancel bk_9', userTexts: ['cancel bk_9'],
    turnActs: [first], pastActs: [] });
  expect(rerun).toEqual({ kind: 'restate', actId: 'a_1' });

  const fresh = rulebook.checkPreTool({
    call: { tool: 'cancelBooking', args: { id: 'bk_2' }, key: 'cancel:bk_2' },
    effect: 'destructive', consented: true, state: null,
    userText: 'cancel bk_2 too', userTexts: ['cancel bk_9', 'cancel bk_2 too'],
    turnActs: [first], pastActs: [] });
  expect(fresh).toMatchObject({ kind: 'refuse', guardName: 'maxDestructive' });
});

test('limits merge per field — the spec wins over the contract over the defaults', () => {
  const c = f.governed({ name: 'a', persona: 'p', limits: { calls: 25 } },
                       { name: 'd', limits: { calls: 12, destructive: 2 } }, FACTS);
  expect(c.limits).toEqual({ calls: 25, destructive: 2, retries: 2, questionTurns: 3 });
});

test('nothing judged is auto-installed; a declared lieCheck lands in judged only', () => {
  const bare = f.governed({ name: 'a', persona: 'p', judgePass: true }, undefined, FACTS);
  expect(bare.judged).toEqual([]);
  const c = f.governed({ name: 'a', persona: 'p', judgePass: true, guards: [lieCheck()] },
    undefined, FACTS);
  expect(c.judged.map(g => g.name)).toEqual(['lieCheck']);
  expect(c.judged[0].judged).toBe(true);
  expect(c.guards.some(g => g.name === 'lieCheck')).toBe(false);
});

test('secrets compile to mask keys; disclosure needs normalize to resolved recipes', () => {
  const c = f.governed({ name: 'a', persona: 'p' },
    { name: 'd', secrets: ['cardNumber', 'customer.email', { path: 'pin', mode: 'omit' }],
      disclosure: { cancelBooking: { needs: { booking: 'getBooking' },
        before: 'Cancelling {booking.room} is permanent.' } } }, FACTS);
  expect(c.maskKeys).toEqual([
    { path: ['cardNumber'], mode: 'mask' },
    { path: ['customer', 'email'], mode: 'mask' },
    { path: ['pin'], mode: 'omit' }
  ]);
  expect(c.disclosureBindings.cancelBooking).toEqual({
    needs: { booking: { tool: 'getBooking', args: { id: 'id' } } },
    before: 'Cancelling {booking.room} is permanent.', after: null, later: null, cap: null,
    empty: null
  });
});

test('the contract wording override resolves once at compile', () => {
  const c = f.governed({ name: 'a', persona: 'p' },
    { name: 'd', wording: { status: { held: 'awaiting your say-so' } } }, FACTS);
  expect(c.wording.status.held).toBe('awaiting your say-so');
  expect(c.wording.sentence.approvalInstruction).toContain('code');
});

test('rewrites ride the compiled agent in declared order', () => {
  const c = f.governed({ name: 'a', persona: 'p' },
    { name: 'd', rewrites: [maskPattern('card', /\d{16}/)] }, FACTS);
  expect(c.rewrites.map(r => r.name)).toEqual(['card']);
});

test('ungoverned: promptParts and facts byte-identical; every check answers allow', () => {
  const spec = { name: 'a', persona: 'You are the desk.' };
  const contract = { name: 'd', voice: 'Warm.', facts: ['Bookings live in the store.'],
    guards: [onlyAfter('cancelBooking', 'getBooking')] };
  const g = f.governed(spec, contract, FACTS);
  const u = f.ungoverned(spec, contract, FACTS);
  expect(JSON.stringify(u.promptParts)).toBe(JSON.stringify(g.promptParts));
  expect(JSON.stringify(u.facts)).toBe(JSON.stringify(g.facts));
  expect(u.judged).toEqual([]);
  expect(u.rewrites).toEqual([]);
  const ctx = { call: { tool: 'cancelBooking', args: { id: 'bk_9' }, key: 'k' },
    effect: 'destructive' as const, consented: false, state: null, userText: '', userTexts: [],
    turnActs: [], pastActs: [] };
  for (const guard of u.guards) {
    expect(guard.deny(ctx)).toBeNull();
    expect(guard.hold?.(ctx) ?? null).toBeNull();
    expect(guard.owe?.(ctx) ?? null).toBeNull();
    expect(guard.restate?.(ctx) ?? null).toBeNull();
  }
});

test('the compiled agent is deep-frozen — the runtime never re-reads the authored form', () => {
  const c = f.governed({ name: 'a', persona: 'p' }, undefined, FACTS);
  expect(Object.isFrozen(c) && Object.isFrozen(c.guards) && Object.isFrozen(c.wording)).toBe(true);
});
