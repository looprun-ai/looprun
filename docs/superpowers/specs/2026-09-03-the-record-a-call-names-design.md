# The record a call names — design

Date: 2026-09-03 · Status: CLOSED — shipped. The binding lives in
`packages/core/src/cards/catalog.ts` (`answerForCall`, `RecordSource`) and
`packages/emit/src/write-cards.ts` (`keyLines`, `sourceArgs`); `pays` in
`packages/emit/src/declaration.ts` and `write-artifacts.ts`; `Denial` in
`packages/core/src/contract/vocabulary.ts` and `readDenial` in `run/rulebook.ts`; the label walk
in `run/delivery-facts.ts`.

A law that decides on a record decides on the record the CALL names. A rule that closes a seam
row says which row it closes. A check that refuses for something its card's rule does not state
says so for itself, and its words stand where the rule would have. None of the three reads a
word of any language, and none is inferred from prose.

## 1 · The measurement

- **The loose read.** Every answer in the reads log is keyed by the arguments it was read with
  (`run/call-runner.ts` — the read's declared target where it has one, its canonical arguments
  otherwise), and three factories asked for the newest answer of their tool whatever record that
  was. Two answers, one log: `getBooking(bk_1001) → confirmed` then `getBooking(bk_1099) → closed`
  answers `closed` unkeyed and `confirmed` under `bk_1001`. `argMatchesRecord`'s own law is the
  field of the call's OWN target row, and it read the other one.
- **The row that could not close.** `gen/SEAM.md` marks a row whose sentence the operator only
  reads after confirming. On the atlas the mark held after the rule that refuses the call was
  written, because nothing in the table said which row a rule pays: the same fifteen rows every
  run, and the author re-deciding them from scratch.
- **The refusal that told the operator something untrue.** A card's rule is the law that refuses
  and rides in front of whatever the check returns. The role gate's acting-record branch refuses
  because it has no record to judge, and the operator — an owner holding the capability — read
  that their role does not carry it. Run `2026-09-02-n4b-pinned-pt-12`, case 29: the desk called
  `getMember` with an argument where the card asks for none, and answered the operator with the
  law's words about a law that never ran.
- **The label the wrapper hid.** `engineLabels` found `[F1]`; the desk wrote `(F1)`. Run
  `2026-09-02-skillrun-chat-en-12`, case 51: three of the prompt's own fact labels reached the
  operator, and the guard that exists to refuse them saw none.
- **What the whole build measures**: the ruler, 100 cases pinned, 154 turns —
  `2026-09-03-ruler2-pinned-en-100`: zero floors, zero failures, two invariant misses (`37`
  variance on a guessed date, `80` unchanged since the ruler of 2026-08-29), 98/100 cases passing
  every critical rubric row. The two that fail are registered as E1 and E4.

## 2 · The implementation

1. **The answer belongs to the call.** `RecordSource` gains `args` — each of the read's own
   arguments mapped to one of the act's — and `answerForCall` asks the log under that key. The
   mapping is not declared twice: the read-order rule beside the law (`needs`, over the same act
   and the same read) already carries it, and the emitter writes it into the source. With no such
   rule there is nothing to bind to and the law stands on the newest answer, exactly as before.
   Covers `precondition`, `valueFromUserOrRecord` and `argMatchesRecord`.
2. **A rule closes the row it says it pays.** A guard and a disclosure `cap` each take
   `pays: <code>`, and the seam table stops marking that row. Nothing infers it: a rule over an
   act is not a rule about every code that act can answer, and the table cannot read a sentence
   and know which refusal it is about. A ceiling pays too — it refuses before the operator is
   ever asked, and it is the only rung that compares an argument against a figure a read returned.
3. **A check may speak for itself.** A check answers `null`, a string — the card's rule, then
   this — or `{ says }`, which stands alone. The role gate's acting-record branch says so for
   itself and names the call that answers who is acting, and that it takes no arguments: a desk
   told only that its check failed retries the same call, and a desk told what to call reads and
   recovers inside the turn. The roster branch is NOT that case — the acting role has already
   failed the gate and only the names are missing, so the rule is what refused and speaks first.
4. **A minted label is unspeakable in every wrapper.** `engineLabels` answers for the labels THIS
   turn minted, as words of their own, wherever the desk put them. The set is closed and the
   engine wrote it, so nothing is guessed from shape and a name the records carry is never one.

## 3 · The documentation

- `catalog.ts`, over `answerForCall` and `RecordSource`: which record a law is about, and what a
  source naming no mapping stands on.
- `write-cards.ts`, over `keyLines`/`sourceArgs`: where the mapping comes from, and why the
  roster branch of a role gate speaks under the law while the acting-record branch does not.
- `vocabulary.ts`, over `Denial`: the sentence that rides after the rule, and the one that
  replaces it.
- `delivery-facts.ts`, over `engineLabels` and `carriesToken`: the closed set, and the wrapper.

## 4 · The skill (same session as the engine)

- `references/guard-catalog.md`: what a check answers when it refuses — the three returns, and
  the role gate as the one check that uses both.
- `references/author.md`: `pays` on a guard and on a `cap`.
- `references/norms.md`: the seam row that closes when a rule declares it pays that code.

## 5 · Acceptance

1. Workspace green; the subject's rendered prompt carries no byte of any of this — the bindings
   and the denial live in check bodies and in the engine's own composition.
2. The three factories decide on the row the call names where a read-order rule maps the
   arguments, and on the newest answer where none does.
3. A row closes when a rule or a ceiling declares it pays that code, and a rule paying another
   code of the same act closes nothing.
4. A minted label answers in brackets, in parentheses and bare; a name the records carry does not.
5. The ruler, 100 pinned: no floor, no failure, and every critical rubric row but E1's and E4's.
