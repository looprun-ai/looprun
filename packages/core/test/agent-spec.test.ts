/** The ONE AgentSpec class + guard-binding semantics (the Minimal/Base/Full ladder is collapsed). */
import { describe, expect, it } from 'vitest';
import {
  AgentSpecBase,
  resolveBindings,
  resolveGuards,
  custom,
  precondition,
  destructiveClaimRequiresSuccess,
} from '../src/index.js';
import type { AgentWorld, GuardCtx, TrunkTheme } from '../src/index.js';

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

describe('destructiveClaimRequiresSuccess — offer-aware, sentence-scoped (P8a)', () => {
  // English lexicon injected by the caller (the runtime carries none).
  const CLAIM = /\b(deleted|removed|cancelled)\b/i;
  const ASK = /\?|\b(confirm|are you sure|do you want|shall i|proceed|go ahead)\b/i;
  const OFFER = /\b(want me to|shall i|i can|would you like me to|if you(?:'d| would) like)\b/i;
  const guard = destructiveClaimRequiresSuccess(['deleteItem'], { claimRe: CLAIM, askRe: ASK, offerRe: OFFER });

  const ctx = (reply: string): GuardCtx => ({
    args: {}, world: fixtureWorld(), observed: [], turnIndex: 0, reply, producedThisTurn: [],
  });

  it('fires on a bare declarative deletion claim with no successful destructive call', () => {
    expect(guard.check(ctx('The item was deleted.'))).not.toBeNull();
  });

  it('does NOT fire when the destructive verb is only OFFERED (same sentence)', () => {
    expect(guard.check(ctx('I can delete it — want me to remove the record?'))).toBeNull();
  });

  it('an earlier offer sentence cannot mask a later declarative claim', () => {
    // Sentence-scoped: the offer sentence is exempt, but the standalone declarative claim still fires.
    expect(guard.check(ctx('Want me to help? The record was deleted.'))).not.toBeNull();
  });

  it('does not fire when the destructive tool succeeded with confirmed:true this turn', () => {
    const withOk: GuardCtx = {
      ...ctx('The item was deleted.'),
      observed: [{ name: 'deleteItem', args: { confirmed: true }, ok: true, turnIndex: 0 }],
    };
    expect(guard.check(withOk)).toBeNull();
  });
});
