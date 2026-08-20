/** GGUF pull with HTTP-Range resume AND integrity: size + sha256 verified
 *  before the rename into place — a corrupted partial never becomes the
 *  installed file. */
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync,
         statSync, unlinkSync } from 'node:fs';
import { get } from 'node:http';
import { join } from 'node:path';
import type { LocalTier } from './tiers.js';

function fetchRange(url: string, from: number, onto: string): Promise<number> {
  return new Promise((resolvePull, rejectPull) => {
    const req = get(url, from > 0 ? { headers: { range: `bytes=${String(from)}-` } } : {},
      res => {
        if (res.statusCode !== 200 && res.statusCode !== 206) {
          rejectPull(new Error(`the artifact answered ${String(res.statusCode ?? 0)}`));
          return;
        }
        const sink = createWriteStream(onto, { flags: from > 0 ? 'a' : 'w' });
        res.pipe(sink);
        sink.on('finish', () => { resolvePull(statSync(onto).size); });
        sink.on('error', rejectPull);
        res.on('error', rejectPull);
      });
    req.on('error', rejectPull);
  });
}

export class Downloader {
  private readonly into: string;

  constructor(into: string) {
    this.into = into;
  }

  /** The installed file path; a hash mismatch deletes the partial and throws. */
  async pull(row: Pick<LocalTier, 'url' | 'sha256' | 'file'>): Promise<string> {
    mkdirSync(this.into, { recursive: true });
    const installed = join(this.into, row.file);
    if (existsSync(installed)) return installed;
    const partial = `${installed}.partial`;
    const from = existsSync(partial) ? statSync(partial).size : 0;
    await fetchRange(row.url, from, partial);
    const digest = createHash('sha256').update(readFileSync(partial)).digest('hex');
    if (digest !== row.sha256) {
      unlinkSync(partial);
      throw new Error(`sha256 mismatch for ${row.file}: the artifact is not the declared one`);
    }
    renameSync(partial, installed);
    return installed;
  }
}
