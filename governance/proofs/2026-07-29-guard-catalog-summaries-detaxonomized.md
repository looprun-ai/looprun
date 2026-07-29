---
date: 2026-07-29
slug: guard-catalog-summaries-detaxonomized
change_kind: docs
target: guard-catalog
summary: core: guard catalog summaries drop the risk-family prefixes; two whenToUse rows corrected (forbidThisTurn scope, custom hook)
isolated: 212/212
collective: 55/55
coverage: 29/29
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — core: guard catalog summaries drop the risk-family prefixes; two whenToUse rows corrected (forbidThisTurn scope, custom hook)

**Scope:** `docs` · **Date:** 2026-07-29 · **Verdict:** PASS

## What changed
core: guard catalog summaries drop the risk-family prefixes; two whenToUse rows corrected (forbidThisTurn scope, custom hook)

## Proof cases
n/a (docs/skill-only change; guard runtime unchanged; `pnpm proofs:run` 495/495 unchanged).

## Results
Recorded from `governance/.artifacts/proofs.json` (`scripts/proofs/run-proofs.mjs`):

| lane | pass/total |
|---|---|
| isolated (L1 + L3) | 212/212 |
| collective | 55/55 |
| ratchet | 58/58 |
| coverage (kinds fully proven) | 29/29 |
| **all** | **495/495** |

## SLM canary (advisory)
Not run for this change (report-only lane; never gates the PR).

## Verdict & residuals
**PASS.**

Text-only edit to GUARD_CATALOG's prose fields (packages/core/src/guards/catalog.ts) for tutorial chapter 04. No factory, check, prose or export changed; no trunk byte moves (the catalog is documentation data, read by no runtime path). Re-run at HEAD: guard-catalog-parity 11/11, surface-lock 6/6, core suite 512/512.
