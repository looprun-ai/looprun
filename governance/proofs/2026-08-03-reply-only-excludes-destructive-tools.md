---
date: 2026-08-03
slug: reply-only-excludes-destructive-tools
change_kind: runtime
target: —
summary: A reply-only terminal policy and a destructive tool cannot share a spec: reply-only forbids declaring an ask, and the consent guards require one. Refused at load.
isolated: 152/152
collective: 36/36
coverage: 22/22
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — A reply-only terminal policy and a destructive tool cannot share a spec: reply-only forbids declaring an ask, and the consent guards require one. Refused at load.

**Scope:** `runtime` · **Date:** 2026-08-03 · **Verdict:** PASS

## What changed
A reply-only terminal policy and a destructive tool cannot share a spec: reply-only forbids declaring an ask, and the consent guards require one. Refused at load.

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
