/**
 * The ungoverned-arm strip. Same bundle minus the FULL governance surface:
 * `guards` ∪ `controls.directives` ∪ `controls.chains` ∪ `scope` ∪ `behavior[]` ∪ the
 * contract's `coreInvariants` are EMPTIED. What stays shared is only persona, the domain
 * voice, the tool surface, and pure loop mechanics (terminal policy, maxSteps, sampling).
 * Never mutates the source spec/contract — returns fresh plain objects.
 */
import type { AgentSpec, DomainContract } from '@looprun-ai/core';

export interface UngovernedBundle {
  spec: AgentSpec;
  contract: DomainContract;
}

export function stripGovernance(spec: AgentSpec, contract: DomainContract): UngovernedBundle {
  const { directives: _d, chains: _c, exhaustionReply: _e, ...loopControls } = spec.controls;
  const strippedSpec: AgentSpec = {
    id: spec.id,
    mode: spec.mode,
    persona: spec.persona,
    // scope: omitted (emptied)
    surface: { tools: [...spec.surface.tools], systemPrompt: spec.surface.systemPrompt },
    flow: [...spec.flow],
    guards: { onInput: [], preTool: [], postTool: [], onReply: [], onReplyMutate: [] },
    controls: { ...loopControls },
    behavior: [],
    // assertDestructiveConfirmable: omitted — the destructive-confirm cross-check is governance
  };
  const strippedContract: DomainContract = {
    voice: contract.voice,
    stateBlock: contract.stateBlock.bind(contract),
    coreInvariants: [],
    languageClause: contract.languageClause,
  };
  strippedSpec.contract = strippedContract;
  return { spec: strippedSpec, contract: strippedContract };
}
