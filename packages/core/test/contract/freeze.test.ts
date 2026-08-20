import { test, expect } from 'vitest';
import { deepFreeze } from '../../src/contract/freeze.js';

test('deepFreeze freezes nested objects in place and returns the same reference', () => {
  const v = { a: { b: [1, 2] as number[] } };
  const f = deepFreeze(v);
  expect(f).toBe(v);
  expect(Object.isFrozen(f)).toBe(true);
  expect(Object.isFrozen(f.a)).toBe(true);
  expect(Object.isFrozen(f.a.b)).toBe(true);
  expect(() => { f.a.b.push(3); }).toThrow();
});

test('deepFreeze leaves an already-frozen value untouched and shared', () => {
  const inner = Object.freeze({ x: 1 });
  const v = { inner };
  deepFreeze(v);
  expect(v.inner).toBe(inner);
});
