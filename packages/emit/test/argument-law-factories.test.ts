/** The four argument-shaped rungs, declared: a law over the call's own argument, a value the
 *  operator wrote or the records hold, a value the record already fixes, and the order demanded
 *  exactly where the record says so. Each row states what it is configured from, and a
 *  declaration missing that configuration is refused by the key it is missing. */
import { expect, test } from 'vitest';
import { checkAgainstSurface, writeCards } from '../src/index.js';
import type { DeclaredGuard } from '../src/index.js';
import { decl, FACTS, SEAM } from './helpers.js';

const cards = (guard: DeclaredGuard): string => writeCards(decl({ guards: [guard] }), FACTS);

test('argSatisfiesCondition is emitted as a law over the value the call carries', () => {
  const text = cards({ name: 'refundReasonIsOnTheList', acts: ['issueRefund'],
    factory: 'argSatisfiesCondition', args: { arg: 'reason', in: ['duplicate', 'overcharge'] },
    rule: 'A refund carries the reason it was raised under.' });
  expect(text).toContain('argSatisfiesCondition(\'issueRefund\', \'reason\', ({ value }) =>');
  expect(text).toContain('[\'duplicate\', \'overcharge\'].some(declared => declared === value)');
  expect(text).toContain('A refund carries the reason it was raised under.');
  expect(text).toContain('import { argSatisfiesCondition } from \'@looprun-ai/core\';');
});

test('valueFromUserOrRecord is emitted with the read and the path it walks', () => {
  const text = cards({ name: 'refundAmountIsSomebodys', acts: ['issueRefund'],
    factory: 'valueFromUserOrRecord', args: { arg: 'amount', read: 'getInvoice', at: 'total' },
    rule: 'Refund the figure you were given or the one on the invoice.' });
  expect(text).toContain(
    "valueFromUserOrRecord('issueRefund', 'amount', { read: 'getInvoice', at: 'total' },");
  expect(text).toContain('Refund the figure you were given or the one on the invoice.');
});

test('argMatchesRecord is emitted with the read and the path that fixes the value', () => {
  const text = cards({ name: 'refundCurrencyIsTheInvoices', acts: ['issueRefund'],
    factory: 'argMatchesRecord', args: { arg: 'currency', read: 'getInvoice', at: 'currency' },
    rule: 'Refund in the currency the invoice was raised in.' });
  expect(text).toContain("argMatchesRecord('issueRefund', 'currency', { read: 'getInvoice', at: 'currency' },");
});

test('needs is emitted with its declared renames and pick', () => {
  const text = cards({ name: 'refundReadsTheInvoice', acts: ['issueRefund'],
    factory: 'needs', args: { read: 'getInvoice', args: { invoiceId: 'invoiceId' },
      pick: { list: 'invoices', by: 'id', key: 'invoiceId' } } });
  expect(text).toContain('needs(\'issueRefund\', { read: \'getInvoice\', '
    + 'args: { invoiceId: \'invoiceId\' }, '
    + 'pick: { list: \'invoices\', by: \'id\', key: \'invoiceId\' } })');
});

test('argSatisfiesCondition declared with neither is nor in is refused by the keys it is missing', () => {
  expect(() => cards({ name: 'refundReasonIsOnTheList', acts: ['issueRefund'],
    factory: 'argSatisfiesCondition', args: { arg: 'reason' }, rule: 'r' }))
    .toThrow(/args.is|args.in/);
});

test('valueFromUserOrRecord declared without its read is refused by that key', () => {
  expect(() => cards({ name: 'refundAmountIsSomebodys', acts: ['issueRefund'],
    factory: 'valueFromUserOrRecord', args: { arg: 'amount', at: 'total' }, rule: 'r' }))
    .toThrow(/args.read/);
});

test('needs declared without its read is refused', () => {
  expect(() => cards({ name: 'refundReadsTheInvoice', acts: ['issueRefund'],
    factory: 'needs', args: {}, rule: 'r' }))
    .toThrow(/args.read/);
});

test('a key no argument-shaped factory reads is refused by name', () => {
  expect(() => cards({ name: 'refundCurrencyIsTheInvoices', acts: ['issueRefund'],
    factory: 'argMatchesRecord', args: { arg: 'currency', read: 'getInvoice', at: 'currency', after: 'x' },
    rule: 'r' })).toThrow(/args.after/);
});

/** A prerequisite spelled one letter off is never a call anyone can make: the guard it configures
 *  denies its act for the whole conversation, and every downstream lint sees an act that carries a
 *  check. The emitter names it back, and names the act it meant. */
test('a prerequisite the surface does not declare is named back, with the act it meant', () => {
  const near = (factory: DeclaredGuard['factory'], args: Record<string, unknown>): string[] =>
    [...checkAgainstSurface(decl({ guards: [{ name: 'refundReadsTheInvoice',
      acts: ['issueRefund'], factory, args, rule: 'Read the invoice before you refund it.' }] }),
      FACTS, SEAM)];

  expect(near('needs', { read: 'getInvoces' })).toEqual([
    'contract.guards[0].args.read names \'getInvoces\', and the surface declares no such act '
    + '— did you mean \'getInvoice\'?']);
});
