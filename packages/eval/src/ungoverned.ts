/**
 * The ungoverned-arm strip — PROSE-ONLY baseline: the SAME agent with the SAME system
 * prompt (byte-identical to the governed arm — every rule rendered as prose), run with the
 * enforcement layer disarmed. What is removed is only the CHECKS: guard hooks (veto /
 * redrive / deny), egress mutators, `controls.chains`, `controls.exhaustionReply`, and the
 * destructive cross-check. `governed − ungoverned` therefore measures the deterministic-
 * enforcement premium over a well-prompted agent — not "rules exist vs. rules don't".
 *
 * Mechanically: the stripped spec's `surface.systemPrompt` is a closure over the FULL
 * original spec + contract (`renderScopedSpecTrunk`), which the runtime honors as the
 * prompt override; the spec fields that drive the loop are emptied. Never mutates the
 * source spec/contract — returns fresh plain objects.
 *
 * THE TERMINAL SURFACE IS IDENTICAL BY CONSTRUCTION (MI-T5). The `respond` schema — `did` with its
 * minimum of one intention, the speech/action vocabulary, the `inform` guardrail — and the terminal
 * protocol prose are RUNTIME-owned (`terminalToolDefs` / `terminalProtocol`), so neither arm can
 * carry more or less of them than the other; `controls.terminal` (the reply-only policy that decides
 * which protocol variant renders) is preserved above with the rest of `loopControls`. The ungoverned
 * arm is therefore a fully-instructed agent — it is TOLD to declare its intentions honestly, it is
 * simply never CHECKED.
 */
import { renderScopedSpecTrunk } from '@looprun-ai/core/internal';
import type { AgentSpec, DomainContract } from '@looprun-ai/core';

export interface UngovernedBundle {
  spec: AgentSpec;
  contract: DomainContract;
}

export function stripGovernance(spec: AgentSpec, contract: DomainContract): UngovernedBundle {
  const { chains: _c, exhaustionReply: _e, ...loopControls } = spec.controls;
  const strippedContract: DomainContract = {
    voice: contract.voice,
    stateBlock: contract.stateBlock.bind(contract),
    coreInvariants: [...contract.coreInvariants],
    languageClause: contract.languageClause,
    // exhaustionReply: omitted — fallback of the redrive mechanism; without redrive it does not exist.
    // RENDERING SEAM KEPT (structure, not enforcement): the engine composes the delivered reply from the
    // structured `respond` (message + the operation report rendered from `did`), so preserving the domain
    // `renderClaim` / `outcomes` / `writeTools` keeps the DELIVERED text byte-faithful to the governed arm —
    // only the guard CHECKS are disarmed (the empty guard arrays below), never the reply-assembly shape.
    ...(contract.renderClaim ? { renderClaim: contract.renderClaim } : {}),
    ...(contract.outcomes ? { outcomes: contract.outcomes } : {}),
    ...(contract.writeTools ? { writeTools: [...contract.writeTools] } : {}),
  };
  const strippedSpec: AgentSpec = {
    id: spec.id,
    mode: spec.mode,
    persona: spec.persona,
    ...(spec.scope ? { scope: spec.scope } : {}),
    surface: {
      tools: [...spec.surface.tools],
      // PROMPT VIEW: the governed trunk, byte for byte. A pre-existing override is the
      // governed arm's own prompt already — reuse it; otherwise close over the FULL spec.
      systemPrompt:
        spec.surface.systemPrompt ??
        ((w, u = []) => renderScopedSpecTrunk(w, spec, u, contract)),
    },
    flow: [...spec.flow],
    // LOOP VIEW: enforcement disarmed.
    guards: { onInput: [], preTool: [], postTool: [], onReply: [], onReplyMutate: [] },
    controls: { ...loopControls },
    behavior: [...spec.behavior],
    // assertDestructiveConfirmable: omitted — the destructive-confirm cross-check is a check
  };
  strippedSpec.contract = strippedContract;
  return { spec: strippedSpec, contract: strippedContract };
}
