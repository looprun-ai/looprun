/**
 * @looprun/core — pure model-parameter presets (zero deps, no provider SDK imports).
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

/** Pinned decoding for reproducible runs (temperature 0 + optional seed — llama.cpp honors seed). */
export function pinnedDecoding(opts: { seed?: number } = {}): Record<string, unknown> {
  return {
    modelSettings: {
      temperature: 0,
      ...(opts.seed != null ? { seed: opts.seed } : {}),
    },
  };
}
