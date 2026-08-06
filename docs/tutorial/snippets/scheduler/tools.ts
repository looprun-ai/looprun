/**
 * The scheduler's tool surface — what the model is allowed to call (tutorial 02–03).
 *
 * A `ToolDef` is JSON-schema in, world-executed out: the runtime hands the model these declarations
 * and routes every call to `SchedulerWorld.exec`.
 */
import type { ToolDef } from 'looprun';
import { DATETIME_PATTERN } from './contract.ts';

/** The same pattern the `argFormat` guards enforce — the model sees the constraint too. */
const DATE_TIME = { type: 'string', pattern: DATETIME_PATTERN, description: 'local date-time, `YYYY-MM-DDTHH:mm`' };

/** Read-only — chapter 02's one-tool cut of the scheduler. */
export const listEventsTool: ToolDef = {
  name: 'listEvents',
  description: 'List the events on the calendar, soonest first.',
  inputSchema: { type: 'object', properties: {}, required: [] },
};

export const addEventTool: ToolDef = {
  name: 'addEvent',
  description: 'Add an event to the calendar. Fails if the window clashes with an existing event.',
  inputSchema: {
    type: 'object',
    properties: { label: { type: 'string' }, start: DATE_TIME, end: DATE_TIME },
    required: ['label', 'start', 'end'],
  },
};

/** Destructive: `simulate: true` asks; the bare call acts, gated on the user's typed code. */
export const cancelEventTool: ToolDef = {
  name: 'cancelEvent',
  description: 'Cancel an event. Call it with `simulate: true` first to see what it does and ask the user; run the bare call only in a LATER turn, after their message carries the confirmation code.',
  inputSchema: {
    type: 'object',
    properties: { eventId: { type: 'string' }, simulate: { type: 'boolean' } },
    required: ['eventId'],
  },
};

export const SCHEDULER_TOOLS: ToolDef[] = [listEventsTool, addEventTool, cancelEventTool];
