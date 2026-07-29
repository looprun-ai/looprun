---
date: 2026-07-29
slug: guards-split-catalog
change_kind: runtime
target: guard-catalog
summary: core: guards.ts split byte-exactly into guards/ per category; GUARD_CATALOG ships on /internal
isolated: 212/212
collective: 55/55
coverage: 29/29
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — core: guards.ts split byte-exactly into guards/ per category; GUARD_CATALOG ships on /internal

**Scope:** `runtime` · **Date:** 2026-07-29 · **Verdict:** PASS

## What changed
Commits `08fecd0` and `4b59968` (branch `worktree-simplification`, simplification Task 4). Written
**retroactively**, for the same reason as the companion `core-internal-subpath` record: both commits
touch `packages/core/src/**` and shipped without one. Tallies below were re-run at HEAD.

- The 1427-line `packages/core/src/guards.ts` becomes `packages/core/src/guards/`, one file per
  tutorial category (flow · args · world · confirmation · honesty · reply · custom) plus `shared.ts`
  (module-local helpers), `catalog.ts` and `index.ts` (the single import site). **Every factory body
  moved verbatim** — the only edit inside moved code is the `export` prefix on the shared helpers.
- `catalog.ts` adds `GUARD_CATALOG`: one `GuardCatalogEntry` per exported factory (summary /
  whenToUse / example / `hook`), shipped on **`/internal`**, not the public barrel — documentation
  infrastructure, not authoring vocabulary. The three kind-classification registries
  (`DENY_ONLY_PROSE_KINDS`, `CONFIRM_CLASS_KINDS`, `ARMED_SEAMS`) moved with it, keeping their
  `/internal` export.
- `4b59968` added the `hook` axis to `GuardCatalogEntry`, sourced per entry from the factory's real
  installation phase (`spec.ts#DIM_HOOKS`), and rewrote three `whenToUse` strings.

**No guard behavior changed:** the split is a file move, and the catalog is data *about* guards, read
by documentation tooling — no `check()`, no `prose()`, no binding, no hook wiring was altered.

## Proof cases
Coverage held at **29/29 kinds** across both commits. The change added parity lanes — the gates that
make a byte-exact move verifiable instead of asserted:

- `guard-catalog-parity.test.ts` now **scans the directory**: every exported factory has exactly one
  catalog entry and vice versa, every entry's example calls its own factory, and every entry sits in
  the file that exports it. A factory added without a catalog row (or vice versa) fails.
- Second lane in `4b59968`: the `hook` field must be one of the four real phases, with the tricky rows
  spot-asserted (`noInstructionFromData`=preTool, `jargonScrub`=onReplyMutate,
  `resultInvariant`=postTool, `pendingConfirmMustAsk`=onReply).
- Gate hardening: both source-scanning tests dropped the `f !== 'shared.ts'` filename skip, which
  would have let a `Guard`-returning factory dropped into `shared.ts` escape the ratchet.
- The surface lock's INTERNAL array grew by the two new seam symbols; TAUGHT and RIDERS untouched.

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
**PASS.** Re-run at HEAD: proofs 495/495, coverage 29/29 kinds, full suite 811 tests green.

Residual: retroactive, so it attests the *state* of the branch rather than an at-the-time run. With
`core-internal-subpath` and `trunk-fold-coherence-cut` it completes coverage of all 24 governed paths (the count the gate reports: `--diff-filter=ACMR`, so erased files are not in it)
in `main...HEAD`.
