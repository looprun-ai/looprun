# Migration notes — the simplification release

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
| `renderTurnPrompt` | `@looprun-ai/core` | `@looprun-ai/core/internal` | change the specifier |
| `loadSubject`, `agentForCase`, `stripGovernance` | `@looprun-ai/eval` | **unchanged** | none — `synth-fork.mjs`'s computed import still resolves |
| `mintSeal`, `verifySeal` | `@looprun-ai/eval` | **unchanged** | none |
| `validateSpec` | `@looprun-ai/core` | **unchanged** | none |

Three **reference-catalog corrections** are owed in that repo, independent of the specifier change:

1. **`forbidThisTurn` semantics.** The agentspec reference describes it as a repeat detector. It is
   not: its check is `() => reason` with no turn logic, so the ban holds for the **binding's
   lifetime** and the *first* call is denied too. The name is historical. `noDuplicateCall` is the
   kind for "the first call is legitimate, the repeat is not." `packages/core/src/guards/catalog.ts`
   carries the corrected wording — copy it.
2. **`lint-guard-catalog.mjs` path.** It scans `packages/core/src/guards.ts`, which no longer exists.
   The factories now live in `packages/core/src/guards/` (per-category files). Point the lint at the
   directory. **Today it SKIPs silently** on the missing path rather than failing, so this will not
   announce itself.
3. **Stale `dist/guards.d.ts`.** Any vendored or cached copy of the old single-file declaration will
   still resolve and mask the change.

### `looprun-bench`

| symbol | before | after | action |
|---|---|---|---|
| `runSpecConversation` | `@looprun-ai/mastra` | **unchanged** | none — the main entry point is intact |
| `createLedger`, `beginTurn`, `renderTurnPrompt`, `evaluatePreTool`, `recordToolResult`, `isTerminal`, `terminalProtocol`, `forcedTerminalPrompt`, `finalizeReply` | `@looprun-ai/core` | `@looprun-ai/core/internal` | change the specifier — these nine are the "bring your own loop" seam |
| `TrunkTheme`, `EvalCase`, `EvalConfig` | *(never existed)* | — | the bench's shim imports these **phantom** names; it does not typecheck against the current engine and did not before this release either. Fix or drop the shim |

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
| the `coherence` guard family + its trunk section | **deleted** (-396 LOC). The trunk fold is proven byte-identical across the change |
| `compileSpec` and the mastra compile primitives | **internal to `@looprun-ai/mastra`** — not on any barrel. Use `LoopRunAgent` or `runSpecConversation` |
| `createOpenAiHandler` | **module-local to `@looprun-ai/server`**. The same fetch-style handler is reachable as `createModelServer(...).handler` |
| `CaseDump` | **module-local to `@looprun-ai/eval`**. The on-disk `cases.jsonl` shape is unchanged; only the exported type name is gone |
| `uploadDisplayLabels`, `isReplyOnly` | **module-local** helpers inside `renderTurnPrompt`. They were exported but never documented or imported |
| `GUARD_CATALOG`, `GuardCatalogEntry`, `GuardExecutionError` | `@looprun-ai/core/internal` — documentation/diagnostic infrastructure, deliberately not taught |
| `MCPClient.getTools()` | **`listTools()`** in Mastra v1 (`getTools` is deprecated; codemod `v1/mcp-get-tools`). Affects native-tools mode call sites, not looprun's own API |
| `docs/tutorial/00-outline.md` | moved to `docs/superpowers/specs/2026-07-28-tutorial-outline-final.md`. It is cited by path from all six `src/index.ts` barrels and their surface-lock tests |

Package `CHANGELOG.md` entries that announced now-removed symbols are **left unedited**: they are an
accurate record of what those versions shipped, not live documentation.

---

## 4. DECISIONS — carried forward, NOT made by this release

These are the two open items from the tutorial outline's §6 decision table. They were scheduled for
Task 12 and are **user decisions**; Task 12 deliberately did not settle them. Reproduced verbatim:

> **Decision 5 — Import specifiers** · owner: Task 12
>
> **Import specifiers:** 02 `looprun/mastra` · 03 `looprun` · 04 `looprun` · 05 `looprun/mastra` +
> `looprun` + `looprun/models` + **`@looprun-ai/eval`** · 06 **`@looprun-ai/server`** +
> `looprun/models` + `looprun/mastra`. The facade publishes only `.` `./core` `./mastra` `./models`
> `./vercel`. **Open: add `looprun/eval` + `looprun/server` facades** so the tutorial uses one
> package name throughout?

> **Decision 6 — `@looprun-ai/vercel` fate** · owner: Task 12
>
> **`@looprun-ai/vercel` is excluded from the tutorial** (non-functional stub). Package fate — ship,
> fix or drop — is a Task 12 decision to surface to the user.

**Status of each, as left by Task 12:**

| # | what Task 12 did | what is still owed |
|---|---|---|
| 5 | **Nothing.** Chapters 05 and 06 name `@looprun-ai/eval` and `@looprun-ai/server` directly, and 06 says so explicitly in a callout that cites this decision. Adding the two facade subpaths would change the specifier in the tutorial and nothing else — no code moves | **NEEDS USER DECISION**: add `looprun/eval` + `looprun/server`, or keep the direct package names |
| 6 | **Left as-is.** `@looprun-ai/vercel` still ships as a reserved stub: `createLoopRunAgent()` throws, `VercelBackendConfig` is a type, and the README documents the three-glue-point backend seam. Task 12 added the missing note that those seam primitives live on `@looprun-ai/core/internal`. It is listed in the README package table as "reserved" | **NEEDS USER DECISION**: ship the stub as-is, implement the backend, or drop the package before the major release |

Both ride the same major bump either way — decision 5 only **adds** subpaths, and decision 6 changes
a package that has never had a working implementation.
