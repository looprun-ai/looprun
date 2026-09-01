# The minimal core under a freed author — the design map

> **CLOSED — 2026-09-01.** Shipped through the proposal beside this file; the engine content
> lives in `packages/*` and the remainders are BACKLOG rows 1 and 8.

> **Status: DESIGN — companion to `2026-08-30-minimal-core-free-author-proposal.md`
> (Status PROPOSED). Nothing here is implemented.** Every AS-IS figure below was read
> off the sources in session; file and line anchors name where.

How to read this page: §AB puts the machine as it stands and the machine after the
proposal SIDE BY SIDE — same rows, two columns, so every difference sits on one line.
§C is each design item with its own before/after picture, §D is the schedule.
Plain words throughout — every mechanism is named once and then drawn.

---

## AB · AS-IS ⇄ TO-BE, side by side

### AB1 · The packages

```
 AS-IS                                            │ TO-BE
 ─────────────────────────────────────────────────┼──────────────────────────────────────────────────
 core (the leaf; zod only)                        │ core   − the composer, entirely (reply-composer.ts)
  │  contract/vocabulary.ts imports NOTHING       │        − NEGATORS (8 English words, catalog:608)
  ├── models   local tiers, llama.cpp             │ models + cache_prompt / -np 1 wiring (D3 prereq)
  ├── mastra   host agents + MCP door             │ mastra   unchanged
  ├── eval     verbs + 27+ lints (1,979 ln);      │ eval   + NO_LANGUAGE_WORDS + world-id-literal
  │            judge rows stripped to `kind`      │          lints; judge rows carry the FULL
  ├── server   OpenAI facade                      │          correction (D5)
  ├── emit     YAML → cards.ts (2,286 ln)         │ server   unchanged
  └── looprun  facade barrels                     │ emit     SHRUNK — sentence-shape policing
                                                  │          (skeletons, selector, six-voice
                                                  │          mandate) leaves; factories, pairing,
                                                  │          slots, against-surface STAY; cards.ts
                                                  │          stays generated, never hand-edited (D4)
 sizes: core ≈5,100 · eval ≈3,200 · emit 2,286    │ net: freer sentences, −1 model call/turn
```

### AB2 · One governed turn — same stages, two machines

AS-IS runs up to THREE different system prompts per turn: `[P1]` the main loop
(`PromptWriter.system()` + a mutating STATE tail), `[P2]` the composer's own
(reply-composer.ts:28), `[P3]` the judge's own (judge.ts:17). TO-BE runs ONE on the
model path.

```
 stage                │ AS-IS                                    │ TO-BE
 ─────────────────────┼──────────────────────────────────────────┼─────────────────────────────────────────
 1 input guards       │ deny → floor sentence, seal;             │ unchanged
                      │ zero model calls                         │
 ─────────────────────┼──────────────────────────────────────────┼─────────────────────────────────────────
 2 consent desk       │ typed approval EXECUTES engine-side      │ unchanged — the mechanism neither
                      │ before the model speaks (turn:204-218)   │ traditional build matched
 ─────────────────────┼──────────────────────────────────────────┼─────────────────────────────────────────
 3 main loop [P1]     │ system = frozen head + MUTATING STATE    │ LAYOUT STAYS AS-IS — measured cache-
                      │ tail, rebuilt EVERY step (turn:239);     │ optimal (microtest-7: 1.00× vs 1.74×
                      │ tool array has TWO shapes (returnable)   │ append-only, 6.50× STATE-last); what
                      │                                          │ ships: cache_prompt + -np 1 wiring;
                      │                                          │ tool-array pinning owed        ◄ D3
 ─────────────────────┼──────────────────────────────────────────┼─────────────────────────────────────────
 4 tryFinish          │ reply guards → figureIsGrounded →        │ same walk, PLUS:
   (path A — the desk │ contradiction → judged [P3: own system   │ gateMisses(facts, finish.message) runs
   wrote a message)   │ + full history];                         │ as a VIOLATION → redrive on the SAME
                      │ owed facts NOT checked here —            │ [P1] prefix                 ◄ D1
                      │ assembleFacts only at turn:402, AFTER    │ clean message SHIPS AS-IS — no
                      │ the redrive loop closes at :387;         │ composer, no second writer  ◄ D2
                      │ clean draft → composer [P2] REWRITES it; │ judged guards: opt-in per desk, riding
                      │ its gate is PRESENCE-only and vacuous    │ the SAME [P1] prefix as the last user
                      │ on facts:[] (invented 364; deleted the   │ message                     ◄ D5
                      │ required sentences of c20 95/37)         │
 ─────────────────────┼──────────────────────────────────────────┼─────────────────────────────────────────
 5 engineClose        │ composer is the ONLY writer here;        │ composer DELETED here too: the DESK gets
   (path B — consent  │ NO reply guards, NO judged walk          │ one close-step in its own conversation
   question or        │ (turn:452-473)                           │ ("the desk holds: […]; write the closing
   retries exhausted) │                                          │ reply"), charged through the FULL funnel
                      │                                          │ (measured 15/15 vs composer 11/15) ◄ D2′
 ─────────────────────┼──────────────────────────────────────────┼─────────────────────────────────────────
 6 prose reader       │ wallEcho + language over the composed    │ unchanged rulers — the redrive writer is
                      │ text, both paths; one redrive → floor    │ the DESK on both paths (composer gone)
 ─────────────────────┼──────────────────────────────────────────┼─────────────────────────────────────────
 7 mask → seal        │ the one commit point                     │ unchanged
 ─────────────────────┼──────────────────────────────────────────┼─────────────────────────────────────────
 prefixes per turn    │ up to THREE (P1 · P2 · P3)               │ ONE on the model path
```

The measured cost of the AS-IS shape (certified runs): the composer wrote 30 of 39
delivered replies in harborpoint's final round; on path B it is the only writer; its
presence-only gate let one invented figure and two deleted required sentences through.
Attribution: the engine owns 5 of the 13 unpaid governed points, 4 of them on this seam.

### AB3 · Authoring

```
 AS-IS — the declared path                        │ TO-BE — free prose under a shrunken emitter
 ─────────────────────────────────────────────────┼──────────────────────────────────────────────────
 declaration.yaml is the ONLY authoring surface;  │ SAME WORKFLOW: the author edits
 emit writes the WHOLE cards.ts text              │ declaration.yaml, runs emit, cards.ts stays
                                                  │ generated — hand-editing measured unsafe
 closed vocabularies: 8 desk fields · 13          │ (microtest-5: 16/28 mutations silent)
 declarable factories (the ENGINE holds 18;       │
 `deny` refused, `role`/`cap` renames) · 4        │ CHECKS stay closed, factory-only (rule+deny
 judged · 3 rewrites · 4 disclosure tenses +      │ minted from the same params) + FOUR new
 3 minted consent skeletons · 6 conduct voices    │ factories close the no-rung shapes
 demanded by the conductComplete LINT (core's     │
 conduct keys are open; the closure is the lint)  │ PROSE goes FREE: walls, refusals, questions,
                                                  │ persona, disclosure sentences — the author's
 repair = ALWAYS declaration.yaml, never          │ own words; skeletons, selector and the
 cards.ts, never the engine                       │ six-voice mandate leave; emit carries the
                                                  │ sentences verbatim
 gate: runGate + censusFor (27+ verbs)            │
                                                  │ the line is held by: unfilled-slot refusal ·
 the author's blind spot: "composer" is not a     │ word-list lint (M09 red) · world-id lint
 word the skill knows; judge rows show            │ (M10 red) · against-surface "did you mean" ·
 ["redrive"] where the dump shows guardName ·     │ covers: KEPT on governed subjects (the only
 detail · finish.message · delivery.by            │ deletion tripwire) · strict subject tsconfig ·
                                                  │ certify() refusing held-out repairs
```

### AB4 · The skill

```
 AS-IS                                            │ TO-BE
 ─────────────────────────────────────────────────┼──────────────────────────────────────────────────
 A → G → E → N/declare → T → S                    │ A → G → E → AUTHOR → T → S
                                                  │
 norms.md 570 · declare.md 411 ·                  │ author.md — declare.md + the ladder chapters of
 guard-catalog.md 994 (+ lessons 256,             │ guard-catalog.md MERGED: write the desk, the
 contexts 170, template 181) · test.md 206 ·      │ rungs as a library, what the lints refuse
 evals.md 160 · gen.md 224 · ship.md 70 …         │
 ≈ 3,970 reference lines                          │ engine-seams.md — NEW: the delivery, correction
                                                  │ and judged stages, BY NAME (grep "composer"
 "composer" appears in NONE of them — the         │ stops returning zero)
 author is taught a machine whose second          │
 writer has no name                               │ test.md — failure-reading table points at the
                                                  │ ENRICHED judge rows: guardName · detail ·
 judge rows: corrections stripped to their        │ finish.message · delivery.by
 kind string (judge-inputs.ts:33)                 │ A/G/E/ship pages: unchanged
```

### AB5 · Component by component — the delta table

| component | AS-IS | TO-BE |
|---|---|---|
| `reply-composer.ts` (131) | second writer on BOTH close paths; `gateMisses` presence-only | DELETED — tryFinish ships the desk's own gated message; engineClose becomes a desk close-step in the same conversation (measured 15/15 vs 11/15) |
| `turn.ts` owed-facts check | `assembleFacts` at :402, after the redrive loop (:387) — facts gate only the rewrite | `gateMisses(facts, message)` inside tryFinish, as a violation, redriven |
| `turn.ts:239` prompt | frozen head + mutating STATE concatenated per step | `pw.system()` alone; STATE = last user message; tool array pinned |
| `judge.ts` (64) | own prefix + full history; compiled for every declared judged guard | opt-in per desk; question rides the main prefix as the last user message |
| `catalog.ts` NEGATORS (:608) | 8 English negators decide negation ("não passou" ALLOWED for 'passed') | deleted — no word of any language in runtime matching |
| `choiceFromUser` | licenses a coded value by matching declared terms in the operator's prose — language-bound: only the declaration's language works | same name, new behavior: the desk asks, options in the operator's language; the value is licensed only by an exact-alone echo (the ConsentDesk mechanic, generalized) |
| `call-runner.ts` mask seam (:305) | masks declared fields | + untrusted-field wrapper — field NAMES only, never words |
| `packages/emit` (2,286) | the only authoring door; polices sentence SHAPE (skeletons, selector, six voices) AND structure | SHRUNK: sentence-shape policing leaves (prose goes free in the declaration); factories, pairing, slots, against-surface stay; cards.ts stays generated |
| `eval/lints.ts` (1,979) | 27+ verbs; `conductComplete` RED on multi-desk houses | + NO_LANGUAGE_WORDS + world-id-literal; conduct voices advisory |
| `eval/judge-inputs.ts` (:33) | corrections → `kind` only | full correction fields reach the judge row |
| `eval/certifier.ts` | held-out excluded from the fix loop | + refuses a run whose repair touched a held-out id |
| `packages/models` | no `cache_prompt`, tiers request `slots: 2` | `cache_prompt: true` + `-np 1` per local-performance.md laws 1/5 |
| consent-desk · world/ · masker · floor · prose-reader · counters · honesty-check | — | UNCHANGED — the keep list, each with a measured win behind it |

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
the model. Missing only the check at the right stage. Micro-tested on the real dumps:
the existing figure walk over the DELIVERED text catches the 364 case.

### C2 = D2′ · The composer deleted everywhere — the desk writes the close

```
              path A (desk message exists)      path B (no desk message:
                                                consent question, retries out)
 AS-IS        composer rewrites the draft       composer is the only writer;
                                                NO reply guards run here
 TO-BE        NO composer — D1-gated desk       NO composer — the desk gets ONE
              message ships as-is               close-step in the SAME conversation,
                                                and the full funnel charges it
```

Measured head-to-head on 15 path-B turns (microtest-6): the desk's close-step delivered
15/15 where the composer floored 4 (each floor an English record line to a Portuguese
operator), invented nothing where the composer derived 2940 on 3/3 first tries, told the
truth about acts 11/12 vs 6/12, and cost less (18 calls · 445 warm tokens vs 23 · 851
cold). The composer's act report is a claim about a conversation it was never in — the
defect is structural. The second model prefix leaves the engine entirely.

### C3 = D3 · The prompt layout — the freeze is REFUTED by measurement

```
 microtest-7 (llama.cpp ram24, ruler verified 4,069 → 4):
                                 total prefill, 8 turns
 AS-IS  (STATE inside system)         7,481   1.00×  ← today's shape WINS
 append-only (stale STATEs stay)     13,042   1.74×  + unbounded growth
 STATE-last (the original D3)        48,641   6.50×  ← the designed layout, refuted
```

The server's cache-reuse window cliffs a few hundred tokens from the prompt's END: a
776-token STATE parked last pushes every appended token past it, while STATE at a fixed
mid-prompt position re-prefills only when it actually changes (writes ~1k, reads ~50).
What survives: the `cache_prompt`/`-np 1` wiring (load-bearing — nothing caches without
it), the micro-step fork (measured survivable: main-loop cache returns at 1,232 vs 4,380
cold). What dies: moving STATE, and the shared-[A] cross-desk ordering (bought ZERO).
The real cache lever moves to step 4b: shrink STATE and the write-turn re-prefill
shrinks with it.

### C4 = D4 · Free prose under a shrunken emitter (see §AB3)

The workflow keeps its shape — edit `declaration.yaml`, run emit, `cards.ts` generated —
and the emitter loses only its sentence-shape half: skeletons, the selector and the
six-voice mandate leave; the author owns every sentence. Checks stay factory-only, with
four new factories for the no-rung shapes. The freedom and its lints (word-list,
world-id) land in the SAME commit — a freedom without its lint is a law breach on day
one, and microtest-5 measured both lints as currently missing (M09/M10 green).

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
 3 D2′ composer DELETED everywhere;     L            ░░░░░█████
   desk close-step, full funnel;                      (microtest-6: 15/15 vs 11/15;
   reply-composer.ts out                               watch floorDeliveries)
 4 D3 as measured: cache_prompt +       L            ░░░░░░░░░░█████
   -np 1 wiring; layout STAYS AS-IS                   (microtest-7 ruler re-run
   (freeze refuted 1.00×/1.74×/6.50×)                  against the engine's client)
 5 D5 judge rows + engine-seams.md      L A          ░░░░░░░░░░░░░░░███
   ◄━━ SPLIT PREPARED: the skill                      (one governed T2 round:
       learns the engine's seams                       author NAMES a composer
                                                       failure)
 6 D4 emitter SHRUNK (prose free) +     L A          ░░░░░░░░░░░░░░░░░░█████
   4 new factories + lints +                          (gate green; word-list +
   tsconfig + author.md, ONE commit                    world-id lints red on the
   ◄━━ SPLIT COMPLETE: declare.md and                  M09/M10 fixtures; "did you
       the ladder chapters merge into                  mean" still refuses)
       author.md
 7 REGRESSION tier (engine): the 3      B            ░░░░░░░░░░░░░░░░░░░░░░░███
   sealed subjects re-run as authored                 (harborpoint ≥28 w/ the 5
   on the new build, pins updated                      paid · trialworks 29/29 ·
   deliberately, in their existing                     atlas ≥92, 3× both columns)
   homes
 8 BLIND tier (skill): one from-zero    B            ░░░░░░░░░░░░░░░░░░░░░░░░░░███
   atlas author (c21) under author.md,                (ladder 12→40→100 judged ·
   new folder in agentspec-bench,                      T-loop to close · T3 +
   whole pipeline                                      cert ≥92, gap holds)
```

The split, precisely: step 5 puts the engine's truth INTO the skill (`engine-seams.md`,
enriched judge rows) while `declare.md` still governs authoring; step 6 shrinks the
emitter to its structural half and, in the same commit, replaces `declare.md` + the
ladder chapters of `guard-catalog.md` with `author.md` — the page that teaches exactly
the freedoms that commit creates: free sentences, factory-only checks. The subjects are never re-authored in this program: harborpoint is
step 2-3's acceptance test, trialworks and atlas are step 7's regression and
certification.
