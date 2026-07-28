# looprun

**A governance layer for AI agents, on top of the framework you already use.**

Your agent framework is the car — the engine that runs the *think → call tool → reply* loop.
looprun adds everything that makes it safe to hand the keys to an agent:

- **The map** — an `AgentSpec`: which tools, in what order, under which state conditions, with what persona and behavior.
- **The safety kit** — typed **deterministic guards** (seatbelt, airbag, speed limiter): every rule is a
  machine-checked `check()` paired with the LLM-facing `prose()` rendered into the prompt. A check reads
  tool arguments, world state, the agent's own verified actions and the reply it just drafted —
  **never the user's text**. That firewall *is* the guarantee, not a limitation: a user request only becomes
  real by turning into a tool call or a reply, and those are exactly what the guards inspect — so no
  phrasing ("ignore your rules", "the manager already approved it") can flip a verdict, and the same guard
  holds on any model, in any language.
- **The GPS with course-correction** — when the reply violates its checks, a bounded no-tools *redrive*
  corrects it; when correction fails, a **deterministic honest-abstain closure** (a pure function of what
  verifiably happened) goes out instead of a fabrication.
- **The map generator** — the **agentspec** skill (developed in its own private repo) interviews you:
  **one mandatory question** — the purpose, in one sentence — and everything else (tool surface, docs,
  provider, model, key) is a send-or-skip ask batched into two rounds. It then generates the specs, the
  contract, the tool world **and the eval set that certifies them**.

looprun is **framework-agnostic by construction**: the spec, the guards and the governed-turn machine are
framework-free in `@looprun-ai/core`, and a thin *backend* binds them to a host framework. Mastra is the
backend that ships today — the governed agent is a **genuine Mastra `Agent`**, registers in your Mastra
instance and shows up in Mastra Studio with the guards enforcing live. The Vercel AI SDK backend is the
next seam (`@looprun-ai/vercel` — contract documented, implementation pending). Anything else can already
call a governed agent over HTTP: `@looprun-ai/server` exposes it behind an OpenAI-compatible
`/v1/chat/completions` endpoint.

```ts
import { LoopRunAgent } from 'looprun/mastra'
import { bookkeepingSpec } from './src/agents/accounting/ac-books-spec.js'

export const booksAgent = new LoopRunAgent({
  spec: bookkeepingSpec,        // generated — carries its guards, persona and domain contract
  world,                        // your tool world (or pass native/MCP `tools` + a `stateView`)
  model: 'openai/gpt-5.5',      // any Mastra router string or AI-SDK model — trivial swap
})

const res = await booksAgent.generate('Close the Q2 books')
res.text          // the governed reply
res.looprun       // what the safety kit did: vetoes, redrives, violations, observed calls
```

## Local models

Local models are first-class — three run tiers of one validated model (plus a small-RAM fallback) run on
[llama.cpp](https://github.com/ggml-org/llama.cpp) with measured flags, including lossless
multi-token-prediction speculative decoding (~1.4× decode, byte-identical output at temp 0):

| tier | model · quant | weights | measured |
|---|---|---|---|
| **`ram24`** (DEFAULT) | Qwen3.6-35B-A3B UD-IQ2_XXS + MTP | 11.8 GB | ~56 tok/s · **peak RSS ~20.7 GB** (fits 24 GB) |
| `ram32` (quality-max) | Qwen3.6-35B-A3B UD-Q3_K_XL + MTP | 17.2 GB | ~58 tok/s · f16 KV @ 64k ctx + 16 GB trunk cache |
| `ram16` | Qwen3.6-35B-A3B UD-IQ2_XXS + MTP | 11.8 GB | ~44 tok/s · **peak RSS 13.4–13.5 GB** (q8_0 KV, 24k ctx) |
| `ram8` | Qwen3.5-4B UD-Q3_K_XL + MTP | 2.5 GB | ~43 tok/s · **peak RSS 4.62 GB** — quality far below the 35B tiers |

The weights column is the **model file**, not the machine's RAM budget: a tier's real footprint is
weights + KV cache + the prompt cache that keeps agent trunks warm across agent switches (measured on
`ram24`: 11.8 GB of weights → ~20.7 GB peak). That is why the 32 GB tier's file is "only" 17.2 GB — the
rest of the headroom buys a 64k f16 KV window and a 16 GB trunk cache.

```ts
import { localModel } from 'looprun/models'

model: await localModel('ram24')       // ram8 · ram16 · ram24 (default) · ram32
```

**Requirements** — a `llama-server` build **≥ b9780** (older builds cannot load the Qwen3.5/3.6 family):
grab a [release](https://github.com/ggml-org/llama.cpp/releases) or build from source. looprun resolves the
binary via `$LLAMA_BIN` → a `llamacpp-*` build directory in your home → `llama-server` on `PATH`.

**The weights are a separate, explicit download.** GGUF files are 2.5–17 GB, so they are not in the npm
package and looprun never fetches them behind your back: `localModel()` fails fast when the file is
missing rather than starting a multi-GB download on an agent's first turn. You pull a tier once, by name:

```bash
npx looprun models pull ram24     # downloads that tier's weights (asks for consent, prints the size)
npx looprun models status         # binary / weights file / server health
npx looprun models serve ram24    # starts llama-server with the measured flags
```

Any alias works — `qwen3.5-4b` is the plain 4B fallback (~2.9 GB, no MTP) for a quick local smoke test.
Cloud models need none of this: pass a router string as `model` and skip this section entirely.

## Install

```bash
npm i looprun @mastra/core ai zod        # the library + the Mastra backend's peers
```

That is everything needed to *run* a governed agent. To **generate and certify** agents with the skill —
the path in "How to use" below — add the dev toolchain:

```bash
npm i -D @looprun-ai/eval mastra typescript tsx      # the certification CLI + the dev runtime
npx skills add looprun-ai/agentspec                  # the generator skill (any skills-compatible coding agent)
npx looprun init                                     # environment check (+ optional local-model download)
```

The `agentspec` skill is in **private beta** — its repo is not public yet, so `skills add` needs access
(request it at [looprun.ai](https://looprun.ai)). Everything else here is public, and writing specs by hand
is a fully supported path.

`looprun` is the umbrella: it bundles core + mastra + models and installs the `looprun` CLI.
`@looprun-ai/eval` is deliberately **outside** it — the certification harness is a dev tool, nothing imports
it at runtime, and shipping it into production dependencies buys nothing. You can also start with
`npm i looprun` alone: the skill checks for the engine before it runs a single phase, and for the eval CLI
before the TEST phase, offering to install whatever is missing.

## How to use

### 1 · Generate the agents

Invoke the `agentspec` skill in your project and answer the one mandatory question (“*an assistant for a
small accounting firm*”). It decomposes the tool surface into ≤15-tool agents, drafts each `AgentSpec` +
the shared domain contract, builds the deterministic tool world, and generates the eval set — every
artifact validated by adversarial debate ([BARRED](https://arxiv.org/abs/2604.25203)-style), never by
self-review. Output: a subject bundle the eval CLI reads.

Writing a spec by hand is a supported path too — see
[getting started](docs/getting-started.md#3-or-write-a-spec-by-hand).

### 2 · Run it

```ts
// src/mastra/index.ts
import { Mastra } from '@mastra/core'
import { LoopRunAgent } from 'looprun/mastra'
import booksSpec from '../agents/accounting/ac-books-spec.js'

export const booksAgent = new LoopRunAgent({ spec: booksSpec, world, model: 'openai/gpt-5.5' })
export const mastra = new Mastra({ agents: { booksAgent } })
```

```bash
npx mastra dev     # Mastra Studio: chat with the agent and watch the guards veto live
```

### 3 · Measure

```bash
npx looprun-eval run --subject <dir>      # runs the cases against the real loop → <subject>/test/<run>/
```

The invariant gate auto-fails deterministic violations, and every case dumps a trace; the LLM judge grades
them and `looprun-eval fold` merges the verdicts into `RESULTS.md`. Fix, re-screen, iterate (≤3 rounds).

```bash
npx looprun-eval fold --dump <run>/cases.jsonl --verdicts <run>/verdicts.jsonl
```

### 4 · Certify

```bash
npx looprun-eval cert <run>               # ≥90% bar → cert.json + CERT.md
```

Your agents ship with a birth certificate, not vibes. The full protocol:
[the measured loop](docs/guides/measured-loop.md).

### 5 · Serve it elsewhere (optional)

`@looprun-ai/server` puts a governed agent behind an OpenAI-compatible `/v1/chat/completions` endpoint, so
any harness that speaks the OpenAI protocol can call it as if it were a model — the whole governed turn
(guards, tools, redrive) runs inside the request.

## Packages

| package | what |
|---|---|
| `looprun` | umbrella — `looprun/core`, `looprun/mastra`, `looprun/models` (+ the `looprun` CLI) |
| `@looprun-ai/core` | AgentSpec + guards + trunk renderer + the framework-free governed-turn machine |
| `@looprun-ai/mastra` | `LoopRunAgent` (a real Mastra Agent), `compileSpec` primitives, the conversation runner |
| `@looprun-ai/models` | validated local models (llama.cpp `ModelRuntimePort`) + the cloud validation model |
| `@looprun-ai/eval` | the `looprun-eval` CLI: run / fold / cert / lint (dev dependency) |
| `@looprun-ai/server` | OpenAI-compatible `/v1/chat/completions` server for governed agents |
| `@looprun-ai/vercel` | reserved — the Vercel AI SDK backend seam: contract documented, factory still throws |

## Benchmarks

| Benchmark | Question it answers | Scale | Headline (governed vs ungoverned) | Where |
|---|---|---|---|---|
| **Atlas** | Do declarative guards beat a raw ReAct loop on a business agent generated from one sentence? | 61 cases × 5 agents (generated from a single sentence); 13 cloud models, N=3 | governed **96.5** vs ungoverned **92.6** — every fabrication / one-shot-destructive incident was in the ungoverned arm | [looprun-bench](https://github.com/looprun-ai/looprun-bench) |
| **τ²-Bench Telecom** | Does adding the looprun protocol lift a raw model on a public agent benchmark? | paired: raw model vs model + looprun protocol | in progress | [looprun-bench](https://github.com/looprun-ai/looprun-bench) |

Benchmark editions are pinned to looprun releases (current edition: **v0.6.0**; the next patch **v0.6.1**
re-certifies the anchors without re-running the matrix).

## Docs

- [The illustrated guide](docs/illustrated-guide.md) — the visual front-door: the whole picture in one sitting
- [Overview](docs/overview.md) — the concepts and the design laws
- [Getting started](docs/getting-started.md)
- [The measured loop](docs/guides/measured-loop.md)
- [Eval config reference](docs/guides/eval-config.md) · [Local models](docs/guides/local-models.md) · [MCP & native tools](docs/guides/mcp-tools.md)
- [Examples](docs/examples.md)
- [Benchmarks](docs/benchmarks.md) — τ²-bench + **Atlas** (governed 96.5 vs ungoverned 92.6 over 13 cloud models, N=3 — data in [looprun-bench](https://github.com/looprun-ai/looprun-bench))

## Credits

looprun's generation-and-evaluation methodology — debate-validated synthetic policies and eval sets,
iterated against a measured bar — is based on **BARRED: Synthetic Training of Custom Policy Guardrails
via Asymmetric Debate** (arXiv:2604.25203v1, https://arxiv.org/abs/2604.25203; reference implementation:
https://github.com/plurai-ai/BARRED).

Apache-2.0 © LoopRun Team
