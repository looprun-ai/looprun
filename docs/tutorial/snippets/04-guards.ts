/**
 * Chapter 04 · guards — the code from the hand-written half of the chapter.
 *
 * The catalog's own 30 examples are generated from `GUARD_CATALOG` and are compile-checked by
 * `packages/core/test/guard-catalog-parity.test.ts`. What lives here is the part no catalog row can
 * carry: writing a `custom` guard for a domain concept the runtime has no vocabulary for, and the
 * `canonArgs` fingerprint the repetition kinds are built on.
 */
import { canonArgs, custom } from 'looprun';
import type { AgentWorld, Guard, GuardCtx } from 'looprun';
import { REFERENCE_NOW } from './scheduler/contract.js';
import { SchedulerSpec } from './scheduler/spec.js';
import type { CalendarEvent } from './scheduler/world.js';

// ── 1 · a custom guard: "an event that has already started is not cancelled" ─────────────────
/**
 * The accessor this guard needs, named once. `AgentWorld`'s index signature would let the typo
 * `snapshto()` compile (chapter 03 §7), so the read goes through a type either way.
 */
type CalendarReader = AgentWorld & { snapshot(): CalendarEvent[] };

/** The event `ctx.args.eventId` names, or `undefined`. Total: a guard's `check()` must never throw —
 *  the runtime does not swallow it, it attributes it and rethrows at the caller. */
function targetEvent(ctx: GuardCtx): CalendarEvent | undefined {
  const eventId = typeof ctx.args.eventId === 'string' ? ctx.args.eventId : '';
  return (ctx.world as CalendarReader).snapshot().find((e) => e.id === eventId);
}

/**
 * No catalog kind knows what "already started" means: the discriminator is in the ARGS (which event)
 * *and* in the world (its start time), which is what rules out `precondition`.
 *
 * `dim: 'run'` ⇒ legal on the tool hooks; `addGuard` throws at construction on any other hook.
 */
export function noCancelAfterStart(now: string): Guard {
  return custom({
    kind: 'noCancelAfterStart',
    dim: 'run',
    check: (ctx) => {
      const event = targetEvent(ctx);
      if (!event || event.start > now) return null;
      return `"${event.title}" (${event.id}) started at ${event.start} — it is too late to cancel it. Say so and offer to remove the remaining time instead.`;
    },
    prose: () => 'an event that has already started is never cancelled — say it is too late and offer what can still be done',
  });
}

/** Binding it: a subclass, so the shared `schedulerSpec` of chapters 02–03 keeps its own surface. */
export class LateCancelSchedulerSpec extends SchedulerSpec {
  constructor() {
    super();
    this.addGuard('preTool', ['cancelEvent'], noCancelAfterStart(REFERENCE_NOW), { id: 'agent:noCancelAfterStart' });
  }
}

export const lateCancelSchedulerSpec = new LateCancelSchedulerSpec();

// ── 2 · canonArgs: the fingerprint the repetition kinds compare ──────────────────────────────
/** Key order is not identity: both calls are the SAME call to `noDuplicateCall` and `maxCalls`. */
export const sameCallFingerprint =
  canonArgs({ start: '2026-03-02T10:00', title: 'Standup' }) === canonArgs({ title: 'Standup', start: '2026-03-02T10:00' });

/** …and a different VALUE is a different call, so a corrected retry is never denied as a repeat. */
export const differentCallFingerprint =
  canonArgs({ title: 'Standup' }) !== canonArgs({ title: 'Stand-up' });
