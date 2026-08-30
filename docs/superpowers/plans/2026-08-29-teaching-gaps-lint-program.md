# The Lint Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every feasible check behind every teaching — the spec's four waves built, all 107 GAP rows verdicted BUILT or WONTFIX, and the from-zero c20 round (Task 17) passing as the program's final validator with zero lint errors.

**Architecture:** Engine lints land in `packages/emit` (declaration content) and `packages/eval` (gate verbs, certify); process instruments land in the agentspec skill gate (`vitest run subjects`); pages are rewritten in the same session as the verbs they describe. Every lint is born RED on a fixture carrying the exact defect it exists to refuse.

**Tech Stack:** TypeScript · vitest · node:crypto

**Spec:** `docs/superpowers/specs/2026-08-29-teaching-gaps-lint-program-design.md`
**Source inventory:** `agentspec/docs/analysis/2026-08-29-skill-teachings-and-lints.md`

## Global Constraints

- Everything written is English; comments AS-IS (no history, no evidence citations).
- Every new lint: failing fixture FIRST, then the implementation, then green — no lint ships without the red run recorded in its test.
- Emit refusals name the YAML path (follow the existing `problems.push` pattern in `packages/emit/src/against-surface.ts` / `declaration.ts`).
- The archived trial product `agentspec-bench/subjects/atlas-c17/test/2026-08-29-c19-sweep/trial-product/declaration.yaml` is the standing corpus: Wave B's Task 8 must flag it.
- JUDGMENT rows (99) are out of scope; EXAM-LETTERS rows (24) belong to campaigns. Only GAP rows are built.
- No regex literals in `packages/core/src` (house lint); test files and emit string checks use plain string walks where the house pattern demands it.
- Nothing is pushed to any remote.

---

### Task 1: `conductComplete` — the gate verb the page already names

**Files:**
- Modify: `packages/eval/src/lints.ts`, `packages/eval/src/index.ts`, `packages/eval/src/gate.ts`
- Test: `packages/eval/test/conduct-complete.test.ts`; red fixture under `packages/eval/test/fixtures/` (the `gate-broken` fixture's comments name this verb — turn the comment into the real check)

**Interfaces:**
- Produces: `conductComplete(specs): readonly Finding[]` — for every spec of a multi-spec subject, the `conduct` map (rendered into the system prefix) carries all six voice names: `declareHonestly`, `oneQuestion`, `yourLaneYourReads`, `recordsOverAssertions`, `askBeforeYouChoose`, `nameItDoNotPassItOn`; a missing voice is one finding naming spec and voice. Wired into `runGate`'s verb list.

- [ ] **Step 1:** Write the failing test: a two-spec fixture where one spec's conduct lacks `oneQuestion` → expect one finding `{ spec: 'billing', voice: 'oneQuestion' }`; a complete fixture → zero findings; a SINGLE-spec subject → zero findings (the six-voice law binds multi-desk houses).
- [ ] **Step 2:** Run: `node_modules/.bin/vitest run packages/eval/test/conduct-complete.test.ts` — FAIL (function missing).
- [ ] **Step 3:** Implement in `lints.ts` beside the other spec-walking verbs; export from `index.ts`; add to `runGate`'s list in `gate.ts`.
- [ ] **Step 4:** Test green; whole eval suite green. **Step 5: Commit** — `feat(eval): conductComplete — the six voices are gated, not assumed`

### Task 2: the emit refuses a desk missing a voice

**Files:**
- Modify: `packages/emit/src/declaration.ts` (or `against-surface.ts`, wherever desk-level surface checks live — follow the multi-desk description/summary checks added for the two-field rule)
- Test: `packages/emit/test/declaration.test.ts`

- [ ] **Step 1:** Failing test: a two-desk declaration whose second desk's `conduct` lacks `recordsOverAssertions` → refused naming the desk and the voice; single-desk → not refused; all six present → accepted.
- [ ] **Step 2:** FAIL → implement beside the description/summary presence checks (same refusal wording style) → green → whole emit suite. **Step 3: Commit** — `feat(emit)!: every desk of a multi-desk declaration speaks all six voices`

### Task 3: `norms.md` N6 tells the truth

**Files:**
- Modify: `agentspec/skill/references/norms.md` (the N6 verb list at ~line 438)

- [ ] **Step 1:** Read the verbs `runGate` actually runs (after Task 1) from `packages/eval/src/gate.ts` and the exports in `index.ts`.
- [ ] **Step 2:** Rewrite the N6 list to exactly those names. `readsOrdered` and `requiredReadsDisclosed` leave the page (no wave builds them — record both as WONTFIX rows in Task 16 with the reason: their teachings are paid by `onlyAfter` declarations and `destructiveDisclosed` respectively).
- [ ] **Step 3:** `cd agentspec && pnpm gate` green. **Step 4: Commit** (agentspec) — `docs(skill): N6 names the verbs that exist — no law is claimed gated that nothing gates`

### Task 4: the reference gate and the N6 snippet compile

**Files:**
- Create: `agentspec/tsconfig.json`, `agentspec/subjects/snippets.test.ts` (compiles the N6 snippet and the reference gate as fixtures)
- Modify: `agentspec/skill/references/check-subject.test.ts` (regenerated), `agentspec/package.json` (gate script gains `tsc --noEmit`)

- [ ] **Step 1:** Emit any sound fixture declaration with the real emit (`node looprun/packages/emit/dist/cli.js`) and copy the generated `check-subject.test.ts` over the reference copy — the reference IS the generator's output, never hand-drafted.
- [ ] **Step 2:** Extract the N6 snippet into a compiled test fixture; fix the snippet on the page to match what compiles (`presetLeavesGuardInert: () => false`, `specs` and `contract` present).
- [ ] **Step 3:** Add `tsc --noEmit` to the skill gate; green. **Step 4: Commit** — `fix(skill): the reference gate is the emitter's own output, and every snippet compiles`

### Task 5: `spec-template.ts` is compiled and its two live defects die

**Files:**
- Modify: `agentspec/skill/references/spec-template.ts` (covered by Task 4's tsconfig)

- [ ] **Step 1:** Fix the `disposal` desk: its `description` names only verbs its lane (`listPlants`, `getPlant`, `discardPlant`) performs; the conduct law naming a "sales desk" names a desk the template declares, or the clause becomes the no-such-operation form.
- [ ] **Step 2:** Typecheck green under Task 4's script. **Step 3: Commit** — `fix(skill): the template's desk describes its own lane and names only desks that exist`

### Task 6: the link-graph and the lesson numbering

**Files:**
- Create: `agentspec/subjects/skill-graph.test.ts`

- [ ] **Step 1:** Failing test: every `references/*.md` is reachable from `SKILL.md`'s link graph (read hrefs, walk transitively) — expect FAIL naming `judge-ruler.md` and `local-performance.md`; lesson numbers in `guard-catalog-lessons.md` are contiguous — expect FAIL naming the gap at 17.
- [ ] **Step 2:** Fix the pages: the pipeline table (SHIP row) links `judge-ruler.md`; `test.md`'s T3 links `local-performance.md`; renumber the lessons contiguously.
- [ ] **Step 3:** Green. **Step 4: Commit** — `docs(skill): no orphan page, no missing lesson number — and the gate keeps it so`

### Task 7: the world card names the acts that CREATE a record

**Files:**
- Modify: `agentspec/skill/references/gen.md` (G2 — one sentence: beside `WRITES`, the world card exports `CREATES: readonly string[]`, the write acts that mint a record that did not exist); `agentspec-bench/subjects/atlas/` world source + the port that writes `generated/world-data.ts` (locate with `grep -rn "WRITES" agentspec-bench/subjects/atlas port tools`); `agentspec-bench/subjects/atlas-c17/world.ts` (gains the CREATES list)
- Test: the port's own test if one exists; otherwise the Task 8 fixture carries the contract

**Interfaces:**
- Produces: `CREATES` visible to the emit's surface reader (thread it wherever `WRITES` already flows into the surface the emit checks against).

- [ ] **Step 1:** Add `CREATES` to the atlas world beside `WRITES`: `['createBooking', 'createCustomer', 'fileClaim', 'placeHold', 'registerAsset', 'scheduleMaintenance', 'generateInvoice', 'inviteMember', 'generateQuote']` — every act whose handler mints a fresh identifier (verify each against the handler: it calls the id-minting helper; `generateQuote` mints `qt_` and belongs on the list).
- [ ] **Step 2:** Thread it through the port into `generated/world-data.ts` and re-port; the emit's surface type gains the field.
- [ ] **Step 3:** gen.md G2 gains the sentence (the world card states which writes CREATE; the block a tool sits in is its effect, the CREATES list is its birth register). **Step 4: Commit** both repos — `feat(world): the card names the acts that mint a record`

### Task 8: the emit demands the asked-for law and the after on every CREATES act

**Files:**
- Modify: `packages/emit/src/against-surface.ts`
- Test: `packages/emit/test/creates-law.test.ts` + fixture declarations

- [ ] **Step 1:** Failing tests: (a) a fixture whose surface marks `enrollStudent` in CREATES and whose declaration has no `prose`/`why: conduct` guard naming it → refused: `the act 'enrollStudent' opens a new record and carries no prose law licensed conduct`; (b) same act with the law but no `disclosure.enrollStudent.after` → refused naming the missing after; (c) both present → accepted.
- [ ] **Step 2:** FAIL → implement → green.
- [ ] **Step 3:** THE CORPUS RUN: point the new lint at the archived trial product (`.../2026-08-29-c19-sweep/trial-product/`) with the CREATES-bearing surface — assert it refuses (that author dropped the law). This test is the program's proof and stays in the suite.
- [ ] **Step 4:** Whole emit suite + regenerate `subjects/atlas-c17` through the emit (its landed declaration already carries the laws — the gate must stay green). **Step 5: Commit** — `feat(emit): a record-opening act without its asked-for law or its after is refused by name`

### Task 9: three small content lints — after-slot, optional-value, duplicate names

**Files:**
- Modify: `packages/emit/src/against-surface.ts` (first two), `packages/emit/src/declaration.ts` (`readGuards` duplicate check)
- Test: `packages/emit/test/declaration.test.ts` additions

- [ ] **Step 1:** Failing tests: (a) a `disclosure.<act>.after` whose string carries no `{result.` → refused (`an after with no {result.} slot reports nothing the act did`); (b) `valueFromUser` on an argument absent from the schema's `required` list → refused naming argument and act; (c) two guards sharing a `name` → refused at read, by name and both lines.
- [ ] **Step 2:** FAIL → implement → green → suite. **Step 3: Commit** — `feat(emit): an after speaks its result, a value check binds a required argument, a guard name is unique`

### Task 10: three more — empty's root, substring terms, the floor name

**Files:**
- Modify: `packages/emit/src/against-surface.ts` (first two), `packages/eval/src/lints.ts` (`floorRedeclared`'s `FLOOR_NAMES` gains `figureIsGrounded`)
- Test: `packages/emit/test/declaration.test.ts`, `packages/eval/test` (the existing floorRedeclared test gains the case)

- [ ] **Step 1:** Failing tests: (a) a `needs.<alias>.empty` sentence carrying `{alias.` → refused (`empty renders with {args} only — the reads already failed`); (b) `choiceFromUser` where one value's term is a substring of another value's term → refused naming both values; (c) a card guard named `figureIsGrounded` → flagged by `floorRedeclared`.
- [ ] **Step 2:** FAIL ×3 → implement → green → both suites. **Step 3: Commit** — `feat(emit,eval): the empty sentence stays fillable, choice terms stay disjoint, the grounding floor keeps its name`

### Task 11: `seamSpoken` joins the gate as a budget line

**Files:**
- Modify: `packages/eval/src/gate.ts` (runGate output gains a `seams` section: findings from `seamSpoken`; a seam a CASE's preset drives into with an empty sentence is a FAILURE; an unreached empty seam prints as a warning line)
- Test: `packages/eval/test/seam-budget.test.ts` + fixture

- [ ] **Step 1:** Failing test: fixture subject with one case whose preset drives act X into code `BLOCKED_Y`, sentence column empty → runGate fails naming `X · BLOCKED_Y`; the same seam with a sentence → green; an empty seam NO case reaches → green with the warning in the report.
- [ ] **Step 2:** FAIL → implement (the `cases` are already in `seamSpoken`'s signature) → green. **Step 3:** Regenerate + re-run both bench stamped gates (c17, c18) — a red here is a real unpaid seam: pay it in the declaration, never in the gate. **Step 4: Commit** — `feat(eval): a seam the exam reaches is spoken or the gate is red`

### Task 12: the stamp covers the emitted files

**Files:**
- Modify: `packages/emit/src/write-artifacts.ts` (the stamp = sha256 over `declaration.yaml` bytes + `cards.ts` bytes, in that order; the generated first test recomputes both — the gate file never hashes itself)
- Test: `packages/emit/test/gate-stamp.test.ts` (the existing stamp tests gain: edit one byte of the generated `cards.ts`, keep the declaration — the gate fails)

- [ ] **Step 1:** Failing test → **Step 2:** implement → green → **Step 3:** regenerate the stamped gates of `atlas-c17` and `atlas-c18` in the bench (both go green through the emit). **Step 4: Commit** both repos — `feat(emit): a hand-edited cards.ts can no longer keep its gate green`

### Task 13: the two numeric caps

**Files:**
- Modify: `packages/eval/src/lints.ts` (+ export + `runGate`): `laneWidth` (>15 tools on one spec = finding) and `cardWeight` (a spec whose compiled card bytes exceed 2× its system-prefix bytes = finding)
- Test: `packages/eval/test/caps.test.ts` + fixtures

- [ ] **Steps:** failing fixtures (16 tools; a bloated card) → implement → green → suite → commit — `feat(eval): the two stated numbers are measured — lane width and card weight`

### Task 14: a degraded run never certifies

**Files:**
- Modify: `packages/eval/src/certifier.ts` (`certify` reads `MONITOR.md` beside each run dir; a line starting `ALERT` voids that run with the alert text in the certification record)
- Test: `packages/eval/test/certifier.test.ts` addition + fixture run dir

- [ ] **Steps:** failing test (a run dir with `MONITOR.md` carrying `ALERT: cpu contended` → certification names the void and excludes the run) → implement → green → commit — `feat(eval): a certification reads the monitor — a degraded run is no evidence`

### Task 15: the process instruments in the skill gate

**Files:**
- Create: `agentspec/subjects/pipeline-panel.test.ts` (parses `PIPELINE.md` grammar where present: phase order A G E1a N M E1b T S, `(after X)` bars, a 🟩 only after its named verification), `agentspec/subjects/thinking-logs.test.ts` (each phase log exists with its four headings in order, per `thinking-template.md`), `agentspec/subjects/no-secrets.test.ts` (no key-shaped literal in tracked files), `agentspec/subjects/no-external-model.test.ts` (no provider hostname — `generativelanguage.googleapis.com`, `api.openai.com`, `api.anthropic.com` — in any tracked file outside this test itself)
- Mirror the two scans in the bench: `agentspec-bench/tools/no-secrets.test.ts`, `agentspec-bench/tools/no-external-model.test.ts` (the engine repo already carries its own in `packages/core/test/lint/`)

- [ ] **Steps:** each test written failing against a deliberately broken fixture string, then run against the real repos (must be green — a red is a real finding to fix before the commit) → commit both repos — `test: the process pages get their instruments — panel grammar, thinking logs, no key, no external model`

### Task 16: the verdict table — no row closes silently

**Files:**
- Modify: `agentspec/docs/analysis/2026-08-29-skill-teachings-and-lints.md` (every GAP row gains `closed by: <check name>` or `WONTFIX: <reason>`; the counts section is recomputed)
- Modify: `agentspec/BACKLOG.md` (the lint program's row closes; anything WONTFIX that should return later becomes its own row)

- [ ] **Step 1:** Walk all 107 GAP rows against Tasks 1–15; stamp each. The three families the inventory rolls up (panel rows, thinking-log rows, artifact-existence rows) close under Task 15's instruments.
- [ ] **Step 2:** Full suites: looprun `vitest run` all packages · agentspec `pnpm gate` · bench stamped gates. All green.
- [ ] **Step 3:** Re-run the corpus assertion (Task 8 Step 3) one last time in the full suite. **Step 4: Commit** — `docs(analysis): 107 rows verdicted — built or refused with its reason, none silent`

### Task 17: F5b — the from-zero c20 round is the program's FINAL VALIDATOR

**Precondition:** Tasks 1–16 committed, every suite green. This round MINTS `c20` (a
from-zero round generates the cX; the owner's ruling). No eval, no subject-model call
anywhere in it — the validator is authored artifacts plus machines plus the sweep.

**The validator's law (the owner's, verbatim in force):** any error in the pointed
lints that this round surfaces MUST be fixed — none is registered, deferred or
accepted as residue.

- [ ] **Step 1 — seal the expectations FIRST:** write `subjects/atlas-c17/test/<date>-c20-sweep/EXPECTATIONS.md` and commit it BEFORE the author runs. It extends the c19 list with the program's promotion: every Wave B guarantee is now the MACHINE's to hold — a point the sweep finds missing with no lint having refused it is a lint bug, not merely an authoring miss.
- [ ] **Step 2 — scaffold:** `subjects/atlas-c20` from the same birth inputs the c19 trial used (`ask/`, `gen/`, `generated/`, `world.ts`, `world-kit.ts`, `subject.ts` from `atlas-c17`; `cases.ts` from `git show 8491f9f:subjects/atlas-c17/cases.ts`), with Task 7's `CREATES` list in the world surface.
- [ ] **Step 3 — the blind author:** a fresh agent carrying zero session context — only the skill path and the scaffold path; the declared path (phase N, emit, gate) with all new lints live; no other `subjects/` directory; no git; N-REPORT and timing.log per the skill's own recipe. Its report must name every emit refusal it met and how the declaration answered it.
- [ ] **Step 4 — the sweep, three error classes, all fatal to the round:**
  - FALSE POSITIVE — a lint refused lawful authoring (the author's report shows a refusal only contortion could satisfy): the lint is wrong; fix it, red-first, with the c20 evidence as the fixture;
  - FALSE NEGATIVE — a sweep point fails and NO lint fired on the way: the lint is missing or blind; build or fix it, red-first, the c20 product joins the trial product as corpus;
  - BREAKAGE — an emit or gate crash: fix it.
- [ ] **Step 5 — the loop:** after ANY fix from Step 4, the round repeats FROM ZERO — a fresh blind author over a fresh scaffold — until one round completes with zero validator errors. That round's product IS `c20`.
- [ ] **Step 6:** Commit the accepted round (scaffold, product, sweep, reports). `c20` stands as the subject F2's campaign measures. **The lint program closes only here.**
