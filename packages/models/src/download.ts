/**
 * @looprun-ai/models — HuggingFace GGUF download with resume.
 *
 * Downloads never start implicitly: callers (the CLI, or `localModel` with `autoDownload:true`)
 * opt in explicitly — a 3–21 GB surprise download on an agent's first turn is a footgun, not DX.
 */
import { createWriteStream, existsSync, mkdirSync, statSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { LocalModelSpec } from './port.js';

export function downloadUrl(spec: LocalModelSpec): string {
  return `https://huggingface.co/${spec.hfRepo}/resolve/main/${spec.file}`;
}

/** Download the model file to `dest` (resumable via HTTP Range; atomic rename from .part). */
export async function downloadModel(
  spec: LocalModelSpec,
  dest: string,
  opts: { onProgress?: (pct: number, doneBytes: number, totalBytes: number) => void } = {},
): Promise<string> {
  const url = downloadUrl(spec);
  const part = `${dest}.part`;
  mkdirSync(dirname(dest), { recursive: true });

  const startAt = existsSync(part) ? statSync(part).size : 0;
  const headers: Record<string, string> = startAt > 0 ? { Range: `bytes=${startAt}-` } : {};
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`looprun: download failed (${res.status} ${res.statusText}) — ${url}`);
  }
  const resumed = res.status === 206;
  const contentLength = Number(res.headers.get('content-length') ?? 0);
  const total = resumed ? startAt + contentLength : contentLength;

  let done = resumed ? startAt : 0;
  const progress = opts.onProgress;
  const counter = async function* (source: AsyncIterable<Uint8Array>) {
    for await (const chunk of source) {
      done += chunk.length;
      if (progress && total > 0) progress(Math.round((done / total) * 100), done, total);
      yield chunk;
    }
  };

  const sink = createWriteStream(part, { flags: resumed ? 'a' : 'w' });
  await pipeline(counter(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream)), sink);
  renameSync(part, dest);
  return dest;
}
