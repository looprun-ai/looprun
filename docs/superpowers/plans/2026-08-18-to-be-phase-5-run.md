# TO-BE Phase 5 Plan — the measurement

> **SUPERSEDED — 2026-09-01.** The deliverables were built directly on `packages/*` after the
> `856ac18` move (CLI facade, mastra adapter, server, eval's two halves, models, the phase-5
> closing driver) — this route died with the tree it targeted. The standing map remains
> `2026-08-12-to-be-blueprint-v3.md` as amended by the review resolution.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans, inline. This phase builds ~no code: it RUNS.

**Goal:** The full Atlas on the new engine, `gemini-3.1-flash-lite` only, K=3 reps, judged in session, certified at bar 0.9 — score ≥ 85/100 AND every case the frozen baseline passes (100 minus the fifteen: 43 47 48 49 50 51 52 62 63 72 80 82 87 92 100) also passes here.

## Protocol

1. **Driver:** `packages/next/eval/test/atlas-run.test.ts` — env-gated (`RUN_ATLAS`), loads the sibling subject, plays cases through ExamRunner with model `google/gemini-3.1-flash-lite` (key from the bench `.env.local`, exported at invocation, never written to a file). Run dirs: `agentspec-bench/subjects/atlas-next/test/<stamp>/rep<N>`.
2. **Smoke rep:** `RUN_ATLAS=72-maintenance-lifecycle` — one case, governed, rep1. The real adapter, subject and records meet at the smallest increment.
3. **Full reps:** `RUN_ATLAS=all`, rep1..rep3, governed + ungoverned.
4. **Judge:** `buildJudgeInputs` per rep; the agent in this session reads the parts and writes `verdicts.jsonl` — no external judge exists.
5. **Fold → certify(bar 0.9) → seal.** Comparison vs the baseline: `failingCases ⊆ the fifteen` = the superset goal; anything outside is triaged into the three bins (ENGINE fix in `packages/next/*` · PORT fix against the AS-IS original + MAPPING row · APPEAL in writing against the arbiter file). Case 72 must stay exactly as ported.
6. **Deliverable:** the certification + seal + `docs/superpowers/specs/2026-08-18-skill-requirements.md` (the 6b charter: mapping table, exemplar subject, bin decisions, regeneration strategy).

## Results

_(filled as reps land: per-rep scores, failing cases, bin decisions)_
