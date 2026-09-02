# The T-loop accelerators, replayed — the measurement of record

One question, answered by running the same repair stretch twice: do the loop accelerators —
the rubric of record, the computed standing (`skill/scripts/loop-score.mjs`), the same-round
flip triage, and the one-desk round — make a blind loop converge faster without losing rigor?

## The two arcs, same input

Both loops opened on the FIRST COMMITTED EMITTED BUILD of `atlas-c20` (bench `c3745ab`) with
the current exam, and both were blind: generic dispatch, the loop's own exit rules.

```
 ORIGINAL (session-driven, one round per dispatch)
 ─────────────────────────────────────────────────
 r5   paid 51 · broke 48                  dry 1 of 3
 r6   paid 39, 72 · broke 51              dry 2 of 3   ← one round burned:
                                                         the tier-table wall
                                                         law + a stale rubric
 r7   paid 47, 48, 51 · broke nothing     PAID 12/12
 cost: 3 repair rounds, 1 of them a backfire

 REPLAY (one autonomous agent, accelerators live)
 ─────────────────────────────────────────────────
 round 1  paid 39, 51, 72 · broke 29      three repairs, three DISJOINT desks
 round 2  paid 29 · broke nothing         PAID 12/12
 cost: 2 repair rounds, backfire caught and pinned in-round
```

## What each accelerator bought, in the replay's own record

| accelerator | where it fired |
|---|---|
| the rubric of record | case 47 passed with ZERO edit — the agent read the exam's current text and saw the ruled path already paid |
| the ceiling-symptom line | the agent went straight to the disclosure `cap` for 39: a second needs alias (`getDepositBalance`, no arguments) and a cap on `amount` at `float.depositFloatRemaining` |
| same-round flip triage | its own wall sentence broke case 29; it ran the case three times unchanged (3/3 fail = a break, not wobble), reverted only that sentence, ran once (pass) — cause pinned inside the round |
| one-desk round | the three round-1 repairs rode three different desks, each independently attributable |
| computed standing | every round's paid/broke/dry printed by `loop-score.mjs`, never remembered |

## The repairs, as the replay's `repairs.jsonl` recorded them

- **39** — `contract.disclosure.chargeDeposit` takes a second needs alias `float`
  (`getDepositBalance` with no arguments) and a `cap` on `amount` at
  `float.depositFloatRemaining`, refusing with the tier, the float limit, what is held and
  what is left.
- **51** — the workspace desk's wall states the roster read settles the sole owner before any
  call: removal and demotion of the last owner are refused in words, no call put up, no code.
- **72** — the fleet desk's `recordsOverAssertions` drops "a workshop job being done" from the
  claims weighed against the record; the operator reporting the work finished grounds the
  return, and the condition is asked for.
- **29 (round 2)** — the sole-owner wall law re-keyed on the member list alone; the wording
  that sent the desk to a named-member look-up is gone, so the acting read stays keyed to the
  call that names nobody.

## The verdict

The accelerators pay: the same stretch converged in two rounds instead of three, the one
backfire was pinned to its exact sentence inside the round that made it, and no score point
was traded for the speed. The prose-held caveat stands as the loop page states it: lines paid
by wall sentences (51, 72 here) are the loop's weakest passes and are reported as such.
