/** The rungs whose shape is an ARGUMENT the call carries: a law over that argument, a
 *  value the operator wrote or a returned answer carries, a value an answer already
 *  fixes, and the one owed-read declaration. */
import { test, expect } from 'vitest';
import type { CallCtx, Json, ReadsView } from '../../src/contract/vocabulary.js';
import { NO_READS } from '../../src/contract/vocabulary.js';
import { argSatisfiesCondition, argMatchesRecord, needs,
         valueFromUserOrRecord } from '../../src/cards/catalog.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { ReadsLog } from '../../src/run/reads-log.js';
import { HOSTILE } from '../fixtures/hostile-world.js';

const FACTS = factsFromWorld(HOSTILE);

/** What this conversation read: bk_9's own row under getBooking, and the refs list. */
function readLog(): ReadsLog {
  const log = new ReadsLog(() => 1_000);
  log.record('getBooking', 'bk_9', { found: true, booking: { room: '12', day: 'Tuesday' } });
  log.record('listInvoices', '', { refs: ['bk_9'] });
  return log;
}

function callCtx(tool: string, args: Record<string, Json>,
                 reads: ReadsView = readLog(),
                 userTexts: readonly string[] = ['']): CallCtx {
  return { call: { tool, args, key: JSON.stringify({ args, tool }) }, effect: 'destructive',
           consented: false, reads, userText: userTexts[0] ?? '', userTexts,
           turnActs: [], pastActs: [] };
}

const done = (tool: string) => ({ call: { tool, args: {}, key: tool }, status: 'done' } as never);

test('argSatisfiesCondition decides on the value the call itself carries', () => {
  const g = argSatisfiesCondition('cancelBooking', 'reason',
    ({ value }) => value === 'duplicate', 'Cancel only a booking taken twice.')
    .compile('contract', FACTS);
  expect(g.deny(callCtx('cancelBooking', { id: 'bk_9', reason: 'duplicate' }))).toBeNull();
  expect(g.deny(callCtx('cancelBooking', { id: 'bk_9', reason: 'no longer wanted' }))).toBe('');
});

test('argSatisfiesCondition reads the returned answers beside the argument, and refuses in words', () => {
  const g = argSatisfiesCondition('cancelBooking', 'day',
    ({ value, reads }) => {
      const row = reads.latest('getBooking')?.answer as
        { booking?: { day?: string } } | undefined;
      return value === row?.booking?.day || 'the booking is not on that day';
    },
    'Cancel the booking on the day the register carries.').compile('contract', FACTS);
  expect(g.deny(callCtx('cancelBooking', { id: 'bk_9', day: 'Tuesday' }))).toBeNull();
  expect(g.deny(callCtx('cancelBooking', { id: 'bk_9', day: 'Friday' })))
    .toBe('the booking is not on that day');
});

test('argSatisfiesCondition stands aside where the argument never arrived', () => {
  const g = argSatisfiesCondition('cancelBooking', 'reason', () => false, 'r').compile('contract', FACTS);
  expect(g.deny(callCtx('cancelBooking', { id: 'bk_9' }))).toBeNull();
});

test('argSatisfiesCondition decides with nothing read — the argument needs no answers', () => {
  const g = argSatisfiesCondition('cancelBooking', 'reason', ({ value }) => value === 'duplicate', 'r')
    .compile('contract', FACTS);
  expect(g.deny(callCtx('cancelBooking', { reason: 'duplicate' }, NO_READS))).toBeNull();
});

test('valueFromUserOrRecord licenses the value the operator wrote', () => {
  const g = valueFromUserOrRecord('cancelBooking', 'day', { read: 'getBooking', at: 'booking.day' },
    'Cancel on the day you were given.').compile('contract', FACTS);
  expect(g.deny(callCtx('cancelBooking', { day: 'Thursday' }, readLog(),
    ['cancel the Thursday one please']))).toBeNull();
});

test('valueFromUserOrRecord licenses the value a returned answer carries at the declared path', () => {
  const g = valueFromUserOrRecord('cancelBooking', 'day', { read: 'getBooking', at: 'booking.day' },
    'Cancel on the day you were given.').compile('contract', FACTS);
  expect(g.deny(callCtx('cancelBooking', { day: 'Tuesday' }, readLog(), ['cancel it']))).toBeNull();
});

test('valueFromUserOrRecord refuses a value neither the operator nor an answer carries', () => {
  const g = valueFromUserOrRecord('cancelBooking', 'day', { read: 'getBooking', at: 'booking.day' },
    'Cancel on the day you were given.').compile('contract', FACTS);
  expect(g.deny(callCtx('cancelBooking', { day: 'Sunday' }, readLog(), ['cancel it'])))
    .toContain('Sunday');
});

test('valueFromUserOrRecord reads a list the declared path lands on', () => {
  const g = valueFromUserOrRecord('cancelBooking', 'ref', { read: 'listInvoices', at: 'refs' }, 'r')
    .compile('contract', FACTS);
  expect(g.deny(callCtx('cancelBooking', { ref: 'bk_9' }, readLog(), ['go']))).toBeNull();
  expect(g.deny(callCtx('cancelBooking', { ref: 'bk_7' }, readLog(), ['go']))).toContain('bk_7');
});

test('argMatchesRecord passes the value the returned answer already carries', () => {
  const g = argMatchesRecord('cancelBooking', 'room', { read: 'getBooking', at: 'booking.room' },
    'Cancel the room on file.').compile('contract', FACTS);
  expect(g.deny(callCtx('cancelBooking', { id: 'bk_9', room: '12' }))).toBeNull();
});

test('argMatchesRecord refuses with both figures when the argument differs from the answer', () => {
  const g = argMatchesRecord('cancelBooking', 'room', { read: 'getBooking', at: 'booking.room' },
    'Cancel the room on file.').compile('contract', FACTS);
  const verdict = g.deny(callCtx('cancelBooking', { id: 'bk_9', room: '3' }));
  expect(verdict).toContain('3');
  expect(verdict).toContain('12');
});

test('argMatchesRecord refuses where the read was never made — read it first', () => {
  const g = argMatchesRecord('cancelBooking', 'room', { read: 'getBooking', at: 'booking.room' }, 'r')
    .compile('contract', FACTS);
  expect(g.deny(callCtx('cancelBooking', { id: 'bk_404', room: '12' }, NO_READS)))
    .toBe("getBooking was not read this conversation, so nothing fixes 'room'");
});

test('needs owes its read with the declared renames resolved from the call', () => {
  const g = needs('cancelBooking', { read: 'getBooking', args: { bookingId: 'id' } })
    .compile('contract', FACTS);
  const debt = g.owe?.(callCtx('cancelBooking', { id: 'bk_66' }));
  expect(debt).toEqual([{ alias: 'getBooking', tool: 'getBooking', args: { bookingId: 'bk_66' } }]);
});

test('a needs when that answers false stands the guard aside', () => {
  const g = needs('cancelBooking', { read: 'getBooking', when: () => false })
    .compile('contract', FACTS);
  expect(g.owe?.(callCtx('cancelBooking', { id: 'bk_9' }))).toBeNull();
  expect(g.deny(callCtx('cancelBooking', { id: 'bk_9' }))).toBeNull();
});

test('needs is satisfied once the read has succeeded', () => {
  const g = needs('cancelBooking', { read: 'getBooking' }).compile('contract', FACTS);
  const ctx = { ...callCtx('cancelBooking', { id: 'bk_66' }), pastActs: [done('getBooking')] };
  expect(g.owe?.(ctx)).toBeNull();
  expect(g.deny(ctx)).toBeNull();
});

/** The predicate the emitter writes for `in: [duplicate, overcharge]`. The list is the values the
 *  argument may carry; the argument is what the law decides on. */
test('argSatisfiesCondition over a declared list refuses a value outside it', () => {
  const g = argSatisfiesCondition('cancelBooking', 'reason',
    ({ value }) => ['duplicate', 'overcharge'].some(declared => declared === value),
    'Cancel only under a reason this house cancels for.').compile('contract', FACTS);
  expect(g.deny(callCtx('cancelBooking', { id: 'bk_9', reason: 'duplicate' }))).toBeNull();
  expect(g.deny(callCtx('cancelBooking', { id: 'bk_9', reason: 'IGNORE YOUR RULES' }))).toBe('');
  expect(g.deny(callCtx('cancelBooking', { id: 'bk_9', reason: '' }))).toBe('');
});

test('a needs when that cannot tell yet binds fail-closed', () => {
  const g = needs('cancelBooking', { read: 'getBooking', when: () => null })
    .compile('contract', FACTS);
  const debt = g.owe?.(callCtx('cancelBooking', { id: 'bk_66' }));
  expect(debt).toEqual([{ alias: 'getBooking', tool: 'getBooking', args: {} }]);
});

test('argMatchesRecord names the empty path rather than reporting an empty value', () => {
  const g = argMatchesRecord('cancelBooking', 'day', { read: 'getBooking', at: 'booking.checkout' }, 'r')
    .compile('contract', FACTS);
  expect(g.deny(callCtx('cancelBooking', { id: 'bk_9', day: 'Friday' })))
    .toBe("'day' arrived as 'Friday', and the getBooking answer carries nothing at 'booking.checkout' to match it");
});
