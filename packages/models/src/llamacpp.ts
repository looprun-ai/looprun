/**
 * @looprun-ai/models — the llama.cpp ModelRuntimePort (the v0 local runtime).
 *
 * Launch profile = the measured recipe (NON-MTP; trunk-warm law measured 2026-07-11):
 *   llama-server -m <gguf> --port <port> --jinja -fa on -ngl 99 --mlock --no-mmap -np 1
 *                -c <ctx> -ctk <kv> -ctv <kv> -ctxcp 64 --cache-ram <MiB> --slot-save-path <dir>
 *  - `-np 1` keeps the shared prompt prefix permanently resident (the long-running-agent law).
 *  - `-ctxcp` (context checkpoints) + `--cache-ram` (idle-slot RAM prompt cache) are BOTH
 *    load-bearing for the qwen3.5/3.6 hybrid family: checkpoints make ANY continuation warm
 *    (even same-agent multi-turn), the RAM cache keeps N distinct agent trunks warm across
 *    agent switches (warm switch TTFT 0.5–0.6 s vs 11–22 s cold). Never disable either.
 *  - `--slot-save-path` enables per-agent trunk STATE FILES (bake once at the trunk boundary,
 *    restore ≈20–30 ms after any restart via POST /slots/{i}?action=save|restore). Zero cost
 *    when the /slots endpoints are unused.
 *  - NO `--spec-type` (MTP measured ~0% speedup on Metal — rejected).
 *  - Binary must be ≥ b9780 (older builds cannot load the qwen3.5/3.6 family) — resolved via
 *    $LLAMA_BIN, then ~/llamacpp-b9780/bin/llama-server, then `llama-server` on PATH.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { modelPath } from './aliases.js';
import { downloadModel } from './download.js';
import type { EnsureServerResult, LocalModelSpec, ModelRuntimePort, RuntimeStatus } from './port.js';

function resolveBinary(): { path: string | null; note?: string } {
  const fromEnv = process.env.LLAMA_BIN;
  if (fromEnv && fromEnv.trim()) {
    const p = fromEnv.trim();
    return existsSync(p) ? { path: p } : { path: null, note: `$LLAMA_BIN points to a missing file: ${p}` };
  }
  const pinned = join(homedir(), 'llamacpp-b9780', 'bin', 'llama-server');
  if (existsSync(pinned)) return { path: pinned };
  const which = spawnSync('which', ['llama-server'], { encoding: 'utf8' });
  const onPath = which.status === 0 ? which.stdout.trim() : '';
  if (onPath) {
    return {
      path: onPath,
      note: 'using llama-server from PATH — the qwen3.5/3.6 family needs a build ≥ b9780 (brew b9740 fails to load it)',
    };
  }
  return {
    path: null,
    note: 'llama-server not found — install llama.cpp (≥ b9780) and/or set $LLAMA_BIN to the binary',
  };
}

export function serverBaseURL(spec: LocalModelSpec): string {
  const port = Number(process.env.LLAMA_PORT ?? spec.port);
  return `http://127.0.0.1:${port}/v1`;
}

async function healthy(spec: LocalModelSpec): Promise<boolean> {
  const port = Number(process.env.LLAMA_PORT ?? spec.port);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const body = (await res.json()) as { status?: string };
    return body.status === 'ok';
  } catch {
    return false;
  }
}

/** The slot-state dir (`--slot-save-path`); $LLAMA_SLOT_SAVE_PATH overrides, '' disables. */
export function slotStateDir(): string {
  const fromEnv = process.env.LLAMA_SLOT_SAVE_PATH;
  if (fromEnv !== undefined) return fromEnv.trim();
  return join(homedir(), '.cache', 'looprun', 'slot-states');
}

export function launchFlags(spec: LocalModelSpec, model: string): string[] {
  const port = Number(process.env.LLAMA_PORT ?? spec.port);
  const kv = process.env.LLAMA_KV ?? spec.kv;
  const ctx = Number(process.env.LLAMA_CTX ?? spec.ctx);
  const cacheRam = Number(process.env.LLAMA_CACHE_RAM ?? spec.cacheRamMiB);
  const slotDir = slotStateDir();
  return [
    '-m', model,
    '--port', String(port),
    '--jinja',
    '-fa', 'on',
    '-ngl', '99',
    '--mlock', '--no-mmap',
    '-np', '1',
    '-c', String(ctx),
    '-ctk', kv,
    '-ctv', kv,
    '-ctxcp', '64',
    '--cache-ram', String(cacheRam),
    ...(slotDir ? ['--slot-save-path', slotDir] : []),
  ];
}

export class LlamaCppRuntime implements ModelRuntimePort {
  readonly id = 'llamacpp';

  async status(spec: LocalModelSpec): Promise<RuntimeStatus> {
    const binary = resolveBinary();
    const file = modelPath(spec);
    return {
      runtime: this.id,
      binary: { path: binary.path, ok: binary.path != null, ...(binary.note ? { note: binary.note } : {}) },
      modelFile: { path: file, exists: existsSync(file) },
      server: { up: await healthy(spec), baseURL: serverBaseURL(spec) },
    };
  }

  async ensureModel(
    spec: LocalModelSpec,
    opts: { download?: boolean; onProgress?: (pct: number) => void } = {},
  ): Promise<string> {
    const file = modelPath(spec);
    if (existsSync(file)) return file;
    if (!opts.download) {
      throw new Error(
        `looprun: model "${spec.alias}" not found at ${file} (~${spec.approxSizeGB} GB download).\n` +
          `  Run: npx looprun models pull ${spec.alias}\n` +
          `  (or set $${spec.envVar} to an existing GGUF, or pass autoDownload:true)`,
      );
    }
    let lastPct = -1;
    return downloadModel(spec, file, {
      onProgress: (pct) => {
        if (pct !== lastPct) {
          lastPct = pct;
          opts.onProgress?.(pct);
        }
      },
    });
  }

  async ensureServer(
    spec: LocalModelSpec,
    opts: { autoStart?: boolean; timeoutMs?: number } = {},
  ): Promise<EnsureServerResult> {
    const baseURL = serverBaseURL(spec);
    if (await healthy(spec)) {
      return { baseURL, alreadyRunning: true, stop: async () => {} };
    }
    if (opts.autoStart === false) {
      throw new Error(
        `looprun: no llama-server answering at ${baseURL}.\n  Run: npx looprun models serve ${spec.alias}`,
      );
    }
    const binary = resolveBinary();
    if (!binary.path) throw new Error(`looprun: ${binary.note}`);
    const model = await this.ensureModel(spec); // fails fast with the pull hint when missing

    const slotDir = slotStateDir();
    if (slotDir) mkdirSync(slotDir, { recursive: true }); // llama-server won't create it
    // A llama.cpp SOURCE build's @rpath points at its (often /tmp) build dir, which the OS may clear
    // on reboot → `dyld: Library not loaded: @rpath/lib…dylib` (Abort trap 6). The dylibs ship NEXT
    // to the binary, so point the loader there. macOS-only var (ignored on Linux); we set it directly
    // in the child env (NOT via `nohup`, which is SIP-protected and strips DYLD_*). Existing value wins.
    const libDir = dirname(binary.path);
    const dyld = process.env.DYLD_FALLBACK_LIBRARY_PATH;
    const child = spawn(binary.path, launchFlags(spec, model), {
      stdio: ['ignore', 'ignore', 'ignore'],
      detached: false,
      env: { ...process.env, DYLD_FALLBACK_LIBRARY_PATH: dyld ? `${libDir}:${dyld}` : `${libDir}:/usr/local/lib:/usr/lib` },
    });
    // A server WE spawned must not outlive the process that asked for it (a leaked llama-server
    // can hold gigabytes mlock'd). stop() removes the hook.
    const onExit = () => {
      try {
        child.kill('SIGTERM');
      } catch {
        /* already gone */
      }
    };
    process.once('exit', onExit);
    const timeoutMs = opts.timeoutMs ?? 240_000; // the 35B mlock load can take minutes
    const t0 = Date.now();
    for (;;) {
      if (child.exitCode != null) {
        throw new Error(`looprun: llama-server exited early (code ${child.exitCode}) — check the model/flags: ${binary.path}`);
      }
      if (await healthy(spec)) break;
      if (Date.now() - t0 > timeoutMs) {
        process.removeListener('exit', onExit);
        child.kill('SIGKILL');
        throw new Error(`looprun: llama-server did not become healthy within ${timeoutMs / 1000}s`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return {
      baseURL,
      alreadyRunning: false,
      stop: async () => {
        process.removeListener('exit', onExit);
        child.kill('SIGTERM');
      },
    };
  }
}
