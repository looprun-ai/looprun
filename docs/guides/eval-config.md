# Eval reference

The eval CLI is a **subject runner**: it reads a self-contained subject directory, not a project
config file.

> **Deprecated:** the old `looprun.eval.config.ts` walk-up flow — and the `init`, `check`,
> `certify` and `judge-merge` verbs that served it — was replaced by the subject-dir flow below
> (`run` / `fold` / `cert`). Some examples in this repo still carry the deprecated config type
> imports; treat those as legacy.

## Subject layout

```
subject/
├── norms/index.ts     SPECS (agent-id → AgentSpec) + CONTRACT (+ optional CASE_AGENT routing)
├── gen/world.ts       deterministic world: `worldFactory` export, or a class with exec()
├── gen/tools.json     tool defs (`parameters` or `inputSchema`; array or { tools: [] })
├── evals/cases.ts     the case pack (default export or `cases`)
└── ask/targets.json   declared model target — the transparent default; flags/env override
```

Subject modules may be `.ts`/`.mts` (needs a Node version with type stripping) or plain
`.js`/`.mjs`.

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

Invariant semantics: `anyArgs` is a shallow subset match with strict equality. `requiredToolCalls`
must succeed; a `forbiddenToolCalls` entry fails on the ATTEMPT, even when the world refuses.
Invariants are the deterministic gate only — never the quality verdict.

## Models

- The subject's declared target lives in `ask/targets.json` — the transparent default; CLI flags
  and env override it.
- `gemini*` targets (no `--base-url`) use the native Google provider with thinking OFF by default
  (`--thinking` re-enables; thinking is disabled with the **numeric** `thinkingBudget: 0` — a
  `thinkingLevel` value does NOT turn thinking off; looprun encodes this). Needs
  `GOOGLE_GENERATIVE_AI_API_KEY` — the only cloud key looprun ever asks for, and only for gemini
  targets; the library itself is model-agnostic.
- Anything else is OpenAI-compatible: `--model <id> --base-url <url> --api-key-env <ENV>`
  (or `MODEL_API_KEY`; fallback `"local"`), temperature 0. A localhost base-url adds runaway
  brakes: pinned decoding + 2048-token cap + repeated-tool-call stop.
- `--ungoverned` runs the same bundle with the governance surface emptied.

## Results layout

```
<subject>/test/<date>-<model>-<arm>/     # override with --out
  cases.jsonl                            # one CaseDump per line (the judge's input)
  SUMMARY.md
  verdicts.jsonl                         # written by the LLM judge
  RESULTS.md                             # looprun-eval fold
  cert.json  CERT.md                     # looprun-eval cert (commit these)
```

The cert is N=1-honest: it states `reps: 1` explicitly; multi-rep aggregation is a later,
separate artifact.

## CLI

`looprun-eval run | fold | cert | lint` — see `npx looprun-eval help` and
[`packages/eval/README.md`](../../packages/eval/README.md) (source of truth).
