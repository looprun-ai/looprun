# Pass-fix audit — every change made while porting Atlas to the next engine

Input for an adversarial review. The question for EVERY item: **is this a
generic mechanism or domain truth, or a rubric-shaped patch made to pass one
case?** The fidelity standard: the OLD subject's spec sentences were
themselves written against these same cases, so "case-informed" alone does
not convict — the test is whether an EQUIVALENT rule exists in the old
subject (`agentspec-bench/subjects/atlas/norms/**`) or follows from the
world's own behavior. REVERT what fails that test.

## Verdict vocabulary

- KEEP — generic mechanism or faithful port of an old-subject rule.
- REVERT — exists only to make a rubric row pass; no old equivalent, no
  domain truth.
- RESHAPE — right intent, wrong home (e.g. belongs in the world, not a card).

## A · Engine changes (packages/next/core) — mechanisms, all generic by claim

| # | change | claimed justification |
|---|---|---|
| A1 | one consent question per (tool, target); executable replacement | sibling-question storm was unusable |
| A2 | a call that already ran steps aside from confirmFirst | re-asking after execution is a dead ask |
| A3 | a raised question closes the turn engine-side | the ask IS the delivery; every further step re-proposes |
| A4 | the FIRST question ends the emission; later calls never run | one ask, one answer, one turn (old-engine parity) |
| A5 | groundedIds floor guard; CallCtx.userTexts; the lane carries tail | an id nothing served is a fabrication |
| A6 | valueFromUser trims edge punctuation from tokens | 'ws_denver02.' vs 'ws_denver02' |
| A7 | integer coercion in canonical-call | a numeric string for a declared integer is the same number |
| A8 | provider-message replay for thought signatures; [record] fallback | Gemini rejects signature-less synthetic calls |
| A9 | a read from an earlier turn runs fresh; a write still replays | the record moves between turns (case 36 served stale held:0) |
| A10 | claimIsGrounded redrive names the way out incl. no_tool_called | the model was told the error, never the exit |
| A11 | rejected finish rides back as an assistant message | the model edited nothing it could not see (x3 loops) |
| A12 | no_tool_called report word; word+field legends in the finish card | the enum was bare — the model guessed word meanings; old terminal had a declaration row ("not carried out on X") |
| A13 | {result.*} two-phase render; a restated done write speaks its outcome | the after tense could never state what the call returned |
| A14 | after-tense on EVERY done call, reads included; unfillable = silent | documented old-engine behavior (skill references/norms.md) |
| A15 | cap { arg, at, refusal } on Disclosure — deny over an owed read | "the desk never asks about an act the records rule out" |
| A16 | reads may ground report rows (a true echo is not a lie) | user ruling: nothing leaves the report silently |

Suspect angles for A: A15 is NEW vocabulary that the old engine never had —
the old subject passed 38/39 on model conduct alone. Generic mechanism, but
born to make two rubric rows deterministic. A3/A4 changed WHO speaks the
consent turn (engine, not model) — every "the reply must state X" rubric now
lands on card sentences instead of model prose; half the bench edits below
exist BECAUSE of this shift. Review whether that architecture is sound or a
compounding patch.

## B · Bench card changes (atlas-next) — the suspect zone

| # | change | old-subject equivalent? | my own flag |
|---|---|---|---|
| B1 | consent tenses name amount/target/destination/scope ({args.*}) | old model wrote its own asks with figures (guard-driven) | KEEP-leaning: an ask that hides its object is a bad ask |
| B2 | chargeDeposit needs the workspace float read; float figures in the ask | old rule text: "read the deposit balance… and again with no argument for the workspace float" (ported onlyAfter rule) | KEEP-leaning |
| B3 | cap on chargeDeposit at float remaining | old: conduct prose only ("refuse a charge above it instead of putting it up for agreement") | REVIEW: rule existed as words; we hardened to mechanism |
| B4 | cap on issueRefund at amountPaid | old: same-style conduct words ("work that subtraction and refuse") | REVIEW: same as B3; also amountPaid ignores refunded (case 75 pending) |
| B5 | precondition voidInvoice: paid → refuse | old: behavior sentence "A void invoice is terminal…" + world refuses INVOICE_PAID | REVIEW: world already refuses; card duplicates world law |
| B6 | precondition releaseDeposit: open claim → refuse (record identity) | old: model conduct; world refuses under claim hold | REVIEW: same class as B5 |
| B7 | desk personas grew conduct lines (billing/rentals/fieldops/claims/fleet/admin) | each mirrors an old behavior[] sentence (billing line 77 verbatim-ish; rentals lifecycle; fieldops figures-from-return) | KEEP-leaning where the old sentence exists; VERIFY each against the old spec text |
| B8 | fieldops persona: "say the fee is settled when the return is recorded" | old behavior: figures come from the return itself | REVIEW: the exact sentence is rubric-37 wording |
| B9 | admin persona: "an invite at the seat cap quotes seats used against the cap; a plan move the usage does not fit quotes the usage against the target tier's caps" | old: blockerFamily prose ("a limit is reported together with what stands against it") | REVIEW: rubric-46/47-shaped specialization of a rule that already exists generically |
| B10 | read afters: getDepositBalance, getPlanUsage (+"a cap that blocks an operation is lifted by a higher plan tier or by freeing what fills it"), rescheduleBooking | old engine printed afters on every ok call; old skill shows getPlanUsage.after as THE example | KEEP-leaning; the way-out clause on the usage line is rubric-45-shaped — REVIEW that clause |
| B11 | transferAsset argFormat ^ws_ + rule text (no-lookup, read own id first) | old: model conduct; case 66 invariant requires getWorkspace | REVIEW: "read your own id before speaking of it" is invariant-chasing wording; the ws_ format itself matches the schema pattern (generic) |
| B12 | TARGET_ENTITY map (target id → record family) | fixes a port bug (everything was 'auditLog'); preconditions found no record | KEEP: bug fix |
| B13 | temperature 0 on six desks | old engine pins temp 0 for reproducible runs (model-params.ts) | KEEP: parity |
| B14 | tail: ['workspace'] + today on the workspace record | VIOLATES the old stateBlock law: "only what disqualifies a whole turn and what no read can answer", no identifiers | RESHAPE (approved): world-card condition sentences + date, no ids |
| B15 | resolveClaim before += "whatever the settlement takes above the deposit held cannot be raised from this desk and has to go outside this system" | old claims behavior line 77 says exactly this | KEEP-leaning |
| B16 | placeHold before: "A workspace-scope hold stops every gated operation in the whole tenant…; only releaseHold undoes it" | destructive only at workspace scope (when-clause), so the wording is true; "only releaseHold undoes it" mirrors rubric-27 r4 | REVIEW the r4 clause |
| B17 | scheduleMaintenance refusal = bare code; getAsset unchanged | port fidelity (old world identical) | KEEP |
| B18 | payInvoice after {result.paid} (was {args.amount} — exploded on argless calls) | after-tense law: state what the call returned | KEEP |

## C · Exam-runner changes

| # | change | flag |
|---|---|---|
| C1 | stale (consumed) code replays; never-issued ref filtered to null; all-null throws | mirrors old template behavior; KEEP-leaning |
| C2 | ungoverned consent turns play as plain words | required for the twin; KEEP |
| C3 | every error is an incident row; case never kills the campaign | KEEP |

## D · Discoveries the reviewers need

1. The baseline (2026-08-12-baseline-v020) scores 96/100 on invariants
   (62, 63, 72, 80 fail) and 85/100 judged; the fifteen judged failures are
   43 47 48 49 50 51 52 62 63 72 80 82 87 92 100. Parity duty = the 85.
2. The old engine pins temperature 0; hot sampling caused most re-run flips.
3. The old stateBlock law (norms/contract.ts): conditions + date only, no
   identifiers — "deliberately silent about WHICH asset or account is frozen".
4. The old structured terminal has a declaration row for a decision not to
   act ("not carried out on X — the role does not allow it").
5. The old engine prints after-tenses on every ok call, reads included.
6. Case 80 fails on BOTH engines the same way (getAsset serves
   upcomingBookings; the refusal is a bare code; listBookings never called).
7. The consent-architecture shift (engine speaks the ask; model never
   finishes a held turn) is the root of most bench sentence work.

## E · The review protocol

For each B-item: (1) find the old-subject sentence or world behavior it
claims descent from; quote it or state its absence; (2) decide KEEP /
REVERT / RESHAPE with one sentence of grounds; (3) for every REVERT, state
which case(s) will fail again and whether the honest state is "baseline
also fails" or "regression to fix by other means". Bench dirs:
`agentspec-bench/subjects/atlas-next/**` (new) and
`agentspec-bench/subjects/atlas/norms/**` (old). Engine:
`looprun/packages/next/core/src/**`.
