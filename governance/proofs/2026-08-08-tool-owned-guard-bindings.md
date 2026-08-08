---
date: 2026-08-08
slug: tool-owned-guard-bindings
change_kind: runtime
target: —
summary: Tool guards are contract bindings; their prose composes into each tool's own description on both execution paths, and the Tool rules prompt section is gone
isolated: 151/151
collective: 34/34
coverage: 20/20
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — Tool guards are contract bindings; their prose composes into each tool's own description on both execution paths, and the Tool rules prompt section is gone

**Scope:** `runtime` · **Date:** 2026-08-08 · **Verdict:** PASS

## What changed
Tool guards are contract bindings; their prose composes into each tool's own description on both execution paths, and the Tool rules prompt section is gone

## Proof cases
Author positive / negative / neutral cases for the affected guard(s), plus ≥1 L3 loop case and the
collective non-interference check. See `skills/looprun-governance/references/proof-case-authoring.md`.

## Results
Recorded from `governance/.artifacts/proofs.json` (`scripts/proofs/run-proofs.mjs`):

| lane | pass/total |
|---|---|
| isolated (L1 + L3) | 151/151 |
| collective | 34/34 |
| ratchet | 40/40 |
| coverage (kinds fully proven) | 20/20 |
| **all** | **388/388** |

## SLM canary (advisory)
Not run for this change (report-only lane; never gates the PR).

## Verdict & residuals
**PASS.**

_None._
