/**
 * @looprun-ai/eval — provider selection for the subject model.
 *
 * `gemini*` ids (with no explicit base-url) go through the native Google provider — the
 * OpenAI-compat shim drops thought_signature on multi-turn tool calls (400s). Thinking is
 * OFF by default for gemini (the `thinking` flag / targets.json re-enables it). Every other
 * id goes through the OpenAI-compatible client. Local endpoints get the runaway brakes
 * (measured: one uncapped local call decoded ~8.7k tokens for 302 s before the client timed
 * out): capped pinned decoding + repeated-call stop.
 */
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { geminiThinkingOff, pinnedDecoding } from '@looprun-ai/core';

export interface TargetSelection {
  modelId: string;
  /** Only set when the caller explicitly passed one (disables native-gemini routing). */
  explicitBaseUrl?: string;
  baseUrl: string;
  apiKey: string;
  thinking: boolean;
}

export interface SelectedModel {
  model: unknown;
  modelParams: Record<string, unknown>;
  /** Local endpoint — enables the repeated-tool-call stop brake. */
  isLocal: boolean;
}

export function selectModel(t: TargetSelection): SelectedModel {
  const isGemini = /^gemini/i.test(t.modelId) && !t.explicitBaseUrl;
  const isLocal = !isGemini && /^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(t.baseUrl);
  const model = isGemini
    ? createGoogleGenerativeAI({ apiKey: t.apiKey })(t.modelId)
    : createOpenAI({ baseURL: t.baseUrl, apiKey: t.apiKey }).chat(t.modelId);
  const modelParams = isGemini && !t.thinking
    ? { temperature: 0, ...geminiThinkingOff() }
    : isLocal
      ? pinnedDecoding({ maxOutputTokens: 2048 })
      : { temperature: 0 };
  return { model, modelParams, isLocal };
}
