# The intent gate — design

An operator's message either asks for an ACT or it does not, and that decision is made ONCE,
as data, at ONE door: every message enters through the front desk's `route()` call, chat and
pinned alike — a single desk just makes the desk half of the answer trivial. A turn the
operator asked to CHANGE something ends on the record, not in words: when such a turn is about
to close with nothing attempted, ONE step carries the cards that change something and the
order to make the call. The desk calls, and the denial names the blocker; or it calls nothing,
and the turn ends the way a turn with no intent would.

## 1 · The measurement

- The class: runs `2026-09-02-floor-chat-pt-12` r1–r4, cases 55, 100, 48 — the desk answers
  an act request in words alone; no guard fires, nothing forces the blocker or the names.
  The same class at the pinned door whenever the desk reads and speaks instead of attempting.
- Why prose cannot close it: an information turn and a prose-refused act turn are
  structurally identical — only the operator's words say which, and the engine may not read
  them. (`closesOnNothing` was built and reverted on exactly this: 25 legitimate
  read-and-answer tests refused.)
- The precedent that carries the design: the OWED-READ MICRO-STEP (`turn.ts`) — a single
  restricted surface plus an order naming what to call, on the conversation the desk has been
  reading all turn. The act micro-step is that same shape over the act cards.
- **The classifier's own number**, measured on the subject model at both real doors — the
  one-desk pinned window and the full router window — over the directed twelve's asks and
  their information-turn neighbours, EN and PT: 12/12 at each door, zero false `no`.
- **What a card alone buys**: nothing. On case 55's window with the booking read and the
  claim visible, a desk whose finish card is absent and which is told nothing writes the same
  refusal, word for word, that it writes with every card present.
- **What the order buys**, on the same window: with the act cards and the order, the desk
  calls `releaseDeposit(bk_1003)` in EN and in PT, and calls it after having written the
  refusal. Over nine act turns the call is the right one nine times; over two turns no
  surface performs, and the desk calls nothing.
- **What the order needs to hold on the DESK'S OWN window**: the records the desk has read
  ride in its system block, and a desk reading the blocker there answers the order in words
  again. The sentence that says the desk is not the one who decides — and that a refusal it
  writes itself stands on nothing the operator can be shown — is what lands the call in that
  window, in both languages.
- **What the order costs**: fired on an information turn it can mint a call the operator did
  not ask for. The classifier is what keeps it off those turns, and a destructive act reaches
  the operator as a consent question, never as a change.

## 2 · The implementation

One decision, ONE door, one consequence.

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
3. **The act micro-step.** On `act: 'yes'`, at the moment the turn would end with no non-read
   attempt on the record — the desk called the finish, or emitted nothing at all — the engine
   drives ONE step whose surface is the desk's cards with `effect !== 'read'` and whose one
   user-role message carries the operator's own words and the order to call. A rule that
   forbids the operation is not a reason to skip the call: the denial is what names the
   blocker, the who-can names and the ceiling, and forces them into the delivery in any
   language. A call that lands re-enters the loop with the attempt standing, and the finish
   the desk had written is dropped — that message never carried the facts the attempt now
   owes. A held call closes the turn from the engine's side, as any consent question does.
   No call, and the turn proceeds exactly as it would with no intent read at all. The step is
   spent once per turn, whether or not it yields a call. The main loop's tool list is
   untouched: the finish is on every surface it always was.
   (`packages/core/src/run/turn.ts`, `actOrder` in `delivery-facts.ts`.)
4. **What this supersedes.** The declination walk (`no_tool_called` running the act's checks)
   is not needed: the attempt is driven, so the walk's facts arrive through the attempt
   itself. Its unmerged branch is discarded with its spec, which is stamped deprecated.

## 3 · The documentation

- `turn.ts`, at the act micro-step: what the step is for, that a forbidden operation is still
  called, and that a desk calling nothing ends its turn unchanged.
- `delivery-facts.ts`, over `actOrder`: the order is the operator's own words plus the reason
  the call comes before the words.

## 4 · The skill (same session as the engine)

- `references/engine-seams.md`: the turn map gains the act micro-step at the seam where the
  desk ends a turn — the figure's line, and the paragraph that says what the step offers and
  what a desk calling nothing gets.
- `test.md`: the "declination" repair channel added for the superseded design is REMOVED —
  under the gate no repair channel is needed for the silent class.
- No authoring surface changes: an act card is a card in the world's `writes` or `destructive`
  block, which every declaration already writes. Declarations, cards and exams are untouched.

## 5 · Acceptance

1. Workspace green. The only prompt the change touches is the front desk's own window: it
   gains the `act` field on the `route` schema and the sentence that asks for it. Every desk
   prompt is byte-identical — the act micro-step composes a step of its own and edits none.
2. Pinned 12 and chat EN letters: no point lost.
3. Chat PT: 55, 100 and 48 pay — the driven attempt fires the guards and the forced facts
   cross the language. The full run judged in session, floors and letters together.
