# The agentspec skill under attack — 109 findings, 80 survived

Nine axes derived from the pages themselves, one hostile auditor each, every finding sent to an
independent refuter that began by assuming it false.

```
  correctness   109 raised · 80 survived refutation
  speed         37 raised · 0 survived refutation
  axes          
said-twice                page-versus-page                prose-where-a-lint-decides                ceremony-without-a-consumer                engine-drift                exemplar-fails-its-own-gate                numbers-without-a-source                dangling-pointer                house-law-compliance
```

---

# agentspec fix list

Every line number below was re-read at HEAD today. **The auditors' `guard-catalog.md` line numbers are stale by ~23 and their `norms.md` numbers by ~5** (commits `ec5adaf` and later inserted lines above). The numbers here are current. Where two findings were one defect seen twice, they are merged and the merge is named.

Measured baseline for everything that follows — the only shipped six-desk subject, `agentspec-bench/subjects/atlas-render`:

```
  cards.ts        62 710 B   ≈ 17 400 output tokens   6 desks · 45 prose calls · 15 disclosure tenses
    prose laws    17 125 B   45 calls, 8 distinct law names
    disclosure    12 096 B
    personas       1 615 B      facts 1 822 B      voice 477 B
  world.ts        71 292 B   (generated: generated/world-data.ts + world-kit.ts)
  cases.ts           142 B   (generated: generated/cases-data.ts, 84 559 B)
  all five static lints over that subject:  0.45 s
```

---

## 1 · DELETE

Text that goes, because another page already says it better. Ordered by bytes removed from the reading path.

| # | out | file:line | bytes | surviving home |
|---|---|---|---|---|
| D1 | N5's laws 2–6 — the five disclosure lessons | `norms.md:298-326` | ~2 400 | `guard-catalog.md` Lesson 1 (`:606`), Lesson 2 (`:618`), Lesson 3 (`:631`), Lesson 13 (`:774`) |
| D2 | the duplicated `### guards on the spec` block | `norms.md:221-225` | 240 | `norms.md:180-184`, identical (`diff` is empty) |
| D3 | the conduct-rules restatement | `norms.md:226-232` | 480 | `guard-catalog.md:256-345` §2 |
| D4 | Lesson 17 | `guard-catalog.md:846-857` | 560 | `evals.md:74-83` §2, same heading, same code shape |
| D5 | `covers` grammar B | `evals.md:129-141` | 640 | `evals.md:19-22` + `SKILL.md:43` |
| D6 | `thinking-template.md` consumer list | `thinking-template.md:22-23` | 190 | — (see below) |

**D1** — `norms.md:281` says "Six more laws this phase enforces" and then restates the catalog's own lessons in shorter, poorer form. Law 2 is Lesson 2 without `{result.remaining}`; law 3 is Lesson 1 without the demurrage arithmetic; law 5 is Lesson 3 without the ways-out; law 6 is Lesson 13 without the held-vs-ordinary split. Law 1 (`needs` argument mapping) is **not** duplicated — it is `norms.md`'s alone and stays.

```
out   norms.md:281   Six more laws this phase enforces:
                     … laws 2,3,4,5,6 …
in    norms.md:281   One law this phase enforces, and four the catalog already teaches
                     — read Lessons 1, 2, 3 and 13 of [guard-catalog.md](guard-catalog.md) §6
                     before writing a tense.

                     1. **The read must answer from the held call's own argument.** …  (unchanged)
```

**D2** — `norms.md:180-184` (N3) and `norms.md:221-225` (N4) are byte-identical. `git blame` separates them: `46592a5` wrote the first, `756faf4` pasted the second into N4 with the first visible in its own diff context. Delete the N4 copy; N3 is the field-by-field walk of `AgentSpec` and `guards` is its closing field. Pair the deletion with one added row in N4's four-homes table (`norms.md:209-215`), which after the deletion names the spec home only through `AgentSpec.persona`:

```
in    norms.md:215+  | "You never move money; the billing desk does." | `AgentSpec.guards` | the desk's own refusal, at the highest priority |
```

**D3** — the page states its own policy at `norms.md:190-193`: *"The catalog is the only home for both questions… This page does not restate any of them."* Then `:226-232` restates §2's conduct block with the wrong count. Replace with a pointer that carries no number:

```
out   norms.md:228-230   Before the sweep walks a single domain rule, the four conduct rules of
                         [guard-catalog.md](guard-catalog.md) §2 are written, ON EVERY SPEC: declare
                         honestly, one question, your lane your reads, the record over the assertion.
in    norms.md:228-230   Before the sweep walks a single domain rule, EVERY conduct law of
                         [guard-catalog.md](guard-catalog.md) §2 is written, ON EVERY SPEC, in that
                         desk's own acts. §2 is the only page that lists them.
```

**D4** — `requiredToolCalls` appears exactly once in all 1 014 lines of `guard-catalog.md`: inside Lesson 17. Every other lesson is a spec/contract/world/floor lesson. It is an exam-authoring law sitting in the page `SKILL.md:50` makes the single home for **guard** decisions, and `evals.md` never links `guard-catalog.md` at all — so the E1b author who needs it is never sent there. Deleting it means renaming in three places, not two: `guard-catalog.md:601` (`## 6 · Eighteen lessons` → `Seventeen`), `norms.md:192`, and **`SKILL.md:54`**, which the auditor's fix missed.

Keep the one sentence a guard author needs, at `guard-catalog.md:359-361`, and give it the cross-reference: `…leave the guard off — see [evals.md](evals.md) §2.`

**D5** — `evals.md:131` declares "A key is `<category>:<guard name>`" and then offers `moneyGate` (no colon) as a key in the same sentence. `changeAllowed` appears **nowhere** in `packages/core/src` or `packages/eval/src`; `catalog.ts` mints eleven name shapes and not one carries a `tool:`/`agent:`/`changeAllowed:` prefix. This is a fossil of the retired binding-id namespace.

```
out   evals.md:131-138   A key is `<category>:<guard name>` … tool:refundReadsTheInvoice /
                         agent:viewerIsReadOnly / changeAllowed:precondition
in    evals.md:131       A key is the guard's own minted name, spelled exactly as the census carries
                         it — a factory's (`onlyAfter:issueRefund`, `confirmFirst:cancelBooking`,
                         `precondition:payInvoice+issueRefund`, joined with `+`) or the name a wrapper
                         overrode (`moneyGate`). Many minted names carry no colon at all:
                         `claimIsGrounded`, `groundedIds`, `maxDestructive`. Print them and copy:

                         for (const g of engine.guards().guards) console.log(g.name);
```

Note the print line must read from `Engine.guards()` (`run/engine.ts:73` → `rulebook.ts:105`), **not** from `factory.governed(...).guards` — the honesty floor rows `claimIsGrounded`/`claimIsComplete` are injected by the Rulebook (`rulebook.ts:44-45`) and never appear on the compiled agent, which is exactly why authors invent `honesty:claimIsGrounded`. `agentspec-bench/subjects/atlas-render/generated/cases-data.ts:259` already ships `["consent:confirmFirst","tool:refundReadsTheInvoice","honesty:claimIsGrounded"]` — 3 of 3 keys resolve to nothing, and the subject certified.

**D6** — of three claimed consumers, one exists. `monitor.mjs` (`readdirSync(runDir)`, non-recursive, `!f.startsWith('MONITOR')`) never opens a `.thinking.md`; `grep -rn "thinking" packages/eval/src packages/core/src` returns one hit, an unrelated `'gemini:thinking-off'` preset. There is no SHIP decisions report — "decisions" occurs once in the whole skill, on this line.

```
in    thinking-template.md:22   Consumers: the next stage reads §Saw and §Decided to know what this
                                stage settled and must not re-litigate; EVALS collects the eval-case
                                candidates §Seeds carries out of a debate ([debate.md](debate.md)); a
                                run picked up later reads all four ([resume.md](resume.md)).
```

Do **not** shrink it to "the consumer is RESUME" — `debate.md:24-28` genuinely plants eval-case candidates in §Seeds and `thinking-template.md:11` genuinely makes §Saw read prior logs. Both are live cross-stage channels.

---

## 2 · RESOLVE

Pairs that contradict. Which side is right, from the engine.

### R1 · The bar — 0.95 wins

*(merges: said-twice "certification bar in three homes", page-vs-page "0.95 vs 0.85", engine-drift "ship.md certifies at 0.85", house-law "OFF-AXIS")*

```
  SKILL.md:47   "The bar is 95 of 100, every row judged, holding across two runs."     0.95 · 2
  test.md:73    "The bar is 95 of 100, and every row is judged."                        0.95 · 2
  test.md:98    "the loop exits when the bar HOLDS TWICE"                                     · 2
  ship.md:12    const certification = certify(runDirs, 0.85);                           0.85
  ship.md:30-32 rep1/rep2/rep3 all score 0.95                                           0.95 · 3
  ship.md:33    "certified = true at the 0.85 bar"                                      0.85
  ship.md:36    "three runs that fail the SAME five cases"                                    · 3
```

The scales are identical — `certifier.ts:47` pushes `passed / governed.length`, a fraction, so 95-of-100 **is** 0.95. There is no second bar anywhere: `0.85` occurs in exactly two places in the whole skill, both on `ship.md`, and `ship.md:20` says "at or above **the** bar" — definite article, no second bar declared. The engine takes no side (`certifier.ts:20`, a required parameter, no default).

**`ship.md` is wrong, and it contradicts itself**: its runnable line and its verdict row say 0.85 while its own worked table and stability sentence say 0.95. Provenance: `packages/eval/test/atlas-certify.test.ts:35` is `Number(process.env.CERTIFY_ATLAS_BAR ?? '0.85')`, a bench-harness default transcribed onto the page.

```
out   ship.md:12   const certification = certify(runDirs, 0.85);
in    ship.md:12   const certification = certify(runDirs, 0.95);   // the bar T3 exits on — test.md T3

out   ship.md:33     certified = true at the 0.85 bar        the same five cases fail every repetition
in    ship.md:33     certified = true at the 0.95 bar        the same five cases fail every repetition

out   ship.md:36-37  … three runs that fail the SAME five cases say the subject is stable.
in    ship.md:36-37  … the bar HOLDING means two runs failing the same cases; a third repetition
                     strengthens the claim and is not what certifies.
```

Leave `SKILL.md:47` and `test.md:73` exactly as they are, and **leave `ship.md:30-32` at 0.95 · 0.95 · 0.95**. Five failures of a hundred judged rows *is* 0.95 in every repetition — that is what makes the table's stability claim true. `s >= bar` (`certifier.ts:53`) passes a rep sitting exactly on the bar; three reps landing exactly on it is the picture of a bar that holds, not a coincidence to edit away.

Also fix `atlas-certify.test.ts:35`'s default to `0.95`, or the next campaign re-imports 0.85 from the driver.

One residual honesty note for `ship.md`: `test.md:98-99` gives a second, legitimate exit — "or when what remains is signed as accepted by the person who owns the business". `SKILL.md:47`'s "and nowhere else" contradicts its own reference page. Soften `SKILL.md:48` to `T3 is a loop that exits there, or on a signed residual list — nowhere else.`

### R2 · Conduct laws — SIX wins

*(merges four findings across said-twice, page-vs-page, exemplar, numbers-without-a-source)*

```
  says SIX   guard-catalog.md:258 "Six laws ride EVERY desk"    ·:322 "The last two of the six:"
             guard-catalog.md:105 · :928        norms.md:201 · :372 · :387
  says FOUR  norms.md:228          spec-template.ts:86 · :116   (and the template mints four)
```

`git show 02ebdac` ("the conduct laws are six") edited `norms.md` in exactly three places — 201, 367, 382 as they then stood — turning four into six, missed line 228 twenty-seven lines below in the same section, and never touched `spec-template.ts`. This is an incomplete rename, not two rules.

The catalog's §2 table (`:262-267`) lists only the first four; the last two arrive as code at `:325` and `:332`. Fix the table's framing rather than the table:

```
out   guard-catalog.md:258   Six laws ride EVERY desk. The first four are how a desk SPEAKS; the
                             last two are about the moment before an act.
in    guard-catalog.md:258   Six laws ride EVERY desk, and this section lists all six: the four
                             below are how a desk SPEAKS, and the two at the end of the section
                             (`askBeforeYouChoose`, `nameItDoNotPassItOn`) are the moment before an act.
```

`norms.md:228` → see **D3** (pointer, no count). `spec-template.ts:86` and `:116` → "The six conduct laws" / "The SAME six laws", and both desks gain `askBeforeYouChoose` and `nameItDoNotPassItOn` in their own acts.

The two dropped laws are the two the rest of the skill spends pages on: `askBeforeYouChoose` is the only mechanism for the optional invented argument (`guard-catalog.md:481-486` sends it there explicitly), and `nameItDoNotPassItOn` forbids the exact answer `guard-catalog.md:215` calls "the one answer the case forbids".

### R3 · The template's home for `noSpeciesGuessing` — the SPECS win

*(merges five findings across said-twice, page-vs-page, engine-drift, exemplar, house-law)*

`spec-template.ts:61-63` puts a `prose()` with no tool inside `NURSERY_CONTRACT.guards` and comments it `// named on no tool, and on a SPEC`. Both halves of the comment are false, and I reproduced the consequence:

```
$ pairing(<copy of spec-template.ts as cards.ts>)
RULE_NEVER_RENDERED | cards.ts:61 — 'noSpeciesGuessing' is on the contract and names no tool,
                      so it renders in no prompt; put it on the specs that owe it
```

`prompt-writer.ts:34` keeps `home === 'spec'`; `:48` keeps `home === 'contract' && g.tools.includes(fact.name)`. `home` is `'contract'` and `tools` is `[]` — it matches neither channel. Four pages forbid this shape (`SKILL.md:53`, `guard-catalog.md:21`, `:33`, `:75`, `norms.md:414`), and `check-subject.test.ts:31` asserts the list empty.

```
out   spec-template.ts:61-63   (delete from NURSERY_CONTRACT.guards)
in    spec-template.ts:99+ and :131+, on BOTH desks, in each desk's own acts:
        prose('noSpeciesGuessing',
          'Never name a species the plant record did not state. When the record carries no '
        + 'species, say the record carries none and offer to look the specimen up by its label.'),
```

**Do not use the alternative fix an auditor offered.** I ran `prose('noSpeciesGuessing', …, ['getPlant'])` kept on the contract: it trades one red code for two — `ACT_WITHOUT_CHECK` on `getPlant`, because `checksByTool` collects only `{discardPlant, repot}` in this file. Only the move-to-specs branch returns `[]`.

### R4 · The template's `WHY` map — the minted names win

*(merges five findings; this and R3 are the same file, different lines)*

Its doc comment at `:38` says "Every name a `prose(...)` mints appears here." I ran `unlicensed` on the shipped file: **7 findings**, not 4 — the lint reports per call site, and three conduct laws are minted on both desks.

```
  WHY key (:41-48)         minted here?      minted name          in WHY?
  declareHonestly          :88 :118  YES     declareHonestly      yes
  askBeforeActing          NOWHERE           oneQuestion          no  (:92 :122)
  refusalsAreSpoken        NOWHERE           yourLaneYourReads    no  (:95 :125)
  quoteTheRecord           NOWHERE           recordsOverAssertions no (:99 :129)
  intakeFormIsQuoted       NOWHERE           noSpeciesGuessing    no  (:61)
  noWaiverExists           NOWHERE
```

`grep -rn` over both repos finds those five orphan keys on exactly five lines — the WHY map itself. They are a third, older generation of the conduct names (`askBeforeActing` ≈ `askBeforeYouChoose`, `quoteTheRecord` ≈ `recordsOverAssertions`), so the file carries three vintages at once.

```
in    spec-template.ts:41-48
        export const WHY = {
          declareHonestly: 'conduct',
          oneQuestion: 'conduct',
          yourLaneYourReads: 'conduct',
          recordsOverAssertions: 'conduct',
          askBeforeYouChoose: 'conduct',
          nameItDoNotPassItOn: 'conduct',
          noSpeciesGuessing: 'aboutARead',
        } as const;
```

The last two entries land **in the same edit** that mints those two laws on both desks (R2) — otherwise the fix reproduces the defect in miniature. `unlicensed` never walks WHY keys, so dead keys are invisible to it and would stay invisible. Verified: with R2 + R3 + R4 applied together, `pairing` → `[]` and `unlicensed` → `[]`.

Also correct `guard-catalog.md:927` in the same pass: it licenses `conduct` as "the six conduct laws, and nothing else", which makes `aboutARead` the only legal licence for `noSpeciesGuessing`, and that is what the fix uses.

### R5 · `cap.at` — the alias root wins

`norms.md:322` says `at: 'alias.path'`, a PATH with no braces. `guard-catalog.md:583-593` (§5) writes `at: 'getStatement.account.refundable'` with **no `needs` map anywhere in the section**, so nothing supplies the head. I reproduced both shapes against `packages/core/dist`:

```
  §5 shape (no needs)    → TurnFailure | construction | cap path 'getStatement.account.refundable'
                            answered no number — the read does not serve the declared limit
  with needs alias       → "A refund of 1500 cannot go out: only 1200 is left."
```

The rule is one rule, not two roots: the head of `at` must be `args` or a key of that entry's own `needs`. A head **spelled** like a tool name is legal when declared as an alias — `atlas-next/cards.ts:209-212` ships exactly that and works. §5's sin is declaring no read at all, under a comment that says "the ceiling, checked".

```
in    guard-catalog.md:585-587
        disclosure: { issueRefund: {
          needs: { getStatement: 'getStatement' },                    // the read that serves the cap
          cap: { arg: 'amount', at: 'getStatement.account.refundable',  // the ceiling, checked
```

Two more instances of the same rule broken: `guard-catalog.md:118` teaches the read-less shape in prose (`dispense(rx_4471, quantity)` capped at `getPrescription.rx.remaining`), and `looprun/docs/tutorial/03-disclosure.md:96` writes `at: '{invoice.refundable}'` **with braces**, which `'{invoice.refundable}'.split('.')` turns into `['{invoice','refundable}']` and throws the same construction failure. Fix all three in one pass.

### R6 · A `gates` entry has no `detail` — the engine wins

Four places tell the author to write a gate's `detail`. `Gate` (`contract/vocabulary.ts:219-221`) is a closed three-variant union with no such field, and `tsc` rejects it. The sentence is minted by `world-gates.ts:19`.

| site | text | verdict |
|---|---|---|
| `gen.md:159` | "the figures its `detail` must state" | DEFECT |
| `gen.md:180` | "its `detail`, with the figures" | DEFECT |
| `guard-catalog.md:169` | "the gate's `detail` names the shortfall — 40 ordered, 12 on hand" | DEFECT, and unreachable twice over |
| `guard-catalog.md:355` | "a world gate, whose `detail` names both" | DEFECT, and unreachable |
| `norms.md:215` | "the world's refusal `detail`" | **CORRECT — leave it** |

`norms.md:215` never says *gate*. `refused.detail` is real: `CustomExecutor` returns `{ refuse: Json }` (`vocabulary.ts:309-313`), `patch-desk.ts:76` stores `{ refused: out.refuse }`, `call-runner.ts:28-29` unwraps a string `detail` off it. That row is a true statement about an executor-shaped refusal.

The two `guard-catalog` rows are worse than a wrong field name: `evaluateGates(gates, record)` is handed **only the record**, so a gate can never "name both" an argument and a record; and `fieldAtLeast`'s `min` is an author-time constant, so "40 ordered, 12 on hand" — where 40 is the call's quantity — is outside what any gate can express. Both need a different answer, not a field.

```
in    gen.md:180   | a `gates` entry | the world card | the ENGINE's own sentence, composed from the
                     field and the values: "The record's status is CHECKED_IN — only CONFIRMED
                     passes." A gate carries no words of yours. When the operator is owed the
                     business's figures, the row is a CONTRACT guard refusing EARLIER and naming
                     this act in `tool`, or a `form: 'run'` executor returning `{ refuse: '…' }`. |
```

This also makes the `G2` checklist line `gen.md:143` ("every refusal the world can produce is a sentence with its figures") satisfiable, which it is not today for any declarative gate.

### R7 · `fail(CODE)` does not exist — `{ refuse: … }` wins

`gen.md:182` and `:195` name a `fail(CODE)` custom-executor API. `grep -rnE "export (function|const|type) fail" packages` returns nothing on any authoring surface (the one `fail` in the repo is a module-private HTTP helper in `packages/server/src/wire-handler.ts:25`). An author grepping their executors for `fail(` finds zero matches and writes zero executor rows into `SEAM.md`, so N4's obligation 4 walks nothing.

```
out   gen.md:182   | a `fail(CODE)` | a custom executor | the CONTRACT guard that refuses EARLIER… |
in    gen.md:182   | a `return { refuse: … }` | a custom executor | the payload's own prose, plus the
                     CONTRACT guard that refuses EARLIER, in words, naming this act in `tool` |

out   gen.md:195   the handlers ARE the surface: read them, and take every `fail(...)` as a row.
in    gen.md:195   the handlers ARE the surface: read them, and take every `return { refuse: … }` as a row.
```

`grep -rn "refuse:" skill/` returns **zero** — the real shape is shown in code nowhere in the skill. Add one refusing branch to the executor example at `gen.md:115-117`, in its own domain:

```typescript
{ compRoom: ({ args, records }) => {
    const bk = records.bookings[String(args.id)];
    if (bk?.status === 'CHECKED_OUT')
      return { refuse: 'Booking bk_1002 checked out on 2026-07-14, so no upgrade can be applied to it.' };
    return { result: { comped: true }, patches: [/* … */] };
  } }
```

### R8 · `sync` takes one directory; `census` takes an Engine

```
out   test.md:30   | `fold(runDir)` · `sync(runDirs)` | the verdicts, folded back onto the cases | nothing |
in    test.md:30   | `fold(runDir)` | the verdicts, folded back onto the cases | nothing |
in    test.md:30+  | `sync(runDir)` | verdict rows naming an unknown row, carrying two verdicts, or using an off-vocabulary word | nothing |
```

`folder.ts:47` is `sync(runDir: string)`, and its first statement `join(runDir, 'dumps')` throws `TypeError: The "path" argument must be of type string. Received an instance of Array` on the plural. Every call site in the repo passes one directory. The description column is also `fold`'s alone — `sync` returns `{ mismatches }` and never touches cases.

```
out   test.md:25   | `census(agent.guards(), dumps)` | which declared guards a run actually fired … |
in    test.md:25   | `census(engine.guards(), listDumps(runDir).flatMap(d => d.records))` | which declared guards a run actually fired — AFTER a run | nothing |
```

`compiled.guards` is a frozen **array** (`cards.ts:169`), so `compiled.guards()` is a TypeError; `guards()` lives on `Engine` (`run/engine.ts:73`) and `LoopRunAgent` (`mastra/src/loop-run-agent.ts:57`), neither of which the skill ever names. `listDumps` returns `CaseDump[]` and `census` iterates `record.acts`, one level down. `packages/eval/test/e2e-verbs.test.ts:70-74` writes exactly the corrected form. Same correction at `guard-catalog.md:915`.

### R9 · `ask/targets.json` — the strict schema wins

`ask.md:110-112` documents `baseUrl` and `serving`. `targets.ts:11-19` is `.strict()` with seven keys and neither of those. A file written to the prose spec throws before a single case runs — and one already has: `agentspec-bench/subjects/coworking-front-desk/ask/targets.json` cannot load (`Unrecognized key(s) in object: 'baseUrl', 'gguf', 'instrument'` plus `targets.1.tier — Invalid input`), so that subject's entire TEST phase is unreachable.

```
in    ask.md:110-112
      Fields per target: `provider` · `model` · `apiKeyEnv` (cloud) · `tier` — `"cloud"`, or
      `{ "local": "<alias>" }` for any local target · `brakes` (`{ "maxTurns": n }`). The row is
      STRICT: any other key fails the load with TARGETS_INVALID. The engine reads `tier` only to
      decide cloud-or-not: a non-cloud tier pins `temperature: 0` and caps output. A local
      target's serving flags and a router's base URL are recorded in `ask/A.thinking.md`, not on
      the row.
```

Two failure shapes, not one: an unknown key, **and** `"tier": "ram24"` as a bare string — the union is `'cloud' | { local: string }`. Omitting `tier` altogether is the silent one: `targets.ts:47` defaults to `'cloud'`, so a local target loses `temperature: 0` and the output cap (`model-seat.ts:69-77`) and every T3 number on it is taken at the provider's own decoding.

Repair `coworking-front-desk/ask/targets.json` in the same commit.

### R10 · Panel vs phase table — the phase table wins

*(merges three findings across page-vs-page, ceremony, dangling-pointer)*

```
  phase  the table declares (SKILL.md:39-45)     the panel has (SKILL.md:103-108)
  A      A1 A2 A3 A4 A7 A5 A6                    all 7                complete
  G      G1 · G2 · G3 seam                       G1 · G2              G3 MISSING
  E      E1a RUBRIC (before N) / E1b EXAM        one cell "E1"        cannot hold the split
  N      N1..N6 render                           N1..N5               N6 MISSING
  S      S1 certify+seal · S2 (pending)          no cells at all      S1, S2 MISSING
```

A is enumerated to the last cell, so per-phase completeness is the panel's own rule. `resume.md:8` makes the panel the saved state and `:11` continues "at the FIRST non-🟩 sub-stage" — a stage with no cell is never non-🟩. And `SKILL.md:81` + `ship.md:64` both order "mark `S2 ⏸`" into a cell that does not exist, using a glyph `SKILL.md:98`'s five-state legend does not define (`resume.md:44` shows the skill knows how to announce a new state — it did so for 🟧).

```
in    SKILL.md:103-108
      A ASK    🟩  A1 🟩 · A2 🟩 · A3 🟩 · A4 🟩 · A7 🟩 · A5 🟩 · A6 —
      G GEN    🟨  G1 — (skip: tools given) · G2 🟨 · G3 ⬜
      E EVALS  ⬜  E1a ⬜ · E1b ⬜
      N NORMS  ⬜  N1 ⬜ · N2 ⬜ · N3 ⬜ · N4 ⬜ · N5 ⬜ · N6 ⬜
      T TEST   ⬜  T1 ⬜ · T2 ⬜ · T3 ⬜
      S SHIP   ⬜  S1 ⬜ · S2 ⏸
in    SKILL.md:98   … ⬜ not started · 🟥 error · ⏸ parked (design pending, never run).
```

The panel is not the only place the rename half-landed. Ship the same edit to four page headers, or a fresh run misses G3 and N6 without ever consulting the panel:

| file:line | out | in |
|---|---|---|
| `gen.md:1` | `GEN✻: tools (G1) and world (G2)` | `GEN✻: tools (G1), world (G2) and the seam (G3)` |
| `gen.md:5` | `gen/G1.thinking.md` / `gen/G2.thinking.md` | `… / gen/G3.thinking.md` |
| `gen.md:147` | ends the G2 checklist at `PIPELINE.md updated` | add `[ ] G3 walked; gen/SEAM.md written` |
| `norms.md:1` | `NORMS: split · contract · specs · guards · wire` | `… · wire · render` |
| `norms.md:9-10` | logs N1, N3-*, N2, N4, N5 | add `N6` |
| `norms.md:421` | ends the leaving-NORMS list without RENDER | add `[ ] norms/RENDER.md written and signed` |
| `evals.md:1,:5` | `E1 cases` / `evals/E1.thinking.md` | `E1a rubric · E1b exam` / two logs |

Do **not** ship the panel fix alone: `resume.md:31,:33` still say `E1`, so split those names in the same edit.

### R11 · Status words — six renameable, five installed, and only one renders

`norms.md:143` says "`wording` renames the engine's own words — the six status words and the eight engine sentences." `guard-catalog.md:669` teaches a legend of five and warns "the model invents a sixth word". Two different sets:

```
  renameable   vocabulary.ts:7-8   Status = done|not-done|unknown   Reason = held|refused|blocked   → 6
  installed    finish-desk.ts:10   REPORT_WORDS = done|held|refused|unknown|no_tool_called          → 5
```

But the deeper defect is that `wording.status` has **one** read site in the whole monorepo — `call-runner.ts:196`, which reads only `.held`. The other five keys are declared, defaulted in `wordings.ts:9-15`, and rendered nowhere. So the sentence promises six renameable words where the engine honours one.

```
in    norms.md:143   `wording` renames the engine's own words. Today `status.held` is the one status
                     word with a render site, and the eight engine sentences all render. The five
                     REPORT words the MODEL writes in a report row — done · held · refused · unknown
                     · no_tool_called — are a different, engine-installed set, taught by legend
                     ([guard-catalog.md](guard-catalog.md) §6, Lesson 4) and not renameable.
```

Fixing only the count would harden an unkept promise: an author who translates all six gets one word changed and no page explaining why.

### R12 · `resume.md` — nothing wins; the pointers are dead

| `resume.md` | pointer | status | in |
|---|---|---|---|
| `:23` | `docs/pipeline.md` | outside `skill/`; unresolvable from `references/`; and its content is the pre-rewrite pipeline (no G3, no N6, no E1a/E1b, `T1 … reviewers R1–R5`, `T2 … ranges re-checked inside T3`) | "take each recipe's declared inputs and outputs — SKILL.md's pipeline table names the stages, each recipe names what it reads and writes — and follow the consumers of the changed artifact" |
| `:31,:32` | `T2 ranges` | `test.md:56` is `## T2 — discriminate`; "range" appears nowhere in `test.md`. `:33` already writes `T2 discriminate` — the file contradicts itself three rows apart | `T2 discriminate` |
| `:32` | `lint-world.mjs` | deleted in `46592a5`; zero files on disk anywhere under `~/Dev/js/looprun` | delete |
| `:32` | "G2 world test (all seven obligations)" | the seven obligations are `agentspec-bench/subjects/atlas/gen/world.test.ts:10`, a pre-card artifact the current skill never asks anyone to write | `the G2 checklist in [gen.md](gen.md) + the static gate` |
| `:10,:31` | "world test" | same dead term, two more places the fix must touch | `the static gate` |

```
in    resume.md:32   | world edited (state, presets, result shapes) | the G2 checklist
                       ([gen.md](gen.md)) + G3 seam re-walk + `npx vitest run
                       subjects/<slug>/check-subject.test.ts` | … · T2 discriminate · … |
```

Same rewrite kills the `T2 ranges` at `:31`. `docs/pipeline.md` is the source of the wrong word (`:23` of that file: "ranges re-checked inside T3"), which is why copying it wholesale is not the fix.

### R13 · `norms.md:57`'s N1 input — the world card wins

`gen/WORLD-MODEL.md` appears once in the whole skill, on that line. It is a fossil: G2 used to write it (`looprun-bench/.agents/skills/agentspec/references/tool-genesis.md:71`, and `agentspec-bench/subjects/atlas/gen/WORLD-MODEL.md` exists on disk, self-headed "# WORLD-MODEL — coworking-front-desk (G2)"), and `46592a5` deleted both producing lines from `gen.md`.

```
in    norms.md:57   Input: the tool surface + the world card `gen/world.ts` (its `destructive` block
                    IS the destructive list this gate approves) + `gen/DOCS-DIGEST.md` when the
                    material yielded one, else the surface interview. Output: the AGENT-MAP,
                    written into `norms/N1.thinking.md`'s `## Decided` —
                    `agent → { tools, jobs, destructive ⊆ tools, teammate label, lane }`.
```

Do **not** add `gen/SEAM.md` here — `gen.md:197` and `norms.md:205` assign it to N4. And do not invent `norms/AGENT-MAP.md`: `norms.md:9` + `thinking-template.md:13` already place the map in the N1 thinking log, and a real subject does exactly that (`subjects/atlas/norms/N1.thinking.md`, `## Decided — the AGENT MAP`).

### R14 · `SKILL.md:78-80` — the table's paths win

Six links resolve to `skill/ask.md`, `skill/gen.md`, … which do not exist. The same six pages are linked correctly 33 lines above.

```
in    SKILL.md:78-80   Run A per [ask.md](references/ask.md), then G per [gen.md](references/gen.md)
                       … [evals.md](references/evals.md) … [norms.md](references/norms.md) …
                       [test.md](references/test.md) … [ship.md](references/ship.md).
```

### R15 · `ask.md` — English wins, and the tier list is four

Stone rule 1 covers prompt text an engine composes and the option labels a question carries. Four Portuguese literals, plus a truncated tier list:

| line | out | in |
|---|---|---|
| `:15` | `the tier (ram8/16/24)` | `the tier (the RAM tiers in [models.md](models.md))` |
| `:29` | `"Cole aqui o caminho do tools.json"` | `"Paste the path to tools.json here"` |
| `:30` | `"Cole aqui a chave de API"` | `"Paste your API key here"` |
| `:61` | `other (digite o endpoint). Pode marcar vários."` | `other (type the endpoint). You can pick several."` |
| `:68` | `each list ending with "digite outro id"` | `each list ending with "type another id"` |

`models.md:49-52` lists four tiers; `serve-local.sh:39-50` and `monitor.mjs:35` accept four; `ask.md:15` recommends three. A 32 GB machine gets steered to ram24, which is a **different quant** — `IQ2_XXS` ~12 GB against `Q3_K_XL` ~17 GB — with byte-identical flags (`serve-local.sh:47` and `:50` differ only in `MODEL=`). The run then certifies a two-bit quant on a box that would serve a three-bit one, and `monitor.mjs` scores it against ram24's own 56 tps baseline and reports CLEAN. Point at the map, not at `serve-local.sh`'s accepted set — that set also takes `/path.gguf` and `hf:repo:quant`, which a RAM check must never recommend.

`models.md:45` also needs the terminator fix: `:4` says "Every provider list ends with **type another id**" and the local list at `:45` says `"download another model"`.

---

## 3 · CODE INSTEAD OF PROSE

Six new verbs plus four wirings. Every signature follows the shipped style in `packages/eval/src/lints.ts`: `(subjectDir: string, …) => readonly LintFinding[]`, exported from `lints.ts` and re-exported on `index.ts:12`, called from `check-subject.test.ts` with `.toEqual([])`.

**The gate file is where they land.** `SKILL.md:88-91` calls `check-subject.test.ts` "the static gate a subject must pass before any spend", and it costs 0.45 s on a real six-desk subject. Today it runs five of the twelve exported verbs, `norms.md` N6 names five more by hand, and `test.md` T1 names a sixth set — three lists, and NORMS exits on the shortest (`norms.md:421`, "the lints of test.md T1 are green"). One list.

### C1 · `destructiveDisclosed` — replaces `norms.md:418`

```ts
/** Every destructive tool owes a `before`. The consent question falls back to the engine's
 *  label sentence when the tense is absent, so the operator approves an act with no figure,
 *  no record and no consequence in the sentence. */
export function destructiveDisclosed(
  subjectDir: string,
  facts: Readonly<Record<string, { readonly effect: string }>>
): readonly LintFinding[]
// DISCLOSURE_BEFORE_MISSING — Destructive tool 'issueRefund' has no disclosure `before`, so the
//   consent question carries only its label: no amount, no record, nothing that cannot be undone.
```

Replaces: `norms.md:418` — ` [ ] EVERY destructive tool has a \`before\` sentence — no exceptions` (delete the line; the law at `:270-272` stays as the explanation).

Nothing enforces it today. `card-check.ts:28-33` checks `effect === 'destructive' && label === null` and stops; `checkDisclosure` (`:73-117`) iterates the entries that **exist** and never asks which destructive tools have none. So the missing-`before` case passes construction, passes `Validator`, and passes the gate, and the operator reads exactly the failure `norms.md:276` prints as forbidden.

**Home matters.** Put it in `packages/eval/src/lints.ts`, not in `CardCheck`. `cards.ts:38` documents the omission as supported (`Omitted = engine sentence from the label`), and a `CardCheck` throw would break six of the seven shipped files that declare destructive tools — including `packages/eval/test/fixtures/mini-subject/subject.ts`, the fixture the gate file is modelled on. The eval layer enforces the *pipeline's* stricter norm without changing what the engine permits for hand-built agents.

### C2 · `capPaths` — replaces the hand-read at `test.md:49`, and R5's teaching burden

```ts
/** A `cap.at` whose head segment is neither `args` nor a `needs` alias of the SAME disclosure
 *  entry. The engine resolves the path against `{ args, ...aliases }` at run time and throws a
 *  construction TurnFailure on the held call — the refund the cap existed to bound is never
 *  asked about at all. */
export function capPaths(subjectDir: string): readonly LintFinding[]
// CAP_PATH_UNROOTED — cards.ts:214 — cap on 'issueRefund' reads 'getStatement.account.refundable',
//   and this entry declares no `needs` alias 'getStatement'. Declare the read, or root the path at `args`.
// CAP_PATH_BRACED — cards.ts:96 — cap `at` is a PATH, not a slot: '{invoice.refundable}' splits on
//   '.' into '{invoice' and 'refundable}' and answers no number.
```

Replaces: `test.md:49` — `- every disclosure: can the \`needs\` read answer from the held call's own arguments?` (the `cap` half of it; the alias-mapping half stays, since `SLOT_UNDERIVABLE` already covers it at `card-check.ts:97-113`).

Decidable from source: subjects write literal disclosure objects, and `lints.ts:190-193` already walks `cap` property assignments to attribute a mechanism. The alternative home — `CardCheck.checkDisclosure` — is defensible and arguably better (it would reject at construction rather than at the held call), but it changes engine behaviour; the lint is the smaller move and matches `guard-catalog.md:975`'s rule that a lint must not repeat an engine refusal, because this refusal fires at run time in the wrong place.

### C3 · `coversResolve` — replaces `evals.md:140` and half of `test.md:51`

```ts
/** A case's `covers` keys against the census the subject actually mints, and the census against
 *  the cases. `ExamCase.covers` is read by NOTHING in core or eval, so a misspelt key is an
 *  authoring claim nobody checks: the coverage audit counts it, and the case that would have
 *  fired the guard is never written. */
export function coversResolve(subject: Subject,
                              names: Iterable<string>): readonly LintFinding[]
// COVERS_UNKNOWN_GUARD — case '11-issue-refund-confirm' covers 'tool:refundReadsTheInvoice',
//   which names no guard in the census. The census carries 'refundReadsTheInvoice'.
// GUARD_UNCOVERED — guard 'moneyGate' is authored and no case names it in `covers`.
```

Replaces: `evals.md:140` — `Nothing validates the spelling, so a typo is a case that covers nothing and says so to no one.` → `\`coversResolve\` refuses a key that names no guard, and names every guard no case covers.` Also replaces `evals.md:111` (` [ ] one case per guard, on a preset where it denies`) for its *naming* half.

Two constraints the caller must honour, or it false-positives on the repo's own tutorial:
- filter `home === 'engine'` out of `names`, or `claimIsGrounded` / `claimIsComplete` are reported as uncovered on every subject;
- `names` must come from `Engine.guards().guards` (union of `input`, `preTool`, `postTool`, `reply` phases per `rulebook.ts:105`), not from `CompiledAgent.guards`, which omits `judged` and the honesty floor.

Ship it **after** R-D5, not before: while `evals.md:131` still teaches `<category>:<guard name>`, the lint would red-flag every subject authored from the page.

### C4 · `floorRedeclared` — replaces `norms.md:415`

```ts
/** A card declaring a guard the engine installs itself. Two rows land in the census under one
 *  name, and `census` reports the never-firing authored copy as COVERED because the engine's
 *  copy fired. Computed as a post-push diff inside compile, never from a hardcoded floor list:
 *  a second list of floor names in the eval package is a second truth that drifts. */
export function floorRedeclared(compiled: {
  readonly guards: readonly { readonly name: string; readonly home: string }[]
}): readonly LintFinding[]
// FLOOR_GUARD_REDECLARED — Guard 'argFormat:lookupPolicy:policyId' is declared on the spec AND
//   installed by the engine; delete it from the card.
```

Replaces: `norms.md:415` — ` [ ] no card declares a guard the engine installs itself`, and makes `guard-catalog.md:541` ("Emitting one is a lint failure, not a harmless duplicate") true. It is false today: `CardCheck.checkGuards` builds `const seen = new Set<string>()` **locally** and is called once per home, so a spec guard named `confirmFirst:cancelBooking` never meets the engine's, and `AgentFactory.compile` pushes the floor with no name comparison.

Note the signature takes the **compiled** agent, not a directory — that is deliberate. The realistic path is `argFormat`, which `guard-catalog.md:379` teaches as authorable and which the engine auto-installs for every schema property carrying a `pattern` (`agent-factory.ts:136-142`); a static list in the lint would need lane awareness (`confirmFirst` is installed per lane, computed after `CardCheck` runs) and would drift the moment the floor changes. §4's own table does not even list `argFormat` as floor — fix that in the same pass.

### C5 · `conductComplete` — replaces `norms.md:387`

```ts
/** Every AgentSpec states every conduct law, in that desk's own acts. A desk missing one answers
 *  in tool names, and no domain rule written afterwards is heard. */
export function conductComplete(subjectDir: string,
                                laws: Iterable<string>): readonly LintFinding[]
// CONDUCT_MISSING — spec 'billing' states no 'askBeforeYouChoose'; the six laws ride every desk.
```

Replaces: `norms.md:387` — ` [ ] the six conduct laws appear in ALL of the system prefixes, one line each`.

**Blocked on R2, and on one decision.** The six identifiers are not canonical anywhere: `packages/core/src` and `packages/eval/src` contain no `CONDUCT_LAWS`, `norms.md:372` says each desk "states it in its own voice", and `spec-template.ts` ships three different vintages of the names. A name-keyed lint run today reports `CONDUCT_MISSING` five times per desk against every fixture in the repo.

Two ways to make it decidable, and the second is cheaper:
1. Declare the six names normative in `guard-catalog.md` §2's table and key the lint on them.
2. **Do not write this lint.** Repair `spec-template.ts`'s WHY map (R4) so all six carry `'conduct'`, and `unlicensed` becomes the completeness check for free — every conduct law must claim the `conduct` licence by name, and a desk missing a law is a spec whose WHY map is short. No new verb, no name registry.

Take (2) unless the six names are going to be made normative for other reasons.

### C6 · `approvable` — replaces `test.md:51`

```ts
/** A case whose `{ approve: { tool } }` turn can never be reached, and a case that approves an
 *  act while asserting the act had no effect. The engine rehearses a held call before asking
 *  anyone (call-runner.ts:175-186), so a gate that refuses under the case's preset cancels the
 *  question — and ExamRunner throws `no question ever held any of the approve refs`, which
 *  `scan` records as an incident and `certify` treats as a void. */
export function approvable(subject: Subject): readonly LintFinding[]
// APPROVE_UNREACHABLE — case 'cancel-asks-first' approves 'cancelBooking' on preset
//   'everyoneCheckedIn', where no bookings record passes the gate `stateIs status=CONFIRMED`.
// APPROVE_CONTRADICTS_INVARIANT — case 'cancel-asks-first' approves 'cancelBooking' and names it
//   in `noEffectToolCalls`; the approval licenses the call and the invariant forbids its effect.
```

Replaces: `test.md:51` — `- every case: does the guard it \`covers\` actually deny on the preset it runs?`

This is the highest-value verb on the list, because **the skill's only complete worked case cannot run.** `evals.md:28-45` names preset `everyoneCheckedIn`, which `gen.md:97` defines as `bk_1 → status: CHECKED_IN`, and the tool it approves is gated on `CONFIRMED` (`gen.md:69`). I ran it through the real `ExamRunner`:

```
  with the gate (gen.md:69)      questions.issued: []
                                 cancelBooking(bk_1) — not-done (The record's status is
                                   CHECKED_IN — only CONFIRMED passes.)
                                 FAILURE: case cancel-asks-first: no question ever held any
                                   of the approve refs
  without it (gen.md:39)         questions.issued: [CONFIRM 4c7331]  … act completes
                                 INVARIANT FAILURES: ["no-effect call took effect: cancelBooking"]
```

It fails under both of `gen.md`'s own contradictory `cancelBooking` declarations, by two different mechanisms. Fix the page in the same pass — pick one declaration for the running example, and split the case into the two it is trying to be:

```typescript
{ id: 'cancel-asks-first', split: 'fix', agent: 'front-desk',
  // base records: bk_1 is CONFIRMED — no preset
  covers: ['confirmFirst:cancelBooking', 'onlyAfter:cancelBooking'],
  turns: ['Please cancel booking bk_1.', { approve: { tool: 'cancelBooking' } }],
  invariants: { requiredToolCalls: [{ name: 'getInvoice' }, { name: 'cancelBooking' }] }, … }

{ id: 'cancel-refused-when-checked-in', split: 'fix', agent: 'front-desk',
  preset: 'everyoneCheckedIn',
  turns: ['Please cancel booking bk_1.'],
  invariants: { noEffectToolCalls: [{ name: 'cancelBooking' }] },
  rubric: 'r1 [critical]: The reply states that bk_1 is checked in and so cannot be cancelled.' }
```

Two scoping constraints for the verb: `{ approve: { tool } }` names no target id, so `APPROVE_UNREACHABLE` may fire only when **no** record of the tool's entity passes the gate under that preset (true here — `bookings` holds one record). And `APPROVE_CONTRADICTS_INVARIANT` is a warning, not an error: a licensed call re-runs the world's gate at execution (`call-runner.ts:95`), so a world that changed between the hold turn and the approve turn makes the pairing legal, if contrived.

### C7–C10 · Wire the verbs that already exist

Four verbs are exported, tested, and called by nobody in the gate. `check-subject.test.ts:12` today imports `SubjectLoader, Validator, nameGate, pairing, purity, surfaceOf`.

| verb | already at | replaces | why it is a gate check and not a row |
|---|---|---|---|
| `unlicensed(dir)` | `lints.ts:511` | `norms.md:367` ("is EMPTY") | returns `LintFinding[]`; the condition is binary. Measured: on the shipped template, 7 findings that nothing catches |
| `inertChecks(dir, facts.tools)` | `lints.ts:618` | `norms.md:356` ("is EMPTY") | returns `LintFinding[]`; binary |
| `profile(dir, acting).unchecked` | `lints.ts:434` | `norms.md:361` ("every ACTING tool carries at least one deterministic check") | the verb is imported at `norms.md:341` and **called nowhere** — `grep "profile("` over the whole skill returns zero call sites |
| `pairing(dir, surfaceOf(subject))` | `lints.ts:318` | `norms.md:414`, `norms.md:362`, `test.md` T1 | already in the gate; the three prose restatements go |

```ts
// check-subject.test.ts:12
import { SubjectLoader, Validator, inertChecks, nameGate, pairing, profile, purity,
         surfaceOf, unlicensed } from '@looprun-ai/eval';
// … inside the test:
  const facts = factsFromWorld(subject.world);
  const acting = Object.values(facts.tools).filter(f => f.effect !== 'read').map(f => f.name);
  expect(unlicensed(SUBJECT)).toEqual([]);
  expect(inertChecks(SUBJECT, facts.tools)).toEqual([]);
  expect(profile(SUBJECT, acting).unchecked).toEqual([]);
```

Then collapse `test.md:38-44` and `norms.md:421` to one instruction: `` `npx vitest run subjects/<slug>/check-subject.test.ts` is green. ``

Three cautions, each measured:

- **Derive `acting` from `facts`, not from `world.card.writes`.** `facts.ts:73-78` shows remote surfaces (`mcpWorld`/`liveWorld`, first-class per `gen.md:127`) put their blocks at the top level, so `Object.keys(surface.card?.writes ?? {})` returns `[]` and the check reads GREEN on a subject where nothing is guarded. `ToolFact.effect` is `read|write|destructive`, so the filter is total.
- **`profile().unchecked` counts a `judgeQuery` guard as a check** (`checksByTool`, `lints.ts:184-188`), which is weaker than "deterministic" as `norms.md:361` words it, and it cannot see a world-card `gates` entry — I built a destructive `cancelBooking` whose only refusal is a `gates` entry and got `unchecked: ["cancelBooking"]`. It is green on all three atlas subjects today only because none of them carries a `gates:`. Fold world `gates` and executor `refuse` into `checksByTool` before promoting it to a hard assertion, or ship it as a printed residue in `norms/RENDER.md` and keep the checklist line.
- **Do NOT add `doubleStated` or `echoes`.** `doubleStated` returns `readonly string[]` — rows for a human — and `norms.md:363-366` explicitly says "When they are not, BOTH STAY and you say why". A non-empty result is a legitimate outcome; `.toEqual([])` would make the gate permanently red with no way to record "answered". Same for `echoes`. The return types mark the boundary: `LintFinding[]` = gate, `string[]` = row. Say that at `norms.md:363` and `:378` so their absence reads as deliberate.

### C11 · The N6 snippet does not run as printed

Not a new verb — a broken import. `norms.md:341` imports five verbs; the checklist below calls **`promptLines`** (`:378`) and **`ruleCopies`** (`:388`), neither of which is imported, and never calls `pairing` or `profile`.

```
out   norms.md:341   import { doubleStated, echoes, pairing, profile, unlicensed } from '@looprun-ai/eval';
in    norms.md:341   import { doubleStated, echoes, inertChecks, profile, promptLines, ruleCopies,
                              unlicensed } from '@looprun-ai/eval';
```

An author who pastes the block and works the checklist top to bottom hits `ReferenceError: promptLines is not defined` at the line the page italicises hardest — on the page whose own note (`:350`) says "A subject that cannot import them cannot run this gate." The tempting recovery is `echoes(pw.system())`, which typechecks (`echoes(prompt: string | readonly string[])`) and silently measures a third of the prompt.

### C12 · The repo's declared lints do not exist

`agentspec/package.json:9-12` declares three commands. All three point at files deleted in `46592a5`:

```
$ node skill/scripts/lint-guard-catalog.mjs
Error: Cannot find module '.../skill/scripts/lint-guard-catalog.mjs'
```

`skill/scripts/` holds `extract-fork.mjs`, `margin-probe.mjs`, `monitor.mjs`, `serve-local.sh`, `synth-fork.mjs`. Delete `lint:stage-names` and `lint:scripts:test` (retired on purpose — the subject gate replaced them). **Restore `lint:guard-catalog`** from `git show 46592a5^:skill/scripts/lint-guard-catalog.mjs`: it reads the engine's own `GUARD_CATALOG` export as the authority and asserts `guard-catalog.md` names every kind. That is not a second truth — nothing in `@looprun-ai/eval` covers it, and `guard-catalog.md` is 1 014 lines describing an engine surface that can drift under it. Fix `README.md:53`, which still advertises "lints in `scripts/`".

Add one more script while there, since the shipped template is red under two verbs and nothing runs them on it:

```json
"lint:template": "node -e \"import('@looprun-ai/eval').then(async m=>{const d='skill/references';const f=[...m.pairing(d),...m.unlicensed(d)];f.forEach(x=>console.error(x.code,x.sentence));process.exit(f.length?1:0)})\""
```

---

## 4 · CUT

Work that changes no output.

| # | cut | where | why |
|---|---|---|---|
| X1 | `S2` as a phase | `SKILL.md:45`, `:80-81`; `ship.md:1`, `:62-64` | Its entire content is "never run it". Four mentions, a table column, a section heading and a panel instruction for a step defined only by its own prohibition. The design already lives in `agentspec/docs/pipeline.md:61-64` under an explicitly-labelled planned section, and that file's as-is table gives SHIP no sub-stages at all. Four deletions; `docs/pipeline.md` untouched. If R10's panel ships first, `S2 ⏸` stays as one cell and this cut is optional. |
| X2 | `references/debate.md` — wire it or delete it | `debate.md:4`; `resume.md:31`, `:33` | `debate.md:4` states its own trigger: *A recipe that needs it says "validate via [debate.md](debate.md)"*. `grep "validate via"` returns exactly one hit — that sentence. `46592a5` deleted both invocation sites (from `gen.md` G1.3 and `evals.md`) and left the callee plus two `resume.md` cells that order a re-run of a validation no recipe ever prescribed. **Wire it**: `gen.md:19` gains `Every derived tool and every intake finding is validated via [debate.md](debate.md) before G1 closes.`, and `evals.md` E1a gains one line collecting the debate's recycled scenarios as case candidates. Deleting instead means five edits, because `README.md:34`, `BACKLOG.md:8` (a backlog item trigger-armed on "the first debate miss") and `docs/pipeline.md:80` all still promise it. |
| X3 | `references/local-performance.md` + `references/judge-ruler.md` — link them or delete them | zero inbound links from `SKILL.md` or any `references/*.md` | `judge-ruler.md:6` says "this page is part of what a certification means", and `test.md:93` is the entire judging instruction a reader gets. Nine grading rules — including *"Ambiguous or insufficient evidence is a FAIL"* and the turn-boundary rule that a confirm-before-act row passes only when the question and the report sit in **different** turns — are reachable from nowhere. Link at `test.md:93` and add a clause to `SKILL.md:73`. For `local-performance.md`: link from `models.md:63`, and fix `monitor.mjs:21`'s false sentence — *"The SHIP gate reads it — a degraded run never certifies"* — because `certify`'s only incident source is `scan(runDir)`, which reads `failures.jsonl` and `resolutions.jsonl` and never `MONITOR.md`. `grep -rn "MONITOR.md"` returns the script itself and one CLOSED spec. |
| X4 | `skill/scripts/extract-fork.mjs`, `synth-fork.mjs` | named by no page, in either repo | `margin-probe.mjs` at least has its instrument named (`models.md:56`, `serve-local.sh:10`) even though its path is not. The two fork producers have zero mentions of any kind. Either give `test.md`'s T3 loop step 7 the three-command recipe (`extract-fork` or `synth-fork` → serve `NOSPEC=1` → `margin-probe pair`), or move all three under `docs/` where the unnamed-tool cost is zero. |
| X5 | `local-performance.md:1`'s parenthetical | `# Local serving & simulating — the performance laws (operative, not history)` | "operative" is redundant with line 3, which already states the operative force; "not history" says nothing about local serving. `grep -rni "\bhistory\b"` over all 2 443 lines of the skill returns exactly one hit — this title. There is no history page for it to distinguish against. Same shape at `:19` ("the two laws coexist by design"), which argues with a hypothetical reviewer instead of stating the rule. |
| X6 | `norms.md:352`'s two byte totals, as a *hand* record | `norms.md:352`, `:402` | Keep the numbers; stop asking the author to count them. `pw.system().length` and the sum over `pw.toolCards()` are two lines in the snippet already on the page. The proposal an auditor made — use `profile().bytes` — answers a different question: `lints.ts:437` sums the byte length of `cards.ts` **source files**, imports and comments included, once for the whole subject. It is neither per-desk nor rendered bytes, and wiring it would have the author sign `RENDER.md` with a number answering neither of the two the page asked for. |

Do **not** cut: `norms.md` N6 as a phase (it is the only home for four lints), `gen.md` G3 (its artifact is N4's obligation 4 and `guard-catalog.md:594`'s only answer to "is there a check under this law"), or `doubleStated`/`echoes` as author-answered rows.

---

## 5 · FASTER

**Basis, stated up front.** I have no instrumented per-phase timings — nobody has run this pipeline since `46592a5` (both real `PIPELINE.md` files on disk are dated Aug 6 and Aug 8, twelve days before G3 and N6 existed). The minutes below are derived from measured **bytes** at 3.6 B/token, 80 tok/s sustained decode, and one deliberation pass per checklist line that demands a read of the rendered prompt. They are estimates with an arithmetic basis, not measurements. The gate is not a candidate — all five static lints over the real six-desk subject run in **0.45 s**.

| # | change | minutes | basis | the bar it must not break |
|---|---|---|---|---|
| F1 | **Emit the card scaffolding; author only the sentences.** A `cards` generator over a declaration file, the way `generated/cases-data.ts`, `tool-schemas.ts` and `world-data.ts` are already emitted in `atlas-render`. | **~2.2** | `cards.ts` is 62 710 B ≈ 17 400 tok. Business sentences (prose 17 125 + disclosure 12 096 + personas 1 615 + facts 1 822 + voice 477 ≈ 33 KB) are irreducible; the remaining ~29.5 KB is imports, helper defs, spec objects, factory-call wiring and `as const` scaffolding. 29.5 KB ≈ 8 200 tok ≈ 1.7 min, plus the re-reads it forces. | `guard-catalog.md:1006` — the generator invents **no prose**. Every `rule`, every tense, every persona comes from the declaration the author wrote. |
| F2 | **One conduct-law text per law, emitted onto every spec.** | **~0.8** | `atlas-render` has 45 prose calls in 8 law names: `declareHonestly ×6`, `oneQuestion ×6`, `yourLaneYourReads ×6`, `recordsOverAssertions ×6`, `askBeforeYouChoose ×6`, `nameItDoNotPassItOn ×6`, `noSuchOperation ×6`, `policyIsTheWholeAnswer ×2`. 17 125 B written; 8 declarations ≈ 3 200 B. Saving 13 925 B ≈ 3 870 tok. | `prompt-writer.ts:34` filters `home === 'spec'`, so the six laws must reach **every** desk's prefix — an emitted copy satisfies that exactly. **Evidence it is already safe**: `nameItDoNotPassItOn` ships **six byte-identical copies** in the certified subject, and `policyIsTheWholeAnswer` two. The per-desk-vocabulary doctrine (`guard-catalog.md:260`) is already broken for two of eight laws, and the run certified. |
| F3 | **Replace the four N6 hand-judgements with the verbs (C7–C10).** | **~0.6** | Four checklist lines each demand a scan of the compiled cards: `inertChecks` over every `precondition`, `profile` over 31 acting tools, `unlicensed` over 45 prose rules, `pairing` over the contract. As verbs: 0.45 s total. As a hand pass on a 31-tool surface: minutes, and it is the pass that produces two different answers on two different days, because nothing writes the list down. | `norms.md:363`'s `doubleStated` and `:378`'s `echoes` stay hand-answered. The gate must not become a place where a legitimate non-empty result reads as failure. |
| F4 | **One gate list, not three.** Collapse `test.md:38-44`, `norms.md:356-398` and `check-subject.test.ts` into one file, and make `norms.md:421` say "the gate is green". | **~0.4** | Three lists, each implying the others complete. An author reading `test.md` has no reason to run `unlicensed`; an author reading N6 has no reason to run `purity`. NORMS exits on the shortest of the three (`norms.md:421`), which is the one that cannot see either defect the shipped template carries. | The gate keeps only checks that belong to the engine (`check-subject.test.ts:3`), and the row-shaped verbs stay in N6 by name. |
| F5 | **Delete the six duplications (§1).** | **~0.3** | ~4 500 B off the reading path, most of it `guard-catalog.md` — the 54 KB page `norms.md:81` and `:190` route to **twice**, at N1 and again at N4. | `guard-catalog.md` stays the single home for every guard decision (`SKILL.md:50`). Nothing moves *out* of it except Lesson 17. |
| F6 | **Fix the panel and the four stale headers (R10).** | **~0.2 forward · unbounded on resume** | A resumed run whose panel has no G3 cell never runs G3, so `gen/SEAM.md` never exists and N4's obligation 4 walks nothing — and the re-authoring that discovers it is a whole phase, not a minute. | `resume.md:11` must land on a real cell for every declared sub-stage. |

**Total, forward-run: ~4.5 minutes off 15–25.** Roughly a 1.25× cut. Not close.

### The twenty-fold question

**Under one minute is not reachable for a six-desk subject, and the floor is set by the authored bytes.**

```
  the only shipped six-desk subject          cards.ts   62 710 B  ≈ 17 419 output tokens
  ────────────────────────────────────────────────────────────────────────────────────────
  decode alone, zero read / zero thought / zero gate:
       60 tok/s   →  290 s  =  4.8 min
      100 tok/s   →  174 s  =  2.9 min
      200 tok/s   →   87 s  =  1.5 min
      290 tok/s   →   60 s  =  1.0 min   ← the whole budget, spent on decode
```

Apply F1 + F2 in full — the generator writes every brace and the six laws collapse to one text each — and the author still writes ~33 KB of business sentences the generator cannot invent:

```
  prose (8 laws, one text each)   3 200 B
  disclosure tenses              12 096 B   15 destructive tools × before/after/later/empty
  personas (6)                    1 615 B
  facts                           1 822 B
  voice                             477 B
  contract guard `rule` strings  ~14 000 B   the sharpened sentences on the factory spreads
  ──────────────────────────────────────────
                                 ~33 200 B  ≈ 9 200 output tokens
                                   at 80 tok/s  →  115 s  =  1.9 min
                                   at 150 tok/s →   61 s  =  1.0 min
```

**The floor is ~9 200 output tokens of business prose, and what sets it is the count of destructive acts and desks.** Fifteen destructive tools each owe four tenses naming a figure, a record and a consequence (`norms.md:270`); six desks each owe a persona and their own act vocabulary. None of that exists upstream — `gen/DOCS-DIGEST.md` carries the business's policies, not the operator-facing sentences, and `guard-catalog.md:1006` forbids a generator from inventing them. Two minutes of pure decode is the honest floor at today's rates; one minute needs ~150 tok/s sustained with **zero** deliberation, **zero** re-read and **one** gate pass, which is a knife-edge, not a design target.

**What the skill would have to become to get near it:**

```
  PAGES        SKILL.md + one recipe per phase, and guard-catalog.md as a LOOKUP, not a read.
               Today N1 and N4 both route to a 54 KB page. It becomes a table an author queries
               by mechanism name — the ladder (§2) and the configuration (§3) survive as ~8 KB;
               §6's seventeen lessons move to guard-catalog-lessons.md, read once during
               onboarding and never during a run.

  GENERATOR    `agentspec emit <declaration.ts>` → cards.ts + subject.ts + check-subject.test.ts.
               The declaration is the 33 KB of sentences and nothing else:
                 desks:    { name, persona, tools[], teammates, conduct: { <law>: '<sentence>' } }
                 contract: { voice, facts[], guards: [{ factory, args, rule }], disclosure }
               Every brace, every import, every `as const`, every `llmParams: { temperature: 0 }`,
               every WHY entry (derived from the declaration's own law names — the drift that
               produced the 7 PROSE_UNLICENSED findings becomes impossible) is emitted.
               Precedent exists: atlas-render already ships generated/cases-data.ts (84 559 B),
               tool-schemas.ts (46 701 B) and world-data.ts (17 179 B), emitted by port/emit.ts.

  GATE         one file, `npx vitest run check-subject.test.ts`, running eleven verbs. 0.45 s.
               No checklist. No hand pass. The two row-shaped verbs (doubleStated, echoes) print
               into norms/RENDER.md and are signed, not gated.
```

That skill authors a six-desk subject in about **two to three minutes** — a five- to eight-fold cut, and the best the arithmetic allows. To reach sixty seconds you would have to stop writing per-desk disclosure tenses and per-desk personas, and at that point the thing being generated is no longer a governed subject: `norms.md:276` shows exactly what a destructive act without its own `before` costs the operator, and `guard-catalog.md:260` shows what a shared persona costs the desk. **The twenty-fold cut is a request to delete the product, not to speed up the pipeline.** Twelve fewer minutes is available; the last two are the subject.

---

## 6 · LEAVE ALONE

| flagged | verdict | why |
|---|---|---|
| `norms.md:215` — "the world's refusal `detail`" | **correct as written** | Named as a `detail` defect alongside the four `gates` rows. It never says *gate*. `CustomExecutor` returns `{ refuse: Json }` (`vocabulary.ts:313`), `patch-desk.ts:76` stores it as `{ refused }`, `call-runner.ts:28-29` unwraps a string `detail`. A fix would delete a true statement. |
| `ship.md:30-32` — three reps all at 0.95 | **keep, unchanged** | An auditor proposed 0.96/0.95/0.97 "so they are not all exactly at the bar". That breaks the table's own claim: `:33`'s "the same five cases fail every repetition" is only true when every rep is 95/100, and `s >= bar` passes a rep sitting exactly on it. Three reps landing exactly on the bar is the picture of a bar that **holds**. |
| `SKILL.md:47`'s number | **keep the literal** | Flagged as a "second home" that should become a pointer. It already agrees with `test.md:73`, it is the one line stating the law on the always-loaded page, and replacing a number with a pointer costs the reader the fact and buys nothing once `ship.md` is corrected. Apply single-home to `ship.md` alone, which is where the second number lives. |
| `test.md:51` — "does the guard it `covers` actually deny on the preset it runs?" | **keep alongside C6** | Named as a duplicate of `evals.md:140`. It is not: `evals.md:140` asks whether the key *spells* an installed guard (set membership, C3), `test.md:51` asks whether the guard can *deny* on that preset. A case covering `precondition:moveBooking` on a preset where the record already passes spells correctly and can never fire. `approvable` narrows it; nothing subsumes it. |
| `thinking-template.md` §Seeds and §Rejected | **keep both** | The proposed replacement ("§Rejected and §Seeds are written only when a later stage will be asked the same question") silently kills the debate→E1 recycling channel that `debate.md:26-28` depends on. §Seeds is a real cross-stage handoff, not decoration. |
| `guard-catalog.md` §2's ordering of the last two laws | **keep the ordering** | An auditor proposed folding `askBeforeYouChoose` and `nameItDoNotPassItOn` into the four-row table. They are introduced *after* the "The question is never yours to ask" / `noFalseConfirmation` passage (`:307-320`) because `askBeforeYouChoose` builds on it. Fix the sentence above the table (R2); leave the placement. |
| `norms.md` N6 as a phase | **load-bearing** | Flagged for its missing panel cell, which is real (R10) — but the phase itself is the only home for `doubleStated`, `unlicensed`, `echoes` and `ruleCopies`, and the only place anyone prints what the model will actually read. `grep` over the whole skill puts all four verbs at `norms.md:341-388` and nowhere else. |
| `gen.md` G3 / `gen/SEAM.md` | **load-bearing, with a caveat** | Two consumers, not one: `norms.md:205`'s obligation 4, and `guard-catalog.md:594` — *"A law stated with no check behind it is a wish. The gate cannot tell you that… Reading the seam table from gen.md's G3 beside your contract guards is what tells you."* A `seamCovered` lint could enumerate every `gates` entry and executor `refuse` and flag tools with zero coverage — but it cannot judge whether an existing guard's *sentence* is the one an operator needs for THAT refusal, which is G3's third column. The lint is a floor **under** the ceremony, not a replacement. |
| `debate.md`'s two-judge structure | **do not delete the page** | Orphaned (X2), but the alternative to wiring it is not "human gate #1 already covers it": `norms.md:90` is one approval table with one approve/adjust round, and it produces no counter-scenarios. `debate.md:26-28` hands E1 the domain's own edge cases; deleting the page deletes that channel in both directions. |
| `precondition` naming and `GUARD_NAME_DUP` | **the warning is true; only its reason is false** | `guard-catalog.md:501-507` says `precondition` "names itself after its first tool" — `catalog.ts:367` joins **all** tools with `+`. But the advice to override `name` stays correct, and for a reason the page does not give: two gates over the **same** tool set mint the identical name, nothing throws, and `census` (`lints.ts:398`, keyed on `g.name`) clears both rows when either fires. Fix the mechanism sentence, keep the warning. |
| `check-subject.test.ts`'s "the skill re-implements none of them" | **load-bearing** | It is why C1 belongs in `packages/eval/src/lints.ts` and not in a hand-rolled `agentspec` script, and why C4 must diff against the actually-installed names rather than a hardcoded floor list. Every new verb in §3 respects it. |