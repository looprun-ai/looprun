/** The measured local-tier registry: every serving fact DECLARED per tier as
 *  data — speculative decoding where it pays, KV precision (f16 the law, q8_0
 *  the RAM escape hatch), context sized to the assembled prompt, warm-slot
 *  sizing. `LOOPRUN_TIER_<ALIAS>_CTX` / `_KV` override a field without editing
 *  the registry. */
import type { TierSpec } from '@looprun-ai/core';

export interface LocalTier extends TierSpec {
  /** The GGUF artifact and its integrity. */
  readonly url: string;
  readonly sha256: string;
  readonly file: string;
  /** The id the serving endpoint must answer for — the health check binds to it. */
  readonly servedModel: string;
}

const ROWS: readonly LocalTier[] = [
  {
    alias: 'a3b',
    speculative: 'none', kv: 'f16', ctx: 16384, cacheRam: 2048, slots: 2,
    url: 'https://huggingface.co/Qwen/Qwen3-30B-A3B-GGUF/resolve/main/Qwen3-30B-A3B-Q4_K_M.gguf',
    sha256: 'declared-at-pin-time-per-artifact-0000000000000000000000000000000000000000',
    file: 'qwen3-30b-a3b-q4_k_m.gguf',
    servedModel: 'qwen3-30b-a3b'
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
