# The minimal core under a freed author — technical proposal

> **CLOSED — 2026-09-01.** Steps 2–6 live in `packages/*`, step 1 is superseded by the C2
> choice-gate removal, and the two live remainders are BACKLOG rows 1 (step 4b) and 8 (the
> local measurement).

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

### D3 · The prompt layout — MEASURED, and the freeze is REFUTED

Microtest-7 (llama.cpp, ram24 tier, ruler verified 4,069 → 4 tokens on an identical
prompt) measured the three layouts over the same 8-turn conversation:

```
                                total prefill    vs AS-IS
 AS-IS (STATE inside system)         7,481         1.00×   ← WINS
 append-only (stale STATEs stay)    13,042         1.74×   + unbounded growth
 STATE-last (the original D3)       48,641         6.50×   ← refuted
```

Why: the server's cache-reuse window has a cliff a few hundred tokens from the END of
the prompt. A 776-token STATE parked last puts every newly appended token on the wrong
side of it; STATE at a FIXED position inside the system head diverges only when STATE
actually changes (writes: ~900-1,250 re-prefilled; reads: ~50). Today's `turn.ts:239`
is already the cache-optimal shape of the three.

What survives of D3, each measured or still owed:

```
 KEEPS    cache_prompt: true + -np 1 wiring in packages/models — load-bearing
          (without them NOTHING caches); the owed-read micro-step fork is
          survivable (costs ~one prefill; the main loop's cache survives it:
          returns at 1,232 vs 4,380 cold)
 DROPS    moving STATE out of the system block; the shared-[A] cross-desk
          ordering (measured: bought exactly ZERO on a desk switch — the cache
          is per-sequence, not per-block)
 OWED     the pinned tool array (the returnable two-shapes fix) — unmeasured;
          small, test at implementation
 THE REAL cache lever is now step 4b: a smaller STATE shrinks the write-turn
          re-prefill linearly — prompt −50% pays where the layout could not
```

Unmeasured caveat carried from the report: the append-only arm's CORRECTNESS (the
model ignoring stale STATE blocks) was never judged; irrelevant now that the arm lost
on cost too.

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
| judge becomes opt-in per desk; the DEDICATED prefix STAYS (microtest-11 refuted the main-prefix ride: 17/24 vs 23/24 — the warm judge answered NO to 7 of 12 real breaches, EVERY one a case of convicting its own reply, and appended the desk's REPORT line to all 24 verdicts; contamination never appeared; the ~30-vs-350 token saving is real but buys wrong verdicts) | zero judged guards are declared in any of the three subjects, so opt-in costs nothing today; untested middle if the cost ever matters: a separate call reusing the desk conversation with the system swapped for the check turn only |
| `git init` + `seal()` on both governed subject trees | the audit advantage exists as verbs and is currently unexercised |
| INJECTION (measured, microtest-10): every record-borne plant held 32/32 in BOTH languages under the house law alone — `label()` ships as the structural belt (zero extra calls, zero false positives on the benign control; its margin over the bare law is a FLOOR, unmeasured, since the baseline lost nothing); `injectionCheck` as a standing per-turn cost is SKIPPED (+14 calls over 12 turns, changed no outcome — the r9 economics confirmed). The c20-62 class (the plant inside the OPERATOR'S OWN argument) is unreachable by all three defenses — 2/2 obeyed everywhere; its home is the PRE-TOOL consent seam (the engine's held destructive act), not any post-reply reader | the last unmeasured risk row closes; do not resurrect a per-turn judge for this class |
| the TAPE LAW (measured, microtest-9): the window-2 rewrite (`turn.ts:152-159`) dies — it costs 2.02× the prefill of append-only and bought nothing; the tape is APPEND-ONLY (decide at seal time whether act sentences are carried; never delete written bytes). Compaction is BUDGET-triggered, never fixed-count (8/4 spacing cost 5.8% MORE than nothing at 24 turns: the saving tracks tape length through write acts — compact when the next write would cost more than a checkpoint). A summary preserves every tool-returned id VERBATIM and never upgrades a refused proposal into a fact — the dropped-facts arm answered a memory probe with a DIFFERENT REAL booking id and staged a wrong act on it | BACKLOG row 1's pruning addendum now has its measured shape; caveat: teeth rest on one probe in one arm — the full ruler is step 4b's. SCOPE: the cache half of this law rides the PREFIX mechanism and holds wherever prefix caching exists (local llama.cpp; cloud providers with prefix caching); on gemini flash-lite the implicit cache was measured NOT engaging (0% over ~1,000 calls, 4 byte-identical prompts uncached), so there the compaction half is the only cost lever; the summary laws (ids verbatim, refusals never become facts) are correctness laws and hold everywhere |

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
4  D3 (as measured): cache_prompt + -np 1        unit-level ONLY in this run: the flags
   wired in packages/models; the LAYOUT          present in llamacpp.ts args and passed
   STAYS AS-IS (microtest-7 refuted the          on every /completion. The LOCAL
   freeze: AS-IS 1.00× · append-only 1.74× ·     measurement (prefill ruler, tokens/s,
   STATE-last 6.50×)                             RAM, tool-array pinning) is DEFERRED
                                                 to BACKLOG row 8 — no local server in
                                                 the execution run (ruled)
4b prompt bytes −50% (looprun BACKLOG row 1      the byte rulers (bench _step/_anat/_dup
   enters the program HERE) — content            tests, no model, no key) + the judged
   reduction, NEVER in the same commit           regression slice on gemini — a cut that
   as step 4                                     costs a point is not a cut. Local
                                                 prefill re-measure: BACKLOG row 8
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
