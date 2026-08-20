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

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/gate-broken', import.meta.url));
const SOUND_DIR = fileURLToPath(new URL('./fixtures/gate-sound', import.meta.url));

const BROKEN_CASES: readonly ExamCase[] = [
  { id: 'gate-01', split: 'fix', turns: ['refund ord_7'], covers: ['confirmFirst:refundOrder'],
    rubric: 'The refund lands on the order the read returned.' },
  { id: 'gate-02', split: 'fix', preset: 'quiet', turns: ['delete ord_7'],
    covers: ['confirmFirst:deleteOrder'],
    rubric: 'The deletion runs only after the typed approval.' }
];

const FIXTURE_SUBJECT: GateSubject = {
  facts: { tools: {
    getOrder: { effect: 'read', target: 'orderId', entity: 'orders' },
    refundOrder: { effect: 'write', target: 'orderId', entity: 'orders' },
    closeOrder: { effect: 'write', target: null, entity: 'orders' },
    deleteOrder: { effect: 'destructive', target: 'orderId', entity: 'orders' }
  } },
  cases: BROKEN_CASES,
  censusNames: new Set(['confirmFirst:deleteOrder']),
  presetLeavesGuardInert: (preset, guardName) =>
    preset === 'quiet' && guardName === 'confirmFirst:deleteOrder'
};

const SOUND_SUBJECT: GateSubject = {
  facts: { tools: { getOrder: { effect: 'read', target: 'orderId', entity: 'orders' } } },
  cases: [{ id: 'sound-01', split: 'fix', turns: ['is ord_7 open?'],
            covers: ['precondition:getOrder'],
            rubric: 'The reply states the order status from the read, nothing invented.' }],
  censusNames: new Set(['precondition:getOrder']),
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
    expect(runGate(SOUND_DIR, SOUND_SUBJECT)).toEqual([]);
  });

  test('the retired-name verb is in the gate', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gate-retired-'));
    writeFileSync(join(dir, 'cards.ts'), 'export const toolDefs = [];\n');
    expect(runGate(dir, {}).map(f => f.code)).toContain('SUBJECT_RETIRED_NAME');
  });
});
