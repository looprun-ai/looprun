/**
 * Trunk byte-stability (state-in-tail law): the scoped trunk is BYTE-IDENTICAL across renders and
 * across world-state mutations — volatile state never leaks into the system prompt.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, renderScopedSpecTrunk, precondition, requiresBefore } from '../src/index.js';
import type { AgentWorld, TrunkTheme } from '../src/index.js';

function fixtureWorld(state: Record<string, unknown> = {}): AgentWorld {
  return {
    exec: () => ({}),
    advanceTurn: () => {},
    ingestAttachment: (u: string) => u,
    toolCalls: [],
    sseActions: [],
    ...state,
  };
}

const THEME: TrunkTheme = {
  voice: 'You are the assistant of Fixture Plants, a small plant nursery.',
  stateBlock: (w) => `plan=${String(w.plan ?? 'starter')}`,
  coreInvariants: ['Never invent data — read it from a tool result.', 'Report failures honestly.'],
  languageClause: "## Output language (ABSOLUTE)\nReply in the user's language.",
};

function fixtureSpec() {
  const spec = new AgentSpecBase({
    id: 'fixture-care',
    mode: 'CARE',
    persona: 'You are the plant-care agent: watering, repotting and care plans.',
    tools: ['listPlants', 'waterPlant', 'repotPlant'],
    destructiveTools: ['repotPlant'],
    flow: [{ from: 'listPlants', to: 'waterPlant' }],
    behavior: ['Water before repotting when both are requested.'],
    directives: [{ id: 'd1', cond: 'plan=starter', directive: 'suggest the care plan upgrade once' }],
  });
  spec.addGuard('preTool', ['waterPlant'], requiresBefore(['listPlants']), { id: 'agent:waterAfterList' });
  spec.addGuard('preTool', ['repotPlant'], precondition((w) => w.plan === 'pro', 'Repotting needs the pro plan.'), {
    id: 'agent:repotPlan',
  });
  return spec;
}

describe('trunk byte-stability', () => {
  it('is byte-identical across renders and world mutations', () => {
    const spec = fixtureSpec();
    const a = renderScopedSpecTrunk(fixtureWorld({ plan: 'starter' }), spec, [], THEME);
    const b = renderScopedSpecTrunk(fixtureWorld({ plan: 'pro', extra: 42 }), spec, ['i901'], THEME);
    expect(a).toBe(b);
  });

  it('resolves the theme from spec.theme when none is passed', () => {
    const spec = new AgentSpecBase({
      id: 'fixture-care',
      mode: 'CARE',
      persona: 'You are the plant-care agent.',
      tools: ['listPlants'],
      theme: THEME,
    });
    const viaSpec = renderScopedSpecTrunk(fixtureWorld(), spec);
    const viaArg = renderScopedSpecTrunk(fixtureWorld(), spec, [], THEME);
    expect(viaSpec).toBe(viaArg);
  });

  it('throws without any theme', () => {
    const spec = fixtureSpec();
    expect(() => renderScopedSpecTrunk(fixtureWorld(), spec)).toThrow(/TrunkTheme/);
  });

  // The FROZEN baseline: any renderer change must be a conscious decision (this snapshot changes).
  it('matches the frozen baseline', () => {
    const trunk = renderScopedSpecTrunk(fixtureWorld(), fixtureSpec(), [], THEME);
    expect(trunk).toMatchInlineSnapshot(`
      "You are the assistant of Fixture Plants, a small plant nursery.

      ## Core rules (NEVER violate)
      - Never invent data — read it from a tool result.
      - Report failures honestly.

      ## Flow (call the tools in THIS order — do not skip a step)
      listPlants → waterPlant

      ## Global tool rules
      - never repeat a tool call that already succeeded with the same arguments.

      ## Tool rules
      - **waterPlant**: only after listPlants has run.
      - **repotPlant**: Repotting needs the pro plan.; destructive actions need confirmed:false first + the USER's explicit confirmation in a later turn; at most one destructive action per turn.

      ## Governance (deterministic — evaluate against the account state below)
      - IF plan=starter → suggest the care plan upgrade once

      ## Behavior
      - You are the plant-care agent: watering, repotting and care plans.
      - Water before repotting when both are requested.

      ## Output language (ABSOLUTE)
      Reply in the user's language."
    `);
  });
});
