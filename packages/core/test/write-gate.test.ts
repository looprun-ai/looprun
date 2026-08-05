/**
 * THE CONTRACT WRITE GATE — one declaration installs the state gate on every spec that writes.
 */
import { describe, it, expect } from 'vitest';
import { AgentSpecBase } from '../src/spec.js';
import type { AgentWorld, DomainContract, GuardCtx } from '../src/index.js';

const world = (status: string): AgentWorld => ({ status: () => status }) as unknown as AgentWorld;

const ctx = (over: Partial<GuardCtx>): GuardCtx =>
  ({ args: {}, world: world('active'), observed: [], turnIndex: 0, userText: '', history: [], ...over }) as GuardCtx;

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

describe('contract.writeGate', () => {
  it('installs one preTool gate on the write tools', () => {
    const s = spec(
      contract({
        writeGate: {
          ok: (w) => (w as unknown as { status(): string }).status() !== 'suspended',
          reason: 'This workspace is suspended.',
        },
      }),
    );
    const gate = s.guards.preTool.find((b) => b.id === 'minimal:writeGate');
    expect(gate).toBeDefined();
    expect(gate!.target).toEqual(['createBooking', 'placeHold']);
    expect(gate!.guard.check(ctx({ tool: 'createBooking', world: world('suspended') }))).toBe(
      'This workspace is suspended.',
    );
    expect(gate!.guard.check(ctx({ tool: 'createBooking', world: world('active') }))).toBeNull();
  });

  it('an exempt write keeps running while the gate denies the rest', () => {
    const s = spec(
      contract({
        writeGate: {
          ok: (w) => (w as unknown as { status(): string }).status() !== 'suspended',
          reason: 'This workspace is suspended.',
          exempt: ['placeHold'],
        },
      }),
    );
    expect(s.guards.preTool.find((b) => b.id === 'minimal:writeGate')!.target).toEqual(['createBooking']);
  });

  it('an exempt tool that is not a write tool throws at construction', () => {
    expect(() =>
      spec(contract({ writeGate: { ok: () => true, reason: 'r', exempt: ['getBooking'] } })),
    ).toThrow(/writeGate\.exempt names tool\(s\) that are not in contract\.writeTools: getBooking/);
  });

  it('a gate with no write surface throws at construction', () => {
    expect(() => spec(contract({ writeTools: [], writeGate: { ok: () => true, reason: 'r' } }))).toThrow(
      /writeGate is declared with no contract\.writeTools/,
    );
  });
});
