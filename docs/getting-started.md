# Getting started

## 1. Install

```bash
npm i looprun @mastra/core ai zod
npm i -D @looprun-ai/eval mastra typescript tsx
npx skills add looprun-ai/looprun --skill agentspec   # the generator skill (Claude Code / compatible)
```

Environment check (+ optional local model download):

```bash
npx looprun init                       # shows what's missing
npx looprun models pull qwen3.5-4b     # optional: the ~2.9 GB local tier
```

For the cloud validation model set `GOOGLE_GENERATIVE_AI_API_KEY` in `.env`.

## 2. Generate your agents (recommended path)

In your project, invoke the **agentspec** skill and answer one question — the agent's purpose, one
sentence. The skill generates `src/agents/<domain>/` (specs + theme), `src/world/` (tool world),
`evals/` (the eval set) and wires `looprun.eval.config.ts`. See
[the skill guide](guides/skill.md).

## 3. Or write a spec by hand

```ts
// src/agents/nursery/care-spec.ts
import { AgentSpecBase, precondition, requiresBefore } from 'looprun'
import { NURSERY_THEME } from './theme.js'

export class CareSpec extends AgentSpecBase {
  constructor() {
    super({
      id: 'care',
      mode: 'CARE',
      persona: 'You are the plant-care agent: watering, repotting and care plans.',
      tools: ['listPlants', 'waterPlant', 'repotPlant'],
      destructiveTools: ['repotPlant'],       // auto-installs confirm-first + throttle
      behavior: ['Water before repotting when both are requested.'],
      theme: NURSERY_THEME,                   // the shared domain theme (one object per domain)
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
npx looprun-eval check      # config + world seams, no LLM
npx looprun-eval run        # N=1 screen (invariant gate) → judge with Claude → merge
npx looprun-eval certify    # N=3 at the ≥90% bar → eval-results/…-cert/CERT.md
```

The full protocol: [the measured loop](guides/measured-loop.md).
