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
}

export async function resolveModel(ref: ModelRef | undefined): Promise<ResolvedModel> {
  const r = ref ?? 'gemini-3.1-flash-lite-thinkoff';
  if (typeof r !== 'string') {
    return { model: r.model, modelParams: r.modelParams ?? {}, label: r.label ?? 'custom' };
  }
  if (r === 'gemini-3.1-flash-lite-thinkoff') {
    const { model, modelParams } = geminiFlashLiteThinkOff();
    return { model, modelParams, label: r };
  }
  if (r in MODEL_ALIASES) {
    const spec = resolveAlias(r);
    const model = await localModel(spec.alias);
    return { model, modelParams: pinnedDecoding(), label: spec.alias };
  }
  throw new Error(
    `looprun-eval: unknown model "${r}". Known: gemini-3.1-flash-lite-thinkoff, ` +
      `${[...new Set(Object.keys(MODEL_ALIASES))].join(', ')} — or pass { model, modelParams } in the config.`,
  );
}
