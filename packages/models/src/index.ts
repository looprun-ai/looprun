/**
 * @looprun-ai/models — public API.
 *
 *   model: await localModel('qwen3.5-4b')          // llama.cpp, measured flags, health-checked
 *   const { model, modelParams } = geminiFlashLiteThinkOff()   // the cloud validation model
 */
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { geminiThinkingOff } from '@looprun-ai/core';
import { resolveAlias, modelPath } from './aliases.js';
import { LlamaCppRuntime, serverBaseURL } from './llamacpp.js';
import type { LocalModelSpec, ModelRuntimePort } from './port.js';

export type { LocalModelSpec, ModelRuntimePort, RuntimeStatus, EnsureServerResult } from './port.js';
export { MODEL_ALIASES, QWEN35_4B, QWEN36_35B_A3B, resolveAlias, modelPath } from './aliases.js';
export { LlamaCppRuntime, launchFlags, serverBaseURL, slotStateDir } from './llamacpp.js';
export { downloadModel, downloadUrl } from './download.js';

export interface LocalModelOptions {
  /** The runtime port; defaults to llama.cpp. */
  runtime?: ModelRuntimePort;
  /** Spawn the server when it is not up (default true). */
  autoStart?: boolean;
  /**
   * Download the GGUF when missing (default FALSE — a 3–21 GB surprise download on first turn
   * is a footgun; prefer `npx looprun models pull <alias>` or `npx looprun init`).
   */
  autoDownload?: boolean;
  /** Health-wait budget for a fresh spawn. */
  timeoutMs?: number;
  onProgress?: (pct: number) => void;
}

/**
 * A validated LOCAL model as an AI-SDK LanguageModel (OpenAI-compatible chat over llama.cpp).
 * Ensures the model file + server (per options), then returns the client — ready for
 * `new LoopRunAgent({ model: await localModel('qwen3.5-4b') })`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function localModel(alias: string, opts: LocalModelOptions = {}): Promise<any> {
  const spec = resolveAlias(alias);
  const runtime = opts.runtime ?? new LlamaCppRuntime();
  await runtime.ensureModel(spec, { download: opts.autoDownload === true, onProgress: opts.onProgress });
  const { baseURL } = await runtime.ensureServer(spec, {
    autoStart: opts.autoStart !== false,
    ...(opts.timeoutMs != null ? { timeoutMs: opts.timeoutMs } : {}),
  });
  return createOpenAI({ baseURL, apiKey: 'local' }).chat(spec.servedId);
}

/** The client WITHOUT any runtime management (assumes a server is already up). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function localModelClient(alias: string): any {
  const spec = resolveAlias(alias);
  return createOpenAI({ baseURL: serverBaseURL(spec), apiKey: 'local' }).chat(spec.servedId);
}

/**
 * The cloud VALIDATION model: gemini flash-lite with thinking OFF.
 * TRAP (measured): 'off' needs the NUMERIC `thinkingBudget: 0` — `thinkingLevel` does not turn
 * thinking off. `modelParams` carries it; spread into LoopRunAgent's `modelParams`.
 * Needs $GOOGLE_GENERATIVE_AI_API_KEY.
 */
export function geminiFlashLiteThinkOff(opts: { apiKey?: string; id?: string } = {}): {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
  modelParams: Record<string, unknown>;
} {
  const apiKey = opts.apiKey ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error('looprun: GOOGLE_GENERATIVE_AI_API_KEY is not set.');
  const google = createGoogleGenerativeAI({ apiKey });
  return { model: google(opts.id ?? 'gemini-3.1-flash-lite'), modelParams: geminiThinkingOff() };
}

/** Convenience for status displays. */
export async function localModelStatus(alias: string, runtime: ModelRuntimePort = new LlamaCppRuntime()) {
  return runtime.status(resolveAlias(alias));
}

export type { LocalModelSpec as LooprunLocalModelSpec };
