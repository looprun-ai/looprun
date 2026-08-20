import { test, expect } from 'vitest';
import { Masker } from '../../src/run/masker.js';

test('a declared field name masks at any depth; the literal joins the collected set', () => {
  const m = new Masker([{ path: ['cardNumber'], mode: 'mask' }]);
  expect(m.maskData({ room: '7', cardNumber: '4111111111111111' }))
    .toEqual({ room: '7', cardNumber: '****' });
  expect(m.maskData({ nested: { cardNumber: '4222' } })).toEqual({ nested: { cardNumber: '****' } });
  expect(m.maskProse('pan 4111111111111111 leaked')).toBe('pan **** leaked');
});

test('a dotted path masks only its chain; omit drops the key', () => {
  const m = new Masker([{ path: ['customer', 'email'], mode: 'mask' },
                        { path: ['pin'], mode: 'omit' }]);
  expect(m.maskData({ customer: { email: 'a@b.c' }, email: 'stays@b.c', pin: '1234' }))
    .toEqual({ customer: { email: '****' }, email: 'stays@b.c' });
});

test('prose scrub replaces only collected literals — a look-alike survives', () => {
  const m = new Masker([{ path: ['cardNumber'], mode: 'mask' }]);
  m.maskData({ cardNumber: '4111111111111111' });
  const out = m.maskProse('cards 4111111111111111 and 4000111122223333');
  expect(out).toBe('cards **** and 4000111122223333');
});

test('with no pass performed, prose is untouched', () => {
  const m = new Masker([{ path: ['cardNumber'], mode: 'mask' }]);
  expect(m.maskProse('card 4111111111111111')).toBe('card 4111111111111111');
});
