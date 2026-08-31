import { test, expect } from 'vitest';
import { CardError } from '../../src/contract/vocabulary.js';
import type { AgentSpec, DomainContract } from '../../src/cards/cards.js';
import { CardCheck } from '../../src/cards/card-check.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { fact } from '../fixtures/compiled-agents.js';
import { HOSTILE } from '../fixtures/hostile-world.js';

const FACTS = factsFromWorld(HOSTILE);
const check = (spec: AgentSpec, contract?: DomainContract, facts = FACTS) =>
  new CardCheck().check(spec, contract, facts);

const SPEC: AgentSpec = { name: 'concierge', persona: 'You are the desk.' };

test('every problem lands in ONE CardError — deny+judge and an underivable slot together', () => {
  try {
    check({ ...SPEC, guards: [{ name: 'no-prices', rule: 'Never discuss prices.', on: 'reply',
             deny: () => null, judgeQuery: 'Does the reply discuss prices?' }] },
          { name: 'grandhotel', disclosure: { cancelBooking: {
             needs: { booking: { tool: 'getBooking', args: { bookingRef: 'id' } } },
             before: 'Cancelling {booking.room} is permanent.' } } });
    throw new Error('expected CardError');
  } catch (e) {
    const codes = (e as CardError).problems.map(p => p.code);
    expect(codes).toContain('GUARD_BOTH_DENY_AND_JUDGE');
    expect(codes).toContain('SLOT_UNDERIVABLE');
  }
});

test('the string-form needs passes when the read accepts the held target arg', () => {
  expect(() => check(SPEC, { name: 'grandhotel', disclosure: { cancelBooking: {
    needs: { booking: 'getBooking' },
    before: 'Cancelling {booking.room} is permanent.' } } })).not.toThrow();
});

test('the object-form args map bridges differing names', () => {
  const mismatched = { tools: {
    getBooking: fact({ name: 'getBooking', effect: 'read', target: 'bookingRef',
      schema: { type: 'object', properties: { bookingRef: { type: 'string' } }, required: ['bookingRef'] } }),
    cancelBooking: fact({ name: 'cancelBooking', effect: 'destructive', target: 'id', label: 'Cancel',
      schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } })
  } } as const;
  expect(() => check(SPEC, { name: 'd', disclosure: { cancelBooking: {
    needs: { booking: { tool: 'getBooking', args: { bookingRef: 'id' } } } } } }, mismatched))
    .not.toThrow();
  try {
    check(SPEC, { name: 'd', disclosure: { cancelBooking: {
      needs: { booking: 'getBooking' } } } }, mismatched);
    throw new Error('expected CardError');
  } catch (e) {
    const p = (e as CardError).problems.find(x => x.code === 'SLOT_UNDERIVABLE');
    expect(p?.sentence).toContain('bookingRef');
    expect(p?.sentence).toContain("'id'");
  }
});

test('duplicate guard names, off-surface tools, judge phase, empty secrets, bad limits — all named', () => {
  try {
    check({ ...SPEC, guards: [
      { name: 'twice', rule: 'r1', on: 'reply' },
      { name: 'twice', rule: 'r2', on: 'reply' },
      { name: 'ghost-tool', rule: 'r', on: 'preTool', tool: 'teleport' },
      { name: 'early-judge', rule: 'r', on: 'preTool', judgeQuery: 'q?' }
    ] }, { name: 'd', secrets: [''], limits: { calls: 0 },
          disclosure: { teleport: {} } });
    throw new Error('expected CardError');
  } catch (e) {
    const codes = (e as CardError).problems.map(p => p.code);
    expect(codes).toContain('GUARD_NAME_DUP');
    expect(codes).toContain('TOOL_GUARD_OFF_SURFACE');
    expect(codes).toContain('GUARD_JUDGE_PHASE');
    expect(codes).toContain('SECRET_EMPTY');
    expect(codes).toContain('LIMIT_NOT_POSITIVE');
    expect(codes).toContain('DISCLOSURE_UNKNOWN_TOOL');
  }
});

test('a destructive tool with no label is LABEL_MISSING', () => {
  const bare = { tools: { nuke: fact({ name: 'nuke', effect: 'destructive', target: 'id' }) } };
  try {
    check(SPEC, undefined, bare);
    throw new Error('expected CardError');
  } catch (e) {
    expect((e as CardError).problems.map(p => p.code)).toContain('LABEL_MISSING');
  }
});

test('clean cards over the hostile surface pass silently', () => {
  expect(() => check(SPEC, { name: 'grandhotel', secrets: ['cardNumber'] })).not.toThrow();
});

test('a judged guard on a spec, with or without a tool, is lawful', () => {
  expect(() => check({ ...SPEC, judgePass: true, guards: [{ name: 'noLies',
    rule: 'Never claim an act that did not run.', on: 'reply',
    judgeQuery: 'Does the reply claim an act the record does not show?' }] })).not.toThrow();
});

test('a judged guard on a desk that buys no pass is never asked, and construction refuses it', () => {
  try {
    check({ ...SPEC, guards: [{ name: 'noLies',
      rule: 'Never claim an act that did not run.', on: 'reply',
      judgeQuery: 'Does the reply claim an act the record does not show?' }] });
    throw new Error('expected CardError');
  } catch (e) {
    expect((e as CardError).problems.map(p => p.code)).toContain('JUDGE_PASS_MISSING');
  }
});

test('a desk buying the pass with nothing judged on it is lawful — the pass costs nothing', () => {
  expect(() => check({ ...SPEC, judgePass: true })).not.toThrow();
});

test('a judged guard on the contract runs on every desk, and construction refuses it', () => {
  try {
    check(SPEC, { name: 'grandhotel', guards: [{ name: 'noLies',
            rule: 'Never claim an act that did not run.', on: 'reply', tool: 'cancelBooking',
            judgeQuery: 'Does the reply claim an act the record does not show?' }] });
    throw new Error('expected CardError');
  } catch (e) {
    expect((e as CardError).problems.map(p => p.code)).toContain('GUARD_JUDGE_ON_CONTRACT');
  }
});

test('a judged guard on the spec, naming its tool, is lawful', () => {
  expect(() => check({ ...SPEC, judgePass: true, guards: [{ name: 'noLies',
    rule: 'Never claim an act that did not run.', on: 'reply', tool: 'cancelBooking',
    judgeQuery: 'Does the reply claim an act the record does not show?' }] })).not.toThrow();
});
