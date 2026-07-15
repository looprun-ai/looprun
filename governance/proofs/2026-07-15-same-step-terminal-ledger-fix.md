---
date: 2026-07-15
slug: same-step-terminal-ledger-fix
change_kind: runtime
target: —
summary: Runtime hardening: terminal calls recorded in the guard hook's synchronous segment (emission order) — closes the same-step ask-then-act concurrency bypass; the previously L1-only deny is L3-proven again
isolated: 166/166
collective: 48/48
coverage: 27/27
slm_canary: 46/46 (model micro, advisory)
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — Runtime hardening: terminal calls recorded in the guard hook's synchronous segment (emission order) — closes the same-step ask-then-act concurrency bypass; the previously L1-only deny is L3-proven again

**Scope:** `runtime` · **Date:** 2026-07-15 · **Verdict:** PASS

## What changed
The baseline record's residual is closed. A step's tool calls are dispatched concurrently, so a
same-step `askUser` + destructive pair used to execute the destructive call's preTool checks before
the ask landed in the observed ledger — bypassing `noActAfterAskSameTurn`'s same-turn deny. Fix:
terminal calls are now recorded in the guard hook's SYNCHRONOUS segment (`recordTerminalCall`,
`packages/core/src/runtime/ledger.ts` + `packages/mastra/src/hooks.ts`); tool-call dispatch starts in
emission order synchronously up to each call's first await, so the sibling check sees the ask. The
terminal tool's execute keeps the reply capture (`recordTerminal`) and no longer pushes.

## Proof cases
The regression proof is the restored L3 deny case on `noActAfterAskSameTurn`
(`packages/core/test/proofs/catalog-run-output.ts`, "asking then acting in the very same turn is
denied"): a single step `[askUser, deleteItem]` must surface `run:noActAfterAskSameTurn:deleteItem` —
previously impossible, now green in both the isolated and the collective run (+2 tests vs the
baseline: 283 → 285).

## Results
Recorded from `governance/.artifacts/proofs.json` (`scripts/proofs/run-proofs.mjs`):

| lane | pass/total |
|---|---|
| isolated (L1 + L3) | 166/166 |
| collective | 48/48 |
| ratchet | 54/54 |
| coverage (kinds fully proven) | 27/27 |
| **all** | **285/285** |

## SLM canary (advisory)
Run post-fix on the `micro` tier (Qwen3.5-4B + MTP, real model, no script): **46/46 governed turns
ended compliant** — 23 clean, 10 caught-and-recovered by a guard, 13 exhausted to the honest-abstain
closure, 0 errors. Report-only; never gates the PR.

## Verdict & residuals

PASS — full suite green (285/285) with the restored deny case. Residual: the emission-order guarantee
rests on the model runtime starting a step's tool-call dispatch synchronously in emission order; the
regression case pins that behavior — if a future runtime version breaks it, this proof goes red.
**PASS.**

_None._
