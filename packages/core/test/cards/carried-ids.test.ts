import { test, expect } from 'vitest';
import { carriedIds } from '../../src/cards/catalog.js';

test('carriedIds reads the id-shaped tokens a text carries, and nothing else', () => {
  expect(carriedIds('{"id":"bk_9001","room":"12"}')).toEqual(['bk_9001']);
  expect(carriedIds('the booking is bk_9001 and the invoice is in_7001'))
    .toEqual(['bk_9001', 'in_7001']);
});

test('carriedIds ignores a word with no digit — an enum is not an id', () => {
  expect(carriedIds('{"topic":"late_cancellation","tier":"gold_member"}')).toEqual([]);
  expect(carriedIds('CONFIRM_BK_9001 stays untouched — the prefix is not lowercase'))
    .toEqual([]);
});

test('carriedIds names each id once, however many times the text carries it', () => {
  expect(carriedIds('bk_9001 bk_9001 {"id":"bk_9001"}')).toEqual(['bk_9001']);
});

test('carriedIds finds nothing in a text that carries no id', () => {
  expect(carriedIds('The booking is confirmed for Tuesday.')).toEqual([]);
  expect(carriedIds('')).toEqual([]);
});
