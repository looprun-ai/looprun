# The minimal core under a freed author — technical proposal

> **Status: PROPOSED — awaiting the owner's ruling. Nothing in this document is
> implemented.** The measurement behind it lives in
> `docs/analysis/2026-08-30-governed-vs-traditional-deep-analysis.md`.

## The verdict

```
QUESTION 3    replace (specs, contract, T-loop, engine) with the      NO
              traditional mechanism
QUESTION 3.1  reduce looprun to a super-minimal core and give the     YES — with the
              author the traditional loop's freedom on top of it      amendments below
```

NO to 3 because the one uncontaminated pair refutes it: on atlas — identical 100 cases,
identical rubric text, same pass rule — governed scored 92 and traditional 78, with
governed on the harder path (router choosing the desk; the trad runner reads the desk off
the frozen case file). Adopting the traditional mechanism wholesale means adopting the
build that lost the only clean comparison, plus the priced losses (no translatable
vocabulary, no absence-side figure check, no audit, no transferability, no discrimination).

YES to 3.1 — but the attribution numbers reorder the work. The two locks cost 3 of the 13
unpaid points; the ENGINE costs 5, and 4 of those 5 are one component (the ReplyComposer as
a second writer). **The first move is not freeing the author; it is fixing the seam that
writes over the author's paid work.**

---

## The measurement

| figure | where it was measured |
|---|---|
| locks cost 3/13 points; engine 5/13 (composer 4) | harborpoint `test/r12-final-governed/dumps/*`, `atlas-c20/test/2026-08-30-cert` |
| the composer invents/deletes: 364 added on a `facts:[]` call; c20 95/37 required sentences deleted from a clean `finish.message` | the three dumps, re-read by hand |
| `engineClose` runs no reply guard and no judged walk; 12/25 fact-owing harborpoint turns and 53/107 atlas turns close there with NO desk message | red-team count over both certified runs |
| the 8 governed consent questions ALL close engine-side | r12 dump classification |
| judge rows strip `guardName`/`detail`/`finish.message`/`delivery.by` | `eval/src/judge-inputs.ts:33` |
| `NEGATORS` (8 English words) allows “não passou” for `outcome:'passed'` | `core/src/cards/catalog.ts:608,641` + PT probe |
| the system prompt concatenates a ~600-token MUTATING world snapshot after a ~3,300-token frozen head, rebuilt inside the step loop | `core/src/run/turn.ts:239` + `prompt-writer.ts:76-82` |
| three prefixes per governed turn (main, composer, judge) vs one traditional | `reply-composer.ts:28`, `judge.ts:17`, `harborpoint-trad/src/agent.ts:86` |

## The design

### D1 · Owed facts gate the desk's own message (the trad mechanism, one stage earlier)

`call-runner.ts:115` already mints per-verdict owed text (`Act.sentence` reaches the model).
What is missing is the CHECK: `assembleFacts` runs at `turn.ts:402`, AFTER the redrive loop
closes at `:387` — so owed facts today gate only the composer's rewrite, through a
presence-only `gateMisses`.

```
TODAY  finish.message → [no owed check] → composer (2nd call, 2nd prefix)
                       → gateMisses(composed)          presence-only, facts:[] = vacuous
D1     finish.message → gateMisses(facts, message) as a violation
                       → redrive the SAME model on the SAME prefix
```

Micro-tested against the real dumps: the existing figure walk applied to the DELIVERED text
catches the 364 case (`finish.message` CLEAN · delivered UNGROUNDED). The walk uses
`figureRuns`/`canonicalAmount` already in `catalog.ts` — no new vocabulary, no regex.

### D2′ · The composer is DELETED — the desk writes the close too (measured)

12 of 25 fact-owing harborpoint turns (53/107 on atlas) have `finish.message === ''` —
consent questions and retry exhaustion close engine-side. The first design kept the
composer there ("no desk message exists, someone must write"). Microtest-6 measured the
alternative the owner asked for: give the DESK one more turn in its OWN conversation —
"the desk holds: [act sentences + numbered facts + the held code line]; write the
closing reply" — and charge that output through the FULL ruler funnel. Head to head on
15 path-B turns (consent · retry-exhaustion · the 364 replay · the deletion replay ·
the seeded fact-id redrive):

```
                          composer (cold own prefix)     desk close-step (warm prefix)
 delivered as prose            11/15 — FLOORED 4          15/15 — floors 0
                               (an ENGLISH record line
                               to a Portuguese operator)
 invented figures              2940 invented 3/3 first    0/3
                               tries (walk caught, 1
                               still floored)
 truthful act report            6/12                      11/12
 cost per close                23 calls · 851 COLD tok    18 calls · 445 NEW tok
```

The composer's defect is structural, not tunable: its act report is a claim about a
conversation it was never in. So it dies EVERYWHERE — tryFinish (D1 gates the desk's own
message) and engineClose (the desk's close-step, same conversation, full funnel, redrive
to itself). The second model prefix leaves the engine entirely. Two implementation notes
the measurement wrote: the close instruction FORBIDS bracketed codes in prose (the desk
stapled `[F1]` tags into the operator's sentence and floored), and the close call KEEPS
the tool cards in the request — dropping them shortens the prompt but moves the very
prefix the warm arm exists to reuse. The seeded fact-id redrive (microtest-3's untested
arm) fired 6/6 and fixed 6/6 on both writers — the D1 repair arm is proven.

### D3 · The frozen-prefix prompt layout (question 3.2)

```
+============================================ FROZEN PREFIX (one string per desk, forever)
| [A] identity + standing laws        persona, house laws
| [B] other desks                     one line per teammate, sorted
| [C] desk rules                      every guard rule, sorted by guard name
| [D] tool cards                      ALWAYS the same shape: [return, ...tools, finish]
+============================================ nothing below ever moves above this line
| [E] turn history                    append-only, never rewritten, never reordered
| [F] this turn's operator message
| [G] STATE + open questions          the LAST user message, rebuilt each step
| [H] correction / must-state         appended AFTER [G], never spliced into the prefix
+============================================
```

The three edits that produce it:

1. `turn.ts:239` becomes `system: pw.system()` — `PromptWriter.frozenSystem` already
   exists; the concatenation at the call site defeats it.
2. `pw.tail(...)` (STATE + open questions) moves into the LAST user message — same bytes,
   different position: re-prefill starts at [G] instead of [A].
3. The tool block stops changing shape: always emit the return card and let `RETURN_CLOSED`
   refuse when the door is shut (the `returnable` branch today makes two prefixes for one
   desk).

Never injected mid-prefix: the world snapshot, minted question codes, turn counters,
timestamps, case ids, retry counters, masked-literal renderings, a tool card added or
removed mid-session, a must-state list (it goes in [H]).

Known seam the acceptance test must carve out explicitly: the owed-read micro-step presents
a single tool (`turn.ts:187 tools:[card]`) — it is a deliberate one-step fork and is
documented as such, not silently exempted.

Acceptance: extend `promptProof` to assert the system string AND tool-card array are
byte-identical across every step of every turn; then one local llama.cpp run measuring
prefill tokens per turn. **Prerequisite the red-team caught: `cache_prompt` appears nowhere
in `packages/` and the only tier sets `slots: 2` — the client must first pass
`cache_prompt: true` and `-np 1` per `local-performance.md` laws 1 and 5, or the
measurement times the box, not the layout.**

### D4 · Free prose under a shrunken emitter — RULED

The measurement drew the line for us (microtest-5: 16 of 28 hand-edit mutations pass the
net silently, and everything made of WORDS passes on both paths). So the split is not
"author edits TypeScript" — it is: **structure stays closed where erring is silent;
sentences go free where no defence ever existed.** The workflow does not change shape:
the author edits `declaration.yaml`, runs the emitter, and `cards.ts` stays GENERATED —
never hand-edited.

```
 declaration.yaml (the one authoring surface)
 ┌────────────────────────────────────────────┐
 │ CHECKS — closed, factory-only              │──► emit ──► cards.ts, generated,
 │   pairing · slots · against-surface        │  (smaller)  never touched by hand
 │   ("did you mean") · rule+deny minted      │
 │   from the same params · FOUR NEW          │
 │   factories for the no-rung shapes:        │
 │   argument-reading precondition ·          │
 │   operator-OR-record disjunction ·         │
 │   argument-vs-record compare ·             │
 │   precondition∘onlyAfter composition       │
 ├────────────────────────────────────────────┤
 │ PROSE — FREE (the change)                  │
 │   walls, refusal sentences, questions,     │
 │   persona, disclosure sentences: the       │
 │   author's own words, no minted skeleton,  │
 │   no selector, the six voices demoted to   │
 │   advisory. The emitter carries the        │
 │   sentences verbatim; it stops policing    │
 │   sentence SHAPE                           │
 └────────────────────────────────────────────┘
```

What still holds the free prose (each proven necessary by a measured escape): the
unfilled-`<slot>` refusal and `needs` wiring stay as-is; the word-list lint (M09 fixture
red) and the world-id-literal lint (M10 fixture red) land BEFORE the freedom; `covers:`
STAYS on governed subjects — it is the only guard-deletion tripwire — and is stripped
only from exams handed to traditional builders; the subject ships a strict tsconfig;
`certify()` refuses a run whose repair touched a `split:'held-out'` id. The other two
freedoms ride unchanged: checked must-state redrives are D1 itself, and the
tool-result annotation (`label()`, field NAMES only) lands at the mask seam
(`call-runner.ts:305`).

### D5 · The small, load-bearing repairs that ride along

| repair | why |
|---|---|
| delete `NEGATORS` (`catalog.ts:608`) — remove the list, never multiply it per language | live standing-law breach, measured wrong verdict on PT; FIRST if anything slips |
| `choiceFromUser` keeps its NAME and loses its behavior: a coded value is licensed only by an exact-alone echo against an open question the desk raised — the ConsentDesk mechanic generalized to choices. The desk presents the options in the OPERATOR'S language (its own prose, prose-reader-guarded); the engine matches only the echoed token, and the echo CARRIES THE QUESTION'S MINTED CODE — a bare option digit false-accepts a stray "2" answering something else (2/6 measured); token + code took 0/6. No guard ever matches a word — declared or not — against the operator's prose | term-matching is language-bound by construction: an English-declared agent refuses lawful acts in every other language ("a triagem passou" carries no declared term). Digits and echoed literals carry no language |
| judge rows carry `guardName`, `detail`, `finish.message`, `delivery.by` | the direct fix to the T-loop author's blindness (Q2.1) — one mapping line |
| `references/engine-seams.md` in the skill, NAMING delivery/correction/judged stages | `grep composer skill/` = 0 today; the author cannot diagnose a stage that has no name |
| judge becomes opt-in per desk and reuses the main prefix (question as last user message) | zero judged guards are declared in any of the three subjects; its own system+full-history shape is the most cache-hostile in the engine |
| `git init` + `seal()` on both governed subject trees | the audit advantage exists as verbs and is currently unexercised |

## The strategy (question 3.3)

**Evolve `looprun` + split `agentspec`. No new repo.** What survives is ~8,300 lines of
tested engine (`core` + `eval`) plus a SMALLER `emit` (the sentence-shape policing leaves;
factories, pairing, slots and `checkAgainstSurface` stay — microtest-5 proved that half is
the emitter's irreplaceable value). What dies is the skill's skeleton-teaching half.
Pre-1.0, compatibility is never a constraint.

```
#  STEP                                          ACCEPTANCE
1  NEGATORS deleted TOGETHER WITH the            existing guard tests + the PT probe +
   choiceFromUser ask-then-echo swap — ONE       the microtest-choice scenario table
   commit; deleting the list alone turns an      (ask-then-echo 14/14 right across
   English negation into the OPPOSITE            pt/en/jp vs 1/7 for term-matching;
   licensed value                                strict exact-alone echo, never relaxed)
2  D1 gateMisses into tryFinish + delivered-     harborpoint r12 slice: the 5 rotating
   text figure walk on both paths                failures ARE the test
3  D2′ composer DELETED everywhere;              consent turns deliver prose (microtest-6:
   engineClose becomes a desk close-step         15/15 vs the composer's 11/15 with 4
   in the same conversation, full funnel;        English floors); floorDeliveries stays
   reply-composer.ts removed                     ~flat; the close instruction bans
                                                 bracketed codes; tool cards stay in
                                                 the close call
4  D3 prompt layout (own commit, never bundled   promptProof extended to cross-step
   with 2/3 — attribution dies otherwise)        byte-identity; llama.cpp prefill run
                                                 after cache_prompt + -np 1 land
4b prompt bytes −50% (looprun BACKLOG row 1      prefill tokens/turn re-measured after
   enters the program HERE) — content            step 4's layout figure; the regression
   reduction only after the layout is            slice re-runs (content moves the score;
   measured, NEVER in the same commit            layout must not) — a cut that costs a
                                                 point is not a cut
5  D5 judge-row enrichment + engine-seams.md     re-run one governed T2 round; the author
   in the skill (split PREPARED)                 can now NAME a composer failure
6  D4 emitter SHRUNK (prose skeletons, the       gate green; word-list + world-id lints
   selector and the six-voice mandate leave;     red on the M09/M10 fixtures; the M03
   free sentences in the declaration) + the      "did you mean" refusal still fires;
   4 new factories + word-list/world-id          subject tsconfig strict; author.md
   lints + subject tsconfig + author.md, ONE     teaches free prose + factory-only
   commit (split COMPLETE — declare.md and       checks — exactly what this step creates
   the ladder chapters merge into it)
7  REGRESSION tier (validates the engine,        harborpoint: the 5 rotating failures
   steps 1-4b) — the three sealed subjects       are the target — final ≥ 28 with the
   re-run AS AUTHORED, in their existing         5 paid; trialworks 29/29 HOLDS (any
   homes, on the new engine build (each          drop is a defect, not variance);
   subject's pin updated deliberately, the       atlas-c20 routed hundred ≥ 92 — and
   update recorded; rollback = the               3× on BOTH columns before any
   pre-minimal-core-2026-08-30 tag)              92-vs-78 claim is repeated
8  BLIND tier (validates the skill, after        the whole pipeline from zero per the
   step 6): ONE from-zero atlas author           standing law (blind = new scaffold,
   (c21) under author.md — new subject           new cX), ladder 12→40→100 judged at
   folder in agentspec-bench, no reuse of        each checkpoint, T-loop to close,
   c20's declaration                             then T3 ungoverned + certification:
                                                 strict score ≥ 92 and the
                                                 governed-vs-ungoverned gap holds
```

The three subjects: harborpoint is the acceptance test (re-run, never re-authored);
trialworks and atlas re-run as the step-7 regression tier. No re-authoring, no new
subject until the ladder above is green — the one new subject is step 8's blind c21.

ISOLATION (ruled): everything stays where it lives. atlas c20 (regression) and c21
(blind) in `agentspec-bench/subjects/` — c21 in its own new folder, runs under
`test/<date>-<name>/` as always; harborpoint and trialworks in their own trees, with
`git init` + `seal()` (D5's order). Each subject pins its engine copy; a pin update to
the new build is DELIBERATE and recorded per subject, never implicit. The whole
program's rollback is the `pre-minimal-core-2026-08-30` tag on all three repos.

## Risks (red-team verdicts, post-amendment)

| risk | verdict after amendment |
|---|---|
| composer deletion ships record dumps on consent turns | CLOSED by D2′ (measured, superseding the narrowing): the desk's close-step delivered 15/15 path-B turns where the composer itself floored 4 — the record-dump harm belonged to the composer's arm, not the deletion's |
| llama.cpp acceptance unrunnable as first written | CLOSED by the D3 prerequisite |
| free guard code re-opens the word-list door | HELD by declared-data-only vocabulary + the lint fixture; residual: a determined author can still hide a list — review catches what lints cannot |
| held-out tripwire unbindable on free prose | HELD by the world-id lint + separate held-out scoring; residual real |
| D1 redrives spend the same `retries` budget that already exhausts into engineClose | OPEN — measure on the r12 slice; raise `limits.retries` only if the slice shows starvation |
| the whole case rests on one run per side | OPEN — re-run both sides of atlas 3× before calling 92-v-78 settled |
| an unannounced flip between two LATIN-script languages mid-case: the re-ask can follow the old language (microtest-4: the ask-in-latest-language prompt line buys 16/20 right questions at zero cost, but "the second one, please" after a Portuguese case still re-asks in Portuguese; script flips and announced flips all hold) | ACCEPTED as a documented limit — the licence itself is never wrong (12/12), only the question's language; the engine's own trigram check shares the blind spot (cannot split fr/pt or zh/ja), so no mechanical escalation exists inside the standing laws |
| hand-written cards.ts is the format the emitter was CREATED to take away from the author — the declared path exists because agents erred it | MEASURED (microtest-5, 28 mutations): the net catches 12/28 — and only 9/28 in the subject's real environment, which ships NO tsconfig. Silent-green classes: words-vs-code divergence (a check flipped to its opposite under an intact sentence), guards that bind nothing (a one-letter tool-name typo in `onlyAfter`), every guard deletion no case covers, an inline word LIST (the regex sibling IS caught), a world id in a rule sentence, `destructive: 1→3`. RESOLVED BY RULING (2026-08-30): the emitter is NOT retired — it SHRINKS (D4 as now written): cards.ts stays generated and never hand-edited; sentences go free in the declaration; checks stay factory-only with four new factories for the no-rung shapes; `checkAgainstSurface`, `covers:` on governed subjects, the word-list + world-id lints and a strict subject tsconfig all hold the line the measurement drew. The four preconditions are folded into step 6's acceptance |
| the omitted-sentence class: the composer PAYS it today by pasting owed facts; the desk DROPS it (microtest-d1 case 08: composer stated "no damage claim was opened" 2/2, desk 0/2, every byte-ruler clean — the fact's only literal was already carried by another sentence) | CLOSED by measurement (microtest-3): owed facts are NUMBERED and the structured report enumerates the fact ids it expressed — 0/5 → 5/5 on both omission shapes, zero extra calls, zero cheats over ten runs; a sampled judged question audits marked facts (17/20, 0 false accepts). Verbatim append REJECTED: it pasted a fact about an act that never ran (2/5) and the language ruler cannot see it. Residual: the fact-id redrive never fired in the sample — proven at step 2's slice |

## The four sections (stone rule), mapped

| section | where it lives when this ships |
|---|---|
| the measurement | this file + the analysis doc, run dirs named |
| the implementation | steps 1–6 above, each with its acceptance test; diffs land per step |
| the documentation | README floors/composed-reply sections, tutorial 04, source headers of `turn.ts`/`reply-composer.ts`, blueprint amendment |
| the skill | `author.md` (merged declare + ladder), `engine-seams.md` (new), `test.md` failure-reading table pointing at the enriched judge rows — same working session as the engine change |
