import type { AgentSpec, ModelStep } from '@looprun-ai/core';
import { world } from '@looprun-ai/core';

/** The author-door fixtures every assembly and gate test drives. */
export const BOOKING = world({
  records: { bookings: { bk_9: { status: 'CONFIRMED', day: 'Tuesday' } } },
  reads: { getBooking: { form: 'get', entity: 'bookings', label: 'Look up the booking' } },
  destructive: { cancelBooking: { form: 'remove', entity: 'bookings', label: 'Cancel the booking' } }
});

export const SPEC: AgentSpec = { name: 'concierge', persona: 'You are the hotel desk.' };

export function callStep(tool: string, args: Readonly<Record<string, unknown>>): ModelStep {
  return { calls: [{ tool, args }], text: '' };
}

export function finishStep(message: string,
  report: readonly { tool: string; target: string; word: string }[] = []): ModelStep {
  return { calls: [{ tool: 'finish', args: { message, report } }], text: '' };
}
