/**
 * @looprun/models — the llama.cpp ModelRuntimePort (the v0 local runtime).
 *
 * Launch profile = the measured recipe (NON-MTP):
 *   llama-server -m <gguf> --port <port> --jinja -fa on -ngl 99 --mlock --no-mmap -np 1
 *                -c <ctx> -ctk <kv> -ctv <kv>
 *  - `-np 1` keeps the shared prompt prefix permanently resident (the long-running-agent law).
 *  - NO `--spec-type` (MTP measured ~0% speedup on Metal — rejected).
 *  - Binary must be ≥ b9780 (older builds cannot load the qwen3.5/3.6 family) — resolved via
 *    $LLAMA_BIN, then ~/llamacpp-b9780/bin/llama-server, then `llama-server` on PATH.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
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

export function launchFlags(spec: LocalModelSpec, model: string): string[] {
  const port = Number(process.env.LLAMA_PORT ?? spec.port);
  const kv = process.env.LLAMA_KV ?? spec.kv;
  const ctx = Number(process.env.LLAMA_CTX ?? spec.ctx);
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

    const child = spawn(binary.path, launchFlags(spec, model), {
      stdio: ['ignore', 'ignore', 'ignore'],
      detached: false,
    });
    const timeoutMs = opts.timeoutMs ?? 240_000; // the 35B mlock load can take minutes
    const t0 = Date.now();
    for (;;) {
      if (child.exitCode != null) {
        throw new Error(`looprun: llama-server exited early (code ${child.exitCode}) — check the model/flags: ${binary.path}`);
      }
      if (await healthy(spec)) break;
      if (Date.now() - t0 > timeoutMs) {
        child.kill('SIGKILL');
        throw new Error(`looprun: llama-server did not become healthy within ${timeoutMs / 1000}s`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return {
      baseURL,
      alreadyRunning: false,
      stop: async () => {
        child.kill('SIGTERM');
      },
    };
  }
}
