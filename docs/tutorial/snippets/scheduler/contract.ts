/**
 * What every scheduler agent shares: the reference clock, the scope declaration, and the
 * domain contract (tutorial 03). Kept in one module so the full spec and the chapter-02
 * one-tool spec cannot drift apart.
 *
 * Relative imports across `scheduler/` carry the `.ts` extension: these modules are also loaded by
 * NODE, through `looprun-eval` → `loadSubject` (chapter 05's eval subject imports them), and there
 * a `.js` specifier does not resolve to a `.ts` file.
 */
import type { AgentScope, DomainContract } from 'looprun';
import type { SchedulerWorld } from './world.ts';

/** The fixed world clock — a Monday, 09:00. A tutorial world never reads a real clock. */
export const REFERENCE_NOW = '2026-03-02T09:00';

/** Date-times are naive `YYYY-MM-DDTHH:mm` strings, so they compare lexicographically. */
export const DATETIME_PATTERN = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$';

export const SCHEDULER_SCOPE: AgentScope = {
  lane: 'the user’s own calendar: what is on it, adding to it, cancelling from it',
  others: [{ label: 'the travel desk', covers: 'flights, hotels and anything that costs money' }],
};

export const SCHEDULER_CONTRACT: DomainContract = {
  voice: 'You keep one person’s calendar. Be brief, concrete, and name events by their title and time.',
  stateBlock: (world) => `Calendar: ${(world as SchedulerWorld).snapshot().length} event(s). Now: ${REFERENCE_NOW} (Monday).`,
  coreInvariants: [
    'Only report what the calendar tools actually returned — never an event, time or id you did not read.',
    'Times are written as `YYYY-MM-DDTHH:mm`; a day without a resolvable time is a question, not a booking.',
  ],
  languageClause: 'Always reply in the language the user wrote in.',
  // The HONESTY SWITCH (tutorial 03 §5, 04 §3): naming the tools that MUTATE the calendar auto-installs
  // `claimIsGrounded` + `claimIsComplete`, so every `did` this domain declares is cross-checked against
  // what the world ledger actually recorded. `listEvents` is a read and is deliberately absent.
  // The world holds up its half: `addEvent` returns the new event's `id`, a confirmed `cancelEvent`
  // returns `cancelledEventId`, and `exec` records `tookEffect` on every call.
  writeTools: ['addEvent', 'cancelEvent'],
};
