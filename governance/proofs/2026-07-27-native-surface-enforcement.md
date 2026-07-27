---
date: 2026-07-27
slug: native-surface-enforcement
change_kind: runtime
target: —
summary: native/MCP mode enforces spec.surface (deny-by-default + fingerprint drift check); eval lint gains execution-based unsat-pair + order-cycle checks
isolated: 212/212
collective: 55/55
coverage: 0/0
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — native/MCP mode enforces spec.surface (deny-by-default + fingerprint drift check); eval lint gains execution-based unsat-pair + order-cycle checks

**Scope:** `runtime` · **Date:** 2026-07-27 · **Verdict:** PASS

## What changed
native/MCP mode enforces spec.surface (deny-by-default + fingerprint drift check); eval lint gains execution-based unsat-pair + order-cycle checks

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
| **all** | **469/469** |

## SLM canary (advisory)
Not run for this change (report-only lane; never gates the PR).

## Verdict & residuals
**PASS.**

_None._
