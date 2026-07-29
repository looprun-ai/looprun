---
date: 2026-07-29
slug: core-internal-subpath
change_kind: runtime
target: public-surface
summary: core: public barrel cut to the 51-symbol tutorial contract; the internal seam moves to @looprun-ai/core/internal
isolated: 212/212
collective: 55/55
coverage: 29/29
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — core: public barrel cut to the 51-symbol tutorial contract; the internal seam moves to @looprun-ai/core/internal

**Scope:** `runtime` · **Date:** 2026-07-29 · **Verdict:** PASS

## What changed
Commits `5b5e30f` and `e6860ec` (branch `worktree-simplification`, simplification Task 3). This record
is written **retroactively**: both commits touch `packages/core/src/**` and shipped without a record,
which the branch-level gate could not see because a later record in the same diff satisfied it. The
suite tallies below were re-run at HEAD, so they attest the branch's current state, not a snapshot
taken the day those commits landed.

- `packages/core/src/index.ts` now exports exactly the **51** symbols the tutorial contract claims
  (`docs/tutorial/00-outline.md` §4, chapters 03/04/05) — down from 97 runtime values plus their types.
- The 37 `internal`-verdict symbols move to the new **`@looprun-ai/core/internal`** subpath: the
  guard-catalog tables, spec binding resolution, the trunk renderer, model settings, and the whole
  governed-turn seam (ledger + terminal protocol + prompt renderer + turn machine). No compatibility
  promise attaches to that subpath.
- `delete`-verdict symbols left the barrel only — **no implementation was erased** in these two
  commits (the inventory's §2 rule). In-repo consumers (mastra, eval) and the core/mastra tests were
  repointed at the subpath or the owning module file.
- `e6860ec` added the type-closure rider, an honest barrel header, a catchable `GuardExecutionError`,
  and the surface lock.

**Behavior-preserving by construction:** no `check()`, no `prose()`, no binding, no hook, and no
rendered byte was touched — the change is which module names a symbol, not what any symbol does.

## Proof cases
No guard changed, so no guard proof changed: coverage stayed at **29/29 kinds** across both commits.
Two NEW gates were added instead, and they are what makes the surface cut enforceable rather than
merely done:

- `packages/core/test/proofs/surface-lock.test.ts` — pins the exact export sets of `.` (51) and
  `/internal`, so a symbol cannot re-enter or leave the public API without an explicit edit to the
  lock. Every later task on this branch, including Task 5, runs against it.
- `packages/core/test/proofs/declaration-emit.test.ts` + the two `declaration-consumer/` fixtures —
  compile a real public consumer and a real internal consumer against the emitted `.d.ts`, so the
  type closure is proven from the outside rather than assumed.

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
**PASS.** Re-run at HEAD: proofs 495/495, coverage 29/29 kinds, full suite 811 tests green. The
commits' own contemporaneous claim was 773 tests passing when `5b5e30f` landed; the count grew as
later tasks added lanes.

Residual: this record is retroactive, so it attests the *state* of the branch, not an
at-the-time run. The three branch records (this one, `guards-split-catalog`,
`trunk-fold-coherence-cut`) together cover all 24 governed paths (the count the gate reports: `--diff-filter=ACMR`, so erased files are not in it) in `main...HEAD`.
