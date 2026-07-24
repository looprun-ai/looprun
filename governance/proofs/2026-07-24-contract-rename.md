---
date: 2026-07-24
slug: contract-rename
change_kind: runtime
target: —
summary: Public API rename: spec.theme -> spec.contract (DomainContract); legacy naming sweep
isolated: 154/154
collective: 42/42
coverage: 23/23
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — Public API rename: spec.theme -> spec.contract (DomainContract); legacy naming sweep

**Scope:** `runtime` · **Date:** 2026-07-24 · **Verdict:** PASS

## What changed
Public API rename: spec.theme -> spec.contract (DomainContract); legacy naming sweep

## Proof cases
Author positive / negative / neutral cases for the affected guard(s), plus ≥1 L3 loop case and the
collective non-interference check. See `skills/looprun-governance/references/proof-case-authoring.md`.

## Results
Recorded from `governance/.artifacts/proofs.json` (`scripts/proofs/run-proofs.mjs`):

| lane | pass/total |
|---|---|
| isolated (L1 + L3) | 154/154 |
| collective | 42/42 |
| ratchet | 46/46 |
| coverage (kinds fully proven) | 23/23 |
| **all** | **259/259** |

## SLM canary (advisory)
Not run for this change (report-only lane; never gates the PR).

## Verdict & residuals
**PASS.**

_None._
