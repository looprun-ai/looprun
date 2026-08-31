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

test('valueFromUserOrRecord is emitted with the entity and the field it reads', () => {
  const text = cards({ name: 'refundAmountIsSomebodys', acts: ['issueRefund'],
    factory: 'valueFromUserOrRecord', args: { arg: 'amount', from: 'invoices', field: 'total' },
    rule: 'Refund the figure you were given or the one on the invoice.' });
  expect(text).toContain(
    'valueFromUserOrRecord(\'issueRefund\', \'amount\', \'invoices\', \'total\',');
  expect(text).toContain('Refund the figure you were given or the one on the invoice.');
});

test('argMatchesRecord is emitted with the field the target row fixes', () => {
  const text = cards({ name: 'refundCurrencyIsTheInvoices', acts: ['issueRefund'],
    factory: 'argMatchesRecord', args: { arg: 'currency', field: 'currency' },
    rule: 'Refund in the currency the invoice was raised in.' });
  expect(text).toContain('argMatchesRecord(\'issueRefund\', \'currency\', \'currency\',');
});

test('onlyAfterWhen is emitted as the order and the condition together', () => {
  const text = cards({ name: 'disputedRefundReadsTheInvoice', acts: ['issueRefund'],
    factory: 'onlyAfterWhen', args: { after: 'getInvoice', field: 'status', is: 'disputed' },
    rule: 'Read a disputed invoice before you refund it.' });
  expect(text).toContain('onlyAfterWhen(\'issueRefund\', \'getInvoice\',');
  expect(text).toContain('({ record }) => record?.status === \'disputed\'');
});

test('argSatisfiesCondition declared with neither is nor in is refused by the keys it is missing', () => {
  expect(() => cards({ name: 'refundReasonIsOnTheList', acts: ['issueRefund'],
    factory: 'argSatisfiesCondition', args: { arg: 'reason' }, rule: 'r' }))
    .toThrow(/args.is|args.in/);
});

test('valueFromUserOrRecord declared without its entity is refused by that key', () => {
  expect(() => cards({ name: 'refundAmountIsSomebodys', acts: ['issueRefund'],
    factory: 'valueFromUserOrRecord', args: { arg: 'amount', field: 'total' }, rule: 'r' }))
    .toThrow(/args.from/);
});

test('onlyAfterWhen declared without the field its condition reads is refused', () => {
  expect(() => cards({ name: 'disputedRefundReadsTheInvoice', acts: ['issueRefund'],
    factory: 'onlyAfterWhen', args: { after: 'getInvoice' }, rule: 'r' }))
    .toThrow(/args.field/);
});

test('a key no argument-shaped factory reads is refused by name', () => {
  expect(() => cards({ name: 'refundCurrencyIsTheInvoices', acts: ['issueRefund'],
    factory: 'argMatchesRecord', args: { arg: 'currency', field: 'currency', after: 'getInvoice' },
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

  expect(near('onlyAfter', { after: 'getInvoces' })).toEqual([
    'contract.guards[0].args.after names \'getInvoces\', and the surface declares no such act '
    + '— did you mean \'getInvoice\'?']);
  expect(near('onlyAfterWhen', { after: 'getInvoces', field: 'status', is: 'disputed' })).toEqual([
    'contract.guards[0].args.after names \'getInvoces\', and the surface declares no such act '
    + '— did you mean \'getInvoice\'?']);
});
