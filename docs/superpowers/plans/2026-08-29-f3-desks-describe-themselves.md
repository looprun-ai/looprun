# F3 — The Desk Describes Itself Implementation Plan

> **Status: DONE — description and summary replace handles.**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `description` + `summary` replace `handles`, `teammates` dies, and the emitted gate carries the declaration's hash stamp — closing the skill↔engine sync break.

**Architecture:** Clean re-implementation on `main`; the dead branch `desks-describe-themselves` (`17868d2`, `d7ad33b`) is REFERENCE ONLY — read its diffs with `git show`, adapt, never cherry-pick (its delivery patches are poison). Breaking, no shims; bench fixtures migrate in the same move.

**Tech Stack:** TypeScript · vitest · node:crypto (sha256)

**Spec:** `docs/superpowers/specs/2026-08-29-f3-desks-describe-themselves-design.md`

## Global Constraints

- Zero subject calls until Task 6's four-case smoke.
- The skill is NOT touched (it already teaches this shape).
- `handles` and `teammates` are refused as unknown keys after this phase — grep both names to zero in engine sources when done (docs rewritten AS-IS).
- Everything written to a file is English.

---

### Task 1: The declaration reader — `description`/`summary` in, `handles`/`teammates` out

**Files:**
- Modify: `packages/emit/src/declaration.ts` (the desk-field table and the surface check)
- Test: `packages/emit/test/declaration.test.ts`, `packages/emit/test/helpers.ts`

**Interfaces:**
- Produces: `DeclaredDesk` gains `description?: string; summary?: string`; loses `handles`/`teammates`. `checkAgainstSurface` refuses: missing field on a multi-desk declaration (naming the desk), either field on a single-desk declaration, a comma inside `summary`.

- [ ] **Step 1:** Copy the reference tests: `git show desks-describe-themselves:packages/emit/test/declaration.test.ts` — take the `describe('description', …)` block (round trip on two desks; multi-desk missing description refused naming `'audit'`; single-desk carrying it refused naming `'front-desk'`) verbatim, then ADD two tests of your own: a `summary` containing a comma is refused quoting the separator rule; a desk carrying `handles:` (and another carrying `teammates:`) is refused as an unknown key by name and line. Update `helpers.ts` `SOUND_DESKS` per the reference (`git show desks-describe-themselves:packages/emit/test/helpers.ts`).
- [ ] **Step 2:** Run `cd packages/emit && npx vitest run test/declaration.test.ts` — FAIL (unknown fields).
- [ ] **Step 3:** Implement in `declaration.ts`: extend the desk-field table with the two fields (reference: `git show 17868d2 -- packages/emit/src/declaration.ts`), delete `handles`/`teammates` rows, and add the two surface rules (multi/single presence; the comma refusal: `if (desk.summary?.includes(',')) problems.push(… 'a summary carries a comma — the comma is the house's list separator' …)`).
- [ ] **Step 4:** Test green; whole emit suite green. **Step 5: Commit** — `feat(emit)!: a desk declares description and summary; handles and teammates leave the language`

### Task 2: The writer emits the two fields and the colleague lines

**Files:**
- Modify: `packages/emit/src/write-cards.ts`; Test: `packages/emit/test/write-cards.test.ts`

- [ ] **Step 1:** Reference `git show 17868d2 -- packages/emit/src/write-cards.ts` for the emitted shape (`description: '…',` / `summary: '…',` on each spec). Write the failing test: the two-desk fixture's output contains both fields per desk and NO `teammates:`/`handles:` anywhere.
- [ ] **Step 2:** FAIL → implement → green → whole suite. **Step 3: Commit** — `feat(emit): the cards carry the desk's own two descriptions`

### Task 3: The gate stamp

**Files:**
- Modify: `packages/emit/src/write-artifacts.ts`; Test: `packages/emit/test/write-artifacts.test.ts` (or the suite that exercises the gate file)

- [ ] **Step 1:** Reference `git show d7ad33b`. Failing tests: (a) emitting twice from one declaration yields the same `const STAMP = '<16 hex>'` in the generated `check-subject.test.ts`, and the generated first test recomputes sha256 of the sibling `declaration.yaml` and compares; (b) edit one byte of a copied declaration, regenerate ONLY cards — running the stale gate fails on the stamp test.
- [ ] **Step 2:** Implement: `const stamp = createHash('sha256').update(readFileSync(declarationPath)).digest('hex').slice(0, 16)` threaded into `writeGateFile(stamp)`; the emitted first test reads the declaration beside itself and compares.
- [ ] **Step 3:** Green + suite. **Step 4: Commit** — `feat(emit): the gate knows which declaration its cards came from`

### Task 4: The core front desk routes on `description`

**Files:**
- Modify: `packages/core/src/run/front-desk.ts` (`FrontDeskCfg.handles` → `description`), `packages/core` AgentSpec type (`handles` → `description` + `summary`; delete `teammates` and wherever it renders into a prompt — grep `teammates` in `packages/core/src`)
- Test: `packages/core/test/front-desk.test.ts` (reference: `git show desks-describe-themselves:packages/core/test/front-desk.test.ts` uses `description:` in cfg)

- [ ] **Steps:** failing test (cfg field renamed; window text unchanged otherwise) → implement → sweep core suite (fixtures naming `handles`/`teammates`) → commit — `feat(core)!: the front desk reads each desk's description; teammates leaves the spec`

### Task 5: The mastra house — descriptions, summaries, colleague lines

**Files:**
- Modify: `packages/mastra/src/routed-agent.ts` (cfg `handles` → `descriptions`; `refusalText()` from summaries: `"No desk at ${name} performs this. The house covers: ${a}, ${b} and ${c}."`; each desk's window gains its colleagues' description lines where teammates rendered), `packages/mastra/src/agent-assembly.ts` if it names the fields
- Test: `packages/mastra/test/routed-agent.test.ts` (HANDLES fixture → DESCRIPTIONS + SUMMARIES; the none-refusal test asserts the summary-built sentence; new test: a desk's window carries each colleague's description and not its own)

- [ ] **Steps:** failing tests → implement (reference `git show 17868d2 -- packages/mastra/src/routed-agent.ts`) → mastra suite green → whole workspace `pnpm build && pnpm -r test` green → commit — `feat(mastra)!: the house hands every desk its colleagues' own lines, and refuses by its summaries`

### Task 6: The bench migrates, and four live cases prove the wire

**Files (bench repo):**
- Modify: `subjects/atlas-c17/declaration.yaml`, `subjects/atlas-c18/declaration.yaml` — each desk's `handles:` line becomes `description:`; a `summary:` drafted per desk (comma-free, flagged in the commit as measurement infrastructure — the authored wording rides F5's loop); regenerate cards THROUGH the emit; the new gate stamps must pass.
- Also migrate the bench fixtures that name `handles` (`tools/…`, `subjects/atlas-c17-conduct` re-exports are untouched).

- [ ] **Step 1:** Migrate + regenerate + `check-subject.test.ts` green for both subjects.
- [ ] **Step 2:** Live smoke, four routed cases on `atlas-c18` (`route-01`-style ids from its exam): every route lands, zero invariant failures, letters read in session.
- [ ] **Step 3:** Commit both repos — bench: `subject(atlas): the desks describe themselves — migrated through the emit, stamped gates green`

### Task 7: Docs AS-IS

- [ ] Grep `handles` and `teammates` across `README.md`, `docs/**`, engine source headers; rewrite each statement to the two-field truth (no history). Suite + tutorial snippets green. Commit — `docs: a desk describes itself once — the routing line and the house's own words`
