import type { AgentSpec } from '@looprun-ai/next-core';
import { world } from '@looprun-ai/next-core';

export const spec: AgentSpec = { name: 'concierge', persona: 'You are the hotel desk.' };

export const subjectWorld = world({
  records: { bookings: { bk_9: { status: 'CONFIRMED' } } },
  reads: { getBooking: { form: 'get', entity: 'bookings', label: 'Look up the booking' } }
});
