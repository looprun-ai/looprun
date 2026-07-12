/**
 * @looprun-ai/models — the ModelRuntimePort: the seam between looprun and a LOCAL model runtime.
 *
 * v0 ships one implementation (llama.cpp — `LlamaCppRuntime`); future runtimes (MLX servers,
 * ollama, vllm, …) implement the same port and plug into `localModel()` unchanged.
 */

/** One validated local model (alias registry entry). */
export interface LocalModelSpec {
  /** The canonical alias (e.g. 'qwen3.5-4b'). */
  alias: string;
  /** Human note: what the model is good for / RAM tier. */
  note: string;
  /** GGUF file name. */
  file: string;
  /** Default directory for the model file (may start with ~). */
  defaultDir: string;
  /** Env var that overrides the full model path. */
  envVar: string;
  /** HuggingFace repo the file is downloaded from. */
  hfRepo: string;
  /** Approximate download size, for consent prompts. */
  approxSizeGB: number;
  /**
   * KV cache precision — f16 on every tier (measured 2026-07-11: +23% decode vs q8_0 even on the
   * 4B; weights dominate decode bandwidth, q8_0's per-token dequant is pure overhead). q8_0 is a
   * RAM escape hatch only ($LLAMA_KV=q8_0).
   */
  kv: 'q8_0' | 'f16';
  /** Context window. */
  ctx: number;
  /**
   * `--cache-ram` MiB — the idle-slot RAM prompt cache that keeps N distinct agent trunks warm
   * on `-np 1` (one agent state ≈ 140–210 MB). NEVER 0 for the qwen3.5/3.6 hybrid family:
   * without it every agent switch is a full re-prefill (11–22 s measured).
   */
  cacheRamMiB: number;
  /** Default server port. */
  port: number;
  /** The model id the OpenAI-compatible client sends (a label for llama-server). */
  servedId: string;
}

export interface RuntimeStatus {
  runtime: string;
  binary: { path: string | null; ok: boolean; note?: string };
  modelFile: { path: string; exists: boolean };
  server: { up: boolean; baseURL: string };
}

export interface EnsureServerResult {
  baseURL: string;
  alreadyRunning: boolean;
  stop(): Promise<void>;
}

/** A local model runtime (llama.cpp today; MLX/ollama/vllm later). */
export interface ModelRuntimePort {
  readonly id: string;
  status(spec: LocalModelSpec): Promise<RuntimeStatus>;
  /**
   * Resolve the model file, downloading when missing and `download` allows it.
   * Rejects with an actionable message ("run: npx looprun models pull <alias>") otherwise.
   */
  ensureModel(spec: LocalModelSpec, opts?: { download?: boolean; onProgress?: (pct: number) => void }): Promise<string>;
  /** Ensure a server is up for the model (spawn + health-wait when needed). */
  ensureServer(spec: LocalModelSpec, opts?: { autoStart?: boolean; timeoutMs?: number }): Promise<EnsureServerResult>;
}
