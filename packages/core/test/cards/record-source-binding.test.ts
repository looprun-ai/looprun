/** A law that decides on a record decides on the record the CALL names. Every answer in the
 *  reads log is keyed by the arguments it was read with, so a conversation that read one row
 *  and acts on another is answered by the row it acts on — not by whichever was read last. */
import { test, expect } from 'vitest';
import { argMatchesRecord, valueFromUserOrRecord } from '../../src/cards/catalog.js';
import type { CallCtx } from '../../src/contract/vocabulary.js';

const ANSWERS: Readonly<Record<string, unknown>> = {
  '{"bookingId":"bk_1"}': { booking: { id: 'bk_1', bay: 'north' } },
  '{"bookingId":"bk_2"}': { booking: { id: 'bk_2', bay: 'south' } }
};

/** A conversation that read bk_1 and then bk_2, acting on the booking the call names. */
function ctxFor(bookingId: string): CallCtx {
  return {
    call: { tool: 'moveBooking', args: { bookingId, bay: 'north' } },
    effect: 'write', userTexts: ['move it to north'],
    reads: { latest: (_tool: string, argsKey?: string) => {
      const answer = argsKey === undefined ? ANSWERS['{"bookingId":"bk_2"}']
        : ANSWERS[argsKey];
      return answer === undefined ? null : { answer, at: 1 } as never;
    } }
  } as unknown as CallCtx;
}

const BOUND = { read: 'getBooking', at: 'booking.bay', args: { bookingId: 'bookingId' } };
const LOOSE = { read: 'getBooking', at: 'booking.bay' };

const denial = (guard: ReturnType<typeof argMatchesRecord>, ctx: CallCtx): string | null =>
  guard.compile('contract').deny(ctx as never);

test('the argument is compared against the row the call names', () => {
  const bound = argMatchesRecord('moveBooking', 'bay', BOUND, 'The bay is the one on file.');
  expect(denial(bound, ctxFor('bk_1'))).toBeNull();
});

test('unbound, the same call is answered by whichever row was read last', () => {
  const loose = argMatchesRecord('moveBooking', 'bay', LOOSE, 'The bay is the one on file.');
  expect(denial(loose, ctxFor('bk_1'))).toContain('south');
});

test('a value the named row carries is grounded, and another row does not ground it', () => {
  const bound = valueFromUserOrRecord('moveBooking', 'bay', BOUND, 'The bay comes off the record.');
  const loose = valueFromUserOrRecord('moveBooking', 'bay', LOOSE, 'The bay comes off the record.');
  const spoken = { ...ctxFor('bk_1'), userTexts: [] } as CallCtx;
  expect(denial(bound as never, spoken)).toBeNull();
  expect(denial(loose as never, spoken)).toContain('does not carry');
});
