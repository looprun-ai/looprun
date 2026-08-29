# The Lint Program — Every Feasible Check Behind Every Teaching

**Status:** DRAFT — pending owner review
**Position in the program:** by the owner's ruling, the recovery program advances only
after this spec's gaps are resolved — F5's remaining rows, F5b (the from-zero c20) and
F2 run behind it.
**Source:** `agentspec/docs/analysis/2026-08-29-skill-teachings-and-lints.md` — 400
teachings read one by one; 107 rows where a lint is feasible and missing. This spec
converts every feasible row into a built check or a written WONTFIX with its reason;
JUDGMENT rows (99) are out of scope by definition, EXAM-LETTERS rows (24) belong to
the campaigns.

---

## 1 · The measurement — what the gaps cost

The trial blind run is the proof in miniature: the emit accepted its declaration in
one round and the gate ran green while two of four conduct teachings were silently
dropped — no layer had eyes for them. The inventory generalizes it: 43% of teachings
have a machine behind them; teachings about a file's SHAPE are refused by name and
line, teachings about CONTENT are measured only where an exam case reads them, and
teachings about PROCESS are guaranteed by nothing. The worst single row: a skill page
asserts three gate verbs that do not exist in the engine.

## 2 · The waves

### Wave A — pages that assert what is not there (the lies end first)

| gap | the fix |
|---|---|
| #1 `norms.md` N6 names `conductComplete`, `readsOrdered`, `requiredReadsDisclosed` — none exists | build `conductComplete` (Wave B pays it); REWRITE N6 to name exactly the verbs the engine exports, no more; `readsOrdered`/`requiredReadsDisclosed` are built only if a Wave B fixture shows their absence costing a case — otherwise they leave the page |
| #4 the reference gate and the N6 snippet do not typecheck | regenerate `references/check-subject.test.ts` from `writeGateFile()`'s real output; the N6 snippet becomes a compiled fixture |
| #5 `spec-template.ts` never compiled; ships a description advertising verbs its lane lacks and a conduct law naming a desk that does not exist | `tsconfig.json` + `typecheck` in the skill gate; fix both live defects; the routing-line lint (Wave B) then guards the template too |
| #20 orphan pages (`judge-ruler.md`, `local-performance.md`), Lesson 17 missing | a link-graph + numbering check in the skill gate; the pipeline pages point at the judge ruler |

### Wave B — content lints in the emit (the declaration's substance)

Each lands RED on a fixture showing the defect, then green; each refusal names the
YAML path.

| gap | the lint |
|---|---|
| #2 conduct completeness | every desk of a multi-desk declaration carries all six named voices; a missing voice is refused by desk and name |
| #6 record-opening acts owe the asked-for law + `disclosure.after` | every act the world card marks as creating a record carries a `prose` guard licensed `conduct` and an `after`; refused by act name |
| #7 an `after` with no `{result.` slot | one check per declared `after` |
| #8 `valueFromUser` on an optional argument | the schema's `required` list is already in hand; the pairing is refused |
| #9 duplicate guard names | refused at `readGuards` |
| #10 `empty` carrying an `{alias.` root | `empty` renders with `{args}` only |
| #11 `choiceFromUser` terms where one value's word is a substring of another's | pairwise check over the declared terms |
| #19 `figureIsGrounded` missing from `FLOOR_NAMES` | added to `floorRedeclared` |

### Wave C — the gate grows eyes

| gap | the fix |
|---|---|
| #3 `seamSpoken` exists and `runGate` excludes it | wired as a budget line beside the gate: the findings print with the run, and a seam the exam drives into (a case's preset reaches the code) FAILS; a code no case reaches stays a warning |
| #18 the stamp covers `declaration.yaml` only — a hand-edited `cards.ts` keeps the gate green | the stamp hashes the emitted files too |
| #15 ≤15 tools per desk, card bytes ≤ 2× prefix | two numeric comparisons in the gate |

### Wave D — process instruments (scripts in the skill gate, not emit refusals)

| gap | the instrument |
|---|---|
| #12 a degraded run never certifies | `certify` reads `MONITOR.md` beside the run dir and voids on an alert |
| #13 panel bars (order, verification, staleness) | a `PIPELINE.md` grammar parser in the skill gate |
| #14 thinking logs exist with their four sections | a directory + heading check |
| #16 no key in a tracked file | key-shaped-literal scan in both repos' gates |
| #17 no external model, ever | provider-hostname scan in both repos' gates — the first law gets its backstop |

### The remaining 87 rows

Most roll into #13/#14's families (a panel row, a thinking-log row, an
artifact-existence row) and are paid by those instruments. The implementation plan
enumerates every one of the 107 with its verdict: BUILT (naming the check) or WONTFIX
(with the written reason). No row closes silently.

## 3 · The implementation

Engine side: `packages/emit/src` (Wave B refusals), `packages/eval/src` (Wave C gate
verbs + `conductComplete`), each with its red-first fixture. Skill side: the gate
script grows `typecheck`, the link-graph, the panel parser, the log check, the two
scans (Waves A and D); pages rewritten where they lie (N6, the snippets, the
template). Bench: regeneration of the stamped gates where the stamp's coverage
changes.

## 4 · The documentation

The inventory doc gains a `closed by` column as waves land. `norms.md` N6 is
rewritten to the true verb list. Every page whose teaching gains a check keeps its
sentence — the check enforces it, the sentence still teaches it.

## 5 · The skill

The skill edits ARE this spec's Waves A and D (its pages and its gate). They land in
the same working sessions as the engine lints they describe — a page never names a
verb before the verb exists.

## 6 · Validation

Every lint: one fixture that is WRONG in exactly the taught way → the lint goes red →
the fix goes green; the trial blind product (archived beside the c19 sweep) is the
standing corpus — Wave B's lints run against it must flag the two teachings it
dropped. The program closes with the skill gate + both repos' suites green and the
107-row table fully verdicted.
