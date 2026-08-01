/**
 * The norms-config loader — guards from DATA, regex structurally impossible.
 *
 * Proves: (a) a valid config with one guard of each kind loads and installs the expected guard ids;
 * (b) the REGEX BAN — any pattern-like KEY fails validation BY NAME; (c) the PROSE PLACEMENT LAW —
 * a precondition missing prose, or an uncheckable entry with anything beyond {ruleId, prose}, is a
 * named error; plus the closed-expression predicate, the named-ref predicate, and the 'true'-string
 * confirm coercion.
 */
import { describe, expect, it } from 'vitest';
import type { AgentSpec, AgentWorld, GuardCtx, ObservedCall } from '@looprun-ai/core';
import { loadNormsConfig, NormsConfigError, renderDeny } from '../src/norms-config.js';

const guardIds = (spec: AgentSpec): string[] => spec.guards.preTool.map((b) => b.id);

const fixtureValid = {
  id: 'fleet',
  persona: 'You are the fleet agent: assets, plans and maintenance.',
  tools: ['changePlan', 'getPlanUsage', 'issueRefund', 'chargeDeposit', 'completeMaintenance', 'inviteMember'],
  destructiveTools: ['issueRefund'],
  guards: [
    { kind: 'requiresBefore', id: 'planChangeReadsUsageFirst', tool: 'changePlan', reads: ['getPlanUsage'] },
    { kind: 'consentToken', id: 'chargeConsent', tools: ['issueRefund', 'chargeDeposit'] },
    { kind: 'askedEarlier', id: 'conditionAsked', tool: 'completeMaintenance', arg: 'condition' },
    {
      kind: 'precondition',
      id: 'seatsAvailable',
      tool: 'inviteMember',
      predicate: { op: 'lt', left: { count: 'members' }, right: { limit: 'seats' } },
      prose: 'invite a member only while seats remain',
    },
    { kind: 'precondition', id: 'seatFreeCheck', tool: 'inviteMember', predicate: { ref: 'seatFree' }, prose: 'invite only while a seat is free' },
  ],
  uncheckable: [{ ruleId: 'D44', prose: 'stay concise; do not lecture' }],
  behavior: ['warm, precise, grounded in tool results'],
  scope: { lane: 'fleet operations', others: [{ label: 'Billing team', covers: 'invoices and refunds policy' }] },
};

describe('loadNormsConfig — guards from data', () => {
  it('(a) loads a valid config and installs the expected agent guard ids', () => {
    const spec = loadNormsConfig(fixtureValid, { predicates: { seatFree: () => true } });
    expect(guardIds(spec)).toEqual(
      expect.arrayContaining(['agent:planChangeReadsUsageFirst', 'agent:chargeConsent', 'agent:conditionAsked']),
    );
    // both preconditions installed too (closed-expression + named ref)
    expect(guardIds(spec)).toEqual(expect.arrayContaining(['agent:seatsAvailable', 'agent:seatFreeCheck']));
    expect(spec.persona).toContain('fleet');
  });

  it('(b) REGEX BAN — a pattern-like KEY anywhere fails validation by name', () => {
    const fixtureWithPatternKey = {
      id: 'x',
      persona: 'p',
      tools: ['t'],
      guards: [{ kind: 'askedEarlier', id: 'a', tool: 't', pattern: 'foo.*' }],
    };
    expect(() => loadNormsConfig(fixtureWithPatternKey)).toThrow(/pattern|regex.*not.*supported/i);
  });

  it('(c) PROSE PLACEMENT LAW — a proseless precondition is a named error', () => {
    const fixtureProseless = {
      id: 'x',
      persona: 'p',
      tools: ['t'],
      guards: [{ kind: 'precondition', id: 'a', tool: 't', predicate: { op: 'absent', left: { field: 'x' } } }],
    };
    expect(() => loadNormsConfig(fixtureProseless)).toThrow(/prose/);
  });

  it('(c2) an uncheckable entry with anything beyond {ruleId, prose} is a named error', () => {
    const fixtureBadUncheckable = {
      id: 'x',
      persona: 'p',
      tools: ['t'],
      uncheckable: [{ ruleId: 'D1', prose: 'p', check: 'nope' }],
    };
    expect(() => loadNormsConfig(fixtureBadUncheckable)).toThrow(NormsConfigError);
  });

  it('unknown predicate ref throws at LOAD, not run time', () => {
    const cfg = {
      id: 'x',
      persona: 'p',
      tools: ['inviteMember'],
      guards: [{ kind: 'precondition', id: 'a', tool: 'inviteMember', predicate: { ref: 'missing' }, prose: 'x' }],
    };
    expect(() => loadNormsConfig(cfg, { predicates: {} })).toThrow(/predicate ref 'missing'/);
  });

  it('an arg ref in a precondition predicate is rejected at LOAD', () => {
    const cfg = {
      id: 'x',
      persona: 'p',
      tools: ['inviteMember'],
      guards: [{ kind: 'precondition', id: 'a', tool: 'inviteMember', predicate: { op: 'eq', left: { arg: 'foo' }, right: { field: 'bar' } }, prose: 'x' }],
    };
    expect(() => loadNormsConfig(cfg)).toThrow(/arg.*ref.*not available|arg' ref/i);
  });

  it('the closed-expression predicate compiles to a working world read', () => {
    const spec = loadNormsConfig(fixtureValid, { predicates: { seatFree: () => true } });
    const binding = spec.guards.preTool.find((b) => b.id === 'agent:seatsAvailable');
    expect(binding).toBeDefined();
    const ctxFor = (members: number, seats: number): GuardCtx => ({
      args: {},
      tool: 'inviteMember',
      world: { members: new Array(members).fill(0), seats } as unknown as AgentWorld,
      observed: [] as ObservedCall[],
      turnIndex: 0,
    });
    // seats remain → allowed (null); at capacity → denied (a reason string)
    expect(binding!.guard.check(ctxFor(2, 5))).toBeNull();
    expect(typeof binding!.guard.check(ctxFor(5, 5))).toBe('string');
  });

  it("consentToken normalizes confirmed:'true' (string) to a confirmed call", () => {
    const spec = loadNormsConfig({
      id: 'x',
      persona: 'p',
      tools: ['issueRefund'],
      guards: [{ kind: 'consentToken', id: 'refundConsent', tools: ['issueRefund'] }],
    });
    const binding = spec.guards.preTool.find((b) => b.id === 'agent:refundConsent')!;
    // A string-'true' confirm with NO earlier probe must be treated as confirmed → denied, exactly
    // as a boolean-true confirm would be (proves the coercion reached the trigger).
    const ctx: GuardCtx = {
      args: { confirmed: 'true', amount: 10 },
      tool: 'issueRefund',
      world: {} as AgentWorld,
      observed: [] as ObservedCall[],
      turnIndex: 1,
    };
    expect(typeof binding.guard.check(ctx)).toBe('string');
    // control: an unconfirmed call (no probe requirement triggered) is allowed
    expect(binding.guard.check({ ...ctx, args: { amount: 10 } })).toBeNull();
  });

  // ── DENY POLICY: catalog denies name the read, never the figures ────────────────────────────────

  it('DENY POLICY — a requiresBefore deny NAMES the read and leaks NO figure from the world', () => {
    const spec = loadNormsConfig(fixtureValid, { predicates: { seatFree: () => true } });
    const binding = spec.guards.preTool.find((b) => b.id === 'agent:planChangeReadsUsageFirst')!;
    // A world FULL of figures the model must not be handed: seats, a dollar price, a role.
    const ctx: GuardCtx = {
      args: {},
      tool: 'changePlan',
      world: { seats: 2, plan: { price: 4900 }, owner: { role: 'admin' } } as unknown as AgentWorld,
      observed: [] as ObservedCall[],
      turnIndex: 0,
    };
    const deny = binding.guard.check(ctx);
    expect(typeof deny).toBe('string');
    // the policy: names the read, and carries NOT ONE digit from the figure-laden world
    expect(deny).toMatch(/getPlanUsage/);
    expect(deny).not.toMatch(/\d/);
  });

  it('renderDeny names each read, points at the result, and interpolates no figure', () => {
    const deny = renderDeny(['getPlanUsage', 'getSeatCount'], 'actual values');
    expect(deny).toBe('Read getPlanUsage or getSeatCount first and report the actual values from that result.');
    expect(deny).not.toMatch(/\d/);
  });

  it('the schema REJECTS a free `reason` on a guard — configs cannot override the deny policy', () => {
    const cfg = {
      id: 'x',
      persona: 'p',
      tools: ['inviteMember'],
      guards: [
        {
          kind: 'precondition',
          id: 'a',
          tool: 'inviteMember',
          predicate: { op: 'absent', left: { field: 'x' } },
          prose: 'invite only while a seat is free',
          reason: 'only 2 seats left on the Pro plan', // a figure-carrying free string — must be refused
        },
      ],
    };
    expect(() => loadNormsConfig(cfg)).toThrow(NormsConfigError);
  });
});
