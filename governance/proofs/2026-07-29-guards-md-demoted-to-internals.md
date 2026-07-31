---
date: 2026-07-29
slug: guards-md-demoted-to-internals
change_kind: docs
target: guard-catalog
summary: core: GUARDS.md demoted to maintainer internals (kind list + risk-family taxonomy removed, catalog is the vocabulary of record); GUARD_CATALOG prose backticks identifier cross-references
isolated: 212/212
collective: 55/55
coverage: 29/29
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — core: GUARDS.md demoted to maintainer internals (kind list + risk-family taxonomy removed, catalog is the vocabulary of record); GUARD_CATALOG prose backticks identifier cross-references

**Scope:** `docs` (governed paths, no runtime behavior) · **Date:** 2026-07-29 · **Verdict:** PASS

## What changed
Two governed paths, both text-only.

**1. `packages/core/GUARDS.md` — demoted from "the guard reference (source of truth)" to guard
MAINTAINER INTERNALS.** It carried a hand-maintained per-kind signature table headed "The 29 guard
kinds" while `src/guards/` ships 30, and a "SIX RISK-FAMILY kinds" section built on a taxonomy this
branch already removed from the catalog summaries
(`governance/proofs/2026-07-29-guard-catalog-summaries-detaxonomized.md`). Both sections are gone.
In their place, §4 points at the vocabulary of record: `docs/tutorial/04-guards.md` §5 (generated
from `GUARD_CATALOG`, examples compiled in CI) and `src/guards/catalog.ts` itself. The sections that
exist NOWHERE else are kept verbatim — the `GuardCtx` firewall and the purity law (§1), hook
semantics + the prose-rendering / prose≠reason laws + the parity proof (§2), what `AgentSpecBase`
auto-installs (§3), the reader-of-record traps (now §4's tail), controls outside the hooks (§5),
P8a (§6), the pair doctrine (§7) and `behavior[]` (§8).

**2. `packages/core/src/guards/catalog.ts` — prose fields only.** `summary`/`whenToUse` cross-
referenced sibling kinds as bare words (`noDuplicateCall`, `precondition`, `custom`, `argFormat`,
`confirmFirst`, …), so the generated chapter 04 read as a second author beside its own backticked
prose. Every identifier cross-reference in those two fields is now backticked. No factory, `check`,
`prose`, `example`, `hook`, `category` or export changed.

**Consequential edits on non-governed paths** (recorded here for traceability, not gated):
`test/guard-catalog-parity.test.ts` drops its markdown lane — it gated GUARDS.md's kind NAMES and
the file no longer lists kinds; the `GUARD_CATALOG` lane, which is strictly stronger (it also
requires a summary, a when-to-use, an example that calls its own factory, and the right category
file), is now the whole gate. `CONTRIBUTING.md` step 3, `.github/pull_request_template.md` and
`skills/looprun-governance/SKILL.md` pointed new-guard work at GUARDS.md (and at
`skills/agentspec/references/guard-catalog.md`, a path that does not exist in this repo); all three
now point at the `GUARD_CATALOG` entry + `pnpm docs:guards`.

## Proof cases
n/a — no new cases are owed. Nothing executable changed: the edit touches one markdown file and the
`summary`/`whenToUse` string fields of `GUARD_CATALOG`, which is documentation data read only by
`scripts/gen-guards-chapter.mjs`. No enforcement path reads either. The existing suite is re-run
below as the regression statement.

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
**PASS.** `pnpm proofs:run` 495/495 at HEAD — unchanged from the pre-edit run, as expected for a
text-only change. Also green at HEAD: `pnpm -r build`, `pnpm -r typecheck`, `pnpm test`
(guard-catalog-parity 9/9 after the markdown lane was dropped, core surface locks unchanged),
`pnpm docs:guards --check` (chapter 04 and its compiled examples regenerated and committed).

**Residuals.**

1. `packages/core/GUARDS.md` stays a GOVERNED path. That is deliberate: the laws it still carries
   (the firewall, purity, prose≠reason, P8a) are the contract every proof is written against, so a
   change to them should still cost a record — even though the file is no longer the kind list.
2. The `skills/agentspec/**` governed path named in `governance/GOVERNANCE.md` and `.github/CODEOWNERS`
   does not exist in this repo (the generator skill lives in its own repo). Untouched here; it is a
   pre-existing policy/path mismatch, not something this edit introduced.
3. `test/proofs/catalog-risk-families.ts` keeps its filename although the taxonomy is gone from the
   prose — it is a byte-stable proof key present in the ratchet, and renaming it would move 
   coverage bookkeeping for no behavioral reason.
