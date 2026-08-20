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

import { doubleStated, pairing, pairingTable, profile } from '../src/lints.js';

/** A subject small enough to read: three tools in their effect blocks, a desk carrying the law
 *  that names no act, a contract carrying the law about one act, one factory and one ceiling. */
const CARD = `
export const w = {
  records: {},
  reads: { getInvoice: { form: 'get', entity: 'invoices', label: 'Look up an invoice' } },
  writes: { payInvoice: { form: 'set', entity: 'invoices', label: 'Pay an invoice' } },
  destructive: { voidInvoice: { form: 'remove', entity: 'invoices', label: 'void an invoice' } }
};
const prose = (name, rule, tool) =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };
export const billing = {
  name: 'billing',
  persona: 'You are the billing desk.',
  guards: [
    prose('noWriteOffs', 'No operation on this surface writes off a charge.')
  ]
};
export const contract = {
  guards: [
    onlyAfter('payInvoice', 'getInvoice'),
    prose('payFromTheRecord', 'A payment lands on the invoice the read returned.', ['payInvoice'])
  ],
  disclosure: {
    payInvoice: { cap: { arg: 'amount', at: 'getInvoice.invoice.balanceDue', refusal: 'Too much.' } }
  }
};
`;

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
function capabilityGate(name, tools, roles, sentence) {
  return { ...precondition(tools, ctx => true, sentence), name };
}
export const contract = { guards: [
  capabilityGate('moneyGate', ['voidInvoice'], ['owner'], 'Voiding needs the money capability.'),
  prose('terminalMoney', 'A voided invoice does not come back.', ['voidInvoice'])
] };`);
  expect(pairing(dir)).toEqual([]);
});

test('pairingTable: a row over an act names its mechanism, a row over none names its channel', () => {
  const table = pairingTable(subjectDirWith(CARD));
  expect(table).toContain('payFromTheRecord');
  expect(table).toContain('onlyAfter');
  expect(table).toContain('| noWriteOffs | — | the system prefix | on a spec, read every turn |');
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

test('pairing: a sharpened factory guard is a check, not a prose rule', () => {
  const dir = subjectDirWith(`
export const w = { records: {},
  reads: { getInvoice: { form: 'get', entity: 'invoices', label: 'Look up an invoice' } },
  writes: { issueRefund: { form: 'set', entity: 'invoices', label: 'Refund an invoice' } } };
export const contract = { guards: [
  { ...onlyAfter('issueRefund', 'getInvoice'),
    name: 'refundReadsTheInvoice',
    rule: 'Read the invoice before a refund: what can go back is paid minus refunded.' }
] };`);
  expect(pairing(dir)).toEqual([]);
});

test('pairing: a card that builds its effect blocks in code hands its surface to the caller', () => {
  const built = `
const READS = ['getInvoice'];
export const w = { records: {},
  reads: Object.fromEntries(READS.map(n => [n, { form: 'get', entity: 'invoices', label: n }])),
  writes: Object.fromEntries([['issueRefund', { form: 'set', entity: 'invoices', label: 'r' }]]) };
const prose = (name, rule, tool) =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };
export const contract: DomainContract = { guards: [
  onlyAfter('issueRefund', 'getInvoice'),
  prose('refundCapFromTheRecord', 'A refund is capped by the record.', ['issueRefund'])
] };`;
  // membership is unknowable from the source, so a named act stands
  expect(pairing(subjectDirWith(built))).toEqual([]);
  // and the caller that holds the loaded card gets the membership check back
  expect(pairing(subjectDirWith(built), ['getInvoice']).map(f => f.code))
    .toContain('PROSE_TOOL_UNKNOWN');
});

test('pairing: a guard written by hand refuses as surely as a factory does', () => {
  const dir = subjectDirWith(`
export const w = { records: {},
  reads: { checkAvailability: { form: 'get', entity: 'assets', label: 'Check availability' } },
  writes: {} };
const prose = (name, rule, tool) =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };
export const contract = { guards: [
  { name: 'availabilityAnswerReadsTheAccount', on: 'postTool', tool: ['checkAvailability'],
    rule: 'An availability answer states the account condition the flag does not carry.',
    deny: ctx => null },
  prose('catalogStatusIsNotAvailability', 'A catalog status is not an availability answer.',
        ['checkAvailability'])
] };`);
  expect(pairing(dir)).toEqual([]);
});

const CARDS = `
export const w = { records: {},
  reads: { getInvoice: { form: 'get', entity: 'invoices', label: 'Look up an invoice' } },
  writes: { issueRefund: { form: 'set', entity: 'invoices', label: 'Refund an invoice' } } };
const prose = (name, rule, tool) =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };
export const billing: AgentSpec = { name: 'billing', persona: 'You are the billing desk.',
  guards: [ prose('declareHonestly', 'Say what ran, what did not, and why.') ] };
export const contract: DomainContract = { name: 'atlas', guards: [
  { ...onlyAfter('issueRefund', 'getInvoice'),
    name: 'refundCapFromTheRecord',
    rule: 'A refund is capped by the statement: paid minus already refunded.' }
] };`;

test('pairing: a rule on a spec renders in the system prefix, so it needs no tool', () => {
  expect(pairing(subjectDirWith(CARDS))).toEqual([]);
});

test('pairing: a contract rule naming no tool renders nowhere', () => {
  const dir = subjectDirWith(CARDS.replace(/\{ \.\.\.onlyAfter[\s\S]*?refunded\.' \}/,
    `prose('refundCapFromTheRecord', 'A refund is capped by the statement.')`));
  const found = pairing(dir);
  expect(found.map(f => f.code)).toContain('RULE_NEVER_RENDERED');
  expect(found[0].sentence).toContain('refundCapFromTheRecord');
});

test('pairing: a contract rule naming a tool off the surface is a finding', () => {
  const dir = subjectDirWith(CARDS.replace(/\{ \.\.\.onlyAfter[\s\S]*?refunded\.' \}/,
    `prose('refundCapFromTheRecord', 'A refund is capped.', ['waiveFee'])`));
  expect(pairing(dir).map(f => f.code)).toContain('PROSE_TOOL_UNKNOWN');
});

test('pairing: a judged guard on the contract, or without a tool, is a finding', () => {
  const onContract = subjectDirWith(`${CARDS}
export const judged = { name: 'noLies', rule: 'Never claim an act that did not run.',
  on: 'reply', judgeQuery: 'Does the reply claim an act the record does not show?' };
export const contract2: DomainContract = { name: 'atlas', guards: [judged] };`);
  const codes = pairing(onContract).map(f => f.code);
  expect(codes).toContain('JUDGED_UNSCOPED');
});

test('pairing: a rule that names no act is not charged for', () => {
  const codes = pairing(subjectDirWith(CARDS)).map(f => f.code);
  expect(codes).not.toContain('PROSE_RESIDUE_UNDECLARED');
  expect(codes).not.toContain('PROSE_TOOL_UNCHECKED');
});

test('pairing: the home is read from the card, not from the order the file is written in', () => {
  const specLast = subjectDirWith(`
export const w = { records: {},
  writes: { issueRefund: { form: 'set', entity: 'invoices', label: 'Refund an invoice' } } };
const prose = (name, rule, tool) =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };
export const contract = { name: 'atlas', guards: [
  { ...onlyAfter('issueRefund', 'getStatement'),
    name: 'refundCapFromTheRecord',
    rule: 'A refund is capped by the statement: paid minus already refunded.' }
] };
export const billing = { name: 'billing', persona: 'You are the billing desk.', guards: [
  prose('declareHonestly', 'Say what ran and what did not.')
] };`);
  expect(pairing(specLast)).toEqual([]);
});

test('pairing: a law about an act that nothing refuses is a finding', () => {
  const dir = subjectDirWith(`
export const w = { records: {},
  reads: { getStatement: { form: 'get', entity: 'accounts', label: 'Look up a statement' } },
  writes: { issueRefund: { form: 'set', entity: 'accounts', label: 'Refund an account' } } };
const prose = (name, rule, tool) =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };
export const contract = { name: 'atlas', guards: [
  prose('refundCapFromTheRecord', 'A refund is capped by the statement.', ['issueRefund'])
] };`);
  expect(pairing(dir).map(f => f.code)).toContain('ACT_WITHOUT_CHECK');
});

test('pairing: the same law spread onto the factory that enforces it is clean', () => {
  const dir = subjectDirWith(`
export const w = { records: {},
  reads: { getStatement: { form: 'get', entity: 'accounts', label: 'Look up a statement' } },
  writes: { issueRefund: { form: 'set', entity: 'accounts', label: 'Refund an account' } } };
export const contract = { name: 'atlas', guards: [
  { ...onlyAfter('issueRefund', 'getStatement'),
    name: 'refundCapFromTheRecord',
    rule: 'A refund is capped by the statement: paid minus already refunded.' }
] };`);
  expect(pairing(dir)).toEqual([]);
});

test('profile: an acting tool with no check is named', () => {
  const dir = subjectDirWith(`
export const w = { records: {},
  reads: { getStatement: { form: 'get', entity: 'accounts', label: 'Look up a statement' } },
  writes: { issueRefund: { form: 'set', entity: 'accounts', label: 'Refund an account' },
            voidStatement: { form: 'remove', entity: 'accounts', label: 'void a statement' } } };
export const contract = { name: 'atlas', guards: [ onlyAfter('issueRefund', 'getStatement') ] };`);
  const p = profile(dir, ['issueRefund', 'voidStatement']);
  expect(p.acting).toBe(2);
  expect(p.actingChecked).toBe(1);
  expect(p.unchecked).toEqual(['voidStatement']);
  expect(p.checks).toBeGreaterThan(0);
});

test('doubleStated: an act carrying both a check and a separate prose sentence is a question', () => {
  const dir = subjectDirWith(`
export const w = { records: {},
  reads: { getStatement: { form: 'get', entity: 'accounts', label: 'Look up a statement' } },
  writes: { issueRefund: { form: 'set', entity: 'accounts', label: 'Refund an account' } } };
const prose = (name, rule, tool) =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };
export const contract = { name: 'atlas', guards: [
  onlyAfter('issueRefund', 'getStatement'),
  prose('refundCapFromTheRecord', 'A refund is capped by the statement.', ['issueRefund'])
] };`);
  expect(doubleStated(dir)).toEqual(["issueRefund: onlyAfter  +  prose 'refundCapFromTheRecord'"]);
});

test('doubleStated: a spread factory is one guard, so it asks nothing', () => {
  const dir = subjectDirWith(`
export const w = { records: {},
  reads: { getStatement: { form: 'get', entity: 'accounts', label: 'Look up a statement' } },
  writes: { issueRefund: { form: 'set', entity: 'accounts', label: 'Refund an account' } } };
export const contract = { name: 'atlas', guards: [
  { ...onlyAfter('issueRefund', 'getStatement'), name: 'refundCap',
    rule: 'A refund is capped by the statement: paid minus already refunded.' }
] };`);
  expect(doubleStated(dir)).toEqual([]);
});
