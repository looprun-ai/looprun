/** The two cards of the hotel. The spec says how ONE desk behaves; the contract says
 *  what the BUSINESS is, and every desk in the domain answers to it. */
import type { AgentSpec, DomainContract, Guard } from 'looprun';
import { onlyAfter, precondition, valueFromUser, maskPattern, swapTerms } from 'looprun';

/** A prose-only guard: no check can decide it, so it rides the prompt as the sentence it is
 *  and `agent.guards()` prints it beside every other guard. It names no tool, so it belongs on
 *  a spec, where the system prefix carries it into every turn that desk takes. */
const prose = (name: string, rule: string): Guard => ({ name, rule, on: 'reply' });

/** Lesson 2 — the whole first agent. Name and persona are the only required fields;
 *  omitting `tools` gives this desk the whole surface. The conduct rule sits here, on the
 *  spec, because the system prefix is what this desk reads before it decides anything. */
export const concierge: AgentSpec = {
  name: 'concierge',
  persona: 'A friendly hotel concierge who manages room bookings.',
  guards: [
    prose('no-promises',
      'Never promise an upgrade or a discount; the front desk decides those.')
  ]
};

/** Lesson 5 — the same desk with a lane of its own, a teammate, and its own ceilings. */
export const frontDesk: AgentSpec = {
  name: 'front-desk',
  persona: 'The front desk: it looks bookings up and moves them, and it never cancels.',
  tools: ['listBookings', 'getBooking', 'moveBooking'],
  teammates: { billing: 'invoices, payments and refunds' },
  guards: [
    // The factory writes the rule from the same parameters its check uses. Spread it
    // and override `rule` when the desk needs to say more than the default sentence.
    { ...valueFromUser('moveBooking', 'day'),
      rule: 'Send moveBooking\'s day only as the guest wrote it — never pick a day yourself.' }
  ],
  limits: { calls: 6 },
  llmParams: { temperature: 0 }
};

/** Lessons 3 and 4 — the business card. Voice and facts ride every desk's prompt;
 *  guards here are what ANY lane owes; disclosure states what an act would do. */
export const hotelContract: DomainContract = {
  name: 'seaside-hotel',
  voice: 'Warm, brief, and exact about dates and money.',
  facts: [
    'Check-in is from 15:00 and check-out is by 11:00.',
    'A cancellation inside 24 hours of arrival keeps the first night.'
  ],
  guards: [
    { ...onlyAfter('cancelBooking', 'getInvoice'),
      rule: 'Read the booking\'s invoice before cancelling, so the guest hears what stays owed.' },
    precondition('moveBooking',
      ({ record }) => record !== null && record.status === 'CONFIRMED',
      'Move a booking only while it is still confirmed.')
  ],
  disclosure: {
    cancelBooking: {
      needs: { booking: 'getBooking', invoice: 'getInvoice' },
      before: 'Cancelling {booking.room} on {booking.day} is permanent, and {invoice.amount} stays owed.',
      after: 'Cancelled {booking.room} on {booking.day}.',
      later: 'The {booking.room} booking is cancelled.',
      empty: 'There is no booking under that number for this to cancel.'
    }
  },
  secrets: ['card'],
  rewrites: [
    maskPattern('card-number', /\b\d{13,19}\b/),
    swapTerms({ 'no-show': 'a guest who did not arrive' })
  ],
  wording: { status: { held: 'waiting for your OK' } },
  limits: { calls: 8, destructive: 1 }
};
