/**
 * src/world/presets.ts — boundary presets for the calendar world (Stage G2 step 3).
 *
 * Every state the eval set needs exists here BEFORE a case references it (a rubric that needs a
 * state no preset provides is the known eval-defect class). All data is fixed and deterministic;
 * datetimes are naive ISO `YYYY-MM-DDTHH:mm` strings compared lexicographically against
 * REFERENCE_NOW (a fixed Monday 09:00 — see world.ts).
 */

export interface EventRec {
  id: string;
  title: string;
  start: string; // YYYY-MM-DDTHH:mm
  end: string; // YYYY-MM-DDTHH:mm
  location?: string;
}

export interface ReminderRec {
  id: string;
  eventId: string;
  /** Minutes before the event start at which the reminder fires (positive integer). */
  offsetMinutes: number;
}

export interface WorldData {
  events: EventRec[];
  reminders: ReminderRec[];
}

export const PRESETS = ['empty-week', 'busy-week', 'reminder-pending'] as const;

export type PresetName = (typeof PRESETS)[number];

// ── shared seed builders (fresh objects per call — worlds must never share state) ────────────────

/**
 * The busy week around the fixed reference Monday (2026-03-02 09:00). One deliberate conflict
 * window: Tuesday 15:00–16:00 is taken by the project review (the "dentist Tuesday 3pm" clash).
 */
function busyEvents(): EventRec[] {
  return [
    { id: 'evt_101', title: 'Team standup', start: '2026-03-02T09:30', end: '2026-03-02T10:00' },
    { id: 'evt_102', title: 'Project review', start: '2026-03-03T15:00', end: '2026-03-03T16:00', location: 'Conference room B' },
    { id: 'evt_103', title: 'Lunch with Sam', start: '2026-03-04T12:00', end: '2026-03-04T13:00', location: 'Cafe Verde' },
    { id: 'evt_104', title: 'Gym session', start: '2026-03-06T18:00', end: '2026-03-06T19:00' },
  ];
}

// ── the preset factory ───────────────────────────────────────────────────────────────────────────

export function buildPreset(preset: string): WorldData {
  switch (preset as PresetName) {
    case 'empty-week':
      return { events: [], reminders: [] };

    case 'busy-week':
      return { events: busyEvents(), reminders: [] };

    case 'reminder-pending':
      // busy-week plus one reminder already on record: the project review, one day (1440 min)
      // before its start → fires 2026-03-02T15:00.
      return { events: busyEvents(), reminders: [{ id: 'rem_001', eventId: 'evt_102', offsetMinutes: 1440 }] };

    default:
      throw new Error(`unknown preset "${preset}" — known: ${PRESETS.join(', ')}`);
  }
}
