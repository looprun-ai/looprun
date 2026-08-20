# Render-first authoring — design

Date: 2026-08-20 · Status: CLOSED — certified at 0.95 across two runs failing the same five cases, in agentspec-bench/subjects/atlas-skill/test/2026-08-21-pair · Scope: the `agentspec` skill's shape, one lint verb in
`packages/eval`, and the measurements that close it. `packages/core` is not touched.

The agentspec skill's own gate is the Atlas: an agent that has read only its pages authors the
subject, a hundred cases run, every row is judged, and the score reaches 95. Three authorings of
that subject are now measured. This design says what the numbers show and what shape answers
them.

---

## 1 · The measurement

```
  subject                          exam     static gate     prose on SPEC / CONTRACT
  ─────────────────────────────────────────────────────────────────────────────────
  hand-authored reference          95        74 findings          65 / 9
  skill, pre-ladder pages          76        53 findings          36 / 15   (91 rows)
  skill, ladder pages              69         0 findings          36 / 15
```

On the 91 rows judged in both skill runs: **76 pass before the ladder, 64 after. Eighteen
regressions against six improvements.** The pages behind them grew from a 123-line catalog to a
536-line one, and the subject they author lost twelve points.

One confound cannot be removed from that pair: the earlier authoring was done by the agent that
also wrote the pages, and it fixed three gaps mid-authoring; the later one was blind. The
comparison does not prove the ladder caused the fall. It does mean nothing supports the ladder.

## 2 · Where the prompt comes from, and what that decides

`packages/core/src/run/prompt-writer.ts` is the only producer of prompt bytes, and it has exactly
two guard channels:

```
  system()      :34   voice · FACT lines · persona · OTHER DESKS · every SPEC guard's rule
  toolCards()   :49   a CONTRACT guard's rule, copied into the card of each tool it NAMES
```

Three consequences the skill never states:

```
  a guard on the SPEC                    one line in the system prefix, every turn
  a guard on the CONTRACT with `tool`    N copies, one per named tool card
  a guard on the CONTRACT with no tool   enforced, and read by nobody
  a JUDGED guard                         never rendered anywhere at all
```

The reference puts 65 of its 74 prose rules on the specs. The skill's pages route shared law to
the contract, and the pairing gate then demands `Guard.tool` on every prose rule — which turns one
system-prefix line into copies stapled to tool cards, and leaves a rule that legitimately reaches
no act in no prompt at all.

```
  compiled bytes, all six desks     SYSTEM     TOOL CARDS      total
  ───────────────────────────────────────────────────────────────────
  reference (95)                    32,705       36,337       69,042
  skill, pre-ladder (76)            20,730       39,498       60,228
  skill, ladder (69)                19,511       82,253      101,764
```

The subject that teaches least costs most.

## 3 · The static gate is anti-correlated with the exam

The gate this skill mandates before any spend, run against all three subjects:

```
  74 findings  →  95        every one PROSE_RESIDUE_UNDECLARED
  53 findings  →  76        every one PROSE_RESIDUE_UNDECLARED
   0 findings  →  69
```

Monotone, in the wrong direction. A sample finding against the subject that scores 95:

```
  cards.ts:107 — prose rule 'antiFabrication' names no act, and RESIDUE does not say why
```

The 74 rules the gate charges for are the teaching surface of the best subject there is.

## 4 · Eighteen of the thirty-one failures are the engine deleting the reply

The ladder ranks judged checks above prose. The blind author moved two rules onto
`injectionCheck()` and `impossibilityCheck()`, both on the contract, covering every reply.

```
  49-dispatcher-fleet-refusal   closedBy engine · 7 corrections
    ↳ redrive recordTextIsData   the judge answered YES to the declared question
    ↳ redrive noSuchOperation    the judge answered YES to the declared question
    ↳ redrive recordTextIsData   …
    ↳ forcedFinish
  delivered:  "Completed: getAsset.\ngetAsset() — done"
```

```
  turns closed by the engine after a real ask     reference 0 · pre-ladder 1 · ladder 25
```

The judge runs on the subject's own seat, so the model grades its own refusals; each YES is a
redrive whose correction names no move the model can make; past `limits.retries` the engine seals
whatever is left. Spreading a judged factory replaces its `rule` and never its `judgeQuery`, so
the author's own sentence was discarded from the judge and rendered nowhere.

## 5 · The shape

The current pipeline is organised around what is AUTHORED. Every phase's artifact is a card.
Nothing owns what is RENDERED, and nothing owns what SCORES. Three phases are added, one doctrine
is inverted, and one phase becomes a loop.

```
  ASK            unchanged
  GEN  G1 G2     unchanged, plus: `tail` declared, ids shaped prefix_suffix, and every
                 entry declaring `schema` also declares `target`
  SEAM     NEW   one table: every refusal the world can emit — each gate, each `when`,
                 each fail(CODE) in a custom executor — paired to the card guard that
                 refuses earlier in words, or to the `detail` the world will speak. A code
                 with neither is a residue row, named. It sits here because the world is
                 frozen after G2 and the guards are written after it.
  RUBRIC   MOVED the rubric rows, written from the business, IN FRONT of NORMS. A guard's
                 rule and a disclosure tense are the only authored strings a person ever
                 reads, and the specification of a sentence is the row it will be scored
                 against.
  NORMS N1       unchanged
  NORMS N2–N5    unchanged in ORDER, inverted in DOCTRINE — §6
  RENDER   NEW   print the assembled system prefix and every tool card, per desk, with the
                 two byte totals, and read them. Exit condition: every law you meant the
                 model to read appears in some prompt, and the system/tool-card split has
                 not inverted.
  EXAM           `covers`, `approve`, `invariants`, `preset` — these key on minted guard
                 names and cannot be spelled before the guards compile.
  TEST  T1–T3    a LOOP: slice → judge → classify → fix → RE-RUN. It exits when the bar
                 holds twice, or when the residual is signed as accepted.
  SHIP           unchanged
```

## 6 · The doctrine that inverts

| the skill says today | the measurement says |
|---|---|
| prose is the last rung, reached after sixteen mechanisms | prose on a SPEC is the only authored channel that reaches the system prefix — it is where a conduct law goes, first, before any domain rule |
| a shared law belongs on the contract | a shared law belongs on EVERY spec, in that desk's own act vocabulary; repetition across desks is the intended shape, not a DRY violation |
| a prose rule names the acts it reaches in `Guard.tool` | `tool` is for a law about ONE act. A behaviour law names no tool and lives on the spec, where naming nothing costs nothing |
| judged checks sit above prose | a judged guard renders no prompt bytes, redrives on its own model's YES, and past the retry ceiling the engine deletes the reply. It goes below prose, never on the contract, always with `tool` |
| `no spec declares a tool rule another desk also owes` (norms.md:319) | that clause forbids the reference's most-used move |

## 7 · What ships with it

| section | contents |
|---|---|
| the measurement | §1–§4: three subjects, the channel law, the gate's anti-correlation, the deleted replies |
| the implementation | `pairing()` stops charging for a tool-less prose rule; its question becomes "does this rule render in some prompt", which a spec guard satisfies by construction. A gate check fails any `judgeQuery` on the contract or without `tool` |
| the documentation | `docs/tutorial/04-guards.md` carries the channel law: where a rule is written decides whether it is read |
| the skill | the ladder inverted, the three phases added, T3 made a loop, the bar written down, and four teaching errors corrected — `temperature`, `valueFromUser`'s turn scope, `checkResult`'s context, the render channels |

## 8 · Four teaching errors, each verified in the engine

| error | the evidence | what it costs |
|---|---|---|
| decoding is never pinned | the reference sets `llmParams: { temperature: 0 }` on all six specs; both skill subjects set it nowhere, and the word appears in no page | the reference ran at 0 and the skill subjects at the provider default |
| `valueFromUser` reads THIS TURN ONLY | `catalog.ts:477` is `tokens(ctx.userText)`, while `groundedIds` at `:198` reads `ctx.userTexts` | a figure spoken in turn 1 is refused in turn 2, and `$25,000` never matches `25000` |
| the four guard contexts are undocumented | `InputCtx`, `CallCtx`, `ResultCtx`, `ReplyCtx` at `vocabulary.ts:121-136`; no page names a field | a hand-written `deny` cannot be written from a blank card, and `checkResult` landed nothing |
| the render channels are undocumented | `prompt-writer.ts:34` and `:49` | an author cannot tell whether the law they wrote will be read |

## 9 · The measurements that close this

Cheapest first. Each answers a question the others cannot.

```
  1  delete the two judged guards from the authored cards, change nothing else,
     re-run the 100                        bounds the eighteen-row hypothesis
  2  add temperature 0 to the six specs,
     run three reps                        separates decoding, and gives the first
                                           variance band a skill subject has had
  3  a blind author against the PRE-LADDER
     pages, same cases                     decides whether the ladder is the regression
                                           without the author confound
  4  the reference's hundred rows and the
     subject's hundred rows shuffled into
     one file and re-judged blind          says whether the ruler is part of the gap
```

## 10 · What this design cannot claim

The Atlas is the only subject there is, and it was authored by hand to 95 by the same agent that
writes these pages. A score on it measures the skill against that agent's own knowledge, not
against the world. "Better than a hand author on any domain" has no measurement until a second
domain exists.

The reference's 95 is three repetitions. Both skill scores are one run each, so neither carries a
variance band. `ship.md:36` states the law both break: *"One run at 0.95 says one run scored
0.95."*

Both skill-authored subjects reuse the reference's world data, its thirty-one tool schemas and a
byte-identical `cases-data.ts`. Phases ASK, GEN and EVALS were therefore never exercised, and no
score here says anything about their shape.
