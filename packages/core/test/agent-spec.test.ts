/** The ONE AgentSpec class + guard-binding semantics (the Minimal/Base/Full ladder is collapsed). */
import { describe, expect, it } from 'vitest';
import {
  AgentSpecBase,
  resolveBindings,
  resolveGuards,
  custom,
  precondition,
  confirmFirst,
  destructiveClaimRequiresSuccess,
  pendingConfirmMustAsk,
} from '../src/index.js';
import type { AgentWorld, GuardCtx, ObservedCall, TrunkTheme } from '../src/index.js';

const persona = 'You are the plant-care agent: watering and repotting.';

const THEME: TrunkTheme = {
  voice: 'You are the assistant of a small business.',
  stateBlock: () => '',
  coreInvariants: ['Never invent data.'],
  languageClause: "## Output language (ABSOLUTE)\nReply in the user's language.",
};

function fixtureWorld(state: Record<string, unknown> = {}): AgentWorld {
  return { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [], ...state };
}

describe('AgentSpecBase — universal invariants', () => {
  it('installs the minimal invariants (every spec)', () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['water'] });
    expect(spec.guards.preTool.map((b) => b.id)).toContain('minimal:noDuplicateCall');
    expect(spec.guards.onReply.map((b) => b.id)).toContain('minimal:emptyReply');
  });

  it('a non-destructive spec installs ONLY the minimal layer (no base:* ids)', () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['water'] });
    expect(spec.guards.preTool.map((b) => b.id)).toEqual(['minimal:noDuplicateCall']);
    expect(spec.guards.preTool.every((b) => !b.id.startsWith('base:'))).toBe(true);
  });

  it('rejects terminal tools in the surface', () => {
    expect(() => new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['replyToUser'] })).toThrow(/terminal tools/);
  });

  it('requires a non-empty persona (persona-on-spec law)', () => {
    expect(() => new AgentSpecBase({ id: 'a', mode: 'M', persona: '  ', tools: [] })).toThrow(/persona/);
  });

  it('rejects a behavior-dim guard as a preTool gate', () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['water'] });
    const g = custom({ kind: 'x', dim: 'behavior', check: () => null, prose: () => 'x' });
    expect(() => spec.addGuard('preTool', ['water'], g)).toThrow(/cannot be a preTool gate/);
  });

  it('rejects duplicate guard ids', () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['water'] });
    const g = precondition(() => true, 'nope');
    spec.addGuard('preTool', ['water'], g, { id: 'agent:dup' });
    expect(() => spec.addGuard('preTool', ['water'], g, { id: 'agent:dup' })).toThrow(/already exists/);
  });

  it('stores the domain theme reference', () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: [], theme: THEME });
    expect(spec.theme).toBe(THEME);
  });

  it('carries per-agent sampling on controls', () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: [], sampling: { temperature: 0.7 } });
    expect(spec.controls.sampling).toEqual({ temperature: 0.7 });
  });

  it('is a pure guard set (no llm: kinds)', () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: [] });
    expect(spec.isPureGuardSet).toBe(true);
    spec.addReplyCheck(custom({ kind: 'llm:judge', dim: 'behavior', check: () => null, prose: () => 'x' }));
    expect(spec.isPureGuardSet).toBe(false);
  });
});

describe('AgentSpecBase — destructive protocol (iff destructiveTools)', () => {
  it('installs confirmFirst + destructiveThrottle on destructive tools, in byte-stable order', () => {
    const spec = new AgentSpecBase({ id: 'b', mode: 'M', persona, tools: ['deleteItem'], destructiveTools: ['deleteItem'] });
    const ids = spec.guards.preTool.map((b) => b.id);
    // minimal installs first, then base — the former ladder's super()/installBase() order.
    expect(ids).toEqual(['minimal:noDuplicateCall', 'base:confirmFirst', 'base:destructiveThrottle']);
  });

  it('rejects destructive tools outside the surface', () => {
    expect(
      () => new AgentSpecBase({ id: 'b', mode: 'M', persona, tools: ['water'], destructiveTools: ['deleteItem'] }),
    ).toThrow(/not in the tool surface/);
  });

  it('installs base:confirmFirstPriorAsk for a prior-ask mechanism tool', () => {
    const spec = new AgentSpecBase({
      id: 'b', mode: 'M', persona, tools: ['disconnect'],
      destructiveTools: ['disconnect'], confirmMechanism: { disconnect: 'prior-ask' },
    });
    expect(spec.guards.preTool.map((b) => b.id)).toEqual([
      'minimal:noDuplicateCall', 'base:confirmFirstPriorAsk', 'base:destructiveThrottle',
    ]);
  });

  it('partitions mixed mechanisms (arg → confirmFirst, prior-ask → confirmFirstPriorAsk, throttle over all)', () => {
    const spec = new AgentSpecBase({
      id: 'b', mode: 'M', persona, tools: ['del', 'disc'],
      destructiveTools: ['del', 'disc'], confirmMechanism: { disc: 'prior-ask' },
    });
    expect(spec.guards.preTool.map((b) => b.id)).toEqual([
      'minimal:noDuplicateCall', 'base:confirmFirst', 'base:confirmFirstPriorAsk', 'base:destructiveThrottle',
    ]);
  });
});

describe('AgentSpecBase — noFalseFailureClaim auto-layer (cfg.lexicon)', () => {
  const FALSE_FAILURE = /\b(cannot|unable|failed)\b/i;

  it('auto-installs minimal:noFalseFailureClaim BEFORE minimal:emptyReply when lexicon provides the regex', () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['x'], lexicon: { falseFailureClaimRe: FALSE_FAILURE } });
    expect(spec.guards.onReply.map((b) => b.id)).toEqual(['minimal:noFalseFailureClaim', 'minimal:emptyReply']);
  });

  it('is byte-stable (NOT installed) when no lexicon is provided', () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['x'] });
    expect(spec.guards.onReply.map((b) => b.id)).toEqual(['minimal:emptyReply']);
  });
});

describe('layer resolution (agent wins)', () => {
  it('sorts agent → base → minimal', () => {
    const spec = new AgentSpecBase({ id: 'l', mode: 'M', persona, tools: ['deleteItem'], destructiveTools: ['deleteItem'] });
    spec.addGuard('preTool', ['deleteItem'], precondition(() => true, 'agent gate'), { id: 'agent:gate' });
    const order = resolveBindings(spec.guards.preTool, 'deleteItem').map((b) => b.layer);
    expect(order[0]).toBe('agent');
    expect(order[order.length - 1]).toBe('minimal');
  });

  it('filters by tool target', () => {
    const spec = new AgentSpecBase({ id: 'l', mode: 'M', persona, tools: ['a', 'b'] });
    spec.addGuard('preTool', ['a'], precondition(() => true, 'only-a'), { id: 'agent:onlyA' });
    expect(resolveGuards(spec.guards.preTool, 'b').some((g) => g.kind === 'precondition')).toBe(false);
    expect(resolveGuards(spec.guards.preTool, 'a').some((g) => g.kind === 'precondition')).toBe(true);
  });
});

describe('destructiveClaimRequiresSuccess — attempt-keyed, offer-aware, sentence-scoped (P8a)', () => {
  // English lexicon injected by the caller (the runtime carries none). The claim-check probe-relay
  // exemption uses confirm-LANGUAGE only (no bare `?`) so a trailing question cannot mask a claim.
  const CLAIM = /\b(deleted|removed|cancelled)\b/i;
  const ASK = /\b(confirm|are you sure|do you want|shall i|proceed|go ahead)\b/i;
  const OFFER = /\b(want me to|shall i|i can|would you like me to|if you(?:'d| would) like)\b/i;
  const guard = destructiveClaimRequiresSuccess(['deleteItem'], { claimRe: CLAIM, askRe: ASK, offerRe: OFFER });

  // The realistic fabrication footprint under toolChoice:'required' — a confirmed:true call the
  // confirmFirst gate vetoed: an ATTEMPT with no effect.
  const vetoedAttempt: ObservedCall = { name: 'deleteItem', args: { confirmed: true }, ok: false, turnIndex: 0 };
  // A legal PROBE (confirmed absent, ok) — the two-step first leg.
  const probe: ObservedCall = { name: 'deleteItem', args: { itemId: 'x1' }, ok: true, turnIndex: 0 };

  const ctx = (reply: string, observed: ObservedCall[] = []): GuardCtx => ({
    args: {}, world: fixtureWorld(), observed, turnIndex: 0, reply, producedThisTurn: [],
  });

  it('does NOT fire on a status readback when no destructive tool was ATTEMPTED this turn (P1-FP fix)', () => {
    expect(guard.check(ctx('The item was deleted.'))).toBeNull();
  });

  it('fires on a declarative deletion claim when the destructive tool was attempted-but-vetoed', () => {
    expect(guard.check(ctx('The item was deleted.', [vetoedAttempt]))).not.toBeNull();
  });

  it('does NOT fire when the destructive verb is only OFFERED (same sentence), even given an attempt', () => {
    expect(guard.check(ctx('I can delete it — want me to remove the record?', [vetoedAttempt]))).toBeNull();
  });

  it('an earlier offer sentence cannot mask a later declarative claim', () => {
    expect(guard.check(ctx('Want me to help? The record was deleted.', [vetoedAttempt]))).not.toBeNull();
  });

  it('exempts a confirm-seeking relay after a probe, but still fires on a declarative claim after only a probe', () => {
    expect(guard.check(ctx('Are you sure you want to proceed?', [probe]))).toBeNull();
    expect(guard.check(ctx('The record was deleted.', [probe]))).not.toBeNull();
  });

  it('does not fire when the destructive tool succeeded with confirmed:true this turn', () => {
    const ok: ObservedCall = { name: 'deleteItem', args: { confirmed: true }, ok: true, turnIndex: 0 };
    expect(guard.check(ctx('The item was deleted.', [ok]))).toBeNull();
  });
});

describe('pendingConfirmMustAsk — resolution-aware (P8a)', () => {
  const ASK = /\?|\b(confirm|are you sure|do you want|shall i|proceed|go ahead)\b/i;
  const guard = pendingConfirmMustAsk({ askRe: ASK });
  const pendingProbe: ObservedCall = {
    name: 'deleteItem', args: { itemId: 'x1' }, ok: true, turnIndex: 0, resultFlags: { requiresConfirmation: true },
  };
  const ctx = (reply: string, observed: ObservedCall[]): GuardCtx => ({
    args: {}, world: fixtureWorld(), observed, turnIndex: 0, reply, producedThisTurn: [],
  });

  it('fires when the pending confirm is unresolved and the reply does not ask', () => {
    expect(guard.check(ctx('Item x1 removed.', [pendingProbe]))).not.toBeNull();
  });

  it('does not fire when the reply relays the confirmation question', () => {
    expect(guard.check(ctx('Are you sure you want to delete x1?', [pendingProbe]))).toBeNull();
  });

  it('does NOT fire once a same-record confirmed:true call resolves the probe (probe→approved-execute tail)', () => {
    const resolve: ObservedCall = { name: 'deleteItem', args: { itemId: 'x1', confirmed: true }, ok: true, turnIndex: 0 };
    expect(guard.check(ctx('Done — x1 removed.', [pendingProbe, resolve]))).toBeNull();
  });

  it('STILL fires when the confirmed:true call was on a DIFFERENT record', () => {
    const other: ObservedCall = { name: 'deleteItem', args: { itemId: 'x7', confirmed: true }, ok: true, turnIndex: 0 };
    expect(guard.check(ctx('Removed.', [pendingProbe, other]))).not.toBeNull();
  });
});

describe('confirmFirst — arg + prior-ask mechanisms', () => {
  const ctx = (over: Partial<GuardCtx>): GuardCtx => ({
    args: {}, tool: 'act', world: fixtureWorld(), observed: [], turnIndex: 0, reply: '', producedThisTurn: [], ...over,
  });

  describe("'arg' (default)", () => {
    const guard = confirmFirst();
    it('allows a call without the confirm flag (the probe)', () => {
      expect(guard.check(ctx({ args: {} }))).toBeNull();
    });
    it('denies confirmed:true with no prior-turn probe', () => {
      expect(guard.check(ctx({ args: { confirmed: true }, turnIndex: 0 }))).not.toBeNull();
    });
    it('allows confirmed:true after a prior-turn probe', () => {
      const probe: ObservedCall = { name: 'act', args: {}, ok: true, turnIndex: 0 };
      expect(guard.check(ctx({ args: { confirmed: true }, turnIndex: 1, observed: [probe] }))).toBeNull();
    });
  });

  describe("'prior-ask' (flag-less tools)", () => {
    const guard = confirmFirst({ mechanism: 'prior-ask' });
    it('denies on the opening turn (no prior askUser)', () => {
      expect(guard.check(ctx({ turnIndex: 0, observed: [] }))).not.toBeNull();
    });
    it('denies a later turn when the model never asked', () => {
      expect(guard.check(ctx({ turnIndex: 2, observed: [] }))).not.toBeNull();
    });
    it('allows the act after a prior-turn askUser', () => {
      const ask: ObservedCall = { name: 'askUser', args: {}, ok: true, turnIndex: 0 };
      expect(guard.check(ctx({ turnIndex: 1, observed: [ask] }))).toBeNull();
    });
    it('denies when the only askUser is THIS turn (composes with noActAfterAskSameTurn)', () => {
      const ask: ObservedCall = { name: 'askUser', args: {}, ok: true, turnIndex: 1 };
      expect(guard.check(ctx({ turnIndex: 1, observed: [ask] }))).not.toBeNull();
    });
  });
});
