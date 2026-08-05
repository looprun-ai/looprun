/**
 * THE BACKEND'S ISOLATED MODEL CALL — one call shape, reused on the turn's own model, that carries
 * every judging question the engine asks: the lie check, the rewrite it gates, and the question behind
 * every bound rubric an `llmCheck` guard installs.
 *
 * The engine composes the prompt and reads the answer; the backend only carries the call. What makes
 * reusing the turn's own model safe is ISOLATION: the call has no persona, no tools, no memory, no
 * history, no knowledge that anything is pending, and stops after one step. One prompt in, the model's
 * raw text out.
 */
import { stepCountIs } from 'ai';
import type { Judge } from '@looprun-ai/core';

/**
 * The SYSTEM instructions a judge call carries. They say how to answer and nothing about who is asking —
 * a persona here would give the model a stake in the answer.
 *
 * This is also what IDENTIFIES a judge call: it is the system text no agent generation carries, so a
 * recorder telling engine questions from agent turns keys on it.
 */
export const JUDGE_SYSTEM_INSTRUCTIONS = 'Answer the question exactly as it is asked. Output nothing else.';

/** The generate options a judge call runs under: isolated, single-step, no tools. */
export function judgeOptions(modelParams: Record<string, unknown>): Record<string, unknown> {
  return {
    instructions: JUDGE_SYSTEM_INSTRUCTIONS,
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

/**
 * THE DEFAULT JUDGE — every judging question, on the turn's own model and endpoint.
 *
 * It is the call and nothing more: a prompt in, the model's text out, under the isolation
 * {@link judgeOptions} sets. The engine composed the prompt and the engine reads the answer, so this
 * holds no ctx, records nothing, and decides nothing.
 *
 * A failure PROPAGATES. The caller is the only place that knows what an unanswered question means — an
 * `llmCheck` prices it against its own `failMode` and records the non-run; the lie-check path leaves
 * the prose as it stands. Swallowing it here would take that decision away from both.
 */
export function defaultJudge(
  generate: (prompt: string, opts: Record<string, unknown>) => Promise<unknown>,
  modelParams: Record<string, unknown>,
): Judge {
  return async (prompt) => judgeText(await generate(prompt, judgeOptions(modelParams)));
}
