/** The AgentSpec hierarchy + guard-binding semantics. */
import { describe, expect, it } from 'vitest';
import {
  AgentSpecMinimal,
  AgentSpecBase,
  AgentSpecFull,
  resolveBindings,
  resolveGuards,
  custom,
  precondition,
} from '../src/index.js';
import type { TrunkTheme } from '../src/index.js';

const persona = 'You are the plant-care agent: watering and repotting.';

const THEME: TrunkTheme = {
  voice: 'You are the assistant of a small business.',
  stateBlock: () => '',
  coreInvariants: ['Never invent data.'],
  languageClause: "## Output language (ABSOLUTE)\nReply in the user's language.",
};

describe('AgentSpecMinimal', () => {
  it('installs the minimal invariants', () => {
    const spec = new AgentSpecMinimal({ id: 'a', mode: 'M', persona, tools: ['water'] });
    expect(spec.guards.preTool.map((b) => b.id)).toContain('minimal:noDuplicateCall');
    expect(spec.guards.onReply.map((b) => b.id)).toContain('minimal:emptyReply');
  });

  it('rejects terminal tools in the surface', () => {
    expect(() => new AgentSpecMinimal({ id: 'a', mode: 'M', persona, tools: ['replyToUser'] })).toThrow(/terminal tools/);
  });

  it('requires a non-empty persona (persona-on-spec law)', () => {
    expect(() => new AgentSpecMinimal({ id: 'a', mode: 'M', persona: '  ', tools: [] })).toThrow(/persona/);
  });

  it('rejects a behavior-dim guard as a preTool gate', () => {
    const spec = new AgentSpecMinimal({ id: 'a', mode: 'M', persona, tools: ['water'] });
    const g = custom({ kind: 'x', dim: 'behavior', check: () => null, prose: () => 'x' });
    expect(() => spec.addGuard('preTool', ['water'], g)).toThrow(/cannot be a preTool gate/);
  });

  it('rejects duplicate guard ids', () => {
    const spec = new AgentSpecMinimal({ id: 'a', mode: 'M', persona, tools: ['water'] });
    const g = precondition(() => true, 'nope');
    spec.addGuard('preTool', ['water'], g, { id: 'agent:dup' });
    expect(() => spec.addGuard('preTool', ['water'], g, { id: 'agent:dup' })).toThrow(/already exists/);
  });

  it('stores the domain theme reference', () => {
    const spec = new AgentSpecMinimal({ id: 'a', mode: 'M', persona, tools: [], theme: THEME });
    expect(spec.theme).toBe(THEME);
  });

  it('is a pure guard set (no llm: kinds)', () => {
    const spec = new AgentSpecMinimal({ id: 'a', mode: 'M', persona, tools: [] });
    expect(spec.isPureGuardSet).toBe(true);
    spec.addReplyCheck(custom({ kind: 'llm:judge', dim: 'behavior', check: () => null, prose: () => 'x' }));
    expect(spec.isPureGuardSet).toBe(false);
  });
});

describe('AgentSpecBase (destructive protocol)', () => {
  it('installs confirmFirst + destructiveThrottle on destructive tools', () => {
    const spec = new AgentSpecBase({ id: 'b', mode: 'M', persona, tools: ['deleteItem'], destructiveTools: ['deleteItem'] });
    const ids = spec.guards.preTool.map((b) => b.id);
    expect(ids).toContain('base:confirmFirst');
    expect(ids).toContain('base:destructiveThrottle');
  });

  it('rejects destructive tools outside the surface', () => {
    expect(
      () => new AgentSpecBase({ id: 'b', mode: 'M', persona, tools: ['water'], destructiveTools: ['deleteItem'] }),
    ).toThrow(/not in the tool surface/);
  });
});

describe('AgentSpecFull (schema-auto layer)', () => {
  it('derives argRequired + argFormat from tool schemas', () => {
    const spec = new AgentSpecFull({
      id: 'f',
      mode: 'M',
      persona,
      tools: ['plant'],
      toolSchemas: { plant: { required: ['species'], properties: { code: { pattern: '^p\\d{3}$' } } } },
    });
    const ids = spec.guards.preTool.map((b) => b.id);
    expect(ids).toContain('full:argRequired:plant.species');
    expect(ids).toContain('full:argFormat:plant.code');
  });
});

describe('layer resolution (agent wins)', () => {
  it('sorts agent → full → base → minimal', () => {
    const spec = new AgentSpecBase({ id: 'l', mode: 'M', persona, tools: ['deleteItem'], destructiveTools: ['deleteItem'] });
    spec.addGuard('preTool', ['deleteItem'], precondition(() => true, 'agent gate'), { id: 'agent:gate' });
    const order = resolveBindings(spec.guards.preTool, 'deleteItem').map((b) => b.layer);
    expect(order[0]).toBe('agent');
    expect(order[order.length - 1]).toBe('minimal');
  });

  it('filters by tool target', () => {
    const spec = new AgentSpecMinimal({ id: 'l', mode: 'M', persona, tools: ['a', 'b'] });
    spec.addGuard('preTool', ['a'], precondition(() => true, 'only-a'), { id: 'agent:onlyA' });
    expect(resolveGuards(spec.guards.preTool, 'b').some((g) => g.kind === 'precondition')).toBe(false);
    expect(resolveGuards(spec.guards.preTool, 'a').some((g) => g.kind === 'precondition')).toBe(true);
  });
});
