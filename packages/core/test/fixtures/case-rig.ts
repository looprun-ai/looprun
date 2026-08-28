import type { ModelPort } from '../../src/contract/ports.js';
import type { AgentSpec, DomainContract } from '../../src/cards/cards.js';
import { AgentFactory } from '../../src/cards/agent-factory.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { WorldBuilder, type BuiltWorld } from '../../src/world/world-builder.js';
import { Engine } from '../../src/run/engine.js';
import { ModelSeat } from '../../src/run/model-seat.js';
import { scriptedTargets } from './compiled-agents.js';
import { HOSTILE } from './hostile-world.js';

/** The author-door rig every MVP case uses: real cards + the HOSTILE world →
 *  AgentFactory.governed → Engine.chat, ScriptedModel-driven. */
export function caseRig(opts: {
  readonly model: ModelPort;
  readonly spec?: Partial<AgentSpec>;
  readonly contract?: Partial<DomainContract>;
  readonly preset?: string;
  readonly now?: () => number;
}): { engine: Engine; world: BuiltWorld } {
  const world = new WorldBuilder().build(HOSTILE, opts.preset);
  const facts = factsFromWorld(HOSTILE);
  const compiled = new AgentFactory().governed(
    { name: 'concierge', persona: 'You are the hotel desk.', ...opts.spec },
    { name: 'grandhotel', ...opts.contract },
    facts);
  const targets = scriptedTargets(1);
  const seat = ModelSeat.create(targets, targets[0].id, () => opts.model);
  const engine = Engine.create({ compiled, toolPort: world, recordsPort: world, seat,
    ...(opts.now === undefined ? {} : { now: opts.now }) });
  return { engine, world };
}
