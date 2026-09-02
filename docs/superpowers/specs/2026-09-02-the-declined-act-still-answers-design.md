# The declined act still answers — design

Execution is guaranteed by structure, never by prose: a turn cannot close empty-handed, and
declining an act runs that act's own law so the records answer anyway.

## 1 · The measurement

Runs `2026-09-02-floor-chat-pt-12` r1–r4 (judged in session): cases 55, 100 and 48 fail one
way — the desk neither attempts nor reports the act the operator asked for, so no guard fires,
no fact is owed, nothing forces the names or the blockers, and the floor of an exhausted turn
says `Nothing changed.` The shipped hook `reportClaimsUnattempted` closes the claimed-word
route; the silent route stays open.

## 2 · The implementation

Two structural rules at the finish, both over data the engine already holds:

1. **An empty report does not close a turn.** A finish whose report carries no row is refused
   with the correction: name what this turn did — a row per act, or `<tool>: no_tool_called`
   for the act you chose not to make. (`packages/core/src/run/turn.ts`, the reply funnel.)
2. **A `no_tool_called` row runs the declined act's walk.** For each such row, the engine
   builds the call — the row's `target` under the surface fact's own `target` argument name —
   and walks the rulebook's deny phase without executing anything. Every deny becomes a
   refused act on the record (origin `engine`), so its sentence becomes a spoken owed fact:
   the claim blocker, the who-can names, the ceiling — forced into the delivery in any
   language by the existing gate. An act nothing refuses records as declined in the engine's
   own words. (`turn.ts` + the existing `assembleFacts` wrap.)

The shipped pieces this composes with: `reportClaimsUnattempted` (a claimed word with no act
redrives to the call), the spoken refusal facts, the token forcing, the floor that speaks only
what is owed.

## 3 · The documentation

`turn.ts` header gains the law: a turn closes by an act, a question, or a named declination —
never by silence. `delivery-facts.ts` untouched (the wrap already speaks refused acts).

## 4 · The skill (same session)

`author.md` / `guard-contexts.md` untouched — no authoring surface changes. The exam page
gains nothing: the mechanism is engine floor. One line in `engine-seams.md` if it lists the
finish contract: the report is never empty, and `no_tool_called` names the declined act.

## Acceptance

Workspace green; pinned 12 and chat EN letters unchanged; chat PT r5 pays 55, 100 and 48 —
the walk-minted facts force the blockers and the names through the desk's Portuguese.
