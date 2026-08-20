# What the next spec owes — the register

Every item here was found by measuring a real authoring, not by reading the pages. Each names the
evidence and what it costs. Nothing here is implemented; the spec decides what is.

---

## 1 · A byte-by-byte reduction of the compiled prompts

The largest open item, and the one with a number against it.

```
  what runs today          the six desks compile to 100 489 B of instruction
  what the hand author     99 538 B, and it scores 95/100
  what a desk actually     fleet   18 778 B  ≈ 4 700 tokens, EVERY turn
  sends per turn           workspace 12 412 B
```

The prefix is frozen — `prompt-writer.ts:18` memoises the system string and the tool cards, so
every turn of a desk sends the same bytes. That makes it the ideal prefix-cache target, and it
also makes it the ideal thing to shrink: a byte saved is saved on every turn of every case.

**Caching does not retire this.** Cached tokens still occupy the context window, and the reason
the bar exists is not cost — it is that the model must find the ONE rule that decides this turn
among fifteen cards. Across three measured authorings, more instruction never bought a better
score: a subject 42% larger than the reference scored the same, and the largest of all scored
worst.

### What the analysis must produce

| pass | question | shape |
|---|---|---|
| deterministic | which bytes are literally repeated? | `boilerplate.mjs` already answers this — repeated character runs across rendered lines, priced by the cards they are stamped on. It is written, tested against a real subject, and **called by no gate line** |
| deterministic | which bytes are structurally unavoidable? | the world card's own `does` sentences (24 757 B) and the JSON schemas (26 897 B) are 51% of the total and no authoring touches them. Anything the analysis proposes must say whether it reaches them |
| semantic | which sentence teaches nothing the model does not already read? | needs a reader, not a lint: a rule can be unique in wording and redundant in meaning. The output is one row per sentence — keep, shorten, or delete — with the reason |
| semantic | which sentence is load-bearing? | the inverse question, and the one that makes the reduction safe. A sentence whose deletion changes a verdict is not a byte to save |

**The bar is "no loss".** A reduction that costs a point is not a reduction. So the analysis ends
where it began — a judged run — and any proposal it makes is a hypothesis until the score holds.

### Where the bytes are today

```
  system prefixes, six desks    29 943 B     30%
  tool cards, six desks         70 546 B     70%
    ├─ world `does` sentences   24 757 B     the world card, frozen at G2
    ├─ JSON schemas             26 897 B     generated, never authored
    └─ contract rules stamped   ~18 900 B    THE AUTHORED HALF
```

Two thirds of the card bytes are not the author's to change. The authored third is where every
measured saving in this campaign has come from.

---

## 2 · `boilerplate.mjs` is written and no gate calls it

`packages/eval/boilerplate.mjs` finds the longest character runs shared between rendered lines and
prices each by the number of cards it is stamped on. It found 2 728 B of one repeated instruction
across eight rules — the single largest saving found in this campaign.

`echoes` cannot find that: it pairs lines by the words FEW lines use, and boilerplate is by
definition in many lines, so every one of its words scores as domain vocabulary. **The repetition
that costs most is exactly the repetition a rare-word pairing filters out.** A repeated character
run gets more damning the more lines carry it — the inverse — which is why both verbs are needed.

---

## 3 · A wide rule pays when the condition is identical

The catalog now teaches: a rule over five acts must speak in the words all five share, so split it
and let each act keep the half about it. An author pushed back with a case the page does not cover.

```
  precondition over 29 acts     181 B × 29 copies = 5 249 B, the top ruleCopies row
  the condition                 "suspended, not yet onboarded, or under a
                                 workspace-scope hold" — IDENTICAL on all 29
  the split                     repeats those three conditions 29 times, at
                                 greater total length
```

The page condemns the wide rule that must go generic because it covers different things. It does
not distinguish the wide rule whose condition is literally the same everywhere. That distinction
is missing and the page reads as an absolute.

**The shape that follows:** a `WIDE` map beside `WHY`, where a rule naming more than one act
declares which licence it claims — `oneLawEveryAct` (the sentence is true and useful on each act
it names) or `sameRefusal` (the acts share the refusal word for word). A verb `overWide(dir)`
returns the rules that declared nothing. This is the same shape that took `unlicensed` from 74 to
0, and it converts the last free-standing judgement in the render gate into a finite list.

---

## 4 · The render gate orders a deletion the author cannot perform

`echoes` returns 15 to 18 rows on a finished subject, and on the last two authorings **every
surviving row was a pair of the world card's own `does` sentences** — `listAssets` × `getAsset`,
`chargeDeposit` × `releaseDeposit` sharing "PRIVILEGED: requires canMoveMoney".

```
  the gate says   "per row: keep the line whose home the law belongs to, delete the other"
  the world is    frozen at G2, and generated — neither line is the author's to touch
  the result      a gate line that can only be answered "not mine", every time
```

Either the verb excludes generated lines, or the gate acknowledges the row and says what to do
with it. Today it does neither, and an author who follows the page literally is stuck.

---

## 5 · Findings from two blind authorings that no page answers

Each cost a real author real time, and each is verified against the engine source.

| # | the gap | what it costs |
|---|---|---|
| A | `covers` has no stated grammar. `changeAllowed:precondition` demands a guard named literally `precondition`, while `consent:destructiveThrottle` names a token in `RETIRED_NAMES` and `always:noDuplicateCall` names a floor guard. Three different readings, one syntax | the author named a guard after its own factory, contradicting the catalog's "a row a person recognises" |
| B | `{args.*}` over an OPTIONAL argument. N5 law 3 wants the ask to name the figure; a slot that cannot fill refuses the held call. `chargeDeposit.amount` is optional and defaults from the record | the ordinary call the exam exercises would be refused. Both authors found this by running the world, not by reading |
| C | a nested argument has no rung. `moveBooking` is `form: 'set'`, so the value lives inside `set`; `valueFromUser` reads a top-level arg and refuses a non-string | the one writable value on that surface is unreachable by the ladder; the author hand-wrote a `deny` and its own tokeniser |
| D | the four guard contexts are named nowhere. `InputCtx`, `CallCtx`, `ResultCtx`, `ReplyCtx` at `vocabulary.ts:121-136`; no page names a field | both blind authors read the engine source to write a `deny`. This is a direct, measured cost in authoring minutes |
| E | `promptLines` is a superset — it feeds `echoes` contract rules whose tools are outside that desk's lane, which render on no card there | three of eighteen rows were pairs between lines the model never reads together |
| F | the catalog says `precondition` names itself after its first tool; the engine mints `precondition:${tools.join('+')}` | the "two gates under one row" hazard the page warns about does not exist |
| G | the surface count. "31 tools" is the ACTING count; the world card declares 54 (23 reads, 16 writes, 15 destructive) | an author sizing its work from the wrong number |
| H | one exam case cannot be satisfied by a tool-need split: case 48 puts billing in front of a dispatch request, and N1 clusters `dispatchTechnician` onto fieldops | the rubric row wants the missing dispatch permission named by a desk that cannot reach the act |

---

## 6 · Speed — the twenty-fold bar

An adversarial pass is running against this. Its finding list belongs here when it lands.

```
  measured        one desk, five tools, no gate loop        14 min
                  the same, iterating until the gate held   18 min
                  six desks, thirty-one tools               36 min, and 24 of those
                                                            before the first card line

  the bar         under one minute for the six-desk surface
```

The primary evidence is the trail: 54 tool calls and 1.4 MB of transcript before one line was
written, including reads of `call-runner.ts`, `rulebook.ts`, `masker.ts`, `turn.ts` and
`vocabulary.ts`. **Every one of those is a page that failed to answer**, and gap D above is the
same finding seen from the cost side.

---

## Deferred by the declaration spec

`docs/superpowers/specs/2026-08-20-declaration-and-emitter-design.md` §7.2 admits none of these.
Each is real and verified against the engine; none moves one of that spec's four bars, and none is
a defect where something wrong passes the gate. The next spec opens from this section.

| id | what | why it waits |
|---|---|---|
| X1 | `S2` as a phase | its whole content is "never run it" — four deletions, no bar |
| X2 | `debate.md` — wire it or delete it | orphaned, and the decision is a product one |
| X3 | `local-performance.md` + `judge-ruler.md` — link or delete | reachable from nowhere; nine grading rules, and no bar measures them |
| X4 | `extract-fork.mjs`, `synth-fork.mjs` | named by no page, in either repo |
| X5 | `local-performance.md`'s parenthetical title | wording |
| R8 | `sync` and `census` signatures | tooling documentation |
| R9 | `ask/targets.json`'s schema | no authoring reaches it |
| R11 | status words — six renameable, five installed, one renders | wording, and no bar sees it |
| R12 | `resume.md`'s dead pointers | only the missing G3 cell is admitted; the rest of the page waits |
| G-H | case 48 cannot be satisfied by a tool-need split | an exam-design problem, not an authoring one |
| B1b | the SEMANTIC half of the byte analysis | it needs a reader per sentence and a judged run to prove "no loss" — its own spec, opening from the numbers the declaration spec produces |
| B5 | the remaining gaps of the two blind authorings | folded into B1b |

The ten rows the audit marked LEAVE ALONE are not here: no action is the finding.
