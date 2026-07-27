/**
 * src/world/tools.ts — TOOL_DEFS (Stage G2 step 1).
 * The hard vocabulary of the domain: specs and cases may reference ONLY these names.
 */
import type { ToolDef } from 'looprun';

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'eventsList',
    description:
      "List the calendar's events (id, title, start, end, location), sorted by start time, optionally restricted " +
      'to a datetime range. Returns the real recorded events — if none exist in the range, the list is empty ' +
      '(that time is free). Use this to look up an event\'s exact id before acting on it. Reminders are not ' +
      'included here — read one event with eventGet to see its reminders.',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$',
          description: 'Optional range start (inclusive, events starting at or after this), YYYY-MM-DDTHH:mm.',
        },
        to: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$',
          description: 'Optional range end (inclusive, events starting at or before this), YYYY-MM-DDTHH:mm.',
        },
      },
      required: [],
    },
  },
  {
    name: 'eventGet',
    description:
      "Read one event's full record: title, start, end, location, and the reminders set on it (with the exact " +
      'time each fires). This is the ONLY way to see reminders. Read this before making claims about an event ' +
      'or its reminders.',
    inputSchema: {
      type: 'object',
      properties: {
        eventId: {
          type: 'string',
          pattern: '^evt_[0-9]+$',
          description: 'The event id, e.g. evt_102.',
        },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'eventCreate',
    description:
      'Create a new calendar event. Check the window with availabilityCheck first: creation is REJECTED when ' +
      'the window overlaps an existing event (the calendar never double-books silently) and when the start is ' +
      'in the past. Returns the new eventId. Times are naive local datetimes, YYYY-MM-DDTHH:mm.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'What the event is, e.g. "Dentist appointment".',
        },
        start: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$',
          description: 'Event start, YYYY-MM-DDTHH:mm.',
        },
        end: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$',
          description: 'Event end, YYYY-MM-DDTHH:mm (must be after start).',
        },
        location: {
          type: 'string',
          description: 'Optional location.',
        },
      },
      required: ['title', 'start', 'end'],
    },
  },
  {
    name: 'eventUpdate',
    description:
      "Update an existing event's title, start, end, or location (pass only the fields to change; omitted " +
      'fields keep their recorded values). Moving an event is REJECTED when the new window overlaps another ' +
      'event or starts in the past — the clash is returned, never silently double-booked.',
    inputSchema: {
      type: 'object',
      properties: {
        eventId: {
          type: 'string',
          pattern: '^evt_[0-9]+$',
        },
        title: {
          type: 'string',
          description: 'New title.',
        },
        start: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$',
          description: 'New start, YYYY-MM-DDTHH:mm.',
        },
        end: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$',
          description: 'New end, YYYY-MM-DDTHH:mm.',
        },
        location: {
          type: 'string',
          description: 'New location.',
        },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'eventDelete',
    description:
      'Delete an event from the calendar (its reminders are removed with it). Deletion cannot be undone. ' +
      'TWO-STEP: call with confirmed=false first — it returns the confirmation question without deleting ' +
      'anything; call again with confirmed=true ONLY after the user explicitly agrees in a later turn.',
    inputSchema: {
      type: 'object',
      properties: {
        eventId: {
          type: 'string',
          pattern: '^evt_[0-9]+$',
          description: 'The event to delete.',
        },
        confirmed: {
          type: 'boolean',
          description: 'false/absent = probe (no effect, returns the confirmation question); true = delete after user confirmation.',
        },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'reminderSet',
    description:
      'Set a reminder on an existing event: it fires offsetMinutes before the event start ("the day before" ' +
      '= 1440, "an hour before" = 60). Returns the reminder id and the exact time it fires. A duplicate ' +
      'reminder (same event, same offset) is rejected. Non-destructive and single-step.',
    inputSchema: {
      type: 'object',
      properties: {
        eventId: {
          type: 'string',
          pattern: '^evt_[0-9]+$',
          description: 'The event the reminder belongs to.',
        },
        offsetMinutes: {
          type: 'integer',
          description: 'Minutes before the event start at which the reminder fires (positive).',
          exclusiveMinimum: 0,
        },
      },
      required: ['eventId', 'offsetMinutes'],
    },
  },
  {
    name: 'availabilityCheck',
    description:
      'Check whether a datetime window is free: returns available true/false and the exact conflicting events ' +
      '(id, title, start, end) when it is not. Read this BEFORE booking a window; when it reports a conflict, ' +
      'the clash must be surfaced to the user — never book over it.',
    inputSchema: {
      type: 'object',
      properties: {
        start: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$',
          description: 'Window start, YYYY-MM-DDTHH:mm.',
        },
        end: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$',
          description: 'Window end, YYYY-MM-DDTHH:mm (must be after start).',
        },
      },
      required: ['start', 'end'],
    },
  },
];
