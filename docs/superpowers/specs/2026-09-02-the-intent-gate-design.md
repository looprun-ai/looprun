# The intent gate — design

An operator's message either asks for an ACT or it does not, and that decision is made ONCE,
as data, at ONE door: every message enters through the front desk's `route()` call, chat and
pinned alike — a single desk just makes the desk half of the answer trivial. On an act turn
the desk has no way to answer in words: the finish is not among its tools until an attempt
stands on the record. Execution is guaranteed by the tool list, never by prose, and no law is
restated desk-side.

## 1 · The measurement

- The class: runs `2026-09-02-floor-chat-pt-12` r1–r4, cases 55, 100, 48 — the desk answers
  an act request in words alone; no guard fires, nothing forces the blocker or the names.
  The same class at the pinned door whenever the desk reads and speaks instead of attempting.
- Why prose cannot close it: an information turn and a prose-refused act turn are
  structurally identical — only the operator's words say which, and the engine may not read
  them. (`closesOnNothing` was built and reverted on exactly this: 25 legitimate read-and-answer
  tests refused.)
- The precedent that carries the design: the front desk is already ONE forced single-tool
  step over a deliberately minimal window (`front-desk.ts` — desk lines, one exchange, the
  message; temperature 0; an unreadable answer is re-put byte-identical, twice unreadable
  fails — never a guess), and it measures 96–97/100 routed.
- **The open measurement this spec gates on**: the classifier's own accuracy. Before any
  engine work, ~30 real turns from the judged runs (the directed twelve and their
  information-turn neighbours, EN and PT) are put to the subject model with the intent
  question on the minimal window and judged in session. The deciding number: zero false `no`
  on the three residual cases; `unclear` is not a miss when a human reader also cannot tell.

## 2 · The implementation

One decision, ONE door, one structural consequence.

1. **Every message enters through `route()`.** The `route` tool's schema gains one field:
   `act: 'yes' | 'no' | 'unclear'`. Nothing else enters the window — no tool list, no cards,
   no history beyond what it already reads: naming the TOOL stays the desk's job (the desk
   has the cards and the history; the router must stay minimal, and its measured score rests
   on that). `readDecision` validates the enum with the same never-guess discipline.
   (`packages/core/src/run/front-desk.ts`.)
2. **The pinned path goes through the same door.** Direct-to-desk was a convenience, not an
   architecture: a pinned turn makes the same `route()` call with a one-desk window — the
   desk half of the answer is trivial, the `act` half is the decision. One window composer,
   one reader, one discipline; no second mechanism exists.
3. **The consequence — the tool list IS the law.** On `act: yes`, the step's tools carry the
   domain tools WITHOUT the finish card until the turn records at least one non-read attempt
   — done, refused or held, any standing. The desk cannot answer in words; it must move. The
   attempt is what makes the records speak: a guard deny mints the spoken refusal fact (the
   claim blocker, the who-can names, the ceiling — forced into the delivery in any language),
   a consent hold opens the question, a missing argument refuses and its refusal asks. Once an
   attempt stands, the finish returns and the close carries the owed facts. On `act: unclear`
   the desk's job is to ask, and the finish stays available. On `act: no` the turn is
   ordinary. No desk-side check restates any of this — there is nothing to verify, because
   the option to skip does not exist.
4. **What this supersedes.** The declination walk (`no_tool_called` running the act's checks)
   is not needed: the attempt is mandatory, so the walk's facts arrive through the attempt
   itself. Its unmerged branch is discarded with its spec, which is stamped deprecated.

## 3 · The documentation

- `front-desk.ts` header: the window decides the desk AND whether the message asks for an
  act; both are readings of intent and nothing else enters the window.
- `turn.ts` header: on an act turn the finish is withheld until an attempt stands — the tool
  list is the law.

## 4 · The skill (same session as the engine)

- `test.md`: the "declination" repair channel added for the superseded design is REMOVED —
  under the gate no repair channel is needed for the silent class; the row would teach a
  mechanism that no longer exists.
- No authoring surface changes: declarations, cards and exams are untouched.

## 5 · Acceptance

1. The micro-test number first — no engine work before it holds.
2. Workspace green; rendered prompts byte-identical except the router schema field.
3. Pinned 12 and chat EN letters: no point lost.
4. Chat PT: 55, 100 and 48 pay — the mandatory attempt fires the guards and the forced facts
   cross the language. The full run judged in session, floors and letters together.
