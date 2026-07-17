/** Locate and drive the REAL Hermes-Agent CLI (config-only integration — Hermes is not modified). */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface HermesRun {
  stdout: string;
  stderr: string;
  code: number | null;
  durationMs: number;
}

/** `HERMES_BIN` (absolute path) wins; else `hermes` is expected on PATH. */
export function hermesBin(): string {
  return process.env.HERMES_BIN ?? 'hermes';
}

/**
 * Write a sandboxed HERMES_HOME whose model provider points at the looprun model server.
 * `context_length` is set high so the harness never compresses the first user message away
 * (the fingerprint session fallback keys on it).
 */
export function writeHermesHome(dir: string, baseUrl: string): string {
  mkdirSync(dir, { recursive: true });
  const config = [
    'model:',
    '  provider: custom',
    `  base_url: "${baseUrl}"`,
    '  context_length: 128000',
    '',
    '# Keep the harness lean for the sim: no built-in toolsets beyond the basics it needs to chat.',
    'platform_toolsets:',
    '  cli: []',
    '',
  ].join('\n');
  writeFileSync(join(dir, 'config.yaml'), config);
  return dir;
}

/** One headless harness turn: `hermes chat -q "<task>" --provider custom -m <model>`. */
export function runHermesTask(args: {
  home: string;
  model: string;
  prompt: string;
  timeoutMs?: number;
}): Promise<HermesRun> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(hermesBin(), ['chat', '-q', args.prompt, '--provider', 'custom', '-m', args.model], {
      env: {
        ...process.env,
        HERMES_HOME: args.home,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? 'looprun-sim',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`hermes task timed out after ${args.timeoutMs ?? 300_000}ms\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, args.timeoutMs ?? 300_000);
    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      if (error.code === 'ENOENT') {
        reject(
          new Error(
            `Hermes CLI not found ('${hermesBin()}'). Install Hermes-Agent and either put 'hermes' on PATH or set HERMES_BIN=/abs/path/to/hermes.`,
          ),
        );
      } else {
        reject(error);
      }
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, code, durationMs: Date.now() - started });
    });
  });
}
