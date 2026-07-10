/**
 * @looprun-ai/models — the validated local-model registry.
 *
 * Both entries were validated on the certified benchmark lineage (llama.cpp, Metal + CUDA):
 *  - KV precision is measured, not a guess: q8_0 for the 4B tier; f16 for the 35B-A3B
 *    (~1.7× faster decode than q8_0 on Metal — the GPU dequantizes q8_0 every token).
 *  - NON-MTP: multi-token prediction measured at ~0% speedup on Metal — never enabled.
 *  - Requires a llama.cpp build ≥ b9780 (older builds cannot load the qwen3.5/3.6 family).
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
  kv: 'q8_0',
  ctx: 32768,
  port: 8081,
  servedId: 'qwen3.5-4b-gguf',
};

export const QWEN36_35B_A3B: LocalModelSpec = {
  alias: 'qwen3.6-35b-a3b',
  note: 'Quality tier (32 GB+): ~21 GB weights (MoE 35B-A3B). Best local quality; f16 KV + 64k ctx.',
  file: 'Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf',
  defaultDir: home('models', 'qwen36-gguf'),
  envVar: 'QWEN36_35B_GGUF',
  hfRepo: 'unsloth/Qwen3.6-35B-A3B-GGUF',
  approxSizeGB: 21,
  kv: 'f16',
  ctx: 65536,
  port: 8081,
  servedId: 'qwen3.6-35b-gguf',
};

export const MODEL_ALIASES: Record<string, LocalModelSpec> = {
  [QWEN35_4B.alias]: QWEN35_4B,
  [QWEN36_35B_A3B.alias]: QWEN36_35B_A3B,
  // accepted spellings
  'qwen3.6-35b-3b': QWEN36_35B_A3B,
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
