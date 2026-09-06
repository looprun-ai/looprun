/** A law only this business computes is written in code, exported by name from guards.ts beside
 *  the declaration; the declaration keeps naming the act, the read, the sentence and the seam
 *  row, and the card imports the predicate. */
import { expect, test } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeCards, authoredNames } from '../src/index.js';
import type { Declaration, DeclaredGuard } from '../src/index.js';
import { decl, FACTS } from './helpers.js';

const LAW: DeclaredGuard = { name: 'theOnlyOwnerStays', acts: ['issueRefund'],
  factory: 'precondition', args: { read: 'getInvoice', code: 'theOnlyOwnerStays' },
  rule: 'The only owner of a workspace is not removed; promote another member first.' };

const cards = (guards: readonly DeclaredGuard[], authored: readonly string[]): string =>
  writeCards(decl({ guards }) as Declaration, FACTS, authored);

test('a code law imports its predicate from guards.ts and hands it to the factory', () => {
  const written = cards([LAW], ['theOnlyOwnerStays']);
  expect(written).toContain("import { theOnlyOwnerStays } from './guards.js';");
  expect(written).toContain("precondition('issueRefund', theOnlyOwnerStays,");
  expect(written).toContain("name: 'theOnlyOwnerStays'");
});

test('a code law naming an export guards.ts does not carry is refused', () => {
  expect(() => cards([LAW], [])).toThrow('guards.ts beside the declaration exports no such name');
});

test('a code law declared beside a data form is refused', () => {
  expect(() => cards([{ ...LAW, args: { ...LAW.args, field: 'status', is: 'paid' } }], ['theOnlyOwnerStays']))
    .toThrow('declares args.code beside args.field');
});

test('reads: record configures nothing and is refused', () => {
  expect(() => cards([{ ...LAW, args: { reads: 'record', ...LAW.args } }], ['theOnlyOwnerStays']))
    .toThrow("declares args.reads, and factory 'precondition' is configured from");
});

test('the authored names are the exports of guards.ts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guards-'));
  writeFileSync(join(dir, 'guards.ts'),
    "export const a: Precondition = () => true;\nexport function b() { return false; }\nconst c = 1;\n");
  expect(authoredNames(join(dir, 'guards.ts'))).toEqual(['a', 'b']);
  expect(authoredNames(join(dir, 'none.ts'))).toEqual([]);
});
