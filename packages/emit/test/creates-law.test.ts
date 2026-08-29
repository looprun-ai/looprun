/** The birth register against the declaration: every act the surface marks in `creates` opens a
 *  record that did not exist, and the declaration states two things about it or the emit refuses.
 *  The asked-for law — a prose guard licensed `conduct` naming the act — is what keeps the desk
 *  from opening records nobody asked for, and the `after` is the sentence that tells the operator
 *  which record now exists. An act outside the register owes neither. */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { factsFromSource, seamCovered } from '@looprun-ai/eval';
import { checkAgainstSurface, readDeclaration } from '../src/index.js';
import type { DeclaredDisclosure, DeclaredGuard } from '../src/index.js';
import { decl } from './helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** A school's surface: one act that mints a student record, one read beside it. The register
 *  marks the minting act alone. */
const SCHOOL = { tools: {
  enrollStudent: { name: 'enrollStudent', effect: 'write', target: null, entity: 'students',
    schema: { properties: { fields: {} }, required: ['fields'] } },
  getStudent: { name: 'getStudent', effect: 'read', target: 'id', entity: 'students',
    schema: { properties: { id: {} }, required: ['id'] } }
}, creates: ['enrollStudent'] } as never;

const ASKED_FOR: DeclaredGuard = {
  name: 'tool:studentsEnrollOnlyWhenAsked', acts: ['enrollStudent'],
  factory: 'prose', args: { why: 'conduct' },
  rule: 'Enroll a student only when the operator asked for that in this conversation.'
};

const AFTER: Readonly<Record<string, DeclaredDisclosure>> = {
  enrollStudent: { after: 'Student {result.id} is on the register.' }
};

const DESKS = [{ name: 'registrar', persona: 'The registrar desk.',
  tools: ['enrollStudent', 'getStudent'], conduct: { declareHonestly: 'Say what ran.' } }];

describe('the birth register demands the asked-for law and the after', () => {
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

  test('a record-opening act with the law but no after is refused naming the missing after', () => {
    const refusals = checkAgainstSurface(
      decl({ guards: [ASKED_FOR], disclosure: {}, desks: DESKS }), SCHOOL, []);
    expect(refusals).toEqual([expect.stringContaining(
      'contract.disclosure.enrollStudent.after is missing')]);
    expect(refusals[0]).toContain('opens a new record');
  });

  test('a record-opening act with both the law and the after passes', () => {
    expect(checkAgainstSurface(decl({ guards: [ASKED_FOR], disclosure: AFTER, desks: DESKS }),
      SCHOOL, [])).toEqual([]);
  });

  test('an act outside the birth register owes neither', () => {
    const unmarked = { ...(SCHOOL as { tools: unknown }), creates: [] } as never;
    expect(checkAgainstSurface(decl({ guards: [], disclosure: {}, desks: DESKS }), unmarked, []))
      .toEqual([]);
  });
});

/** The proof over a whole authored declaration: a 54-act surface whose register marks nine
 *  record-opening acts, beside a declaration that states an after for every one of them and the
 *  asked-for law for only two. The emit refuses the seven unlawed acts by name and nothing
 *  else — the two acts under a conduct prose law pass, and every after is already paid. */
describe('a full declaration against the register', () => {
  test('seven record-opening acts with no asked-for law are refused act by act', () => {
    const fixture = join(HERE, 'fixtures', 'asked-for-law-dropped');
    const declaration = readDeclaration(join(fixture, 'declaration.yaml'));
    const facts = factsFromSource(join(fixture, 'world.ts'));
    expect(facts.creates).toHaveLength(9);
    const refusals = checkAgainstSurface(declaration, facts, seamCovered(fixture, facts));
    const law = /^contract\.guards: the act '(\w+)' opens a new record and carries no prose law licensed conduct/;
    const unlawed = refusals.flatMap(refusal => law.exec(refusal)?.[1] ?? []);
    expect([...unlawed].sort()).toEqual(['createCustomer', 'fileClaim', 'generateInvoice',
      'generateQuote', 'placeHold', 'registerAsset', 'scheduleMaintenance']);
    expect(refusals).toHaveLength(unlawed.length);
  });
});
