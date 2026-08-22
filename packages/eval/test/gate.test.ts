/** The gate over a subject written wrong on purpose. Every verb the gate composes owns one row
 *  here, so a verb dropped from the gate loses its own code from the list and this file says which
 *  one went missing. Two verbs are proved on directories written at run time instead. A retired
 *  identifier checked into the tree fails the tree-wide name gate, which walks every file under
 *  packages/, fixtures included. And the byte budget renders every desk through the engine, which
 *  a deliberately broken card cannot survive — so it is proved on a card that compiles, held to a
 *  ceiling of one byte. */
import { describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentSpec, ExamCase } from '@looprun-ai/core';
import { runGate, type GateSubject } from '../src/gate.js';
import { ordersDesk as brokenOrders, ordersWorld as BROKEN_WORLD, refundsDesk as brokenRefunds,
         returnsDesk as brokenReturns } from './fixtures/gate-broken/cards.js';
import { ordersContract, ordersDesk, ordersWorld as SOUND_WORLD,
         returnsDesk } from './fixtures/gate-sound/cards.js';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/gate-broken', import.meta.url));
const SOUND_DIR = fileURLToPath(new URL('./fixtures/gate-sound', import.meta.url));

const BROKEN_CASES: readonly ExamCase[] = [
  { id: 'gate-01', split: 'fix', turns: ['refund ord_7'], covers: ['confirmFirst:refundOrder'],
    rubric: 'The refund lands on the order the read returned.' },
  { id: 'gate-02', split: 'fix', preset: 'quiet', turns: ['delete ord_7'],
    covers: ['confirmFirst:deleteOrder'],
    rubric: 'The deletion runs only after the typed approval.' },
  // A scenario the card never declares, and no `covers` key: the preset verb is the only one that
  // can see it, because every other case-shaped verb walks the guard names a case claims.
  { id: 'gate-03', split: 'fix', preset: 'loud', turns: ['delete ord_9'],
    rubric: 'The deletion names the order it could not reach.' },
  // A read the exam requires, an act that takes it, and a card that neither orders the read in
  // front of the act nor speaks what it returned.
  { id: 'gate-04', split: 'fix', turns: ['refund ord_7'],
    invariants: { requiredToolCalls: [{ name: 'getOrder' }, { name: 'refundOrder' }] },
    rubric: 'The refund states the total the read returned.' },
  // A typed approval, so the consent question this act renders is one the exam actually shows.
  { id: 'gate-05', split: 'fix', turns: ['purge ord_7', { approve: { tool: 'purgeOrder' } }],
    rubric: 'The purge states what it takes away.' },
  // An act the exam expects to be refused, over a card carrying nothing that can refuse it.
  { id: 'gate-06', split: 'fix', turns: ['refund ord_7'],
    invariants: { noEffectToolCalls: [{ name: 'refundOrder' }] },
    rubric: 'The refund is refused, and the reply names the status that refuses it.' }
];

/** The fixture desks are literals the verbs PARSE, not cards the engine compiles: this directory
 *  is wrong on purpose, and a card that is wrong on purpose does not survive the factory. The gate
 *  renders nothing here because the directory declares no budget. */
const BROKEN_DESKS = { ordersDesk: brokenOrders, refundsDesk: brokenRefunds,
                       returnsDesk: brokenReturns } as unknown as Readonly<Record<string, AgentSpec>>;

const FIXTURE_SUBJECT: GateSubject = {
  world: BROKEN_WORLD,
  specs: BROKEN_DESKS,
  contract: undefined,
  cases: BROKEN_CASES,
  censusNames: new Set(['confirmFirst:deleteOrder']),
  presetLeavesGuardInert: (preset, guardName) =>
    preset === 'quiet' && guardName === 'confirmFirst:deleteOrder'
};

/** The census the sound subject is spelled against is the fixture's OWN guard names, read off the
 *  same literals the verbs parse — a second list written by hand would agree with the cases
 *  whatever either one said. */
const SOUND_CENSUS = new Set([...ordersDesk.guards, ...returnsDesk.guards, ...ordersContract.guards]
  .map(guard => guard.name));

const SOUND_SUBJECT: GateSubject = {
  world: SOUND_WORLD,
  specs: { ordersDesk, returnsDesk } as unknown as Readonly<Record<string, AgentSpec>>,
  contract: ordersContract as never,
  cases: [{ id: 'sound-01', split: 'fix', turns: ['close ord_7'],
            covers: ['precondition:closeOrder'],
            invariants: { requiredToolCalls: [{ name: 'getOrder' }, { name: 'closeOrder' }] },
            rubric: 'The close runs only on an order the read returned as open.' },
          // The act the exam expects refused: a precondition can deny the call, and the seam law
          // states what the operator meets when the world refuses it.
          { id: 'sound-02', split: 'fix', preset: undefined, turns: ['close ord_7'],
            invariants: { noEffectToolCalls: [{ name: 'closeOrder' }] },
            rubric: 'A closed order is refused, and the reply names the status it is in.' }],
  censusNames: SOUND_CENSUS,
  // This world declares no preset, so nothing silences the check the case covers.
  presetLeavesGuardInert: () => false
};

describe('runGate', () => {
  test('it runs every verb that returns findings, and names each in its own row', () => {
    const findings = runGate(FIXTURE_DIR, FIXTURE_SUBJECT);
    const codes = new Set(findings.map(f => f.code));
    expect(codes.has('SUBJECT_REGEX')).toBe(true);
    expect(codes.has('COVERS_UNRESOLVED')).toBe(true);
    expect(codes.has('CHECK_INERT')).toBe(true);
    expect([...codes].sort()).toEqual([
      'ACT_UNDENIABLE',          // noEffectDenied
      'ACT_WITHOUT_CHECK',       // pairing
      'CAP_PATH_UNROOTED',       // capPaths
      'CASE_CANNOT_FIRE',        // approvable
      'CASE_PRESET_UNKNOWN',     // presetsDeclared
      'CHECK_INERT',             // inertChecks
      'CHECK_UNSPOKEN',          // unspokenChecks
      'CONDUCT_INCOMPLETE',      // conductComplete
      'COVERS_UNRESOLVED',       // coversResolve
      'DISCLOSURE_BEFORE_MISSING',   // destructiveDisclosed
      'DISCLOSURE_BEFORE_UNFIGURED', // destructiveDisclosed
      'FLOOR_REDECLARED',        // floorRedeclared
      'PROSE_UNLICENSED',        // unlicensed
      'READ_RESULT_UNSPOKEN',    // requiredReadsDisclosed
      'REQUIRED_READ_UNORDERED', // readsOrdered
      'RULE_WIDE_UNLICENSED',    // overWide
      'SUBJECT_REGEX'            // purity
    ]);
  });

  test('a sound subject returns an empty list', () => {
    // The sound fixture declares what the broken one gets wrong — a licensed rule over a checked
    // act, a live precondition, a disclosed destructive act, a rooted cap — so the empty list is
    // every verb clearing a populated walk, not every verb finding nothing to walk.
    expect(SOUND_CENSUS.has('precondition:closeOrder')).toBe(true);
    expect(runGate(SOUND_DIR, SOUND_SUBJECT)).toEqual([]);
  });

  test('the retired-name verb is in the gate', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-retired-'));
    writeFileSync(join(dir, 'cards.ts'), 'export const toolDefs = [];\n');
    const bare: GateSubject = { world: {}, specs: {}, contract: undefined, cases: [],
                                censusNames: null, presetLeavesGuardInert: null };
    expect(runGate(dir, bare).map(f => f.code)).toContain('SUBJECT_RETIRED_NAME');
  });

  test('the byte budget verb is in the gate, and reads the ceiling out of the subject itself', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-budget-'));
    mkdirSync(join(dir, 'ask'), { recursive: true });
    writeFileSync(join(dir, 'ask', 'targets.json'), JSON.stringify({
      targets: [{ provider: 'google', model: 'a-model', apiKeyEnv: 'A_KEY' }], promptBudget: 1 }));
    const budgeted: GateSubject = {
      world: SOUND_WORLD,
      specs: { orders: { name: 'orders', persona: 'You are the orders desk.' } },
      contract: undefined,
      cases: [], censusNames: null, presetLeavesGuardInert: null
    };
    const over = runGate(dir, budgeted).filter(f => f.code === 'PROMPT_OVER_BUDGET');
    expect(over).toHaveLength(1);
    expect(over[0].sentence).toContain('budgets 1');
    expect(over[0].sentence).toContain('orders');
  });
});
