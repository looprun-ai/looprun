# Declaration & emitter plan — execution record

The 21-task plan `docs/superpowers/plans/2026-08-20-declaration-and-emitter.md`, task by task:
what each one set out to do, what it actually produced, and whether the objective was met.
Evidence: the campaign ledger, the commits named per row, and the run directories in
`agentspec-bench`. The register mapping (second section) is pinned by
`packages/eval/test/registers.test.ts` (5/5 green).

## The 21 tasks

| # | task | objective | what it actually produced | met? |
|---|---|---|---|---|
| 1 | `boilerplate` | A deterministic verb that finds repeated wording across rendered lines, priced by the cards it is stamped on | The verb + tests, gate-callable (commits 15a397f..7567ee4; 35/35 green) | ✅ |
| 2 | `overWide` | A rule naming more than one act must declare its licence (`WIDE` map: `oneLawEveryAct` / `sameRefusal`) | Verb + `WIDE` map + `declaredMap` helper; Atlas baseline 4/16/9 recorded (7567ee4..84d6730) | ✅ |
| 3 | `seamCovered` | Every refusal the world can emit, paired with the guard that covers it — replacing a 91 KB hand walk of 239 refusal sites | Verb incl. computed-code scan, method-shorthand handlers, `fail(CODE)` in custom executors (84d6730..b8e80a4, 1 fix round; 41/41; atlas-render2: 198 seam rows / 25 uncovered) | ✅ |
| 4 | `destructiveDisclosed` `capPaths` `floorRedeclared` `conductComplete` | Four deterministic verbs: destructive act owes a `before`; a cap's path resolves; a card never redeclares a floor; no desk misses a conduct law | The four verbs (b8e80a4..68d7362; 49/49; floor attribution: agent-factory 8 + rulebook 2) | ✅ |
| 5 | `coversResolve` `approvable` | The exam's `covers` keys resolve to installed guards; every covered guard can fire on its case's preset | Both verbs; also surfaced and fixed a real defect in the tutorial's `exam.ts` (68d7362..da2dc33; 53 green) | ✅ |
| 6 | `echoes` parameterized | `echoes` takes its thresholds and excludes generated lines (the world's `does` sentences an author cannot delete) | The widened verb + `skipGenerated` (da2dc33..40fdd36; 54/54) | ✅ |
| 7 | `byteOrigin` | Attribute every prompt byte to who wrote it (world `does` / schemas / prefixes / contract rules) | The verb; atlas-next baseline 32 705 / 24 687 / 27 060 / 11 596 B (40fdd36..348ad62, 1 fix round; 57/57) | ✅ |
| 8 | The one gate file | ONE `runGate` running every verb, wired in both repos — three gate lists become one | `runGate` + gate-sound/gate-broken proofs; agentspec wired via `link:` deps (348ad62..257838d + agentspec ee2da1d, 1 fix round; 7/7) | ✅ |
| 9 | `packages/emit` — declaration reader | New package; `declaration.yaml` read and validated into a typed `Declaration` | The package + reader (257838d..65d2796; layer-rule emit lane matches declared deps exactly) | ✅ |
| 10 | `against-surface` | Every refusal the emitter owes, checked against the world's surface before a line is written | The validation pass (65d2796..34bdb59, 1 fix round; 10/10) | ✅ |
| 11 | `write-cards` | The emitter writes `cards.ts` deterministically and invents zero prose | The writer — audited literal by literal by the reviewer; determinism byte-identical (34bdb59..66d45da; 15/15) | ✅ |
| 12 | `write-artifacts` + CLI | `subject.ts`, the gate file, `SEAM.md`, `covers` keys, `WHY` map, expected census — and the CLI over the whole emit | Artifacts + CLI green on both fixtures (66d45da..5f2d0d6, 1 fix round; 38/38) | ✅ |
| 13 | `guard-catalog.md` becomes a lookup | Thin the skill's reading path; delete the duplications (D1–D4) | The lookup page; run-path 129 108 → 116 260 B (agentspec 527ee11+727c15b, 1 fix round) | ✅ |
| 14 | `guard-contexts.md` | Name every field of the four guard contexts — the page two blind authors read engine source to reconstruct | The page: 26/26 fields verified against the engine; 4 examples compile as `Guard` (agentspec 7abf777) | ✅ |
| 15 | `spec-template.ts` passes the gate | The template an author copies must be green under the gate it is copied into | The template rebuilt (RED shape reproduced pre-fix; 3/3 green); plan defect found: `plantSeedling` existed nowhere — real acting lanes shipped (looprun 6520053 + agentspec 0cf6eb6) | ✅ |
| 16 | `norms.md` N6 prints and signs | The four byte slices printed by a snippet that runs as pasted — no hand counting | The snippet, reproduced running as printed by the reviewer (agentspec 522c854; tsc clean) | ✅ |
| 17 | The bar, the pipeline table, page fixes | Certification bar 0.95 stated where ship.md said otherwise; pipeline table; 15 page-debt ids | All landed (agentspec 3b46214+e764ab6+5a21350; 2 fix rounds) | ✅ |
| 18 | TIER 1 — the hotel | The tutorial subject end-to-end through the declared path, certified | Certified **1.0 pass:true** on the merged card; r2 judgement independently confirmed (bench 6ab9415+2f8807e+37d9347, looprun ×4, agentspec 3adb1ca) | ✅ |
| 19 | TIER 2 — the Atlas, four bars | The emitted Atlas passes §3.2: judged ≥ 0.95 · prompt ≤ 109 492 B · ≥ 58 checks with 31/31 acts · ≤ 1.5 min/desk | First emitted measurement: 0.79/0.79 FAIL (prompt 100 388 PASS; checks 60 + 31/31 PASS; wall 45m08 FAIL) → REOPENED by ruling → declaration path + blind campaign (c1..c17) + the 6B skill rewrite → **c17, blind from zero: 96/100 letter-strict, gate ≥ .95 PASSED** (held-out 57/60; 12-key 11/12). Bytes on the blind path: ~134 KB render, ABOVE the 109 492 reference (backlog rows 1–4 attack this); phase-N wall 30m10s from zero (declared-path authoring reached 3m35s on c11). CLOSED by user ruling 2026-08-23. | ✅ score bar, by ruling · byte/wall bars not met on the blind path |
| 20 | The register check | Every id lives in exactly one register column, every finding mapped — mechanically | `registers.test.ts`, 5/5; set sizes 68 IN / 12 OUT / 42 trace headings / 80 findings (d0fd3c5) | ✅ |
| 21 | The documentation | README gains EMIT; tutorial 04-guards gains the channel law; `packages/emit/README.md`; strikethroughs in the register | Nothing yet — all four steps verified undone on 2026-08-23. The ledger-carried skill half (SKILL.md EMIT row + panel + declare.md pointer) IS paid, by the 6B rewrite (SKILL.md:49-50, :125). | ⏳ pending |

Score: 20 of 21 tasks complete; Task 21 (docs only — no engine code, no skill pages) remains.

## The register — 80 ids, status of each

The adversarial review left 80 survivor findings; the spec's §8 register maps them onto 80 ids
(68 admitted IN, 12 deferred OUT; 42 distinct ids head the trace map
`docs/analysis/2026-08-20-finding-trace.md`). `registers.test.ts` holds the mapping.

### IN — 68 ids, all closed by a completed task

The one open debt on this column is recording: Task 21 step 4 strikes each closed id through in
`docs/analysis/2026-08-20-authoring-register.md`, and that step is pending.

| ids | closed by | status |
|---|---|---|
| B1a, B2 | Task 1 | ✅ closed |
| B3, V8 | Task 2 | ✅ closed |
| S3, V4 | Task 3 (S3 emitted by Task 12) | ✅ closed |
| C1, C2, C4, C5, R5 | Task 4 (+ emitter half of C1 in Task 10) | ✅ closed |
| C3, C6, D5, S4, G-A | Task 5 (+ S4 emitted by Task 12; emitter half of G-A in Task 10) | ✅ closed |
| B4, G-E | Task 6 | ✅ closed |
| U1, U2, U3 | Task 7 | ✅ closed |
| F4, C7, C8, C9, C10, C12 | Task 8 | ✅ closed |
| F1, S1 | Tasks 9–11 (F1 in three halves), 12 (S1 emitted) | ✅ closed |
| G-B, G-C, V1, V5, V6 | Task 10 | ✅ closed |
| F2, S5 | Task 11 | ✅ closed |
| S2e, S6, R14 | Task 12 (emitter half of R14; page half in Task 17) | ✅ closed |
| F5, D1, D2, D3, D4 | Task 13 | ✅ closed |
| G-D | Task 14 | ✅ closed |
| R3, R4 | Task 15 | ✅ closed |
| X6, C11, F3, V2, V3, V7 | Task 16 | ✅ closed |
| R1, R2, R6, R7, R10, R13, R15, D6, G-F, G-G, W1, W2, W3, F6 | Task 17 | ✅ closed |
| B6 | Task 19 (the speed bar, resolved as 1.5 min/desk in spec §3.2) | ✅ closed |

### OUT — 12 ids, each now living in one of the two backlogs

Deferred by the spec (§8.2) as real, verified, and moving no bar. Distributed on 2026-08-23 into
the only two work queues.

| id | what | lives now at |
|---|---|---|
| X1 | `S2` as a phase — its whole content is "never run it" | agentspec BACKLOG row 3 (merged with the S2 design row) |
| X2 | `debate.md` — wire it or delete it | agentspec BACKLOG row 7 |
| X3 | `local-performance.md` + `judge-ruler.md` — link or delete | agentspec BACKLOG row 8 |
| X4 | `extract-fork.mjs`, `synth-fork.mjs` — owned by no page | agentspec BACKLOG row 9 |
| X5 | `local-performance.md`'s parenthetical title | agentspec BACKLOG row 10 |
| R8 | `sync` and `census` signatures | agentspec BACKLOG row 10 |
| R9 | `ask/targets.json`'s schema | agentspec BACKLOG row 10 |
| R11 | status words — six renameable, five installed, one renders | agentspec BACKLOG row 10 |
| R12 | `resume.md`'s dead pointers | agentspec BACKLOG row 10 |
| G-H | case 48 cannot be satisfied by a tool-need split | agentspec BACKLOG row 5 |
| B1b | the SEMANTIC half of the byte analysis | looprun BACKLOG row 4 |
| B5 | remaining gaps of the blind authorings, folded into B1b | looprun BACKLOG row 4 |
