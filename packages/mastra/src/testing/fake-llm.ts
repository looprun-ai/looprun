/**
 * A script-driven LanguageModelV3 mock: each LLM call pops the next scripted step.
 *
 * Wraps `MockLanguageModelV3` from `ai/test` (the `ai` package is already a peer dependency of this
 * backend). A `ScriptStep` is one LLM response: a list of tool-calls and/or text parts.
 * `scriptedModel(script)` returns a model whose Nth generate() emits the Nth step (the last step repeats
 * once the script is exhausted), plus `calls()` and the raw `received` options for prompt inspection.
 * `fakeLLM` is a friendly alias.
 */
import { MockLanguageModelV3 } from 'ai/test';
import { JUDGE_INSTRUCTIONS } from '../judge.js';

export type ScriptPart = { tool: string; args: Record<string, unknown> } | { text: string };
export type ScriptStep = ScriptPart[];

export interface ScriptedModelOptions {
  /**
   * How this model answers the engine's JUDGE calls — the lie check and the rewrite it gates.
   *
   * Those calls are ENGINE machinery, not agent behaviour, so they never consume a script step and
   * never count as a call: a script says what the agent does, and stays readable when the engine
   * asks its own questions around it. The default answers NO, so the check finds nothing and the
   * agent's prose is delivered as written. Return `'YES'` from a judge to drive the rewrite.
   */
  judge?: (prompt: string) => string;
}

/** A judge call is the one that carries {@link JUDGE_INSTRUCTIONS} and nothing of the agent. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isJudgeCall(options: any): boolean {
  return JSON.stringify(options?.prompt ?? '').includes(JUDGE_INSTRUCTIONS);
}

export interface ScriptedModel {
  model: MockLanguageModelV3;
  calls: () => number;
  /** The raw call options seen by the model (prompt inspection). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  received: any[];
}

export function scriptedModel(script: ScriptStep[], options: ScriptedModelOptions = {}): ScriptedModel {
  let call = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const received: any[] = [];
  const answerJudge = options.judge ?? (() => 'NO');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const next = (opts: any) => {
    if (isJudgeCall(opts)) {
      const text = answerJudge(JSON.stringify(opts?.prompt ?? ''));
      return {
        content: [{ type: 'text', text } as const],
        finishReason: 'stop' as const,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        warnings: [] as never[],
      };
    }
    received.push(opts);
    const step = script[Math.min(call, script.length - 1)] ?? [{ text: '' }];
    call++;
    let id = 0;
    const content = step.map((p) =>
      'text' in p
        ? ({ type: 'text', text: p.text } as const)
        : ({
            type: 'tool-call',
            toolCallId: `c${call}-${id++}`,
            toolName: p.tool,
            input: JSON.stringify(p.args),
          } as const),
    );
    const finishReason = step.some((p) => 'tool' in p) ? ('tool-calls' as const) : ('stop' as const);
    return { content, finishReason, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [] as never[] };
  };

  const model = new MockLanguageModelV3({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doGenerate: (async (options: any) => next(options)) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doStream: async (options: any) => {
      const r = next(options);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts: any[] = [{ type: 'stream-start', warnings: [] }];
      let t = 0;
      for (const c of r.content) {
        if (c.type === 'text') {
          const tid = `t${++t}`;
          parts.push({ type: 'text-start', id: tid }, { type: 'text-delta', id: tid, delta: c.text }, { type: 'text-end', id: tid });
        } else {
          parts.push(c);
        }
      }
      parts.push({ type: 'finish', finishReason: r.finishReason, usage: r.usage });
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const p of parts) controller.enqueue(p);
            controller.close();
          },
        }),
      };
    },
  });

  return { model, calls: () => call, received };
}

/** Friendly alias for {@link scriptedModel}. */
export const fakeLLM = scriptedModel;
