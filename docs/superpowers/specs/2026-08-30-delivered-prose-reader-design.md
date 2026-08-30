# The delivered prose gets a reader

> **Status: CLOSED — shipped on main; BACKLOG row 45 is its register. The engine, the
> docs (README · tutorial 04 · source headers) and the skill (guard-catalog.md floor
> table · test.md failure-reading row) landed in one working session.**

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

## The design — one reader, at the seal, on both paths, owning no words

A `ProseReader` runs over the COMPOSED text — after the composer, before the seal — on
the model-finish path and the engine-close path alike. It is mechanical, reads only the
turn's own record, and is bound by the house law that the engine carries no vocabulary
of any language — the declaration's own rule text and the operator's own message are
its only reference material. It refuses two things:

1. **A wall echo as world fact.** A delivered sentence byte-matching a guard's rule
   text outside a refusal frame: a rule describes a CONDITION, and delivering it bare
   asserts the condition holds. The byte-match reads the declared rule in whatever
   language the declaration is written — the check owns no words of its own.
2. **The wrong language.** The reply wholesale departs from the language of the
   operator's turn — measured as character-trigram profile similarity between the two
   texts, the conversation itself being the language sample. Same-language pairs
   profile far above the cut, sibling languages sit above it too, and texts too short
   to profile abstain: only a wholesale departure is refused. This is the check
   `languageMismatches` was built for, moved to the seam where the delivered words
   exist — and freed of stopword tables.

On a refusal the turn takes ONE redrive with the reader's sentence as the correction;
a second failure delivers the floor form (record lines), which is always literal. A
new counter `proseReaderRedrives` rides the runner's emission.

**What this reader does NOT close** — stated so nobody sells it wider: a claim of a
read or an act the record lacks, a required sentence OMITTED (c20 68/95's class), a
tense lie beside a true fact, a refusal for the wrong reason. Detecting a claim takes
words, words belong to a language, and the engine carries none — that whole class is
the judged channel's (`lieCheck`); it stays rubric territory, never a word list in
the engine.

## The implementation (as built)

- `packages/core/src/run/prose-reader.ts` — `readProse({ text, userText, acts, rules })`,
  pure, regex-free (charter R6.6) and word-free: `foldedLetters` keeps any cased
  character (the letter test that needs no alphabet table; caseless scripts fold away
  and abstain by length), the wall echo is a folded byte-match against each declared
  rule of 24+ letters, and the language check is cosine similarity over character
  trigrams with a 0.15 cut and a 40-letter profile floor. Measured on the calibration
  probes: same-language pairs 0.45–0.57, wrong-language pairs 0.03–0.05, the pt/es
  sibling pair 0.29 — the cut refuses only the wholesale departure, with 3× margin.
- `turn.ts` — `readDelivery()` runs after the composer on BOTH close paths; a floor
  delivery is exempt (record lines are literal). One redrive through
  `ReplyComposer.deliver(…, correction)` — a new optional parameter that appends the
  refusal as a DESK CHECK to the same template — then the literal floor. Each refusal
  lands on the record as a `proseReader` correction carrying its check and sentence.
- `packages/eval/src/counters.ts` — `proseReaderRedrives` counts the reader's refusals
  off the record; `languageMismatches` counts the language refusals among them. The
  post-hoc stopword comparison is gone: the check runs where the delivered words
  exist, and no stopword table exists anywhere.
- `packages/core/test/run/prose-reader.test.ts` — ten letters over the two refusals:
  the refusal frame, a Portuguese-declared rule echoing the same, the en↔fr and pt↔en
  departures, the pt/pt pass, the pt/es sibling abstention, and the short-text
  abstention.

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
