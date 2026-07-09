/**
 * @looprun/models — the ModelRuntimePort: the seam between looprun and a LOCAL model runtime.
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
  /** KV cache precision (measured per model — q8_0 for the 4B tier, f16 for the 35B). */
  kv: 'q8_0' | 'f16';
  /** Context window. */
  ctx: number;
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
