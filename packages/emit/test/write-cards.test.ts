import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { writeCards } from '../src/index.js';
import type { Declaration, DeclaredDisclosure, DeclaredGuard, DeclaredRewrite } from '../src/index.js';
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
 *  disclosure tense, each seam law, each persona, each teammate line, each routing line and each
 *  conduct law. */
function sentencesOf(declaration: Declaration): readonly string[] {
  const disclosure = Object.values(declaration.contract.disclosure);
  return [
    declaration.contract.voice,
    ...declaration.contract.facts,
    ...declaration.contract.guards.flatMap(g => g.rule === undefined ? [] : [g.rule]),
    ...Object.values(declaration.contract.seam ?? {}).flatMap(codes => Object.values(codes)),
    ...disclosure.flatMap(entry => [entry.before, entry.after, entry.later, entry.cap?.refusal,
      entry.empty].filter((s): s is string => s !== undefined)),
    ...declaration.desks.flatMap(desk => [desk.persona, ...Object.values(desk.conduct),
      ...(desk.summary === undefined ? [] : [desk.summary]),
      ...(desk.description === undefined ? [] : [desk.description])])
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
          tools: ['getInvoice'],
          conduct: { declareHonestly: 'Say what ran and what did not, and name the condition that stopped it.',
                     oneQuestion: 'Put ONE thing up for agreement per turn; the second is owed and takes another turn.' } },
        { name: 'billing', persona: 'You are the billing desk: the invoice for a stay, its payment, and a refund on it.',
          summary: 'invoices, payments and refunds on a stay already closed',
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
        wide: 'oneLawEveryAct', args: { why: 'conduct' }, rule }] }), FACTS);
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
                 args: { why: 'conduct' }, rule: 'Name the role the member record states.' }],
      desks: [{ name: 'a', persona: 'p', tools: ['issueRefund'], conduct: {} }] }), FACTS);
    expect(out).toContain("const prose = (name: string, rule: string): Guard =>");
    expect(out).toContain("import type { AgentSpec, DomainContract, Guard } from '@looprun-ai/core';");
  });

  test('the WHY map opens on the house laws, then the contract prose, then a desk\'s own', () => {
    const out = writeCards(decl({
      guards: [{ name: 'roleRefusalNamesWhoCan', acts: ['issueRefund'], factory: 'prose',
                 args: { why: 'conduct' }, rule: 'Name the role the member record states.' }],
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

  test('the WHY map claims what the author declared, and a desk law claims conduct', () => {
    const out = writeCards(decl({
      guards: [{ name: 'noWriteOffsHere', acts: ['issueRefund'], factory: 'prose',
                 args: { why: 'noSuchAct' },
                 rule: 'Nothing on this counter writes a charge off; say so and stop there.' },
               { name: 'whatTheInvoiceMeans', acts: ['getInvoice'], factory: 'prose',
                 args: { why: 'aboutARead' },
                 rule: 'A balance the invoice shows is the balance at the moment it was read.' }],
      desks: [{ name: 'a', persona: 'p', tools: ['issueRefund', 'getInvoice'],
                conduct: { declareHonestly: 'x' } }] }), FACTS);
    expect(out).toContain(['export const WHY = {',
      "  declareHonestly: 'conduct',",
      "  noWriteOffsHere: 'noSuchAct',",
      "  whatTheInvoiceMeans: 'aboutARead'",
      '} as const;'].join('\n'));
  });

  test('a prose rule claiming no licence is refused, and the guard is named', () => {
    expect(() => writeCards(decl({ guards: [
      { name: 'noWriteOffsHere', acts: ['issueRefund'], factory: 'prose',
        rule: 'Nothing on this counter writes a charge off.' }] }), FACTS))
      .toThrow("contract.guards 'noWriteOffsHere' declares factory 'prose', whose configuration "
        + 'is args.why');
  });

  test('a prose rule claiming a licence outside the set is refused by what it claims', () => {
    expect(() => writeCards(decl({ guards: [
      { name: 'noWriteOffsHere', acts: ['issueRefund'], factory: 'prose',
        args: { why: 'houseStyle' },
        rule: 'Nothing on this counter writes a charge off.' }] }), FACTS))
      .toThrow("carries 'houseStyle'");
  });

  test('a prose rule cannot claim a measured licence — no declaration judges a case', () => {
    expect(() => writeCards(decl({ guards: [
      { name: 'noWriteOffsHere', acts: ['issueRefund'], factory: 'prose',
        args: { why: 'measured:case-14' },
        rule: 'Nothing on this counter writes a charge off.' }] }), FACTS))
      .toThrow("claims args.why 'measured:case-14', and a measured licence is earned from a run");
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
      "{ ...precondition('issueRefund', ({ record }) => ['open', 'partial'].some(declared => declared === record?.state),");
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

  test('every tense the engine speaks is emitted, in the order the card carries them', () => {
    const out = writeCards(decl({ disclosure: { issueRefund: {
      needs: { invoice: 'getInvoice' },
      before: 'Refunding {invoice.invoice.total} cannot be taken back once it is put through.',
      after: 'The refund of {result.paid} went out and {result.stillHeld} stays on the invoice.',
      later: 'The refund on {args.invoiceId} is still the open piece of this stay.',
      empty: 'The invoice {args.invoiceId} carries no amount to refund, so there is nothing to put up.'
    } } }), FACTS);
    const tenses = out.split('\n').filter(line => line.trim().startsWith('before:')
      || line.trim().startsWith('after:') || line.trim().startsWith('later:')
      || line.trim().startsWith('empty:')).map(line => line.trim().split(':')[0]);
    expect(tenses).toEqual(['before', 'after', 'later', 'empty']);
    expect(out).toContain("later: 'The refund on {args.invoiceId} is still the open piece of this stay.'");
    expect(out).toContain("empty: 'The invoice {args.invoiceId} carries no amount to refund, so there is nothing to put up.'");
  });

  test('a tense still carrying a template slot is refused by the tense\'s own path', () => {
    const withTense = (entry: DeclaredDisclosure): Declaration =>
      decl({ disclosure: { issueRefund: { before: 'Say the invoice total before refunding it.', ...entry } } });
    expect(() => writeCards(withTense({ later: 'The refund on <the record> is still open.' }), FACTS))
      .toThrow('contract.disclosure.issueRefund.later still carries the template slot');
    expect(() => writeCards(withTense({ empty: 'The <record> carries no amount to refund.' }), FACTS))
      .toThrow('contract.disclosure.issueRefund.empty still carries the template slot');
  });

  test('a judged check lands on the desk that earned it, scoped to the acts it is about', () => {
    const out = writeCards(decl({ desks: [
      { name: 'billing', persona: 'p', tools: ['issueRefund', 'getInvoice'],
        conduct: { declareHonestly: 'Say what ran.' },
        judged: [{ factory: 'lieCheck', acts: ['issueRefund'] },
                 { factory: 'injectionCheck', acts: ['issueRefund', 'getInvoice'] }] }
    ] }), FACTS);
    expect(out).toContain("      prose('declareHonestly', 'Say what ran.'),");
    expect(out).toContain("      { ...lieCheck(), tool: ['issueRefund'] },");
    expect(out).toContain("      { ...injectionCheck(), tool: ['issueRefund', 'getInvoice'] }");
    expect(out).toContain("import { injectionCheck, lieCheck, onlyAfter, precondition } from '@looprun-ai/core';");
    // The desk that carries a judged check buys the pass that asks it.
    expect(out).toContain('    judgePass: true,');
  });

  test('a desk with no judged check buys no judged pass', () => {
    const out = writeCards(decl({ desks: [
      { name: 'billing', persona: 'p', tools: ['issueRefund'],
        conduct: { declareHonestly: 'Say what ran.' } }
    ] }), FACTS);
    expect(out).not.toContain('judgePass');
  });

  test('a judged check over no act is refused, and the desk that carries it is named', () => {
    const declaration = decl({ desks: [
      { name: 'billing', persona: 'p', tools: ['issueRefund'], conduct: { declareHonestly: 'x' },
        judged: [{ factory: 'hallucinationCheck', acts: [] }] }
    ] });
    expect(() => writeCards(declaration, FACTS))
      .toThrow("desks 'billing' declares judged 'hallucinationCheck' over no act");
  });

  test('the contract carries the words this business says its own way', () => {
    const declaration = decl();
    const out = writeCards({ ...declaration, contract: { ...declaration.contract, wording: {
      status: { held: 'waiting on you', 'not-done': 'not put through' },
      sentence: { deniedByGuard: 'A rule of this house stopped that.' }
    } } }, FACTS);
    expect(out).toContain('  wording: {');
    expect(out).toContain("    status: {");
    expect(out).toContain("      held: 'waiting on you',");
    expect(out).toContain("      'not-done': 'not put through'");
    expect(out).toContain("      deniedByGuard: 'A rule of this house stopped that.'");
  });

  test('a wording key the engine does not carry is refused, and the table is named', () => {
    const declaration = decl();
    const said = (wording: Declaration['contract']['wording']): Declaration =>
      ({ ...declaration, contract: { ...declaration.contract, wording } });
    expect(() => writeCards(said({ status: { finished: 'done' } }), FACTS))
      .toThrow("contract.wording.status declares 'finished'");
    expect(() => writeCards(said({ sentence: { deniedByRule: 'x' } }), FACTS))
      .toThrow("contract.wording.sentence declares 'deniedByRule'");
    expect(() => writeCards(said({}), FACTS))
      .toThrow('contract.wording carries neither status nor sentence');
    expect(() => writeCards(said({ status: {} }), FACTS))
      .toThrow('contract.wording.status is empty');
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
    expect(out).toContain("['owner', 'billing'].includes(actingField(state, 'accounts', 'actingStaffId', 'staff', 'grade'))");
    // The gate holds the records it decides on, so its refusal names who else carries a
    // value it allows — a permission is not somebody the operator can go to.
    expect(out).toContain("|| whoCan(state, 'staff', 'grade', ['owner', 'billing']),");
    expect(out).toContain('const whoCan = (state: StateSnapshot, from: string, field: string,');
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

  test('a secret states how it is treated, and a desk states its own ceilings', () => {
    const declaration = decl({ desks: [
      { name: 'billing', persona: 'p', tools: ['issueRefund'], conduct: { declareHonestly: 'x' },
        limits: { destructive: 2 } }] });
    const out = writeCards({ ...declaration, contract: { ...declaration.contract,
      secrets: ['email', { path: 'card.number', mode: 'omit' }], limits: { calls: 8 } } }, FACTS);
    expect(out).toContain("  secrets: ['email', { path: 'card.number', mode: 'omit' }],");
    expect(out).toContain('  limits: { calls: 8 }');
    expect(out).toContain('    limits: { destructive: 2 },');
  });

  test('a ceiling the engine does not carry is refused, and the card it sits on is named', () => {
    const declaration = decl({ desks: [
      { name: 'billing', persona: 'p', tools: ['issueRefund'], conduct: { declareHonestly: 'x' },
        limits: { questions: 4 } }] });
    expect(() => writeCards(declaration, FACTS))
      .toThrow("desks 'billing' limits declares 'questions'");
    expect(() => writeCards({ ...declaration, desks: [{ ...declaration.desks[0], limits: undefined }],
      contract: { ...declaration.contract, limits: { turns: 3 } } }, FACTS))
      .toThrow("contract.limits declares 'turns'");
  });

  test('a declaration reaching every mechanism the engine offers compiles as one card', () => {
    const declaration: Declaration = {
      contract: {
        name: 'harbour-chandlery',
        voice: 'Plain, brief, and exact about stock and money.',
        facts: ['An order is picked from one bay and never split across two.'],
        guards: [
          { name: 'refundReadsTheInvoice', acts: ['issueRefund'], factory: 'onlyAfter',
            args: { after: 'getInvoice' } },
          { name: 'refundWhileTheInvoiceStands', acts: ['issueRefund'], factory: 'precondition',
            args: { reads: 'record', field: 'settled', is: false },
            rule: 'A settled invoice takes no refund; read what it carries and say that instead.' },
          { name: 'invoiceIsOnFile', acts: ['getInvoice'], factory: 'precondition',
            args: { reads: 'record' },
            rule: 'The invoice named is not on file; read the number back and stop there.' },
          { name: 'tool:moneyGate', acts: ['issueRefund', 'closeBooking'], factory: 'role',
            wide: 'oneLawEveryAct',
            args: { anchor: 'counters', by: 'actingClerkId', from: 'clerks', field: 'grade',
                    in: ['keeper', 'treasury'] },
            rule: 'Moving money needs the treasury capability; read the clerk record and name a clerk whose grade can.' },
          { name: 'amountAsTheCustomerSaidIt', acts: ['issueRefund'], factory: 'valueFromUser',
            args: { arg: 'invoiceId' } },
          { name: 'invoiceIdInItsShape', acts: ['getInvoice'], factory: 'argFormat',
            args: { arg: 'invoiceId', pattern: 'inv_[0-9]{4}' } },
          { name: 'noOverrideOnALookup', acts: ['getInvoice'], factory: 'argAbsent',
            args: { arg: 'invoiceId' } },
          { name: 'oneRefundPerTurn', acts: ['issueRefund'], factory: 'cap',
            args: { calls: 1, scope: 'turn' },
            rule: 'One refund goes out per turn; a second is owed and takes another turn.' },
          { name: 'refundReallyLanded', acts: ['issueRefund'], factory: 'checkResult',
            args: { field: 'settled', is: true },
            rule: 'When the refund did not settle, say so and name what the result carries.' },
          { name: 'everyInvoiceAnswered', acts: ['getInvoice'], factory: 'mustAccountFor',
            args: { records: ['inv_2201'], status: 'refused' } },
          { name: 'seam:cardNumber', acts: ['issueRefund'], factory: 'blockPattern',
            args: { pattern: '[0-9]{13,19}', on: 'reply' },
            rule: 'A card number never goes out in a reply; say the last four the record carries.' },
          { name: 'closingIsSpokenNotAssumed', acts: ['closeBooking'], factory: 'prose',
            args: { why: 'aboutARead' },
            rule: 'A closing note states the figures the invoice carries, never a figure from memory.' }
        ],
        disclosure: {
          issueRefund: {
            needs: { invoice: 'getInvoice' },
            before: 'Refunding {invoice.invoice.total} cannot be taken back once it is put through.',
            after: 'The refund of {result.paid} went out; {result.stillHeld} stays on the invoice.',
            later: 'The refund on {args.invoiceId} is still the open piece of this order.',
            cap: { arg: 'invoiceId', at: 'invoice.invoice.refundable', not: 'above',
                   refusal: 'A refund of {args.invoiceId} cannot go out: {invoice.invoice.refundable} is what is left.' },
            empty: 'The invoice {args.invoiceId} carries no amount to refund, so nothing goes up.'
          }
        },
        rewrites: [
          { kind: 'maskPattern', name: 'taxNumber', pattern: '[A-Z]{2}[0-9]{9}' },
          { kind: 'purgePattern', name: 'internalNote', pattern: 'INTERNAL:[^\\n]*' },
          { kind: 'swapTerms', terms: { invoice: 'statement' } }
        ],
        secrets: ['email'],
        wording: { status: { held: 'waiting on you' },
                   sentence: { deniedByGuard: 'A rule of this house stopped that.' } },
        limits: { calls: 8, destructive: 1 }
      },
      desks: [
        { name: 'counter', persona: 'You are the chandlery counter: orders, invoices and refunds.',
          tools: ['issueRefund', 'getInvoice', 'closeBooking'],
          conduct: { declareHonestly: 'Say what ran and what did not, and the condition that stopped it.' },
          judged: [{ factory: 'lieCheck', acts: ['issueRefund'] },
                   { factory: 'hallucinationCheck', acts: ['getInvoice'] }] }
      ]
    };
    const out = writeCards(declaration, FACTS);
    const dir = mkdtempSync(join(tmpdir(), 'cards-'));
    writeFileSync(join(dir, 'cards.ts'), out);
    expect(typecheck(dir)).toEqual([]);

    // Every declared mechanism reaches the card under the name the engine imports it by.
    for (const factory of ['onlyAfter', 'precondition', 'valueFromUser',
      'argFormat', 'argAbsent', 'maxCalls', 'checkResult', 'mustAccountFor', 'blockPattern',
      'maskPattern', 'purgePattern', 'swapTerms', 'lieCheck', 'hallucinationCheck']) {
      expect(out, `${factory} reaches no line of the card`).toContain(`${factory}(`);
    }
    for (const field of ['rewrites: [', 'wording: {', 'later: ', 'empty: ', 'secrets: ', 'limits: ']) {
      expect(out, `${field} reaches no line of the card`).toContain(field);
    }
  });

  test('an argument no factory reads is refused, with the factory and the keys it does read', () => {
    const declaration = decl({ guards: [{ name: 'refundReadsTheInvoice', acts: ['issueRefund'],
      factory: 'onlyAfter', args: { after: 'getInvoice', pattern: '^inv_' } }] });
    expect(() => writeCards(declaration, FACTS))
      .toThrow("declares args.pattern, and factory 'onlyAfter' is configured from args.after");
  });
});

/** The section that pays the seam table: an act, one of the codes the world refuses it with, and
 *  the sentence the operator meeting that code needs. */
const SEAM_LAW = 'An invoice already settled takes no refund: say the status the read returned, '
  + 'and what would have to change before money moves.';
const SEAM_DECL = { issueRefund: { INVOICE_SETTLED: SEAM_LAW } };

describe('the seam section', () => {
  test('a seam law lands on the desks that hold its act, under the row it pays', () => {
    const out = writeCards(decl({ seam: SEAM_DECL }), FACTS);
    expect(out).toContain(`prose('seam:issueRefund:INVOICE_SETTLED', '${SEAM_LAW}')`);
    // Desk 'a' holds issueRefund and desk 'b' does not: one copy, not two.
    expect(out.match(/seam:issueRefund:INVOICE_SETTLED/g)).toHaveLength(2);  // the law and its licence
    expect(out.match(/An invoice already settled takes no refund/g)).toHaveLength(1);
  });

  test('the licence map claims seam for it, and the emitter writes no sentence of its own', () => {
    const out = writeCards(decl({ seam: SEAM_DECL }), FACTS);
    expect(out).toContain(`'seam:issueRefund:INVOICE_SETTLED': 'seam'`);
    const declared = new Set(sentencesOf(decl({ seam: SEAM_DECL })).map(s => s.trim()));
    for (const run of quotedRuns(out)) {
      expect([...declared].some(s => s.includes(run)), `unauthored run: ${run}`).toBe(true);
    }
  });

  test('a seam sentence still carrying a template slot is refused by its own path', () => {
    expect(() => writeCards(decl({ seam: { issueRefund: {
      INVOICE_SETTLED: 'A <thing that cannot happen> takes no refund.' } } }), FACTS))
      .toThrow('contract.seam.issueRefund.INVOICE_SETTLED still carries the template slot');
  });

  test('a declaration with no seam section emits exactly what it emitted before', () => {
    expect(writeCards(decl({ seam: {} }), FACTS)).toBe(writeCards(decl(), FACTS));
  });

  test('the emitted card compiles with the seam laws on it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'seam-cards-'));
    writeFileSync(join(dir, 'cards.ts'), writeCards(decl({ seam: SEAM_DECL }), FACTS));
    expect(typecheck(dir)).toEqual([]);
  });
});
