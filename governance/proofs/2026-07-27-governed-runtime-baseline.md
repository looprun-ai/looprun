---
date: 2026-07-27
slug: governed-runtime-baseline
change_kind: runtime
target: —
summary: Baseline of the governed runtime: typed guard catalog, terminal-protocol turn machine with the governance veto envelope, terminal-only closing step and superseded-terminal pruning, and the TRUTH/FORM salvage frontier
isolated: 212/212
collective: 55/55
coverage: 0/0
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — Baseline of the governed runtime: typed guard catalog, terminal-protocol turn machine with the governance veto envelope, terminal-only closing step and superseded-terminal pruning, and the TRUTH/FORM salvage frontier

**Scope:** `runtime` · **Date:** 2026-07-27 · **Verdict:** PASS

## What changed
This is the BASELINE record: it attests the governed surface as it currently stands, not a delta
against an earlier one. Every record after this one states what it changes relative to here.

Under proof at this point:

- the typed guard catalog (`packages/core/src/guards.ts`) and its runtime-owned kind classification;
- the turn machine (`packages/core/src/runtime/`): ledger, preTool / postTool / onInput / onReply
  evaluation, the bounded no-tools redrive and the deterministic honest-abstain closure;
- the terminal protocol: runtime-owned terminals, the forced-terminal fallback, the TERMINAL-ONLY
  closing step, and pruning of terminals that were emitted but never delivered;
- the veto envelope — a guard deny reaches the model tagged `source:'governance'`, distinguishable
  from a world refusal;
- the exhaustion closure built from DOMAIN evidence only, and the TRUTH/FORM salvage frontier that
  decides when a candidate reply may still be delivered;
- the two Mastra drivers (`packages/mastra/src/{agent,run-conversation}.ts`) carrying the above
  identically.

## Proof cases
The whole suite is the case set for a baseline: 212 isolated (L1 pure checks + L3 full-loop drivers
over the shared catalog) and 55 collective non-interference checks, plus the targeted mechanism
proofs under `packages/{core,mastra}/test/proofs/`. Every guard kind carries positive, negative and
neutral cases; the loop mechanics are pinned at both L1 and L3. Authoring rules for cases added from
here on: `skills/looprun-governance/references/proof-case-authoring.md`.

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
**PASS** — 491/491.

Residuals, carried forward as known gaps rather than silently closed:

- The experimental micro-loop driver (`packages/mastra/src/microloop.ts`) does not carry the
  terminal-only closing step, the superseded-terminal pruning or the veto envelope. It is not a
  default and is not certified.
- A host may supply its own `replyToUser` / `askUser` tool definition, which the runtime accepts as
  written (`packages/mastra/src/tools.ts`). The runtime does not normalise a host terminal def to
  its own contract.
- The coverage ratchet reads 0/0: the per-kind completeness lane is not armed on this baseline.
