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
- **The receipt** — every reply carries the engine's own **operation record**, composed from the agent's
  verified declaration and the world ledger, never from its prose. A turn that changed nothing says so:

  ```
  message   Done — I cancelled your dentist appointment on 2026-03-03 at 09:00.
  record    No operation was carried out on this turn.
  ```

  The engine does not stop that sentence; it makes sure the reader never gets it alone. On a turn that
  carried out nothing it also asks one closed question and rewrites the prose when the answer says the
  reader would be misled.
- **The judgment call** — an `llmCheck` guard binds a rubric to a genuine judgement call, answered by an
  adjudicator on the turn's own model under an isolated call: no persona, no tools, no memory. It is a
  separate, measured layer, not a substitute for the deterministic guards above — binding a rubric never
  makes the prose channel deterministic, and its miss rate is a stated, per-model number, not a proof.
- **The map generator** — the **agentspec** skill (private beta, developed in its own repo) interviews you:
  **one mandatory question** — the purpose, in one sentence — and generates the specs, the domain
  contract, the tool world **and the eval set that certifies them**. Writing a spec by hand is a fully
  supported path, and it is the path the tutorial teaches.

looprun is **framework-agnostic by construction**: the spec, the guards and the governed-turn machine are
framework-free in `@looprun-ai/core`, and a thin *backend* binds them to a host framework. Mastra is the
backend that ships today — the governed agent is a **genuine Mastra `Agent`**, registers in your Mastra
instance and shows up in Mastra Studio with the guards enforcing live. The Vercel AI SDK backend is the
next seam (`@looprun-ai/vercel` — reserved, factory still throws). Anything else can already call a
governed agent over HTTP: `@looprun-ai/server` exposes it behind an OpenAI-compatible
`/v1/chat/completions` endpoint.

## Install

```bash
npm i looprun @mastra/core ai zod        # the library + the Mastra backend's peers
```

That is everything needed to *run* a governed agent. To **certify** one, add the dev toolchain:

```bash
npm i -D @looprun-ai/eval mastra typescript tsx      # the certification CLI + the dev runtime
npx looprun init                                     # environment check (+ optional local-model download)
```

`looprun` is the umbrella: it bundles core + mastra + models and installs the `looprun` CLI.
`@looprun-ai/eval` is deliberately **outside** it — the certification harness is a dev tool, nothing
imports it at runtime, and shipping it into production dependencies buys nothing.

## Hello world

A governed agent answering a real turn, in about twenty lines
([chapter 02](docs/tutorial/02-hello-world.md) builds it line by line):

```ts
import { LoopRunAgent } from 'looprun/mastra'
import { helloSchedulerSpec } from './scheduler/hello-spec.js'
import { listEventsTool } from './scheduler/tools.js'
import { SchedulerWorld } from './scheduler/world.js'

const agent = new LoopRunAgent({
  spec: helloSchedulerSpec,             // the spec carries its guards, persona and domain contract
  world: () => new SchedulerWorld(),    // a factory: one world per session
  toolDefs: [listEventsTool],
  model: 'google/gemini-3.1-flash-lite',// any Mastra router string or AI-SDK model — trivial swap
})

const result = await agent.generate('What is on my calendar this week?', {
  loopRun: { sessionId: 'demo' },
})
console.log(result.text)                // the governed reply
```

`result.looprun` carries what the safety kit did on that turn: vetoes, redrives, violations and the
tool calls the agent actually made.

## The tutorial

`docs/tutorial/` is the only guide: six chapters, one running example — a calendar assistant grown
from a single purpose sentence into a certified agent. Every code block is compiled in CI against the
published packages, so nothing here can drift from what ships.

| # | chapter | what you get |
|---|---|---|
| 01 | [Concepts](docs/tutorial/01-concepts.md) | the mental model — the three nouns every later chapter hangs off, and why the architecture is shaped this way. No code |
| 02 | [Hello world](docs/tutorial/02-hello-world.md) | a governed agent answering a real turn, in about twenty lines. Three symbols |
| 03 | [Agent anatomy](docs/tutorial/03-agent-anatomy.md) | what a spec declares, what a world provides, where the tool surface comes from, and how a rule binds to a moment in the turn |
| 04 | [Guards](docs/tutorial/04-guards.md) | the complete rule vocabulary — 21 factories, what each prevents, one example each — and how to write your own |
| 05 | [Running and eval](docs/tutorial/05-running-and-eval.md) | running a spec over a scripted conversation, and turning "it seemed fine" into a number you can re-run |
| 06 | [Advanced](docs/tutorial/06-advanced.md) | the same agent served over HTTP, run on a local model with no cloud key, and driven by a host whose tools execute themselves |

## Certify

```bash
npx looprun-eval run  --subject <dir>     # runs the cases against the real loop → <subject>/test/<run>/
npx looprun-eval fold --dump <run>/cases.jsonl --verdicts <run>/verdicts.jsonl   # → RESULTS.md
npx looprun-eval cert <run>               # ≥90% bar → cert.json + CERT.md
```

The invariant gate auto-fails deterministic violations and every case dumps a trace; the LLM judge
grades them and `fold` merges the verdicts. `cert.json` and `CERT.md` are the artifact: the model,
the case count, the final pass rate, the bar it was measured against and `reps: 1` stated explicitly —
the full protocol is [chapter 05](docs/tutorial/05-running-and-eval.md).

## Local models

Local models are a supported target — three run tiers of one validated model (plus a small-RAM fallback) run on
[llama.cpp](https://github.com/ggml-org/llama.cpp) with measured flags, including lossless
multi-token-prediction speculative decoding (~1.4× decode, byte-identical output at temp 0):

| tier | model · quant | weights | measured |
|---|---|---|---|
| **`ram24`** (DEFAULT) | Qwen3.6-35B-A3B UD-IQ2_XXS + MTP | 11.8 GB | ~56 tok/s · **peak RSS ~20.7 GB** (fits 24 GB) |
| `ram32` (quality-max) | Qwen3.6-35B-A3B UD-Q3_K_XL + MTP | 17.2 GB | ~58 tok/s · f16 KV @ 64k ctx + 16 GB trunk cache |
| `ram16` | Qwen3.6-35B-A3B UD-IQ2_XXS + MTP | 11.8 GB | ~44 tok/s · **peak RSS 13.4–13.5 GB** (q8_0 KV, 24k ctx) |
| `ram8` | Qwen3.5-4B UD-Q3_K_XL + MTP | 2.5 GB | ~43 tok/s · **peak RSS 4.62 GB** — quality far below the 35B tiers |

```ts
import { localModel } from 'looprun/models'

model: await localModel('ram24')       // ram8 · ram16 · ram24 (default) · ram32
```

The weights are a separate, explicit download (`npx looprun models pull ram24`) — GGUF files are
2.5–17 GB, so they are not in the npm package and looprun never fetches them behind your back.
Cloud models need none of this: pass a router string as `model` and skip this section entirely.
[Chapter 06](docs/tutorial/06-advanced.md) has the tiers, the `llama-server` requirement (build
**≥ b9780**) and the CLI in full.

## Packages

| package | what |
|---|---|
| `looprun` | umbrella — `looprun/core`, `looprun/mastra`, `looprun/models`, `looprun/vercel` (+ the `looprun` CLI) |
| `@looprun-ai/core` | `AgentSpec` + the 21 guard factories — the teaching surface. The trunk renderer and the governed-turn machine ship too, but on `@looprun-ai/core/internal` (no compatibility promise) |
| `@looprun-ai/mastra` | `LoopRunAgent` (a real Mastra Agent), `runSpecConversation`, `worldFromTools` |
| `@looprun-ai/models` | validated local models (llama.cpp `ModelRuntimePort`) + the cloud validation model |
| `@looprun-ai/eval` | the `looprun-eval` CLI: run / fold / cert / lint / seal (dev dependency) |
| `@looprun-ai/server` | OpenAI-compatible `/v1/chat/completions` server for governed agents |
| `@looprun-ai/vercel` | reserved (also `looprun/vercel`) — the Vercel AI SDK backend seam. The contract is documented in its README; the primitives it names live on `@looprun-ai/core/internal`. Factory still throws |

## Benchmarks

| Benchmark | Question it answers | Scale | Headline (governed vs ungoverned) | Where |
|---|---|---|---|---|
| **τ²-Bench Telecom** | Does adding the looprun protocol lift a raw model on a public agent benchmark? | paired: raw model vs model + looprun protocol | in progress | [looprun-bench](https://github.com/looprun-ai/looprun-bench) |

Benchmark editions are pinned to looprun releases (current edition: **v0.6.0**). Method and full
results: [docs/benchmarks.md](docs/benchmarks.md).

## Credits

looprun's generation-and-evaluation methodology — debate-validated synthetic policies and eval sets,
iterated against a measured bar — is based on **BARRED: Synthetic Training of Custom Policy Guardrails
via Asymmetric Debate** (arXiv:2604.25203v1, https://arxiv.org/abs/2604.25203; reference implementation:
https://github.com/plurai-ai/BARRED).

Apache-2.0 © LoopRun Team
