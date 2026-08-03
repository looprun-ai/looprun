/**
 * The snippets are honest at runtime too, not only at the type level: the shared scheduler modules
 * are exercised once here so a tutorial chapter can never quote a world that does not work.
 *
 * What this does NOT prove: the confirm-first GUARD. The world's two-step probe is one half of the
 * protocol; the other half (the probe must land in a strictly EARLIER turn) is the runtime's ledger.
 */
import { describe, expect, it } from 'vitest';
import { validateSpec } from 'looprun';
import { calendarDigestSpec, replyOnlyRefusal } from '../03-agent-anatomy.js';
import { helloSchedulerSpec } from '../scheduler/hello-spec.js';
import { schedulerSpec } from '../scheduler/spec.js';
import { SCHEDULER_TOOLS, listEventsTool } from '../scheduler/tools.js';
import { SchedulerWorld } from '../scheduler/world.js';

describe('the scheduler snippet modules', () => {
  it('declares coherent specs, each over its own tool surface', () => {
    expect(validateSpec(schedulerSpec)).toEqual([]);
    expect(SCHEDULER_TOOLS.map((t) => t.name)).toEqual(schedulerSpec.surface.tools);

    expect(validateSpec(helloSchedulerSpec)).toEqual([]);
    expect(helloSchedulerSpec.surface.tools).toEqual([listEventsTool.name]);
  });

  it('reads, adds and cancels through the world', () => {
    const world = new SchedulerWorld();

    expect(world.exec('listEvents', {}).events).toHaveLength(2);
    expect(world.exec('addEvent', { label: 'Lunch', start: '2026-03-02T12:00', end: '2026-03-02T13:00' }).success).toBe(true);
    expect(world.exec('addEvent', { label: 'Clash', start: '2026-03-02T10:15', end: '2026-03-02T10:45' }).success).toBe(false);
    // A malformed date-time never reaches the lexicographic clash compare.
    expect(world.exec('addEvent', { label: 'Vague', start: 'next Tuesday', end: 'later' }).success).toBe(false);
    // …nor does a backwards window, or one before the reference clock.
    expect(world.exec('addEvent', { label: 'Backwards', start: '2026-03-03T11:00', end: '2026-03-03T10:00' }).success).toBe(false);
    expect(world.exec('addEvent', { label: 'Yesterday', start: '2026-03-01T09:00', end: '2026-03-01T10:00' }).success).toBe(false);

    // Destructive: the unconfirmed call is a side-effect-free probe.
    expect(world.exec('cancelEvent', { eventId: 'evt_101' }).requiresConfirmation).toBe(true);
    expect(world.hasEvent('evt_101')).toBe(true);
    expect(world.exec('cancelEvent', { eventId: 'evt_101', confirmed: true }).success).toBe(true);
    expect(world.hasEvent('evt_101')).toBe(false);
  });

  it('splits the reply-only read surface away from the destructive tool', () => {
    // The digest holds the policy and no destructive tool — a coherent, constructible spec.
    expect(validateSpec(calendarDigestSpec)).toEqual([]);
    expect(calendarDigestSpec.surface.tools).toEqual(['listEvents']);
    expect(calendarDigestSpec.controls?.terminal?.(new SchedulerWorld([]))).toBe(true);
    expect(calendarDigestSpec.controls?.terminal?.(new SchedulerWorld())).toBe(false);

    // The scheduler owns `cancelEvent`, so it carries no policy at all.
    expect(schedulerSpec.controls?.terminal).toBeUndefined();

    // And the two together are refused at CONSTRUCTION — the message the chapter quotes.
    expect(replyOnlyRefusal()).toBe(
      'AgentSpec "canceller": a reply-only terminal policy cannot be combined with destructive tools ' +
        '(cancelEvent). Reply-only forbids the model from asking, and the consent guards require an ask ' +
        'before a destructive act. Drop the policy, or move the destructive tools to a spec that may ask.',
    );
  });
});
