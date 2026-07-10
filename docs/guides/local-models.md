# Local models

looprun ships two **validated** local tiers behind a `ModelRuntimePort` (llama.cpp today; other
runtimes plug into the same port later):

| alias | size | tier | KV | ctx |
|---|---|---|---|---|
| `qwen3.5-4b` | ~2.9 GB | 8–16 GB machines, simple/few-tool agents | `q8_0` | 32k |
| `qwen3.6-35b-a3b` | ~21 GB | 32 GB+, best local quality (MoE 35B-A3B) | `f16` | 64k |

The launch profile is the **measured** recipe — not defaults:
`--jinja -fa on -ngl 99 --mlock --no-mmap -np 1 -c <ctx> -ctk <kv> -ctv <kv>` on port 8081.
`-np 1` keeps the shared prompt prefix permanently resident (the long-running-agent law); KV precision
is per-model (f16 decodes ~1.7× faster than q8_0 for the 35B on Metal); MTP is never enabled (measured
~0% speedup).

## Requirements

- **[llama.cpp](https://github.com/ggml-org/llama.cpp)** `llama-server`, build **≥ b9780** — older
  builds (e.g. brew's b9740) cannot load the qwen3.5/3.6 family. Grab a prebuilt binary from the
  [releases page](https://github.com/ggml-org/llama.cpp/releases) (macOS arm64/Metal, Linux/Windows
  CUDA and CPU) or [build from source](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md).
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
npx looprun models pull qwen3.5-4b      # scripted (--yes to skip the prompt)
npx looprun models status               # binary / file / server health
npx looprun models serve qwen3.6-35b-a3b
```

Opt-in auto-download (dev convenience, sensible for the 4B only):
`await localModel('qwen3.5-4b', { autoDownload: true })`.

Overrides: `$QWEN35_4B_GGUF` / `$QWEN36_35B_GGUF` (file paths), `$LLAMA_BIN`, `$LLAMA_PORT`,
`$LLAMA_KV`, `$LLAMA_CTX`.

## Other runtimes

Implement `ModelRuntimePort` (`status` / `ensureModel` / `ensureServer`) and pass it:
`localModel('qwen3.5-4b', { runtime: myRuntime })`. The port is the seam — aliases, consent flow and
the agent side stay unchanged.
