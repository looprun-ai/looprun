# @looprun-ai/eval

The subject runner: executes a generated subject's cases against a model target
(governed or ungoverned arm), dumps per-case traces for the LLM judge, folds
verdicts, and certifies against the bar.

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

## run → judge → fold → cert

```sh
looprun-eval run --subject <dir>                 # target from ask/targets.json
looprun-eval run --subject <dir> --model <id> --base-url <url> --api-key-env <ENV>
looprun-eval run --subject <dir> --ungoverned    # same bundle, governance surface emptied
```

`run` writes `<subject>/test/<date>-<model>-<arm>/` (override `--out`): `cases.jsonl`
(one CaseDump per line) + `SUMMARY.md`. Invariants (`requiredToolCalls` must succeed;
`forbiddenToolCalls` fail on the ATTEMPT, even when the world refuses) are the
deterministic gate only — never the quality verdict.

The LLM judge (the coding agent running the skill) reads `cases.jsonl` and writes
`verdicts.jsonl` (`{caseId, verdict: "pass"|"fail", reasons: []}`), then:

```sh
looprun-eval fold --dump <dir>/cases.jsonl --verdicts <dir>/verdicts.jsonl   # → RESULTS.md
looprun-eval cert <dir> [--bar 0.9] [--date <iso>] [--note <text>]           # → cert.json + CERT.md
```

Final pass = invariants AND judge; a missing verdict counts FAIL, loudly. The cert is
N=1-honest: it states `reps: 1` explicitly; multi-rep aggregation is a later, separate
artifact. `--date` supplies `generatedAt` (no wall-clock default).

## Provider matrix

| target | client | defaults |
|---|---|---|
| `gemini*` (no `--base-url`) | native Google provider | thinking OFF (`--thinking` re-enables) |
| anything else | OpenAI-compatible (`--base-url`) | temperature 0 |
| localhost base-url | OpenAI-compatible | runaway brakes: pinned decoding + 2048-token cap + repeated-tool-call stop |

Key: `--api-key-env <ENV>` (or `MODEL_API_KEY`; fallback `"local"`).

## Trunk-static gate

Before any run with ≥2 distinct presets, each agent's trunk must be byte-identical across
presets and all agents must share an identical head (the contract voice). A failure BLOCKS
the run — byte-identical trunks are what a local prefix cache reuses; fix the
spec/contract, never run cold.

## Test

```sh
pnpm -C packages/eval test   # scripted fake model through the real governed loop, no API
```
