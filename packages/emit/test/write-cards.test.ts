import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { writeCards } from '../src/index.js';
import type { Declaration } from '../src/index.js';
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

  test('an argument no factory reads is refused, with the factory and the keys it does read', () => {
    const declaration = decl({ guards: [{ name: 'refundReadsTheInvoice', acts: ['issueRefund'],
      factory: 'onlyAfter', args: { after: 'getInvoice', pattern: '^inv_' } }] });
    expect(() => writeCards(declaration, FACTS))
      .toThrow("declares args.pattern, and factory 'onlyAfter' is configured from args.after");
  });
});
