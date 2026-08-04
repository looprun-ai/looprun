/**
 * THE JUDGE CALL — how this backend drives the engine's lie check and the rewrite it gates.
 *
 * The engine composes both prompts and reads both answers; the backend only carries the call. It runs
 * on the SAME model and endpoint the turn ran on, and what makes that safe is ISOLATION: the call has
 * no persona, no tools, no memory, no history, and no knowledge that anything is pending. One prompt
 * in, the model's raw text out.
 */
import { stepCountIs } from 'ai';

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
