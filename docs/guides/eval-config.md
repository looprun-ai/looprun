# Eval config reference

`looprun.eval.config.ts` at the project root — the eval contract AND the agentspec skill's project
sentinel. Default-export an `EvalConfig` (from `@looprun-ai/eval`):

```ts
import type { EvalConfig } from '@looprun-ai/eval'
import { SPECS, THEME } from './src/agents/accounting/index.js'
import { TOOL_DEFS } from './src/world/tools.js'
import { worldFactory } from './src/world/world.js'
import { CASES, CASE_MAP } from './evals/cases.js'

export default {
  domain: 'accounting',
  specs: SPECS,                 // agent-id → AgentSpec
  theme: THEME,                 // optional when every spec sets spec.theme
  worldFactory,                 // (preset, seed) => AgentWorld — deterministic per (preset, rep)
  toolDefs: TOOL_DEFS,          // JSON-schema tool defs, executed via world.exec
  cases: CASES,
  caseMap: CASE_MAP,            // agent-id → case ids; every case exactly once
  judgePromptPath: 'evals/judge-prompt.md',   // domain RULES only
  bar: 0.9,
} satisfies EvalConfig
```

## `EvalCase`

```ts
{
  id: '01-onboard-client',                 // NN-slug (validated)
  title: 'onboard a brand-new client',
  setup: { preset: 'client-onboarded' },   // a worldFactory preset
  turns: [{ userText: '…', attachments?: ['url'] }],
  expectations: {
    invariants: {                          // deterministic auto-fail gate (no LLM)
      requiredToolCalls: [{ name: 'createClient' }],
      forbiddenToolCalls: [{ name: 'deleteClient', anyArgs: { confirmed: true } }],
    },
    rubric: [{ id: 'creates-and-confirms', description: '…', critical: true }],
    goldSeq?: ['createClient'],            // reference, not ground truth
    goldReply?: ['…'],
  },
}
```

Invariant semantics: `anyArgs` is a shallow subset match with strict equality; a forbidden call fails
only if it **took effect** (guard-vetoed calls never reach the world, so they never trip a forbidden).

## Models

- Default subject: `gemini-3.1-flash-lite-thinkoff` — thinking is disabled with the **numeric**
  `thinkingBudget: 0` (a `thinkingLevel` value does NOT turn thinking off; looprun encodes this).
  Needs `GOOGLE_GENERATIVE_AI_API_KEY` — the only cloud key looprun ever asks for, and only when
  this default subject is used; the library itself is model-agnostic.
- Local: `--model qwen3.5-4b` / `--model qwen3.6-35b-a3b` (llama.cpp via `@looprun-ai/models`, pinned
  decoding temperature 0).
- Custom: `model: { model: myAiSdkModel, modelParams: {...}, label: 'mine' }` in the config.

## Results layout

```
eval-results/<date>-<domain>[-cert]/
  <agent>.dump.json / .autofail.json / .tasks.jsonl      # scratch (gitignored)
  <agent>.verdicts.jsonl / .judged.json                  # judge output (commit judged)
  cert.json  CERT.md                                     # commit
```

## CLI

`looprun-eval init | check | run | certify | judge-prompt | judge-merge | cert | lint` — see
`npx looprun-eval help`.
