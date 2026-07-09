/** Alias registry, flags and fail-fast behavior of the local-model story. */
import { afterEach, describe, expect, it } from 'vitest';
import { launchFlags, modelPath, resolveAlias, QWEN35_4B, QWEN36_35B_A3B, LlamaCppRuntime, downloadUrl } from '../src/index.js';

const ENV_KEYS = ['QWEN35_4B_GGUF', 'QWEN36_35B_GGUF', 'LLAMA_KV', 'LLAMA_CTX', 'LLAMA_PORT'];
const saved = new Map(ENV_KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('alias registry', () => {
  it('resolves canonical aliases and accepted spellings', () => {
    expect(resolveAlias('qwen3.5-4b')).toBe(QWEN35_4B);
    expect(resolveAlias('qwen3.6-35b-a3b')).toBe(QWEN36_35B_A3B);
    expect(resolveAlias('qwen3.6-35b-3b')).toBe(QWEN36_35B_A3B);
  });

  it('throws with the known list on an unknown alias', () => {
    expect(() => resolveAlias('gpt-9')).toThrow(/Known: qwen3\.5-4b, qwen3\.6-35b-a3b/);
  });

  it('modelPath honors the env override', () => {
    process.env.QWEN35_4B_GGUF = '/tmp/custom.gguf';
    expect(modelPath(QWEN35_4B)).toBe('/tmp/custom.gguf');
    delete process.env.QWEN35_4B_GGUF;
    expect(modelPath(QWEN35_4B)).toContain('models/qwen35-gguf/Qwen3.5-4B-UD-Q4_K_XL.gguf');
  });

  it('builds the HF download URL from the repo + file', () => {
    expect(downloadUrl(QWEN35_4B)).toBe('https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-UD-Q4_K_XL.gguf');
  });
});

describe('llama.cpp launch flags (the measured recipe — NON-MTP)', () => {
  it('encodes the validated per-model KV + ctx', () => {
    delete process.env.LLAMA_KV;
    delete process.env.LLAMA_CTX;
    delete process.env.LLAMA_PORT;
    const f4 = launchFlags(QWEN35_4B, '/m/4b.gguf').join(' ');
    expect(f4).toContain('-ctk q8_0 -ctv q8_0');
    expect(f4).toContain('-c 32768');
    const f35 = launchFlags(QWEN36_35B_A3B, '/m/35b.gguf').join(' ');
    expect(f35).toContain('-ctk f16 -ctv f16');
    expect(f35).toContain('-c 65536');
    for (const f of [f4, f35]) {
      expect(f).toContain('--jinja');
      expect(f).toContain('-fa on');
      expect(f).toContain('-ngl 99');
      expect(f).toContain('--mlock --no-mmap');
      expect(f).toContain('-np 1');
      expect(f).not.toContain('--spec-type'); // MTP rejected — never enabled
    }
  });

  it('honors LLAMA_KV / LLAMA_CTX / LLAMA_PORT overrides', () => {
    process.env.LLAMA_KV = 'f16';
    process.env.LLAMA_CTX = '65536';
    process.env.LLAMA_PORT = '9999';
    const f = launchFlags(QWEN35_4B, '/m/4b.gguf').join(' ');
    expect(f).toContain('-ctk f16');
    expect(f).toContain('-c 65536');
    expect(f).toContain('--port 9999');
  });
});

describe('fail-fast (no surprise downloads)', () => {
  it('ensureModel without download rejects with the pull hint', async () => {
    process.env.QWEN35_4B_GGUF = '/nonexistent/nowhere.gguf';
    const rt = new LlamaCppRuntime();
    await expect(rt.ensureModel(QWEN35_4B)).rejects.toThrow(/looprun models pull qwen3\.5-4b/);
    await expect(rt.ensureModel(QWEN35_4B)).rejects.toThrow(/~2\.9 GB/);
  });
});
