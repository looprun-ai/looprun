import type { AgentSpec, DomainContract } from '@looprun-ai/next-core';
import { world } from '@looprun-ai/next-core';

export const spec: AgentSpec = { name: 'concierge', persona: 'You are the hotel desk.' };

export const contract: DomainContract = { name: 'minihotel' };

export const subjectWorld = world({
  records: { bookings: { bk_9: { status: 'CONFIRMED', day: 'Tuesday' } } },
  reads: { getBooking: { form: 'get', entity: 'bookings', label: 'Look up the booking' } },
  destructive: { cancelBooking: { form: 'remove', entity: 'bookings', label: 'Cancel the booking' } },
  presets: { quiet: [{ entity: 'bookings', id: 'bk_9', set: { day: 'Monday' } }] }
});
