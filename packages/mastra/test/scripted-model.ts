/** A script-driven LanguageModelV3 mock: each LLM call pops the next scripted step. */
import { MockLanguageModelV3 } from 'ai/test';

export type ScriptPart = { tool: string; args: Record<string, unknown> } | { text: string };
export type ScriptStep = ScriptPart[];

export interface ScriptedModel {
  model: MockLanguageModelV3;
  calls: () => number;
  /** The raw call options seen by the model (prompt inspection). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  received: any[];
}

export function scriptedModel(script: ScriptStep[]): ScriptedModel {
  let call = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const received: any[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const next = (options: any) => {
    received.push(options);
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
