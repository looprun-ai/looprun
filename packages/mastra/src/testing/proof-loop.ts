/**
 * The full-loop (L3) proof runners for the testing kit — the half that needs a framework backend.
 *
 * Each runner drives a real {@link runSpecConversation} loop: the {@link fakeLLM} scripted model against a
 * fresh {@link FixtureWorld}, on a spec built by the core kit ({@link buildIsolatedSpec} /
 * {@link buildCollectiveSpec}, which set the fixture theme). It then asserts the expected `recoveryEvents`
 * SIGNAL — the tag the runtime emits when a guard fires.
 *
 * recoveryEvents tag formats (from the @looprun-ai/core runtime): preTool veto `${dim}:${kind}:${tool}`,
 * onInput refusal `onInput:${kind}`, postTool report `output:${kind}:${tool}`, onReply redrive
 * `redrive:${kind}`, exhaustion `exhaustion-terminal`.
 */
import { requireMake } from '@looprun-ai/core/testing';
import { FixtureWorld, FIXTURE_TOOL_DEFS, FIXTURE_DOMAIN } from '@looprun-ai/core/testing';
import type { GuardProof, ProofLoopCase } from '@looprun-ai/core/testing';
import type { AgentSpec, RunResult, RuntimeTurnRecord } from '@looprun-ai/core';
import { runSpecConversation } from '../run-conversation.js';
import { fakeLLM } from './fake-llm.js';

/** L3 — drive the full runSpecConversation loop for a proof's loop case. The fixture theme rides on the
 *  spec (set by the core spec builders); `redrives` is overridable (default 1). The runtime's fixed
 *  veto-storm limit never trips these single-veto scripts. */
export function runProofLoop(spec: AgentSpec, l3: ProofLoopCase, redrives = 1): Promise<RunResult> {
  return runSpecConversation(spec, l3.turns, {
    model: fakeLLM(l3.script).model,
    modelParams: {},
    world: new FixtureWorld(l3.preset),
    toolDefs: FIXTURE_TOOL_DEFS,
    theme: FIXTURE_DOMAIN,
    redrives,
  });
}

/** The `recoveryEvents` tag we expect this proof's loop case to emit ('' for a clean pass). */
export function expectedSignal(proof: GuardProof, l3: ProofLoopCase): string {
  const kind = proof.guard;
  const tool = l3.tool ?? (Array.isArray(proof.target) ? proof.target[0] ?? '' : '');
  switch (l3.expect) {
    case 'veto': {
      const dim = requireMake(proof)().dim;
      return `${dim}:${kind}:${tool}`;
    }
    case 'redrive':
      // A postTool result invariant reports via `output:${kind}:${tool}` (then joins the redrive set);
      // an onReply guard redrives via `redrive:${kind}`.
      return proof.hook === 'postTool' ? `output:${kind}:${tool}` : `redrive:${kind}`;
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
