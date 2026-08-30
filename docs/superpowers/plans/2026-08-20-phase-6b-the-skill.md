# Phase 6B — the skill, regenerated and measured

> **Status: DONE — the rewritten skill authors blind subjects end to end.**

**Design:** `docs/superpowers/specs/2026-08-18-to-be-phases-3-6-build-design.md` §7.
**Charter:** `docs/superpowers/specs/2026-08-18-skill-requirements.md` (18 lesson rows).
**Senior material:** `docs/superpowers/specs/2026-08-19-authoring-lessons.md`.
**Ground truth:** the certified subject `agentspec-bench/subjects/atlas-next`, its seal at
`test/2026-08-19-full100-r2/seal.json`, and its certification — 0.95 · 0.95 · 0.95.

**Gate:** the skill-authored Atlas green on level 1 (validate + lints, and a structural diff
against the frozen seal showing only wording variation) and level 2 (score ≥ 85 within the
noise margin of phase 5), and the skill unfrozen in the same session the gate passes.

---

## What is rewritten, what is kept

| part | strategy |
|---|---|
| `SKILL.md` + `references/**` | REWRITE — amending text that teaches "declare the tool plumbing in the spec" until it reads "there is no plumbing" costs more to audit than a rewrite |
| the worked example | REUSE — the ported Atlas, real and certified |
| the lints | DELEGATE — call `@looprun-ai/eval`'s `Validator`, `census`, `nameGate`, `purity`; a reimplemented lint is a second truth |
| the case-writing methodology | KEEP — how an exam is written does not change, only the vocabulary of the artifacts |

## Task 1 — the authoring contract

- [ ] `references/norms.md` — the two cards, field by field, with the defaults; the guard
      shape and its three strengths; the two homes; disclosure's tenses and its two refusals.
- [ ] `references/guard-catalog.md` — the factories that exist, their configuration, what
      each refuses, and the mistake it prevents; the engine floor, which is never declared.
- [ ] `references/gen.md` — the world card: records, the three effect blocks, `form`,
      `entity`, `label`, gates, presets, `when`, `simulation`, and custom executors OUTSIDE
      the card. A world refusal is a sentence with figures, because the engine rehearses.
- [ ] `references/evals.md` — the exam case: turns with typed approvals, invariants as
      requirements (`anyOf`), the rubric's shape, `covers`, `preset`, `split`.

## Task 2 — the pipeline around it

- [ ] `SKILL.md` — the same six phases; the preflight resolves `@looprun-ai/core` and
      `@looprun-ai/eval`; the panel unchanged.
- [ ] `references/ask.md` — `ask/targets.json` as the subject's one model door.
- [ ] `references/test.md` — the verbs over a run directory, and who judges: the agent in
      the session, never a model API.
- [ ] `references/ship.md` — `certify(runDirs, bar)` and `seal(subjectDir)`, and what voids
      a certification.
- [ ] `references/spec-template.ts` — a compiling two-card skeleton.

## Task 3 — the lints stop being a second truth

- [ ] One script that loads the subject through `SubjectLoader`, runs `Validator`, `census`,
      `nameGate` and `purity`, and prints the findings.
- [ ] Delete the four hand-rolled lints and the fixtures that only they used.

## Task 4 — level 1: the skill authors the Atlas

- [ ] Author the subject from the skill alone, into a fresh directory.
- [ ] `validate` + the lints green.
- [ ] Structural diff against the sealed reference: same tools, same effect blocks, same
      guard census keys, same case ids and invariants. Wording may differ; a governance fact
      may not.
- [ ] Any divergence is a SKILL defect: fix the skill, re-author, repeat. The phase-5
      reference is frozen — touching the measuring stick voids the comparison.

## Task 5 — level 2: the measured run

- [ ] A 10-case slice first, judged, with quality and spend shown before scaling — the
      standing rule for every run.
- [ ] Then the full 100 on `gemini-3.1-flash-lite`, judged in session, folded, certified.
- [ ] Pass: ≥ 85 within the noise margin of phase 5, case 72 intact.

## Task 6 — close

- [ ] Remove the FROZEN stamp in the same session the gate passes.
- [ ] Stamp §7 of the build design CLOSED with the run directories named.
