# looprun

**A governance layer for AI agents, on top of the framework you already use.**

Your agent framework is the car — the engine that runs the *think → call tool → reply* loop.
looprun adds everything that makes it safe to hand the keys to an agent:

- **The map** — an `AgentSpec`: which tools, in what order, under which state conditions, with what persona and behavior.
- **The safety kit** — typed **deterministic guards** (seatbelt, airbag, speed limiter): every rule is a
  machine-checked `check()` paired with the LLM-facing `prose()` rendered into the prompt. Guards read
  tool args, world state and the agent's own verified actions — **never the user's text**, so a clever
  prompt can't steer them. 
  [REV: Why **never the user's text**? Doesn't this limit the guards?]
- **The GPS with course-correction** — when the reply violates its checks, a bounded no-tools *redrive*
  corrects it; when correction fails, a **deterministic honest-abstain closure** (a pure function of what
  verifiably happened) goes out instead of a fabrication.
- **The map generator** — the [`agentspec` skill](skills/agentspec/SKILL.md) interviews you (one
  question), then generates the specs, the theme, the tool world **and the eval set that certifies them**.
  [REV: think there are more than one question]

The governed agent is still a **genuine Mastra `Agent`** — it registers in your Mastra instance and shows
up in Mastra Studio with the guards enforcing live.
[REV: Mastra is junt one possible framework — looprun is framework-agnostic, and the same governance layer can be applied to any agent framework. For isntance, the Vercel AI SDK backend is in progress.]

```ts
import { LoopRunAgent } from 'looprun/mastra'
import { bookkeepingSpec } from './src/agents/accounting/ac-books-spec.js'

export const booksAgent = new LoopRunAgent({
  spec: bookkeepingSpec,        // generated — carries its guards, persona and domain theme
  world,                        // your tool world (or pass native/MCP `tools` + a `stateView`)
  model: 'openai/gpt-5.5',      // any Mastra router string or AI-SDK model — trivial swap
})

const res = await booksAgent.generate('Close the Q2 books')
res.text          // the governed reply
res.looprun       // what the safety kit did: vetoes, redrives, violations, observed calls
```

Local models are first-class — three run tiers of one validated model (plus a small-RAM fallback)
run on [llama.cpp](https://github.com/ggml-org/llama.cpp) with measured flags, including lossless
multi-token-prediction speculative decoding (~1.4× decode, byte-identical output at temp 0):

```ts
import { localModel } from 'looprun/models'

model: await localModel('ram24')       // DEFAULT — 24 GB machines, 11.8 GB, ~56 tok/s
model: await localModel('ram8')        // 8 GB machines — 4.62 GB, ~43 tok/s 
model: await localModel('ram16')       // 16 GB machines — 13.5 GB, ~44 tok/s
model: await localModel('ram32')       // 32 GB machines, quality-max — 17.2 GB, ~58 tok/s
[REV: review the memory of ram32 — 17.2 GB seems low for a 32 GB machine]
```

Requirements: a `llama-server` build **≥ b9780**
([releases](https://github.com/ggml-org/llama.cpp/releases), found via `$LLAMA_BIN` → `~/llamacpp-b9780/bin/llama-server` → `PATH`.[REV: don't use specific path - change all ocurrences in the repo]
Model weights download **consent-first** — never automatically on an agent's first turn:

```bash
npx looprun models pull qwen3.5-4b      # explicit download (or: npx looprun init, interactive)
npx looprun models status               # binary / model file / server health
```
[REV: this section is very confusing, it should be re-written to be more clear. What does looprun models pull qwen3.5-4b do? Does it download the model weights? Why it is necessary? Why qwen3.5-4b? ]

## Install
[REV: shouldn't be only npm i looprun? npm i -D @looprun-ai/eval is not automatically installed? VERY CONFUSED SECTION - Best to move to how to sections below]
```bash
npm i looprun @mastra/core ai zod        # the library
npx skills add looprun-ai/looprun --skill agentspec # the generator skill (any skills-compatible coding agent)
npm i -D @looprun-ai/eval                   # the eval harness (certification)
npx looprun init                         # environment check + optional local-model download
```

[REV: Instead of "The Workflow" section, I would add a "How to use" section with a step by step guide on how to use looprun. The workflow section is too abstract and not very useful for a new user. It should be more practical and show how to use the library in a real scenario. How-tos: Generate an agent, run it, evaluate it, certify it, etc. The workflow section is more of a high-level overview of the process, but it doesn't give enough details on how to actually use the library. It should be more practical and show how to use the library in a real scenario. How-tos: Generate an agent, run it, evaluate it, certify it, etc.]

## The workflow

1. **Generate** — invoke the `agentspec` skill with one sentence (“*assistant for a small accounting
   firm*”). It decomposes the tool surface into ≤15-tool agents, drafts each `AgentSpec` + the domain
   theme, and generates an eval set — every artifact validated by adversarial debate
   ([BARRED](https://arxiv.org/abs/2604.25203)-style), never by self-review.
2. **Measure** — `npx looprun-eval run` executes the eval set against the real loop
   (invariant gate: deterministic auto-fails), then the LLM judge grades the rubric.
   Fix, re-screen, iterate (≤3 rounds).
3. **Certify** — `npx looprun-eval certify` (N=3) at the ≥90% bar → `CERT.md`. Your agents ship with a
   birth certificate, not vibes.
4. **Run** — register the `LoopRunAgent`s in your Mastra instance; `mastra dev` opens Studio with the
   guards live.

## Packages

| package | what |
|---|---|
| `looprun` | umbrella — `looprun/core`, `looprun/mastra`, `looprun/models` (+ the `looprun` CLI) |
| `@looprun-ai/core` | AgentSpec + guards + trunk renderer + the framework-free governed-turn machine |
| `@looprun-ai/mastra` | `LoopRunAgent` (a real Mastra Agent), `compileSpec` primitives, the conversation runner |
| `@looprun-ai/models` | validated local models (llama.cpp `ModelRuntimePort`) + the cloud validation model |
| `@looprun-ai/eval` | the `looprun-eval` CLI: run / judge / certify / lint |
| `@looprun-ai/vercel` | reserved — the Vercel AI SDK backend seam |
[REV: review the above list]

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
- [The agentspec skill](docs/guides/skill.md) · [The measured loop](docs/guides/measured-loop.md)
- [Eval config reference](docs/guides/eval-config.md) · [Local models](docs/guides/local-models.md) · [MCP & native tools](docs/guides/mcp-tools.md)
- [Examples](docs/examples.md)
- [Benchmarks](docs/benchmarks.md) — τ²-bench + **Atlas** (governed 96.5 vs ungoverned 92.6 over 13 cloud models, N=3 — data in [looprun-bench](https://github.com/looprun-ai/looprun-bench))

## Credits

looprun's generation-and-evaluation methodology — debate-validated synthetic policies and eval sets,
iterated against a measured bar — is based on **BARRED: Synthetic Training of Custom Policy Guardrails
via Asymmetric Debate** (arXiv:2604.25203v1, https://arxiv.org/abs/2604.25203; reference implementation:
https://github.com/plurai-ai/BARRED).

Apache-2.0 © LoopRun Team
