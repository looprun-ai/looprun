# minimal-core — parked decisions

Questions only the owner can answer, parked by the unattended run. Each entry names
what blocked, what was tried, and the exact question. An empty file means nothing
needed the owner.

## D-1 · Should the close-step's report be sealed and charged? (step 3, not blocking)

The desk's close-step files a structured report, but `engineClose` sets
`draft.finish = null` unconditionally — the report is discarded on every engine-side
close, and `TurnRecord.finish` has no production consumer on that path.

What shipped (after the fix round): the close output is charged by every ruler that
polices the DELIVERED TEXT (floors, D1's owed-fact gate, the figure walk, the prose
reader); the three report-only rulers (`claimIsComplete`, `claimIsGrounded`,
`reportContradictsRecord`) do not run there, because their subject is discarded. This
is the measured microtest-6 funnel (15/15 prose) and it kept `floorDeliveries` flat.

The alternative the owner may want: SEAL the close-step's report
(`closedBy: 'engine'` with `finish ≠ null`) and charge the report rulers against it.
It buys a truth check on consent-hold and retry-exhaustion turns; it costs settling
the `p08-forced-finish` null pin and every dump consumer that assumes
`closedBy='engine' → finish=null`.

The question: seal and charge the close-step report, or keep it discarded?
A related gap on record: `lieCheck` (judged) never runs on close deliveries — zero
judged guards are declared today, so this costs nothing until a desk opts in.

## D-2 · The STATE_TAG paraphrase class (step 3, not blocking)

The byte guarantee holds everywhere: no verbatim engine tag and no `[F…]` label ever
reaches a delivery, pinned and swept across every run. But the desk sometimes
PARAPHRASES the tag's wording into the operator's sentence — measured on the slice:
step-2 runs carried 2 composer-authored echoes, step-3 r1 carried 0, step-3 r2 carried
2 desk-authored ones ("This has not run; it stands held awaiting the operator's code."
against the tag's "this has NOT run — it stands held awaiting the operator's code…").
Case and punctuation differ, so the byte ruler cannot see it; the class is variance.

The options: (a) fold case/punctuation and match the tag's leading clause — the same
folding the prose reader already applies to declared rules; risks false floors on
legitimate prose that naturally states the fact; (b) leave the paraphrase to the
judged channel (lieCheck/naturalness reads), cost zero today. Shipped: (b).

The question: extend the mechanical fold to the tag's leading clause, or keep the
paraphrase class judged-only?

## D-3 · The close path can state a falsehood no mechanism catches (step 3, measured)

On the slice's final run (`mc-step3-slice5-r3`), `end-a-season-early` t2 delivered
fluent prose asserting the WRONG branch of the blocked act's two-branch rule:

> "Because the mooring was ended before this conversation, it is no longer a standing
> mooring and cannot be ended again."

The record contradicts it flatly — the turn's FIRST act is `endMooring(mo_1) — done,
origin: LICENCE`, executed this turn on the operator's code. That is r016's critical
letter, and it makes the slice 4/5 (every other case and letter holds; floors 0).

Every deterministic ruler passed the sentence: literals carried, F1–F4 named, no
ungrounded figure, no engine label, declared guards clean. The class is a model
truthfulness failure on the close path — exactly what the judged channel exists for,
and the judged pass does not run on the close path. The measurement priced this
residual: microtest-6's desk scored 11/12 on truthful act reports, not 12/12. On the
earlier runs this turn FLOORED, and the record dump asserted nothing — the letter held
by accident; fixing the floor surfaced the truth gap.

Options: (a) run a judged truth pass (lieCheck shape) on close deliveries — one judge
call per engine-closed turn, dedicated prefix per the ruling; (b) seal the close
report AND extend `reportContradictsRecord` to per-act tense/actor claims (bigger,
unmeasured); (c) accept the residual as priced and let the exam letters carry it.
Shipped: (c) — nothing unruled was built.

The question: which of a/b/c? Step 7 measures letters AND floors together on this
case either way.

## D-4 · Sealed exam scripts predate the ask-then-echo law (step 7, measured on two subjects)

The ruled `choiceFromUser` swap (step 1) changes the licence: a gated choice is
licensed by the operator's echo (option token + minted code), never by reading the
operator's prose. Three sealed exam cases were AUTHORED against the old prose
licence and are now unrunnable or short a turn:

- harborpoint `fuel-asked-for-by-the-litre` (r017): the case script has ONE turn —
  the desk now asks for the fuel-type choice and the script has no echo turn to
  answer; unrunnable as authored (this run's one invariant failure).
- harborpoint r018: the choice refusal displaced the stock comparison the rubric
  wants on turn 1.
- trialworks `withdrawal-asks-first`: turn 1 says "she withdrew consent" (prose the
  old word map licensed); the desk now asks for the reason, no approval question is
  ever opened, and the scripted approve turn 2 fails with "no question ever held
  any of the approve refs".

Re-authoring sealed exams is forbidden in this run (re-run, never re-author), so
these rows are recorded as costs of the ruled change, separated in each score:
harborpoint 26/33 (28/33 on the mechanism-comparable set) · trialworks 26/29
(27/29 comparable).

The question: rule the exam-script migration (add the echo turn to choice cases —
one turn per case, the pt-BR case-68 minimal pair family) so step 7 can be re-run
comparable, or accept the rows as the ruled change's standing cost until each
subject's next authored revision?
