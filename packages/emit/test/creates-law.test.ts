/** The birth register against the declaration: every act the surface marks in `creates` opens a
 *  record that did not exist, and the declaration states two things about it or the emit refuses.
 *  The asked-for law — a prose guard licensed `conduct` naming the act — is what keeps the desk
 *  from opening records nobody asked for, and the `after` is the sentence that tells the operator
 *  which record now exists. An act outside the register owes no asked-for law, and owes its after
 *  the way every act that changes the world owes one. */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { factsFromSource, seamCovered } from '@looprun-ai/eval';
import { checkAgainstSurface, readDeclaration } from '../src/index.js';
import type { DeclaredDisclosure, DeclaredGuard } from '../src/index.js';
import { decl } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** A school's acts: one that mints a student record, one that mints a quote, one read beside
 *  them. */
const TOOLS = {
  enrollStudent: { name: 'enrollStudent', effect: 'write', target: null, entity: 'students',
    schema: { properties: { fields: {} }, required: ['fields'] } },
  generateQuote: { name: 'generateQuote', effect: 'write', target: null, entity: 'quotes',
    schema: { properties: { fields: {} }, required: ['fields'] } },
  getStudent: { name: 'getStudent', effect: 'read', target: 'id', entity: 'students',
    schema: { properties: { id: {} }, required: ['id'] } }
};

/** The school's surface, whose register marks the enrolment alone. */
const SCHOOL = { tools: TOOLS, creates: ['enrollStudent'] } as never;

/** The same surface whose register misspells the quote act: a name no act on the card carries. */
const TYPO = { tools: TOOLS, creates: ['generateQuot'] } as never;

const ASKED_FOR: DeclaredGuard = {
  name: 'tool:studentsEnrollOnlyWhenAsked', acts: ['enrollStudent'],
  factory: 'prose', args: { why: 'conduct' },
  rule: 'Enroll a student only when the operator asked for that in this conversation.'
};

/** The quote act's after-tense. It opens a record the register does not mark, and an act that
 *  changes the world owes the operator that sentence whether the register marks it or not — so
 *  every fixture here states it, and the ones testing the register's own gap leave only the
 *  enrolment's after out. */
const QUOTE_AFTER: Readonly<Record<string, DeclaredDisclosure>> = {
  generateQuote: { after: 'Quote {result.quoteId} totals {result.total}.' }
};

const AFTER: Readonly<Record<string, DeclaredDisclosure>> = {
  ...QUOTE_AFTER,
  enrollStudent: { after: 'Student {result.id} is on the register.' }
};

const DESKS = [{ name: 'registrar', persona: 'The registrar desk.',
  tools: ['enrollStudent', 'getStudent'], conduct: { declareHonestly: 'Say what ran.' } }];

describe('the birth register demands the asked-for law and the after', () => {
  test('a mutating act off the register with no after is refused naming it', () => {
    expect(checkAgainstSurface(decl({ guards: [ASKED_FOR],
      disclosure: { enrollStudent: AFTER.enrollStudent }, desks: DESKS }), SCHOOL, []))
      .toEqual([expect.stringContaining(
        "contract.disclosure.generateQuote.after is missing")]);
  });

  test('a record-opening act with no prose law licensed conduct is refused by name', () => {
    expect(checkAgainstSurface(decl({ guards: [], disclosure: AFTER, desks: DESKS }), SCHOOL, []))
      .toEqual([expect.stringContaining(
        "the act 'enrollStudent' opens a new record and carries no prose law licensed conduct")]);
  });

  test('a prose law under another licence does not stand in for the asked-for law', () => {
    const aboutARead: DeclaredGuard = { ...ASKED_FOR, args: { why: 'aboutARead' } };
    expect(checkAgainstSurface(decl({ guards: [aboutARead], disclosure: AFTER, desks: DESKS }),
      SCHOOL, []))
      .toEqual([expect.stringContaining(
        "the act 'enrollStudent' opens a new record and carries no prose law licensed conduct")]);
  });

  test('a conduct law naming the act among acts outside the register does not stand in for it', () => {
    const wide: DeclaredGuard = { ...ASKED_FOR, acts: ['enrollStudent', 'getStudent'] };
    expect(checkAgainstSurface(decl({ guards: [wide], disclosure: AFTER, desks: DESKS }),
      SCHOOL, []))
      .toEqual([expect.stringContaining(
        "the act 'enrollStudent' opens a new record and carries no prose law licensed conduct")]);
  });

  test('a record-opening act with the law but no after is refused naming the missing after', () => {
    const refusals = checkAgainstSurface(
      decl({ guards: [ASKED_FOR], disclosure: QUOTE_AFTER, desks: DESKS }), SCHOOL, []);
    expect(refusals).toEqual([expect.stringContaining(
      'contract.disclosure.enrollStudent.after is missing')]);
    expect(refusals[0]).toContain('opens a new record');
  });

  test('a record-opening act with both the law and the after passes', () => {
    expect(checkAgainstSurface(decl({ guards: [ASKED_FOR], disclosure: AFTER, desks: DESKS }),
      SCHOOL, [])).toEqual([]);
  });

  test('an act outside the birth register owes no asked-for law', () => {
    const unmarked = { tools: TOOLS, creates: [] } as never;
    expect(checkAgainstSurface(decl({ guards: [], disclosure: AFTER, desks: DESKS }), unmarked, []))
      .toEqual([]);
  });

  test('a register entry naming an act the surface lacks is refused, near miss named', () => {
    const refusals = checkAgainstSurface(
      decl({ guards: [ASKED_FOR], disclosure: AFTER, desks: DESKS }), TYPO, []);
    expect(refusals).toEqual([expect.stringContaining(
      "world.creates[0] names 'generateQuot', and the world card declares no such act")]);
    expect(refusals[0]).toContain("Did you mean 'generateQuote'?");
  });
});

/** The proof over a whole authored declaration: a 54-act surface whose register marks nine
 *  record-opening acts, beside a declaration that states an after for every one of them and no
 *  asked-for law at all. Its one conduct-licensed prose rule is a freeze-reading law that names
 *  two register acts among three the register does not carry, and a law that wide licenses no
 *  birth — so all nine acts are refused by name, and nothing else is: every after is paid. */
describe('a full declaration against the register', () => {
  test('nine record-opening acts with no asked-for law are refused act by act', () => {
    const fixture = join(HERE, 'fixtures', 'asked-for-law-dropped');
    const declaration = readDeclaration(join(fixture, 'declaration.yaml'));
    const facts = factsFromSource(join(fixture, 'world.ts'));
    expect(facts.creates).toHaveLength(9);
    const refusals = checkAgainstSurface(declaration, facts, seamCovered(fixture, facts));
    const law = /^contract\.guards: the act '(\w+)' opens a new record and carries no prose law licensed conduct/;
    const unlawed = refusals.flatMap(refusal => law.exec(refusal)?.[1] ?? []);
    expect([...unlawed].sort()).toEqual(['createBooking', 'createCustomer', 'fileClaim',
      'generateInvoice', 'generateQuote', 'inviteMember', 'placeHold', 'registerAsset',
      'scheduleMaintenance']);
    expect(refusals).toHaveLength(unlawed.length);
  });
});
