/** A law over a LIST read decides on the rows the CALL names: the rows whose declared field
 *  carries the held call's own argument, every one of which has to carry the declared value.
 *  A list with no row naming the call refuses nothing. */
import { expect, test } from 'vitest';
import { writeCards } from '../src/index.js';
import type { Declaration, DeclaredGuard } from '../src/index.js';
import { decl, FACTS } from './helpers.js';

const LAW: DeclaredGuard = { name: 'noRefundUnderAnOpenClaim', acts: ['issueRefund'],
  factory: 'precondition',
  args: { reads: 'record', read: 'listClaims',
    pick: { list: 'claims', by: 'invoiceId', key: 'invoiceId' },
    field: 'status', in: ['settled', 'denied'] },
  rule: 'A refund waits while a claim against the invoice is open; say which claim stands.' };

const cards = (guards: readonly DeclaredGuard[]): string =>
  writeCards(decl({ guards }) as Declaration, FACTS);

test('the picked rows are the ones carrying the call\'s own argument, and each is tested', () => {
  const written = cards([LAW]);
  expect(written).toContain("const rows = walkAnswer(answer, 'claims');");
  expect(written).toContain("walkAnswer(row, 'invoiceId') === args['invoiceId']");
  expect(written).toContain("picked.every(row => ['settled', 'denied'].some(declared => declared === walkAnswer(row, 'status')))");
});

test('a pick with no field to test is refused', () => {
  expect(() => cards([{ ...LAW, args: { reads: 'record', read: 'listClaims',
    pick: { list: 'claims', by: 'invoiceId', key: 'invoiceId' } } }]))
    .toThrow('declares args.pick and no args.field');
});

test('a pick that is not { list, by, key } is refused', () => {
  expect(() => cards([{ ...LAW, args: { ...LAW.args, pick: { list: 'claims' } } }]))
    .toThrow('{ list, by, key }');
});
