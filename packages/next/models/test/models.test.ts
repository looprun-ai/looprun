import { test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tier } from '../src/tiers.js';
import { Downloader } from '../src/downloader.js';
import { healthCheck } from '../src/llamacpp.js';

test('a tier is declared data; an unknown alias fails loud; ctx takes the env hatch', () => {
  const a3b = tier('a3b');
  expect(a3b.kv).toBe('f16');
  expect(a3b.servedModel).toBe('qwen3-30b-a3b');
  expect(() => tier('ghost')).toThrow('ghost');
  process.env.LOOPRUN_TIER_A3B_CTX = '4096';
  expect(tier('a3b').ctx).toBe(4096);
  delete process.env.LOOPRUN_TIER_A3B_CTX;
});

function artifactServer(body: Buffer): Promise<{ url: string; close(): void;
                                                 rangesSeen: string[] }> {
  const rangesSeen: string[] = [];
  return new Promise(resolveStart => {
    const server = createServer((req, res) => {
      const range = req.headers.range;
      if (typeof range === 'string') {
        rangesSeen.push(range);
        const from = Number(range.replace('bytes=', '').replace('-', ''));
        res.writeHead(206);
        res.end(body.subarray(from));
      } else {
        res.writeHead(200);
        res.end(body);
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolveStart({ url: `http://127.0.0.1:${String(port)}/artifact.gguf`,
        close: () => { server.closeAllConnections(); server.close(); }, rangesSeen });
    });
  });
}

test('the downloader resumes mid-file and verifies sha256 before the rename', async () => {
  const body = Buffer.from('the-whole-artifact-body-0123456789');
  const served = await artifactServer(body);
  try {
    const into = mkdtempSync(join(tmpdir(), 'models-'));
    writeFileSync(join(into, 'a.gguf.partial'), body.subarray(0, 10));
    const path = await new Downloader(into).fetch({ url: served.url,
      sha256: createHash('sha256').update(body).digest('hex'), file: 'a.gguf' });
    expect(path.endsWith('a.gguf')).toBe(true);
    expect(served.rangesSeen).toEqual(['bytes=10-']);

    const bad = mkdtempSync(join(tmpdir(), 'models-'));
    await expect(new Downloader(bad).fetch({ url: served.url,
      sha256: 'not-the-artifact', file: 'b.gguf' })).rejects.toThrow('sha256 mismatch');
  } finally { served.close(); }
});

test('the health check binds to the REQUESTED identity — a stranger model is loud', async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'some-other-model' }] }));
  });
  const url = await new Promise<string>(resolveStart => {
    server.listen(0, '127.0.0.1', () => {
      resolveStart(`http://127.0.0.1:${String((server.address() as { port: number }).port)}`);
    });
  });
  try {
    await expect(healthCheck(url, 'qwen3-30b-a3b')).rejects.toThrow('some-other-model');
  } finally { server.closeAllConnections(); server.close(); }
});
