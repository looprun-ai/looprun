/** Model-parameter presets + the Mastra modelSettings normalization seam. */
import { describe, expect, it } from 'vitest';
import { geminiThinkingOff, pinnedDecoding, normalizeModelParams } from '../src/index.js';

describe('pinnedDecoding', () => {
  it('nests temperature (and optional seed / maxOutputTokens) under modelSettings', () => {
    expect(pinnedDecoding()).toEqual({ modelSettings: { temperature: 0 } });
    expect(pinnedDecoding({ seed: 7, maxOutputTokens: 2048 })).toEqual({
      modelSettings: { temperature: 0, seed: 7, maxOutputTokens: 2048 },
    });
  });
});

describe('normalizeModelParams (Mastra drops flat call settings — measured 2026-07-11)', () => {
  it('folds flat AI-SDK call settings into modelSettings', () => {
    expect(normalizeModelParams({ temperature: 0, maxOutputTokens: 2048, seed: 1 })).toEqual({
      modelSettings: { temperature: 0, maxOutputTokens: 2048, seed: 1 },
    });
  });

  it('passes preset-style params through unchanged', () => {
    expect(normalizeModelParams(pinnedDecoding({ maxOutputTokens: 2048 }))).toEqual(
      pinnedDecoding({ maxOutputTokens: 2048 }),
    );
    expect(normalizeModelParams(geminiThinkingOff())).toEqual(geminiThinkingOff());
  });

  it('keeps top-level keys (providerOptions) and lets explicit modelSettings win conflicts', () => {
    const out = normalizeModelParams({
      temperature: 1,
      providerOptions: { openai: { reasoningEffort: 'none' } },
      modelSettings: { temperature: 0 },
    });
    expect(out).toEqual({
      providerOptions: { openai: { reasoningEffort: 'none' } },
      modelSettings: { temperature: 0 },
    });
  });

  it('returns no modelSettings key when nothing needs nesting', () => {
    expect(normalizeModelParams({ providerOptions: { a: 1 } })).toEqual({ providerOptions: { a: 1 } });
    expect(normalizeModelParams({})).toEqual({});
  });
});
