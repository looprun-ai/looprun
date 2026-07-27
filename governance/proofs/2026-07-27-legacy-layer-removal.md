---
date: 2026-07-27
slug: legacy-layer-removal
change_kind: runtime
target: —
summary: remove the legacy compatibility layer: pre-rename type aliases, typed-but-unread spec fields, the legacy eval-config types, and gate config pointing at absent paths
isolated: 212/212
collective: 55/55
coverage: 0/0
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — remove the legacy compatibility layer: pre-rename type aliases, typed-but-unread spec fields, the legacy eval-config types, and gate config pointing at absent paths

**Scope:** `runtime` · **Date:** 2026-07-27 · **Verdict:** PASS

## What changed
remove the legacy compatibility layer: pre-rename type aliases, typed-but-unread spec fields, the legacy eval-config types, and gate config pointing at absent paths

## Proof cases
Author positive / negative / neutral cases for the affected guard(s), plus ≥1 L3 loop case and the
collective non-interference check. See `skills/looprun-governance/references/proof-case-authoring.md`.

## Results
Recorded from `governance/.artifacts/proofs.json` (`scripts/proofs/run-proofs.mjs`):

| lane | pass/total |
|---|---|
| isolated (L1 + L3) | 212/212 |
| collective | 55/55 |
| ratchet | 0/0 |
| coverage (kinds fully proven) | 0/0 |
| **all** | **491/491** |

## SLM canary (advisory)
Not run for this change (report-only lane; never gates the PR).

## Verdict & residuals
**PASS.**

_None._
