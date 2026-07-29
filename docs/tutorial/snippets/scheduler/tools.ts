/**
 * The scheduler's tool surface — what the model is allowed to call (tutorial 02–03).
 *
 * A `ToolDef` is JSON-schema in, world-executed out: the runtime hands the model these declarations
 * and routes every call to `SchedulerWorld.exec`.
 */
import type { ToolDef } from 'looprun';
import { DATETIME_PATTERN } from './contract.js';

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
    properties: { title: { type: 'string' }, start: DATE_TIME, end: DATE_TIME },
    required: ['title', 'start', 'end'],
  },
};

/** Destructive: `confirmed` is the flag the auto-installed `confirmFirst` gate waits for. */
export const cancelEventTool: ToolDef = {
  name: 'cancelEvent',
  description: 'Cancel an event. Call it without `confirmed` first to ask the user; then again in a LATER turn, after the user answers, with `confirmed: true`.',
  inputSchema: {
    type: 'object',
    properties: { eventId: { type: 'string' }, confirmed: { type: 'boolean' } },
    required: ['eventId'],
  },
};

export const SCHEDULER_TOOLS: ToolDef[] = [listEventsTool, addEventTool, cancelEventTool];
