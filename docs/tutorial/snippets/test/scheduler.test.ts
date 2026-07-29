/**
 * The snippets are honest at runtime too, not only at the type level: the shared scheduler modules
 * are exercised once here so a tutorial chapter can never quote a world that does not work.
 */
import { describe, expect, it } from 'vitest';
import { validateSpec } from 'looprun';
import { schedulerSpec } from '../scheduler/spec.js';
import { SCHEDULER_TOOLS } from '../scheduler/tools.js';
import { SchedulerWorld } from '../scheduler/world.js';

describe('the scheduler snippet modules', () => {
  it('declares a coherent spec over its tool surface', () => {
    expect(validateSpec(schedulerSpec)).toEqual([]);
    expect(SCHEDULER_TOOLS.map((t) => t.name)).toEqual(schedulerSpec.surface.tools);
  });

  it('reads, adds and cancels through the world', () => {
    const world = new SchedulerWorld();

    expect(world.exec('listEvents', {}).events).toHaveLength(2);
    expect(world.exec('addEvent', { title: 'Lunch', start: '2026-03-02T12:00', end: '2026-03-02T13:00' }).success).toBe(true);
    expect(world.exec('addEvent', { title: 'Clash', start: '2026-03-02T10:15', end: '2026-03-02T10:45' }).success).toBe(false);

    // Destructive: the unconfirmed call is a side-effect-free probe.
    expect(world.exec('cancelEvent', { eventId: 'evt_101' }).requiresConfirmation).toBe(true);
    expect(world.hasEvent('evt_101')).toBe(true);
    expect(world.exec('cancelEvent', { eventId: 'evt_101', confirmed: true }).success).toBe(true);
    expect(world.hasEvent('evt_101')).toBe(false);
  });
});
