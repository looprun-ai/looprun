---
date: 2026-07-28
slug: ask-channel-survives-deny
change_kind: runtime
target: terminal
summary: terminal tools are protocol-owned: never routed to world.exec, ask channel survives any preTool deny
isolated: 212/212
collective: 55/55
coverage: 29/29
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — terminal tools are protocol-owned: never routed to world.exec, ask channel survives any preTool deny

**Scope:** `runtime` · **Date:** 2026-07-28 · **Verdict:** PASS

## What changed
terminal tools are protocol-owned: never routed to world.exec, ask channel survives any preTool deny

## Proof cases
Author positive / negative / neutral cases for the affected guard(s), plus ≥1 L3 loop case and the
collective non-interference check. See `skills/looprun-governance/references/proof-case-authoring.md`.

## Results
Recorded from `governance/.artifacts/proofs.json` (`scripts/proofs/run-proofs.mjs`):

| lane | pass/total |
|---|---|
| isolated (L1 + L3) | 212/212 |
| collective | 55/55 |
| ratchet | 58/58 |
| coverage (kinds fully proven) | 29/29 |
| **all** | **496/496** |

## SLM canary (advisory)
Not run for this change (report-only lane; never gates the PR).

## Verdict & residuals
**PASS.**

_None._
