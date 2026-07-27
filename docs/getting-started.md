# Getting started

## 1. Install

```bash
npm i looprun @mastra/core ai zod
npm i -D @looprun-ai/eval mastra typescript tsx
npx skills add looprun-ai/looprun --skill agentspec   # the generator skill (any skills-compatible coding agent)
```

Environment check (+ optional local model download):

```bash
npx looprun init                       # shows what's missing
npx looprun models pull qwen3.5-4b     # optional: the ~2.9 GB local tier
```

looprun itself is **model-agnostic** — `LoopRunAgent` takes any Mastra router string or AI-SDK
model, and no API key is required to use the library. One optional key exists: the certification
CLI's **default subject model** is `gemini-3.1-flash-lite-thinkoff` (a pinned, cheap ruler so
certified scores are comparable across projects), which needs `GOOGLE_GENERATIVE_AI_API_KEY` in
`.env`. To certify without any cloud key, point the eval at any OpenAI-compatible endpoint —
including a local one — with `npx looprun-eval run --subject <dir> --model <id> --base-url <url>
--api-key-env <ENV>`; see [the eval reference](guides/eval-config.md#models).

## 2. Generate your agents (recommended path)

In your project, invoke the **agentspec** skill and answer one question — the agent's purpose, one
sentence. The skill generates the specs + domain contract, the deterministic tool world, and the
eval set — the subject bundle the eval CLI reads.

## 3. Or write a spec by hand

```ts
// src/agents/nursery/care-spec.ts
import { AgentSpecBase, precondition, requiresBefore } from 'looprun'
import { NURSERY_CONTRACT } from './contract.js'

export class CareSpec extends AgentSpecBase {
  constructor() {
    super({
      id: 'care',
      mode: 'CARE',
      persona: 'You are the plant-care agent: watering, repotting and care plans.',
      tools: ['listPlants', 'waterPlant', 'repotPlant'],
      destructiveTools: ['repotPlant'],       // auto-installs confirm-first + throttle
      behavior: ['Water before repotting when both are requested.'],
      contract: NURSERY_CONTRACT,                   // the shared domain contract (one object per domain)
    })
    this.addGuard('preTool', ['waterPlant'], requiresBefore(['listPlants']), { id: 'agent:waterAfterList' })
    this.addGuard('preTool', ['repotPlant'],
      precondition((w) => w.plan === 'pro', 'Repotting needs the pro plan.'), { id: 'agent:repotPlan' })
  }
}
export default new CareSpec()
```

## 4. Make it an agent

```ts
// src/mastra/index.ts
import { Mastra } from '@mastra/core'
import { LoopRunAgent } from 'looprun/mastra'
import careSpec from '../agents/nursery/care-spec.js'
import { makeWorld } from '../world/world.js'
import { TOOL_DEFS } from '../world/tools.js'

export const careAgent = new LoopRunAgent({
  spec: careSpec,
  world: (sessionId) => makeWorld('default'),   // factory ⇒ multi-conversation
  toolDefs: TOOL_DEFS,
  model: 'openai/gpt-5.5',                      // swap freely: router string or AI-SDK model
})

export const mastra = new Mastra({ agents: { careAgent } })
```

```bash
npx mastra dev     # → Mastra Studio: chat with the agent, watch the guards veto live
```

## 5. Certify

```bash
npx looprun-eval run --subject <dir>   # execute the cases → <subject>/test/<date>-<model>-<arm>/
# LLM-judge cases.jsonl → verdicts.jsonl, then:
npx looprun-eval fold --dump <run>/cases.jsonl --verdicts <run>/verdicts.jsonl   # → RESULTS.md
npx looprun-eval cert <run>            # ≥90% bar → cert.json + CERT.md
```

The full protocol: [the measured loop](guides/measured-loop.md).
