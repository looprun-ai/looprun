import { test, expect } from 'vitest';
import { CanonicalCall } from '../../src/contract/canonical-call.js';
import type { ToolFact } from '../../src/contract/vocabulary.js';
import type { Json } from '../../src/contract/vocabulary.js';

function fact(name: string, schema: Json): ToolFact {
  return { name, label: null, does: 'a test tool', effect: 'read', target: null, entity: null,
           schema, simulation: null, proxy: null };
}

const getBooking = fact('getBooking', {
  type: 'object',
  properties: { id: { type: 'string' }, day: { type: 'number' } },
  required: ['id']
});

test('of coerces a declared number from a numeric string and sorts the key', () => {
  const c = CanonicalCall.of('getBooking', { day: '3', id: 'bk_1' }, getBooking);
  if ('badArg' in c) throw new Error('expected a call');
  expect(c.args).toEqual({ day: 3, id: 'bk_1' });
  expect(c.key).toBe('{"args":{"day":3,"id":"bk_1"},"tool":"getBooking"}');
});

test('of rejects a non-coercible value loudly, naming the arg', () => {
  const c = CanonicalCall.of('getBooking', { id: { nested: true } }, getBooking);
  expect(c).toEqual({ badArg: 'id' });
});

test('of rejects an undeclared arg loudly', () => {
  const c = CanonicalCall.of('getBooking', { id: 'bk_1', extra: 'x' }, getBooking);
  expect(c).toEqual({ badArg: 'extra' });
});

test('equals is key equality regardless of arg order', () => {
  const a = CanonicalCall.of('getBooking', { id: 'bk_1', day: 3 }, getBooking);
  const b = CanonicalCall.of('getBooking', { day: 3, id: 'bk_1' }, getBooking);
  if ('badArg' in a || 'badArg' in b) throw new Error('expected calls');
  expect(a.equals(b)).toBe(true);
});

test('array values stay order-significant in the key', () => {
  const listy = fact('tag', {
    type: 'object', properties: { tags: { type: 'array' } }, required: []
  });
  const a = CanonicalCall.of('tag', { tags: ['a', 'b'] }, listy);
  const b = CanonicalCall.of('tag', { tags: ['b', 'a'] }, listy);
  if ('badArg' in a || 'badArg' in b) throw new Error('expected calls');
  expect(a.equals(b)).toBe(false);
});

test('data applies the masker per arg value and keeps the key', () => {
  const c = CanonicalCall.of('getBooking', { id: 'bk_1' }, getBooking);
  if ('badArg' in c) throw new Error('expected a call');
  const d = c.data(() => '***');
  expect(d).toEqual({ tool: 'getBooking', args: { id: '***' }, key: c.key });
});

test('a call value travels frozen', () => {
  const c = CanonicalCall.of('getBooking', { id: 'bk_1' }, getBooking);
  if ('badArg' in c) throw new Error('expected a call');
  expect(Object.isFrozen(c) && Object.isFrozen(c.args)).toBe(true);
});
