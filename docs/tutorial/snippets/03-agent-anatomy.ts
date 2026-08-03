/**
 * Chapter 03 · agent anatomy — the pieces the chapter shows that are NOT part of the shared
 * scheduler modules: the spec check, the reply-only read surface, and the two ways to read world
 * state through a type.
 */
import { AgentSpecBase, validateSpec } from 'looprun';
import type { AgentWorld, TerminalPolicy } from 'looprun';
import { SCHEDULER_CONTRACT } from './scheduler/contract.js';
import { schedulerSpec } from './scheduler/spec.js';
import type { CalendarEvent } from './scheduler/world.js';
import { SchedulerWorld } from './scheduler/world.js';

// ── 1 · validateSpec: fail fast on an incoherent spec ────────────────────────
/** Warnings are advisory by default — make them fatal wherever a broken spec must not start. */
export function assertSchedulerCoherent(): void {
  const warnings = validateSpec(schedulerSpec);
  if (warnings.length) {
    throw new Error(`spec "${schedulerSpec.id}" is incoherent:\n${warnings.map((w) => `  ${w.code}: ${w.message}`).join('\n')}`);
  }
}

// ── 2 · TerminalPolicy: the reply-only surface, and the spec that may carry one ──
/** True on an empty calendar — there is nothing an `ask` could disambiguate, so answer instead. */
export const EMPTY_CALENDAR_IS_REPLY_ONLY: TerminalPolicy = (world) => (world as SchedulerWorld).snapshot().length === 0;

/**
 * The READ surface, as its own agent. It holds the reply-only policy precisely because it holds no
 * destructive tool: one read tool, nothing to confirm, so nothing ever needs to ask. The scheduler
 * beside it owns `cancelEvent` and therefore keeps its ask.
 */
export class CalendarDigestSpec extends AgentSpecBase {
  constructor() {
    super({
      id: 'calendar-digest',
      mode: 'CALENDAR',
      persona: 'You are the calendar digest: you report what is on this person’s calendar and never change it.',
      tools: ['listEvents'],
      terminal: EMPTY_CALENDAR_IS_REPLY_ONLY,
      contract: SCHEDULER_CONTRACT,
      behavior: ['Report the calendar as it came back — an empty day is reported as free, never filled in.'],
    });
  }
}

export const calendarDigestSpec = new CalendarDigestSpec();

/**
 * The combination `AgentSpecBase` REFUSES. Declaring the class is fine; CONSTRUCTING it throws, so a
 * spec that both forbids the ask and requires it can never reach a world or a turn.
 */
class ReplyOnlyCanceller extends AgentSpecBase {
  constructor() {
    super({
      id: 'canceller',
      mode: 'CALENDAR',
      persona: 'You are the calendar canceller.',
      tools: ['listEvents', 'cancelEvent'],
      destructiveTools: ['cancelEvent'],
      terminal: EMPTY_CALENDAR_IS_REPLY_ONLY,
    });
  }
}

/** The refusal, in the constructor's own words. */
export function replyOnlyRefusal(): string {
  try {
    new ReplyOnlyCanceller();
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error('expected AgentSpecBase to refuse a reply-only policy beside a destructive tool');
}

// ── 3 · reading world state: the nominal cast vs the structural one ──────────
/** The cost of `AgentWorld`'s `[k: string]: any`, demonstrated: BOTH of these typecheck. */
export function indexSignatureCost(world: AgentWorld): void {
  world.clashesWith('2026-03-02T10:00', '2026-03-02T11:00'); // CalendarEvent[]
  world.clashesWiht('2026-03-02T10:00', '2026-03-02T11:00'); // any — compiles, then crashes at run time
}

/** Nominal — you own the class, so name it. Strongest types, hardest coupling. */
export const clashesNominal = (world: AgentWorld, start: string, end: string): CalendarEvent[] =>
  (world as SchedulerWorld).clashesWith(start, end);

/**
 * Structural: name only the accessor you actually read, so the world may be any implementation.
 * It must be written as an INTERSECTION with `AgentWorld` — a bare `{ clashesWith… }` is not a
 * legal cast target from `AgentWorld` (TS2352: the two types do not overlap enough).
 */
type ClashReader = AgentWorld & { clashesWith(start: string, end: string): readonly CalendarEvent[] };

export const clashesStructural = (world: AgentWorld, start: string, end: string): readonly CalendarEvent[] =>
  (world as ClashReader).clashesWith(start, end);

// The native-tools seam (`worldFromTools` + `StateView`) moved to `06-advanced.ts` with its chapter
// (outline §7 amendment, inventory §9 round 7).
