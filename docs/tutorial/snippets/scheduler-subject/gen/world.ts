/**
 * The subject's deterministic world factory: `preset → AgentWorld`.
 *
 * An unknown preset THROWS. That is a subject law, not taste: a mis-typed `setup.preset` that
 * silently fell back to the default would grade every later assertion against a state nobody
 * chose — and `lintSubject` fails a factory that accepts anything.
 */
import type { AgentWorld } from 'looprun';
import { SchedulerWorld } from '../../scheduler/world.ts';

const PRESETS: Record<string, () => AgentWorld> = {
  /** The seeded calendar of chapters 02–04: Standup (Mon 10:00) + Dentist (Wed 15:00). */
  default: () => new SchedulerWorld(),
  /** Nothing booked — the state that makes the spec's `terminal` policy fire (reply-only turn). */
  'empty-calendar': () => new SchedulerWorld([]),
};

export function worldFactory(preset = 'default'): AgentWorld {
  const make = PRESETS[preset];
  if (!make) throw new Error(`unknown preset "${preset}" — known presets: ${Object.keys(PRESETS).join(', ')}`);
  return make();
}
