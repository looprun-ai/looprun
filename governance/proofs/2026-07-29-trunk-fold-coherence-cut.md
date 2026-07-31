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
The coherence QUERY layer in `packages/core/src/coherence.ts` (contradiction / duplication /
single-owner / subjectless-lint censuses) is erased. What `renderScopedSpecTrunk` transitively needs —
the attributed table types, `GUARD_KIND_SUBJECT`, `derivePolarity`, `deriveSubject`, `foldTrunk`
(+ now-private `foldRow`) — moves verbatim to the new module-local `packages/core/src/trunk-fold.ts`.
No entry point changed: the queries were already off the barrel (Task 3) and were never on
`/internal`.

**Two edits inside the survivors, both disclosed here because they are the only non-identical tokens:**

1. **`derivePolarity` loses its second parameter.** The injectable `PolarityLexicon` had exactly one
   caller — the erased census (`withPolarityLexicon`). Every in-repo call site passed no lexicon, so
   the default path is the only path that ever executed, and it is unchanged: same three regexes, same
   order, same results.
2. **`GUARD_KIND_SUBJECT` loses its `jargonScrub: 'term-substitution'` entry.** *Behaviorally inert,
   and here is the argument:* the table is read only by `deriveSubject`, which is reached only from
   `trunk.ts#line()`, which is called only while rendering a guard's `prose()`. `jargonScrub` is a
   `ReplyMutator` — `{ kind, apply }`, no `prose()` by construction (GUARDS.md §2) — so no `TrunkLine`
   can ever carry `guardKind: 'jargonScrub'` and the entry was unreachable from the renderer. Its only
   live reader was `mutatorLines`, the census view erased with the rest. The trunk bytes cannot move:
   the in-repo case `a reply MUTATOR carries no prose and therefore no bytes` renders the fixture
   trunk with a `jargonScrub` installed and asserts byte-equality with the trunk rendered without it.

## Proof cases
No guard was touched, so no guard proof changed: the ratchet still computes **29/29 kinds**, the same
number as before this change. What moved is the MECHANISM test
(`packages/core/test/proofs/trunk-provenance.test.ts`, classified `other` by `run-proofs.mjs` — it
carries no `L1 ·`/`L3 ·`/`proof completeness ·` id and therefore no coverage weight). It goes from
**36 cases to 24** — measured, not estimated (`vitest run test/proofs/trunk-provenance.test.ts`):

| disposition | cases | erased subject |
|---|---|---|
| deleted — `describe('query (a) CONTRADICTION …')` | 4 | `findContradictions` |
| deleted — `describe('query (b) DUPLICATION …')` | 2 | `findDuplications` |
| deleted — `describe('query (c) SINGLE OWNER …')` | 2 | `findMultiOwnerSubjects` |
| deleted — 2 of the 3 `B4 — reply MUTATORS` cases | 2 | `mutatorLines` (both), `findMultiOwnerSubjects` (one) |
| deleted — 2 of the 3 `I7 — injectable polarity lexicon` cases | 2 | `withPolarityLexicon`, `PolarityLexicon` |
| **deleted, total** | **12** | |
| rewritten in place — B4 case 1 | 1 | keeps the surviving half: a mutator has no prose, so the rendered trunk is byte-identical |
| rewritten and moved into the derivation describe — I7 case 1 | 1 | keeps the surviving fact: the markers are English-only, so pt-BR prose derives `inform` |
| dropped assertion inside a surviving case | — | `findSubjectlessLines` (the `custom()` case still asserts `subject === null`) |

Per-symbol attribution of those 12, for cross-checking: `findContradictions` 4 · `findDuplications` 2
· `findMultiOwnerSubjects` 3 (2 in query (c) + the mutator-as-owner case) · `mutatorLines` 2 ·
`withPolarityLexicon`/`PolarityLexicon` 2. Grouped by describe the same 12 read 4/2/2/2/2 — the two
axes count the same cases, since the mutator-as-owner case uses both symbols.

The deleted cases had no subject left to test: the queries they exercised were reachable from no entry
point (barrel, `/internal`, or any sibling package) and were erased in the same commit. Everything
that gates the refactor survives — byte-identity of the fold, full owner/section/hook/target
provenance, subject+polarity determinism, and all six section-placement / dedup / composition
findings.

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
**PASS.** Guard behavior is untouched: no `check()`, no `prose()`, no binding, no hook.

**What the in-repo byte-identity case does and does not prove.** `foldTrunk(renderTrunkBlocks(…)) ===
renderScopedSpecTrunk(…)` is *intra-commit self-consistency* — it proves the two renderers agree with
each other at whatever commit it runs, not that today's bytes equal yesterday's. The repo pins no
cross-commit trunk snapshot, so this record does not claim one.

**Cross-commit identity was established during review, as review evidence:** the trunk was rendered
from a three-trunk fixture (including one with `jargonScrub` installed) at both the parent commit
`4b59968` and this commit `55b8ac5`, and hashed — **sha256 `f695126…`, 6999 bytes, identical at both
commits**. That measurement lives in the review, not in the suite; a future change to the fold would
have to re-establish it the same way, or the repo would have to gain a real snapshot pin.

Residual: the trunk's attributed table is now QUERYABLE but no query ships. A future coherence census
re-authors its queries against `trunk-fold.ts`'s `TrunkLine[]`; the provenance it needs (owner /
section / hook / target / tool / subject / polarity) survives in full.
