---
date: 2026-08-03
slug: turn-protocol-matches-enforcement
change_kind: runtime
target: —
summary: The turn protocol states what the guards enforce: a lookup is not an action, target is required on a completed action, did entry keys are closed. Fixed per-turn protocol 3909 to 3264 chars.
isolated: 152/152
collective: 36/36
coverage: 22/22
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — The turn protocol states what the guards enforce: a lookup is not an action, target is required on a completed action, did entry keys are closed. Fixed per-turn protocol 3909 to 3264 chars.

**Scope:** `runtime` · **Date:** 2026-08-03 · **Verdict:** PASS

## What changed
The turn protocol states what the guards enforce: a lookup is not an action, target is required on a completed action, did entry keys are closed. Fixed per-turn protocol 3909 to 3264 chars.

## Proof cases
Author positive / negative / neutral cases for the affected guard(s), plus ≥1 L3 loop case and the
collective non-interference check. See `skills/looprun-governance/references/proof-case-authoring.md`.

## Results
Recorded from `governance/.artifacts/proofs.json` (`scripts/proofs/run-proofs.mjs`):

| lane | pass/total |
|---|---|
| isolated (L1 + L3) | 152/152 |
| collective | 36/36 |
| ratchet | 44/44 |
| coverage (kinds fully proven) | 22/22 |
| **all** | **369/369** |

## SLM canary (advisory)
Not run for this change (report-only lane; never gates the PR).

## Verdict & residuals
**PASS.**

_None._
