/**
 * The norms-config loader — guards from DATA, regex structurally impossible.
 *
 * Proves: (a) a valid config with one guard of each kind loads and installs the expected guard ids;
 * (b) the REGEX BAN — any pattern-like KEY fails validation BY NAME; (c) the PROSE PLACEMENT LAW —
 * a precondition missing prose, or an uncheckable entry with anything beyond {ruleId, prose}, is a
 * named error; plus the closed-expression predicate, the named-ref predicate, and the 'true'-string
 * confirm coercion.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AgentSpec, AgentWorld, GuardCtx, ObservedCall } from '@looprun-ai/core';
import { LIE_QUESTION, renderAssembledPrompt } from '@looprun-ai/core/internal';
import { loadNormsConfig, NormsConfigError, renderDeny } from '../src/norms-config.js';
import { loadSubject } from '../src/subject.js';

const SUBJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/toy-subject');
const readJson = (rel: string) => JSON.parse(readFileSync(resolve(SUBJECT_DIR, rel), 'utf8'));

const guardIds = (spec: AgentSpec): string[] => spec.guards.preTool.map((b) => b.id);

const fixtureValid = {
  id: 'fleet',
  persona: 'You are the fleet agent: assets, plans and maintenance.',
  tools: ['changePlan', 'getPlanUsage', 'issueRefund', 'chargeDeposit', 'completeMaintenance', 'inviteMember'],
  destructiveTools: ['issueRefund'],
  guards: [
    { kind: 'requiresBefore', id: 'planChangeReadsUsageFirst', tool: 'changePlan', reads: ['getPlanUsage'] },
    { kind: 'consentToken', id: 'chargeConsent', tools: ['issueRefund', 'chargeDeposit'] },
    { kind: 'valueFromUser', id: 'conditionAsked', tool: 'completeMaintenance', arg: 'condition' },
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

  it('(a2) the llmCheck kind loads and installs — onReply→behavior, preTool→run, rubric is prose', () => {
    const cfg = {
      id: 'x',
      persona: 'p',
      tools: ['cancelBooking'],
      guards: [
        { kind: 'llmCheck', id: 'licence', hook: 'onReply', tools: 'any', rubric: 'Did the user authorise THIS act?', failMode: 'closed' },
        { kind: 'llmCheck', id: 'gateCancel', hook: 'preTool', tools: ['cancelBooking'], rubric: 'Is this cancellation the one the user asked for?' },
      ],
    };
    const spec = loadNormsConfig(cfg);
    const onReply = spec.guards.onReply.find((b) => b.id === 'agent:licence');
    expect(onReply?.guard.kind).toBe('llmCheck');
    expect(onReply?.guard.dim).toBe('behavior');
    expect(onReply?.guard.prose()).toBe('Did the user authorise THIS act?');
    const preTool = spec.guards.preTool.find((b) => b.id === 'agent:gateCancel');
    expect(preTool?.guard.kind).toBe('llmCheck');
    expect(preTool?.guard.dim).toBe('run');
  });

  it('(a3) llmCheck: an unknown key is rejected by .strict()', () => {
    const cfg = {
      id: 'x', persona: 'p', tools: ['t'],
      guards: [{ kind: 'llmCheck', id: 'l', hook: 'onReply', tools: 'any', rubric: 'q?', reason: 'leak' }],
    };
    expect(() => loadNormsConfig(cfg)).toThrow(NormsConfigError);
  });

  it('(a4) the llmCheckLie kind loads onReply/global with the BAKED lie question', () => {
    const cfg = {
      id: 'x', persona: 'p', tools: ['cancelBooking'],
      guards: [{ kind: 'llmCheckLie', id: 'prosebackstop', failMode: 'closed' }],
    };
    const spec = loadNormsConfig(cfg);
    const bound = spec.guards.onReply.find((b) => b.id === 'agent:prosebackstop');
    expect(bound?.guard.kind).toBe('llmCheckLie'); // its own kind — the judge gate sees it
    expect(bound?.guard.dim).toBe('behavior');
    // The question is the ENGINE's, not the config's: the config chose only to install it.
    expect(bound?.guard.prose()).toBe(LIE_QUESTION);
    // AVAILABLE, NOT AUTO-INSTALLED: a config that does not name it gets no such guard.
    const without = loadNormsConfig({ id: 'x', persona: 'p', tools: ['cancelBooking'], guards: [] });
    expect(without.guards.onReply.some((b) => b.guard.prose() === LIE_QUESTION)).toBe(false);
  });

  it('(a5) llmCheckLie: a rubric of its own is rejected by .strict() (the question is engine-owned)', () => {
    const cfg = {
      id: 'x', persona: 'p', tools: ['t'],
      guards: [{ kind: 'llmCheckLie', id: 'd', rubric: 'my own question?' }],
    };
    expect(() => loadNormsConfig(cfg)).toThrow(NormsConfigError);
  });

  // THE SHADOW LAW on the config path. This loader builds a CONTRACT-LESS spec, so the spec
  // constructor's gate never sees the config's `outcomes` block: without a gate here,
  // `{"NOT_FOUND":"success"}` would load clean and a `NOT_FOUND` claim would satisfy a `success`
  // rubric — faking the one field the rubric exists to make unfakeable.
  it('(a6) SHADOW LAW — an `outcomes` block keying a core word fails at LOAD, path-qualified', () => {
    const cfg = {
      id: 'x', persona: 'p', tools: ['t'],
      outcomes: { NOT_FOUND: 'success', settled: 'success' },
      guards: [{ kind: 'mustAccountFor', id: 'r', records: ['ORD-9'], outcome: 'success', reason: 'account for ORD-9' }],
    };
    expect(() => loadNormsConfig(cfg)).toThrow(NormsConfigError);
    expect(() => loadNormsConfig(cfg)).toThrow(/outcomes.*outcome map|outcome map/i);
  });

  it('(a7) CONTROL — an honest DOMAIN outcome vocabulary still loads and resolves polarity', () => {
    const cfg = {
      id: 'x', persona: 'p', tools: ['t'],
      outcomes: { settled: 'success', bounced: 'failure' },
      guards: [{ kind: 'mustAccountFor', id: 'r', records: ['ORD-9'], outcome: 'success', reason: 'account for ORD-9' }],
    };
    const spec = loadNormsConfig(cfg);
    const guard = spec.guards.onReply.find((b) => b.guard.kind === 'mustAccountFor')!.guard;
    const ctx = { args: {}, world: {} as AgentWorld, observed: [], turnIndex: 0, userText: '', history: [], did: [{ op: 'lookup', target: 'ORD-9', outcome: 'settled' }] } as GuardCtx;
    expect(guard.check(ctx)).toBeNull();
  });

  it('(b) REGEX BAN — a pattern-like KEY anywhere fails validation by name', () => {
    const fixtureWithPatternKey = {
      id: 'x',
      persona: 'p',
      tools: ['t'],
      guards: [{ kind: 'valueFromUser', id: 'a', tool: 't', pattern: 'foo.*' }],
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
      userText: '',
      history: [],
    });
    // seats remain → allowed (null); at capacity → denied (a reason string)
    expect(binding!.guard.check(ctxFor(2, 5))).toBeNull();
    expect(typeof binding!.guard.check(ctxFor(5, 5))).toBe('string');
  });

  it("consentToken treats a string-'true' simulate as the act it is — only boolean true bypasses", () => {
    const spec = loadNormsConfig({
      id: 'x',
      persona: 'p',
      tools: ['issueRefund'],
      guards: [{ kind: 'consentToken', id: 'refundConsent', tools: ['issueRefund'] }],
    });
    const binding = spec.guards.preTool.find((b) => b.id === 'agent:refundConsent')!;
    const ctx: GuardCtx = {
      args: { simulate: 'true', amount: 10 },
      tool: 'issueRefund',
      world: {} as AgentWorld,
      observed: [] as ObservedCall[],
      turnIndex: 1,
      userText: '',
      history: [],
      simulatableTools: new Set(['issueRefund']),
    };
    expect(typeof binding.guard.check(ctx)).toBe('string');
    // control: the strict boolean simulation on a schema-licensed tool passes — it is how the
    // world raises the question.
    expect(binding.guard.check({ ...ctx, args: { amount: 10, simulate: true } })).toBeNull();
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
      userText: '',
      history: [],
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

  // ── ACCEPTANCE PROOF: config-built spec renders an assembled prompt BYTE-IDENTICAL to the TS-built one ────────
  //
  // The toy-subject's front-desk spec (norms/index.ts) uses exactly one guard, requiresBefore, which
  // has a catalog kind — so NO uncheckable-prose fallback and NO new schema kind were needed to reach
  // byte-identity. The loader's `withPolicyDeny` wrapper replaces only the DENY text (never rendered in
  // the assembled prompt) and preserves `prose()` verbatim, so the sole assembled prompt-visible guard output is identical.
  // NO residual diff: this is a clean DONE, not DONE_WITH_CONCERNS.
  it('config-built spec is assembledPrompt-byte-identical to the TS-built one', async () => {
    const subject = await loadSubject(SUBJECT_DIR);
    const ts = subject.specs['front-desk'];
    const cfg = loadNormsConfig(readJson('norms/front-desk.json'));
    const world = subject.makeWorld('default');
    expect(renderAssembledPrompt(world, cfg, [], subject.contract)).toBe(
      renderAssembledPrompt(world, ts, [], subject.contract),
    );
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
