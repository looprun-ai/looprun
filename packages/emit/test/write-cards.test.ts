import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { writeCards } from '../src/index.js';
import type { Declaration, DeclaredGuard, DeclaredRewrite } from '../src/index.js';
import { decl, FACTS, soundDeclaration } from './helpers.js';

const TREE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/** The emitted file compiles against the REAL engine types: `@looprun-ai/core` resolves to
 *  `packages/core/dist/index.d.ts`, the workspace package as the build states it, so a card the
 *  engine would reject is a diagnostic here. The returned array is one message per diagnostic;
 *  empty means the file compiles. */
function typecheck(dir: string): readonly string[] {
  writeFileSync(join(dir, 'package.json'), '{ "type": "module" }');
  const program = ts.createProgram([join(dir, 'cards.ts')], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    isolatedModules: true,
    verbatimModuleSyntax: true,
    types: [],
    baseUrl: TREE_ROOT,
    paths: { '@looprun-ai/core': [join(TREE_ROOT, 'packages/core/dist/index.d.ts')] }
  });
  return ts.getPreEmitDiagnostics(program)
    .map(d => ts.flattenDiagnosticMessageText(d.messageText, ' '));
}

/** Every sentence a declaration carries: the voice, the domain facts, each guard rule, each
 *  disclosure tense, each persona, each teammate line and each conduct law. */
function sentencesOf(declaration: Declaration): readonly string[] {
  const disclosure = Object.values(declaration.contract.disclosure);
  return [
    declaration.contract.voice,
    ...declaration.contract.facts,
    ...declaration.contract.guards.flatMap(g => g.rule === undefined ? [] : [g.rule]),
    ...disclosure.flatMap(entry => [entry.before, entry.after, entry.cap?.refusal]
      .filter((s): s is string => s !== undefined)),
    ...declaration.desks.flatMap(desk => [desk.persona, ...Object.values(desk.conduct),
      ...Object.values(desk.teammates ?? {})])
  ];
}

function declaredSentences(): readonly string[] {
  return sentencesOf(soundDeclaration());
}

/** Every single-quoted run of 40 characters or more the emitted file carries — the shape a
 *  business sentence takes in the output, and the shape an emitter's own prose would take. A
 *  sentence carrying an apostrophe is emitted with that apostrophe escaped, so the run this
 *  reads back is the tail of the declared sentence rather than the whole of it. */
function quotedRuns(out: string): readonly string[] {
  const runs: string[] = [];
  for (const line of out.split('\n')) {
    for (const quoted of line.matchAll(/'([^']{40,})'/g)) runs.push(quoted[1]);
  }
  return runs;
}

describe('writeCards', () => {
  test('every conduct law is emitted onto every desk, from one text', () => {
    const out = writeCards(decl({ desks: [
      { name: 'billing', persona: 'p1', tools: ['issueRefund'], conduct: { declareHonestly: 'Say what ran.' } },
      { name: 'claims',  persona: 'p2', tools: ['getInvoice'],  conduct: { declareHonestly: 'Say what ran.' } }
    ] }), FACTS);
    expect(out.match(/Say what ran\./g)).toHaveLength(2);
  });

  test('the WHY map is emitted from the declaration\'s own law names', () => {
    const out = writeCards(decl({ desks: [{ name: 'billing', persona: 'p', tools: ['issueRefund'],
                                            conduct: { declareHonestly: 'x' } }] }), FACTS);
    expect(out).toContain('export const WHY = {');
    expect(out).toContain("declareHonestly: 'conduct'");
  });

  test('it emits no sentence of its own', () => {
    const out = writeCards(soundDeclaration(), FACTS);
    for (const line of out.split('\n')) {
      const quoted = line.match(/'([^']{40,})'/);
      if (quoted) expect(declaredSentences()).toContain(quoted[1]);
    }
  });

  test('the output compiles', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cards-'));
    writeFileSync(join(dir, 'cards.ts'), writeCards(soundDeclaration(), FACTS));
    expect(typecheck(dir)).toEqual([]);
  });

  test('a declaration whose every field carries prose emits that prose and nothing else', () => {
    const declaration: Declaration = {
      contract: {
        name: 'seaside-hotel',
        voice: 'Warm, brief, and exact about dates and money; never agreeable at the cost of being wrong.',
        facts: ['Check-in is from 15:00 and check-out is by 11:00 on the day the stay ends.'],
        guards: [
          { name: 'refundReadsTheInvoice', acts: ['issueRefund'], factory: 'onlyAfter',
            args: { after: 'getInvoice' },
            rule: 'Read the invoice before a refund: what can still go back is what was paid minus what has already gone back.' },
          { name: 'moneyStandsOnARecord', acts: ['issueRefund', 'getInvoice'], factory: 'precondition',
            args: { reads: 'record' }, wide: 'sameRefusal',
            rule: 'The record this act names is not on file, so nothing here can act on it; read it back to the guest and stop.' }
        ],
        disclosure: {
          issueRefund: {
            needs: { invoice: 'getInvoice' },
            before: 'A refund on the guest\'s invoice cannot be taken back once it is put through.',
            after: 'The refund was put through and the guest will see it on the card it was paid with.'
          }
        },
        secrets: ['email'],
        limits: { calls: 8, destructive: 1 }
      },
      desks: [
        { name: 'front-desk', persona: 'You are the front desk: arrivals, departures and the room a guest is put in.',
          tools: ['getInvoice'], teammates: { billing: 'invoices, payments and refunds on a stay already closed' },
          conduct: { declareHonestly: 'Say what ran and what did not, and name the condition that stopped it.',
                     oneQuestion: 'Put ONE thing up for agreement per turn; the second is owed and takes another turn.' } },
        { name: 'billing', persona: 'You are the billing desk: the invoice for a stay, its payment, and a refund on it.',
          tools: ['issueRefund', 'getInvoice', 'closeBooking'],
          conduct: { declareHonestly: 'Say what ran and what did not, and name the condition that stopped it.',
                     oneQuestion: 'Put ONE thing up for agreement per turn; the second is owed and takes another turn.' } }
      ]
    };
    const out = writeCards(declaration, FACTS);
    const declared = sentencesOf(declaration);
    for (const run of quotedRuns(out)) {
      expect(declared.some(sentence => sentence.includes(run))).toBe(true);
    }
    expect(out).toContain("moneyStandsOnARecord: 'sameRefusal'");
    expect(out.match(/Put ONE thing up for agreement per turn/g)).toHaveLength(2);

    const dir = mkdtempSync(join(tmpdir(), 'cards-'));
    writeFileSync(join(dir, 'cards.ts'), out);
    expect(typecheck(dir)).toEqual([]);
  });

  test('a needs alias states the read and the args it is answered from', () => {
    const out = writeCards(decl({ disclosure: { issueRefund: {
      needs: { freezes: { tool: 'listHolds', args: {} },
               invoice: { tool: 'getInvoice', args: { invoiceId: 'invoiceId' } } },
      before: 'Say the invoice total before refunding it.' } } }), FACTS);
    expect(out).toContain("freezes: { tool: 'listHolds', args: {} }");
    expect(out).toContain("invoice: { tool: 'getInvoice', args: { invoiceId: 'invoiceId' } }");
  });

  test('a read is disclosed with the tense the declaration states for it', () => {
    const out = writeCards(decl({ disclosure: {
      issueRefund: { before: 'A refund pays money out and does not come back.' },
      getInvoice: { after: 'The invoice carries {result.total}, and {result.balanceDue} is still due.' }
    } }), FACTS);
    expect(out).toContain('getInvoice: {');
    expect(out).toContain("after: 'The invoice carries {result.total}, and {result.balanceDue} is still due.'");
  });

  test('a contract prose rule is emitted as its sentence and the acts it is stamped on', () => {
    const rule = 'Name the role the member record states, then a member whose role can act.';
    const out = writeCards(decl({ guards: [
      { name: 'confirmBeforeRefund', acts: ['issueRefund'], factory: 'onlyAfter',
        args: { after: 'getInvoice' } },
      { name: 'roleRefusalNamesWhoCan', acts: ['issueRefund', 'getInvoice'], factory: 'prose',
        wide: 'oneLawEveryAct', rule }] }), FACTS);
    expect(out).toContain(`{ ...prose('roleRefusalNamesWhoCan', '${rule}'), `
      + "tool: ['issueRefund', 'getInvoice'] }");
    // `prose` is the card's own helper, so the engine import names the factories and not it.
    expect(out).toContain("import { onlyAfter } from '@looprun-ai/core';");
    expect(out).toContain("roleRefusalNamesWhoCan: 'conduct'");
    expect(out).toContain("roleRefusalNamesWhoCan: 'oneLawEveryAct'");

    const dir = mkdtempSync(join(tmpdir(), 'cards-'));
    writeFileSync(join(dir, 'cards.ts'), out);
    expect(typecheck(dir)).toEqual([]);
  });

  test('a contract prose rule brings the helper the card writes it with', () => {
    const out = writeCards(decl({
      guards: [{ name: 'roleRefusalNamesWhoCan', acts: ['issueRefund'], factory: 'prose',
                 rule: 'Name the role the member record states.' }],
      desks: [{ name: 'a', persona: 'p', tools: ['issueRefund'], conduct: {} }] }), FACTS);
    expect(out).toContain("const prose = (name: string, rule: string): Guard =>");
    expect(out).toContain("import type { AgentSpec, DomainContract, Guard } from '@looprun-ai/core';");
  });

  test('the WHY map opens on the house laws, then the contract prose, then a desk\'s own', () => {
    const out = writeCards(decl({
      guards: [{ name: 'roleRefusalNamesWhoCan', acts: ['issueRefund'], factory: 'prose',
                 rule: 'Name the role the member record states.' }],
      desks: [
        { name: 'a', persona: 'p', tools: ['issueRefund'],
          conduct: { declareHonestly: 'x', registryFiguresAreGiven: 'z' } },
        { name: 'b', persona: 'p', tools: ['getInvoice'], conduct: { declareHonestly: 'x' } }] }), FACTS);
    expect(out).toContain(['export const WHY = {',
      "  declareHonestly: 'conduct',",
      "  roleRefusalNamesWhoCan: 'conduct',",
      "  registryFiguresAreGiven: 'conduct'",
      '} as const;'].join('\n'));
  });

  test('a declared ceiling is emitted as the ceiling the engine enforces', () => {
    const out = writeCards(decl({ disclosure: { issueRefund: {
      needs: { invoice: 'getInvoice' },
      before: 'Say the invoice total before refunding it.',
      cap: { arg: 'amount', at: 'invoice.refundable', not: 'above',
             refusal: 'This invoice can return at most {invoice.refundable}, and that is under what was asked.' }
    } } }), FACTS);
    expect(out).toContain("arg: 'amount'");
    expect(out).toContain("at: 'invoice.refundable'");
    expect(out).toContain("refusal: 'This invoice can return at most {invoice.refundable}, and that is under what was asked.'");

    const dir = mkdtempSync(join(tmpdir(), 'cards-'));
    writeFileSync(join(dir, 'cards.ts'), out);
    expect(typecheck(dir)).toEqual([]);
  });

  test('a ceiling missing what the engine needs names the fields and the path', () => {
    const declaration = decl({ disclosure: { issueRefund: {
      before: 'Say the invoice total before refunding it.',
      cap: { at: 'invoice.refundable', not: 'above' }
    } } });
    expect(() => writeCards(declaration, FACTS))
      .toThrow('contract.disclosure.issueRefund.cap declares no arg and no refusal');
  });

  test('a ceiling in a direction the engine cannot enforce is refused', () => {
    const declaration = decl({ disclosure: { issueRefund: {
      before: 'Say the invoice total before refunding it.',
      cap: { arg: 'amount', at: 'invoice.refundable', not: 'below', refusal: 'Nothing under it.' }
    } } });
    expect(() => writeCards(declaration, FACTS)).toThrow("declares 'not: below'");
  });

  test('a domain name that is not a plain slug is refused, and the path is named', () => {
    const sound = soundDeclaration();
    const declaration: Declaration = { ...sound,
      contract: { ...sound.contract, name: 'invoices */ process.exit(1); /*' } };
    expect(() => writeCards(declaration, FACTS)).toThrow('contract.name is');
    expect(() => writeCards(declaration, FACTS)).toThrow('letters, digits and hyphens');
  });

  test('a factory this emitter cannot write is answered before its arguments are read', () => {
    const declaration = decl({ guards: [{ name: 'refundNeedsAHuman', acts: ['issueRefund'],
      factory: 'deny', args: { after: 'getInvoice' }, rule: 'A refund is put to a person first.' }] });
    expect(() => writeCards(declaration, FACTS)).toThrow('a deny is a check written in code');
  });

  test('a precondition over a field emits the test the field states, single value or list', () => {
    const gate = (args: Readonly<Record<string, unknown>>): Declaration =>
      decl({ guards: [{ name: 'refundOnlyWhileOpen', acts: ['issueRefund'], factory: 'precondition',
        args, rule: 'A settled invoice takes no refund; read its state and say what it carries.' }] });
    const single = writeCards(gate({ reads: 'record', field: 'settled', is: false }), FACTS);
    expect(single).toContain("{ ...precondition('issueRefund', ({ record }) => record?.settled === false,");
    const several = writeCards(gate({ reads: 'record', field: 'state', in: ['open', 'partial'] }), FACTS);
    expect(several).toContain(
      "{ ...precondition('issueRefund', ({ record }) => ['open', 'partial'].some(value => value === record?.state),");
    const figure = writeCards(gate({ reads: 'record', field: 'balanceDue', is: 0 }), FACTS);
    expect(figure).toContain('record?.balanceDue === 0,');
  });

  test('a field with no value, two values or a block for a value is refused by its path', () => {
    const gate = (args: Readonly<Record<string, unknown>>): Declaration =>
      decl({ guards: [{ name: 'refundOnlyWhileOpen', acts: ['issueRefund'], factory: 'precondition',
        args, rule: 'A settled invoice takes no refund.' }] });
    expect(() => writeCards(gate({ reads: 'record', field: 'state' }), FACTS))
      .toThrow('this declaration carries neither');
    expect(() => writeCards(gate({ reads: 'record', field: 'state', is: 'open', in: ['open'] }), FACTS))
      .toThrow('this declaration carries both');
    expect(() => writeCards(gate({ reads: 'record', field: 'state', is: { open: true } }), FACTS))
      .toThrow('declares args.is as a block of its own');
    expect(() => writeCards(gate({ reads: 'record', field: 'state', in: [] }), FACTS))
      .toThrow('declares args.in');
    expect(() => writeCards(gate({ reads: 'record', is: 'open' }), FACTS))
      .toThrow('declares args.is and no args.field');
  });

  test('a forbidden argument is emitted as the check that refuses the call carrying it', () => {
    const out = writeCards(decl({ guards: [{ name: 'noSilentOverride', acts: ['getInvoice'],
      factory: 'argAbsent', args: { arg: 'invoiceId' } }] }), FACTS);
    expect(out).toContain("{ ...argAbsent('getInvoice', 'invoiceId'),");
    expect(out).toContain("name: 'noSilentOverride' }");
    expect(out).toContain("import { argAbsent } from '@looprun-ai/core';");
  });

  test('a result check emits the field it reads and the helper that reads it', () => {
    const out = writeCards(decl({ guards: [{ name: 'refundReallyLanded', acts: ['issueRefund'],
      factory: 'checkResult', args: { field: 'settled', is: true },
      rule: 'When the refund did not settle, say so and name what the result carries instead of reporting it paid.' }] }), FACTS);
    expect(out).toContain("{ ...checkResult('issueRefund', ctx =>");
    expect(out).toContain("resultField(ctx.result, 'settled') === true ? null : ''),");
    expect(out).toContain('const resultField = (result: Json, field: string): Json | undefined =>');
    expect(out).toContain('Json, ');
  });

  test('a result check states the field it reads and its law, and refuses without them', () => {
    const check = (guard: Partial<DeclaredGuard>): Declaration =>
      decl({ guards: [{ name: 'refundReallyLanded', acts: ['issueRefund'], factory: 'checkResult',
        args: { field: 'settled', is: true }, rule: 'Say what the result carries.', ...guard }] });
    expect(() => writeCards(check({ args: {} }), FACTS))
      .toThrow('declare args.field and the value that field owes');
    expect(() => writeCards(check({ args: { is: true } }), FACTS))
      .toThrow('declares args.is and no args.field');
    expect(() => writeCards(check({ rule: undefined }), FACTS))
      .toThrow('declare the `rule` it states');
  });

  test('a report law emits the records it names and the word it owes them', () => {
    const out = writeCards(decl({ guards: [{ name: 'everyInvoiceAccountedFor',
      acts: ['issueRefund'], factory: 'mustAccountFor',
      args: { records: ['inv_2201', 'inv_2202'], status: 'refused' } }] }), FACTS);
    expect(out).toContain(
      "{ ...mustAccountFor({ records: ['inv_2201', 'inv_2202'], status: 'refused' }),");
    expect(out).toContain("name: 'everyInvoiceAccountedFor',");
    // The factory takes no act, so one act still arrives as the scope the census reads.
    expect(out).toContain("tool: ['issueRefund'] }");
  });

  test('a report law over no record, or a word no report writes, is refused by its path', () => {
    const law = (args: Readonly<Record<string, unknown>>): Declaration =>
      decl({ guards: [{ name: 'everyInvoiceAccountedFor', acts: ['issueRefund'],
        factory: 'mustAccountFor', args }] });
    expect(() => writeCards(law({ records: [], status: 'refused' }), FACTS))
      .toThrow('args.records');
    expect(() => writeCards(law({ records: ['inv_2201'], status: 'settled' }), FACTS))
      .toThrow('declares args.status');
  });

  test('a blocked seam emits the pattern as data, the text it reads and its own sentence', () => {
    const out = writeCards(decl({ guards: [{ name: 'seam:cardNumber', acts: ['issueRefund'],
      factory: 'blockPattern', args: { pattern: '[0-9]{13,19}', on: 'reply' },
      rule: 'A card number never goes out in a reply; say the last four the record carries and stop.' }] }), FACTS);
    expect(out).toContain("{ ...blockPattern('seam:cardNumber', new RegExp('[0-9]{13,19}'),");
    expect(out).toContain("{ on: 'reply' }),");
    expect(out).toContain("tool: ['issueRefund'] }");
    // The factory is handed the name, so the literal never states it a second time.
    expect(out).not.toContain("name: 'seam:cardNumber'");
    expect(out).toContain("import { blockPattern } from '@looprun-ai/core';");
  });

  test('a blocked seam states which text it reads, and its sentence, or it is refused', () => {
    const seam = (guard: Partial<DeclaredGuard>): Declaration =>
      decl({ guards: [{ name: 'seam:cardNumber', acts: ['issueRefund'], factory: 'blockPattern',
        args: { pattern: '[0-9]{13,19}', on: 'reply' }, rule: 'Say the last four and stop.', ...guard }] });
    expect(() => writeCards(seam({ args: { pattern: '[0-9]{13,19}' } }), FACTS)).toThrow('args.on');
    expect(() => writeCards(seam({ args: { pattern: '[0-9]{13,19}', on: 'result' } }), FACTS)).toThrow('args.on');
    expect(() => writeCards(seam({ rule: undefined }), FACTS)).toThrow('declare the `rule` it states');
  });

  test('the contract carries its rewrites as the data each kind is configured from', () => {
    const declaration = decl();
    const out = writeCards({ ...declaration, contract: { ...declaration.contract, rewrites: [
      { kind: 'maskPattern', name: 'taxNumber', pattern: '[A-Z]{2}[0-9]{9}' },
      { kind: 'purgePattern', name: 'internalNote', pattern: 'INTERNAL:[^\\n]*' },
      { kind: 'swapTerms', terms: { invoice: 'statement', refund: 'reimbursement' } }
    ] } }, FACTS);
    expect(out).toContain("    maskPattern('taxNumber', new RegExp('[A-Z]{2}[0-9]{9}')),");
    expect(out).toContain("    purgePattern('internalNote', new RegExp('INTERNAL:[^\\\\n]*')),");
    expect(out).toContain("    swapTerms({ invoice: 'statement', refund: 'reimbursement' })");
    expect(out).toContain("import { maskPattern, onlyAfter, precondition, purgePattern, swapTerms } from '@looprun-ai/core';");
  });

  test('a rewrite missing what its kind is configured from is refused by its index', () => {
    const declaration = decl();
    const withRewrites = (rewrites: readonly DeclaredRewrite[]): Declaration =>
      ({ ...declaration, contract: { ...declaration.contract, rewrites } });
    expect(() => writeCards(withRewrites([{ kind: 'maskPattern', name: 'taxNumber' }]), FACTS))
      .toThrow("contract.rewrites[0] declares kind 'maskPattern' and no pattern");
    expect(() => writeCards(withRewrites([{ kind: 'swapTerms', terms: {} }]), FACTS))
      .toThrow("contract.rewrites[0] declares kind 'swapTerms'");
    expect(() => writeCards(withRewrites([{ kind: 'swapTerms', name: 'x', terms: { a: 'b' } }]), FACTS))
      .toThrow('contract.rewrites[0] declares name');
  });

  test('a role gate emits one precondition over the acting record, and the walk beside it', () => {
    const declaration = decl({ guards: [{ name: 'tool:moneyGate',
      acts: ['issueRefund', 'closeBooking'], factory: 'role',
      args: { anchor: 'accounts', by: 'actingStaffId', from: 'staff', field: 'grade',
              in: ['owner', 'billing'] },
      wide: 'oneLawEveryAct',
      rule: 'Moving money needs the money capability, and the acting member\'s recorded grade does not carry it.' }] });
    const out = writeCards(declaration, FACTS);
    expect(out).toContain("{ ...precondition(['issueRefund', 'closeBooking'], ({ state }) =>");
    expect(out).toContain("['owner', 'billing'].includes(actingField(state, 'accounts', 'actingStaffId', 'staff', 'grade')),");
    expect(out).toContain("name: 'tool:moneyGate' }");
    // The factory takes every act itself, so the literal around it adds no second scope.
    expect(out).not.toContain("tool: ['issueRefund', 'closeBooking']");
    expect(out).toContain('const actingField = (state: StateSnapshot');
    expect(out).toContain('StateSnapshot } from \'@looprun-ai/core\';');
  });

  test('a role gate states the values its field may carry, and refuses without them', () => {
    const gate = (args: Readonly<Record<string, unknown>>): Declaration =>
      decl({ guards: [{ name: 'tool:moneyGate', acts: ['issueRefund'], factory: 'role', args,
        rule: 'Moving money needs the money capability.' }] });
    const walk = { anchor: 'accounts', by: 'actingStaffId', from: 'staff', field: 'grade' };
    expect(() => writeCards(gate({ ...walk, in: [] }), FACTS)).toThrow('args.in');
    expect(() => writeCards(gate({ ...walk, in: [7] }), FACTS)).toThrow('args.in');
    expect(() => writeCards(gate({ by: 'actingStaffId', from: 'staff', field: 'grade', in: ['owner'] }), FACTS))
      .toThrow('args.anchor');
  });

  test('a role gate states its law in the card\'s own words, and refuses without them', () => {
    const declaration = decl({ guards: [{ name: 'tool:moneyGate', acts: ['issueRefund'],
      factory: 'role', args: { anchor: 'accounts', by: 'actingStaffId', from: 'staff',
                               field: 'grade', in: ['owner'] } }] });
    expect(() => writeCards(declaration, FACTS)).toThrow('declare the `rule` it states');
  });

  test('an argument no factory reads is refused, with the factory and the keys it does read', () => {
    const declaration = decl({ guards: [{ name: 'refundReadsTheInvoice', acts: ['issueRefund'],
      factory: 'onlyAfter', args: { after: 'getInvoice', pattern: '^inv_' } }] });
    expect(() => writeCards(declaration, FACTS))
      .toThrow("declares args.pattern, and factory 'onlyAfter' is configured from args.after");
  });
});
