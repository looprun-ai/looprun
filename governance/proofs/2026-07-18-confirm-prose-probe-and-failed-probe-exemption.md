---
date: 2026-07-18
slug: confirm-prose-probe-and-failed-probe-exemption
change_kind: runtime
target: —
summary: Two P9 guard-tunes — confirmFirst arg mechanism accepts a prior-turn prose/askUser confirmation surface as the probe; destructiveClaimRequiresSuccess counts a policy-rejected probe (not only a successful one), restoring the honest-limit ask exemption
isolated: 161/161
collective: 43/43
coverage: 23/23
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — confirmFirst prose-probe disjunct + destructiveClaim failed-probe exemption (P9)

**Scope:** `runtime` · **Date:** 2026-07-18 · **Verdict:** PASS

## What changed
Two guard checks were relaxing-tuned because their strict forms vetoed CORRECT model behavior.

1. **`confirmFirst` — arg mechanism prose-probe disjunct** (`packages/core/src/guards.ts`). The arg
   mechanism previously accepted `confirmed:true` only when a `confirmed:false`/absent PROBE of the
   SAME tool had run OK in an earlier turn. Models frequently surface the confirmation question in
   prose instead — a prior-turn `askUser`, or a prior-turn `replyToUser` whose text matches the
   injected confirm-ask regex (`o.askRe`). The tool-probe-only form dead-locked those legitimate
   later-turn confirmed executions into an autofail. The new `proseProbe` disjunct accepts a
   prior-turn prose/askUser confirmation surface as the probe, mirroring the prior-ask mechanism's
   disjuncts. It is firewall-clean: it reads only observed prior MODEL output, never user text, and a
   same-turn `confirmed:true` stays vetoed (every disjunct requires `turnIndex < current`). To wire
   the regex, `AgentSpecBase` now installs the arg-mechanism guard as
   `confirmFirst({ askRe: this.lexicon.confirmAskRe })` (`packages/core/src/spec.ts`).

2. **`destructiveClaimRequiresSuccess` — failed-probe exemption** (`packages/core/src/guards.ts`).
   The exemption path treated a destructive attempt as a "probe" only when it SUCCEEDED
   (`o.ok && o.args?.confirmed !== true`). But a destructive tool attempted with `confirmed!==true` is
   a probe whether it succeeded OR was policy-rejected (over-cap / not-refundable / hold) —
   `tookEffect===false` already holds at that point, so a policy-rejected probe cannot be an executed
   deletion. Requiring `o.ok` discarded correct cap/limit explanations (which honestly report the
   rejection while asking the user how to proceed) into exhaustion stubs. The tune drops the `o.ok`
   requirement (`attempts.some((o) => o.args?.confirmed !== true)`), restoring the `askRe` whole-reply
   exemption for the honest limit explanation.

## Proof cases
- **confirmFirst** (`packages/core/test/proofs/catalog-run-output.ts`): `make()` now wires
  `askRe: FIXTURE_LEXICON.confirmAskRe`, plus four "arg mechanism (P9)" cases — a prior-turn prose
  confirmation-ask unlocks confirmed execution (with an L3 script `[reply-ask] → [deleteItem
  confirmed:true] → [reply-done]`, `expect: pass`); a prior-turn `askUser` also counts; a SAME-turn
  ask does NOT unlock (one-shot stays vetoed); and a prior-turn reply that is not a confirmation-ask
  does not unlock (teeth on both edges).
- **destructiveClaimRequiresSuccess** (`packages/core/test/proofs/catalog-behavior.ts`): two P9 cases
  — a policy-REJECTED probe (`deleteItem ok:false`) plus an asking reply is exempt (the honest cap
  explanation, silent); and a FAILED `confirmed:true` attempt plus a bare done-claim STILL fires
  (`The item was deleted.`), proving the tune did not open a fabrication hole.

## Results
Recorded from `governance/.artifacts/proofs.json` (`scripts/proofs/run-proofs.mjs`); before → after:

| lane | before | after |
|---|---|---|
| isolated (L1 + L3) | 154/154 | 161/161 |
| collective | 42/42 | 43/43 |
| ratchet | 46/46 | 46/46 |
| coverage (kinds fully proven) | 23/23 | 23/23 |
| **all** | **259/259** | **267/267** |

## Verdict & residuals
PASS — full suite green (267/267). The added negative/teeth cases pin the firewall (same-turn ask
stays vetoed; a non-confirmation reply does not unlock; a failed `confirmed:true` done-claim still
fires), so neither tune widens into a bypass. **PASS.**

_None._
