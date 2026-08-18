import { test, expect, vi, afterEach } from 'vitest';
import { WireSessions } from '../src/wire-sessions.js';

afterEach(() => { vi.useRealTimers(); });

test('the same (credential, caller id) pair resolves to the same engine session', () => {
  const s = new WireSessions();
  expect(s.resolve('cred_a', 'chat-1')).toBe(s.resolve('cred_a', 'chat-1'));
});

test('the same caller id under DIFFERENT credentials never merges', () => {
  const s = new WireSessions();
  expect(s.resolve('cred_a', 'chat-1')).not.toBe(s.resolve('cred_b', 'chat-1'));
});

test('idle returns only sessions past the TTL, exactly once', () => {
  vi.useFakeTimers();
  const s = new WireSessions();
  const stale = s.resolve('cred_a', 'old');
  vi.advanceTimersByTime(10_000);
  const fresh = s.resolve('cred_a', 'new');
  expect(s.idle(5_000)).toEqual([stale]);
  expect(s.idle(5_000)).toEqual([]);
  expect(s.resolve('cred_a', 'new')).toBe(fresh);
  expect(s.resolve('cred_a', 'old')).not.toBe(stale);
});
