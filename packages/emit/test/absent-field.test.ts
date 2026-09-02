/** A declared law about a field CARRYING NOTHING. The world's own refusal often keys on a
 *  record that either names something — a claim, a hold, an id — or names nothing at all,
 *  and a value tested for equality cannot state the second half. */
import { expect, test } from 'vitest';
import { writeCards } from '../src/index.js';
import type { Declaration } from '../src/index.js';
import { decl, FACTS } from './helpers.js';

const gate = (args: Readonly<Record<string, unknown>>): Declaration =>
  decl({ guards: [{ name: 'refundOnlyWhileNoClaimStands', acts: ['issueRefund'],
    factory: 'precondition', args,
    rule: 'An open claim stands against this hire, and money is not paid back while one does.' }] });

test('a field carrying nothing is declared, and the walk covers the missing field too', () => {
  const written = writeCards(
    gate({ reads: 'record', read: 'getInvoice', field: 'invoice.openClaimId', absent: true }), FACTS);
  expect(written).toContain("walkAnswer(answer, 'invoice.openClaimId') == null");
});

test('a value declared beside it states a second law under one name', () => {
  expect(() => writeCards(gate({ reads: 'record', read: 'getInvoice',
    field: 'invoice.openClaimId', absent: true, is: 'open' }), FACTS))
    .toThrow('the flag true and nothing beside it');
});

test('the flag is the word true, never a value of its own', () => {
  expect(() => writeCards(gate({ reads: 'record', read: 'getInvoice',
    field: 'invoice.openClaimId', absent: 'yes' }), FACTS))
    .toThrow('the flag true and nothing beside it');
});

test('a declaration carrying none of the three states no law at all', () => {
  expect(() => writeCards(gate({ reads: 'record', read: 'getInvoice',
    field: 'invoice.openClaimId' }), FACTS))
    .toThrow('args.absent');
});
