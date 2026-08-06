/**
 * THE CONSENT GATE — one law: a destructive call that is not a schema-licensed simulation runs only
 * on a consumed approval about THIS call.
 */
import { describe, it, expect } from 'vitest';
import { confirmFirst, destructiveThrottle } from '../src/guards/confirmation.js';
import type { ApprovalRequest } from '../src/runtime/approval-request.js';
import type { GuardCtx, ObservedCall } from '../src/rules.js';

const consented: ApprovalRequest = {
  tool: 'cancelBooking',
  subject: 'BK-1',
  meaning: 'BK-1',
  token: 'CONFIRM BK-1',
  issuedTurn: 0,
  consumedTurn: 1,
};

const ctx = (over: Partial<GuardCtx>): GuardCtx =>
  ({
    args: {},
    world: {} as GuardCtx['world'],
    observed: [],
    turnIndex: 1,
    userText: '',
    history: [],
    ...over,
  }) as GuardCtx;

describe('confirmFirst — an act that is not a schema-licensed simulation needs the code', () => {
  const g = confirmFirst();
  const sim = new Set(['cancelBooking']);

  it('lets a schema-licensed simulation through — it is how the world raises the question', () => {
    expect(g.check(ctx({ tool: 'cancelBooking', args: { id: 'BK-1', simulate: true }, simulatableTools: sim, consent: [] }))).toBeNull();
  });

  it('gates a hallucinated simulate on a tool whose schema has none', () => {
    expect(g.check(ctx({ tool: 'unsubscribeCustomer', args: { id: 'C-1', simulate: true }, simulatableTools: sim, consent: [] }))).not.toBeNull();
  });

  it('gates every call when no bypass set was seated', () => {
    expect(g.check(ctx({ tool: 'cancelBooking', args: { id: 'BK-1', simulate: true }, consent: [] }))).not.toBeNull();
  });

  it('allows the bare act the user consented to', () => {
    expect(g.check(ctx({ tool: 'cancelBooking', args: { id: 'BK-1' }, simulatableTools: sim, consent: [consented] }))).toBeNull();
  });

  it('denies the bare act when no consent arrived', () => {
    expect(g.check(ctx({ tool: 'cancelBooking', args: { id: 'BK-1' }, simulatableTools: sim, consent: [] }))).not.toBeNull();
  });

  it('denies an act on a record the consent does not name', () => {
    expect(g.check(ctx({ tool: 'cancelBooking', args: { id: 'BK-12' }, simulatableTools: sim, consent: [consented] }))).not.toBeNull();
  });

  it('denies an act on a different tool', () => {
    expect(g.check(ctx({ tool: 'deleteBooking', args: { id: 'BK-1' }, simulatableTools: sim, consent: [consented] }))).not.toBeNull();
  });

  it('denies when the ctx carries no consent field at all', () => {
    expect(g.check(ctx({ tool: 'cancelBooking', args: { id: 'BK-1' } }))).not.toBeNull();
  });

  it('allows an act with no record when the tool itself was consented to', () => {
    const label: ApprovalRequest = {
      tool: 'deleteAllData',
      meaning: 'delete all of your data',
      token: 'CONFIRM DELETE-ALL',
      issuedTurn: 0,
      consumedTurn: 1,
    };
    expect(g.check(ctx({ tool: 'deleteAllData', args: {}, consent: [label] }))).toBeNull();
  });

  it('is silent when there is no tool in the ctx', () => {
    expect(g.check(ctx({ args: { id: 'BK-1' }, consent: [] }))).toBeNull();
  });

  it('gates EVERY call of a tool that cannot simulate', () => {
    expect(g.check(ctx({ tool: 'deleteAllData', args: {}, consent: [] }))).not.toBeNull();
  });

  it('names no tool and no terminal in the prose the model reads', () => {
    expect(g.prose()).not.toContain('cancelBooking');
    expect(g.prose()).not.toContain('respond');
  });
});

describe('confirmFirst({ when }) — the call decides, not the tool', () => {
  const when = { placeHold: (args: Record<string, unknown>) => args.scope === 'workspace' };

  it('the protective branch runs with no consent at all', () => {
    const g = confirmFirst({ when });
    expect(g.check(ctx({ tool: 'placeHold', args: { scope: 'asset' }, consent: [] }))).toBeNull();
  });

  it('the destructive branch is gated exactly as an unconditional tool is', () => {
    const g = confirmFirst({ when });
    expect(g.check(ctx({ tool: 'placeHold', args: { scope: 'workspace' }, consent: [] }))).toMatch(
      /has not confirmed this action/,
    );
  });

  it('a tool with no predicate keeps the unconditional reading', () => {
    const g = confirmFirst({ when });
    expect(g.check(ctx({ tool: 'cancelBooking', args: {}, consent: [] }))).toMatch(
      /has not confirmed this action/,
    );
  });

  it('the predicate is asked before the bypass: a protective simulate call runs free', () => {
    const g = confirmFirst({ when });
    expect(g.check(ctx({ tool: 'placeHold', args: { scope: 'asset', simulate: true }, consent: [] }))).toBeNull();
  });
});

describe('destructiveThrottle({ when }) — the cap counts destructive acts', () => {
  const when = { placeHold: (args: Record<string, unknown>) => args.scope === 'workspace' };
  const ran = (args: Record<string, unknown>) =>
    ({ name: 'placeHold', args, ok: true, tookEffect: true, turnIndex: 1 }) as unknown as ObservedCall;

  it('a protective call is not capped by a prior protective effect', () => {
    const g = destructiveThrottle(['placeHold'], { when });
    expect(
      g.check(ctx({ tool: 'placeHold', args: { scope: 'asset' }, observed: [ran({ scope: 'asset' })] })),
    ).toBeNull();
  });

  it('a destructive call is capped by a prior destructive effect', () => {
    const g = destructiveThrottle(['placeHold'], { when });
    expect(
      g.check(ctx({ tool: 'placeHold', args: { scope: 'workspace' }, observed: [ran({ scope: 'workspace' })] })),
    ).toMatch(/already ran this turn/);
  });

  it('a protective effect does not count against a destructive call', () => {
    const g = destructiveThrottle(['placeHold'], { when });
    expect(
      g.check(ctx({ tool: 'placeHold', args: { scope: 'workspace' }, observed: [ran({ scope: 'asset' })] })),
    ).toBeNull();
  });
});
