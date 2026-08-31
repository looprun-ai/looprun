/** The measured local-tier registry: every serving fact DECLARED per tier as
 *  data — speculative decoding where it pays, KV precision (f16 the law, q8_0
 *  the RAM escape hatch), context sized to the assembled prompt, warm-slot
 *  sizing, and the request options the target hands the engine.
 *  `LOOPRUN_TIER_<ALIAS>_CTX` / `_KV` override a field without editing the
 *  registry. */
import type { ProviderOptions, TierSpec } from '@looprun-ai/core';

export interface LocalTier extends TierSpec {
  /** The GGUF artifact and its integrity. */
  readonly url: string;
  readonly sha256: string;
  readonly file: string;
  /** The id the serving endpoint must answer for — the health check binds to it. */
  readonly servedModel: string;
  /** What this target asks of the server on EVERY request. `cache_prompt` is what
   *  makes the server keep a prompt's KV cache across turns instead of prefilling
   *  the whole prompt again; it pairs with the single slot below, which is what
   *  keeps that one cache reusable turn over turn.
   *
   *  Two links carry it to the server, and this file asserts neither:
   *  · The outer key must equal the seat's provider id up to its first dot — the host
   *    derives the namespace that way, so a seat whose provider id does not BEGIN with
   *    `llamacpp` drops this object silently, with no error and no warning.
   *  · `cache_prompt` is a field of llama.cpp's own `/completion` route, and the seat
   *    speaks `/v1/chat/completions` — the field reaches the sampler only where that
   *    route forwards it.
   *  A run against a live server is what shows both links closed: the same prompt sent
   *  twice prefills the second time only where it changed. */
  readonly providerOptions: ProviderOptions;
}

const ROWS: readonly LocalTier[] = [
  {
    alias: 'a3b',
    speculative: 'none', kv: 'f16', ctx: 16384, cacheRam: 2048, slots: 1,
    url: 'https://huggingface.co/Qwen/Qwen3-30B-A3B-GGUF/resolve/main/Qwen3-30B-A3B-Q4_K_M.gguf',
    sha256: 'declared-at-pin-time-per-artifact-0000000000000000000000000000000000000000',
    file: 'qwen3-30b-a3b-q4_k_m.gguf',
    servedModel: 'qwen3-30b-a3b',
    providerOptions: { llamacpp: { cache_prompt: true } }
  }
];

export function tier(alias: string): LocalTier {
  const row = ROWS.find(r => r.alias === alias);
  if (!row) throw new Error(`no declared tier is named '${alias}'`);
  const ctxOverride = process.env[`LOOPRUN_TIER_${alias.toUpperCase()}_CTX`];
  const kvOverride = process.env[`LOOPRUN_TIER_${alias.toUpperCase()}_KV`];
  return {
    ...row,
    ...(ctxOverride !== undefined ? { ctx: Number(ctxOverride) } : {}),
    ...(kvOverride === 'q8_0' || kvOverride === 'f16' ? { kv: kvOverride } : {})
  };
}

export function tiers(): readonly LocalTier[] {
  return ROWS;
}
