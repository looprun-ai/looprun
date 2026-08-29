/** The hotel's world card: the records, and the three blocks that say what a tool
 *  DOES to them. The block a tool sits in IS its effect declaration — a tool under
 *  `destructive` needs no other setup for the engine to hold it for consent.
 *  One file states one surface — the gated variant lives in gated-world.ts. */
import { world } from 'looprun';

export const hotel = world({
  records: {
    bookings: {
      bk_1: { room: 'Blue Room', day: 'Friday', guest: 'M. Silva', status: 'CONFIRMED' },
      bk_2: { room: 'Green Room', day: 'Saturday', guest: 'A. Nunes', status: 'CONFIRMED' }
    },
    // One invoice per booking, keyed BY the booking's own id. A disclosure read is
    // performed with the held call's own arguments, so a read that cannot answer
    // from `id` cannot fill a sentence about that booking.
    invoices: {
      bk_1: { amount: 240, paid: false, card: '4111111111111111' },
      bk_2: { amount: 180, paid: true, card: '4111111111111111' }
    }
  },
  reads: {
    listBookings: { form: 'list', entity: 'bookings', label: 'List the bookings' },
    getBooking: { form: 'get', entity: 'bookings', label: 'Look up one booking' },
    getInvoice: { form: 'get', entity: 'invoices', label: 'Look up an invoice' }
  },
  writes: {
    moveBooking: { form: 'set', entity: 'bookings', label: 'Move a booking to another day' }
  },
  destructive: {
    cancelBooking: { form: 'remove', entity: 'bookings', label: 'cancel a booking' }
  }
});
