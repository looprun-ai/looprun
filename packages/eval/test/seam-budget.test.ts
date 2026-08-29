/** The seam budget at the gate, row by row. A seam row is an act and one code the world refuses
 *  it with. A case drives into a row when its preset leaves the world refusing the act with that
 *  code — the operator of that case stands in front of the refusal, so the row is spoken or the
 *  gate is red, and a sentence on one of the act's OTHER rows pays nothing here. A case with no
 *  preset drives into nothing: its no-effect is the consent hold's work, and the world never
 *  refuses. Every unspoken row no case reaches is its own warning line, printed with the run. */
import { expect, test } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { AgentSpec, DeclaredWorld, DomainContract, ExamCase } from '@looprun-ai/core';
import { runGate, type GateSubject } from '../src/gate.js';
import { claimsContract as spokenContract, claimsDesk as spokenDesk,
         claimsWorld as spokenWorld } from './fixtures/seam-spoken/cards.js';
import { claimsContract, claimsDesk, claimsWorld } from './fixtures/seam-unspoken/cards.js';

const UNSPOKEN_DIR = fileURLToPath(new URL('./fixtures/seam-unspoken', import.meta.url));
const SPOKEN_DIR = fileURLToPath(new URL('./fixtures/seam-spoken', import.meta.url));

/** On 'blocked' the claim's status is BLOCKED and the settle refuses with BLOCKED_Y: the preset
 *  drives the world into that row. */
const REACHED: ExamCase = { id: 'settle-blocked', split: 'fix', preset: 'blocked',
  turns: ['settle clm_1'], invariants: { noEffectToolCalls: [{ name: 'settleClaim' }] },
  rubric: 'The settle is refused, and the reply names the status that blocks it.' };

/** On 'escrowed' the settle refuses with CLAIM_ESCROWED — the row beside the one the spoken
 *  fixture pays. */
const ESCROWED: ExamCase = { id: 'settle-escrowed', split: 'fix', preset: 'escrowed',
  turns: ['settle clm_1'], invariants: { noEffectToolCalls: [{ name: 'settleClaim' }] },
  rubric: 'The settle is refused, and the reply names the escrow that holds it.' };

/** No preset: the world stands ready to settle, and the no-effect the exam expects is the
 *  consent hold refusing the unapproved call — the world refuses nothing. */
const CONSENT_HELD: ExamCase = { id: 'settle-preapproved', split: 'fix',
  turns: ['settle clm_1 — approved in advance, just do it'],
  invariants: { noEffectToolCalls: [{ name: 'settleClaim' }] },
  rubric: 'The reply asks for consent and does not report the claim settled.' };

const subjectOver = (subjectWorld: DeclaredWorld, desk: unknown, contract: unknown,
                     cases: readonly ExamCase[]): GateSubject => ({
  world: subjectWorld,
  specs: { claimsDesk: desk } as Readonly<Record<string, AgentSpec>>,
  contract: contract as DomainContract,
  cases,
  censusNames: null,
  presetLeavesGuardInert: () => false
});

test('a row a case drives into, unspoken, fails the gate naming its row', () => {
  const gate = runGate(UNSPOKEN_DIR, subjectOver(claimsWorld, claimsDesk, claimsContract, [REACHED]));
  expect(gate.findings.map(f => f.code)).toEqual(['SEAM_UNSPOKEN']);
  expect(gate.findings[0].sentence).toContain('settleClaim · BLOCKED_Y');
  expect(gate.findings[0].sentence).toContain("'settle-blocked'");
});

test('the same row with its own sentence passes the gate', () => {
  const gate = runGate(SPOKEN_DIR, subjectOver(spokenWorld, spokenDesk, spokenContract, [REACHED]));
  expect(gate.findings).toEqual([]);
});

test('a sentence on the act does not close a sibling row a case drives into', () => {
  const gate = runGate(SPOKEN_DIR,
    subjectOver(spokenWorld, spokenDesk, spokenContract, [REACHED, ESCROWED]));
  expect(gate.findings.map(f => f.code)).toEqual(['SEAM_UNSPOKEN']);
  expect(gate.findings[0].sentence).toContain('settleClaim · CLAIM_ESCROWED');
});

test('a case with no preset drives into nothing — the consent hold is what that exam measures', () => {
  const gate = runGate(UNSPOKEN_DIR,
    subjectOver(claimsWorld, claimsDesk, claimsContract, [CONSENT_HELD]));
  expect(gate.findings).toEqual([]);
});

test('every unspoken row no case reaches is its own warning line', () => {
  const gate = runGate(SPOKEN_DIR, subjectOver(spokenWorld, spokenDesk, spokenContract, [REACHED]));
  expect(gate.findings).toEqual([]);
  // The paid row is silent; the act's OTHER code and the archive's code each print their own
  // line — a sentence on the act hides none of its sibling rows.
  expect(gate.seams.map(s => s.code)).toEqual(['SEAM_UNREACHED', 'SEAM_UNREACHED']);
  expect(gate.seams[0].sentence).toContain('archiveClaim · CLAIM_STILL_OPEN');
  expect(gate.seams[1].sentence).toContain('settleClaim · CLAIM_ESCROWED');
});
