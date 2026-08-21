import type { Json, ModelTarget, SurfaceFacts } from '../../src/contract/vocabulary.js';
import { deepFreeze } from '../../src/contract/freeze.js';
import type { ToolFact } from '../../src/contract/vocabulary.js';
import type { ModelPort, RecordsPort } from '../../src/contract/ports.js';
import type { CompiledAgent, CompiledGuard, Guard } from '../../src/cards/cards.js';
import type { Limits } from '../../src/cards/cards.js';
import { AgentFactory } from '../../src/cards/agent-factory.js';
import { Engine } from '../../src/run/engine.js';
import { ModelSeat } from '../../src/run/model-seat.js';
import { HostileToolPort, type ToolBehavior } from './hostile-tool-port.js';

export function fact(partial: Partial<ToolFact> & { name: string; effect: ToolFact['effect'] }): ToolFact {
  return { label: null, does: `runs ${partial.name}`, target: null, entity: null,
    schema: { type: 'object', properties: {}, required: [] }, simulation: null, destructiveWhen: null, proxy: null, ...partial };
}

function idSchema(): Json {
  return { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] };
}

export const BOOKING_FACTS = {
  getBooking: fact({ name: 'getBooking', effect: 'read', target: 'id', schema: idSchema(),
    does: 'Reads one booking by id.' }),
  cancelBooking: fact({ name: 'cancelBooking', effect: 'write', target: 'id', schema: idSchema(),
    label: 'Cancel the booking', does: 'Cancels one booking by id.' }),
  sendEmail: fact({ name: 'sendEmail', effect: 'write', target: 'to',
    schema: { type: 'object', properties: { to: { type: 'string' }, bcc: { type: 'string' } }, required: ['to'] },
    does: 'Sends one email.' })
} as const;

export const BOOKING_SURFACE = { tools: BOOKING_FACTS } as const;

/** The harness bridge: wrap a hand-written proof Guard as an installed row. The
 *  factory is the one production birthplace; proofs that pin one hand guard use
 *  this wrap instead of authoring a whole card. */
export function install(guard: Guard, home: 'spec' | 'contract' | 'engine', kind: string,
  extras: Pick<CompiledGuard, 'owe' | 'restate'> = {}): CompiledGuard {
  const tools = guard.tool === undefined ? [] : typeof guard.tool === 'string' ? [guard.tool] : [...guard.tool];
  return {
    name: guard.name, rule: guard.rule, home, on: guard.on, tools, kind,
    judged: guard.judgeQuery !== undefined,
    installedBecause: home === 'engine' ? 'the always-on floor' : `declared on the ${home} card`,
    deny: ctx => guard.deny?.(ctx) ?? null,
    ...extras
  };
}

/** The factory builds the base; proof-supplied compiled guards splice in FRONT of
 *  the factory's consent + floor rows, keeping the priority picture. */
export function bookingAgent(guards: readonly CompiledGuard[] = [],
                             limits: Partial<Limits> = {},
                             facts: SurfaceFacts = BOOKING_SURFACE): CompiledAgent {
  const base = new AgentFactory().governed(
    { name: 'booking-desk', persona: 'You are the booking desk.', limits },
    { name: 'bookings', voice: 'Warm, brief, concrete.',
      facts: ['Bookings live in the records store.'] },
    facts);
  return deepFreeze({ ...base, guards: [...guards, ...base.guards] });
}

export const OK_BEHAVIORS: Readonly<Record<string, ToolBehavior>> = {
  getBooking: call => ({ result: { id: call.args.id ?? null, room: '12', day: 'Tuesday' }, done: 'yes' }),
  cancelBooking: () => ({ result: { cancelled: true }, done: 'yes' }),
  sendEmail: () => ({ result: { sent: true }, done: 'yes' })
};

export function scriptedTargets(n = 1): readonly ModelTarget[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `scripted-${i + 1}`, provider: 'scripted', keyEnv: null, tier: 'cloud' as const, certified: true
  }));
}

export interface TestRig { engine: Engine; port: HostileToolPort }

export function testEngine(opts: {
  model: ModelPort;
  guards?: readonly CompiledGuard[];
  limits?: Partial<Limits>;
  facts?: SurfaceFacts;
  behaviors?: Readonly<Record<string, ToolBehavior>>;
  records?: RecordsPort | null;
  targets?: readonly ModelTarget[];
  choice?: string | { targets: readonly string[]; strategy: 'sequential' };
}): TestRig {
  const port = new HostileToolPort(opts.behaviors ?? OK_BEHAVIORS);
  const targets = opts.targets ?? scriptedTargets(1);
  const seat = ModelSeat.create(targets, opts.choice ?? targets[0].id, () => opts.model);
  const engine = Engine.create({
    compiled: bookingAgent(opts.guards ?? [], opts.limits ?? {}, opts.facts ?? BOOKING_SURFACE),
    toolPort: port,
    recordsPort: opts.records ?? null,
    seat
  });
  return { engine, port };
}
