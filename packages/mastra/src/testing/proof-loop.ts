/**
 * The full-loop (L3) proof runners for the testing kit — the half that needs a framework backend.
 *
 * Each runner drives a real {@link runSpecConversation} loop: the {@link fakeLLM} scripted model against a
 * fresh {@link FixtureWorld}, on a spec built by the core kit ({@link buildIsolatedSpec} /
 * {@link buildCollectiveSpec}, which set the fixture contract). It then asserts the expected `recoveryEvents`
 * SIGNAL — the tag the runtime emits when a guard fires.
 *
 * recoveryEvents tag formats (from the @looprun-ai/core runtime): preTool veto `${dim}:${kind}:${tool}`,
 * onInput refusal `onInput:${kind}`, postTool report `output:${kind}:${tool}`, onReply redrive
 * `redrive:${kind}`, exhaustion `exhaustion-terminal`.
 */
import { requireMake } from '@looprun-ai/core/testing';
import { FixtureWorld, FIXTURE_TOOL_DEFS, FIXTURE_DOMAIN } from '@looprun-ai/core/testing';
import type { GuardProof, ProofLoopCase } from '@looprun-ai/core/testing';
import type { AgentSpec, RunResult } from '@looprun-ai/core';
import type { RuntimeTurnRecord } from '@looprun-ai/core/internal';
import { runSpecConversation } from '../run-conversation.js';
import { fakeLLM } from './fake-llm.js';

/** L3 — drive the full runSpecConversation loop for a proof's loop case. The fixture contract rides on the
 *  spec (set by the core spec builders); `redrives` is overridable (default 1). The runtime's fixed
 *  veto-storm limit never trips these single-veto scripts. */
export function runProofLoop(spec: AgentSpec, l3: ProofLoopCase, redrives = 1): Promise<RunResult> {
  return runSpecConversation(spec, l3.turns, {
    model: fakeLLM(l3.script).model,
    modelParams: {},
    world: new FixtureWorld(l3.preset),
    toolDefs: FIXTURE_TOOL_DEFS,
    contract: FIXTURE_DOMAIN,
    redrives,
    // ONLY the llmCheck proof sets this — its guard delegates to a host judge (assertJudgePresent
    // demands one is registered). Every other proof leaves it undefined.
    ...(l3.judge ? { judge: l3.judge } : {}),
  });
}

/** The `recoveryEvents` tag we expect this proof's loop case to emit ('' for a clean pass). */
export function expectedSignal(proof: GuardProof, l3: ProofLoopCase): string {
  // The RUNTIME kind, read off the instantiated guard — not the factory name. The recoveryEvents tag
  // the runtime writes is `guard.kind`, so that is what this must expect, and a factory whose name
  // differs from the kind it produces would otherwise be asserted against a tag nothing writes.
  const kind = requireMake(proof)().kind;
  const tool = l3.tool ?? (Array.isArray(proof.target) ? proof.target[0] ?? '' : '');
  switch (l3.expect) {
    case 'veto': {
      const dim = requireMake(proof)().dim;
      return `${dim}:${kind}:${tool}`;
    }
    case 'downgrade':
      // A consent-denied act on a simulatable tool re-runs as its own simulation; the attempt is
      // logged under this tag and the turn proceeds — neither a veto nor a clean pass.
      return `downgrade:${kind}:${tool}`;
    case 'redrive':
      // A postTool result invariant reports via `output:${kind}:${tool}` (then joins the redrive set);
      // an onReply guard redrives via `redrive:${kind}`.
      return proof.hook === 'postTool' ? `output:${kind}:${tool}` : `redrive:${kind}`;
    case 'rewrite':
      // The outcome a fired lie question takes on a turn that carried out nothing. It is neither a veto
      // nor a redrive: the prose is corrected and delivered, and the turn ends clean.
      return 'lie-check:rewritten';
    case 'refusal':
      return `onInput:${kind}`;
    case 'pass':
    default:
      return '';
  }
}

/** Pick the turnRecord a loop case asserts on (l3.turn, default the last). */
export function pickRecord(res: RunResult, l3: ProofLoopCase): RuntimeTurnRecord | undefined {
  const idx = l3.turn ?? res.turnRecords.length - 1;
  return res.turnRecords[idx];
}

/** Assert the expected signal is present in a turnRecord's recoveryEvents. Returns a verdict + detail. */
export function assertSignal(
  record: RuntimeTurnRecord | undefined,
  proof: GuardProof,
  l3: ProofLoopCase,
): { ok: boolean; detail: string } {
  if (!record) return { ok: false, detail: 'no turnRecord to assert on' };
  const events = record.recoveryEvents ?? [];
  if (l3.expect === 'pass') {
    const ok = events.length === 0;
    return { ok, detail: ok ? 'clean pass (no recovery events)' : `expected no recovery events, got: [${events.join(', ')}]` };
  }
  const sig = expectedSignal(proof, l3);
  const ok = events.includes(sig);
  return { ok, detail: ok ? `found '${sig}'` : `expected '${sig}' in recoveryEvents, got: [${events.join(', ')}]` };
}
