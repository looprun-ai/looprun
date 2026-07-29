---
date: 2026-07-29
slug: task-12-doc-sweep
change_kind: docs
target: —
summary: Task 12 sweep: comment-only edits on governed paths (agent.ts getTools to listTools per Mastra v1; outline path rewrites; Task-N forward refs resolved)
isolated: 212/212
collective: 55/55
coverage: 29/29
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — Task 12 sweep: comment-only edits on governed paths (agent.ts getTools to listTools per Mastra v1; outline path rewrites; Task-N forward refs resolved)

**Scope:** `docs` · **Date:** 2026-07-29 · **Verdict:** PASS

## What changed

Six files under the two governed prefixes (`packages/core/src/`, `packages/mastra/src/`) were
touched. **Every edit is inside a comment or a JSDoc block. Not one executable token changed.**

| file | edit |
|---|---|
| `packages/mastra/src/agent.ts` | `LoopRunAgentConfig.tools` JSDoc: `await mcp.getTools()` → `await mcp.listTools()`. `getTools` is deprecated in Mastra v1 (codemod `v1/mcp-get-tools`); chapter 06 already taught `listTools`, so this JSDoc was the last stale copy |
| `packages/core/src/index.ts` · `internal.ts` · `guards/index.ts` · `packages/mastra/src/index.ts` | doc-comment path rewrites: `docs/tutorial/00-outline.md` → `docs/superpowers/specs/2026-07-28-tutorial-outline-final.md` (the outline moved; it is cited by path from every barrel) |
| `packages/core/src/internal.ts` | dropped a forward `Task 10` reference from shipped source; the surrounding ruling text is unchanged |
| `packages/core/src/guards/catalog.ts` | dropped a forward `Task 10` reference, naming `scripts/gen-guards-chapter.mjs` (the actual generator) instead |

## Proof cases

**The move-only / comment-only claim is mechanically established**, not asserted:

```
$ git diff -U0 packages/core/src/ packages/mastra/src/ \
    | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | grep -vE '^[+-]\s*(\*|//|/\*)'
(no output)
```

Every added and removed line in the governed diff begins with a comment marker. A behavior change is
therefore not merely unlikely — it is not expressible by this diff. `GUARD_CATALOG` is unchanged in
content (`pnpm docs:guards` reports both artifacts up to date at 30 catalog rows), so the generated
chapter and the parity test are unaffected.

The suite was run anyway, in full, and is reported below unchanged from the pre-edit run.

## Results
Recorded from `governance/.artifacts/proofs.json` (`scripts/proofs/run-proofs.mjs`):

| lane | pass/total |
|---|---|
| isolated (L1 + L3) | 212/212 |
| collective | 55/55 |
| ratchet | 58/58 |
| coverage (kinds fully proven) | 29/29 |
| **all** | **495/495** |

## SLM canary (advisory)
Not run for this change (report-only lane; never gates the PR).

## Verdict & residuals
**PASS.**

_None._
