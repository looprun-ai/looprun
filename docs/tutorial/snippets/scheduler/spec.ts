/**
 * The scheduler spec — the map the agent is driven by (tutorial 02–03).
 *
 * "Messaging-driven calendar management: add events, check the schedule, cancel — never
 * double-book, never delete without asking." The two obligations in that sentence are the two
 * guards below: a `custom` run-dim gate for the clash, and the confirm-first protocol that
 * `AgentSpecBase` auto-installs for every tool named in `destructiveTools` (never re-add it by
 * hand — that would render the same rule twice).
 */
import { AgentSpecBase, argRequired, custom } from 'looprun';
import type { AgentScope, DomainContract, TerminalPolicy } from 'looprun';
import type { SchedulerWorld } from './world.js';

const SCOPE: AgentScope = {
  lane: 'the user’s own calendar: what is on it, adding to it, cancelling from it',
  others: [{ label: 'the travel desk', covers: 'flights, hotels and anything that costs money' }],
};

/** Nothing to ask about on an empty calendar — reply, never `askUser`. */
const TERMINAL: TerminalPolicy = (world) => (world as SchedulerWorld).snapshot().length === 0;

const CONTRACT: DomainContract = {
  voice: 'You keep one person’s calendar. Be brief, concrete, and name events by their title and time.',
  stateBlock: (world) => `Calendar: ${(world as SchedulerWorld).snapshot().length} event(s). Now: 2026-03-02T09:00 (Monday).`,
  coreInvariants: [
    'Only report what the calendar tools actually returned — never an event, time or id you did not read.',
    'Times are written as `YYYY-MM-DDTHH:mm`; a day without a resolvable time is a question, not a booking.',
  ],
  languageClause: 'Always reply in the language the user wrote in.',
};

export class SchedulerSpec extends AgentSpecBase {
  constructor() {
    super({
      id: 'scheduler',
      mode: 'CALENDAR',
      persona: 'You are the scheduling agent: you keep this person’s calendar — checking it, adding to it, and cancelling from it.',
      scope: SCOPE,
      tools: ['listEvents', 'addEvent', 'cancelEvent'],
      destructiveTools: ['cancelEvent'], // ⇒ confirmFirst + destructiveThrottle, installed for you
      terminal: TERMINAL,
      contract: CONTRACT,
      behavior: [
        // UNCHECKABLE residue only — every rule with a guard states itself from that guard's prose.
        'When the user names a day but no time, ask one concrete question instead of picking a time for them.',
      ],
    });

    // Never book a window that clashes — decidable from the world before the tool runs.
    this.addGuard(
      'preTool',
      ['addEvent'],
      custom({
        kind: 'noDoubleBook',
        dim: 'run',
        check: (ctx) => {
          const clashes = (ctx.world as SchedulerWorld).clashesWith(String(ctx.args.start ?? ''), String(ctx.args.end ?? ''));
          return clashes.length
            ? `That window clashes with "${clashes[0]!.title}" (${clashes[0]!.id}) — do not book it. Name the clash and ask what to do.`
            : null;
        },
        prose: () => 'a window that clashes with an existing event is never booked — name the clashing event and ask how to proceed',
      }),
      { id: 'agent:noDoubleBook' },
    );

    // An event without a title is not an event.
    this.addGuard('preTool', ['addEvent'], argRequired('title'), { id: 'agent:titleRequired' });
  }
}

export const schedulerSpec = new SchedulerSpec();
