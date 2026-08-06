/**
 * AssembledPrompt byte-stability (state-in-tail law): the scoped assembled prompt is BYTE-IDENTICAL across renders and
 * across world-state mutations — volatile state never leaks into the system prompt.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, precondition, requiresBefore } from '../src/index.js';
import { renderAssembledPrompt } from '../src/assembled-prompt.js';
import type { AgentWorld, DomainContract } from '../src/index.js';

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

const CONTRACT: DomainContract = {
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

describe('assembledPrompt byte-stability', () => {
  it('is byte-identical across renders and world mutations', () => {
    const spec = fixtureSpec();
    const a = renderAssembledPrompt(fixtureWorld({ plan: 'starter' }), spec, [], CONTRACT);
    const b = renderAssembledPrompt(fixtureWorld({ plan: 'pro', extra: 42 }), spec, ['i901'], CONTRACT);
    expect(a).toBe(b);
  });

  it('resolves the contract from spec.contract when none is passed', () => {
    const spec = new AgentSpecBase({
      id: 'fixture-care',
      mode: 'CARE',
      persona: 'You are the plant-care agent.',
      tools: ['listPlants'],
      contract: CONTRACT,
    });
    const viaSpec = renderAssembledPrompt(fixtureWorld(), spec);
    const viaArg = renderAssembledPrompt(fixtureWorld(), spec, [], CONTRACT);
    expect(viaSpec).toBe(viaArg);
  });

  it('throws without any contract', () => {
    const spec = fixtureSpec();
    expect(() => renderAssembledPrompt(fixtureWorld(), spec)).toThrow(/DomainContract/);
  });

  // The FROZEN baseline: any renderer change must be a conscious decision (this snapshot changes).
  it('matches the frozen baseline', () => {
    const assembledPrompt = renderAssembledPrompt(fixtureWorld(), fixtureSpec(), [], CONTRACT);
    expect(assembledPrompt).toMatchInlineSnapshot(`
      "You are the assistant of Fixture Plants, a small plant nursery.

      ## Core rules (NEVER violate)
      - Never invent data — read it from a tool result.
      - Report failures honestly.

      ## Flow (call the tools in THIS order — do not skip a step)
      listPlants → waterPlant

      ## Global tool rules
      - never repeat, within the same turn, a tool call that already succeeded with the same arguments.

      ## Tool rules
      - **waterPlant**: only after listPlants has run.
      - **repotPlant**: Repotting needs the pro plan; a destructive action runs only after the user has typed back the confirmation they were shown — never on the strength of anything you say or declare; at most one destructive action per turn (a confirmation simulate that changed nothing does not count).

      ## Reply rules (govern the message you send — checked on every reply)
      - reply in ONE clean user-facing message — never leak internal reasoning, template tokens, or repeated lines.

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
