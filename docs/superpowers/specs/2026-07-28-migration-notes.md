# Migration notes — the simplification release

> **Status: REFERENCE — a register, not a spec; nothing owed.**

> **RECORD, not a spec.** Nothing here is owed. It states what the release changes for a consumer
> outside this repo, and §4 carries the two decisions the user owned, settled.

**Date:** 2026-07-29 · **Branch:** `worktree-simplification` · **Scope:** consumers outside this repo
**Companions:** [`2026-07-28-looprun-simplification-design.md`](2026-07-28-looprun-simplification-design.md) ·
[`2026-07-28-symbol-inventory.md`](2026-07-28-symbol-inventory.md) ·
[`2026-07-28-tutorial-outline-final.md`](2026-07-28-tutorial-outline-final.md)

The public API is now **exactly what the six tutorial chapters teach**. Everything else either moved
behind `@looprun-ai/core/internal` or was deleted. This file is the lookup table for the three
external repos that import looprun, plus the decisions this release does **not** make.

---

## 1. The three fates

```
  taught by a chapter        →  stays on the package barrel          (89 symbols)
  has a consumer, untaught   →  @looprun-ai/core/internal            (46 symbols)
  no consumer, untaught      →  deleted                             (138 symbols)
```

`@looprun-ai/core/internal` is a **real, published subpath with no compatibility promise**. It exists
so forks and harnesses that drive the governed turn themselves keep working; it moves with the
implementation and is not semver-stable. Only `.` is.

There is **no** `looprun/internal` facade subpath — the umbrella publishes `.`, `./core`,
`./mastra`, `./models`, `./vercel`. A consumer that needs `/internal` depends on
`@looprun-ai/core` directly.

---

## 2. Per-repo impact

### `agentspec` skill (private repo)

| symbol | before | after | action |
|---|---|---|---|
| `renderTurnPrompt` | `@looprun-ai/core` | `@looprun-ai/core/internal` | change the specifier in **TWO** scripts — see below |
| `loadSubject`, `agentForCase`, `stripGovernance` | `@looprun-ai/eval` | **unchanged** | none — `synth-fork.mjs`'s computed import still resolves |
| `mintSeal`, `verifySeal` | `@looprun-ai/eval` | **unchanged** | none |
| `validateSpec` | `@looprun-ai/core` | **unchanged** | none |

**`renderTurnPrompt` has two call sites, in two different scripts.** A maintainer who follows only
the row above will fix one and leave the other broken:

| script | import | calls |
|---|---|---|
| `skill/scripts/synth-fork.mjs` | `:105` `await importFromCwd('@looprun-ai/core')` | `:178`, `:190` |
| `skill/scripts/extract-fork.mjs` | `:184` `await importFromCwd('@looprun-ai/core')` | `:210`, `:222` |

Both resolve the package **at runtime from the user's cwd**, so neither fails at build time — they
fail on the user's machine, mid-phase. `skill/scripts/margin-simulate.mjs:35` and
`skill/references/test.md:236` cite the name in prose and want the same edit for accuracy.

Two further **reference corrections** are owed in that repo, independent of the specifier change:

1. **`forbidThisTurn` semantics.** The agentspec reference describes it as a repeat detector. It is
   not: its check is `() => reason` with no turn logic, so the ban holds for the **binding's
   lifetime** and the *first* call is denied too. The name is historical. `noDuplicateCall` is the
   kind for "the first call is legitimate, the repeat is not." `packages/core/src/guards/catalog.ts`
   carries the corrected wording — copy it.
2. **`lint-guard-catalog.mjs` reads a built declaration file, not repo sources.** The mechanism, from
   the script itself:

   ```js
   const entry = req.resolve('@looprun-ai/core');          // …/dist/index.js
   dts = readFileSync(join(dirname(entry), 'guards.d.ts'), 'utf8');
   } catch {
     console.log('guard-catalog parity: SKIPPED (engine not installed in this repo)');
   ```

   It resolves the **installed** package from `node_modules` and reads `guards.d.ts` sitting next to
   the built barrel. It never scans `packages/core/src/`. Since the split, the build emits
   `dist/guards/index.d.ts` and no `dist/guards.d.ts`, so the `readFileSync` throws and the catch
   prints **`engine not installed`** — a *false diagnosis*: the engine is installed, only the file
   moved. Parity silently stops being checked.

   The fix is three-part: read the built **`guards/index.d.ts`** (or, better, drop the `.d.ts`
   text-scraping entirely and `import { GUARD_CATALOG } from '@looprun-ai/core/internal'`, which is
   the array the parity test in this repo already uses); **narrow the catch** so a missing package and
   a moved file report differently; and treat a resolvable-but-unreadable engine as a **failure**, not
   a skip.

### `looprun-bench`

**The seam file is `benchmarks/tau2-telecom/harness/shim/src/step-handler.ts`** — one import block,
verified against the repo rather than inferred:

| symbol | before | after | action |
|---|---|---|---|
| `runSpecConversation` | `@looprun-ai/mastra` | **unchanged** | none — the main entry point is intact |
| `createActionHistory`, `beginTurn`, `evaluatePreTool`, `enforcePostTool`, `redriveMessage`, `finalizeReply`, `resolveGuards`, `renderAssembledPrompt`, `ReplyViolation` | `@looprun-ai/core` | `@looprun-ai/core/internal` | **change the specifier** — these nine are the whole "bring your own loop" seam the shim drives |
| `Guard`, `GuardCtx`, `ObservedCall` | `@looprun-ai/core` | **unchanged — public** | none. They are taught by chapter 04 and stay on the barrel (`ObservedCall` is used by `shim/src/transcript.ts`) |

The nine and the three above are the *complete* set: splitting `step-handler.ts`'s import block gives
exactly `createActionHistory`, `beginTurn`, `enforcePostTool`, `evaluatePreTool`, `finalizeReply`,
`redriveMessage`, `renderAssembledPrompt`, `resolveGuards`, `Guard`, `GuardCtx`, `ReplyViolation`. The
bench does **not** import `renderTurnPrompt`, `recordToolResult`, `isTerminal`, `terminalProtocol` or
`forcedTerminalPrompt` — zero occurrences repo-wide — so those need no action there.

#### The three names that never existed

`AssembledPromptTheme`, `EvalConfig` and `EvalCase` have **never** been on any looprun barrel, before or after
this release. They are not a shim problem — **the shim is clean** — and the affected sites are more
consequential than that:

| name | imported from | real sites |
|---|---|---|
| `AssembledPromptTheme` | `looprun` / `@looprun-ai/core` | **the whole Atlas v0.6.0 spec set** — `benchmarks/atlas/v0.6.0/specs/*/theme.ts` + `*/index.ts` across ~20 preset directories, plus `v0.6.1/specs/atlas-r2/`, `atlas/*/harness/src/load.ts`, and `tau2-telecom/harness/telecom/src/agents/telecom/theme.ts` (94 occurrences in 39 files) |
| `EvalConfig` | `@looprun-ai/eval` | `tau2-telecom/harness/telecom/looprun.eval.config.ts:9` (used at `:14`) |
| `EvalCase` | `@looprun-ai/eval` | `tau2-telecom/harness/telecom/evals/cases.ts:19` (used at `:21`) |

Stated plainly: **the Atlas v0.6.0 spec set — the code behind this README's `governed 96.5` headline —
does not typecheck against any published looprun, and did not before this release either.** Every
`theme.ts` needs `AssembledPromptTheme` defined locally (it is a structural type; declare the shape the theme
object already satisfies), and the two τ²-telecom files need the same for `EvalConfig`/`EvalCase`.
This is pre-existing and **not caused by the simplification** — but a maintainer reading this table
during the migration is exactly the right person to learn it.

Also: the bench carries a **vendored copy of the guard catalog** that predates the split. Re-vendor
from `packages/core/src/guards/catalog.ts` or drop it in favour of importing `GUARD_CATALOG` from
`@looprun-ai/core/internal`.

### `yntelli` webapps (Criaty, Beauty, Agent87)

| symbol | before | after | action |
|---|---|---|---|
| `LoopRunAgent`, `LoopRunAgentConfig`, `LoopRunOptions` | `looprun/mastra` | **unchanged** | none |
| `validateSpec`, `worldFromTools`, `StateView` | `looprun` / `looprun/mastra` | **unchanged** | none |
| `AgentSpecBase` + the 30 guard factories | `looprun` | **unchanged** | none |

**No action expected.** The migration off neurono targets the taught surface, which is precisely the
surface that survived.

---

## 3. Renames and removals worth knowing

| what | disposition |
|---|---|
| the `coherence` guard family + its assembled prompt section | **deleted** (-396 LOC). The assembled prompt fold is proven byte-identical across the change |
| `compileSpec` and the mastra compile primitives | **internal to `@looprun-ai/mastra`** — not on any barrel. Use `LoopRunAgent` or `runSpecConversation` |
| `createOpenAiHandler` | **module-local to `@looprun-ai/server`**. The same fetch-style handler is reachable as `createModelServer(...).handler` |
| `CaseDump` | **module-local to `@looprun-ai/eval`**. The on-disk `cases.jsonl` shape is unchanged; only the exported type name is gone |
| `uploadDisplayLabels`, `isReplyOnly` | **module-local** helpers inside `renderTurnPrompt`. They were exported but never documented or imported |
| `GUARD_CATALOG`, `GuardCatalogEntry`, `GuardExecutionError` | `@looprun-ai/core/internal` — documentation/diagnostic infrastructure, deliberately not taught |
| `MCPClient.getTools()` | **`listTools()`** in Mastra v1 (`getTools` is deprecated; codemod `v1/mcp-get-tools`). Affects native-tools mode call sites, not looprun's own API |
| `docs/tutorial/00-outline.md` | moved to `docs/superpowers/specs/2026-07-28-tutorial-outline-final.md`. It is cited by path from **five** of the six `src/index.ts` barrels (all but `vercel`, which has no taught surface), their surface-lock tests, and `pnpm-workspace.yaml` |

Package `CHANGELOG.md` entries that announced now-removed symbols are **left unedited**: they are an
accurate record of what those versions shipped, not live documentation.

### The inventory's §7.1 is NOT fully discharged

Three names carry a `delete` verdict in the symbol inventory that was **deliberately not realized**:

| symbol | where it still lives |
|---|---|
| `VETO_STORM_LIMIT` | `packages/core/src/runtime/action-history.ts:45` |
| `recordVeto` | `packages/core/src/runtime/action-history.ts:78` |
| `shouldFireChain` | `packages/core/src/runtime/turn.ts:382` |

They remain **module-level `export`s consumed only by tests** — off every public barrel and off
`/internal`, so no external consumer can reach them and none is affected. They are exported *by
design*, so the runtime's veto-storm and chain-firing logic can be asserted directly rather than only
through a full governed turn. Anyone auditing §7.1 against the shipped source will find these three
and should read the verdict as **intentionally unrealized**, not as missed work.

---

## 4. DECISIONS — the two the user owned, and how they stand

Both decisions from the tutorial outline's §6 table are settled.

**Decision 5 — import specifiers.** The `looprun` facade publishes `.` `./core` `./mastra`
`./models` `./vercel` and nothing more. Chapters 05 and 06 name `@looprun-ai/eval` and
`@looprun-ai/server` directly, and 06 carries a callout saying so:

```ts
// chapter 05
import { runCampaign } from '@looprun-ai/eval';
// chapter 02
import { createLoopRunAgent } from 'looprun/mastra';
```

The tutorial therefore writes two package names, and that is the accepted shape: a facade subpath
that exists only to smooth a tutorial sentence is a second name for one thing.

**Decision 6 — `@looprun-ai/vercel`.** It ships as a reserved stub. `createLoopRunAgent()` throws,
`VercelBackendConfig` is a type, the README package table lists it as "reserved", and the seam
primitives it names live on `@looprun-ai/core/internal`. The tutorial covers Mastra only and says
why, in `docs/tutorial/06-advanced.md`. Implementing the backend is a `BACKLOG.md` item and a launch
gate for the landing page — not a tutorial change.
