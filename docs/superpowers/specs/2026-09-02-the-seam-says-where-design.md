# The seam says where — design

Date: 2026-09-02 · Status: CLOSED — shipped. `SeamRow.where` and `SeamRow.spoken` live in
`packages/eval/src/lints.ts`, the table in `packages/emit/src/write-artifacts.ts`, and
`absent: true` in `packages/emit/src/write-cards.ts`. The skill teaches the row and the flag in
`references/norms.md` and `references/author.md`.

A refusal the world spells out reaches the operator at one of two moments: straight from the
call, or after they have already sent a confirmation code. The seam table now states which,
act by act, and names every rule that covers the act rather than the first one written. What
a row DESERVES stays the author's judgement — no table decides it — and a declared law can
now say the thing the world's own refusals most often key on: a field that carries nothing.

## 1 · The measurement

- The class, on the atlas: `releaseDeposit` answers `DEPOSIT_RELEASE_BLOCKED_CLAIM` from its
  world executor, past the consent gate. Case `55-friend-deposit-release` at the pinned door
  mints a confirmation code for a release the records refuse, and its rubric forbids exactly
  that. Runs `2026-09-02-firm-pinned-12` (the code minted) against `2026-09-02-firm-chat-en-12`
  (no code, the same case paid).
- What the table said about it: the guard cell read `tool:moneyMoveReadsTheRole` — a rule about
  the acting member's ROLE, which says nothing about a claim. It read the same on a copy of the
  subject where the missing rule WAS declared and did refuse the call: the cell is computed as
  the first guard that names the act, and the code never enters the computation.
- The size: 315 rows over 49 acts. In 49 of 49, every code carried the same single name. 137
  rows over 15 acts sit behind a consent hold.
- Why no rule can decide a row: `changePlan / PLAN_DOWNGRADE_BLOCKED` is met after the operator's
  code BY DESIGN — case `47-plan-downgrade` requires it: "after approval the reply refuses off the
  workspace's own refusal". `releaseDeposit / DEPOSIT_RELEASE_BLOCKED_CLAIM` is the same shape and
  its case forbids the ask. Two destructive acts, two world codes, opposite verdicts. The table
  reports; the author rules.
- Why `absent` and not `is: null`: the emitted walk answers `undefined` for a path the read does
  not carry, so a strict compare against `null` refuses an act on a read that simply omitted the
  field — a refusal nothing earned. Carrying nothing covers the null and the missing field alike.

## 2 · The implementation

1. **A declared law about a field carrying NOTHING.** `precondition` gains `absent: true`,
   configured alone: the act runs while the field carries nothing, and the emitted test is
   `walkAnswer(answer, '<path>') == null`. A value declared beside it states a second law under
   one name and is refused by the key that names it.
   (`packages/emit/src/write-cards.ts` — `fieldTest`, `LAWFUL_ARGS`.)
2. **The seam row names every rule over its act.** `SeamRow.guard` becomes `guards`, collected
   over every declared rule covering the act instead of stopping at the first.
   (`packages/eval/src/lints.ts` — `seamCovered`.)
3. **The seam row says where its code is met.** `SeamRow.where` is `after` when the act's effect
   is `destructive` — the consent hold is raised before the world is reached — and `before`
   otherwise. It is read off the world's own block and decides nothing.
4. **The table carries both, and says what each cell is worth.** The header states that the rules
   cell is about the ACT and not about the code beside it, that the `met` cell holds unless a rule
   refuses first, and that which moment a refusal deserves is the author's call.
   (`packages/emit/src/write-artifacts.ts` — `writeSeam`.)
5. **Nothing gates.** No lint fails on a row, no emit is refused, and no turn behaves differently.

## 3 · The documentation

- `write-artifacts.ts`, over `writeSeam`: what each cell is and what it is not.
- `lints.ts`, over `SeamRow`: that `guards` is about the act, and that `where` is the one thing
  the row states about its own code.

## 4 · The skill (same session as the engine)

- `references/author.md`: `absent: true` joins the `precondition` configuration row.
- `references/norms.md`: the instruction that walks the seam table reads the new column — a row
  the operator meets only after confirming, whose rules say nothing about its code, is a rule to
  write or a moment to accept on purpose.
- No authoring surface is removed and no declaration becomes invalid.

## 5 · Acceptance

1. Workspace green.
2. The atlas row for `releaseDeposit / DEPOSIT_RELEASE_BLOCKED_CLAIM` names both rules over the
   act and reads `after the code`; on a copy carrying the missing rule, that rule appears in the
   same cell.
3. `absent: true` emits `== null`; a value declared beside it is refused.
