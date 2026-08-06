---
date: 2026-08-03
slug: as-is-prose-sweep
change_kind: docs
target: all
summary: engine comments + GUARDS.md state constraints in the present tense; TurnClaim renamed to Intention (type-only, zero runtime footprint)
isolated: 152/152
collective: 36/36
coverage: 22/22
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — engine comments + GUARDS.md state constraints in the present tense; TurnClaim renamed to Intention (type-only)

**Scope:** `guard:all` · **Date:** 2026-08-03 · **Verdict:** PASS

## What changed

Three governed surfaces are touched, all of them by prose plus one type-only rename.

**1. `packages/core/src/**` and `packages/mastra/src/**` — comments and doc-comments.** Every
doc-comment, inline comment and `GUARD_CATALOG` description now states its design constraint in the
present tense. The reasoning is kept, rewritten as a counterfactual (what a weaker rule would admit)
rather than as narration of a past version. Removed throughout: batch/round/date citations that only
parse for a reader who lived a past redesign, and comment blocks whose only content was a list of
removed symbols.

**2. `packages/core/GUARDS.md` — the guard contract, prose only.** Same treatment. Every guard-kind
identifier the file names is verified present in `src/guards/catalog.ts`; names of kinds that do not
exist were removed rather than annotated. No rule, threshold, hook, dim or classification changed. One
factual correction: §2 named `ruleSections`, which does not exist — the function is `ruleBlocks`
(`src/assembled-prompt.ts`).

**3. `TurnClaim` → `Intention`.** One type alias carried two names. `TurnClaim` was never exported
from `src/index.ts` or `src/internal.ts`, so this is not a public-surface change.

## Why this cannot alter guard behavior — established mechanically

The governed diff (`packages/core/src`, `packages/core/GUARDS.md`, `packages/mastra/src`) is 1244
changed lines. Filtering out lines whose content begins with a TypeScript comment prefix (`//`, `/*`,
`*`) or is blank leaves 307 lines, all of which are `GUARDS.md` markdown prose except for the residue
below, which is the complete set of non-comment changed lines in the governed TypeScript:

| bucket | what it is | why it cannot alter a verdict |
|---|---|---|
| 4 `GUARD_CATALOG` string pairs (`summary` / `whenToUse` on `forbidThisTurn`, `claimIsGrounded`, `claimCoversRubric`, `degenerationGuard`) | documentation data | read only by `scripts/gen-guards-chapter.mjs`; no enforcement path reads either field |
| the `TurnClaim` → `Intention` rename (type annotations, `import type` lines, the alias declaration) | type-only | every occurrence is in a type position, so it is erased at compile time |
| 1 trailing `//` comment on an otherwise byte-identical line | comment | — |

The type-erasure claim is checked against the emitted artifact, not asserted: `grep -rn
"TurnClaim\|\bIntention\b" packages/core/dist --include="*.js"` returns hits only inside comment text —
no value-position occurrence exists in any emitted `.js`.

**No factory, `check`, `prose`, `dim`, `hook`, `category`, `example`, export or classification registry
changed.**

## Proof cases

n/a — no new cases are owed. Nothing executable changed on a governed path, so no guard gains or loses
a behavior that a positive/negative/neutral triple could pin. The existing suite is re-run below as the
regression statement.

## Results

Recorded from `governance/.artifacts/proofs.json` (`scripts/proofs/run-proofs.mjs`):

| lane | pass/total |
|---|---|
| isolated (L1 + L3) | 152/152 |
| collective | 36/36 |
| ratchet | 44/44 |
| coverage (kinds fully proven) | 22/22 |
| **all** | **369/369** |

## SLM canary (advisory)

Not run for this change (report-only lane; never gates the PR).

## Verdict & residuals

**PASS.** `pnpm proofs:run` 369/369. Also green at HEAD: `pnpm -r typecheck` (9 projects), `pnpm test`
(core 1065, mastra 215, eval 129, server 28, models 16, tutorial snippets 12), `node
tests/no-bench-drift.test.mjs`, `node scripts/gen-guards-chapter.mjs --check`.

**Residuals.**

1. Core's suite reads 1065 rather than 1067. Two assertions were removed from
   `test/redteam/batch-c.test.ts`; each checked only that a symbol is absent from the public barrel.
   `test/proofs/surface-lock.test.ts` asserts `expect(publicExports).toEqual([...TAUGHT,
   ...RIDERS].sort())` — an exact set equality — so re-introducing either symbol still fails CI. No
   invariant was lost.
2. `governance/MATRIX.md` is generated from the `summary` frontmatter of the dated proof records. Those
   records are historical documents by genre and were not rewritten, so the matrix still carries their
   wording. Correcting it means correcting the records, which is a separate decision.
