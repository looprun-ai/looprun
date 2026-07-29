/**
 * @looprun-ai/models — the public API: exactly the 8 models rows of `docs/superpowers/specs/2026-07-28-tutorial-outline-final.md`
 * §4 (chapter 05: `geminiFlashLiteThinkOff` · chapter 06: the local-model seven).
 *
 *   model: await localModel('qwen3.5-4b')          // llama.cpp, measured flags, health-checked
 *   const { model, modelParams } = geminiFlashLiteThinkOff()   // the cloud validation model
 *
 * Three of them are also called by the published `looprun` bin through a dynamic package import
 * (`bin/looprun.mjs` → `resolveAlias`, `LlamaCppRuntime`, `localModelStatus`), so the bin is a
 * second, independent reason they must stay here.
 *
 * Models has NO `/internal` subpath: the alias registry, the launch flags, the download helpers and
 * the path utilities stay module-local — in-package code imports `./aliases.js`, `./llamacpp.js` and
 * `./download.js` directly, and so do this package's tests. Locked by
 * `packages/models/test/surface-lock.test.ts`.
 */
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { geminiThinkingOff } from '@looprun-ai/core';
import { resolveAlias } from './aliases.js';
import { LlamaCppRuntime } from './llamacpp.js';
import type { ModelRuntimePort } from './port.js';

export type { LocalModelSpec, ModelRuntimePort } from './port.js';
export { resolveAlias } from './aliases.js';
export { LlamaCppRuntime } from './llamacpp.js';

/**
 * TYPE-CLOSURE RIDERS (outline §7) — not taught, not part of the 8, not API anybody chose. They are
 * the transitive type closure of the signatures above: `localModelStatus` returns a
 * `Promise<RuntimeStatus>` and `ModelRuntimePort.ensureServer` an `EnsureServerResult`, so a
 * consumer building with `declaration: true` cannot NAME either without these (`TS4023`/`TS2742`).
 */
export type { RuntimeStatus, EnsureServerResult } from './port.js';

export interface LocalModelOptions {
  /** The runtime port; defaults to llama.cpp. */
  runtime?: ModelRuntimePort;
  /** Spawn the server when it is not up (default true). */
  autoStart?: boolean;
  /**
   * Download the GGUF when missing (default FALSE — a 2.5–17 GB surprise download on first turn
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

/**
 * The cloud VALIDATION model: gemini flash-lite with thinking OFF.
 * TRAP: 'off' needs the NUMERIC `thinkingBudget: 0` — `thinkingLevel` does not turn
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
