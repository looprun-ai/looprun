/** A law over the records decides on the record the CALL names. Every answer in the reads log
 *  is keyed by the arguments it was read with, and the read-order rule beside the law is what
 *  says which of the act's arguments name that record. */
import { expect, test } from 'vitest';
import { writeCards } from '../src/index.js';
import type { Declaration, DeclaredGuard } from '../src/index.js';
import { decl, FACTS } from './helpers.js';

const LAW: DeclaredGuard = { name: 'refundOnlyWhileOpen', acts: ['issueRefund'],
  factory: 'precondition',
  args: { reads: 'record', read: 'getInvoice', field: 'settled', is: false },
  rule: 'A settled invoice takes no refund; read its state and say what it carries.' };

const READ_ORDER: DeclaredGuard = { name: 'refundReadsTheInvoice', acts: ['issueRefund'],
  factory: 'needs', args: { read: 'getInvoice', args: { invoiceId: 'invoiceId' } },
  rule: 'Read the invoice before a refund.' };

const cards = (guards: readonly DeclaredGuard[]): string =>
  writeCards(decl({ guards }) as Declaration, FACTS);

test('the read-order rule beside the law names the record, and the law is bound to it', () => {
  const written = cards([READ_ORDER, LAW]);
  expect(written).toContain('"invoiceId":\' + JSON.stringify(args[\'invoiceId\'])');
  expect(written).toContain("reads.latest('getInvoice', bound)");
});

test('the law stands on the newest answer where no rule maps the arguments', () => {
  const written = cards([LAW]);
  expect(written).toContain("const answer = reads.latest('getInvoice')?.answer;");
  expect(written).not.toContain('const bound =');
});

test('a read-order rule declaring no mapping binds nothing', () => {
  const written = cards([{ ...READ_ORDER, args: { read: 'getInvoice' } }, LAW]);
  expect(written).toContain("const answer = reads.latest('getInvoice')?.answer;");
});
