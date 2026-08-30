# The delivered prose gets a reader

> **Status: DRAFT — awaiting the owner's review; BACKLOG row 45 is its register.**

## The measurement

The words the operator actually receives are checked by nothing once the composer has
written them. Four seams share that hole, each with a run in hand:

| seam | the measured case |
|---|---|
| reply guards run on the model's DRAFT (`turn.ts` builds `replyCtx` from `parsed.finish.message`) and the composer rewrites it afterward; `engineClose` runs no reply guard at all | c20 `test/2026-08-30-cert/full100` r067: the honesty floor read a `report` of `null` while the delivered prose carried the claim |
| a reading the desk never took is delivered as fact | c20 case 52 pre-repair ("I have checked the activity log" — no `getAuditLog` in trace); trialworks residual #1: after a licensed cancellation the desk re-proposes, reads its own refusal, and narrates it as though it described the record |
| a guard's conditional wall text is delivered as a standing world fact | c20 case 82 pre-repair: "the workspace is currently subject to a payment hold" while `listHolds` returned `count: 0` |
| the reply's language is unchecked at the delivery seam | c20 cert r058: the whole reply in French to an English operator — and `languageMismatches` counted 0 |

The class recurs in every domain measured (atlas, harborpoint, trialworks) and cost the
c20 certification 3 points net.

## The design — one reader, at the seal, on both paths

A `ProseReader` runs over the COMPOSED text — after the composer, before the seal — on
the model-finish path and the engine-close path alike. It is mechanical, reads only the
turn's own record, and refuses four things:

1. **A reading-claim with no read.** A sentence claiming the desk consulted a record
   ("checked", "found no record", "the log shows") on a turn whose acts carry no done
   read of a tool over that ground. The claim's evidence is the acts, nothing else.
2. **An act-claim with no act.** A sentence claiming a change landed (registered,
   cancelled, filed, paid) on a turn with no done non-read act of a matching tool —
   the inverse of the silent-done receipt floor.
3. **A wall echo as world fact.** A delivered sentence byte-matching a guard's rule
   text outside a refusal frame: a rule describes a CONDITION, and delivering it bare
   asserts the condition holds.
4. **The wrong language.** The reply's dominant script/language differs from the
   operator's turn — the check that `languageMismatches` was built for, moved to the
   seam where the delivered words exist.

On a refusal the turn takes ONE redrive with the reader's sentence as the correction;
a second failure delivers the floor form (record lines), which is always literal. A
new counter `proseReaderRedrives` rides the runner's emission.

**What this reader does NOT close** — stated so nobody sells it wider: a required
sentence OMITTED (c20 68/95's class), a tense lie beside a true fact, a refusal for
the wrong reason. Those need a judge's read; they stay rubric territory.

## The implementation (sketch, for review)

- `packages/core/src/run/prose-reader.ts` — the four checks, pure, over
  `{ text, acts, userText, guards }`.
- `turn.ts`: the seal pipe calls the reader after the composer on BOTH paths; the
  redrive reuses the existing correction channel; the floor fallback exists already.
- `runner` counters: `proseReaderRedrives` beside the existing quality counters, and
  `languageMismatches` re-pointed at the reader's language check (its current seam
  measured 0 on a French reply).

## The documentation

- `README` (the floors section) and `docs/tutorial/04-guards.md` gain the reader's
  row: the delivered words are read back against the turn's own acts.
- The source headers of `turn.ts` and `prose-reader.ts` state the law.

## The skill

- `agentspec/skill/references/guard-catalog.md` floors enumeration gains the reader
  (what it refuses, what it deliberately does not).
- `test.md`'s "Reading a failure honestly" section names the reader's refusals as an
  engine channel, so a T2 round does not spend wall wording on a class the floor now
  holds.
- Both in the same working session as the engine change, per the ship-together law.
