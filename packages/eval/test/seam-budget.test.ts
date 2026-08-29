/** The seam budget at the gate. A seam is one row of the world's refusal table — an act and the
 *  code it answers with. A case whose preset drives into that refusal puts an operator in front
 *  of it, so the row is spoken or the gate is red; a row no case reaches stays a warning that
 *  prints with the run, because every seam sentence is a sentence the prompt then carries on
 *  every turn. */
import { expect, test } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { AgentSpec, DeclaredWorld, DomainContract, ExamCase } from '@looprun-ai/core';
import { runGate, type GateSubject } from '../src/gate.js';
import { claimsContract as spokenContract, claimsDesk as spokenDesk,
         claimsWorld as spokenWorld } from './fixtures/seam-spoken/cards.js';
import { claimsContract, claimsDesk, claimsWorld } from './fixtures/seam-unspoken/cards.js';

const UNSPOKEN_DIR = fileURLToPath(new URL('./fixtures/seam-unspoken', import.meta.url));
const SPOKEN_DIR = fileURLToPath(new URL('./fixtures/seam-spoken', import.meta.url));

/** One case whose preset drives the settle into the world's refusal: on 'blocked' the claim's
 *  status is BLOCKED, the executor refuses with BLOCKED_Y, and the exam expects the act to
 *  change nothing. No case names the archive, so its refusal row stays unreached. */
const CASES: readonly ExamCase[] = [
  { id: 'settle-blocked', split: 'fix', preset: 'blocked', turns: ['settle clm_1'],
    invariants: { noEffectToolCalls: [{ name: 'settleClaim' }] },
    rubric: 'The settle is refused, and the reply names the status that blocks it.' }
];

const subjectOver = (subjectWorld: DeclaredWorld, desk: unknown, contract: unknown): GateSubject => ({
  world: subjectWorld,
  specs: { claimsDesk: desk } as Readonly<Record<string, AgentSpec>>,
  contract: contract as DomainContract,
  cases: CASES,
  censusNames: null,
  presetLeavesGuardInert: () => false
});

test('a seam the exam drives into, unspoken, fails the gate naming its row', () => {
  const gate = runGate(UNSPOKEN_DIR, subjectOver(claimsWorld, claimsDesk, claimsContract));
  expect(gate.findings.map(f => f.code)).toEqual(['SEAM_UNSPOKEN']);
  expect(gate.findings[0].sentence).toContain('settleClaim · BLOCKED_Y');
});

test('the same seam with a sentence passes the gate', () => {
  const gate = runGate(SPOKEN_DIR, subjectOver(spokenWorld, spokenDesk, spokenContract));
  expect(gate.findings).toEqual([]);
});

test('a seam no case reaches stays a warning that prints with the run', () => {
  const gate = runGate(SPOKEN_DIR, subjectOver(spokenWorld, spokenDesk, spokenContract));
  expect(gate.findings).toEqual([]);
  expect(gate.seams.map(s => s.code)).toEqual(['SEAM_UNREACHED']);
  expect(gate.seams[0].sentence).toContain('archiveClaim · CLAIM_STILL_OPEN');
});
