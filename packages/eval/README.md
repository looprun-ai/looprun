# @looprun-ai/eval

The subject runner: executes a generated subject's cases against a model target
(governed or ungoverned variant), dumps per-case traces for the LLM judge, folds
verdicts, and certifies against the bar.

The protocol is taught in the tutorial:
[01 · Concepts](https://github.com/looprun-ai/looprun/blob/main/docs/tutorial/01-concepts.md) — six
chapters, one running example; chapter 05 owns run → judge → fold → cert.

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

## Verbs

| verb | does |
|---|---|
| `validate` | offline preflight — load the subject, check schema + references + premise, plus the world layers when the subject ships `gen/world.json` (preset distinguishability · simulate≡confirm identity · determinism); RED blocks a run before any spend. |
| `lint` | the artifact laws over the sources and the assembled specs; `--spec-laws --subject <dir>` adds the subject battery (see below). |
| `run` | one variant through the governed (or `--ungoverned`) loop → `cases.jsonl` + `SUMMARY.md`. |
| `judge-input` | blind per-turn judge inputs from a run dir (`--chunk N` splits into parts) — what the judge reads. |
| `fold` | verdicts → `RESULTS.md`; `--sync <dirA> <dirB> …` forces one verdict per byte-identical transcript class across reps → `verdicts.synced.jsonl` + `SYNC.md`. |
| `cert` | one dir → `cert.json` + `CERT.md`; `<r0> <r1> …` → `cert-range.json` + `CERT-RANGE.md` (FLOOR-over-reps law); `--verdicts <file>` picks the synced set. |
| `campaign run\|status\|resume` | the orchestrated path — everything below, as one verb. |

### The hand path: run → judge → fold → cert

```sh
looprun-eval validate --subject <dir>            # offline: refuse a RED exam before spending
looprun-eval run --subject <dir>                 # target from ask/targets.json
looprun-eval run --subject <dir> --model <id> --base-url <url> --api-key-env <ENV>
looprun-eval run --subject <dir> --ungoverned    # same prompt, enforcement disarmed (prose-only baseline)
```

`run` writes `<subject>/test/<date>-<model>-<variant>/` (override `--out`): `cases.jsonl`
(one case dump per line) + `SUMMARY.md`. Invariants (`requiredToolCalls` must succeed;
`forbiddenToolCalls` fail on the ATTEMPT, even when the world refuses) are the
deterministic gate only — never the quality verdict.

A subject whose spec binds an `llmCheck` question needs no wiring here: `run` supplies no judge, so
`runSpecConversation` resolves one from the case's own model for every turn. A host that wants its own
judge behind every bound question supplies it on the runtime deps instead — the runner exposes no flag
for it, because it is a model seam, never a config value. `LoopRunAgent` and `compileSpec` resolve
nothing: a spec bound for either registers a judge or fails loud at construction.

The LLM judge (the coding agent running the skill) reads `judge-input` chunks and writes
`verdicts.jsonl` (`{caseId, verdict: "pass"|"fail", reasons: []}`), then:

```sh
looprun-eval judge-input --dir <dir> --chunk 10                              # → judge-input.part*.jsonl
looprun-eval fold --dump <dir>/cases.jsonl --verdicts <dir>/verdicts.jsonl   # → RESULTS.md
looprun-eval fold --sync <r0> <r1> …                                         # → verdicts.synced.jsonl + SYNC.md
looprun-eval cert <dir> [--bar 0.9] [--date <iso>] [--note <text>]           # → cert.json + CERT.md
looprun-eval cert <r0> <r1> … [--verdicts verdicts.synced.jsonl]             # → cert-range.json (FLOOR law)
```

Final pass = invariants AND judge; a missing verdict counts FAIL, loudly. A single-dir
`cert` is N=1-honest (`reps: 1`); the range form certifies only when the FLOOR over reps
clears the bar. `--date` supplies `generatedAt` (no wall-clock default).

### The orchestrated path: `campaign`

One verb runs the whole measured campaign, in place of dozens of hand invocations:

```sh
looprun-eval campaign run <campaign.json>    # preflight → K governed reps + control → judging PAUSE
looprun-eval campaign status <out>           # per-phase progress from the dirs alone (no daemon)
looprun-eval campaign resume <out>           # verify verdicts → monitor gate → fold --sync → cert range
```

`campaign run` preflights (`validate` green + env keys present), runs K governed reps plus
the ungoverned control (each an immutable dir sealed with a `DONE` marker), writes blind
`judge-input` chunks, then PAUSES with a machine-readable `judging.json` manifest for the
host to dispatch judge subagents against. After verdicts land, `campaign resume` verifies
the counts, gates on the always-armed monitor (an unresolved incident blocks cert), folds
with `--sync` across the governed reps, folds the control variant to its own `RESULTS.md`
(A/B, never in the range), and emits the `cert-range.json` — the only source of the number.

## The subject laws `--spec-laws` adds

Three of them read the subject's own presets and its per-lane routing, so they are decidable offline —
no key, no model:

| finding | what it reads | what it demands |
|---|---|---|
| `WRITE-REFUSED-UNGATED` | each preset a case declares, compared against `default`, and every spec that carries the write | a write the world refuses BY STATE must have a spec-side gate that denies there, or the refusal reaches the model as a tool failure and the reply invents its reason. `contract.changeAllowed` closes it for every lane at once |
| `TARGET-SILENT-ON-EVERY-PRESET` | the world gate a case targets, evaluated on the case's preset with an empty action history | a target must be able to DENY on a preset the case runs; a gate that is silent before the agent has done anything grades nothing |
| `GUARD-ID-POSITIONAL` | every bound guard id on the assembled specs | an id minted from the install counter (`agent:custom#3`) re-points every case and profile that names it the moment a guard is inserted above; pass an explicit `{ id }` |

`GUARD-NEVER-TARGETED` is keyed per `(agent, guardId)`: a guard id is not unique across lanes, so a
case targeting `agent:sharedGate` on one lane says nothing about the copy on another. Its repair is a
case or a preset — the finding names both and offers no third.

## Provider matrix

| target | client | defaults |
|---|---|---|
| `gemini*` (no `--base-url`) | native Google provider | thinking OFF (`--thinking` re-enables) |
| anything else | OpenAI-compatible (`--base-url`) | temperature 0 |
| localhost base-url | OpenAI-compatible | runaway brakes: pinned decoding + 2048-token cap + repeated-tool-call stop |

Key: `--api-key-env <ENV>` (or `MODEL_API_KEY`; fallback `"local"`).

## AssembledPrompt-static gate

Before any run with ≥2 distinct presets, each agent's assembled prompt must be byte-identical across
presets and all agents must share an identical head (the contract voice). A failure BLOCKS
the run — byte-identical assembled prompts are what a local prefix cache reuses; fix the
spec/contract, never run cold.

## Test

```sh
pnpm -C packages/eval test   # scripted fake model through the real governed loop, no API
```
