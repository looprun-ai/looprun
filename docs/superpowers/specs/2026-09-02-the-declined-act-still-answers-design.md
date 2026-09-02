# The declined act still answers — design

> **DEPRECATED — 2026-09-02.** Superseded by `2026-09-02-the-intent-gate-design.md`: the
> intent gate makes the attempt itself structural, so the declination walk this spec builds is
> not needed. Its engine work lives unmerged on branch `the-declined-act-still-answers`.

Execution is guaranteed by structure, never by prose: a turn cannot close empty-handed, and
declining an act runs that act's own law so the records answer anyway.

## 1 · The measurement

Runs `2026-09-02-floor-chat-pt-12` r1–r4 (judged in session): cases 55, 100 and 48 fail one
way — the desk neither attempts nor reports the act the operator asked for, so no guard fires,
no fact is owed, nothing forces the names or the blockers, and the floor of an exhausted turn
says `Nothing changed.` The shipped hook `reportClaimsUnattempted` closes the claimed-word
route; the silent route stays open.

## 2 · The implementation

One structural rule at the finish, over data the engine already holds — plus the honest
boundary of what structure can and cannot guarantee.

**What structure GUARANTEES: a `no_tool_called` row runs the declined act's walk.** For each such row, the engine
   builds the call — the row's `target` under the surface fact's own `target` argument name —
   and walks the rulebook's deny phase without executing anything. Every deny becomes a
   refused act on the record (origin `engine`), so its sentence becomes a spoken owed fact:
   the claim blocker, the who-can names, the ceiling — forced into the delivery in any
language by the existing gate. Declining is STRUCTURALLY EQUIVALENT to attempting — the same
facts are forced either way, so the desk never has to execute to make the records speak. The
honesty check treats the engine walk as its own bookkeeping (`honesty-check.ts`), so the
model's `no_tool_called` row stays truthful beside it.

**What structure CANNOT guarantee, and why.** Forcing "the desk must attempt or decline every
act the operator asked for" would need the engine to tell an ACT request from an INFORMATION
request: a read-then-answer-in-words turn is legitimate when the operator wanted information,
and only the prose says which it was. The engine may not read prose to decide, so a desk that
neither attempts, declines, nor asks — refusing in pure prose — is the residue this mechanism
does not close. That residue is a TEACHING, not a floor. The shipped `reportClaimsUnattempted`
still catches the variant where the desk CLAIMS a word (`refused`) with no act behind it.

## 3 · The documentation

`turn.ts` header gains the law: a declined act (`no_tool_called`) runs its own walk, so its
refusal reaches the operator without the act ever executing.

## 4 · The skill (same session)

`test.md` gains the repair for the residue: an act the operator asked for that the desk refused
in PROSE is declined structurally — the desk reports `<tool>: no_tool_called`, and the engine
walks that act so the blocker, the names and the ceiling speak. Refusing an act in words alone,
with no report row, forces nothing.

## Acceptance

Workspace green; pinned 12 and chat EN letters unchanged; chat PT r5 pays 55, 100 and 48 —
the walk-minted facts force the blockers and the names through the desk's Portuguese.
