import { describe, expect, test } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExamCase, GuardCensus, TurnRecord } from '@looprun-ai/core';
import { census, nameGate, purity } from '../src/lints.js';
import { inertChecks, ruleCopies } from '../src/lints.js';

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
 *  that names no act, a contract carrying the law about one act, a check over each of the two
 *  acts, and one ceiling. */
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
    precondition('voidInvoice', ({ record }) => record !== null,
      'A void lands on the invoice the read returned, and on no other.'),
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

test('pairing: a prose rule spread into a literal reaches the acts that literal names', () => {
  const dir = subjectDirWith(`
export const w = { records: {},
  reads: { getInvoice: { form: 'get', entity: 'invoices', label: 'Look up an invoice' } },
  writes: { issueRefund: { form: 'set', entity: 'invoices', label: 'Refund an invoice' } } };
const prose = (name, rule) => ({ name, rule, on: 'reply' });
export const contract = { guards: [
  { ...onlyAfter('issueRefund', 'getInvoice'), name: 'refundReadsTheInvoice',
    rule: 'Read the invoice before a refund.' },
  { ...prose('roleRefusalNamesWhoCan', 'Name the role the member record states.'),
    tool: ['issueRefund'] }
] };`);
  expect(pairing(dir).map(f => f.code)).not.toContain('RULE_NEVER_RENDERED');
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

test('pairing: an act no rule even names, with nothing to refuse it, is a finding', () => {
  const dir = subjectDirWith(`
export const w = { records: {},
  reads: { getStatement: { form: 'get', entity: 'accounts', label: 'Look up a statement' } },
  writes: { issueRefund: { form: 'set', entity: 'accounts', label: 'Refund an account' } },
  destructive: { closeAccount: { form: 'remove', entity: 'accounts', label: 'Close an account' } } };
export const contract = { name: 'atlas', guards: [
  { ...onlyAfter('issueRefund', 'getStatement'),
    name: 'refundCapFromTheRecord',
    rule: 'A refund is capped by the statement: paid minus already refunded.' }
] };`);
  const found = pairing(dir);
  expect(found.map(f => f.code)).toEqual(['ACT_WITHOUT_CHECK']);
  expect(found[0].sentence).toContain('closeAccount');
  // The checked act is not charged, and neither is the read beside it.
  expect(found[0].sentence).not.toContain('issueRefund');
  expect(found[0].sentence).not.toContain('getStatement');
});

test('pairing: an act the caller declares is charged even when the card builds its blocks in code', () => {
  const built = `
export const w = { records: {},
  writes: Object.fromEntries([['issueRefund', { form: 'set', entity: 'accounts', label: 'r' }]]) };
export const contract = { name: 'atlas', guards: [] };`;
  // Nothing is spelled out in the source, so the source-read walk knows of no act at all.
  expect(pairing(subjectDirWith(built))).toEqual([]);
  expect(pairing(subjectDirWith(built), ['issueRefund'], ['issueRefund']).map(f => f.code))
    .toEqual(['ACT_WITHOUT_CHECK']);
});

test('pairing: an act a rule names is charged once, at the line the rule is written on', () => {
  const dir = subjectDirWith(`
export const w = { records: {},
  writes: { issueRefund: { form: 'set', entity: 'accounts', label: 'Refund an account' } } };
const prose = (name, rule, tool) =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };
export const contract = { name: 'atlas', guards: [
  prose('refundCapFromTheRecord', 'A refund is capped by the statement.', ['issueRefund'])
] };`);
  const found = pairing(dir);
  expect(found).toHaveLength(1);
  expect(found[0].sentence).toContain('refundCapFromTheRecord');
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

test('doubleStated: a check and a prose rule carrying the same sentence is one law written twice', () => {
  const dir = subjectDirWith(`
export const w = { records: {},
  reads: { getStatement: { form: 'get', entity: 'accounts', label: 'Look up a statement' } },
  writes: { issueRefund: { form: 'set', entity: 'accounts', label: 'Refund an account' } } };
const prose = (name, rule, tool) =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };
export const contract = { name: 'atlas', guards: [
  { ...onlyAfter('issueRefund', 'getStatement'), name: 'refundCap',
    rule: 'A refund is capped by the statement: paid minus already refunded.' },
  prose('refundCapFromTheRecord',
    'A refund is capped by the statement: paid minus already refunded.', ['issueRefund'])
] };`);
  expect(doubleStated(dir))
    .toEqual(["issueRefund: 'refundCap' and prose 'refundCapFromTheRecord' carry the same sentence"]);
});

test('doubleStated: a prose rule saying something else on the same act is cover, not a copy', () => {
  const dir = subjectDirWith(`
export const w = { records: {},
  reads: { getStatement: { form: 'get', entity: 'accounts', label: 'Look up a statement' } },
  writes: { issueRefund: { form: 'set', entity: 'accounts', label: 'Refund an account' } } };
const prose = (name, rule, tool) =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };
export const contract = { name: 'atlas', guards: [
  { ...onlyAfter('issueRefund', 'getStatement'), name: 'refundCap',
    rule: 'A refund is capped by the statement: paid minus already refunded.' },
  prose('refundNamesTheAccount', 'State the account a refund lands on.', ['issueRefund'])
] };`);
  expect(doubleStated(dir)).toEqual([]);
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

describe('ruleCopies', () => {
  const desk = (tools: readonly string[], guards: readonly unknown[]) => ({
    guards, facts: { tools: Object.fromEntries(tools.map(n => [n, {}])) }
  });

  test('charges a rule once per act it names, in every lane that holds the act', () => {
    const wide = { name: 'wide', home: 'contract', rule: 'x'.repeat(100), tools: ['a', 'b'] };
    const rows = ruleCopies([desk(['a', 'b'], [wide]), desk(['a'], [wide])] as never);
    expect(rows).toEqual(['   300 B  wide — 100 B × 3 copies']);
  });

  test('ignores a guard whose acts are outside the lane', () => {
    const guard = { name: 'elsewhere', home: 'contract', rule: 'x'.repeat(50), tools: ['z'] };
    expect(ruleCopies([desk(['a'], [guard])] as never)).toEqual([]);
  });

  test('ranks the widest, longest rule first', () => {
    const rows = ruleCopies([desk(['a', 'b', 'c'], [
      { name: 'narrow', home: 'contract', rule: 'x'.repeat(200), tools: ['a'] },
      { name: 'broad', home: 'contract', rule: 'x'.repeat(90), tools: ['a', 'b', 'c'] }
    ])] as never);
    expect(rows[0]).toContain('broad');
    expect(rows[1]).toContain('narrow');
  });
});

describe('inertChecks', () => {
  const write = (body: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'inert-'));
    writeFileSync(join(dir, 'cards.ts'), body);
    return dir;
  };

  test('a record test over an act with no target can never fire', () => {
    const dir = write(`
      const CONTRACT = { guards: [
        precondition(['closeBooking'], ({ record }) => record !== null && record.paid === true, 'x')
      ] };
    `);
    const found = inertChecks(dir, { closeBooking: { target: null, entity: 'auditLog' } });
    expect(found.map(f => f.code)).toEqual(['CHECK_INERT']);
    expect(found[0].sentence).toContain("declares 'closeBooking' with no target argument");
  });

  test('a state-only predicate over the same act is left alone', () => {
    const dir = write(`
      const CONTRACT = { guards: [
        precondition(['closeBooking'], ({ state }) => state.tenant.live === true, 'x')
      ] };
    `);
    expect(inertChecks(dir, { closeBooking: { target: null, entity: 'auditLog' } })).toEqual([]);
  });

  test('a record test over an act that carries a target is left alone', () => {
    const dir = write(`
      const CONTRACT = { guards: [
        precondition(['cancelBooking'], ({ record }) => record !== null, 'x')
      ] };
    `);
    expect(inertChecks(dir, { cancelBooking: { target: 'bookingId', entity: 'bookings' } })).toEqual([]);
  });

  test('a named list is followed, and only the acts that lack a target are charged', () => {
    const dir = write(`
      const ACTS = ['closeBooking', 'cancelBooking'];
      const CONTRACT = { guards: [
        precondition(ACTS, ({ record }) => record !== null, 'x')
      ] };
    `);
    const found = inertChecks(dir, {
      closeBooking: { target: null, entity: 'auditLog' },
      cancelBooking: { target: 'bookingId', entity: 'bookings' }
    });
    expect(found).toHaveLength(1);
    expect(found[0].sentence).toContain('closeBooking');
  });
});

import { boilerplate, echoes } from '../src/lints.js';
import { overWide } from '../src/lints.js';

describe('overWide', () => {
  const write = (body: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'wide-'));
    writeFileSync(join(dir, 'cards.ts'), body);
    return dir;
  };

  test('a rule over two acts with no licence is a finding', () => {
    const dir = write(`
      const CONTRACT = { guards: [
        { ...onlyAfter(['payInvoice', 'issueRefund'], 'getInvoice'), name: 'moneyReadsTheInvoice' }
      ] };
    `);
    const found = overWide(dir);
    expect(found.map(f => f.code)).toEqual(['RULE_WIDE_UNLICENSED']);
    expect(found[0].sentence).toContain('moneyReadsTheInvoice');
    expect(found[0].sentence).toContain('2 acts');
  });

  test('a declared licence clears it', () => {
    const dir = write(`
      export const WIDE = { moneyReadsTheInvoice: 'sameRefusal' } as const;
      const CONTRACT = { guards: [
        { ...onlyAfter(['payInvoice', 'issueRefund'], 'getInvoice'), name: 'moneyReadsTheInvoice' }
      ] };
    `);
    expect(overWide(dir)).toEqual([]);
  });

  test('a prose rule spread into a literal over two acts is stamped twice, and pays for it', () => {
    const dir = write(`
      const prose = (name, rule) => ({ name, rule, on: 'reply' });
      const CONTRACT = { guards: [
        { ...prose('roleRefusalNamesWhoCan', 'Name the role the member record states.'),
          tool: ['payInvoice', 'issueRefund'] }
      ] };
    `);
    const found = overWide(dir);
    expect(found.map(f => f.code)).toEqual(['RULE_WIDE_UNLICENSED']);
    expect(found[0].sentence).toContain('roleRefusalNamesWhoCan');
    expect(found[0].sentence).toContain('2 acts');
  });

  test('a declared licence clears the prose rule spread into a literal', () => {
    const dir = write(`
      export const WIDE = { roleRefusalNamesWhoCan: 'oneLawEveryAct' } as const;
      const prose = (name, rule) => ({ name, rule, on: 'reply' });
      const CONTRACT = { guards: [
        { ...prose('roleRefusalNamesWhoCan', 'Name the role the member record states.'),
          tool: ['payInvoice', 'issueRefund'] }
      ] };
    `);
    expect(overWide(dir)).toEqual([]);
  });

  test('a licence outside the closed set is a finding', () => {
    const dir = write(`
      export const WIDE = { moneyReadsTheInvoice: 'itIsFine' } as const;
      const CONTRACT = { guards: [
        { ...onlyAfter(['payInvoice', 'issueRefund'], 'getInvoice'), name: 'moneyReadsTheInvoice' }
      ] };
    `);
    expect(overWide(dir).map(f => f.code)).toEqual(['RULE_WIDE_LICENCE_UNKNOWN']);
  });

  test('a rule over one act asks nothing', () => {
    const dir = write(`
      const CONTRACT = { guards: [{ ...onlyAfter('issueRefund', 'getInvoice'), name: 'refundReads' }] };
    `);
    expect(overWide(dir)).toEqual([]);
  });
});

describe('boilerplate', () => {
  test('prices a repeated run by the lines beyond the first that carry it', () => {
    const tail = ' Read the member record and name a member whose role can do it.';
    const rows = boilerplate([`Money moves on the money capability.${tail}`,
                              `Dispatch runs on the crew capability.${tail}`,
                              `The registry changes on the fleet capability.${tail}`], 30);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('2 lines beyond the first');
    expect(rows[0]).toContain('Read the member record');
  });

  test('a run shorter than the floor is not a row', () => {
    expect(boilerplate(['alpha beta gamma', 'alpha beta delta'], 30)).toEqual([]);
  });

  test('rare-word pairing cannot see what this sees', () => {
    const lines = ['a b c the shared closing sentence every line repeats verbatim here',
                   'd e f the shared closing sentence every line repeats verbatim here'];
    expect(echoes(lines).length).toBe(0);
    expect(boilerplate(lines, 30).length).toBe(1);
  });
});

import { seamCovered } from '../src/lints.js';

describe('seamCovered', () => {
  const write = (world: string, cards: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'seam-'));
    writeFileSync(join(dir, 'world.ts'), world);
    writeFileSync(join(dir, 'cards.ts'), cards);
    return dir;
  };

  test('a fail code with no guard over its act is an uncovered row', () => {
    const dir = write(
      `const H = { cancelBooking: (w, a) => fail('BOOKING_ALREADY_OUT') };`,
      `const CONTRACT = { guards: [] };`);
    const rows = seamCovered(dir, { tools: { cancelBooking: {} } } as never);
    expect(rows).toEqual([{ act: 'cancelBooking', code: 'BOOKING_ALREADY_OUT', guard: null }]);
  });

  test('a guard over that act claims the row', () => {
    const dir = write(
      `const H = { cancelBooking: (w, a) => fail('BOOKING_ALREADY_OUT') };`,
      `const CONTRACT = { guards: [{ name: 'cancelBeforeItGoesOut', tool: ['cancelBooking'], on: 'preTool', deny: () => null }] };`);
    const rows = seamCovered(dir, { tools: { cancelBooking: {} } } as never);
    expect(rows[0].guard).toBe('cancelBeforeItGoesOut');
  });

  test('a gates entry is a row too', () => {
    const dir = write(
      `const W = { destructive: { cancelBooking: { gates: [{ kind: 'stateIs', field: 'status', value: 'CONFIRMED' }] } } };`,
      `const CONTRACT = { guards: [] };`);
    const rows = seamCovered(dir, { tools: { cancelBooking: {} } } as never);
    expect(rows.map(r => r.code)).toContain('stateIs:status');
  });

  test('a code handed to a validator is a row, though the emit site computes it', () => {
    const dir = write(
      `const H = { cancelBooking: (w, a) => {
         const st = optString(a.status, { allowed: BOOKING_STATUSES, code: 'INVALID_BOOKING_STATUS' });
         if ('error' in st) return fail(st.error);
       } };`,
      `const CONTRACT = { guards: [] };`);
    const rows = seamCovered(dir, { tools: { cancelBooking: {} } } as never);
    expect(rows).toEqual([{ act: 'cancelBooking', code: 'INVALID_BOOKING_STATUS', guard: null }]);
  });

  test('a handler written as a method keys its act just as a property does', () => {
    const dir = write(
      `const H = { cancelBooking(w, a) { return fail('BOOKING_ALREADY_OUT'); } };`,
      `const CONTRACT = { guards: [] };`);
    const rows = seamCovered(dir, { tools: { cancelBooking: {} } } as never);
    expect(rows).toEqual([{ act: 'cancelBooking', code: 'BOOKING_ALREADY_OUT', guard: null }]);
  });

  test('gates behind an as-const still name the act they sit under', () => {
    const dir = write(
      `const W = { destructive: { cancelBooking: { gates: [{ kind: 'stateIs', field: 'status', value: 'CONFIRMED' }] } as const } };`,
      `const CONTRACT = { guards: [] };`);
    const rows = seamCovered(dir, { tools: { cancelBooking: {} } } as never);
    expect(rows.map(r => r.code)).toContain('stateIs:status');
  });
});

import { destructiveDisclosed } from '../src/lints.js';

describe('destructiveDisclosed', () => {
  const write = (body: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'disclosed-'));
    writeFileSync(join(dir, 'cards.ts'), body);
    return dir;
  };

  const DESTRUCTIVE = { tools: { cancelBooking: { effect: 'destructive' } } } as never;
  const APPROVES: readonly ExamCase[] = [{ id: 'c-01', split: 'fix', rubric: 'r',
    turns: ['cancel bk_9', { approve: { tool: 'cancelBooking' } }] }];

  test('a destructive act with no before is a finding', () => {
    const dir = write(`const CONTRACT = { disclosure: { cancelBooking: { after: 'done' } } };`);
    const found = destructiveDisclosed(dir, DESTRUCTIVE, []);
    expect(found.map(f => f.code)).toEqual(['DISCLOSURE_BEFORE_MISSING']);
    expect(found[0].sentence).toContain('carries only its label');
  });

  const WRITE_ONLY = { tools: { moveBooking: { effect: 'write' } } } as never;

  test('a write with no before asks nothing', () => {
    const dir = write(`const CONTRACT = { disclosure: {} };`);
    expect(destructiveDisclosed(dir, WRITE_ONLY, [])).toEqual([]);
  });

  test('an approved act whose before carries no figure is a finding naming the case', () => {
    const dir = write(`const CONTRACT = { disclosure: { cancelBooking: {
      needs: { booking: { tool: 'getBooking', args: { bookingId: 'bookingId' } } },
      before: 'This cancellation cannot be undone.' } } };`);
    const found = destructiveDisclosed(dir, DESTRUCTIVE, APPROVES);
    expect(found.map(f => f.code)).toEqual(['DISCLOSURE_BEFORE_UNFIGURED']);
    expect(found[0].sentence).toContain("case 'c-01' approves 'cancelBooking'");
    expect(found[0].sentence).toContain('needs aliases (booking)');
  });

  test('a figure off the held call, or off a needs alias, answers it', () => {
    const args = write(`const CONTRACT = { disclosure: { cancelBooking: {
      before: 'Cancelling {args.bookingId} frees the machine.' } } };`);
    expect(destructiveDisclosed(args, DESTRUCTIVE, APPROVES)).toEqual([]);
    const alias = write(`const CONTRACT = { disclosure: { cancelBooking: {
      needs: { booking: { tool: 'getBooking', args: { bookingId: 'bookingId' } } },
      before: 'Cancelling frees {booking.booking.assetName}.' } } };`);
    expect(destructiveDisclosed(alias, DESTRUCTIVE, APPROVES)).toEqual([]);
  });

  test('an act no case approves is asked for by nobody, so the figure is not owed', () => {
    const dir = write(`const CONTRACT = { disclosure: { cancelBooking: {
      before: 'This cancellation cannot be undone.' } } };`);
    expect(destructiveDisclosed(dir, DESTRUCTIVE, [])).toEqual([]);
  });
});

import { capPaths } from '../src/lints.js';

describe('capPaths', () => {
  const write = (body: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'cap-'));
    writeFileSync(join(dir, 'cards.ts'), body);
    return dir;
  };

  test('a cap rooted on a tool name with no needs alias is a finding', () => {
    const dir = write(`const CONTRACT = { disclosure: { issueRefund: {
      needs: { invoice: 'getInvoice' }, before: 'x',
      cap: { at: 'getInvoice.refundable', not: 'above' } } } };`);
    const found = capPaths(dir);
    expect(found.map(f => f.code)).toEqual(['CAP_PATH_UNROOTED']);
    expect(found[0].sentence).toContain("'getInvoice' is a read, not an alias");
    expect(found[0].sentence).toContain("invoice.refundable");
  });

  test('a cap rooted on a declared alias asks nothing', () => {
    const dir = write(`const CONTRACT = { disclosure: { issueRefund: {
      needs: { invoice: 'getInvoice' }, before: 'x',
      cap: { at: 'invoice.refundable', not: 'above' } } } };`);
    expect(capPaths(dir)).toEqual([]);
  });
});

import { floorRedeclared } from '../src/lints.js';

describe('floorRedeclared', () => {
  const write = (body: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'floor-'));
    writeFileSync(join(dir, 'cards.ts'), body);
    return dir;
  };

  test('a card declaring what the engine installs is a finding', () => {
    const dir = write(`const CONTRACT = { guards: [{ name: 'noDuplicateCall', on: 'preTool', deny: () => null }] };`);
    expect(floorRedeclared(dir).map(f => f.code)).toEqual(['FLOOR_REDECLARED']);
  });

  test('an authored name the engine does not install asks nothing', () => {
    const dir = write(`const CONTRACT = { guards: [{ name: 'refundReadsTheInvoice', on: 'preTool', deny: () => null }] };`);
    expect(floorRedeclared(dir)).toEqual([]);
  });
});

import { conductComplete } from '../src/lints.js';

describe('conductComplete', () => {
  const write = (body: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'conduct-'));
    writeFileSync(join(dir, 'cards.ts'), body);
    return dir;
  };

  test('a law two specs teach and a third never reads is a finding', () => {
    const dir = write(`
      export const billing = { name: 'billing', persona: 'p', guards: [prose('declareHonestly', 'x')] };
      export const fleet   = { name: 'fleet',   persona: 'p', guards: [prose('declareHonestly', 'y')] };
      export const claims  = { name: 'claims',  persona: 'p', guards: [] };
    `);
    const found = conductComplete(dir);
    expect(found.map(f => f.code)).toEqual(['CONDUCT_INCOMPLETE']);
    expect(found[0].sentence).toContain('claims');
    expect(found[0].sentence).toContain('declareHonestly');
  });

  test('a law on every spec asks nothing', () => {
    const dir = write(`
      export const billing = { name: 'billing', persona: 'p', guards: [prose('declareHonestly', 'x')] };
      export const claims  = { name: 'claims',  persona: 'p', guards: [prose('declareHonestly', 'y')] };
    `);
    expect(conductComplete(dir)).toEqual([]);
  });

  test('a law one spec alone teaches is that desk\'s own', () => {
    const dir = write(`
      export const fleet   = { name: 'fleet',   persona: 'p',
        guards: [prose('declareHonestly', 'x'), prose('registryFiguresAreGiven', 'z')] };
      export const billing = { name: 'billing', persona: 'p', guards: [prose('declareHonestly', 'y')] };
    `);
    expect(conductComplete(dir)).toEqual([]);
  });
});

import { approvable, coversResolve } from '../src/lints.js';

describe('coversResolve', () => {
  test('a key naming nothing the census carries is a finding', () => {
    const found = coversResolve(
      [{ id: 'cancel-asks-first', covers: ['consent:cancelBooking', 'onlyAfter:cancelBooking'] } as never],
      new Set(['confirmFirst:cancelBooking', 'onlyAfter:cancelBooking']));
    expect(found.map(f => f.code)).toEqual(['COVERS_UNRESOLVED']);
    expect(found[0].sentence).toContain('consent:cancelBooking');
    expect(found[0].sentence).toContain('confirmFirst:cancelBooking');
  });

  test('every key resolving asks nothing', () => {
    expect(coversResolve([{ id: 'x', covers: ['onlyAfter:cancelBooking'] } as never],
                         new Set(['onlyAfter:cancelBooking']))).toEqual([]);
  });
});

describe('approvable', () => {
  test('a case covering a guard its preset cannot trip is a finding', () => {
    const found = approvable(
      [{ id: 'move-confirmed', preset: 'everyoneCheckedIn',
         covers: ['precondition:moveBooking'] } as never],
      { presetLeavesGuardInert: () => true } as never);
    expect(found.map(f => f.code)).toEqual(['CASE_CANNOT_FIRE']);
  });
});

import { world } from '@looprun-ai/core';
import { presetsDeclared } from '../src/lints.js';

/** The hotel's own case: a scenario where the Friday guest has already checked in, and a card
 *  that carries the booking it names. `presets` is what decides the verb; the rest is the
 *  smallest card a world builds from. */
const hotelCard = (presets?: Readonly<Record<string, readonly unknown[]>>) => world({
  records: { bookings: { bk_1: { room: 'Blue Room', day: 'Friday', status: 'CONFIRMED' } } },
  reads: { getBooking: { form: 'get', entity: 'bookings', label: 'Look up one booking' } },
  destructive: { cancelBooking: { form: 'remove', entity: 'bookings', label: 'cancel a booking' } },
  ...(presets === undefined ? {} : { presets })
} as never);

const CHECKED_IN_CASE = [{ id: 'checked-in-booking-refuses', preset: 'everyoneCheckedIn',
                           turns: ['Cancel bk_1 — the guest never showed up.'] }] as never;

describe('presetsDeclared', () => {
  test('a case naming a preset the card does not declare is a finding', () => {
    const found = presetsDeclared(CHECKED_IN_CASE, hotelCard());
    expect(found.map(f => f.code)).toEqual(['CASE_PRESET_UNKNOWN']);
    expect(found[0].sentence).toBe(
      "case 'checked-in-booking-refuses' names preset 'everyoneCheckedIn', and the world card "
      + 'declares no such preset — the case constructs nothing and every rubric row goes unanswered.');
  });

  test('the same case over a card that carries the preset asks nothing', () => {
    expect(presetsDeclared(CHECKED_IN_CASE, hotelCard({
      everyoneCheckedIn: [{ entity: 'bookings', id: 'bk_1', set: { status: 'CHECKED_IN' } }]
    }))).toEqual([]);
  });

  test('a case naming no preset is walked past', () => {
    expect(presetsDeclared([{ id: 'cancel-asks-first', turns: ['Please cancel booking bk_1.'] }] as never,
                           hotelCard())).toEqual([]);
  });

  test('a world with no card is walked past — nothing there builds from a preset', () => {
    expect(presetsDeclared(CHECKED_IN_CASE,
      { url: 'https://example.invalid/mcp', reads: {}, writes: {}, destructive: {} } as never))
      .toEqual([]);
  });
});

import { promptLines } from '../src/lints.js';

describe('promptLines', () => {
  test('a contract rule whose acts are outside the lane is not a line this desk reads', () => {
    const compiled = {
      guards: [{ home: 'contract', rule: 'about issueRefund', tools: ['issueRefund'] },
               { home: 'contract', rule: 'about cancelBooking', tools: ['cancelBooking'] }],
      facts: { tools: { issueRefund: { does: 'refund' } } }
    };
    expect(promptLines(compiled as never, 'SYS')).toEqual(['SYS', 'about issueRefund', 'refund']);
  });

  test('skipGenerated drops the world sentences, keeping only what the cards author', () => {
    const compiled = {
      guards: [{ home: 'contract', rule: 'authored', tools: ['a'] }],
      facts: { tools: { a: { does: 'the world wrote this' } } }
    };
    expect(promptLines(compiled as never, 'SYS', { skipGenerated: true }))
      .toEqual(['SYS', 'authored']);
  });
});

import { byteOrigin } from '../src/lints.js';

describe('byteOrigin', () => {
  test('a world sentence is charged once per card that carries it', () => {
    const facts = { tools: { getAsset: { name: 'getAsset', does: 'x'.repeat(100), schema: {} } } };
    const desk = { guards: [], facts };
    const origin = byteOrigin([desk, desk] as never, facts as never);
    expect(origin.worldSentences).toBe(200);
  });

  test('a contract rule is charged apart from the sentence the world wrote', () => {
    const facts = { tools: { getAsset: { name: 'getAsset', does: 'world', schema: {} } } };
    const desk = { guards: [{ home: 'contract', rule: 'authored', tools: ['getAsset'] }], facts };
    const origin = byteOrigin([desk] as never, facts as never);
    expect(origin.worldSentences).toBe(5);
    expect(origin.contractRules).toBe(8);
  });

  test('an act in more than one lane is a row naming what it costs', () => {
    const facts = { tools: { getAsset: { name: 'getAsset', does: 'x'.repeat(50), schema: {} } } };
    const desk = { guards: [], facts };
    const origin = byteOrigin([desk, desk, desk] as never, facts as never);
    expect(origin.lanes[0]).toContain('getAsset');
    expect(origin.lanes[0]).toContain('3 lanes');
  });
});

import { readsOrdered, requiredReadsDisclosed, unspokenChecks } from '../src/lints.js';

describe('unspokenChecks', () => {
  const write = (body: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'unspoken-'));
    writeFileSync(join(dir, 'cards.ts'), body);
    return dir;
  };

  test('a result check on an act no sentence names is a finding', () => {
    const dir = write(`const CONTRACT = { guards: [
      { ...checkResult('issueRefund', r => null), name: 'refundLanded' } ] };`);
    const found = unspokenChecks(dir);
    expect(found.map(f => f.code)).toEqual(['CHECK_UNSPOKEN']);
    expect(found[0].sentence).toContain("the checkResult check on 'issueRefund' states no law");
  });

  test('the guard\'s own rule, or a prose rule naming the act, is the law in words', () => {
    const ruled = write(`const CONTRACT = { guards: [
      { ...checkResult('issueRefund', r => null), name: 'refundLanded',
        rule: 'A refund lands on the invoice the read returned, and on no other.' } ] };`);
    expect(unspokenChecks(ruled)).toEqual([]);
    const covered = write(`
      const prose = (name, rule, tool) => ({ name, rule, on: 'reply', tool });
      const CONTRACT = { guards: [
        { ...checkResult('issueRefund', r => null), name: 'refundLanded' },
        prose('refundsAreFinal', 'Money paid out does not come back.', ['issueRefund']) ] };`);
    expect(unspokenChecks(covered)).toEqual([]);
  });

  test('a cap refuses at a figure, so a card that states no ceiling is a finding', () => {
    const dir = write(`const CONTRACT = { disclosure: { issueRefund: {
      needs: { invoice: 'getInvoice' }, before: 'Refunding {args.amount}.',
      cap: { arg: 'amount', at: 'invoice.refundable', refusal: 'Too much.' } } } };`);
    const found = unspokenChecks(dir);
    expect(found.map(f => f.code)).toEqual(['CHECK_UNSPOKEN']);
    expect(found[0].sentence).toContain('disclosure.issueRefund.cap refuses at a figure');
  });

  test('a factory whose minted sentence states the whole law is never charged', () => {
    const dir = write(`const CONTRACT = { guards: [
      { ...onlyAfter('issueRefund', 'getInvoice'), name: 'refundReadsTheInvoice' },
      { ...valueFromUser('fileClaim', 'description'), name: 'theOperatorsWord' } ] };`);
    expect(unspokenChecks(dir)).toEqual([]);
  });
});

const REFUND_FACTS = { tools: {
  getInvoice: { effect: 'read' }, listInvoices: { effect: 'read' },
  issueRefund: { effect: 'destructive' } } } as never;

describe('readsOrdered', () => {
  const write = (body: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'ordered-'));
    writeFileSync(join(dir, 'cards.ts'), body);
    return dir;
  };

  const refundCase = (required: readonly unknown[]): readonly ExamCase[] =>
    [{ id: 'refund-01', split: 'fix', rubric: 'r',
       turns: ['refund inv_9', { approve: { tool: 'issueRefund' } }],
       invariants: { requiredToolCalls: required } } as ExamCase];

  test('a required read no act is ordered behind is a finding naming the case and the acts', () => {
    const dir = write(`const CONTRACT = { guards: [] };`);
    const found = readsOrdered(dir, refundCase([{ name: 'getInvoice' }]), REFUND_FACTS);
    expect(found.map(f => f.code)).toEqual(['REQUIRED_READ_UNORDERED']);
    expect(found[0].sentence).toContain("case 'refund-01' requires 'getInvoice'");
    expect(found[0].sentence).toContain('issueRefund');
  });

  test('the order the cards declare answers it', () => {
    const dir = write(`const CONTRACT = { guards: [ onlyAfter('issueRefund', 'getInvoice') ] };`);
    expect(readsOrdered(dir, refundCase([{ name: 'getInvoice' }]), REFUND_FACTS)).toEqual([]);
  });

  test('a guard literal naming its own acts binds the prerequisite to every one of them', () => {
    const dir = write(`const CONTRACT = { guards: [
      { ...onlyAfter('voidInvoice', 'getInvoice'), name: 'moneyReadsTheInvoice',
        tool: ['voidInvoice', 'issueRefund'] } ] };`);
    expect(readsOrdered(dir, refundCase([{ name: 'getInvoice' }]), REFUND_FACTS)).toEqual([]);
  });

  test('anyOf widens the requirement, so an order behind either read answers it', () => {
    const dir = write(`const CONTRACT = { guards: [ onlyAfter('issueRefund', 'listInvoices') ] };`);
    expect(readsOrdered(dir, refundCase([{ name: 'getInvoice', anyOf: ['listInvoices'] }]),
                        REFUND_FACTS)).toEqual([]);
  });

  test('a case that takes no act owes its reads to the flow, and the verb skips it', () => {
    const dir = write(`const CONTRACT = { guards: [] };`);
    const reading: readonly ExamCase[] = [{ id: 'read-01', split: 'fix', rubric: 'r',
      turns: ['what does inv_9 say?'],
      invariants: { requiredToolCalls: [{ name: 'getInvoice' }] } }];
    expect(readsOrdered(dir, reading, REFUND_FACTS)).toEqual([]);
  });
});

describe('requiredReadsDisclosed', () => {
  const write = (body: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'read-after-'));
    writeFileSync(join(dir, 'cards.ts'), body);
    return dir;
  };

  const CASES: readonly ExamCase[] = [{ id: 'refund-01', split: 'fix', rubric: 'r',
    turns: ['refund inv_9'],
    invariants: { requiredToolCalls: [{ name: 'getInvoice' }, { name: 'issueRefund' }] } }];

  test('a required read with no disclosure entry is a finding naming the read and the case', () => {
    const dir = write(`const CONTRACT = { disclosure: {} };`);
    const found = requiredReadsDisclosed(dir, CASES, REFUND_FACTS);
    expect(found.map(f => f.code)).toEqual(['READ_RESULT_UNSPOKEN']);
    expect(found[0].sentence).toContain("case 'refund-01' requires 'getInvoice'");
    expect(found[0].sentence).toContain("disclosure.getInvoice carries no 'after'");
  });

  test('an after that states no figure the read returned is a finding', () => {
    const dir = write(`const CONTRACT = { disclosure: { getInvoice: {
      after: 'The invoice was read.' } } };`);
    const found = requiredReadsDisclosed(dir, CASES, REFUND_FACTS);
    expect(found.map(f => f.code)).toEqual(['READ_RESULT_UNSPOKEN']);
    expect(found[0].sentence).toContain('carries no {result.…} slot');
  });

  test('an after carrying a result slot answers it, and the act beside it is no read', () => {
    const dir = write(`const CONTRACT = { disclosure: { getInvoice: {
      after: '{result.amountPaid} was paid and {result.refundable} can still go back.' } } };`);
    expect(requiredReadsDisclosed(dir, CASES, REFUND_FACTS)).toEqual([]);
  });
});

import { noEffectDenied, seamSpoken, unlicensed } from '../src/lints.js';

/** A subject whose world REFUSES the refund with one code of its own, and whose cards are
 *  whatever the test hands over. The two halves live in separate files exactly as a real subject
 *  keeps them: the codes come off the world, the sentences off the cards. */
function seamSubject(cards: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'seam-'));
  writeFileSync(join(dir, 'world.ts'), `export const subjectWorld = { destructive: {
    issueRefund: (w, a) => fail('INVOICE_ALREADY_SETTLED') } };`);
  writeFileSync(join(dir, 'cards.ts'), cards);
  return dir;
}

const REFUSED: readonly ExamCase[] = [{ id: 'refund-02', split: 'fix', rubric: 'r',
  turns: ['refund inv_9'], invariants: { noEffectToolCalls: [{ name: 'issueRefund' }] } }];

describe('seamSpoken', () => {
  test('an act the exam expects refused, with no law around any of its codes, is a finding', () => {
    const dir = seamSubject('const WHY = {};');
    const found = seamSpoken(dir, REFUSED, REFUND_FACTS);
    expect(found.map(f => f.code)).toEqual(['SEAM_UNSPOKEN']);
    expect(found[0].sentence).toContain("case 'refund-02' expects 'issueRefund' to change nothing");
    expect(found[0].sentence).toContain('INVOICE_ALREADY_SETTLED');
  });

  test('one seam law on the act answers it — the exam names the act, never the code', () => {
    const dir = seamSubject(`
      const prose = (name, rule) => ({ name, rule, on: 'reply' });
      const WHY = { 'seam:issueRefund:INVOICE_ALREADY_SETTLED': 'seam' };
      const SPECS = { billing: { name: 'billing', persona: 'p', guards: [
        prose('seam:issueRefund:INVOICE_ALREADY_SETTLED',
          'An invoice already settled takes no refund: say what the read returned, and what would '
          + 'have to change before money moves.') ] } };`);
    expect(seamSpoken(dir, REFUSED, REFUND_FACTS)).toEqual([]);
  });

  test('a law claiming any other licence pays no row, whatever it is named', () => {
    const dir = seamSubject(`
      const prose = (name, rule) => ({ name, rule, on: 'reply' });
      const WHY = { 'seam:issueRefund:INVOICE_ALREADY_SETTLED': 'conduct' };
      const SPECS = { billing: { name: 'billing', persona: 'p', guards: [
        prose('seam:issueRefund:INVOICE_ALREADY_SETTLED', 'Say what the read returned.') ] } };`);
    expect(seamSpoken(dir, REFUSED, REFUND_FACTS).map(f => f.code)).toEqual(['SEAM_UNSPOKEN']);
  });

  test('an act the world spells no refusal on is left alone — no row, nothing to pay', () => {
    const dir = seamSubject('const WHY = {};');
    const other: readonly ExamCase[] = [{ id: 'void-01', split: 'fix', rubric: 'r',
      turns: ['void inv_9'], invariants: { noEffectToolCalls: [{ name: 'listInvoices' }] } }];
    expect(seamSpoken(dir, other, REFUND_FACTS)).toEqual([]);
  });
});

describe('noEffectDenied', () => {
  const write = (body: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'undeniable-'));
    writeFileSync(join(dir, 'cards.ts'), body);
    return dir;
  };

  test('an act the exam expects refused, with no check at all, is a finding', () => {
    const found = noEffectDenied(write('const CONTRACT = { guards: [] };'), REFUSED);
    expect(found.map(f => f.code)).toEqual(['ACT_UNDENIABLE']);
    expect(found[0].sentence).toContain("case 'refund-02' expects 'issueRefund' to change nothing");
    expect(found[0].sentence).toContain('no check at all');
  });

  test('an onlyAfter alone is cleared by reading, so it is still a finding', () => {
    const dir = write(`const CONTRACT = { guards: [ onlyAfter('issueRefund', 'getInvoice') ] };`);
    const found = noEffectDenied(dir, REFUSED);
    expect(found.map(f => f.code)).toEqual(['ACT_UNDENIABLE']);
    expect(found[0].sentence).toContain('only onlyAfter, which is cleared by reading');
  });

  test('a check that decides the call answers it', () => {
    for (const guard of ['precondition(\'issueRefund\', h => h.record !== null)',
                         'valueFromUser(\'issueRefund\', \'amount\')',
                         'choiceFromUser(\'issueRefund\', { delivered: [\'deliver\'] })']) {
      expect(noEffectDenied(write(`const CONTRACT = { guards: [ ${guard} ] };`), REFUSED)).toEqual([]);
    }
  });

  test('a hand-written deny decides the call as much as a factory does', () => {
    const dir = write(`const CONTRACT = { guards: [
      { name: 'refundOnlyWhatIsOpen', tool: ['issueRefund'], deny: h => 'settled' } ] };`);
    expect(noEffectDenied(dir, REFUSED)).toEqual([]);
  });

  test('a wrapper around a deciding factory decides too', () => {
    const dir = write(`
      const moneyGate = (tool) => precondition(tool, h => h.record !== null);
      const CONTRACT = { guards: [ moneyGate('issueRefund') ] };`);
    expect(noEffectDenied(dir, REFUSED)).toEqual([]);
  });
});

describe('the seam licence', () => {
  const write = (body: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'seam-licence-'));
    writeFileSync(join(dir, 'cards.ts'), body);
    return dir;
  };

  const LAW = `prose('seam:issueRefund:INVOICE_ALREADY_SETTLED', `
    + `'An invoice already settled takes no refund.')`;
  const THREE_DESKS = `
    const prose = (name, rule) => ({ name, rule, on: 'reply' });
    const SPECS = {
      billing: { name: 'billing', persona: 'p', guards: [${LAW}] },
      audit:   { name: 'audit',   persona: 'p', guards: [${LAW}] },
      floor:   { name: 'floor',   persona: 'p', guards: [] } };`;

  test('a law about one act is owed by the desks holding it, not by the house', () => {
    const dir = write(`${THREE_DESKS}
      const WHY = { 'seam:issueRefund:INVOICE_ALREADY_SETTLED': 'seam' };`);
    expect(conductComplete(dir)).toEqual([]);
  });

  test('the same law claiming conduct is a house law, and the third desk never reads it', () => {
    const dir = write(`${THREE_DESKS}
      const WHY = { 'seam:issueRefund:INVOICE_ALREADY_SETTLED': 'conduct' };`);
    const found = conductComplete(dir);
    expect(found.map(f => f.code)).toEqual(['CONDUCT_INCOMPLETE']);
    expect(found[0].sentence).toContain('floor');
  });

  test('seam is a licence the WHY map may claim', () => {
    const dir = write(`${THREE_DESKS}
      const WHY = { 'seam:issueRefund:INVOICE_ALREADY_SETTLED': 'seam' };`);
    expect(unlicensed(dir)).toEqual([]);
  });
});
