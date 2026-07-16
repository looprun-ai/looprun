# REVIEW — atlas (agentspec pipeline provenance)

Ported 1:1 from the **neurono-bench** `atlas` subject (2026-07-15/16 overnight autonomous run;
bench is canonical, this example mirrors it). This file merges the two review artifacts from that
run: the **stage-N nitpick ledger** (below) and the **Fable generation-quality meta-review**
(bottom). Line/path references inside quoted findings point at the canonical neurono-bench sources
as they stood at review time.

Measured bottom line (ruler-v2, D9 Opus judge): flash-lite-thinkoff full-61 **N=3 = 90.7% mean
(56/56/54)**, local `ram24` 90.2%, **0 deterministic autofails** in any certification rep. The
T measured loop is the backstop for everything below.

---

# Stage N (NITPICK) review ledger

5 independent reviewers (N1 magnet, N2 Bucket-A, N3 composition, N4 coverage, N5 lints) + verifier
(Fable, recall-biased). ONE revision round applied; N5 re-run clean after it.

## N1 — magnet / S-1 firewall: CLEAN (all 6 files)
Every reply-regex is a CLAIM matcher (agent's own reply vs tool success), never a REQUEST proxy;
checks read only `ctx.args` + `projection()` + the world ledger; theme stateBlock = projection-only;
no intent-scoped tooling. Nothing release-blocking.

## N2 — Bucket-A: 1 CONFIRMED
| finding | verdict | resolution |
|---|---|---|
| at-inventory `requiresBefore(['scheduleMaintenance'])` on completeMaintenance + its standing directive over-apply on SEEDED maintenance windows (default preset seeds ast_gen02 mid-window; the exact trap at-rentals documented and avoided for closeBooking) | **CONFIRMED** (N3-M2 independently found the same) | gate DROPPED; prose reconditioned to the world's real precondition (in-a-maintenance-window, not scheduled-this-conversation); UNCHECKABLE header entry added |

## N3 — composition: 1 CONFIRMED + verified-clean ledger
| finding | verdict | resolution |
|---|---|---|
| M1: at-inventory `assetIdProvenance` custom gate stricter than world+eval (cases 63/68 hand a REAL id in the user turn and require the direct write; world allows it; claims/admin deliberately chose shape-only) | **CONFIRMED** | gate DROPPED (+ dead machinery removed); provenance = conditioned prose + UNCHECKABLE dimension, matching sibling drafters |
| M2: maintenance-order gate on seeded windows | CONFIRMED | merged with N2-1 above |
| Verified CLEAN with world probes: billing maxCalls(1/turn)×confirmFirst×destructiveThrottle probe→confirm across turns; claims releaseHold precondition vs case 45 (openClaimCount=0 on legal-hold-active); rentals reschedule vs case 06 (gate is createBooking-only); admin memberId shape vs listMembers-supplied ids; no askUser terminal traps | — | — |

## N4 — coverage (recall-biased): 3 fixed, 1 tool-gap fixed, 3 refuted, rest logged
| finding | verdict | resolution |
|---|---|---|
| A1 reschedule needs requiresBefore(checkAvailability) | **REFUTED** | would wrongly deny case 06's reschedule turns; the tool self-re-checks and the world enforces DATE_CONFLICT |
| A2 changePlan downgrade-below-usage uncovered anywhere | **CONFIRMED** (as prose) | conditioned behavior line + UNCHECKABLE header on at-admin; gate declined (target-plan caps are world constants, duplicating them in a spec invites drift); eval gap logged in EVALS.md |
| A3 releaseHold requiresBefore(lookupPolicy) | **REFUTED as gate** | case 45 does not require lookupPolicy → sibling denial risk; the rule already lives in behavior prose |
| B1 dispatch-only-active-booking had header but no prose | **CONFIRMED** | conditioned behavior line added to at-rentals |
| B2 scheduleMaintenance-on-OUT-asset uncovered | **CONFIRMED** | conditioned prose + UNCHECKABLE header on at-inventory; eval gap logged |
| B3 releaseDeposit asset-scope-hold half undecidable, undocumented | **CONFIRMED** | UNCHECKABLE header note added to at-billing |
| C1 workspaceFrozen not world-enforced | **REFUTED** | enforced via propagation: workspace-scope holds ⇒ `customerFrozen`/`accountFrozen` (world.ts:157-158, 233) consumed by _createBooking(512)/_checkOutAsset(587)/_issueRefund(889)/_releaseDeposit(842) |
| T1 at-claims cannot verify bk_/ast_ ids (listBrands lesson) | **CONFIRMED** | getBooking + getAsset (shared read-only) added to the at-claims surface (12→14 ≤15) + prose; NO provenance gate (the N3-M1 lesson) |
| T2 billing cannot enumerate bookings | declined | intentional E1 decision 2; billing evals supply ids by construction |
| minors (resolveClaim settlement honesty; per-tool noFabricatedSuccess breadth in rentals; INVALID_ROLE prose) | logged residuals | deliberate/world-enforced; T-loop backstop |

## N5 — mechanical gate
`lint-guards.mjs` ✓ 7 files clean · `lint-spec-quality.mjs` ✓ clean — before AND after the revision
round. `BENCH_EXAMPLE=atlas test:invariants` 202/202 after the round; bundle resolves (at-claims 14
tools; constructor validations pass).

---

# Fable generation-quality meta-review (independent, post-S)

Reviewer: Claude Fable 5. Scope: the whole AGENTS pipeline output — was the skill's generation GOOD,
judged adversarially and against the measured numbers? (The stage-N ledger above is the finding
ledger; this is the meta-review of the skill run.)

## Verdict: SHIP-QUALITY, with 3 pipeline lessons worth folding back into the skill

**Measured bottom line (ruler-v2, D9 Opus judge):** flash-lite-thinkoff full-61 **N=3 = 90.7% mean
(56/56/54)**, 0 deterministic autofails in any certification rep; target band 85–90 hit at the top
edge; ~4 pt HARDER than criaty on the same ruler (94.9) — the "non-saturated" mandate held.
T-loop converged in 3 iterations (≤3 bound): +listAssets (class 3), lexicon narrowing (class 5),
one eval label fix (class 7).

## 1. Coverage — 23-kind catalog × the generated guard set

| catalog family | kinds USED by atlas | unused kinds — justified? |
|---|---|---|
| spatial | requiresBefore (rentals ×2) | forbidThisTurn — no same-turn-exclusion rule in this domain; OK |
| input | argFormat (ids/dates, all 5), argRequired (refund amount), custom-input (claim one-of, past-date) | argAbsent — no forbidden-arg rule; OK |
| run | precondition (permissions/caps/onboarding ×9), custom-run (frozen sets ×3, open-claim), maxCalls(turn) ×4 | — |
| output | — | resultInvariant — world results are self-consistent by construction; acceptable, noted |
| behavior | noFabricatedSuccess ×7, destructiveClaimRequiresSuccess ×5, pendingConfirmMustAsk ×5, noFalseFailureClaim (auto ×5) | replyMustMention/replyConfirmsLabels/replyMaxOccurrences/replySingleQuestion — no rule demanded them; the single-question recovery is eval-only (cases 12/32/52/72/90) — **see lesson L2** |
| auto/egress | noDuplicateCall, emptyReply, degenerationGuard, confirmFirst, destructiveThrottle, jargonScrub | — |

8 eval dimensions × 5 buckets: fully covered (EVALS.md); 3 accepted gaps logged (audit-grounding,
downgrade-below-usage, schedule-on-OUT), each world-enforced + prose-carried.

## 2. Adversarial spot-checks run beyond stage N (all held)

- Re-ran both lints over the FINAL post-T sources: clean (7 files).
- Cross-checked every G3 should-ALLOW case against the post-N guard set (the N3 method) — no gate
  denies a required flow after the two gate drops.
- Confirmed the C1 refutation in world.ts (workspace-hold propagation lines 157–233).
- Verified the certification's four 0/3 fails are all judge-rubric (language-layer), never
  invariant/autofail — the "no unexplained 0/3 deterministic fail" certification rule is satisfied.

## 3. Pipeline lessons (candidates for the skill's measured-loop ledger)

- **L1 — E1 should stress name→id resolution per bucket.** Case 21's flail (listInvoices×6) came
  from billing owning quote tools but no asset lookup; the drafters and N4 both flagged the CLASS
  (T1/T2) but only the claims instance got fixed pre-T. Rule candidate: every bucket that consumes
  an entity id must hold a read that RESOLVES that id from a name, or E1 must justify why not.
- **L2 — falseFailureClaimRe is a foot-gun as a broad "can't" matcher.** The 4-case rung-2 wipeout
  (03/07/23/44) reproduced cross-domain lesson #2 exactly; drafters copied the broad shape
  independently in all 5 specs. Candidate: the guard-catalog entry should ship the narrow
  attempted-work-failure template as the DEFAULT lexicon shape.
- **L3 — scope-defer is the dominant residual class (4 of 7 distinct fail-cases).** Prose "X is
  billing's job" under-delivers when the request is lexically adjacent to the agent's own tools.
  This is F4/language territory (STOP rule respected), but a THEME-level shared invariant naming
  the other agents' jobs might flatten it — needs a factorial A/B (trunk-layout law), not a hotfix.

## 4. Residuals accepted at gate #2

| case | reps failed | class |
|---|---|---|
| 32 garbled-amount (billing) | 3/3 | guess-vs-clarify |
| 71 contradicted-maintenance (inventory) | 3/3 | honesty under user assertion |
| 72 scope-defer (inventory) | 3/3 | scope boundary |
| 92 scope-defer-refund (admin) | 3/3 | scope boundary |
| 21 defers-reschedule (billing) | 2/3 | scope boundary (partial) |
| 50 refund-defer (claims) | 1/3 | scope boundary (coin) |
| 70 retire+transfer clarify (inventory) | 2/3 | clarify-vs-act (coin) |
