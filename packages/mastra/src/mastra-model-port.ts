/** One generation step over the host framework, behind ModelPort.step — structurally
 *  unable to loop: tools carry no execute, one call in, one typed step out. Typed acts
 *  render as the provider's own tool-call/tool-result messages; a provider error is a
 *  TurnFailure whose detail is one line, never a stack. */
import { generateText, jsonSchema, tool,
  type JSONValue, type ModelMessage, type ToolChoice, type ToolSet } from 'ai';
import type { LanguageModel } from 'ai';
import { resolveModelConfig } from '@mastra/core/llm';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { Act, Json, LlmParams, ModelStep, ProviderOptions, RawCall,
  StepInput } from '@looprun-ai/core';
import { label, TurnFailure } from '@looprun-ai/core';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Two option sets over one provider keep the fields of both. The outer key names the
 *  provider, so a whole-namespace overwrite would drop every field the target declared
 *  under that name — a target's `{ google: { safetySettings } }` and the engine's own
 *  `{ google: { thinkingConfig } }` are one namespace holding two fields, never two
 *  namespaces. Where both sets spell the same field, the engine's word wins. */
function mergeProviderOptions(declared: ProviderOptions,
                              engine: ProviderOptions): ProviderOptions {
  const merged: Record<string, Record<string, Json>> = {};
  for (const [namespace, fields] of Object.entries(declared)) {
    merged[namespace] = { ...fields };
  }
  for (const [namespace, fields] of Object.entries(engine)) {
    merged[namespace] = { ...merged[namespace], ...fields };
  }
  return merged;
}

/** The identity of one step's model calls — the key the signature cache joins on. */
function callsKey(calls: readonly { tool: string; args: unknown }[]): string {
  return JSON.stringify(calls.map(c => [c.tool, c.args]));
}

interface ToolCallPartLike { type: string; toolCallId: string; toolName: string }

/** What the model is shown of an act's result: the stored value with every top-level field
 *  name marked by the tool that returned it, so world data reaches the model named as data. */
const shown = (a: Act): Json => label(a.call.tool, a.result);

function resultValue(a: Act): JSONValue {
  return { sentence: a.sentence, status: a.status,
           result: shown(a) } as unknown as JSONValue;
}

/** Acts render in the provider's own dialect. A step the MODEL made replays the
 *  provider's ORIGINAL assistant message — its tool-call ids and its reasoning
 *  signatures ride along, which providers demanding a thought signature require.
 *  An engine-origin act (a licensed execution) has no model call to replay, so
 *  it rides as a compact user-visible record line. */
export function actMessages(acts: readonly Act[], base: number,
                     replay: ReadonlyMap<string, ModelMessage>): ModelMessage[] {
  const modelActs = acts.filter(a => a.origin === 'model');
  const engineActs = acts.filter(a => a.origin !== 'model');
  const out: ModelMessage[] = [];
  if (engineActs.length > 0) {
    out.push({ role: 'user', content: engineActs.map(a =>
      `[record] ${a.sentence}\n${JSON.stringify(shown(a))}`).join('\n') });
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
    `[record] ${a.sentence}\n${JSON.stringify(shown(a))}`).join('\n') });
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
  /** What the TARGET declared it asks of its provider, forwarded on every call this
   *  port makes — the opening step, each redrive, the forced micro-steps and the
   *  close step alike. The port reads none of it: a local llama.cpp target hands it
   *  `cache_prompt`, a cloud target hands it nothing. */
  private readonly providerOptions: ProviderOptions;
  /** The provider's own assistant messages, keyed by the calls they carried —
   *  replayed so reasoning signatures survive the engine's typed record. */
  private readonly replay = new Map<string, ModelMessage>();

  constructor(model: MastraModelConfig, params: LlmParams,
              providerOptions: ProviderOptions = {}) {
    this.resolved = resolveModelConfig(model).then(m => {
      if ((m as { specificationVersion?: string }).specificationVersion === 'v1') {
        throw new TurnFailure('construction', 'legacy v1 language models are unsupported');
      }
      return m as unknown as LanguageModel;
    });
    this.params = params;
    this.providerOptions = providerOptions;
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
      // `preset: 'gemini:thinking-on'` — explicitly, per desk. The target's own
      // declared options ride beside that, on this call and every other one.
      const providerOptions = mergeProviderOptions(this.providerOptions,
        params.preset === 'gemini:thinking-on'
          ? {} : { google: { thinkingConfig: { thinkingBudget: 0 } } }
      ) as unknown as Record<string, Record<string, JSONValue>>;
      const r = await generateText({
        model, system: input.system, messages: toMessages(input.messages, this.replay),
        tools, toolChoice,
        temperature: params.temperature, topP: params.topP,
        maxOutputTokens: params.maxOutputTokens, providerOptions
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
      // Thought tokens ride INSIDE the outputTokens object ({ total, text,
      // reasoning }) on this provider path — total already includes them.
      const reasoningOf = (v: unknown): number =>
        isRecord(v) && typeof v.reasoning === 'number' ? v.reasoning : 0;
      const usage = {
        inputTokens: tokenCount(r.usage.inputTokens),
        outputTokens: tokenCount(r.usage.outputTokens),
        cachedInputTokens: tokenCount(r.usage.cachedInputTokens),
        reasoningTokens: reasoningOf(r.usage.outputTokens)
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
