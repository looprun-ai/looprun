# looprun

**A governance layer for LLM agents, on top of the framework you already use.**

Your agent framework is the car — the engine that runs the *think → call tool → reply* loop.
looprun adds everything that makes it safe to hand the keys to an agent:

- **The map** — an `AgentSpec`: which tools, in what order, under which state conditions, with what persona and behavior.
- **The safety kit** — typed **deterministic guards** (seatbelt, airbag, speed limiter): every rule is a
  machine-checked `check()` paired with the LLM-facing `prose()` rendered into the prompt. Guards read
  tool args, world state and the agent's own verified actions — **never the user's text**, so a clever
  prompt can't steer them.
- **The GPS with course-correction** — when the reply violates its checks, a bounded no-tools *redrive*
  corrects it; when correction fails, a **deterministic honest-abstain closure** (a pure function of what
  verifiably happened) goes out instead of a fabrication.
- **The map generator** — the [`agentspec` skill](skills/agentspec/SKILL.md) interviews you (one
  question), then generates the specs, the theme, the tool world **and the eval set that certifies them**.

The governed agent is still a **genuine Mastra `Agent`** — it registers in your Mastra instance and shows
up in Mastra Studio with the guards enforcing live.

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

Local models are first-class — the two validated tiers run on llama.cpp with measured flags:

```ts
import { localModel } from 'looprun/models'

model: await localModel('qwen3.5-4b')       // ~2.9 GB — 8–16 GB machines
model: await localModel('qwen3.6-35b-a3b')  // ~21 GB — best local quality (32 GB+)
```

## Install

```bash
npm i looprun @mastra/core ai zod        # the library
npx skills add looprun --skill agentspec # the generator skill (Claude Code / compatible agents)
npm i -D @looprun/eval                   # the eval harness (certification)
npx looprun init                         # environment check + optional local-model download
```

## The workflow

1. **Generate** — invoke the `agentspec` skill with one sentence (“*assistant for a small accounting
   firm*”). It decomposes the tool surface into ≤15-tool agents, drafts each `AgentSpec` + the domain
   theme, and generates an eval set — every artifact validated by adversarial debate
   ([BARRED](https://arxiv.org/abs/2604.25203)-style), never by self-review.
2. **Measure** — `npx looprun-eval run` executes the eval set against the real loop
   (invariant gate: deterministic auto-fails), then the Claude judge grades the rubric.
   Fix, re-screen, iterate (≤3 rounds).
3. **Certify** — `npx looprun-eval certify` (N=3) at the ≥90% bar → `CERT.md`. Your agents ship with a
   birth certificate, not vibes.
4. **Run** — register the `LoopRunAgent`s in your Mastra instance; `mastra dev` opens Studio with the
   guards live.

## Packages

| package | what |
|---|---|
| `looprun` | umbrella — `looprun/core`, `looprun/mastra`, `looprun/models` (+ the `looprun` CLI) |
| `@looprun/core` | AgentSpec + guards + trunk renderer + the framework-free governed-turn machine |
| `@looprun/mastra` | `LoopRunAgent` (a real Mastra Agent), `compileSpec` primitives, the conversation runner |
| `@looprun/models` | validated local models (llama.cpp `ModelRuntimePort`) + the cloud validation model |
| `@looprun/eval` | the `looprun-eval` CLI: run / judge / certify / lint |
| `@looprun/vercel` | reserved — the Vercel AI SDK backend seam |

## Docs

- [Overview](docs/overview.md) — the concepts and the design laws
- [Getting started](docs/getting-started.md)
- [The agentspec skill](docs/guides/skill.md) · [The measured loop](docs/guides/measured-loop.md)
- [Eval config reference](docs/guides/eval-config.md) · [Local models](docs/guides/local-models.md) · [MCP & native tools](docs/guides/mcp-tools.md)
- [Examples](docs/examples.md)

## Credits

looprun's generation-and-evaluation methodology — debate-validated synthetic policies and eval sets,
iterated against a measured bar — is based on **BARRED: Synthetic Training of Custom Policy Guardrails
via Asymmetric Debate** (arXiv:2604.25203v1, https://arxiv.org/abs/2604.25203; reference implementation:
https://github.com/plurai-ai/BARRED).

MIT © looprun
