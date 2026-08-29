/** The same hotel with a gate and a scenario. A gate is a condition the WORLD
 *  enforces: it refuses the call whatever the model or the user says, and its
 *  refusal is a sentence a person can act on. One file states one surface —
 *  a world card lives alone in its file. */
import { world } from 'looprun';

export const gatedHotel = world({
  records: {
    bookings: {
      bk_1: { room: 'Blue Room', day: 'Friday', guest: 'M. Silva', status: 'CONFIRMED' },
      bk_9: { room: 'Red Room', day: 'Sunday', guest: 'C. Dias', status: 'CHECKED_IN' }
    }
  },
  reads: {
    getBooking: { form: 'get', entity: 'bookings', label: 'Look up one booking' }
  },
  destructive: {
    cancelBooking: {
      form: 'remove', entity: 'bookings', label: 'cancel a booking',
      gates: [{ kind: 'stateIs', field: 'status', value: 'CONFIRMED' }]
    }
  },
  presets: {
    // A scenario the exam can name: the Friday guest has already checked in.
    everyoneCheckedIn: [{ entity: 'bookings', id: 'bk_1', set: { status: 'CHECKED_IN' } }]
  }
});
