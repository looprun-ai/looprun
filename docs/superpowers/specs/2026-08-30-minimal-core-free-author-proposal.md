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

### D2 · The composer is NARROWED, not deleted (red-team FATAL, accepted)

12 of 25 fact-owing harborpoint turns (53/107 on atlas) have `finish.message === ''` —
consent questions and retry exhaustion close engine-side, where the composer is the ONLY
writer. Deleting it ships the floor's record dump to the operator on every consent turn.

```
KEEP the composer on   engineClose (no desk message exists)
DELETE it from         tryFinish (the desk's own message, once D1 gates it, IS the reply)
ADD on both paths      the delivered-text figure walk + the reply-guard walk that
                       engineClose today skips entirely
```

`readDelivery`'s one redrive keeps its writer on the engine-close path; on the tryFinish
path the redrive goes to the desk itself.

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

### D4 · The freed author, with the laws kept enforceable

| freedom (from traditional) | the guard that keeps it lawful |
|---|---|
| free hand-written prompt per desk (the wall stops being six mandatory voices — they demote to advisory) | the world-id-literal lint: ZERO exam/world record ids in authored text (the governed declaration already passes at zero; the trad leak was 14 ids) |
| free guard code behind one signature (releases the 13-factory ceiling and its four published no-rung shapes) | `purity` (regex stays AST-caught) + **vocabulary stays DECLARED DATA in the subject** (`terms:` blocks), never inline literals in guard code — the only writable line between a declared, translatable term and a hidden word list |
| checked must-state redrives on the same prefix | D1 — this IS the mechanism |
| tool-result annotation (`label()` wrapping untrusted fields) | field NAMES only, never words; at the mask seam (`call-runner.ts:305`) |
| net-positive round rule | `certify()` refuses a run whose repair touched a `split:'held-out'` id; held-out scored separately, always; the exam drops the `covers:` field for every NEW subject (it is the answer key) |

The emitter retires (run once more; its output becomes the hand-owned source, byte-diffed
identical). The declaration survives as the home of `terms:`, disclosures, consent
skeletons and limits — data, not the only licence.

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
tested engine (`core` + `eval`); what dies is 2,286 lines of `emit` and the authoring half
of the skill. Deleting inside a repo is a commit; recreating the survivors is a campaign.
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
3  D2 composer narrowed to engineClose;          consent turns still deliver prose;
   reply-guard walk added there                  floorDeliveries stays ~flat (watch it,
                                                 not framesLeaked — floor is exempt there)
4  D3 prompt layout (own commit, never bundled   promptProof extended to cross-step
   with 2/3 — attribution dies otherwise)        byte-identity; llama.cpp prefill run
                                                 after cache_prompt + -np 1 land
5  D5 judge-row enrichment + engine-seams.md     re-run one governed T2 round; the author
   in the skill (split PREPARED)                 can now NAME a composer failure
6  D4 emitter retired, freedoms + lints +        gate green; word-list lint red on a
   author.md in the SAME commit (split           planted SYNONYMS fixture; author.md
   COMPLETE — declare.md and the ladder          teaches exactly the freedoms this step
   chapters merge into it)                       creates
7  Re-certifications: trialworks once after      29/29 holds (any drop is a defect, not
   step 4; atlas full hundred once after 4       variance); 92 does not drop
```

The three subjects: harborpoint is the acceptance test (re-run, never re-authored);
trialworks and atlas re-run once each as regression + certification. No re-authoring, no
new subject until the ladder above is green.

## Risks (red-team verdicts, post-amendment)

| risk | verdict after amendment |
|---|---|
| composer deletion ships record dumps on consent turns | CLOSED by D2 (narrowing) |
| llama.cpp acceptance unrunnable as first written | CLOSED by the D3 prerequisite |
| free guard code re-opens the word-list door | HELD by declared-data-only vocabulary + the lint fixture; residual: a determined author can still hide a list — review catches what lints cannot |
| held-out tripwire unbindable on free prose | HELD by the world-id lint + separate held-out scoring; residual real |
| D1 redrives spend the same `retries` budget that already exhausts into engineClose | OPEN — measure on the r12 slice; raise `limits.retries` only if the slice shows starvation |
| the whole case rests on one run per side | OPEN — re-run both sides of atlas 3× before calling 92-v-78 settled |
| the omitted-sentence class: the composer PAYS it today by pasting owed facts; the desk DROPS it (microtest-d1 case 08: composer stated "no damage claim was opened" 2/2, desk 0/2, every byte-ruler clean — the fact's only literal was already carried by another sentence) | CLOSED by measurement (microtest-3): owed facts are NUMBERED and the structured report enumerates the fact ids it expressed — 0/5 → 5/5 on both omission shapes, zero extra calls, zero cheats over ten runs; a sampled judged question audits marked facts (17/20, 0 false accepts). Verbatim append REJECTED: it pasted a fact about an act that never ran (2/5) and the language ruler cannot see it. Residual: the fact-id redrive never fired in the sample — proven at step 2's slice |

## The four sections (stone rule), mapped

| section | where it lives when this ships |
|---|---|
| the measurement | this file + the analysis doc, run dirs named |
| the implementation | steps 1–6 above, each with its acceptance test; diffs land per step |
| the documentation | README floors/composed-reply sections, tutorial 04, source headers of `turn.ts`/`reply-composer.ts`, blueprint amendment |
| the skill | `author.md` (merged declare + ladder), `engine-seams.md` (new), `test.md` failure-reading table pointing at the enriched judge rows — same working session as the engine change |
