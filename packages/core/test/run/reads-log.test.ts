import { test, expect } from 'vitest';
import { DEFAULT_READ_VALID_FOR_MS, ReadsLog } from '../../src/run/reads-log.js';

// What this conversation's calls answered, each answer whole and opaque, on the
// injected clock: a row answers for its validity and reading again restarts it.

test('an answer lands whole and comes back opaque, nested JSON untouched', () => {
  const log = new ReadsLog(() => 1_000);
  const answer = { content: [{ type: 'text', text: '{"data":{"reservation":{"ref":"bk_1001"}}}' }] };
  log.record('getBooking', 'bk_1001', answer);
  expect(log.latest('getBooking', 'bk_1001')).toEqual({ answer, at: 1_000 });
});

test('latest with no args key answers the newest across keys', () => {
  let now = 1_000;
  const log = new ReadsLog(() => now);
  log.record('getBooking', 'bk_1', { id: 'bk_1' });
  now = 2_000;
  log.record('getBooking', 'bk_2', { id: 'bk_2' });
  expect(log.latest('getBooking')).toEqual({ answer: { id: 'bk_2' }, at: 2_000 });
});

test('a row past its validity is unread, and reading again restarts its life', () => {
  let now = 1_000;
  const log = new ReadsLog(() => now, 5_000);
  log.record('getBooking', 'bk_9', { status: 'confirmed' });
  now = 6_001;
  expect(log.latest('getBooking', 'bk_9')).toBeNull();
  log.record('getBooking', 'bk_9', { status: 'confirmed' });
  expect(log.latest('getBooking', 'bk_9')).toEqual({ answer: { status: 'confirmed' }, at: 6_001 });
});

test('entries lists only the rows still inside their life, newest per key', () => {
  let now = 1_000;
  const log = new ReadsLog(() => now, 5_000);
  log.record('getBooking', 'bk_9', { v: 1 });
  log.record('listMembers', '', [{ id: 'mem_1' }]);
  now = 3_000;
  log.record('getBooking', 'bk_9', { v: 2 });
  now = 6_500;
  expect(log.entries()).toEqual([
    { tool: 'getBooking', argsKey: 'bk_9', answer: { v: 2 }, at: 3_000 }]);
});

test('an unread tool answers null', () => {
  const log = new ReadsLog(() => 1_000);
  expect(log.latest('getBooking')).toBeNull();
});

test('the default validity is five minutes', () => {
  expect(DEFAULT_READ_VALID_FOR_MS).toBe(300_000);
});
