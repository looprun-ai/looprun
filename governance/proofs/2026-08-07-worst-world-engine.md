---
date: 2026-08-07
slug: worst-world-engine
change_kind: runtime
target: —
summary: Worst-world engine laws: a schema-licensed simulation passes every guard outside the always-family; refusal by rule grounds on a read that changed nothing; the grounded deny names the declarable outcomes; the result report and every open approval ride the delivery; closure failure lines carry authored sentences; the sensitive-data filter runs at the executor, argument and delivery seams
isolated: 151/151
collective: 34/34
coverage: 20/20
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — Worst-world engine laws: a schema-licensed simulation passes every guard outside the always-family; refusal by rule grounds on a read that changed nothing; the grounded deny names the declarable outcomes; the result report and every open approval ride the delivery; closure failure lines carry authored sentences; the sensitive-data filter runs at the executor, argument and delivery seams

**Scope:** `runtime` · **Date:** 2026-08-07 · **Verdict:** PASS

## What changed
Worst-world engine laws: a schema-licensed simulation passes every guard outside the always-family; refusal by rule grounds on a read that changed nothing; the grounded deny names the declarable outcomes; the result report and every open approval ride the delivery; closure failure lines carry authored sentences; the sensitive-data filter runs at the executor, argument and delivery seams

## Proof cases

Catalog cases (`packages/core/test/proofs/catalog-*.ts` — L1 + L3 + collective):

| kind | polarity | case |
|---|---|---|
| noDuplicateCall | negative | a repeated identical simulation is still gated (L3: two identical `deleteItem` simulations in one turn → veto) |
| noDuplicateCall | neutral | a simulation of another record is not a duplicate of the first |
| destructiveThrottle | positive | a simulation after the turn's one destructive act still runs (L3-only: the cap is applied where a simulation is recognised as a read) |
| claimIsGrounded | positive | a refusal grounded by a read that addressed the entity and changed nothing (L3: read, then declare `refused` → pass) |
| claimIsGrounded | negative | an effected write on the entity refutes the refusal |
| claimIsGrounded | negative | a refusal on an entity no read addressed |
| claimIsGrounded | neutral | a simulation on the entity leaves the grounded refusal alone |

Route cases (the runtime laws that are not a `check()`), each with all three polarities:

| file | law |
|---|---|
| `packages/core/test/proofs/simulation-routes.test.ts` | `ALWAYS_GUARD_KINDS` is the whole of the gate: a schema-licensed simulation passes a denying guard, an unlicensed `simulate:true` is not exempt, a repeated simulation is denied, and a simulation runs in a turn whose destructive act already landed |
| `packages/core/test/proofs/declarable-outcome-routes.test.ts` | the grounded deny's exact sentence — ` Declarable for <target> with this turn's evidence: <outcomes\|none>.` — and every outcome it names is one the guard then accepts |
| `packages/core/test/proofs/delivery-routes.test.ts` | the result `report` line, every open approval on every delivery (blank floor included), and the closure failure line's two authored sources |
| `packages/core/test/proofs/sensitive-filter-routes.test.ts` | omit/mask by dot-suffix path, the free-text scrub, and the delivery net running on authored prose only |
| `packages/mastra/test/proofs/sensitive-seam-routes.test.ts` | the executor seam: the stored free-text argument is scrubbed before dispatch and recorded as stored; the result is filtered before the model reads it |

Collective non-interference: 34/34 — the two new L3 cases replay against the super-agent with no
guard outside the whitelist firing.

## Results
Recorded from `governance/.artifacts/proofs.json` (`scripts/proofs/run-proofs.mjs`):

| lane | pass/total |
|---|---|
| isolated (L1 + L3) | 151/151 |
| collective | 34/34 |
| ratchet | 40/40 |
| coverage (kinds fully proven) | 20/20 |
| **all** | **387/387** |

## SLM canary (advisory)
Not run for this change (report-only lane; never gates the PR).

## Verdict & residuals
**PASS.**

_None._
