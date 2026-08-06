---
date: 2026-08-03
slug: inform-guardrail-one-sentence
change_kind: runtime
target: —
summary: the inform guardrail states the rule in one sentence, in lockstep with the design and the skill
isolated: 152/152
collective: 36/36
coverage: 22/22
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — the inform guardrail states the rule in one sentence, in lockstep with the design and the skill

**Scope:** `runtime` · **Date:** 2026-08-03 · **Verdict:** PASS

## What changed
The `inform` guardrail on `did.items.op` — PROSE ONLY, 285 characters down to 119. Four sentences
became one, carrying the two clauses that are load-bearing:

> `inform` NEVER asserts an action you performed — a performed action is declared as that action's
> op, which is verified.

The PROHIBITION (`inform` may not stand in for a performed action) and the REPLACEMENT with its
reason (the action's own op, which the action history cross-check verifies). What was dropped restated the
same rule in other words — "for conveying information or answering a question" is what the word
means, and "reporting a done action as `inform` is dishonest" is the prohibition again.

The rule is unchanged, so its enforcement is unchanged: `claimIsComplete` fires when an effected
write is covered by no ACTION intention, which is exactly the state an `inform` standing in for an
action produces. The guardrail is the FORCING FUNCTION that keeps a model from walking into that
correction; it has never been the guarantee.

Stated in four places, updated in lockstep — the engine field description, the design's D4, the
agentspec skill's `norms.md` + `guard-catalog.md` (its own repo, its own commit), and the wire
audit that pins the string.

## Proof cases
No guard changed, so no guard proof changed: the full suite is the regression evidence, and the
SURFACE is pinned by `packages/mastra/test/proofs/terminal-audit.test.ts`, which reads the tools the
provider actually received and asserts the guardrail verbatim on `op` — plus that it appears in
NEITHER terminal-protocol variant, which is the one-rule-one-home law this schema is organized by.

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
**PASS.**

RESIDUAL — the prose-misuse residual is untouched and still open: nothing deterministic reads the
`message` for an operation it asserts, so a shortened guardrail neither widens nor narrows it. Its
only named mitigation remains the optional `did × message` `llmCheck`, installed where the stakes
justify a model call per reply.
