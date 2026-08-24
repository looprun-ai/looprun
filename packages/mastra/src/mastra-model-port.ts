/** One generation step over the host framework, behind ModelPort.step — structurally
 *  unable to loop: tools carry no execute, one call in, one typed step out. Typed acts
 *  render as the provider's own tool-call/tool-result messages; a provider error is a
 *  TurnFailure whose detail is one line, never a stack. */
import { generateText, jsonSchema, tool,
  type JSONValue, type ModelMessage, type ToolChoice, type ToolSet } from 'ai';
import type { LanguageModel } from 'ai';
import { resolveModelConfig } from '@mastra/core/llm';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { Act, LlmParams, ModelStep, RawCall, StepInput } from '@looprun-ai/core';
import { TurnFailure } from '@looprun-ai/core';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The identity of one step's model calls — the key the signature cache joins on. */
function callsKey(calls: readonly { tool: string; args: unknown }[]): string {
  return JSON.stringify(calls.map(c => [c.tool, c.args]));
}

interface ToolCallPartLike { type: string; toolCallId: string; toolName: string }

function resultValue(a: Act): JSONValue {
  return { sentence: a.sentence, status: a.status,
           result: a.result } as unknown as JSONValue;
}

/** Acts render in the provider's own dialect. A step the MODEL made replays the
 *  provider's ORIGINAL assistant message — its tool-call ids and its reasoning
 *  signatures ride along, which providers demanding a thought signature require.
 *  An engine-origin act (a licensed execution) has no model call to replay, so
 *  it rides as a compact user-visible record line. */
function actMessages(acts: readonly Act[], base: number,
                     replay: ReadonlyMap<string, ModelMessage>): ModelMessage[] {
  const modelActs = acts.filter(a => a.origin === 'model');
  const engineActs = acts.filter(a => a.origin !== 'model');
  const out: ModelMessage[] = [];
  if (engineActs.length > 0) {
    out.push({ role: 'user', content: engineActs.map(a =>
      `[record] ${a.sentence}\n${JSON.stringify(a.result)}`).join('\n') });
  }
  void base;
  if (modelActs.length === 0) return out;
  const cached = replay.get(callsKey(modelActs.map(a => ({ tool: a.call.tool, args: a.call.args }))));
  if (cached !== undefined && Array.isArray(cached.content)) {
    const parts = (cached.content as ToolCallPartLike[]).filter(p => p.type === 'tool-call');
    if (parts.length === modelActs.length) {
      out.push(cached);
      out.push({ role: 'tool', content: modelActs.map((a, i) => ({
        type: 'tool-result' as const, toolCallId: parts[i].toolCallId,
        toolName: parts[i].toolName, output: { type: 'json' as const, value: resultValue(a) }
      })) });
      return out;
    }
  }
  // No original assistant message to replay — a synthetic functionCall would
  // arrive without its reasoning signature, which strict providers reject. The
  // acts ride as record lines instead.
  out.push({ role: 'user', content: modelActs.map(a =>
    `[record] ${a.sentence}\n${JSON.stringify(a.result)}`).join('\n') });
  return out;
}

function toMessages(messages: StepInput['messages'],
                    replay: ReadonlyMap<string, ModelMessage>): ModelMessage[] {
  const out: ModelMessage[] = [];
  let actCount = 0;
  for (const m of messages) {
    if (m.role === 'acts') {
      out.push(...actMessages(m.acts, actCount, replay));
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
  /** The provider's own assistant messages, keyed by the calls they carried —
   *  replayed so reasoning signatures survive the engine's typed record. */
  private readonly replay = new Map<string, ModelMessage>();

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
      // THINKING IS OFF BY DEFAULT. A governed turn is priced and measured on the
      // tokens the record carries; thought tokens are billed as output and serve
      // no guarantee, so the engine spends none unless the spec's llmParams says
      // `preset: 'gemini:thinking-on'` — explicitly, per desk.
      const r = await generateText({
        model, system: input.system, messages: toMessages(input.messages, this.replay),
        tools, toolChoice,
        temperature: params.temperature, topP: params.topP,
        maxOutputTokens: params.maxOutputTokens,
        ...(params.preset === 'gemini:thinking-on'
          ? {} : { providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } } })
      });
      const calls: RawCall[] = r.toolCalls.map(c => ({
        tool: c.toolName, args: isRecord(c.input) ? c.input : {}
      }));
      if (calls.length > 0) {
        const assistant = r.response.messages.find(m => m.role === 'assistant');
        if (assistant !== undefined) this.replay.set(callsKey(calls), assistant);
      }
      const tokenCount = (v: unknown): number => typeof v === 'number' ? v
        : isRecord(v) && typeof v.total === 'number' ? v.total : 0;
      const details = (r.usage as { outputTokenDetails?: { reasoningTokens?: number } })
        .outputTokenDetails;
      const usage = {
        inputTokens: tokenCount(r.usage.inputTokens),
        outputTokens: tokenCount(r.usage.outputTokens),
        cachedInputTokens: tokenCount(r.usage.cachedInputTokens),
        reasoningTokens: tokenCount(details?.reasoningTokens ?? r.usage.reasoningTokens)
      };
      usageTotals.steps += 1;
      usageTotals.inputTokens += usage.inputTokens;
      usageTotals.outputTokens += usage.outputTokens;
      return { calls, text: r.text, usage };
    } catch (e: unknown) {
      throw new TurnFailure('network', firstLine(e));
    }
  }
}

function firstLine(e: unknown): string {
  const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'provider call failed';
  return message.split('\n')[0];
}

/** Process-wide usage totals, as the PROVIDER reports them — the campaign driver
 *  reads and resets them around a run. */
const usageTotals = { steps: 0, inputTokens: 0, outputTokens: 0 };

export function readUsageTotals(): { steps: number; inputTokens: number; outputTokens: number } {
  return { ...usageTotals };
}

export function resetUsageTotals(): void {
  usageTotals.steps = 0;
  usageTotals.inputTokens = 0;
  usageTotals.outputTokens = 0;
}
