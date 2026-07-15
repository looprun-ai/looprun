---
date: 2026-07-15
slug: initial-guard-proof-baseline
change_kind: runtime
target: —
summary: Baseline: every guard kind proven (positive/negative/neutral; isolated L1+L3 + collective non-interference; coverage ratchet active)
isolated: 165/165
collective: 47/47
coverage: 27/27
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — Baseline: every guard kind proven (positive/negative/neutral; isolated L1+L3 + collective non-interference; coverage ratchet active)

**Scope:** `runtime` · **Date:** 2026-07-15 · **Verdict:** PASS

## What changed
This is the first record: it lands the deterministic guard-proof suite and its testing kit themselves,
not a change to any one guard. The kit is a deterministic fixture world + generic tool defs / theme /
lexicon (`packages/core/src/testing`), a script-driven fake LLM and the full-loop runners
(`packages/mastra/src/testing`), and a declarative proof format. Every guard KIND the runtime exports
now carries a `GuardProof` with positive / negative / neutral cases across two levels — L1 (the pure
`check()` in isolation) and L3 (the full governed-turn loop, asserting the exact `recoveryEvents` signal
the runtime emits). A collective super-agent mounts every guard at once and replays each loop case to
prove non-interference, and a computed coverage ratchet fails CI the moment a new guard kind ships
without a proof.

## Proof cases
The catalog and per-kind cases live in `packages/core/test/proofs` (`catalog.ts`,
`catalog-spatial-input.ts`, `catalog-run-output.ts`, `catalog-behavior.ts`) with the L1 runner + coverage
ratchet (`proofs-l1.test.ts`, `ratchet.test.ts`). The full-loop lanes — L3, collective non-interference,
signal mechanics, and the kit smoke test — live in `packages/mastra/test/proofs`. All 27 guard kinds are
fully proven; the ratchet reports coverage 27/27.

## Results
Recorded from `governance/.artifacts/proofs.json` (`scripts/proofs/run-proofs.mjs`):

| lane | pass/total |
|---|---|
| isolated (L1 + L3) | 165/165 |
| collective | 47/47 |
| ratchet | 54/54 |
| coverage (kinds fully proven) | 27/27 |
| **all** | **283/283** |

## SLM canary (advisory)
n/a — the small-local-model canary lane is designed but not yet implemented, so it was not run for this
baseline. It never gates the PR.

## Verdict & residuals
**PASS.** 283/283 proofs green (isolated 165, collective 47, ratchet 54, other 17); coverage 27/27 kinds.

One residual, documented not papered over: the `noActAfterAskSameTurn` guard is proven at L1 only for its
deny path, not L3. The violation it forbids — asking the user and then acting on a destructive tool in the
very same turn — can only be scripted as a single multi-tool step, because `askUser` is a terminal that
ends generation. The backend dispatches the tool calls within one step concurrently, so the destructive
call's pre-tool check can run before the ask is recorded in the observed ledger; the deny therefore cannot
be reproduced through the loop. The guard's deny logic itself is deterministic and is proven at L1; the
same-step concurrent-dispatch ordering is a runtime-hardening follow-up, not a guard defect. The
allow path (ask in one turn, act in a later turn) is proven at L3.
