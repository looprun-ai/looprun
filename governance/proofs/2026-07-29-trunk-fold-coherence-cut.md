---
date: 2026-07-29
slug: trunk-fold-coherence-cut
change_kind: runtime
target: trunk-fold
summary: core: coherence queries erased; the trunk table + fold survive as trunk-fold.ts (module-local)
isolated: 212/212
collective: 55/55
coverage: 29/29
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — core: coherence queries erased; the trunk table + fold survive as trunk-fold.ts (module-local)

**Scope:** `runtime` · **Date:** 2026-07-29 · **Verdict:** PASS

## What changed
core: coherence queries erased; the trunk table + fold survive as trunk-fold.ts (module-local)

## Proof cases
No guard was touched, so no guard proof changed: the ratchet still computes **29/29 kinds**, the same
number as before this change. What moved is the MECHANISM proof
(`packages/core/test/proofs/trunk-provenance.test.ts`, classified `other` by `run-proofs.mjs` — it
carries no `L1 ·`/`L3 ·`/`proof completeness ·` id and therefore no coverage weight):

| kept | the invariant that gates everything else — `foldTrunk(renderTrunkBlocks(…))` is byte-identical to `renderScopedSpecTrunk(…)`; owner/section/hook/target provenance; subject + polarity derivation; the section-placement and dedup findings |
|---|---|
| **deleted with their subjects** | the census-query cases: `findContradictions` (4), `findDuplications` (2), `findMultiOwnerSubjects` (3, incl. the mutator-as-owner case), `mutatorLines` (2), `withPolarityLexicon` + injected `PolarityLexicon` (3), `findSubjectlessLines` (1 assertion) |
| **rewritten** | the mutator case now proves only what survives — a `ReplyMutator` has no `prose()`, so installing one leaves the rendered trunk byte-identical |

The deleted cases had no subject left to test: the queries they exercised were reachable from no entry
point (barrel, `/internal`, or any sibling package) and were erased in the same commit.

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
**PASS.** Guard behavior is untouched — no `check()`, no `prose()`, and no trunk byte changed (the
byte-identity case is the arbiter and it is green).

Residual: the trunk's attributed table is now QUERYABLE but no query ships. A future coherence census
re-authors its queries against `trunk-fold.ts`'s `TrunkLine[]`; the provenance it needs (owner /
section / hook / target / tool / subject / polarity) survives in full.
