# The minimal core under a freed author — the design map

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
 core (the leaf; zod only)                        │ core   − composer as 2nd writer on the model path
  │  contract/vocabulary.ts imports NOTHING       │        − NEGATORS (8 English words, catalog:608)
  ├── models   local tiers, llama.cpp             │ models + cache_prompt / -np 1 wiring (D3 prereq)
  ├── mastra   host agents + MCP door             │ mastra   unchanged
  ├── eval     verbs + 27+ lints (1,979 ln);      │ eval   + NO_LANGUAGE_WORDS + world-id-literal
  │            judge rows stripped to `kind`      │          lints; judge rows carry the FULL
  ├── server   OpenAI facade                      │          correction (D5)
  ├── emit     YAML → cards.ts (2,286 ln)         │ server   unchanged
  └── looprun  facade barrels                     │ emit     RETIRED — run ONCE more; its output is
                                                  │          byte-diffed and adopted as the
                                                  │          hand-owned cards.ts source (D4)
 sizes: core ≈5,100 · eval ≈3,200 · emit 2,286    │ net: −2,286 authored lines, −1 model call/turn
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
 3 main loop [P1]     │ system = frozen head + MUTATING STATE    │ system = pw.system() ALONE, frozen
                      │ tail, rebuilt EVERY step (turn:239) —    │ forever; STATE + open questions move to
                      │ voids the KV cache on every write;       │ the LAST user message; tool array
                      │ tool array has TWO shapes (returnable)   │ pinned, ONE shape           ◄ D3
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
 5 engineClose        │ composer is the ONLY writer here;        │ composer KEPT here (without it, consent
   (path B — consent  │ NO reply guards, NO judged walk          │ turns ship raw record dumps) + the
   question or        │ (turn:452-473)                           │ reply-guard walk and the delivered-text
   retries exhausted) │                                          │ figure walk ADDED           ◄ D2
 ─────────────────────┼──────────────────────────────────────────┼─────────────────────────────────────────
 6 prose reader       │ wallEcho + language over the composed    │ unchanged — redrive writer is the desk
                      │ text, both paths; one redrive → floor    │ on path A, the composer on path B
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
 AS-IS — the declared path                        │ TO-BE — the freed author, inside four laws
 ─────────────────────────────────────────────────┼──────────────────────────────────────────────────
 declaration.yaml is the ONLY authoring surface;  │ free prompt per desk (walls are prose, the six
 emit writes the WHOLE cards.ts text              │ voices demote to advisory)
                                                  │
 closed vocabularies: 8 desk fields · 13          │ free guard code behind one signature — the
 declarable factories (the ENGINE holds 18;       │ engine's 18 factories remain available as a
 `deny` refused, `role`/`cap` renames) · 4        │ LIBRARY, no longer a ceiling
 judged · 3 rewrites · 4 disclosure tenses +      │
 3 minted consent skeletons · 6 conduct voices    │ declaration SURVIVES as data: terms,
 demanded by the conductComplete LINT (core's     │ disclosures, consent skeletons, limits — the
 conduct keys are open; the closure is the lint)  │ translatable per-subject vocabulary
                                                  │
 repair = ALWAYS declaration.yaml, never          │ repair = any authored file, held by the lints:
 cards.ts, never the engine                       │   purity        regex stays AST-caught
                                                  │   NO_LANGUAGE_WORDS  word lists refused;
 gate: runGate + censusFor (27+ verbs)            │                 vocabulary only as declared data
                                                  │   world-id-literal   ZERO exam/world record ids
 the author's blind spot: "composer" is not a     │                 in authored text (trad leaked 14)
 word the skill knows; judge rows show            │   certify()     refuses a run whose repair
 ["redrive"] where the dump shows guardName ·     │                 touched a held-out id
 detail · finish.message · delivery.by            │ covers: dropped from every new exam
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
| `reply-composer.ts` (131) | second writer on BOTH close paths; `gateMisses` presence-only | writer on engineClose ONLY; tryFinish ships the desk's own gated message |
| `turn.ts` owed-facts check | `assembleFacts` at :402, after the redrive loop (:387) — facts gate only the rewrite | `gateMisses(facts, message)` inside tryFinish, as a violation, redriven |
| `turn.ts:239` prompt | frozen head + mutating STATE concatenated per step | `pw.system()` alone; STATE = last user message; tool array pinned |
| `judge.ts` (64) | own prefix + full history; compiled for every declared judged guard | opt-in per desk; question rides the main prefix as the last user message |
| `catalog.ts` NEGATORS (:608) | 8 English negators decide negation ("não passou" ALLOWED for 'passed') | deleted — no word of any language in runtime matching |
| `choiceFromUser` | licenses a coded value by matching declared terms in the operator's prose — language-bound: only the declaration's language works | same name, new behavior: the desk asks, options in the operator's language; the value is licensed only by an exact-alone echo (the ConsentDesk mechanic, generalized) |
| `call-runner.ts` mask seam (:305) | masks declared fields | + untrusted-field wrapper — field NAMES only, never words |
| `packages/emit` (2,286) | the only authoring door | retired; final output adopted as hand-owned source |
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

### C4 = D4 · The freed author (see §AB3)

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
