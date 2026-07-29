/**
 * Chapter 03 · agent anatomy — the pieces the chapter shows that are NOT part of the shared
 * scheduler modules: the spec check, the two ways to read world state through a type, and the
 * native-tools world seam.
 */
import { validateSpec } from 'looprun';
import type { AgentWorld } from 'looprun';
import { worldFromTools } from 'looprun/mastra';
import type { StateView } from 'looprun/mastra';
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

// ── 2 · reading world state: the nominal cast vs the structural one ──────────
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

// ── 3 · native-tools mode: state without execution ───────────────────────────
// PARKED: chapter 03 no longer quotes this section — worldFromTools/StateView moved to chapter 06
// (outline §7 amendment, inventory §9 round 7). Task 11 lifts it; the prose is parked alongside, in
// .superpowers/sdd/2026-07-28-looprun-simplification-plan/task-9-parked-06-native-tools.md.
/**
 * When the tools execute themselves (Mastra assigned tools, toolsets, MCP), there is no world to
 * hand-write — but stateful rules and `contract.stateBlock` still need state reads. A `StateView`
 * supplies exactly those, and `refresh()` runs at every turn boundary.
 */
let cachedEvents: CalendarEvent[] = [];

export const calendarStateView: StateView = {
  snapshot: () => cachedEvents,
  clashesWith: (start: string, end: string) => cachedEvents.filter((e) => e.start < end && start < e.end),
  async refresh() {
    cachedEvents = await fetchCalendar();
  },
};

/** The synthesized world: state reads work, `exec` throws — the tools already execute themselves. */
export const nativeWorld: AgentWorld = worldFromTools({ stateView: calendarStateView });

/** Stand-in for the real remote read this state view would do. */
async function fetchCalendar(): Promise<CalendarEvent[]> {
  return cachedEvents;
}
