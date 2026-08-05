/** The ONE AgentSpec class + guard-binding semantics (the Minimal/Base/Full ladder is collapsed). */
import { describe, expect, it } from 'vitest';
import {
  AgentSpecBase,
  custom,
  precondition,
  confirmFirst,
} from '../src/index.js';
import { resolveBindings, resolveGuards } from '../src/spec.js';
import type { AgentWorld, GuardCtx, ObservedCall, DomainContract } from '../src/index.js';

const persona = 'You are the plant-care agent: watering and repotting.';

const CONTRACT: DomainContract = {
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
    expect(spec.guards.onReply.map((b) => b.id)).toContain('minimal:degenerationGuard');
  });

  it('a non-destructive spec installs ONLY the minimal layer (no base:* ids)', () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['water'] });
    expect(spec.guards.preTool.map((b) => b.id)).toEqual(['minimal:noDuplicateCall']);
    expect(spec.guards.preTool.every((b) => !b.id.startsWith('base:'))).toBe(true);
  });

  it('rejects terminal tools in the surface', () => {
    expect(() => new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['respond'] })).toThrow(/terminal tools/);
  });

  it('requires a non-empty persona (persona-on-spec law)', () => {
    expect(() => new AgentSpecBase({ id: 'a', mode: 'M', persona: '  ', tools: [] })).toThrow(/persona/);
  });

  it('rejects a behavior-dim guard as a preTool gate', () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['water'] });
    const g = custom({ kind: 'x', dim: 'behavior', check: () => null, prose: () => 'x' });
    expect(() => spec.addGuard('preTool', ['water'], g)).toThrow(/cannot be installed on 'preTool'/);
  });

  it('rejects duplicate guard ids', () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['water'] });
    const g = precondition(() => true, 'nope');
    spec.addGuard('preTool', ['water'], g, { id: 'agent:dup' });
    expect(() => spec.addGuard('preTool', ['water'], g, { id: 'agent:dup' })).toThrow(/already exists/);
  });

  it('stores the domain contract reference', () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: [], contract: CONTRACT });
    expect(spec.contract).toBe(CONTRACT);
  });

  it('m10 — rejects an outcome map that SHADOWS a core outcome word (any casing) at load', () => {
    const shadow = (outcomes: Record<string, 'success' | 'failure'>) =>
      new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: [], contract: { ...CONTRACT, outcomes } });
    // A core outcome always means itself, so a map entry keyed by one is silently ignored at resolution —
    // except in a casing `resolveOutcome` does not treat as core, where it would REDEFINE the word.
    expect(() => shadow({ Success: 'failure' })).toThrow(/Success/);
    expect(() => shadow({ NOT_FOUND: 'success' })).toThrow(/outcome/i);
    expect(() => shadow({ success: 'success' })).toThrow(/success/);
    expect(() => shadow({ settled: 'success' })).not.toThrow();
  });

  it('rejects a reply-only terminal policy on a spec that owns a destructive tool, at load', () => {
    const build = (over: { terminal?: () => boolean; destructiveTools?: string[] }) =>
      new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['deleteAccount'], ...over } as never);
    // Reply-only forbids the model from declaring an `ask`; confirmFirst's ask arm and
    // pendingConfirmMustAsk require one before a destructive act is licensed. A spec carrying both
    // hands the model a prompt that forbids what its own guards demand.
    expect(() => build({ terminal: () => true, destructiveTools: ['deleteAccount'] })).toThrow(/deleteAccount/);
    expect(() => build({ terminal: () => true, destructiveTools: ['deleteAccount'] })).toThrow(/reply-only/i);
    // Either alone is legal: a reply-only read surface, or a destructive spec that may ask.
    expect(() => build({ terminal: () => true })).not.toThrow();
    expect(() => build({ destructiveTools: ['deleteAccount'] })).not.toThrow();
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
    // minimal installs first, then base.
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

describe('AgentSpecBase — minimal onReply layer (no-regex law)', () => {
  it('installs exactly degenerationGuard — the empty-reply floor is the ENGINE FLOOR in finalizeReply, not a guard and not the schema', () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona, tools: ['x'] });
    expect(spec.guards.onReply.map((b) => b.id)).toEqual(['minimal:degenerationGuard']);
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

describe('destructiveLabels — the question a recordless act asks', () => {
  const base = {
    id: 'a',
    mode: 'M',
    persona: 'You are the test agent.',
    surface: { tools: ['deleteAllData', 'deleteEverything'] },
    tools: ['deleteAllData', 'deleteEverything'],
  };

  it('rejects a label for a tool that is not destructive', () => {
    expect(
      () =>
        new AgentSpecBase({
          ...base,
          destructiveTools: ['deleteAllData'],
          destructiveLabels: { deleteEverything: 'delete everything' },
        }),
    ).toThrow(/not in destructiveTools/);
  });

  it('rejects two labels whose derived tokens collide', () => {
    expect(
      () =>
        new AgentSpecBase({
          ...base,
          destructiveTools: ['deleteAllData', 'deleteEverything'],
          destructiveLabels: {
            deleteAllData: 'delete all of your data',
            deleteEverything: 'delete all of your bookings',
          },
        }),
    ).toThrow(/CONFIRM DELETE-ALL/);
  });

  it('accepts labels whose derived tokens differ', () => {
    expect(
      () =>
        new AgentSpecBase({
          ...base,
          destructiveTools: ['deleteAllData', 'deleteEverything'],
          destructiveLabels: {
            deleteAllData: 'delete all of your data',
            deleteEverything: 'close your account',
          },
        }),
    ).not.toThrow();
  });
});
