# Local models

looprun ships **three run tiers of one validated model** (Qwen3.6-35B-A3B with a baked
multi-token-prediction head) plus a small-RAM fallback, behind a `ModelRuntimePort` (llama.cpp
today; other runtimes plug into the same port later):

| alias | quant · size | tier | KV | ctx | `--cache-ram` | measured |
|---|---|---|---|---|---|---|
| **`normal`** (= `qwen3.6-35b-a3b`, the DEFAULT) | UD-IQ2_XXS+MTP · 11.8 GB | daily driver, 24 GB+ machines | `f16` | 64k | 16384 MiB | 88.9% certified eval (ties the 21 GB Q4 record) · ~56 tok/s · peak RSS ~20.7 GB |
| **`minimal`** | UD-IQ2_XXS+MTP · 11.8 GB | 16 GB machines | `q8_0` | 24k | 512 MiB | **13.4–13.5 GB RSS** · ~44 tok/s |
| **`pro`** | UD-Q3_K_XL+MTP · 17.2 GB | quality-max, 32 GB+ | `f16` | 64k | 16384 MiB | ~58 tok/s |
| **`micro`** | Qwen3.5-**4B** UD-Q3_K_XL+MTP · 2.5 GB | 8 GB machines, simple/few-tool agents | `q8_0` | 24k | 384 MiB | **4.62 GB RSS** (~3.4 GB left for OS+apps) · ~43 tok/s — eval quality is far below the 35B tiers |
| `qwen3.5-4b` | UD-Q4_K_XL · 2.9 GB | plain-4B fallback (no MTP) | `f16` | 32k | 3072 MiB | — |

The launch profile is the **measured** recipe — not defaults:
`--jinja -fa on -ngl 99 --mlock --no-mmap -np 1 -c <ctx> -ctk <kv> -ctv <kv> -ctxcp 64
--cache-ram <MiB> --slot-save-path <dir> [--spec-type draft-mtp]` on port 8081. The same flags
apply on Mac (Metal) and Windows/Linux (CUDA) — only the tier changes per machine.

- `-np 1` keeps the shared prompt prefix permanently resident (the long-running-agent law).
- `-ctxcp` (context checkpoints) + `--cache-ram` (idle-slot RAM prompt cache) are **both
  load-bearing** for the qwen3.5/3.6 hybrid family: checkpoints make any continuation warm (even
  same-agent multi-turn), and the RAM cache keeps N distinct **agent trunks** warm across agent
  switches — measured warm-switch TTFT 0.5–0.6 s vs 11–22 s cold. Never disable either.
- KV precision is `f16` unless the tier's RAM budget forces `q8_0` (measured: f16 = +23% decode vs
  q8_0 on the 4B, ~1.7× on the 35B — weights dominate decode bandwidth; q8_0's per-token dequant is
  pure overhead). `minimal` accepts that tax deliberately: q8_0 + 24k ctx is what fits 16 GB.
- `--slot-save-path` (default `~/.cache/looprun/slot-states`; `$LLAMA_SLOT_SAVE_PATH`, empty
  disables) enables per-agent trunk **state files**: bake a slot once at the trunk boundary, then
  after any server restart a restore takes ≈20–30 ms (≈400× faster than the cold prefill) — zero
  cold prefill across restarts. Zero cost when unused.
- **MTP (`--spec-type draft-mtp`) is ON for the 35B tiers** (2026-07-15): the `*-MTP-GGUF`
  checkpoints bake a **trained** multi-token-prediction head into the file; the server drafts with
  it and exact-verifies, so output is **byte-identical at temp 0** (lossless) at ~1.4× decode
  (acceptance 0.75–0.80, measured on b9780 and b10016). Do not raise `--spec-draft-n-max` past its
  default 3 — acceptance collapses beyond the single trained head's horizon. `$LLAMA_SPEC_TYPE=''`
  disables. The dense 4B stays non-MTP (measured ~0% there — the draft forward costs a token).
- `minimal`'s ctx 24576 fits agent trunks up to ~21k tokens; if your agents' trunks exceed that,
  use `normal` (or raise `$LLAMA_CTX` and accept the extra KV RAM).

## Requirements

- **[llama.cpp](https://github.com/ggml-org/llama.cpp)** `llama-server`, build **≥ b9780** — older
  builds (e.g. brew's b9740) cannot load the qwen3.5/3.6 family. Grab a prebuilt binary from the
  [releases page](https://github.com/ggml-org/llama.cpp/releases) (macOS arm64/Metal, Linux/Windows
  CUDA and CPU) or [build from source](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md).
  - **Source builds (dynamic `@rpath`)**: a from-source `llama-server` often links its `libggml-*`/
    `libllama-*` dylibs by an `@rpath` pointing at the build dir (e.g. under `/tmp`), which the OS can
    clear on reboot → `dyld: Library not loaded` (Abort trap 6). The dylibs ship beside the binary, so
    `looprun models serve` **automatically sets `DYLD_FALLBACK_LIBRARY_PATH` to the binary's own
    directory** (macOS). If you launch `llama-server` yourself, do the same — and never via `nohup`
    (a SIP-protected binary that strips `DYLD_*`); use a wrapper that `export`s then `exec`s.
- **Binary resolution order**: `$LLAMA_BIN` → `~/llamacpp-b9780/bin/llama-server` → `llama-server`
  on `PATH` (a PATH hit warns about the version requirement). `npx looprun models status` reports
  which binary was found; every error names the fix (`install llama.cpp (≥ b9780) and/or set $LLAMA_BIN`).
- **Hardware**: a GPU the build can offload to (`-ngl 99`) — Metal on Apple Silicon, CUDA elsewhere.
  Disk/RAM per tier: ~2.9 GB weights for `qwen3.5-4b` (8–16 GB machines), ~21 GB for
  `qwen3.6-35b-a3b` (32 GB+).

## Use in an agent

```ts
import { localModel } from 'looprun/models'

const model = await localModel('qwen3.5-4b')   // ensures the file + a healthy server, then returns
new LoopRunAgent({ spec, world, model })        // an AI-SDK client (OpenAI-compatible chat)
```

Reproducible runs: spread `pinnedDecoding()` (from `looprun`) into `modelParams` (temperature 0 +
optional seed — llama.cpp honors it).

## Downloads are consent-first

`localModel()` **fails fast** when the GGUF is missing — it never starts a multi-GB download on an
agent's first turn (surprise bandwidth/disk, long first-latency, CI hazards). Get the model explicitly:

```bash
npx looprun init                        # env check + interactive pull
npx looprun models pull normal          # tiers: normal (default) · minimal · pro
npx looprun models status               # binary / file / server health
npx looprun models serve minimal        # the 16 GB profile (13.4–13.5 GB measured)
```

Opt-in auto-download (dev convenience, sensible for the 4B only):
`await localModel('qwen3.5-4b', { autoDownload: true })`.

Overrides: `$QWEN35_4B_GGUF` / `$QWEN36_35B_GGUF` / `$QWEN36_35B_PRO_GGUF` (file paths),
`$LLAMA_BIN`, `$LLAMA_PORT`, `$LLAMA_KV`, `$LLAMA_CTX`, `$LLAMA_CACHE_RAM`,
`$LLAMA_SLOT_SAVE_PATH`, `$LLAMA_SPEC_TYPE` ('' disables MTP).

Windows/CUDA notes: identical flags. On a 16 GB-VRAM box that wants the 35B tier, add `-ncmoe N`
(offload the first N layers' MoE experts to CPU; raise N until it fits — needs ≥16 GB system RAM).

## Other runtimes

Implement `ModelRuntimePort` (`status` / `ensureModel` / `ensureServer`) and pass it:
`localModel('qwen3.5-4b', { runtime: myRuntime })`. The port is the seam — aliases, consent flow and
the agent side stay unchanged.
