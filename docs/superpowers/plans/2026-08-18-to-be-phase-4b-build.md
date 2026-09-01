# TO-BE Phase 4b Implementation Plan — eval's execution half + models

> **SUPERSEDED — 2026-09-01.** The deliverables were built directly on `packages/*` after the
> `856ac18` move (CLI facade, mastra adapter, server, eval's two halves, models, the phase-5
> closing driver) — this route died with the tree it targeted. The standing map remains
> `2026-08-12-to-be-blueprint-v3.md` as amended by the review resolution.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The measurement machinery as VERBS over a run dir — ExamRunner · monitor · judge-inputs · fold · sync · certify · seal — plus `packages/next/models`, gated by unit proofs per desk and 1–2 scripted E2E threads. No pausable campaign, no resume: the run dir is the only state.

**Architecture:** Spec §4 of `2026-08-18-to-be-phases-3-6-build-design.md` as corrected: each verb reads files, does one thing, writes files, exits. The runner constructs a LoopRunAgent per case through the public door and never drives a second loop.

**Tech Stack:** TypeScript ESM, vitest; eval gains no new deps (models: none beyond node).

## Global Constraints

- Everything English; AS-IS voice; plain-names stays exactly 130; no third-party model call anywhere (ScriptedModel only in tests).
- Branch `to-be-phase-4b`; triple gate per touched package after every task; absolute `pnpm -C` paths.
- Run-dir files are JSONL/JSON only; every verb is re-runnable and idempotent over its inputs.

### Task 1: run-dir vocabulary + ExamRunner
**Files:** eval `src/run-dir.ts` (paths + read/write helpers), `src/exam-runner.ts`, `test/exam-runner.test.ts`
- Consumes: `LoopRunAgent`/`UngovernedAgent` (next-mastra), `Subject` (loader), `ExamCase`.
- Produces: `runCase(subject, c, variant, model): Promise<CaseDump>`; `CaseDump = { case, variant, records: TurnRecord[], servedBy }`; `writeDump(runDir, dump)` as `dumps/<case>.<variant>.json`.
- [ ] RED on the mini-subject: a read case plays through generate; the approve turn resolves the OPEN question code from prior records (issued − consumed − closed), types `approve <code>`; multi-approve joins two codes in one message; `{ decline: true }` types the decline literal (`NO <hex>` from the open code); invariants checked: requiredToolCalls present in acts (args subset), noEffectToolCalls absent-or-effectless; a violated invariant marks the dump `invariantFailures[]` (data, not a throw); ungoverned variant runs the twin.
- [ ] Implement (~200 lines); gate; commit `feat(eval): ExamRunner — cases play the public door, approvals are typed`.

### Task 2: monitor + judge-inputs
**Files:** eval `src/monitor.ts`, `src/judge-inputs.ts`, tests
- Produces: `scan(runDir): MonitorReport` (typed `TurnFailure` kinds recorded by the runner in `failures.jsonl`; `resolve(runDir, hash, note)` writes `resolutions.jsonl`; a marker binds to its incident hash); `buildJudgeInputs(runDir): string[]` — blind chunked `judge-input.part*.jsonl` (no variant/model labels; user text, reply, acts, rule events, vetoed calls; chunk 10 cases/part).
- [ ] RED: a planted failure blocks (unresolved incident in the report); resolve clears exactly its hash; judge parts carry NO `variant`/`servedBy` keys and every case id exactly once; re-running overwrites identically.
- [ ] Implement; gate; commit `feat(eval): monitor and blind judge inputs`.

### Task 3: fold + sync + certify + seal
**Files:** eval `src/folder.ts`, `src/certifier.ts`, `src/seal.ts`, tests
- Produces: `fold(runDir): FoldReport` (verdicts.jsonl → per-case `pass|fail|unreadable`; missing verdict = FAIL loud; conflicting duplicate = divergence); `sync(runDir): SyncReport` (joins on case id + canonical call identity, never JSON.stringify of whole rows); `certify(runDirs, bar): Certification` (floor over K reps; held-out discipline: held-out cases excluded from fix reports, included here; unresolved incidents void); `seal(subjectDir): SealRecord` + `verify(subjectDir, seal): string[]` (sha256 over every subject file from a directory walk, not a hand list).
- [ ] RED per desk with canned files; gate; commit `feat(eval): fold, certify and the ship seal`.

### Task 4: packages/next/models
**Files:** `packages/next/models/{package.json,tsconfig.json,eslint.config.js}`, `src/{tiers.ts,llamacpp.ts,downloader.ts,index.ts}`, tests
- Produces: `tier(alias): TierSpec` (declared data, env escape hatches); `LlamaCppRuntime implements ModelRuntimePort` (binary resolution + launch recipe with DYLD child-env fallback; health check bound to the REQUESTED model id — never a bare ok); `Downloader.fetch(tier)` (HTTP-Range resume + sha256 verify before rename; mismatch deletes and throws).
- [ ] RED: tiers data; Downloader against a local HTTP fixture (mid-file resume + corrupted hash); health-check identity (fake /v1/models server answering a DIFFERENT model → loud). `serve()` spawning is exercised only when `LLAMACPP_BIN` is present (skipIf) — no binary in CI.
- [ ] Implement; add the models lane to the core layer lint; gate; commit `feat(models): declared tiers, the serving port, the integrity downloader`.

### Task 5: the E2E threads + census + the gate
**Files:** eval `test/e2e-verbs.test.ts`
- [ ] Thread 1 (governed): mini-subject → runCase both variants ×2 reps → failures/monitor clean → judge inputs → CANNED verdicts.jsonl → fold → certify (bar 0.9) → seal → verify; census(guards, dumps) over the dumps names every never-fired guard (asserted non-empty for the mini subject's unexercised rows, empty for the fired consent row).
- [ ] Thread 2: a planted TurnFailure run blocks certification until resolved.
- [ ] All gates green; plain-names 130; merge `to-be-phase-4b` → main; deviations recorded.

## Deviations

| planned | built | why |
|---|---|---|
| `Downloader.fetch` | `Downloader.pull` | `fetch` is a banned network identifier under the tree lint; the word belongs to the browser primitive |
| server/src the one network door | models/src is the second lawful `node:http` door | local serving and artifact pulls are the package's purpose |
| judge inputs keyed by case id | rows carry a BLIND `r###` key; `rowKey(runDir)` maps back outside the judge file | a case id repeated across variants would leak which rows pair up |
| consent turns identical across variants | on the ungoverned twin an approve/decline turn plays as the operator's plain word — no question exists to quote | the twin never issues a code; the message weight stays comparable |
| runner writes failures.jsonl only | the dump also carries its own `failure` field | fold and certify price a failed case without re-joining files |
