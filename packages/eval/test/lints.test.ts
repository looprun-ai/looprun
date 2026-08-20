import { test, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GuardCensus, TurnRecord } from '@looprun-ai/core';
import { census, nameGate, purity } from '../src/lints.js';

function subjectDirWith(code: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'lint-subject-'));
  mkdirSync(join(dir, 'ask'), { recursive: true });
  writeFileSync(join(dir, 'subject.ts'), code);
  return dir;
}

test('purity: a regex literal in subject code is a finding; clean code is clean', () => {
  const dirty = subjectDirWith('export const x = /never/;\n');
  expect(purity(dirty).map(f => f.code)).toContain('SUBJECT_REGEX');
  const built = subjectDirWith('export const x = new RegExp("also never");\n');
  expect(purity(built).map(f => f.code)).toContain('SUBJECT_REGEX');
  const clean = subjectDirWith('export const x = 1;\n');
  expect(purity(clean)).toEqual([]);
});

test('nameGate: a retired identifier in subject code is a finding, empty allowlist', () => {
  const dirty = subjectDirWith('export const toolDefs = [];\n');
  const findings = nameGate(dirty);
  expect(findings.some(f => f.sentence.includes('toolDefs'))).toBe(true);
  expect(nameGate(subjectDirWith('export const tools = [];\n'))).toEqual([]);
});

const CENSUS: GuardCensus = { guards: [
  { name: 'confirmFirst', rule: 'Ask first.', home: 'contract', on: 'preTool', tools: ['cancelBooking'],
    kind: 'deterministic', judged: false, installedBecause: 'destructive tool on the surface' },
  { name: 'neverFires', rule: 'Unreachable.', home: 'spec', on: 'preTool', tools: [],
    kind: 'deterministic', judged: false, installedBecause: 'declared on the spec card' }
] } as unknown as GuardCensus;

function dump(guard: string | null): TurnRecord {
  return { turn: 1, servedBy: 'scripted', userText: 'u',
    acts: [{ id: 'a1', turn: 1, origin: 'model', guard,
      call: { tool: 'cancelBooking', args: {}, key: 'k' }, effect: 'destructive',
      said: null, status: 'not-done', reason: 'held', evidence: 'engine',
      sentence: 's', result: null, questionId: 'q1' }],
    questions: { issued: [], consumed: [], closed: [] },
    finish: null, corrections: [], text: 't', closedBy: 'engine' };
}

test('census: an installed guard with no dump that fires it is a finding', () => {
  const findings = census(CENSUS, [dump('confirmFirst')]);
  expect(findings.map(f => f.sentence).join(' ')).toContain('neverFires');
  expect(findings.map(f => f.sentence).join(' ')).not.toContain('confirmFirst');
});

import { pairing, pairingTable } from '../src/lints.js';

/** A subject small enough to read: three tools in their effect blocks, one factory, one
 *  disclosure ceiling, the prose helper and a declared residue with its reason. */
const CARD = `
export const w = {
  records: {},
  reads: { getInvoice: { form: 'get', entity: 'invoices', label: 'Look up an invoice' } },
  writes: { payInvoice: { form: 'set', entity: 'invoices', label: 'Pay an invoice' } },
  destructive: { voidInvoice: { form: 'remove', entity: 'invoices', label: 'void an invoice' } }
};
const prose = (name, rule, tool) =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };
const RESIDUE = { noWriteOffs: 'No tool on this surface writes off a charge, so no call can break it.' };
export const contract = {
  guards: [
    onlyAfter('payInvoice', 'getInvoice'),
    prose('payFromTheRecord', 'A payment lands on the invoice the read returned.', ['payInvoice']),
    prose('noWriteOffs', 'No operation on this surface writes off a charge.')
  ],
  disclosure: {
    payInvoice: { cap: { arg: 'amount', at: 'getInvoice.invoice.balanceDue', refusal: 'Too much.' } }
  }
};
`;

test('pairing: a rule over a checked act, and an explained residue, are clean', () => {
  expect(pairing(subjectDirWith(CARD))).toEqual([]);
});

test('pairing: a rule naming a tool off the surface, and one naming an unchecked act', () => {
  const off = subjectDirWith(CARD.replace(`['payInvoice'])`, `['refundInvoice'])`));
  expect(pairing(off).map(f => f.code)).toContain('PROSE_TOOL_UNKNOWN');
  const unchecked = subjectDirWith(CARD.replace(`['payInvoice'])`, `['voidInvoice'])`));
  expect(pairing(unchecked).map(f => f.code)).toContain('PROSE_TOOL_UNCHECKED');
});

test('pairing: a rule that names no act and no reason is a finding', () => {
  const dir = subjectDirWith(CARD.replace(
    `const RESIDUE = { noWriteOffs: 'No tool on this surface writes off a charge, so no call can break it.' };`,
    `const RESIDUE = {};`));
  expect(pairing(dir).map(f => f.code)).toContain('PROSE_RESIDUE_UNDECLARED');
});

test('pairing: a residue reason too short to weigh is a finding', () => {
  const dir = subjectDirWith(CARD.replace(
    `'No tool on this surface writes off a charge, so no call can break it.'`, `'n/a'`));
  expect(pairing(dir).map(f => f.code)).toContain('PROSE_RESIDUE_UNEXPLAINED');
});

test('pairing: a guard written as an object literal is read the same way', () => {
  const dir = subjectDirWith(`${CARD}
export const extra = { name: 'quietly', rule: 'A rule with no check.', on: 'reply',
                       tool: ['voidInvoice'] };`);
  expect(pairing(dir).map(f => f.code)).toContain('PROSE_TOOL_UNCHECKED');
});

test('pairing: a deterministic guard is not a prose rule, whatever shape it takes', () => {
  const dir = subjectDirWith(`${CARD}
export const spread = { ...onlyAfter('payInvoice', 'getInvoice'), rule: 'Read it first.' };
export const named = { ...precondition('payInvoice', c => true, 'Only while open.'), name: 'openOnly' };`);
  expect(pairing(dir)).toEqual([]);
});

test('pairing: a factory reached through a local wrapper still checks its tools', () => {
  const dir = subjectDirWith(`
export const w = { records: {}, reads: {}, writes: {},
  destructive: { voidInvoice: { form: 'remove', entity: 'invoices', label: 'void an invoice' } } };
const prose = (name, rule, tool) =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };
const RESIDUE = {};
function capabilityGate(name, tools, roles, sentence) {
  return { ...precondition(tools, ctx => true, sentence), name };
}
export const contract = { guards: [
  capabilityGate('moneyGate', ['voidInvoice'], ['owner'], 'Voiding needs the money capability.'),
  prose('terminalMoney', 'A voided invoice does not come back.', ['voidInvoice'])
] };`);
  expect(pairing(dir)).toEqual([]);
});

test('pairingTable: the residue row carries the reason, and a checked row names its mechanism', () => {
  const table = pairingTable(subjectDirWith(CARD));
  expect(table).toContain('payFromTheRecord');
  expect(table).toContain('onlyAfter');
  expect(table).toContain('No tool on this surface writes off a charge');
});

test('pairing: a residue reason wrapped across lines is one reason', () => {
  const dir = subjectDirWith(`
export const w = { records: {}, reads: {}, writes: {},
  destructive: { voidInvoice: { form: 'remove', entity: 'invoices', label: 'void an invoice' } } };
const prose = (name, rule, tool) =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };
const RESIDUE = {
  noWriteOffs: 'No tool on this surface writes off a charge, so no call can break '
             + 'this rule at all.'
};
export const contract = { guards: [
  prose('noWriteOffs', 'No operation on this surface writes off a charge.')
] };`);
  expect(pairing(dir)).toEqual([]);
});

test('pairing: a named tool list resolves on both sides — the gate and the rule', () => {
  const dir = subjectDirWith(`
export const w = { records: {}, reads: {}, writes: {},
  destructive: {
    payInvoice:  { form: 'set',    entity: 'invoices', label: 'Pay an invoice' },
    voidInvoice: { form: 'remove', entity: 'invoices', label: 'void an invoice' }
  } };
const prose = (name, rule, tool) =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };
const RESIDUE = {} satisfies Record<string, string>;
const MONEY_TOOLS = ['payInvoice', 'voidInvoice'] as const;
function moneyGate() {
  return { ...precondition(MONEY_TOOLS, ctx => true, 'Moving money needs the capability.'),
           name: 'moneyGate' };
}
export const contract = { guards: [
  moneyGate(),
  prose('terminalMoney', 'Money that has moved does not come back.', MONEY_TOOLS)
] };`);
  expect(pairing(dir)).toEqual([]);
});

test('pairing: an act named through a list that no gate covers is still reported', () => {
  const dir = subjectDirWith(`
export const w = { records: {}, reads: {}, writes: {},
  destructive: { voidInvoice: { form: 'remove', entity: 'invoices', label: 'void an invoice' } } };
const prose = (name, rule, tool) =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };
const RESIDUE = {};
const MONEY_TOOLS = ['voidInvoice'];
export const contract = { guards: [
  prose('terminalMoney', 'Money that has moved does not come back.', MONEY_TOOLS)
] };`);
  expect(pairing(dir).map(f => f.code)).toContain('PROSE_TOOL_UNCHECKED');
});

test('pairing: a sharpened factory guard is a check, not a prose rule', () => {
  const dir = subjectDirWith(`
export const w = { records: {},
  reads: { getInvoice: { form: 'get', entity: 'invoices', label: 'Look up an invoice' } },
  writes: { issueRefund: { form: 'set', entity: 'invoices', label: 'Refund an invoice' } } };
const RESIDUE = {};
export const contract = { guards: [
  { ...onlyAfter('issueRefund', 'getInvoice'),
    name: 'refundReadsTheInvoice',
    rule: 'Read the invoice before a refund: what can go back is paid minus refunded.' }
] };`);
  expect(pairing(dir)).toEqual([]);
});

test('pairing: a card that builds its effect blocks in code is judged on its checks only', () => {
  const built = `
const READS = ['getInvoice'];
export const w = { records: {},
  reads: Object.fromEntries(READS.map(n => [n, { form: 'get', entity: 'invoices', label: n }])),
  writes: Object.fromEntries([['issueRefund', { form: 'set', entity: 'invoices', label: 'r' }]]) };
const prose = (name, rule, tool) =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };
const RESIDUE = {};
export const contract = { guards: [
  onlyAfter('issueRefund', 'getInvoice'),
  prose('refundCapFromTheRecord', 'A refund is capped by the record.', ['issueRefund'])
] };`;
  // membership is unknowable from the source, so a named act is judged on its check alone
  expect(pairing(subjectDirWith(built))).toEqual([]);
  // and the caller that holds the loaded card gets the membership check back
  expect(pairing(subjectDirWith(built), ['getInvoice']).map(f => f.code))
    .toContain('PROSE_TOOL_UNKNOWN');
});
