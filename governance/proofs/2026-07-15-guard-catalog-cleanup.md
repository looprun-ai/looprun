---
date: 2026-07-15
slug: guard-catalog-cleanup
change_kind: guard
target: catalog
summary: catalog 27→23: labels→domain-custom, maxCalls(scope), noFabricatedSuccess banRe+refExists, degenerationGuard lexicon-injected narration
isolated: 154/154
collective: 42/42
coverage: 23/23
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — catalog 27→23: labels→domain-custom, maxCalls(scope), noFabricatedSuccess banRe+refExists, degenerationGuard lexicon-injected narration

**Scope:** `guard:catalog` · **Date:** 2026-07-15 · **Verdict:** PASS

## What changed
The neutral runtime shed its last domain couplings (the P8a domain-neutrality law, completed):

- **DELETE** `labelExists`, `labelProvenance` (media-domain input kinds — now authored per-domain as
  `custom({ dim:'input' })` over the world's own accessors), `maxCallsPerConversation` (merged), and
  `replyNoProductionClaim` (absorbed). `interface MediaWorld` dropped from `rules.ts`; `FixtureWorld`
  keeps `hasMediaLabel` as a fixture accessor.
- **UNIFY** `maxCallsPerTurn`/`maxCallsPerConversation` → `maxCalls(tool, n, reason, { scope })`, scope
  `'turn'` (default) | `'conversation'`. One deny message + prose.
- **noFabricatedSuccess**: added an unconditional `banRe` (fires before the ran-this-turn short-circuit,
  absorbing `replyNoProductionClaim`) + an injected `refExists` existence predicate replacing the former
  hardcoded `world.hasMediaLabel` lookup; scheme params are now optional (banRe-only = pure ban).
- **degenerationGuard**: markup + line-repetition branches stay always-on; the English third-person
  self-narration branch becomes `cfg.lexicon.selfNarrationRe`-injected (threaded at auto-install; absent
  ⇒ OFF). The `minimal:degenerationGuard` id/order is unchanged.

## Proof cases
Proof-first (RED → GREEN): the four removed-kind proofs deleted; `maxCalls` rewritten (default `'turn'`
scope via the canonical catalog proof, `'conversation'` scope bespoke in `proofs-l1.test.ts` incl. the
scope-contrast case); `noFabricatedSuccess` extended with a `banRe` fires-regardless-of-attempts case, a
benign-near-miss neutral case, and `refExists`-backed known/unknown label cases; `degenerationGuard`
proven OFF-when-absent (catalog neutral case) and ON-when-injected + auto-install threading (bespoke L1).
Coverage ratchet floor lowered 25 → 22; catalog ruleset table + script conventions synced. Every kind
retains ≥1 positive/negative/neutral case with both L1 verdict classes, an L3 loop case, and the
collective non-interference check.

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
