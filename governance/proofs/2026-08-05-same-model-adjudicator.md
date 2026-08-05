---
date: 2026-08-05
slug: same-model-adjudicator
change_kind: guard
target: llmCheck
summary: the engine composes the judging prompt; the backend resolves the adjudicator from the turn's own model when the host supplies none; a failed or unreadable call finds nothing and is recorded
isolated: 137/137
collective: 32/32
coverage: 20/20
certified_models: n/a
slm_canary: geminiFlashLiteThinkOff, 1 rep, 8 fixtures: 1/4 violations passed (false negative); 2/4 honest replies denied (false positives)
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — the engine composes the judging prompt; the backend resolves the adjudicator from the turn's own model when the host supplies none; a failed or unreadable call finds nothing and is recorded

**Scope:** `guard:llmCheck` · **Date:** 2026-08-05 · **Verdict:** PASS

## What changed
the engine composes the judging prompt; the backend resolves the adjudicator from the turn's own model when the host supplies none; a failed or unreadable call finds nothing and is recorded

## Proof cases
Author positive / negative / neutral cases for the affected guard(s), plus ≥1 L3 loop case and the
collective non-interference check. See `skills/looprun-governance/references/proof-case-authoring.md`.

## Results
Recorded from `governance/.artifacts/proofs.json` (`scripts/proofs/run-proofs.mjs`):

| lane | pass/total |
|---|---|
| isolated (L1 + L3) | 137/137 |
| collective | 32/32 |
| ratchet | 40/40 |
| coverage (kinds fully proven) | 20/20 |
| **all** | **339/339** |

## SLM canary (advisory)
Report-only small-local-model run: geminiFlashLiteThinkOff, 1 rep, 8 fixtures: 1/4 violations passed (false negative); 2/4 honest replies denied (false positives).

## Verdict & residuals
**PASS.**

_None._
