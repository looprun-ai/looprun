/**
 * THE CONTRACT WRITE GATE — one `writeTools` binding at priority `changeAllowed` installs the state
 * gate on every spec that writes.
 */
import { describe, it, expect } from 'vitest';
import { AgentSpecBase } from '../src/spec.js';
import { precondition } from '../src/guards/index.js';
import type { AgentWorld, DomainContract, GuardCtx } from '../src/index.js';

const world = (status: string): AgentWorld => ({ status: () => status }) as unknown as AgentWorld;

const ctx = (over: Partial<GuardCtx>): GuardCtx =>
  ({ args: {}, world: world('active'), observed: [], turnIndex: 0, userText: '', history: [], ...over }) as GuardCtx;

const frozenWritesBinding = (exempt?: string[]): NonNullable<DomainContract['guards']>[number] => ({
  hook: 'preTool',
  target: 'writeTools',
  ...(exempt ? { exempt } : {}),
  guard: precondition(
    (w) => (w as unknown as { status(): string }).status() !== 'suspended',
    'This workspace is suspended.',
    { prose: 'nothing changes while the workspace is suspended' },
  ),
  id: 'changeAllowed:precondition',
  priority: 'changeAllowed',
});

const contract = (over: Partial<DomainContract> = {}): DomainContract =>
  ({
    voice: 'A rental desk.',
    stateBlock: () => '',
    coreInvariants: [],
    languageClause: 'Answer in English.',
    writeTools: ['createBooking', 'placeHold'],
    ...over,
  }) as DomainContract;

const spec = (c: DomainContract) =>
  new AgentSpecBase({
    id: 'rentals',
    mode: 'M',
    persona: 'The rentals desk.',
    tools: ['createBooking', 'placeHold', 'getBooking'],
    contract: c,
  });

describe('the changeAllowed write-gate binding', () => {
  it('installs one preTool gate on the write tools', () => {
    const s = spec(contract({ guards: [frozenWritesBinding()] }));
    const gate = s.guards.preTool.find((b) => b.id === 'changeAllowed:precondition');
    expect(gate).toBeDefined();
    expect(gate!.priority).toBe('changeAllowed');
    expect(gate!.target).toEqual(['createBooking', 'placeHold']);
    expect(gate!.guard.check(ctx({ tool: 'createBooking', world: world('suspended') }))).toBe(
      'This workspace is suspended.',
    );
    expect(gate!.guard.check(ctx({ tool: 'createBooking', world: world('active') }))).toBeNull();
  });

  it('an exempt write keeps running while the gate denies the rest', () => {
    const s = spec(contract({ guards: [frozenWritesBinding(['placeHold'])] }));
    expect(s.guards.preTool.find((b) => b.id === 'changeAllowed:precondition')!.target).toEqual(['createBooking']);
  });

  it('an exempt tool that is not a write tool throws at construction', () => {
    expect(() => spec(contract({ guards: [frozenWritesBinding(['getBooking'])] }))).toThrow(
      /exempts tool\(s\) not in writeTools: getBooking/,
    );
  });

  it('a gate whose write surface misses the lane installs nothing', () => {
    const s = spec(contract({ writeTools: [], guards: [frozenWritesBinding()] }));
    expect(s.guards.preTool.some((b) => b.id === 'changeAllowed:precondition')).toBe(false);
  });
});
