/**
 * The scheduler spec — the map the agent is driven by (tutorial 03).
 *
 * "Messaging-driven calendar management: add events, check the schedule, cancel — never
 * double-book, never delete without asking." The two obligations land differently:
 *
 *   never double-book        → four guards installed below on `addEvent`: `argRequired('title')`,
 *                              `argFormat` on each date-time, then the `custom` run-dim clash gate
 *                              (shape first, because the clash check compares strings)
 *   never delete without ask → NOT written here. Naming `cancelEvent` in `destructiveTools` makes
 *                              `AgentSpecBase` install `confirmFirst` + `destructiveThrottle` on it.
 *                              Never re-add those by hand — the same rule would render twice.
 */
import { AgentSpecBase, argFormat, argRequired, custom } from 'looprun';
import type { TerminalPolicy } from 'looprun';
import { DATETIME_PATTERN, SCHEDULER_CONTRACT, SCHEDULER_SCOPE } from './contract.ts';
import type { SchedulerWorld } from './world.ts';

/**
 * `askUser` here always disambiguates or confirms an EXISTING event, so on an empty calendar it has
 * nothing to bite on: reply plainly instead of asking. `terminal` decides that per turn, from state.
 */
const TERMINAL: TerminalPolicy = (world) => (world as SchedulerWorld).snapshot().length === 0;

export class SchedulerSpec extends AgentSpecBase {
  constructor() {
    super({
      id: 'scheduler',
      mode: 'CALENDAR',
      persona: 'You are the scheduling agent: you keep this person’s calendar — checking it, adding to it, and cancelling from it.',
      scope: SCHEDULER_SCOPE,
      tools: ['listEvents', 'addEvent', 'cancelEvent'],
      destructiveTools: ['cancelEvent'], // ⇒ confirmFirst + destructiveThrottle, installed for you
      terminal: TERMINAL,
      contract: SCHEDULER_CONTRACT,
      behavior: [
        // UNCHECKABLE residue only — every rule with a guard states itself from that guard's prose.
        'When more than one event could match a vague description, list the candidates and ask which one — never pick for the user.',
      ],
    });

    // Shape first: the clash check below compares date-time STRINGS, so it is only meaningful on
    // well-formed input — "next Tuesday" would compare as garbage and slip straight past it.
    this.addGuard('preTool', ['addEvent'], argRequired('title'), { id: 'agent:titleRequired' });
    this.addGuard('preTool', ['addEvent'], argFormat('start', DATETIME_PATTERN), { id: 'agent:startFormat' });
    this.addGuard('preTool', ['addEvent'], argFormat('end', DATETIME_PATTERN), { id: 'agent:endFormat' });

    // Then the state gate: never book a window that clashes — decidable before the tool runs.
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
  }
}

export const schedulerSpec = new SchedulerSpec();
