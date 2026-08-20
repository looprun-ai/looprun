/** The shipped ModelRuntimePort: binary resolution, the measured launch recipe
 *  that keeps assembled prompts WARM across agent switches, and a health check
 *  bound to the REQUESTED model identity — never a bare ok on a shared port.
 *  The macOS dynamic-loader fallback rides the child env, invisible above the
 *  port. */
import { spawn, type ChildProcess } from 'node:child_process';
import { get } from 'node:http';
import { dirname } from 'node:path';
import type { ServingHandle } from '@looprun-ai/core';
import type { LocalTier } from './tiers.js';

function httpJson(url: string): Promise<unknown> {
  return new Promise((resolveGet, rejectGet) => {
    const req = get(url, res => {
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString('utf8'); });
      res.on('end', () => {
        try { resolveGet(JSON.parse(body)); } catch (e) {
          rejectGet(e instanceof Error ? e : new Error('unparseable health answer'));
        }
      });
    });
    req.on('error', rejectGet);
  });
}

/** The requested identity must be among the served models — a bare ok on a port
 *  that serves something else is a wrong-model bug, not a healthy server. */
export async function healthCheck(baseUrl: string, servedModel: string): Promise<void> {
  const answer = await httpJson(`${baseUrl}/v1/models`) as
    { data?: readonly { id?: string }[] };
  const ids = (answer.data ?? []).map(m => m.id ?? '');
  if (!ids.some(id => id.includes(servedModel))) {
    throw new Error(`the endpoint serves [${ids.join(', ')}], not the requested '${servedModel}'`);
  }
}

const HEALTH_TRIES = 60;
const HEALTH_WAIT_MS = 1000;

export class LlamaCppRuntime {
  private child: ChildProcess | null = null;

  /** Serve a tier with the measured recipe; resolves when the REQUESTED model
   *  answers on the port. LLAMACPP_BIN names the pinned binary. */
  async serve(row: LocalTier & { modelPath: string; port?: number }): Promise<ServingHandle> {
    const bin = process.env.LLAMACPP_BIN;
    if (bin === undefined || bin === '') {
      throw new Error('LLAMACPP_BIN names the pinned llama-server binary; it is not set');
    }
    const port = row.port ?? 8081;
    const args = [
      '-m', row.modelPath,
      '--port', String(port),
      '--ctx-size', String(row.ctx),
      '--parallel', String(row.slots),
      '--cache-type-k', row.kv, '--cache-type-v', row.kv,
      '--slot-save-path', '.slots'
    ];
    this.child = spawn(bin, args, {
      stdio: 'ignore',
      env: { ...process.env, DYLD_LIBRARY_PATH: dirname(bin) }
    });
    const baseUrl = `http://127.0.0.1:${String(port)}`;
    for (let attempt = 0; attempt < HEALTH_TRIES; attempt += 1) {
      try {
        await healthCheck(baseUrl, row.servedModel);
        return { baseUrl, servedModel: row.servedModel, stop: () => this.stop() };
      } catch {
        await new Promise(resolveWait => setTimeout(resolveWait, HEALTH_WAIT_MS));
      }
    }
    await this.stop();
    throw new Error(`'${row.servedModel}' never answered healthy on ${baseUrl}`);
  }

  private stop(): Promise<void> {
    return new Promise(resolveStop => {
      if (this.child === null) { resolveStop(); return; }
      this.child.once('exit', () => { resolveStop(); });
      this.child.kill('SIGTERM');
      this.child = null;
    });
  }
}
