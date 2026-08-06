---
date: 2026-08-03
slug: mandatory-intention
change_kind: runtime
target: —
summary: mandatory intention + red-team hardening: did .min(1) with a speech/action partition on op, the asked boolean retired for an ask INTENTION, key-scoped identity and whole-value matching in the honesty cross-check, consent evidence bound to sealed delivered turns, and the final-review perimeter pass (derived-claim speech filter, throttle probe parity, pendingConfirmMustAsk observed-scan fallback deleted). GUARD_CATALOG size is UNCHANGED at 23 kinds — four reply-text kinds OUT (emptyReply, replyMentions, replySingleQuestion, replyMaxOccurrences), four cross-check/adjudicated kinds IN (claimIsGrounded, claimIsComplete, claimCoversRubric, didMessageConsistency).
isolated: 152/152
collective: 36/36
coverage: 22/22
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — mandatory intention + red-team hardening: did .min(1) with a speech/action partition on op, the asked boolean retired for an ask INTENTION, key-scoped identity and whole-value matching in the honesty cross-check, consent evidence bound to sealed delivered turns, and the final-review perimeter pass (derived-claim speech filter, throttle probe parity, pendingConfirmMustAsk observed-scan fallback deleted). GUARD_CATALOG size is UNCHANGED at 23 kinds — four reply-text kinds OUT (emptyReply, replyMentions, replySingleQuestion, replyMaxOccurrences), four cross-check/adjudicated kinds IN (claimIsGrounded, claimIsComplete, claimCoversRubric, didMessageConsistency).

**Scope:** `runtime` · **Date:** 2026-08-03 · **Verdict:** PASS

## What changed
mandatory intention + red-team hardening: did .min(1) with a speech/action partition on op, the asked boolean retired for an ask INTENTION, key-scoped identity and whole-value matching in the honesty cross-check, consent evidence bound to sealed delivered turns, and the final-review perimeter pass (derived-claim speech filter, throttle probe parity, pendingConfirmMustAsk observed-scan fallback deleted). GUARD_CATALOG size is UNCHANGED at 23 kinds — four reply-text kinds OUT (emptyReply, replyMentions, replySingleQuestion, replyMaxOccurrences), four cross-check/adjudicated kinds IN (claimIsGrounded, claimIsComplete, claimCoversRubric, didMessageConsistency).

### Catalog delta — stated exactly

| | count | kinds |
|---|---|---|
| base `f4d3b6b` | 23 | — |
| HEAD | 23 | — |
| **OUT** | 4 | `emptyReply` · `replyMentions` · `replySingleQuestion` · `replyMaxOccurrences` — the tier-③ reply-TEXT kinds, deleted under the no-regex law |
| **IN** | 4 | `claimIsGrounded` · `claimIsComplete` · `claimCoversRubric` (the deterministic ledger cross-check — this branch's headline change) · `didMessageConsistency` (the pre-baked, never-auto-installed adjudicator) |

The swap is net zero on the count, so **the catalog did not shrink on this branch**. Verified with
`git show f4d3b6b:packages/core/src/guards/catalog.ts` (23) against HEAD (23).

### Coverage denominator — a separate number, 29 → 22

`coverage` here is 22/22, where the previous record (2026-07-29) read 29/29. That drop is NOT this
branch's catalog delta. Two independent causes:

1. **22 is the count of catalogue kinds that return a `Guard`** — 23 kinds minus `jargonScrub`, a
   `ReplyMutator` covered through the proven-mutators list (see the coverage-ratchet section of
   `GOVERNANCE.md`). So 22 is the correct full denominator for a 23-kind catalogue.
2. **The catalogue itself shrank from 33 to 23 kinds on `main`, BEFORE this branch's base**, across
   commits that shipped no proof record (33 → 25 at `0ae3bab`/`73f865c`, then 25 → 24 → 23 at
   `4d40e44` / `c8c4635`). The last recorded denominator, 29, was measured when the catalogue still
   held ~30 kinds.

**Out-of-scope note for the next reader (not fixed here).** Because of (2), this record is the first
one written since that shrink, so its `22/22` silently absorbs a ten-kind catalogue reduction that
belongs to `main`'s history and was never itself proof-recorded. Nothing in this branch caused it and
nothing here can retro-record it; it is flagged so the 29 → 22 step is not read as a coverage
regression introduced by mandatory intention.

## Proof cases

This is a RUNTIME-scope change: it moved the terminal payload, the claim vocabulary and the consent
evidence rule, so the affected surface is the whole catalogue rather than one kind. Coverage is therefore
carried by the per-kind ratchet (every kind's three polarities, both L1 verdicts, ≥1 L3 loop case) rather
than by a hand-listed case set, and it is green at 22/22. The 22 are the catalogue kinds that return a
`Guard`; the 23rd, `jargonScrub`, is a `ReplyMutator` and is covered through the proven-mutators list, as
the coverage-ratchet section of `GOVERNANCE.md` describes.

Cases added or rewritten for the change, beyond the standing ratchet:

| surface | case | level |
|---|---|---|
| `respond` payload | a schema-legal but MALFORMED `did` (a speech op carrying an `outcome`) is refused at the guard hook and the validation error is handed back to the model | L3, mastra |
| `deriveClaimsFromLedger` | a world label colliding with a reserved SPEECH op never becomes the derived `op`; every one of the four is coerced, an ordinary label is untouched | L1, core |
| `destructiveThrottle` | a same-step preview that OMITS the confirm flag is a preview (parity with `confirmFirst`); a CONFIRMED sibling still caps; a `flagless` (prior-ask) tool caps from the first sibling | L1, core + mastra |
| `pendingConfirmMustAsk` | the delivered declaration is the only relay signal — a ctx that seats none fails CLOSED | L1, core |
| `askedInDeliveredTurn` | the sealed-history-only rule, isolated at `confirmFirst`'s `via:'ask'` and `via:'either'` variants (an earlier-turn RAW observed ask licenses nothing; a sealed ask over a blank delivered reply licenses nothing) | L1, core |

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
**PASS.** 369/369, and the per-kind coverage ratchet did not drop.

Residuals carried by this change, all documented in `packages/core/GUARDS.md` and argued in
`docs/superpowers/specs/2026-08-03-mandatory-intention-verdicts.md` §3:

| residual | why it is open |
|---|---|
| the `message` beside a declaration is free prose | an operational assertion written there is not deterministically blocked. Priced by the mandatory declaration (the lie becomes a self-contradiction beside the engine's verified report) plus the optional `didMessageConsistency` adjudicator |
| an `ask` may not POSE a question | judging prose needs a pattern (banned) or a model call. Same instrument prices it |
| an `ask` is bound to NOTHING | an ask intention names no subject, so an off-topic question satisfies every consent kind that reads one, for one turn. Binding it is the same prose judgement as the row above |
| a flag-gated tool that MUTATES without `confirmed:true`, emitted N times in ONE step, is not capped | nothing observable separates it from an honest multi-preview at admission time. The cross-step form IS capped, and `flagless` tools cap from the first sibling |
| the eval `norms-config` path cannot install the honesty cross-check | it builds a contract-less spec and its schema has no `writeTools` key. Stated in the loader's own source; adding the key is a config-surface change, not folded in here |
