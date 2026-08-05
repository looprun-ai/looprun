/**
 * THE BACKEND'S ISOLATED MODEL CALL — one call shape, reused on the turn's own model, that carries two
 * things the engine composes and reads: the lie check and the rewrite it gates, and the adjudicator
 * behind every bound rubric an `llmCheck` guard installs.
 *
 * The engine composes the prompt and reads the answer; the backend only carries the call. What makes
 * reusing the turn's own model safe is ISOLATION: the call has no persona, no tools, no memory, no
 * history, no knowledge that anything is pending, and stops after one step. One prompt in, the model's
 * raw text out.
 */
import { stepCountIs } from 'ai';
import { adjudicationPrompt, readAdjudicationVerdict } from '@looprun-ai/core/internal';
import type { Adjudicator } from '@looprun-ai/core';

/**
 * The only instructions a judge call carries. They say how to answer and nothing about who is asking —
 * a persona here would give the model a stake in the answer.
 */
export const JUDGE_INSTRUCTIONS = 'Answer the question exactly as it is asked. Output nothing else.';

/** The generate options a judge call runs under: isolated, single-step, no tools. */
export function judgeOptions(modelParams: Record<string, unknown>): Record<string, unknown> {
  return {
    instructions: JUDGE_INSTRUCTIONS,
    activeTools: [],
    toolChoice: 'none',
    stopWhen: [stepCountIs(1)],
    ...modelParams,
  };
}

/** Read the answer out of a generate result. A result with no text answers nothing, which the engine
 *  reads as "no lie found" — the safe direction, since the rewrite it would trigger can deny a real act. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function judgeText(result: any): string {
  return typeof result?.text === 'string' ? result.text : '';
}

/** The correction a non-run appends. It says the call did not answer — which is not what
 *  `llmcheck-unreachable:<failMode>` says: that one records a guard applying its failMode to a
 *  rejection, and an adjudicator knows nothing about failMode. Left unrecorded, an outage and a clean
 *  session are the same observation. */
export const ADJUDICATOR_UNREACHABLE = 'adjudicator-unreachable';

/** The correction appended when the call answered but the answer was not a legible verdict — neither
 *  `NONE` nor a named `VIOLATION: <reason>`. This is not `adjudicator-unreachable`: the call reached
 *  the model and got text back, it just did not get a verdict the rubric's contract recognises. Left
 *  unrecorded, a shrug and an honest "no violation found" are the same observation. */
export const ADJUDICATOR_UNREADABLE = 'adjudicator-unreadable';

/**
 * THE DEFAULT ADJUDICATOR — every bound rubric, on the turn's own model and endpoint.
 *
 * The engine composes the prompt and reads the answer; this carries the call, under the same isolation
 * the lie check's judge runs under. It SETTLES on every path: a refused endpoint, a spent quota, a hung
 * call, an empty answer and an unreadable one all come back as no violation. A deny drives a redrive
 * and, on exhaustion, replaces the model's answer with the engine's closure — so treating any of those
 * as a detection would convert every reply in the session into a closure, one broken call at a time.
 *
 * The two ways of settling without a verdict are recorded under different names, so neither is mistaken
 * for the other or for an honest approval: a call that threw, rejected, or answered empty appends
 * `adjudicator-unreachable`; a call that answered, but not with `NONE` or a named `VIOLATION:`, appends
 * `adjudicator-unreadable`. A readable answer naming no violation appends nothing.
 *
 * Because it never rejects, `failMode` never fires from it. A domain that needs an outage to DENY
 * registers its own adjudicator, one that rejects, and `failMode` prices it as written.
 */
export function defaultAdjudicator(
  generate: (prompt: string, opts: Record<string, unknown>) => Promise<unknown>,
  modelParams: Record<string, unknown>,
): Adjudicator {
  return async (rubric, ctx) => {
    let text: string;
    try {
      text = judgeText(await generate(adjudicationPrompt(rubric, ctx), judgeOptions(modelParams)));
    } catch {
      ctx.notes?.push(ADJUDICATOR_UNREACHABLE);
      return { violation: null };
    }
    if (!text.trim()) {
      ctx.notes?.push(ADJUDICATOR_UNREACHABLE);
      return { violation: null };
    }
    const { violation, readable } = readAdjudicationVerdict(text);
    if (!readable) ctx.notes?.push(ADJUDICATOR_UNREADABLE);
    return { violation };
  };
}
