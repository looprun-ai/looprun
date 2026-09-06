import { expect, test } from 'vitest';
import { writeCards } from '../src/index.js';
import type { Declaration, DeclaredGuard } from '../src/index.js';
import { decl, FACTS } from './helpers.js';

const LAW: DeclaredGuard = { name: 'aTechnicianIsOneTheOperatorNamed', acts: ['issueRefund'],
  factory: 'idNamedByUser',
  args: { arg: 'invoiceId', read: 'getInvoice', list: 'invoices', key: 'id', label: 'reference' } };

test('the factory is written from its five declared fields', () => {
  const written = writeCards(decl({ guards: [LAW] }) as Declaration, FACTS);
  expect(written).toContain("idNamedByUser('issueRefund', { arg: 'invoiceId', read: 'getInvoice', list: 'invoices', key: 'id', label: 'reference' })");
  expect(written).toContain("import { idNamedByUser } from '@looprun-ai/core';");
});

test('a missing field is refused by name', () => {
  expect(() => writeCards(decl({ guards: [{ ...LAW, args: { arg: 'invoiceId', read: 'getInvoice' } }] }) as Declaration, FACTS))
    .toThrow();
});
