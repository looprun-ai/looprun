/** The gate over a subject written wrong on purpose. Every verb the gate composes owns one row
 *  here, so a verb dropped from the gate loses its own code from the list and this file says which
 *  one went missing. The retired-name verb is proved on a directory written at run time: a retired
 *  identifier checked into the tree fails the tree-wide name gate, which walks every file under
 *  packages/, fixtures included. */
import { describe, expect, test } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExamCase } from '@looprun-ai/core';
import { runGate, type GateSubject } from '../src/gate.js';
import { ordersWorld as BROKEN_WORLD } from './fixtures/gate-broken/cards.js';
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
    rubric: 'The deletion names the order it could not reach.' }
];

const FIXTURE_SUBJECT: GateSubject = {
  world: BROKEN_WORLD,
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
  cases: [{ id: 'sound-01', split: 'fix', turns: ['close ord_7'],
            covers: ['precondition:closeOrder'],
            rubric: 'The close runs only on an order the read returned as open.' }],
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
      'ACT_WITHOUT_CHECK',       // pairing
      'CAP_PATH_UNROOTED',       // capPaths
      'CASE_CANNOT_FIRE',        // approvable
      'CASE_PRESET_UNKNOWN',     // presetsDeclared
      'CHECK_INERT',             // inertChecks
      'CONDUCT_INCOMPLETE',      // conductComplete
      'COVERS_UNRESOLVED',       // coversResolve
      'DISCLOSURE_BEFORE_MISSING', // destructiveDisclosed
      'FLOOR_REDECLARED',        // floorRedeclared
      'PROSE_UNLICENSED',        // unlicensed
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
    const bare: GateSubject = { world: {}, cases: [], censusNames: null,
                                presetLeavesGuardInert: null };
    expect(runGate(dir, bare).map(f => f.code)).toContain('SUBJECT_RETIRED_NAME');
  });
});
