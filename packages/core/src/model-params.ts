/**
 * @looprun-ai/core — pure model-parameter presets (zero deps, no provider SDK imports).
 *
 * These are plain option objects spread into a backend's generate calls. They encode measured
 * provider footguns so hosts don't re-discover them.
 */

/**
 * Gemini with thinking OFF. TRAP (measured): Google's 'off' must use the NUMERIC
 * `thinkingBudget: 0` — `thinkingLevel` does NOT turn thinking off.
 */
export function geminiThinkingOff(): Record<string, unknown> {
  return {
    providerOptions: {
      google: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } },
    },
  };
}

/**
 * Pinned decoding for reproducible runs (temperature 0 + optional seed — llama.cpp honors seed).
 * `maxOutputTokens` caps a runaway generation: measured 2026-07-11 on the reference lineage, an
 * uncapped local qwen decoded ~8.7k tokens for 302 s on one call before the client timed out.
 */
export function pinnedDecoding(opts: { seed?: number; maxOutputTokens?: number } = {}): Record<string, unknown> {
  return {
    modelSettings: {
      temperature: 0,
      ...(opts.seed != null ? { seed: opts.seed } : {}),
      ...(opts.maxOutputTokens != null ? { maxOutputTokens: opts.maxOutputTokens } : {}),
    },
  };
}

/**
 * AI-SDK call-settings keys that Mastra honors ONLY inside `modelSettings` — a flat copy of any
 * of these on the generate() options object is silently dropped (measured 2026-07-11 on the reference
 * lineage: a flat spread ran local models with the GGUF-embedded sampler — temp 1.0, top_k 20,
 * NO token cap — instead of the pinned greedy config).
 */
const CALL_SETTING_KEYS: readonly string[] = [
  'temperature', 'maxOutputTokens', 'topP', 'topK', 'seed', 'headers',
  'stopSequences', 'presencePenalty', 'frequencyPenalty', 'maxRetries',
];

/**
 * Normalize a modelParams object for Mastra generate() spreads: fold FLAT AI-SDK call settings
 * into `modelSettings` (an explicit nested `modelSettings` wins on key conflicts); every other
 * key (providerOptions, …) passes through top-level untouched. Backends call this once at their
 * seam so both preset-style ({ modelSettings: … }) and flat ({ temperature: 0 }) inputs work.
 */
export function normalizeModelParams(params: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (k === 'modelSettings') continue;
    if (CALL_SETTING_KEYS.includes(k)) flat[k] = v;
    else rest[k] = v;
  }
  const settings = { ...flat, ...(params.modelSettings as Record<string, unknown> | undefined) };
  return Object.keys(settings).length ? { ...rest, modelSettings: settings } : rest;
}

/** Per-agent AI-SDK call settings (spec.controls.sampling) — the keys an agent may override. */
export interface SamplingSettings {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  seed?: number;
}

/**
 * Fold a spec's per-agent `sampling` OVER an already-normalized modelParams object (agent wins on any
 * key it sets), preserving providerOptions and every other top-level key. The one merged object is
 * spread into EVERY generate() call of the turn (main generation, forced-terminal, redrive), so a
 * creative agent can run at temperature 0.7 beside a temp-0 admin agent in the same domain. Absent /
 * empty sampling ⇒ the input returned unchanged (the zero-diff guarantee). Pure + exported so the merge
 * is unit-testable without a live model.
 */
export function resolveModelSettings(
  normalized: Record<string, unknown>,
  sampling?: SamplingSettings,
): Record<string, unknown> {
  if (!sampling || Object.keys(sampling).length === 0) return normalized;
  const modelSettings = { ...(normalized.modelSettings as Record<string, unknown> | undefined), ...sampling };
  return { ...normalized, modelSettings };
}
