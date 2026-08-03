---
date: 2026-08-03
slug: cut-respond-schema
change_kind: runtime
target: —
summary: respond schema: state each rule once, in the fewest words its guard leaves it needing
isolated: 152/152
collective: 36/36
coverage: 22/22
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — respond schema: state each rule once, in the fewest words its guard leaves it needing

**Scope:** `runtime` · **Date:** 2026-08-03 · **Verdict:** PASS

## What changed
The `respond` terminal's tool definition — PROSE ONLY. No `check()`, no factory, no hook and no
schema CONSTRAINT moved: `minItems`, `required`, `minLength` and `additionalProperties` are
byte-identical, and every rule the runtime enforces is still stated exactly once.

| field | before | after | the rule, and the guard that fires without the prose |
|---|---|---|---|
| tool description | 13 | 13 | — |
| `message.description` | 122 | 111 | the message asserts no operation — NOTHING deterministic (open prose residual, optional `did × message` llmCheck), so the rule is KEPT, only shortened |
| `did.description` | 166 | 84 | ≥1 intention → `terminalPayloadRejection` + `minItems` on the wire · closed key set → `validateClaims` "unknown key" (the converter drops `additionalProperties`, so this half must stay prose) |
| `did.items.op` | 590 | 455 | ACTION ⇒ `outcome`, SPEECH ⇒ none → `validateClaims` partition → `terminalPayloadRejection` |
| `did.items.target` | 123 | 84 | a target on an action → `claimIsComplete` (an uncovered write is a violation) |
| `did.items.outcome` | 323 | 144 | the seven words → `resolveOutcome` (an undeclared word denies in `claimIsGrounded`) · an HONEST outcome → `claimIsGrounded`, the ledger cross-check |
| **whole def** | **1834** | **1388** | |

## Proof cases
No guard changed, so no guard proof changed: the full suite is the regression evidence, and the
SURFACE is pinned by `packages/mastra/test/proofs/terminal-audit.test.ts` — read off the tools the
provider actually received, so a converter that dropped a description would fail the audit rather
than silently ship a bare `{op,target,outcome}` to the model. That audit was STRENGTHENED here: the
seven core outcome words are now asserted individually on the wire (they are prose, not a schema
`enum`, because a domain may declare its own outcome word through the contract's `OutcomeMap`).

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

RESIDUAL — the eval battery's CAPACITY axis is 9 turns of one live model, so a single turn flipping
moves it 11 points. Two runs of BYTE-IDENTICAL code measured 88.9% and 77.8%, which is the noise
floor a prompt change has to be read against; the axis is evidence, never a gate, and this record
does not claim a capacity effect either way.
