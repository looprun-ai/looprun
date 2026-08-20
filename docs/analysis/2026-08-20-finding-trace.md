# Every surviving finding, traced to the spec

The adversarial pass raised 146 findings — 109 on correctness, 37 on speed. An independent refuter
took each and began by assuming it false. 66 were refuted; **80 survived**. This file maps each
survivor to the spec item that carries it.

```
  146 raised  →  66 refuted  →  80 survived  →  70 IN · 10 OUT
```

The synthesiser consolidated the 80 into 45 numbered items and recorded which went where exactly
once. Three text heuristics were tried against that consolidation and all three failed — the
strongest covered 23 of 45 items and tied on 50 rows. **This map was built by reading all eighty.**

`W1`, `W2` and `W3` are survivors the synthesiser's own fix list never mentions. They are not in
its 45 items; they are here, and they are IN.

`IN` means the item is in the spec's §7.1 register and gets a plan task. `OUT` means §7.2 — real,
verified, and moving no bar.

---

## B3 — IN   ·   1 finding

| # | sev | where | the finding |
|---|---|---|---|
| 24 | high | `references/guard-catalog.md:471-492 (§5), :784-795 (` | guard-catalog §5 and §7 teach a prose rule beside a check as the shipping shape, and `unlicensed()` can never clear it — none of the four licences fit |

## B6 — IN   ·   2 findings

| # | sev | where | the finding |
|---|---|---|---|
| 26 | high | `measured across agentspec-bench/subjects/atlas-next/` | The twenty-fold bar: derivation reaches about nine-fold, and the remaining floor is 2.5-3 minutes set by the sentences a person must read |
| 53 | low | `the whole pipeline, measured against agentspec-bench` | Serial-phase surgery alone reaches roughly 6x, not 20x — the floor is the six personas and the earned sharpenings |

## C1 — IN   ·   1 finding

| # | sev | where | the finding |
|---|---|---|---|
| 8 | high | `references/norms.md:405 (checklist) and :271 (the la` | `EVERY destructive tool has a `before` sentence — no exceptions` is a hand checkbox over a two-line pure function that no shipped check performs |

## C11 — IN   ·   4 findings

| # | sev | where | the finding |
|---|---|---|---|
| 11 | medi | `references/norms.md:341 vs :373` | The N6 copy-paste block cannot run the checklist printed below it: `promptLines` is used and never imported, `pairing` and `profile` are imported and  |
| 28 | medi | `references/norms.md:373-380; engine at looprun/packa` | `echoes` is called without its two thresholds, and returns empty by construction on a short prompt |
| 44 | medi | `references/norms.md:339-393, against the harness the` | The N6 gate is five verbs with three argument shapes and one unstated placement rule, and the skill ships none of the harness — so both 95/100 subject |
| 57 | low | `references/norms.md:339-346 against :355-385 (the ch` | N6's import line pulls two verbs the checklist never uses, and one of them cannot be called from what N6 gives you |

## C12 — IN   ·   2 findings

| # | sev | where | the finding |
|---|---|---|---|
| 58 | high | `references/guard-catalog.md:489-491 and 866-870 vs l` | The catalog says the static gate cannot report an unchecked act; `pairing` emits `ACT_WITHOUT_CHECK` and the gate asserts it empty |
| 61 | medi | `agentspec/package.json:9-12` | Three of the repo's four declared lint scripts point at files that do not exist, so nothing enforces the page laws at all |

## C2 — IN   ·   2 findings

| # | sev | where | the finding |
|---|---|---|---|
| 17 | high | `references/guard-catalog.md:477-486` | guard-catalog §5's `cap.at` path is rooted on a tool name with no `needs` alias declared — the call dies at construction |
| 75 | high | `references/guard-catalog.md:480 vs references/guard-` | `cap.at` is taught with two incompatible path roots; the copy an author reaches while writing guards throws at run time |

## C3 — IN   ·   2 findings

| # | sev | where | the finding |
|---|---|---|---|
| 47 | medi | `references/evals.md:34 and :57 against :129-140; con` | evals.md gives two incompatible formats for `covers`, and the field is read by nothing |
| 71 | high | `references/evals.md:140, restated as a hand read at ` | `covers` is never validated against any guard name — the page names the defect in prose instead of shipping the set-membership check that closes it |

## C6 — IN   ·   1 finding

| # | sev | where | the finding |
|---|---|---|---|
| 59 | high | `references/evals.md:28-46 (the case) against referen` | evals.md's only worked case cannot run: its preset puts the world in the one state its gate refuses, so no question is ever held and the ExamRunner th |

## D1 — IN   ·   1 finding

| # | sev | where | the finding |
|---|---|---|---|
| 77 | medi | `references/guard-catalog.md:576-839 vs norms.md:245-` | Nine of the eighteen lessons are about disclosure tenses and are filed 260 lines from the page that writes them |

## D3 — IN   ·   1 finding

| # | sev | where | the finding |
|---|---|---|---|
| 15 | medi | `references/norms.md:192-193 and references/guard-cat` | Two pages claim they do not restate the guard catalog while restating its routing three times — which is how the four-vs-six conduct count survives |

## D6 — IN   ·   2 findings

| # | sev | where | the finding |
|---|---|---|---|
| 37 | medi | `SKILL.md:84-86 and :96-109 · references/thinking-tem` | The thinking logs and PIPELINE.md are phase artifacts no later phase reads — the 95/100 subject wrote none of them |
| 64 | medi | `references/norms.md:236-241 and references/guard-cat` | N4 orders generated `pairingTable` output pasted into a thinking log that nothing reads, and the hand-written column it promises has no slot in the ge |

## F1 — IN   ·   2 findings

| # | sev | where | the finding |
|---|---|---|---|
| 31 | high | `synthesis over agentspec-bench/subjects/atlas-skill/` | Twenty-fold is reachable, but only by generating the skeleton — the floor is decode of the earned sentences, ~25 s |
| 39 | medi | `agentspec-bench/subjects/atlas-skill/cards.ts (106,9` | The skill-authored card is 2.2x the hand card for the same score, because nothing tells the author when a generated sentence is already enough |

## F2 — IN   ·   2 findings

| # | sev | where | the finding |
|---|---|---|---|
| 65 | high | `agentspec-bench/subjects/atlas-skill/cards.ts:568-57` | The six conduct laws are 36 hand-typed rules; one of them is byte-identical on all six desks |
| 80 | high | `references/guard-catalog.md §2 "The conduct every de` | The conduct block: 72 hand-written paragraphs where the world card's own labels give a template — and the page's "six" became twelve |

## F3 — IN   ·   1 finding

| # | sev | where | the finding |
|---|---|---|---|
| 14 | high | `references/norms.md:341 (the import) and :356 (the c` | N6 asks the author to hand-audit `every ACTING tool carries at least one deterministic check` while importing the verb that answers it and never calli |

## F4 — IN   ·   1 finding

| # | sev | where | the finding |
|---|---|---|---|
| 45 | medi | `references/test.md:38-44, references/check-subject.t` | Three different lists are each called the static gate, and the one NORMS exits on is the one that misses the failures |

## F5 — IN   ·   2 findings

| # | sev | where | the finding |
|---|---|---|---|
| 4 | low | `SKILL.md:76-94; references/ask.md (121), models.md (` | 469 lines across eight pages are on the pipeline path and touch no card; only the shortest page tells you when to open it |
| 73 | low | `references/gen.md:80-84 and :143 · references/guard-` | The rehearsal law is stated in five places, and two of them scope it differently |

## G-D — IN   ·   2 findings

| # | sev | where | the finding |
|---|---|---|---|
| 13 | medi | `agentspec-bench/subjects/atlas-skill/cards.ts:250-25` | A hand-rolled six-line structural cast stands in for an exported type the pages never name as importable |
| 27 | medi | `references/guard-catalog.md:326 and :365-368; refere` | No page anywhere shows a hand-written `deny` — so every author writes one, invents its narrowing, and reads the engine source to do it |

## G-E — IN   ·   1 finding

| # | sev | where | the finding |
|---|---|---|---|
| 55 | medi | `references/guard-catalog.md:878-896 and norms.md:236` | `pairingTable` prints "on a spec, read every turn" for a contract rule that renders in no prompt — the page says the table cannot drift |

## R1 — IN   ·   4 findings

| # | sev | where | the finding |
|---|---|---|---|
| 12 | high | `SKILL.md:47, references/test.md:74, references/test.` | "Holding across two runs" is enforced by nothing, and `certify` reports the union of failures, not the repeated ones |
| 32 | high | `SKILL.md:47 and references/ship.md:12,33; engine at ` | The certification bar is 0.95 in SKILL.md and 0.85 in the code SHIP tells you to run |
| 48 | high | `references/ship.md:12 and 33 (vs SKILL.md:47, test.m` | ship.md's only certify call uses a 0.85 bar; SKILL.md and test.md say the bar is 0.95 and holds twice |
| 70 | high | `SKILL.md:47 · references/test.md:73-75 · references/` | The certification bar is stated in three homes with two different numbers and two different hold counts |

## R10 — IN   ·   4 findings

| # | sev | where | the finding |
|---|---|---|---|
| 1 | high | `SKILL.md:102-109 (panel template) vs SKILL.md:40,42 ` | G3 and N6 have no cell in the panel, so resume can never reach them — and gen/SEAM.md is a hard input to N4 |
| 5 | low | `SKILL.md:103 against SKILL.md:39 and references/ask.` | The panel template orders the ASK sub-stages A5·A6·A7; SKILL.md and ask.md both order them A7·A5·A6, and the order is what makes A7 bind |
| 49 | medi | `SKILL.md:102-109 (vs SKILL.md:40-43)` | The PIPELINE.md panel template drops three sub-stages the pipeline table declares |
| 79 | high | `SKILL.md:102-109 against SKILL.md:40,42 and referenc` | The PIPELINE.md panel template has no N6 row and no G3 row, and resume.md treats the panel as the authoritative run state |

## R13 — IN   ·   2 findings

| # | sev | where | the finding |
|---|---|---|---|
| 22 | medi | `skill/references/norms.md:12 ("Inside the phase, N2 ` | N1 → N2 is a false serial link: the contract depends on the business and the world, never on the split |
| 46 | high | `references/norms.md:57; producers are references/gen` | N1's declared input `gen/WORLD-MODEL.md` is produced by no stage in the pipeline |

## R14 — IN   ·   1 finding

| # | sev | where | the finding |
|---|---|---|---|
| 25 | high | `SKILL.md:78-80 against SKILL.md:41,43 and references` | 'Running it' launches EVALS in parallel with NORMS, which evals.md says is impossible — and nothing catches the exam it produces |

## R15 — IN   ·   2 findings

| # | sev | where | the finding |
|---|---|---|---|
| 29 | medi | `references/ask.md:15 against references/models.md:49` | ASK's RAM-tier list drops ram32, so a 32 GB+ machine is recommended the wrong quant |
| 63 | high | `references/ask.md:29-30` | The option-label rule is stated in Portuguese, so the rule that generates every ASK label teaches a non-English literal |

## R2 — IN   ·   2 findings

| # | sev | where | the finding |
|---|---|---|---|
| 10 | medi | `references/guard-catalog.md:228 and :233-238; norms.` | The pages contradict themselves on the conduct-law count, and the contradiction shipped as a false line in the subject's own signed gate |
| 69 | high | `references/spec-template.ts:86 and :116 (the templat` | Four conduct laws or six — the template writes four, one norms.md section demands four by name, and norms.md's own N6 checklist fails a desk that has  |

## R3 — IN   ·   7 findings

| # | sev | where | the finding |
|---|---|---|---|
| 7 | high | `references/spec-template.ts:57-64 (declared inside `` | `noSpeciesGuessing` is the one shape guard-catalog says never to write, and its own trailing comment claims the opposite of both its code and the rend |
| 9 | high | `references/spec-template.ts:57-64 against references` | The template puts a prose rule on the CONTRACT with no tool — the one shape every other page forbids — and its comment says it is on a spec; `pairing( |
| 18 | high | `references/spec-template.ts:61-63, inside `NURSERY_C` | The card template SKILL.md hands the drafter puts a prose rule on the contract with no tool — the exact shape three other pages forbid, and the static |
| 23 | high | `references/spec-template.ts:66-72 (the disclosure) a` | The template's disclosure refuses `discardPlant` on exactly the record its own `noSpeciesGuessing` rule was written for, and tells the operator the pl |
| 56 | medi | `references/spec-template.ts:83 (the lane) and :80-10` | The template's `care` desk carries a write with no deterministic check, against N6's first exit line |
| 60 | high | `references/spec-template.ts:41-48 and :61-63` | spec-template.ts fails two of the engine lints the skill's own N6 gate requires to be empty |
| 74 | high | `references/spec-template.ts:41-48 and :61-63, refere` | The template the skill hands you fails the skill's own gate the moment it is copied — 7 findings on a 2-desk copy, 139 on a 6-desk one |

## R4 — IN   ·   5 findings

| # | sev | where | the finding |
|---|---|---|---|
| 16 | high | `references/spec-template.ts:38-48 against references` | spec-template.ts's WHY map licenses five rules the file never mints and licenses none of the seven it does — `unlicensed()` returns 7 findings on a ve |
| 19 | high | `references/spec-template.ts:41-48 (the WHY map) and ` | The format template a drafter copies is RED under the two lints the skill mandates — its WHY map is a hand-maintained duplicate of a set `unlicensed() |
| 20 | medi | `references/spec-template.ts:39-48 vs the `prose(...)` | The template's `WHY` map names five rules no `prose(...)` mints and omits every one it does — the second statement of each rule's name, drifted |
| 35 | high | `references/spec-template.ts:38-48 vs the `prose(...)` | The template's `WHY` map names five rules that do not exist and omits four that do — seven `PROSE_UNLICENSED` findings against a gate that demands zer |
| 66 | high | `references/spec-template.ts:41-48 (the WHY map) agai` | The template's WHY map licenses five rules that do not exist and omits four that do — `unlicensed()` returns 7 findings on the file N6 says must retur |

## R6 — IN   ·   1 finding

| # | sev | where | the finding |
|---|---|---|---|
| 52 | high | `references/gen.md:159 and :180, references/guard-cat` | Five places tell the author to write a gate's `detail`; the engine's `Gate` type has no such field and TypeScript rejects it |

## S1 — IN   ·   2 findings

| # | sev | where | the finding |
|---|---|---|---|
| 38 | high | `SKILL.md:21-29 (also references/gen.md:23, reference` | The prescribed file layout is one the loader never opens — `subject.ts` and `subjectWorld` appear nowhere in the skill |
| 51 | high | `SKILL.md:21-29 (vs looprun/packages/eval/src/subject` | The four files SKILL.md says the pipeline produces are not the files SubjectLoader reads — a subject authored to the letter cannot load |

## S3 — IN   ·   3 findings

| # | sev | where | the finding |
|---|---|---|---|
| 2 | high | `references/gen.md:152-197 (G3 + 'When the digest is ` | The surface interview is a hand walk of 91 KB and 239 `fail(...)` sites that a twenty-line verb could extract |
| 30 | high | `references/gen.md, section "G3 — the seam"; the arti` | G3's seam table: 91 refusal rows transcribed by hand from 65 grep hits |
| 72 | high | `skill/references/gen.md:176-197 · agentspec-bench/su` | G3 (SEAM) is ordered before NORMS but was authored after it, and its widest column duplicates `pairingTable`, which the engine derives |

## S4 — IN   ·   2 findings

| # | sev | where | the finding |
|---|---|---|---|
| 40 | high | `references/evals.md:134-137` | evals.md's three `covers` examples use prefixes no factory mints, and the page itself says nothing validates them |
| 76 | medi | `skill/references/evals.md:19-24 and :140-142` | E1b waits on N4 for guard names that are a deterministic function of (factory, tool) and could be minted at skeleton time |

## S5 — IN   ·   1 finding

| # | sev | where | the finding |
|---|---|---|---|
| 33 | medi | `looprun/packages/eval/src/lints.ts:483-531 (`unlicen` | The WHY map the static gate requires is absent from BOTH 95-scoring subjects — 138 and 74 findings — because it is name-mirroring bookkeeping nobody c |

## U3 — IN   ·   1 finding

| # | sev | where | the finding |
|---|---|---|---|
| 62 | high | `references/norms.md:62 against norms.md:63-64,68-74;` | "≤ 15 tools per agent" has no source, no lint, and contradicts the three bullets printed under it |

## W1 — IN   ·   1 finding

| # | sev | where | the finding |
|---|---|---|---|
| 21 | low | `references/evals.md:74 and references/guard-catalog.` | "An invariant names the REQUIREMENT, not one path to it" is a verbatim heading in two files, worked twice |

## W2 — IN   ·   1 finding

| # | sev | where | the finding |
|---|---|---|---|
| 41 | low | `references/gen.md:61-62 vs packages/core/src/world/w` | gen.md's form/argument line omits `make`, the one form whose argument is not the target |

## W3 — IN   ·   1 finding

| # | sev | where | the finding |
|---|---|---|---|
| 78 | medi | `references/norms.md:301 and :325 vs references/guard` | The unfillable-tense law is unconditional in one home and conditional in the other; the engine agrees with the conditional one |

## R11 — OUT   ·   1 finding

| # | sev | where | the finding |
|---|---|---|---|
| 68 | medi | `references/norms.md:143 against references/guard-cat` | Six status words or five: norms.md and guard-catalog count two different vocabularies as if they were one |

## R12 — OUT   ·   2 findings

| # | sev | where | the finding |
|---|---|---|---|
| 3 | high | `references/resume.md:22-25; the target is agentspec/` | The stale-set derivation points at `docs/pipeline.md`, a file outside the skill that describes a different pipeline |
| 67 | medi | `references/resume.md:23, 31, 32 against skill/script` | resume.md re-validates against four artifacts and steps that exist on no other page |

## R8 — OUT   ·   1 finding

| # | sev | where | the finding |
|---|---|---|---|
| 54 | medi | `references/test.md:30 vs looprun/packages/eval/src/f` | test.md's verb table gives `sync` the wrong arity — `sync(runDirs)` throws a TypeError |

## R9 — OUT   ·   2 findings

| # | sev | where | the finding |
|---|---|---|---|
| 36 | high | `references/ask.md:110-112 (vs looprun/packages/eval/` | ask/targets.json's documented fields `baseUrl` and `serving` are rejected by the loader's strict schema — the file the whole TEST phase reads throws |
| 50 | high | `references/ask.md:110-112 vs looprun/packages/eval/s` | `ask/targets.json` as documented is rejected by the loader — `serving` and `baseUrl` fail the strict schema |

## X2 — OUT   ·   1 finding

| # | sev | where | the finding |
|---|---|---|---|
| 6 | medi | `references/debate.md (29 lines, :4 in particular); t` | debate.md is a full validation primitive whose own activation phrase appears in no recipe |

## X3 — OUT   ·   2 findings

| # | sev | where | the finding |
|---|---|---|---|
| 34 | high | `references/local-performance.md:20-24 and scripts/mo` | "A degraded run never certifies" — the 70% alert is written to a file no verb reads |
| 42 | medi | `references/judge-ruler.md:6 (unreferenced by SKILL.m` | judge-ruler.md defines what a certification's number means and no page links to it |

## X5 — OUT   ·   1 finding

| # | sev | where | the finding |
|---|---|---|---|
| 43 | low | `references/local-performance.md:1` | local-performance.md's title annotates the document's own status instead of naming the thing |
