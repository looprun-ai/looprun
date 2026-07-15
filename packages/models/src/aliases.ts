/**
 * @looprun-ai/models — the validated local-model registry.
 *
 * All entries were validated on the certified benchmark lineage (llama.cpp, Metal + CUDA):
 *  - KV precision is measured, not a guess: f16 unless the tier's RAM budget forces q8_0
 *    (2026-07-11: f16 = +23% decode vs q8_0 on the 4B, ~1.7× on the 35B-A3B — the GPU
 *    dequantizes q8_0 every token while the byte saving buys nothing, since weights dominate
 *    decode bandwidth).
 *  - cacheRamMiB (`--cache-ram`) is tiered: it is the idle-slot RAM prompt cache that keeps N
 *    distinct agent trunks warm across agent switches (measured 2026-07-11: warm switch TTFT
 *    0.5–0.6 s vs 11–22 s cold without it).
 *  - MTP (multi-token prediction): ON for the 35B-A3B tiers since 2026-07-15 — trained MTP
 *    heads shipped (`unsloth/Qwen3.6-35B-A3B-MTP-GGUF` bakes the head into every UD quant):
 *    acceptance 0.75–0.80, decode 39.6 → 53–58 tok/s, output byte-identical at temp 0
 *    (exact-verified = lossless). Works on b9780 AND newer builds (measured on both).
 *    The dense 4B stays NON-MTP (~0% measured — draft-forward ≈ token cost there).
 *  - Requires a llama.cpp build ≥ b9780 (older builds cannot load the qwen3.5/3.6 family).
 *
 * THE FOUR RUN TIERS (2026-07-15). Measured profiles, largest machine first:
 *  - pro     — 35B UD-Q3_K_XL + MTP, 17.2 GB weights: ~58 tok/s, the quality-max local profile.
 *  - normal  (DEFAULT) — 35B UD-IQ2_XXS + MTP, 11.8 GB weights: 88.9% on the certified 117-case
 *    eval (ties the 21 GB Q4 record at 56% of the RAM), ~56 tok/s decode, peak RSS ~20.7 GB
 *    with the full 16 GB prompt cache (cap it via $LLAMA_CACHE_RAM to shrink).
 *  - minimal — same model tuned for 16 GB machines: ctx 24576 (fits a ~21k agent trunk),
 *    q8_0 KV, 512 MiB cache. MEASURED: 13.4–13.5 GB RSS, ~44 tok/s decode.
 *  - micro   — 8 GB machines: Qwen3.5-4B UD-Q3_K_XL + MTP (2.53 GB), ctx 16384 (agent trunks
 *    ≤ ~12k), f16 KV, 384 MiB cache. MEASURED: 4.67 GB RSS, ~44 tok/s decode — leaves ~3.3 GB
 *    for the OS + apps. Perf-validated; the 4B's eval quality is far below the 35B tiers.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { LocalModelSpec } from './port.js';

function home(...parts: string[]): string {
  return join(homedir(), ...parts);
}

export const QWEN35_4B: LocalModelSpec = {
  alias: 'qwen3.5-4b',
  note: 'Small-RAM tier (8–16 GB): ~2.9 GB weights. Best for simple/few-tool agents and local smokes.',
  file: 'Qwen3.5-4B-UD-Q4_K_XL.gguf',
  defaultDir: home('models', 'qwen35-gguf'),
  envVar: 'QWEN35_4B_GGUF',
  hfRepo: 'unsloth/Qwen3.5-4B-GGUF',
  approxSizeGB: 2.9,
  kv: 'f16',
  ctx: 32768,
  cacheRamMiB: 3072,
  port: 8081,
  servedId: 'qwen3.5-4b-gguf',
};

/** NORMAL — the default tier when nothing is specified. */
export const QWEN36_NORMAL: LocalModelSpec = {
  alias: 'qwen3.6-35b-a3b',
  note: 'DEFAULT tier: UD-IQ2_XXS + baked MTP head (11.8 GB). 88.9% certified eval — ties the 21 GB Q4 record — at ~56 tok/s decode.',
  file: 'Qwen3.6-35B-A3B-UD-IQ2_XXS.gguf',
  defaultDir: home('models', 'qwen36-mtp-gguf'),
  envVar: 'QWEN36_35B_GGUF',
  hfRepo: 'unsloth/Qwen3.6-35B-A3B-MTP-GGUF',
  approxSizeGB: 11.8,
  kv: 'f16',
  ctx: 65536,
  cacheRamMiB: 16384,
  port: 8081,
  servedId: 'qwen3.6-35b-gguf',
  specType: 'draft-mtp',
};

/** MINIMAL — 16 GB machines: measured 13.4–13.5 GB RSS, ~44 tok/s (q8_0 KV tax). */
export const QWEN36_MINIMAL: LocalModelSpec = {
  alias: 'qwen3.6-35b-minimal',
  note: '16 GB-machine tier: same IQ2_XXS+MTP model, ctx 24576 (fits a ~21k agent trunk), q8_0 KV, 512 MiB cache. Measured 13.4–13.5 GB RSS, ~44 tok/s.',
  file: 'Qwen3.6-35B-A3B-UD-IQ2_XXS.gguf',
  defaultDir: home('models', 'qwen36-mtp-gguf'),
  envVar: 'QWEN36_35B_GGUF',
  hfRepo: 'unsloth/Qwen3.6-35B-A3B-MTP-GGUF',
  approxSizeGB: 11.8,
  kv: 'q8_0',
  ctx: 24576,
  cacheRamMiB: 512,
  port: 8081,
  servedId: 'qwen3.6-35b-gguf',
  specType: 'draft-mtp',
};

/** PRO — quality-max local profile. */
export const QWEN36_PRO: LocalModelSpec = {
  alias: 'qwen3.6-35b-pro',
  note: 'Quality-max tier: UD-Q3_K_XL + baked MTP head (17.2 GB), ~58 tok/s decode, f16 KV + 64k ctx.',
  file: 'Qwen3.6-35B-A3B-UD-Q3_K_XL.gguf',
  defaultDir: home('models', 'qwen36-mtp-gguf'),
  envVar: 'QWEN36_35B_PRO_GGUF',
  hfRepo: 'unsloth/Qwen3.6-35B-A3B-MTP-GGUF',
  approxSizeGB: 17.2,
  kv: 'f16',
  ctx: 65536,
  cacheRamMiB: 16384,
  port: 8081,
  servedId: 'qwen3.6-35b-gguf',
  specType: 'draft-mtp',
};

/** MICRO — 8 GB machines: measured 4.67 GB RSS, ~44 tok/s (Qwen3.5-4B + baked MTP head). */
export const QWEN35_MICRO: LocalModelSpec = {
  alias: 'qwen3.5-4b-micro',
  note: '8 GB-machine tier: Qwen3.5-4B UD-Q3_K_XL + baked MTP head (2.53 GB), ctx 16384 (agent trunks ≤ ~12k), 384 MiB cache. Measured 4.67 GB RSS, ~44 tok/s — leaves ~3.3 GB for OS + apps.',
  file: 'Qwen3.5-4B-UD-Q3_K_XL.gguf',
  defaultDir: home('models', 'qwen35-mtp-gguf'),
  envVar: 'QWEN35_MICRO_GGUF',
  hfRepo: 'unsloth/Qwen3.5-4B-MTP-GGUF',
  approxSizeGB: 2.5,
  kv: 'f16',
  ctx: 16384,
  cacheRamMiB: 384,
  port: 8081,
  servedId: 'qwen3.5-4b-gguf',
  specType: 'draft-mtp',
};

/** @deprecated pre-2026-07-15 default (plain UD-Q4_K_XL, no MTP). Kept for path compatibility. */
export const QWEN36_35B_A3B: LocalModelSpec = QWEN36_NORMAL;

export const MODEL_ALIASES: Record<string, LocalModelSpec> = {
  [QWEN35_4B.alias]: QWEN35_4B,
  [QWEN35_MICRO.alias]: QWEN35_MICRO,
  [QWEN36_NORMAL.alias]: QWEN36_NORMAL,
  [QWEN36_MINIMAL.alias]: QWEN36_MINIMAL,
  [QWEN36_PRO.alias]: QWEN36_PRO,
  // accepted spellings
  'qwen3.6-35b-3b': QWEN36_NORMAL,
  normal: QWEN36_NORMAL,
  minimal: QWEN36_MINIMAL,
  pro: QWEN36_PRO,
  micro: QWEN35_MICRO,
};

export function resolveAlias(alias: string): LocalModelSpec {
  const spec = MODEL_ALIASES[alias];
  if (!spec) {
    throw new Error(
      `looprun: unknown local model alias "${alias}". Known: ${[...new Set(Object.values(MODEL_ALIASES).map((s) => s.alias))].join(', ')}`,
    );
  }
  return spec;
}

/** The resolved model file path (env override → default dir). */
export function modelPath(spec: LocalModelSpec): string {
  const fromEnv = process.env[spec.envVar];
  return fromEnv && fromEnv.trim() ? fromEnv : join(spec.defaultDir, spec.file);
}
