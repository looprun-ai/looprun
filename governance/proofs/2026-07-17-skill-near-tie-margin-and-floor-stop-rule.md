---
date: 2026-07-17
slug: skill-near-tie-margin-and-floor-stop-rule
change_kind: skill
target: —
summary: agentspec skill: near-tie margin discipline (fork-pair loop + margin-probe) + revised STOP rule (bar is a FLOOR) + optimized-for prose law (natural-prose default, telegraphic opt-in) + A3 model-aware deployment targets
isolated: 154/154
collective: 42/42
coverage: 23/23
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — agentspec skill: near-tie margin discipline (fork-pair loop + margin-probe) + revised STOP rule (bar is a FLOOR) + optimized-for prose law (natural-prose default, telegraphic opt-in) + A3 model-aware deployment targets

**Scope:** `skill` · **Date:** 2026-07-17 · **Verdict:** PASS

## What changed
agentspec skill: near-tie margin discipline (fork-pair loop + margin-probe) + revised STOP rule (bar is a FLOOR) + optimized-for prose law (natural-prose default, telegraphic opt-in) + A3 model-aware deployment targets

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

Skill/docs-only change (skills/agentspec/references/*.md + skills/agentspec/scripts/{margin-probe.py,extract-fork.mjs}) — no guard or runtime source touched. The deterministic guard-proof suite is therefore unchanged; `pnpm proofs:run` re-run this session confirms 259/259 PASS (154 isolated + 42 collective + 46 ratchet + 17 other), coverage 23/23 kinds, identical to the prior baseline. certified_models is n/a: these doc changes ship no new certified deployment bundle (per-artifact certification data belongs on the spec/example records that generate bundles). This record also introduces the new `certified_models` frontmatter field (record-format + make-record + matrix column).
