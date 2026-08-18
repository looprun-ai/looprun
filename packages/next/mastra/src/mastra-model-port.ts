/** One generation step over the host framework, behind ModelPort.step — structurally
 *  unable to loop: tools carry no execute, one call in, one typed step out. Typed acts
 *  render as the provider's own tool-call/tool-result messages; a provider error is a
 *  TurnFailure whose detail is one line, never a stack. */
import { generateText, jsonSchema, tool,
  type JSONValue, type ModelMessage, type ToolChoice, type ToolSet } from 'ai';
import type { LanguageModel } from 'ai';
import { resolveModelConfig } from '@mastra/core/llm';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { Act, LlmParams, ModelStep, RawCall, StepInput } from '@looprun-ai/next-core';
import { TurnFailure } from '@looprun-ai/next-core';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function actMessages(acts: readonly Act[], base: number): ModelMessage[] {
  const calls = acts.map((a, i) => ({
    type: 'tool-call' as const, toolCallId: `act_${base + i}`,
    toolName: a.call.tool, input: a.call.args
  }));
  const results = acts.map((a, i) => ({
    type: 'tool-result' as const, toolCallId: `act_${base + i}`, toolName: a.call.tool,
    output: { type: 'json' as const,
      value: { sentence: a.sentence, status: a.status,
               result: a.result } as unknown as JSONValue }
  }));
  return [{ role: 'assistant', content: calls }, { role: 'tool', content: results }];
}

function toMessages(messages: StepInput['messages']): ModelMessage[] {
  const out: ModelMessage[] = [];
  let actCount = 0;
  for (const m of messages) {
    if (m.role === 'acts') {
      out.push(...actMessages(m.acts, actCount));
      actCount += m.acts.length;
    } else {
      out.push({ role: m.role, content: m.text });
    }
  }
  return out;
}

export class MastraModelPort {
  private readonly resolved: Promise<LanguageModel>;
  private readonly params: LlmParams;

  constructor(model: MastraModelConfig, params: LlmParams) {
    this.resolved = resolveModelConfig(model).then(m => {
      if ((m as { specificationVersion?: string }).specificationVersion === 'v1') {
        throw new TurnFailure('construction', 'legacy v1 language models are unsupported');
      }
      return m as unknown as LanguageModel;
    });
    this.params = params;
  }

  async step(input: StepInput): Promise<ModelStep> {
    const model = await this.resolved.catch((e: unknown) => {
      throw new TurnFailure('construction', firstLine(e));
    });
    const tools: ToolSet = Object.fromEntries(input.tools.map(c =>
      [c.name, tool({ description: c.does, inputSchema: jsonSchema(c.schema as object) })]));
    const finishName = input.tools.at(-1)?.name;
    const toolChoice: ToolChoice<ToolSet> = input.forceFinish && finishName !== undefined
      ? { type: 'tool', toolName: finishName } : 'auto';
    // Per-field merge: the constructor carries the spec card's params; the engine's
    // own word for this step (the seat's brakes included) wins.
    const params: LlmParams = { ...this.params, ...input.llmParams };
    try {
      const r = await generateText({
        model, system: input.system, messages: toMessages(input.messages), tools, toolChoice,
        temperature: params.temperature, topP: params.topP,
        maxOutputTokens: params.maxOutputTokens,
        ...(params.preset === 'gemini:thinking-off'
          ? { providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } } } : {})
      });
      const calls: RawCall[] = r.toolCalls.map(c => ({
        tool: c.toolName, args: isRecord(c.input) ? c.input : {}
      }));
      return { calls, text: r.text };
    } catch (e: unknown) {
      throw new TurnFailure('network', firstLine(e));
    }
  }
}

function firstLine(e: unknown): string {
  const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'provider call failed';
  return message.split('\n')[0];
}
