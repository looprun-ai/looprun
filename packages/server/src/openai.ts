/** OpenAI chat-completion envelope builders (non-stream + stream chunks) and error shapes. */
import type { LoopRunEnvelopeMeta } from './types.js';

/** Rough token estimate (ceil(chars/4), never zero) — harnesses expect nonzero usage. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export interface CompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export function buildUsage(promptText: string, completionText: string): CompletionUsage {
  const prompt = estimateTokens(promptText);
  const completion = estimateTokens(completionText);
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
}

let counter = 0;
export function completionId(): string {
  counter++;
  return `chatcmpl-looprun-${Date.now().toString(36)}${counter.toString(36)}`;
}

export function buildCompletion(args: {
  id: string;
  model: string;
  text: string;
  usage: CompletionUsage;
  looprun: LoopRunEnvelopeMeta;
}): Record<string, unknown> {
  return {
    id: args.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: args.model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: args.text },
        finish_reason: 'stop',
        logprobs: null,
      },
    ],
    usage: args.usage,
    // Non-standard extension (OpenAI SDKs ignore unknown fields): the governed-turn metadata.
    looprun: args.looprun,
  };
}

export function buildChunk(args: {
  id: string;
  model: string;
  delta: Record<string, unknown>;
  finishReason?: string | null;
  usage?: CompletionUsage;
  looprun?: LoopRunEnvelopeMeta;
}): Record<string, unknown> {
  const chunk: Record<string, unknown> = {
    id: args.id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: args.model,
    choices: [{ index: 0, delta: args.delta, finish_reason: args.finishReason ?? null, logprobs: null }],
  };
  if (args.usage) chunk.usage = args.usage;
  if (args.looprun) chunk.looprun = args.looprun;
  return chunk;
}

export function buildModelList(ids: string[], contextLength: number): Record<string, unknown> {
  const created = Math.floor(Date.now() / 1000);
  return {
    object: 'list',
    data: ids.map((id) => ({
      id,
      object: 'model',
      created,
      owned_by: 'looprun',
      // De-facto extension many harnesses read to size their context handling.
      context_length: contextLength,
    })),
  };
}

export type WireErrorCode = 'model_not_found' | 'invalid_request_error' | 'api_error' | 'invalid_api_key';

export function errorBody(message: string, type: string, code: WireErrorCode | null, param: string | null = null) {
  return { error: { message, type, param, code } };
}
