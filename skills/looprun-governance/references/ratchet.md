# The coverage ratchet

The ratchet is the floor that keeps proof coverage from silently eroding. It is **computed**, not
stored — there is no counter file to bump or forge.

## The floor

Every exported **guard kind** must have a proof that is *complete*:

- all **three polarities** — a positive (the compliant flow it must allow), a negative (the violation
  it must catch), a neutral (the look-alike it must leave alone);
- **both L1 verdict classes** — at least one ctx'd case where `check()` fires (the correction string)
  and at least one where it stays silent (`null`); always-fire kinds (e.g. `forbidThisTurn`, whose
  `check()` ignores ctx by design) instead prove ctx-independence with ≥2 fires cases + an L3 pass case
  showing the target scoping is the real off switch;
- **≥1 L3 loop case** — the guard proven on a real governed turn via the scripted fake LLM.

For each kind the suite runs a `proof completeness · <kind>` describe that asserts exactly these
obligations. A kind counts as **covered** only when its completeness describe fully passes.
`pnpm proofs:run` reports `coverage: { covered, kinds }` and the record's `coverage` field is
`covered/kinds`. When they are equal, every kind is fully proven.

## Why there is no stored counter

A hand-maintained "we have N proofs" number can drift from reality and can be edited to paper over a
gap. Instead, coverage is derived **from the proofs on disk every run**: add a guard export without a
complete proof and its `proof completeness · <kind>` describe is red (or absent), so `covered < kinds`
and the run fails. Delete cases to make a run green and the same describe goes red. The floor can only
move up — by adding complete proofs — and never silently down.

## Mutators

Reply **mutators** (deterministic egress transforms, not gates — e.g. the jargon egress mutator) are not
`check()`-based guards, so they are covered through the **proven-mutators list** rather than the
three-polarity rule: each listed mutator needs a case proving its transform is applied on the terminal
reply (and a neutral case proving it leaves non-matching text alone). Their completeness is asserted
under the L1 lane alongside the guard kinds.

## What the ratchet does NOT do

- It does not judge quality of prose or pass-rate — that is the `agentspec` measured-loop's job.
- It does not gate on the SLM canary — that lane is report-only and advisory.
- It does not require a proof for non-guard changes (docs, tooling) — see the governed-surface list in
  [`../SKILL.md`](../SKILL.md).
