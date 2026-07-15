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
 * THE FOUR RUN TIERS (2026-07-15; re-keyed to RAM class 2026-07-15 — old spellings
 * micro/minimal/normal/pro stay accepted). Measured profiles, largest machine first:
 *  - ram32  (was pro)     — 35B UD-Q3_K_XL + MTP, 17.2 GB weights: ~58 tok/s, the quality-max local profile.
 *  - ram24  (was normal, DEFAULT) — 35B UD-IQ2_XXS + MTP, 11.8 GB weights: 88.9% on the certified 117-case
 *    eval (ties the 21 GB Q4 record at 56% of the RAM), ~56 tok/s decode, peak RSS ~20.7 GB
 *    (fits 24 GB machines) with the full 16 GB prompt cache (cap it via $LLAMA_CACHE_RAM to shrink).
 *  - ram16  (was minimal) — same model tuned for 16 GB machines: ctx 24576 (fits a ~21k agent trunk),
 *    q8_0 KV, 512 MiB cache. MEASURED: 13.4–13.5 GB RSS, ~44 tok/s decode.
 *  - ram8   (was micro)   — 8 GB machines: Qwen3.5-4B UD-Q3_K_XL + MTP (2.53 GB), ctx 24576 (fits ~21k
 *    agent trunks), q8_0 KV, 384 MiB cache. MEASURED: 4.62 GB RSS, ~43 tok/s decode — leaves
 *    ~3.4 GB for the OS + apps. Perf-validated; the 4B's eval quality is far below the 35B tiers.
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

/** RAM24 — the 24 GB-machine tier; the default when nothing is specified (was "normal"). */
export const QWEN36_RAM24: LocalModelSpec = {
  alias: 'qwen3.6-35b-ram24',
  note: '24 GB-machine tier (DEFAULT): UD-IQ2_XXS + baked MTP head (11.8 GB), peak RSS ~20.7 GB. 88.9% certified eval — ties the 21 GB Q4 record — at ~56 tok/s decode.',
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

/** RAM16 — 16 GB machines: measured 13.4–13.5 GB RSS, ~44 tok/s (q8_0 KV tax) (was "minimal"). */
export const QWEN36_RAM16: LocalModelSpec = {
  alias: 'qwen3.6-35b-ram16',
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

/** RAM32 — quality-max local profile (was "pro"). */
export const QWEN36_RAM32: LocalModelSpec = {
  alias: 'qwen3.6-35b-ram32',
  note: '32 GB-machine quality-max tier: UD-Q3_K_XL + baked MTP head (17.2 GB), ~58 tok/s decode, f16 KV + 64k ctx.',
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

/** RAM8 — 8 GB machines: measured 4.62 GB RSS, ~43 tok/s (Qwen3.5-4B + baked MTP head) (was "micro"). */
export const QWEN35_RAM8: LocalModelSpec = {
  alias: 'qwen3.5-4b-ram8',
  note: '8 GB-machine tier: Qwen3.5-4B UD-Q3_K_XL + baked MTP head (2.53 GB), ctx 24576 (fits ~21k agent trunks), q8_0 KV, 384 MiB cache. Measured 4.62 GB RSS, ~43 tok/s — leaves ~3.4 GB for OS + apps. Deep-context-heavy agents can trade back: $LLAMA_KV=f16 $LLAMA_CTX=16384.',
  file: 'Qwen3.5-4B-UD-Q3_K_XL.gguf',
  defaultDir: home('models', 'qwen35-mtp-gguf'),
  envVar: 'QWEN35_MICRO_GGUF',
  hfRepo: 'unsloth/Qwen3.5-4B-MTP-GGUF',
  approxSizeGB: 2.5,
  kv: 'q8_0',
  ctx: 24576,
  cacheRamMiB: 384,
  port: 8081,
  servedId: 'qwen3.5-4b-gguf',
  specType: 'draft-mtp',
};

/** @deprecated renamed QWEN36_NORMAL → QWEN36_RAM24 (RAM-class re-key 2026-07-15). */
export const QWEN36_NORMAL = QWEN36_RAM24;
/** @deprecated renamed QWEN36_MINIMAL → QWEN36_RAM16 (RAM-class re-key 2026-07-15). */
export const QWEN36_MINIMAL = QWEN36_RAM16;
/** @deprecated renamed QWEN36_PRO → QWEN36_RAM32 (RAM-class re-key 2026-07-15). */
export const QWEN36_PRO = QWEN36_RAM32;
/** @deprecated renamed QWEN35_MICRO → QWEN35_RAM8 (RAM-class re-key 2026-07-15). */
export const QWEN35_MICRO = QWEN35_RAM8;

/** @deprecated pre-2026-07-15 default (plain UD-Q4_K_XL, no MTP). Kept for path compatibility. */
export const QWEN36_35B_A3B: LocalModelSpec = QWEN36_RAM24;

export const MODEL_ALIASES: Record<string, LocalModelSpec> = {
  [QWEN35_4B.alias]: QWEN35_4B,
  [QWEN35_RAM8.alias]: QWEN35_RAM8,
  [QWEN36_RAM24.alias]: QWEN36_RAM24,
  [QWEN36_RAM16.alias]: QWEN36_RAM16,
  [QWEN36_RAM32.alias]: QWEN36_RAM32,
  // short spellings
  ram8: QWEN35_RAM8,
  ram16: QWEN36_RAM16,
  ram24: QWEN36_RAM24,
  ram32: QWEN36_RAM32,
  // deprecated spellings (pre-ram rename + pre-2026-07-15)
  micro: QWEN35_RAM8,
  minimal: QWEN36_RAM16,
  normal: QWEN36_RAM24,
  pro: QWEN36_RAM32,
  'qwen3.5-4b-micro': QWEN35_RAM8,
  'qwen3.6-35b-minimal': QWEN36_RAM16,
  'qwen3.6-35b-pro': QWEN36_RAM32,
  'qwen3.6-35b-a3b': QWEN36_RAM24,
  'qwen3.6-35b-3b': QWEN36_RAM24,
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
