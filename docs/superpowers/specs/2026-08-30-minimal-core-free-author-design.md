# The minimal core under a freed author — the design map

> **Status: DESIGN — companion to `2026-08-30-minimal-core-free-author-proposal.md`
> (Status PROPOSED). Nothing here is implemented.** Every AS-IS figure below was read
> off the sources in session; file and line anchors name where.

How to read this page: §A is the machine as it stands, §B is the machine after the
proposal, §C is each design item with its own before/after picture, §D is the schedule.
Plain words throughout — every mechanism is named once and then drawn.

---

## A · AS-IS — the engine and the skill today

### A1 · The packages and who depends on whom

```
                        ┌──────────────────────────────────────────┐
                        │  core  (the engine — depends on zod only)│
                        │  contract/vocabulary.ts imports NOTHING  │
                        └───────┬──────────────────────────────────┘
        ┌───────────┬───────────┼────────────┬──────────────┐
        ▼           ▼           ▼            ▼              ▼
   ┌────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐  ┌───────────┐
   │ models │ │  mastra  │ │  eval   │ │  server  │  │   emit    │
   │ local  │ │ host +   │ │ verbs + │ │ OpenAI   │  │ YAML →    │
   │ tiers  │ │ MCP door │ │ lints   │ │ facade   │  │ cards.ts  │
   └────────┘ └────┬─────┘ └────┬────┘ └──────────┘  └─────┬─────┘
                   │            │        (eval also uses    │ (emit uses
                   └────────────┴──────── mastra)           │  core + eval)
                                ▼                           ▼
                    ┌───────────────────────────────────────────────┐
                    │ THE SUBJECT: declaration.yaml → emitted       │
                    │ cards.ts · subject.ts · check-subject.test.ts │
                    │ cards import @looprun-ai/core factories only  │
                    └───────────────────────────────────────────────┘
```

Sizes that matter later: `core/src` ≈ 5,100 lines, `eval/src` ≈ 3,200 (of which
`lints.ts` alone is 1,979), `emit/src` = 2,286, `mastra/src` ≈ 860.

### A2 · The engine components, grouped by duty

```
┌─ THE TURN MACHINE ─────────────────┐  ┌─ THE GUARD LAYER ──────────────────────┐
│ turn.ts (475)     sequences all    │  │ cards/catalog.ts (808)                 │
│ session.ts (93)   seal = commit    │  │   18 deterministic factories           │
│ engine.ts (100)   composition root │  │   4 judged (lie/impossibility/         │
│ model-seat.ts     certified targets│  │      injection/hallucinationCheck)     │
│ front-desk.ts     routing window   │  │   3 rewrites (purge/mask/swapTerms)    │
└────────────────────────────────────┘  │ rulebook.ts (117)  ordered guard pipe  │
┌─ THE CALL PATH ────────────────────┐  │ agent-factory.ts   cards → frozen agent│
│ call-runner.ts (365)               │  │ honesty-check.ts   report vs acts      │
│   coerce → identity → verdict →    │  └────────────────────────────────────────┘
│   route → grade → mask-on-record   │  ┌─ THE WORLD ────────────────────────────┐
│ consent-desk.ts (244)              │  │ world.ts / world-builder.ts /          │
│   question lifecycle, 6-digit code │  │ world-gates.ts / patch-desk.ts         │
│ disclosure-desk.ts (240) 3 tenses  │  │ one validating door, gates on          │
│ masker.ts (68) masks once,on record│  │ every kind, simulate ≡ execute         │
└────────────────────────────────────┘  └────────────────────────────────────────┘
┌─ THE DELIVERY CHAIN (the seam §C measures) ────────────────────────────────────┐
│ finish-desk.ts     the one structured closing channel                          │
│ delivery-facts.ts  the turn's owed words, as labeled facts                     │
│ reply-composer.ts  (131)  A SECOND MODEL CALL that rewrites the draft          │
│ prose-reader.ts    (112)  wallEcho + language, zero vocabulary                 │
│ delivery-writer.ts (20)   the literal floor: record lines                      │
│ judge.ts           (64)   A THIRD MODEL CALL: one YES/NO per judged rule       │
│ prompt-writer.ts   (87)   single producer of prompt bytes                      │
└────────────────────────────────────────────────────────────────────────────────┘
┌─ EVAL: verbs over a run dir ───────┐  ┌─ EMIT: the authoring gate ─────────────┐
│ subject-loader · validator · gate  │  │ declaration.ts (526)  YAML → typed     │
│ lints.ts: 27+ verbs, 1,979 lines   │  │ write-cards.ts (903)  the WHOLE text   │
│ exam-runner · judge-inputs · fold  │  │   of cards.ts, never a sentence of its │
│ counters · certify · seal · scan   │  │   own                                  │
└────────────────────────────────────┘  │ against-surface.ts (633) every refusal │
                                        │   answerable from the surface          │
                                        └────────────────────────────────────────┘
```

### A3 · One governed turn, AS-IS — where the three prompts fire

Three different system prompts exist per turn: `[P1]` the main loop
(`PromptWriter.system()` + a mutating STATE tail), `[P2]` the composer's own
("You are the delivery desk…", reply-composer.ts:28), `[P3]` the judge's own
("You are checking ONE rule…", judge.ts:17).

```
 operator message
      │
      ▼
 1 · checkInput guards ──deny──► floor sentence, seal. ZERO model calls.
      │
 2 · consent desk runs FIRST, engine-side (turn.ts:204-218)
      │   typed approval → held call EXECUTES before the model speaks
      ▼
 3 · MAIN LOOP  [P1]  system = frozen head + MUTATING STATE tail  ◄── §D3's target
      │   tool calls, serial, each through call-runner
      │   ├─ first held question ─────────────► engineClose  (path B)
      │   ├─ finish call ─────────────────────► tryFinish    (path A)
      │   └─ retries exhausted ───────────────► engineClose
      ▼
 4 · tryFinish (path A, turn.ts:319-418)
      │   reply guards → figureIsGrounded → contradiction → judged [P3]
      │   │                                  (judged only if deterministic clean)
      │   ├─ violation → redrive: attempt + correction ride back into [P1]
      │   └─ clean ▼
      │   assembleFacts (AFTER the redrive loop — §D1's target)
      │   ├─ facts empty & prose keeps reads → prose IS the delivery (no call)
      │   └─ else → ReplyComposer.deliver  [P2]  ◄── a 2nd writer; §D2's target
      │             gate = gateMisses: PRESENCE-only; facts:[] = vacuous
      ▼
 5 · engineClose (path B, turn.ts:452-473)
      │   NO reply guards, NO judged walk  ◄── the hole §D2 closes
      │   floor = record lines; composer only if facts exist
      ▼
 6 · readDelivery (both paths): prose reader (wallEcho·language)
      │   refusal → ONE composer redrive → second refusal → literal floor
      ▼
 7 · mask → seal
```

The measured cost of this shape (from the certified runs): the composer wrote 30 of 39
delivered replies in harborpoint's final round; on the turns that close by path B it is
the ONLY writer; and its presence-only gate let one invented figure (364) and two deleted
required sentences (c20 cases 95/37) through. Attribution: the engine owns 5 of the 13
unpaid governed points, 4 of them on this seam.

### A4 · Authoring, AS-IS — the declared path

```
 declaration.yaml ──► emit
      │ readDeclaration    every failure names path + line
      │ factsFromSource    the tool surface, read from the world FILE
      │ writeCards         the whole cards.ts text
      │ checkAgainstSurface every refusal must be answerable
      ▼
 4 files: cards.ts · subject.ts · check-subject.test.ts (digest-stamped) · gen/SEAM.md
      ▼
 gate: runGate + censusFor (27+ lint verbs)
```

The closed vocabularies an author lives inside: 8 desk fields · 13 declarable guard
factories (of the engine's 18 — `deny` is refused, `role`/`cap` are renames) · 4 judged
factories · 3 rewrite kinds · 4 disclosure tenses + 3 minted consent skeletons ·
6 conduct voices demanded by the `conductComplete` lint on multi-desk houses (the
ENGINE's conduct keys are open — the closure lives in the lint, not in core).
Repairs: ALWAYS `declaration.yaml`, never `cards.ts`, never the engine.

### A5 · The skill, AS-IS

```
 phase   A ──────► G ──────► E ──────► N/declare ─────► T ──────► S
 file    ask.md    gen.md    evals.md  norms.md (570)   test.md   ship.md
         models.md debate.md           declare.md (411) judge-    (70)
         (126+72)  (224+29)  (160)     guard-catalog.md ruler.md
                                       (994) + lessons  local-perf
                                       + contexts +     (206+75+46)
                                       template (~780)
```

≈ 3,970 reference lines. The word "composer" appears in NONE of them — the author is
taught a machine whose second writer has no name. `buildJudgeInputs` strips corrections
to their `kind` string (judge-inputs.ts:33), so the judge row shows `["redrive"]` where
the dump shows `guardName · detail · finish.message · delivery.by`.

---

## B · TO-BE — the same machine, minimal and honest about itself

### B1 · Packages after

```
        core (minus reply-composer-as-2nd-writer, minus NEGATORS)
         ├── models   (unchanged + cache_prompt/-np 1 wiring)
         ├── mastra   (unchanged)
         ├── eval     (lints gain NO_LANGUAGE_WORDS + world-id-literal;
         │            judge rows carry the full correction)
         ├── server   (unchanged)
         └── emit ────► RETIRED (2,286 lines) — run ONCE more; its output
                        becomes the hand-owned cards.ts source
```

### B2 · One governed turn, TO-BE — one prefix on the model path

```
 operator message
      ▼
 1 · checkInput guards ── unchanged
 2 · consent desk ─────── unchanged (the mechanism neither trad build matched)
      ▼
 3 · MAIN LOOP  [P1]  system = pw.system() ALONE, frozen forever      ◄ D3
      │               STATE + open questions = LAST user message      ◄ D3
      │               tool card array pinned, one shape               ◄ D3
      ▼
 4 · tryFinish (path A)
      │   reply guards → figureIsGrounded → contradiction → judged*
      │   → gateMisses(facts, finish.message) AS A VIOLATION          ◄ D1
      │     (owed facts now gate the DESK'S OWN message)
      │   ├─ violation → redrive on the SAME [P1] prefix
      │   └─ clean → the desk's message IS the delivery. NO COMPOSER. ◄ D2
      ▼
 5 · engineClose (path B — consent questions, retry exhaustion)
      │   composer KEPT here (it is the only writer: no desk message  ◄ D2
      │   exists) + reply-guard walk and delivered-text figure walk
      │   ADDED on this path
      ▼
 6 · prose reader — unchanged on both paths (redrive writer: the desk
      on path A, the composer on path B)
      ▼
 7 · mask → seal — unchanged

 * judged guards: opt-in per desk, and the judge question rides the SAME
   [P1] prefix as the last user message (today: own system + full history)
```

What died: `[P2]` on the model path (the second writer that invented 364 and deleted
95/37's sentences), `[P3]` as a third prefix. What appeared: the owed-content check one
stage earlier — the traditional build's highest-yield mechanism (`must_state`), wired to
the stage where the desk itself answers for it.

### B3 · Authoring, TO-BE — the freed author inside four laws

```
 the author writes            the machine enforces
 ─────────────────            ────────────────────
 free prompt per desk    ◄──  world-id-literal lint: ZERO exam/world record
 (walls are prose,            ids in authored text (the trad leak: 14 ids)
  voices advisory)
 free guard code         ◄──  purity (regex stays AST-caught) +
 behind one signature         NO_LANGUAGE_WORDS: vocabulary is DECLARED DATA
 (18 factories remain         (terms: blocks in the subject), never literals
  available as a library)     in guard code
 owed-content directives ◄──  D1: gateMisses as a violation, redriven
 declaration survives as ◄──  data: terms, disclosures, consent skeletons,
 DATA, not as a licence       limits — the translatable per-subject vocabulary
 held-out discipline     ◄──  certify() refuses a run whose repair touched a
                              split:'held-out' id; covers: dropped from new exams
```

### B4 · The skill, TO-BE

```
 A ──────► G ──────► E ──────► AUTHOR ─────────► T ──────► S
 unchanged unchanged unchanged author.md         test.md   unchanged
                               (declare.md +     + judge
                               ladder chapters   rows now
                               merged: the       carrying
                               desk, the rungs   guardName·
                               as a LIBRARY,     detail·
                               what lints        finish.
                               refuse)           message·
                               engine-seams.md   delivery.by
                               (NEW: delivery,
                               correction and
                               judged stages,
                               BY NAME)
```

The author can finally name the stage that eats their fix — and the judge row shows it.

---

## C · The design items, one picture each

### C1 = D1 · Owed facts gate the desk's own message

```
 AS-IS   finish.message ──[no owed check]──► composer rewrites ──► gateMisses
                                             (2nd call, 2nd prefix)  presence-only,
                                                                     facts:[] = vacuous
 TO-BE   finish.message ──► gateMisses(facts, message) as a VIOLATION
                            │ miss → redrive, SAME model, SAME prefix
                            └ clean → this text ships
```

Already in the engine: `call-runner.ts:115` mints the owed text; `Act.sentence` reaches
the model. Missing only the check at the right stage — `assembleFacts` runs at
turn.ts:402, AFTER the redrive loop closes at :387. Micro-tested on the real dumps: the
existing figure walk over the DELIVERED text catches the 364 case.

### C2 = D2 · The composer narrowed, not deleted

```
              path A (desk message exists)      path B (no desk message:
                                                consent question, retries out)
 AS-IS        composer rewrites the draft       composer is the only writer;
                                                NO reply guards run here
 TO-BE        NO composer — D1-gated desk       composer KEPT + reply-guard walk
              message ships as-is               + delivered-text figure walk ADDED
```

Why not delete: 12 of 25 fact-owing harborpoint turns (53/107 on atlas) have NO desk
message at all — all 8 consent questions among them. Deleting ships the floor's record
dump to the operator on every consent turn (the red-team's FATAL, accepted).

### C3 = D3 · The frozen-prefix prompt (the local-SLM cache layout)

```
 AS-IS  per model step:                       TO-BE  per model step:
 ┌──────────────────────────────┐             ┌──────────────────────────────┐
 │ system = frozen head         │             │ [A-D] FROZEN PREFIX          │
 │        + STATE tail  ◄─ MUTATES            │  identity·laws / other desks │
 │          every write, every  │             │  desk rules / tool cards     │
 │          step (turn.ts:239)  │             │  (one string per desk, ever) │
 ├──────────────────────────────┤             ├──────────────────────────────┤
 │ tools = TWO shapes           │             │ [E] history, append-only     │
 │  (returnable branch)         │             │ [F] operator message         │
 │ 3 prefixes/turn: P1·P2·P3    │             │ [G] STATE+questions = LAST   │
 └──────────────────────────────┘             │     user message             │
                                              │ [H] corrections, after [G]   │
 KV cache: void on every                      └──────────────────────────────┘
 write act                                    re-prefill starts at [G]
```

Three edits produce it: `system: pw.system()` alone (the freeze already exists and is
defeated at the call site) · `pw.tail()` moves to the last user message · the tool block
stops changing shape (`RETURN_CLOSED` already refuses when the door is shut). The
owed-read micro-step (single tool card) stays as a documented one-step fork.
Prerequisite the red-team caught: `cache_prompt: true` and `-np 1` must land in
`packages/models` first, or the llama.cpp measurement times the box, not the layout.

### C4 = D4 · The freed author (see §B3)

The emitter retires after ONE last run whose output is byte-diffed and adopted as the
hand-owned source. The declaration file survives as data (terms, disclosures, skeletons,
limits). Freedoms and the two new lints land in the SAME commit — a freedom without its
lint is a law breach on day one.

### C5 = D5 · The small repairs that ride along

```
 NEGATORS deleted (catalog.ts:608)      the live law breach: "não passou" was
                                        ALLOWED for outcome:'passed'
 judge rows enriched                    corrections carry guardName · detail ·
 (judge-inputs.ts:33)                   finish.message · delivery.by — the four
                                        fields that identify a composer failure
 engine-seams.md in the skill           the stage map, BY NAME
 judge opt-in, same prefix              zero judged guards are declared in any
                                        of the three subjects today
 git init + seal() on subject trees     the audit verbs exist; run them
```

---

## D · The schedule — steps, repos, and the split

Sequential steps; each ends green on its acceptance test before the next begins.
`L` = looprun (engine) · `A` = agentspec (skill) · `B` = bench + subject trees.

```
                                        repos        ── time ──────────────────►
 1 NEGATORS deleted                     L            █
 2 D1 gateMisses into tryFinish         L            ░█████
   + delivered-text figure walk                       (acceptance: the 5 rotating
                                                       harborpoint failures)
 3 D2 composer narrowed to engineClose  L            ░░░░░█████
   + reply guards on that path                        (consent turns still prose;
                                                       watch floorDeliveries)
 4 D3 frozen-prefix layout              L            ░░░░░░░░░░█████
   (OWN commit, never bundled w/ 2-3)                 (promptProof cross-step +
                                                       llama.cpp prefill run)
 5 D5 judge rows + engine-seams.md      L A          ░░░░░░░░░░░░░░░███
   ◄━━ SPLIT PREPARED: the skill                      (one governed T2 round:
       learns the engine's seams                       author NAMES a composer
                                                       failure)
 6 D4 emitter retired + freedoms        L A          ░░░░░░░░░░░░░░░░░░█████
   + lints + author.md, ONE commit                    (gate green; word-list lint
   ◄━━ SPLIT COMPLETE: declare.md and                  red on a planted SYNONYMS
       the ladder chapters merge into                  fixture)
       author.md
 7 re-certifications                    B            ░░░░░░░░░░░░░░░░░░░░░░░███
   trialworks 29/29 holds ·                           (any drop is a defect,
   atlas full-100 ≥ 92                                 not variance)
```

The split, precisely: step 5 puts the engine's truth INTO the skill (`engine-seams.md`,
enriched judge rows) while `declare.md` still governs authoring; step 6 retires the
emitter and, in the same commit, replaces `declare.md` + the ladder chapters of
`guard-catalog.md` with `author.md` — the page that teaches exactly the freedoms that
commit creates. The subjects are never re-authored in this program: harborpoint is
step 2-3's acceptance test, trialworks and atlas are step 7's regression and
certification.
