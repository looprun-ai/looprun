# Looprun Simplification & Tutorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink looprun's public API and file sizes around a single numbered tutorial (`docs/tutorial/01–06`), deleting or internalizing every concept the tutorial does not teach.

**Architecture:** Evidence-driven refactor per the approved design (`docs/superpowers/specs/2026-07-28-looprun-simplification-design.md`). Public surface = what the tutorial teaches; backend-only symbols move to a new `@looprun-ai/core/internal` subpath (same mechanism as the existing `./testing` subpath); unused symbols are deleted. Tutorial snippets live in a compiled workspace package so they can never rot.

**Tech Stack:** pnpm workspace, TypeScript ESM, vitest (per-package `pnpm test`), changesets.

## Global Constraints

- **Breaking release, no backward compat.** All changes land on a branch; one major-bump changeset at the end (Task 12).
- **Repo never broken:** every task ends with `pnpm -r build && pnpm test` green from the repo root.
- **Evidence before deletion:** a symbol is deleted only if the Task 1 inventory shows zero usage outside `packages/core` itself and its own tests. Used only by backends/eval → move to `@looprun-ai/core/internal`. Used by examples/skills/looprun-bench/yntelli → stays public.
- **Size target:** no `src/*.ts` file above 500 lines.
- **Everything in English** (code, docs, commits). Conventional commit format.
- Consumers to keep compiling throughout: `examples/*`, `skills/looprun-governance`, `packages/*`. External repos (agentspec skill, looprun-bench, yntelli) are migrated in Task 12 notes, not in this repo.

---

### Task 1: Usage inventory (Phase 0)

**Files:**
- Create: `docs/superpowers/specs/2026-07-28-symbol-inventory.md`

**Interfaces:**
- Produces: a verdict table `symbol | package | used by | verdict (public / internal / delete)` that every later task cites as the authority for cuts.

- [ ] **Step 1: Enumerate exported symbols per package**

```bash
cd /Users/marcos/Dev/js/looprun/looprun
for p in core mastra models eval server vercel; do
  echo "== $p =="
  grep -hoE "export (function|const|class|type|interface) [A-Za-z0-9_]+|^export \{[^}]*\}" \
    packages/$p/src/index.ts packages/$p/src/*.ts | sort -u
done
```

- [ ] **Step 2: Grep each symbol across all consumers**

For every exported symbol S (skip pure types re-exported for convenience — mark them with their owning value symbol):

```bash
grep -rln --include='*.ts' --include='*.mjs' "\bS\b" \
  examples skills scripts tests packages \
  ../looprun-bench ../agentspec ../../yntelli/yntelli 2>/dev/null | grep -v node_modules
```

Classify: **public** (hit in examples/skills/scripts/looprun-bench/agentspec/yntelli), **internal** (hits only in `packages/*` outside core, i.e. backends/eval/server), **delete** (hits only in `packages/core` src/tests, or nowhere).

- [ ] **Step 3: Write the inventory doc**

Table format, one row per symbol, grouped by package. Include a "pre-seeded evidence" note: `findContradictions, findDuplications, findMultiOwnerSubjects, findSubjectlessLines, findUnassessableLines, foldRow, foldPrompt, withPolarityLexicon, derivePolarity, deriveSubject, assembledPromptLines, mutatorLines, isSingleClause, DEFAULT_POLARITY_LEXICON, chainOrder, renderPromptBlocks` already measured at zero non-test usage (2026-07-28 scan) — re-verify, don't trust.

- [ ] **Step 4: Commit**

```bash
git checkout -b simplification
git add docs/superpowers/specs/2026-07-28-symbol-inventory.md
git commit -m "docs: symbol usage inventory for simplification"
```

---

### Task 2: Tutorial outline as API contract (Phase 1)

**Files:**
- Create: `docs/tutorial/00-outline.md`

**Interfaces:**
- Consumes: inventory verdicts (Task 1).
- Produces: per-chapter list of the exact public symbols each chapter teaches. Union of these lists = the target public API. Tasks 3–7 converge `index.ts` files onto it.

- [ ] **Step 1: Write the outline**

One page: for each chapter `01-concepts, 02-hello-world, 03-agent-anatomy, 04-guards, 05-running-and-eval, 06-advanced` — goal (1 sentence), symbols taught (explicit list drawn from inventory "public" verdicts), example used. Every inventory "public" symbol must appear in exactly one chapter; if it fits nowhere, downgrade its verdict to internal in the inventory doc (record the change).

- [ ] **Step 2: Commit**

```bash
git add docs/tutorial/00-outline.md docs/superpowers/specs/2026-07-28-symbol-inventory.md
git commit -m "docs: tutorial outline — the public API contract"
```

---

### Task 3: core internal subpath + spec surface cut (Phase 2a)

**Files:**
- Create: `packages/core/src/internal.ts`
- Modify: `packages/core/package.json` (add `./internal` to `exports`, mirroring the existing `./testing` entry), `packages/core/src/index.ts`, `packages/core/src/spec.ts`
- Modify: import sites in `packages/mastra/src/*`, `packages/eval/src/*`, `packages/server/src/*` to import internals from `@looprun-ai/core/internal`
- Test: existing suites (`packages/core/test/agent-spec.test.ts` et al.)

**Interfaces:**
- Produces: `@looprun-ai/core` exports only inventory-"public" symbols; `@looprun-ai/core/internal` re-exports the inventory-"internal" symbols (e.g. `resolveBindings`, `resolveGuards`, `resolveMutators` if verdicts say so). Later tasks import internals from the subpath only.

- [ ] **Step 1: Add the subpath**

`packages/core/package.json` exports gains:

```json
"./internal": { "types": "./dist/internal.d.ts", "default": "./dist/internal.js" }
```

`packages/core/src/internal.ts` starts as explicit re-exports of every spec.ts symbol whose verdict is "internal".

- [ ] **Step 2: Cut `index.ts` down to the contract**

Rewrite `packages/core/src/index.ts` so its exports match exactly the Task 2 contract for core. Delete symbols with "delete" verdicts from `spec.ts` (and their tests).

- [ ] **Step 3: Fix all compile errors by switching backends to the subpath**

```bash
pnpm -r build   # follow the errors; each fix is `from '@looprun-ai/core'` → `from '@looprun-ai/core/internal'`
```

- [ ] **Step 4: Verify** — `pnpm -r build && pnpm test` green.

- [ ] **Step 5: Commit** — `refactor(core)!: public API = tutorial contract; internals move to @looprun-ai/core/internal`

---

### Task 4: Split guards.ts into per-category files + catalog data (Phase 2b)

**Files:**
- Create: `packages/core/src/guards/` — `flow.ts` (requiresBefore, forbidThisTurn, maxCalls, noDuplicateCall, canonArgs), `args.ts` (argRequired, argAbsent, argFormat), `world.ts` (precondition, resultInvariant, consentRequired), `confirmation.ts` (confirmFirst, noActAfterAskSameTurn, destructiveThrottle, pendingConfirmMustAsk), `honesty.ts` (noFabricatedSuccess, destructiveClaimRequiresSuccess, noFalseFailureClaim, noOutOfSurfaceActionClaim, noUngroundedRegulatedFigure, noCompetitorClaim), `reply.ts` (replyMustMention, replyMaxOccurrences, replySingleQuestion, replyConfirmsLabels, emptyReply, degenerationGuard, minimalDisclosure, noInstructionFromData, jargonScrub), `custom.ts` (custom), `catalog.ts` (see Step 2), `index.ts` (re-exports all of the above so `packages/core/src/index.ts` keeps a single import site)
- Delete: `packages/core/src/guards.ts` (constants `DENY_ONLY_PROSE_KINDS`, `CONFIRM_CLASS_KINDS`, `ARMED_SEAMS` move into `catalog.ts`)
- Test: `packages/core/test/guards-purity.test.ts`, `packages/core/test/guard-catalog-parity.test.ts` (update import paths only; behavior identical)

**Interfaces:**
- Consumes: guard factory signatures unchanged from today's `guards.ts`.
- Produces: `GUARD_CATALOG: readonly GuardCatalogEntry[]` from `catalog.ts`, exported publicly — Task 10 renders chapter 04 from it.

- [ ] **Step 1: Move code, no behavior change** — cut/paste each factory into its category file; `guards/index.ts` re-exports everything; run `pnpm -C packages/core test` after each file to keep the diff honest.

- [ ] **Step 2: Write the catalog data**

```ts
// packages/core/src/guards/catalog.ts
export interface GuardCatalogEntry {
  name: string;            // factory name, e.g. 'confirmFirst'
  category: 'flow' | 'args' | 'world' | 'confirmation' | 'honesty' | 'reply';
  summary: string;         // one line: what it enforces
  whenToUse: string;       // one or two lines: the situation that calls for it
  example: string;         // minimal TS snippet, compilable in isolation
}
export const GUARD_CATALOG: readonly GuardCatalogEntry[] = [ /* one entry per factory above */ ];
```

- [ ] **Step 3: Write the parity test** (extend `guard-catalog-parity.test.ts`): every exported guard factory has exactly one `GUARD_CATALOG` entry and vice versa; every `example` string contains the factory name.

- [ ] **Step 4: Verify** — `pnpm -r build && pnpm test` green; `wc -l packages/core/src/guards/*.ts` all ≤ 500.

- [ ] **Step 5: Commit** — `refactor(core): split guards.ts into per-category files + GUARD_CATALOG data`

---

### Task 5: Cut coherence, trim assembled prompt (Phase 2c)

**Files:**
- Modify: `packages/core/src/coherence.ts` (expected outcome per pre-seeded evidence: delete file, keeping only whatever `assembled-prompt.ts` imports — inline those pieces into `assembled-prompt.ts` or a private `prompt-fold.ts`), `packages/core/src/assembled-prompt.ts`, `packages/core/src/index.ts`, `packages/core/src/internal.ts`
- Delete: the coherence-query tests in `packages/core/test/` that test deleted symbols (per inventory; do not delete tests of surviving internals — move those symbols' tests to import from `/internal`)

**Interfaces:**
- Consumes: inventory verdicts for all 20+ coherence/assembled prompt symbols.
- Produces: public assembled prompt API is at most `renderAssembledPrompt` (verdict-dependent); everything else internal or gone.

- [ ] **Step 1: Apply verdicts** — delete "delete"-verdict symbols and their tests; move "internal" ones to `internal.ts`.
- [ ] **Step 2: Verify** — `pnpm -r build && pnpm test` green; `grep -rn 'coherence' packages/*/src` returns only intentional survivors.
- [ ] **Step 3: Commit** — `refactor(core)!: remove unused coherence queries; assembled prompt provenance goes internal`

---

### Task 6: Runtime goes internal (Phase 2d)

**Files:**
- Modify: `packages/core/src/index.ts` (runtime exports shrink to the types a LoopRunAgent user sees in results: `TurnRecord`, `RunResult`, `TokenUsage`, `ToolDef` — final list from the Task 2 contract), `packages/core/src/internal.ts` (gains ledger/terminal/prompt machinery: `createLedger`, `beginTurn`, `recordVeto`, `recordToolResult`, `recordTerminal`, `recordTerminalCall`, `pruneSupersededTerminals`, `vetoStormHit`, `VETO_STORM_LIMIT`, `terminalProtocol`, `forcedTerminalPrompt`, `terminalToolDefs`, `TERMINAL_TOOLS`, `isTerminal`, …)
- Modify: import sites in `packages/mastra/src/*`, `packages/eval/src/*`, `packages/server/src/*`

**Interfaces:**
- Produces: `@looprun-ai/core` runtime surface = result/record types only; the governed-turn machine is a backend implementation detail behind `/internal`.

- [ ] **Step 1: Move exports per verdicts; fix backend imports** (`pnpm -r build` drives the error list).
- [ ] **Step 2: Verify** — `pnpm -r build && pnpm test` green.
- [ ] **Step 3: Commit** — `refactor(core)!: governed-turn machine becomes internal; public runtime surface is result types`

---

### Task 7: Mastra facade trim + agent.ts split (Phase 2e)

**Files:**
- Modify: `packages/mastra/src/index.ts` — public exports shrink to the Task 2 contract (expected: `LoopRunAgent`, `createLoopRunAgent`, config/result types, `runSpecConversation`, `SessionStore`, `worldFromTools`, plus the `@looprun-ai/core` re-export). `makeGuardHooks`, `makeInputProcessors`, `repeatedToolCallStop`, `buildWorldTools`, `buildTerminalTools`, `jsonSchemaToZodObject`, `jsonTypeToZod`, `surfaceFingerprint`, `compileSpec` follow their inventory verdicts (expected internal). Mastra gets no `/internal` subpath: these simply stop being exported from `index.ts` and stay module-local — all their consumers live inside the package, and mastra's own tests import the module files directly.
- Modify: `packages/mastra/src/agent.ts` (551 lines) — split so no file exceeds 500 lines; extract the run-result/meta assembly into `packages/mastra/src/run-meta.ts` (or another cohesive seam found during the split; the constraint is the 500-line cap plus one clear responsibility per file, not the exact filename).
- Modify: `examples/*` that import trimmed symbols (inventory says which; expected: none, examples import `looprun`/`looprun/mastra`/`looprun/models` top-level only).

**Interfaces:**
- Consumes: `@looprun-ai/core/internal` (Tasks 3, 6).
- Produces: `new LoopRunAgent({ spec, world, model })` unchanged in behavior — the single teachable facade. `packages/looprun` root re-exports are updated to match.

- [ ] **Step 1: Trim index exports; fix in-repo consumers; split agent.ts.**
- [ ] **Step 2: Verify** — `pnpm -r build && pnpm test` green; `wc -l packages/mastra/src/*.ts` all ≤ 500; every `examples/*` package builds.
- [ ] **Step 3: Commit** — `refactor(mastra)!: LoopRunAgent facade only; split agent.ts`

---

### Task 8: Tutorial snippet harness

**Files:**
- Create: `docs/tutorial/snippets/package.json`, `docs/tutorial/snippets/tsconfig.json`, `docs/tutorial/snippets/*.ts` (one file per chapter as chapters land: `02-hello-world.ts`, `03-agent-anatomy.ts`, …)
- Modify: `pnpm-workspace.yaml` (add `docs/tutorial/snippets`), root `package.json` (snippets covered by `pnpm -r --if-present typecheck`)

**Interfaces:**
- Produces: every code block in tutorial chapters exists verbatim as (part of) a compiled snippet file; chapters cite their snippet file at the top.

- [ ] **Step 1: Create the workspace package**

```json
// docs/tutorial/snippets/package.json
{
  "name": "@looprun-internal/tutorial-snippets",
  "private": true,
  "type": "module",
  "scripts": { "typecheck": "tsc --noEmit" },
  "devDependencies": { "typescript": "catalog:" },
  "dependencies": { "looprun": "workspace:*" }
}
```

(Match the `typescript` version reference style used by other packages in the workspace — copy from `packages/core/package.json` if there is no catalog.)

- [ ] **Step 2: Seed with a trivial compiling snippet; verify** `pnpm -C docs/tutorial/snippets typecheck` passes and runs as part of `pnpm -r --if-present typecheck`.
- [ ] **Step 3: Commit** — `chore(docs): tutorial snippet package — snippets compile or CI fails`

---

### Task 9: Chapters 01–03 (concepts, Hello World, anatomy)

**Files:**
- Create: `docs/tutorial/01-concepts.md`, `docs/tutorial/02-hello-world.md`, `docs/tutorial/03-agent-anatomy.md`, `docs/tutorial/snippets/02-hello-world.ts`, `docs/tutorial/snippets/03-agent-anatomy.ts`
- Sources to absorb (read before writing; delete happens in Task 12): `docs/overview.md`, `docs/getting-started.md`, `docs/illustrated-guide.md`, `docs/guides/mcp-tools.md`

**Interfaces:**
- Consumes: final public API from Tasks 3–7; symbols-per-chapter lists from `00-outline.md`.

- [ ] **Step 1: Write 01-concepts** — the problem (ungoverned agent loops), the mental model (spec = map, guards = safety kit, agent = GPS), an ASCII diagram of AgentSpec → LoopRunAgent → world/tools → guards vetoing a turn. No code beyond fragments.
- [ ] **Step 2: Write 02-hello-world** — `npm i looprun` + smallest runnable LoopRunAgent (~20 lines), copied verbatim from `snippets/02-hello-world.ts` which must typecheck.
- [ ] **Step 3: Write 03-agent-anatomy** — AgentSpec fields (scope, tools, terminal policy, guard bindings) each shown on a small working spec from `snippets/03-agent-anatomy.ts`; one relationship diagram covering every class named in the chapter.
- [ ] **Step 4: Verify** — `pnpm -C docs/tutorial/snippets typecheck` green; every fenced TS block in the three chapters appears in a snippet file (manual diff).
- [ ] **Step 5: Commit** — `docs: tutorial chapters 01–03`

---

### Task 10: Chapter 04 — guard catalog

**Files:**
- Create: `docs/tutorial/04-guards.md`, `docs/tutorial/snippets/04-guards.ts`, `scripts/gen-guards-chapter.mjs`
- Modify: root `package.json` scripts (`"docs:guards": "node scripts/gen-guards-chapter.mjs"`)
- Consumes: `GUARD_CATALOG` from Task 4.

- [ ] **Step 1: Write the generator** — `scripts/gen-guards-chapter.mjs` imports `GUARD_CATALOG` from the built `@looprun-ai/core`, renders `04-guards.md`: intro (hand-written header block preserved between `<!-- generated -->` markers), then one section per category, one subsection per guard (`summary`, `whenToUse`, `example` fenced block). Fails (exit 1) if the file on disk differs from the render — doubling as a drift test wired into root `test` script.
- [ ] **Step 2: Fill `GUARD_CATALOG` entries for real** — every `whenToUse` must answer "which situation calls for this guard over its neighbors"; every `example` compiles inside `snippets/04-guards.ts`.
- [ ] **Step 3: Verify** — `pnpm docs:guards` clean, snippets typecheck, `pnpm test` green.
- [ ] **Step 4: Commit** — `docs: chapter 04 guard catalog, generated from GUARD_CATALOG`

---

### Task 11: Chapters 05–06 (running/eval, advanced)

**Files:**
- Create: `docs/tutorial/05-running-and-eval.md`, `docs/tutorial/06-advanced.md`, `docs/tutorial/snippets/05-running-and-eval.ts`, `docs/tutorial/snippets/06-advanced.ts`
- Sources to absorb: `docs/guides/eval-config.md`, `docs/guides/measured-loop.md` (→ 05), `docs/guides/local-models.md`, `packages/server/README.md`, `packages/vercel/README.md` content (→ 06)

- [ ] **Step 1: Write 05** — `runSpecConversation` for scripted runs, `looprun-eval` CLI walkthrough (real command outputs, re-run to confirm), the measured loop.
- [ ] **Step 2: Write 06** — OpenAI-compatible server, Vercel AI SDK adapter, local models via `looprun/models`; each with a snippet-backed minimal setup.
- [ ] **Step 3: Verify** — snippets typecheck; CLI commands in 05 re-executed and outputs pasted from the actual run.
- [ ] **Step 4: Commit** — `docs: tutorial chapters 05–06`

---

### Task 12: Sweep (Phase 3)

**Files:**
- Delete: `docs/overview.md`, `docs/getting-started.md`, `docs/illustrated-guide.md`, `docs/examples.md`, `docs/references.md`, `docs/guides/` (entire dir), `docs/tutorial/00-outline.md` (superseded by the chapters themselves)
- Modify: `README.md` (short: what looprun is, install, 10-line teaser from 02-hello-world, table of tutorial links, benchmarks link), `skills/looprun-governance/**` (update any API references to the new surface), `docs/benchmarks.md` untouched
- Create: `.changeset/simplification-major.md` (major bump for all `@looprun-ai/*` + `looprun`), `docs/superpowers/specs/2026-07-28-migration-notes.md` (old symbol → new location table for agentspec skill, looprun-bench, yntelli — executed in those repos separately)

- [ ] **Step 1: Delete superseded docs; fix every dangling link** (`grep -rn 'docs/\(overview\|getting-started\|illustrated-guide\|examples\|references\|guides\)' . --include='*.md' --include='*.ts' --include='*.json' | grep -v node_modules` must return nothing).
- [ ] **Step 2: Rewrite README; update governance skill references.**
- [ ] **Step 3: Write migration notes + changeset.**
- [ ] **Step 4: Final verify** — `pnpm -r build && pnpm test && pnpm docs:guards` green; `wc -l packages/*/src/**/*.ts | sort -rn | head` shows nothing above 500.
- [ ] **Step 5: Commit and open PR** — `git push -u origin simplification`; PR body summarizes cuts (from inventory) and links the design spec.

---

## Task order & dependencies

```
1 inventory ──► 2 outline ──► 3 core spec/internal ──► 4 guards split ──► 5 coherence cut
                                                                          │
                                              6 runtime internal ◄────────┘
                                              7 mastra facade ◄── 6
        8 snippet harness (any time after 2) ──► 9 ch 01–03 (after 7)
                                                 10 ch 04 (after 4 + 8)
                                                 11 ch 05–06 (after 7 + 8)
                                                 12 sweep (after all)
```
