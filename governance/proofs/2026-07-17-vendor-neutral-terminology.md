---
date: 2026-07-17
slug: vendor-neutral-terminology
change_kind: skill
target: —
summary: skill + docs + eval harness: replace agent-environment-specific judge/tooling wording with the vendor-neutral vocabulary (the LLM judge / the coding agent running the skill); text-only, no check()/prose() behavior change; enforced by the new vendor-neutrality law in tests/no-bench-drift.test.mjs
isolated: 154/154
collective: 42/42
coverage: 23/23
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — skill + docs + eval harness: replace agent-environment-specific judge/tooling wording with the vendor-neutral vocabulary (the LLM judge / the coding agent running the skill); text-only, no check()/prose() behavior change; enforced by the new vendor-neutrality law in tests/no-bench-drift.test.mjs

**Scope:** `skill` · **Date:** 2026-07-17 · **Verdict:** PASS

## What changed
skill + docs + eval harness: replace agent-environment-specific judge/tooling wording with the vendor-neutral vocabulary (the LLM judge / the coding agent running the skill); text-only, no check()/prose() behavior change; enforced by the new vendor-neutrality law in tests/no-bench-drift.test.mjs

## Proof cases
n/a (docs/skill-only change; guard runtime unchanged; `pnpm proofs:run` 259/259 unchanged).

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
