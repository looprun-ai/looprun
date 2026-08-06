---
date: 2026-07-27
slug: governed-runtime-baseline
change_kind: runtime
target: —
summary: Baseline of the governed runtime: typed guard catalog, terminal-protocol turn machine with the governance veto envelope, terminal-only closing step and superseded-terminal pruning, the TRUTH/FORM salvage frontier, and runtime-owned terminal tool definitions
isolated: 212/212
collective: 55/55
coverage: 29/29
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — Baseline of the governed runtime: typed guard catalog, terminal-protocol turn machine with the governance veto envelope, terminal-only closing step and superseded-terminal pruning, the TRUTH/FORM salvage frontier, and runtime-owned terminal tool definitions

**Scope:** `runtime` · **Date:** 2026-07-27 · **Verdict:** PASS

## What changed
This is the BASELINE record: it attests the governed surface as it currently stands, not a delta
against an earlier one. Every record after this one states what it changes relative to here.

Under proof at this point:

- the typed guard catalog (`packages/core/src/guards.ts`) and its runtime-owned kind classification;
- the turn machine (`packages/core/src/runtime/`): action history, preTool / postTool / onInput / onReply
  evaluation, the bounded no-tools redrive and the deterministic honest-abstain closure;
- the terminal protocol: terminal tool DEFINITIONS authored by the runtime (a host-supplied one is
  normalised to the protocol contract), the forced-terminal fallback, the TERMINAL-ONLY closing
  step, and pruning of terminals that were emitted but never delivered;
- the veto envelope — a guard deny reaches the model tagged `source:'governance'`, distinguishable
  from a world refusal;
- the exhaustion closure built from DOMAIN evidence only, and the TRUTH/FORM salvage frontier that
  decides when a candidate reply may still be delivered;
- the two drivers (`packages/mastra/src/{agent,run-conversation}.ts`) carrying the above
  identically. They are the only turn drivers: there is no second, uncertified loop.

## Proof cases
The whole suite is the case set for a baseline: 212 isolated (L1 pure checks + L3 full-loop drivers
over the shared catalog), 55 collective non-interference checks and the 58-assertion coverage
ratchet, plus the targeted mechanism proofs under `packages/{core,mastra}/test/proofs/`. Every guard
kind carries positive, negative and neutral cases — the ratchet computes that floor rather than
storing a counter, and reports 29/29 kinds fully proven. Authoring rules for cases added from here
on: `skills/looprun-governance/references/proof-case-authoring.md`.

## Results
Recorded from `governance/.artifacts/proofs.json` (`scripts/proofs/run-proofs.mjs`):

| lane | pass/total |
|---|---|
| isolated (L1 + L3) | 212/212 |
| collective | 55/55 |
| ratchet | 58/58 |
| coverage (kinds fully proven) | 29/29 |
| **all** | **493/493** |

## SLM canary (advisory)
Not run for this change (report-only lane; never gates the PR).

## Verdict & residuals
**PASS** — 493/493, coverage 29/29 kinds.

_None._ The governed surface has one turn machine, two drivers carrying it identically, and no
uncertified path alongside them.
