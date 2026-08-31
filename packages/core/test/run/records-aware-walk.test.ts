import { test, expect } from 'vitest';
import { groundedRecords, ungroundedAmounts } from '../../src/run/turn.js';

// The identifiers that leave a text before its digit runs are read as amounts are the
// id-shaped tokens THE RECORDS THEMSELVES CARRY. A record's name for a thing is not an
// amount; a token the reply merely shaped like one is, and it answers for its digits.

/** A record set built from the operator's own words — the shortest honest feed. */
const records = (...texts: readonly string[]): ReturnType<typeof groundedRecords> =>
  groundedRecords(texts, [], []);

test('an identifier the records carry leaves the text before the walk', () => {
  expect(ungroundedAmounts('Kittiwake is off berth A-05.', records('berth A-05 is vacant')))
    .toEqual([]);
  expect(ungroundedAmounts('BK-4402 is closed.', records('BK-4402 stands open')))
    .toEqual([]);
  expect(ungroundedAmounts('bk_9 is cancelled.', records('getBooking(bk_9) — done')))
    .toEqual([]);
});

test('an id-shaped token no record carries is walked, and its digits answer for themselves', () => {
  const held = records('invoice inv_7001 carries a balance of 2930');
  expect(ungroundedAmounts('USD-500 stays owed.', held)).toEqual(['500']);
  expect(ungroundedAmounts('The week comes to A-364.', held)).toEqual(['364']);
  expect(ungroundedAmounts('EUR-1200 was charged.', held)).toEqual(['1200']);
});

// An identifier's digits are its NAME on both sides of the seam. The records give up
// their identifiers before their figures are counted, so a record's own name can never
// ground an amount a reply invents out of it.

test('a record identifier grounds no amount — its digits are the record\'s name', () => {
  const held = records('getInvoice(inv_7001) — done. Invoice inv_7001: 2930 outstanding.');
  expect(ungroundedAmounts('The balance is 7001.', held)).toEqual(['7001']);
  expect(ungroundedAmounts('The balance is 2930.', held)).toEqual([]);
  expect(ungroundedAmounts('Invoice inv_7001 stands.', held)).toEqual([]);
});

test('an invented id-shaped token is walked even when a record is numbered for its digits', () => {
  const held = records('getInvoice(inv_500) — done. Invoice inv_500: 40 outstanding.');
  expect(ungroundedAmounts('USD-500 stays owed.', held)).toEqual(['500']);
  expect(ungroundedAmounts('Invoice inv_500 stands at 40.', held)).toEqual([]);
});

test('an amount wearing a unit, a currency mark or a grouping separator is walked as it was', () => {
  const held = records('the quay runs 500 metres');
  expect(ungroundedAmounts('R$364 owed', held)).toEqual(['364']);
  expect(ungroundedAmounts('364m of quay', held)).toEqual(['364']);
  expect(ungroundedAmounts('364,00 owed', held)).toEqual(['364']);
  expect(ungroundedAmounts('R$500 owed', held)).toEqual([]);
});

test('a figure the records carry passes whatever the identifiers around it', () => {
  const held = records('berth A-05 holds 986 of deposit');
  expect(ungroundedAmounts('Berth A-05 keeps 986 held.', held)).toEqual([]);
});
