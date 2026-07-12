/**
 * @looprun-ai/eval — subject-model resolution.
 *
 * Default subject = 'gemini-3.1-flash-lite-thinkoff' (the validation ruler; numeric
 * thinkingBudget:0). Local aliases route through @looprun-ai/models (llama.cpp, measured flags).
 * RULER DISCIPLINE: an unpinned alias can drift across days — never compare cross-day runs
 * without a same-day replication control.
 */
import { geminiFlashLiteThinkOff, localModel, resolveAlias, MODEL_ALIASES } from '@looprun-ai/models';
import { pinnedDecoding } from '@looprun-ai/core';
import type { ModelRef } from './types.js';

export interface ResolvedModel {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
  modelParams: Record<string, unknown>;
  label: string;
  /** Local model (llama.cpp alias) — enables repeated-tool-call stop, exactly as the lineage gated it. */
  isLocal: boolean;
}

export async function resolveModel(ref: ModelRef | undefined): Promise<ResolvedModel> {
  const r = ref ?? 'gemini-3.1-flash-lite-thinkoff';
  if (typeof r !== 'string') {
    return { model: r.model, modelParams: r.modelParams ?? {}, label: r.label ?? 'custom', isLocal: false };
  }
  if (r === 'gemini-3.1-flash-lite-thinkoff') {
    const { model, modelParams } = geminiFlashLiteThinkOff();
    return { model, modelParams, label: r, isLocal: false };
  }
  if (r in MODEL_ALIASES) {
    const spec = resolveAlias(r);
    const model = await localModel(spec.alias);
    // maxOutputTokens caps runaway generations on local models (measured 2026-07-11: one uncapped
    // call decoded ~8.7k tokens for 302 s before the HTTP client timed out and failed the case).
    return { model, modelParams: pinnedDecoding({ maxOutputTokens: 2048 }), label: spec.alias, isLocal: true };
  }
  throw new Error(
    `looprun-eval: unknown model "${r}". Known: gemini-3.1-flash-lite-thinkoff, ` +
      `${[...new Set(Object.keys(MODEL_ALIASES))].join(', ')} — or pass { model, modelParams } in the config.`,
  );
}
