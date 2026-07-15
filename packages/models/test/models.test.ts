/** Alias registry, flags and fail-fast behavior of the local-model story. */
import { afterEach, describe, expect, it } from 'vitest';
import { launchFlags, modelPath, resolveAlias, QWEN35_4B, QWEN35_RAM8, QWEN36_RAM16, QWEN36_RAM24, QWEN36_RAM32, LlamaCppRuntime, downloadUrl } from '../src/index.js';

const ENV_KEYS = ['QWEN35_4B_GGUF', 'QWEN36_35B_GGUF', 'LLAMA_KV', 'LLAMA_CTX', 'LLAMA_PORT', 'LLAMA_CACHE_RAM', 'LLAMA_SLOT_SAVE_PATH', 'LLAMA_SPEC_TYPE'];
const saved = new Map(ENV_KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('alias registry', () => {
  it('resolves the plain 4B model alias', () => {
    expect(resolveAlias('qwen3.5-4b')).toBe(QWEN35_4B);
  });

  it('resolves the four run tiers (ram24 is the default alias)', () => {
    expect(resolveAlias('ram24')).toBe(QWEN36_RAM24);
    expect(resolveAlias('ram16')).toBe(QWEN36_RAM16);
    expect(resolveAlias('ram32')).toBe(QWEN36_RAM32);
    expect(resolveAlias('ram8')).toBe(QWEN35_RAM8);
    expect(resolveAlias('qwen3.6-35b-ram24')).toBe(QWEN36_RAM24);
    expect(resolveAlias('qwen3.6-35b-ram16')).toBe(QWEN36_RAM16);
    expect(resolveAlias('qwen3.6-35b-ram32')).toBe(QWEN36_RAM32);
    expect(resolveAlias('qwen3.5-4b-ram8')).toBe(QWEN35_RAM8);
    // one served id across the 35B tiers — the client-side model label never changes
    for (const s of [QWEN36_RAM24, QWEN36_RAM16, QWEN36_RAM32]) {
      expect(s.servedId).toBe('qwen3.6-35b-gguf');
      expect(s.hfRepo).toBe('unsloth/Qwen3.6-35B-A3B-MTP-GGUF');
      expect(s.specType).toBe('draft-mtp');
    }
    // ram8 = the 4B family with its own baked MTP head
    expect(QWEN35_RAM8.hfRepo).toBe('unsloth/Qwen3.5-4B-MTP-GGUF');
    expect(QWEN35_RAM8.specType).toBe('draft-mtp');
  });

  it('rejects the pre-ram tier spellings (removed, not aliased)', () => {
    for (const legacy of ['micro', 'minimal', 'normal', 'pro', 'qwen3.5-4b-micro', 'qwen3.6-35b-minimal', 'qwen3.6-35b-pro', 'qwen3.6-35b-a3b', 'qwen3.6-35b-3b']) {
      expect(() => resolveAlias(legacy), legacy).toThrow(/Unknown|Known:/);
    }
  });

  it('throws with the known list on an unknown alias', () => {
    expect(() => resolveAlias('gpt-9')).toThrow(/Known: qwen3\.5-4b, qwen3\.5-4b-ram8, qwen3\.6-35b-ram24/);
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

describe('llama.cpp launch flags (the measured recipe — MTP on the 35B tiers since 2026-07-15)', () => {
  it('encodes the validated per-model KV + ctx + cache-ram tier', () => {
    delete process.env.LLAMA_KV;
    delete process.env.LLAMA_CTX;
    delete process.env.LLAMA_PORT;
    delete process.env.LLAMA_CACHE_RAM;
    delete process.env.LLAMA_SLOT_SAVE_PATH;
    delete process.env.LLAMA_SPEC_TYPE;
    const f4 = launchFlags(QWEN35_4B, '/m/4b.gguf').join(' ');
    expect(f4).toContain('-ctk f16 -ctv f16');
    expect(f4).toContain('-c 32768');
    expect(f4).toContain('--cache-ram 3072');
    expect(f4).not.toContain('--spec-type'); // dense 4B stays NON-MTP (~0% measured)
    const fRam24 = launchFlags(QWEN36_RAM24, '/m/35b.gguf').join(' ');
    expect(fRam24).toContain('-ctk f16 -ctv f16');
    expect(fRam24).toContain('-c 65536');
    expect(fRam24).toContain('--cache-ram 16384');
    expect(fRam24).toContain('--spec-type draft-mtp'); // D4b: baked trained head = 1.4× lossless
    const fRam16 = launchFlags(QWEN36_RAM16, '/m/35b.gguf').join(' ');
    expect(fRam16).toContain('-ctk q8_0 -ctv q8_0'); // 16 GB budget: measured 13.4–13.5 GB RSS
    expect(fRam16).toContain('-c 24576');
    expect(fRam16).toContain('--cache-ram 512');
    expect(fRam16).toContain('--spec-type draft-mtp');
    const fRam32 = launchFlags(QWEN36_RAM32, '/m/35b.gguf').join(' ');
    expect(fRam32).toContain('-ctk f16 -ctv f16');
    expect(fRam32).toContain('-c 65536');
    expect(fRam32).toContain('--spec-type draft-mtp');
    const fRam8 = launchFlags(QWEN35_RAM8, '/m/4b.gguf').join(' ');
    expect(fRam8).toContain('-ctk q8_0 -ctv q8_0'); // 8 GB budget; ctx 24k fits ~21k trunks
    expect(fRam8).toContain('-c 24576'); // measured 4.62 GB RSS / ~43 tok/s
    expect(fRam8).toContain('--cache-ram 384');
    expect(fRam8).toContain('--spec-type draft-mtp'); // baked head: +20% measured on the 4B @ Q4
    for (const f of [f4, fRam24, fRam16, fRam32, fRam8]) {
      expect(f).toContain('--jinja');
      expect(f).toContain('-fa on');
      expect(f).toContain('-ngl 99');
      expect(f).toContain('--mlock --no-mmap');
      expect(f).toContain('-np 1');
      expect(f).toContain('-ctxcp 64'); // checkpoints — load-bearing for qwen3.5/3.6 hybrids
      expect(f).toContain('--slot-save-path'); // trunk state files on by default
    }
  });

  it('LLAMA_SPEC_TYPE="" disables MTP; a value overrides the spec mode', () => {
    process.env.LLAMA_SPEC_TYPE = '';
    expect(launchFlags(QWEN36_RAM24, '/m/35b.gguf').join(' ')).not.toContain('--spec-type');
    process.env.LLAMA_SPEC_TYPE = 'ngram-mod';
    expect(launchFlags(QWEN36_RAM24, '/m/35b.gguf').join(' ')).toContain('--spec-type ngram-mod');
  });

  it('honors LLAMA_KV / LLAMA_CTX / LLAMA_PORT / LLAMA_CACHE_RAM overrides', () => {
    process.env.LLAMA_KV = 'q8_0';
    process.env.LLAMA_CTX = '65536';
    process.env.LLAMA_PORT = '9999';
    process.env.LLAMA_CACHE_RAM = '4096';
    const f = launchFlags(QWEN35_4B, '/m/4b.gguf').join(' ');
    expect(f).toContain('-ctk q8_0');
    expect(f).toContain('-c 65536');
    expect(f).toContain('--port 9999');
    expect(f).toContain('--cache-ram 4096');
  });

  it('LLAMA_SLOT_SAVE_PATH="" disables the slot-state dir', () => {
    process.env.LLAMA_SLOT_SAVE_PATH = '';
    const f = launchFlags(QWEN35_4B, '/m/4b.gguf').join(' ');
    expect(f).not.toContain('--slot-save-path');
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
