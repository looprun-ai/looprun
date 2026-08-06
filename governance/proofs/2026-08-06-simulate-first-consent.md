---
date: 2026-08-06
slug: simulate-first-consent
change_kind: runtime
target: —
summary: Simulate-first polarity: one consent check; bare act gated on the typed code; schema-licensed simulate bypass; Route A downgrade; Route B veto-raises-the-question; throttle reads the simulate shape
isolated: 142/142
collective: 32/32
coverage: 20/20
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — Simulate-first polarity: one consent check; bare act gated on the typed code; schema-licensed simulate bypass; Route A downgrade; Route B veto-raises-the-question; throttle reads the simulate shape

**Scope:** `runtime` · **Date:** 2026-08-06 · **Verdict:** PASS

## What changed
Simulate-first polarity: one consent check; bare act gated on the typed code; schema-licensed simulate bypass; Route A downgrade; Route B veto-raises-the-question; throttle reads the simulate shape

## Proof cases
Author positive / negative / neutral cases for the affected guard(s), plus ≥1 L3 loop case and the
collective non-interference check. See `skills/looprun-governance/references/proof-case-authoring.md`.

## Results
Recorded from `governance/.artifacts/proofs.json` (`scripts/proofs/run-proofs.mjs`):

| lane | pass/total |
|---|---|
| isolated (L1 + L3) | 142/142 |
| collective | 32/32 |
| ratchet | 40/40 |
| coverage (kinds fully proven) | 20/20 |
| **all** | **339/339** |

## SLM canary (advisory)
Not run for this change (report-only lane; never gates the PR).

## Verdict & residuals
**PASS.**

_None._
