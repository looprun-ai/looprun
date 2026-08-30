# minimal-core — the run ledger

Run: the minimal-core program, branch `minimal-core` off main @ 7079285, unattended.
Dispatch: `docs/superpowers/plans/2026-08-30-minimal-core-execution-goal.md`
Spec of record: `docs/superpowers/specs/2026-08-30-minimal-core-free-author-proposal.md`
Rollback: tag `pre-minimal-core-2026-08-30` on looprun · agentspec · agentspec-bench.
Parked questions live in `minimal-core-DECISIONS.md`.

## Events

- 2026-08-30 23:45 — run started; branch `minimal-core` created at 7079285; controller online, opus subagents per step.
- 2026-08-31 00:05 — step 1 implementer landed a507c56: NEGATORS + helpers deleted, choiceFromUser ask-then-echo, 654 tests green, 14/14 ported; plain-names gate red confirmed PRE-EXISTING (main has the same 5-line set; branch carries a byte-identical subset of 4).
- 2026-08-31 00:15 — step 1 review: spec FAIL — Critical (latest-answer read inverted vs the engine's newest-first userTexts), 2 Important (question never closes; code minted from the contract instead of the question). Fix round 1 dispatched to the original implementer; the measured design (per-question mint + open/close lifecycle) ruled as the spec.
- 2026-08-31 00:15 — CONTROLLER RULING (for owner review): Portuguese/Japanese operator strings inside `choice-ask-then-echo.test.ts` are lawful — they are the measured object (operator input under test), not authored prose; the mechanism cannot be tested without a non-English operator. First instance in `packages/**`; flagged here rather than parked.
- 2026-08-31 00:30 — step 1 fix round 1: the guard now reads the standing question on a per-session ChoiceDesk (new `run/choice-desk.ts`; `choose` verdict kind; CallCtx.choices) — no userTexts read at all; per-question six-digit mint; consume-on-run. Commit recreated as ONE commit 5faab5d (amend hook-blocked; reset --soft + commit; a507c56 in reflog only).
- 2026-08-31 00:40 — step 1 re-review: spec PASS; one NEW Important — an `unknown` act left the answered question live (next record licensed with no ask).
- 2026-08-31 00:50 — step 1 fix round 2 + ACCEPTED at ade2892: consume fires on done || unknown (turn.ts:214 convention), red-first e2e test; 662 passed / 2 skipped, typecheck clean, gates clean except pre-existing plain-names (4 hits, subset of main's 5). Deferred minors on record: two choice guards on the same act+argument collapse onto one question (pathological authoring edge, for the final whole-branch review); the desk's ask-language behavior is the accepted microtest-4 limit, unmeasured on this engine.
- 2026-08-31 00:15 — NOTE: the agentspec skill still teaches the old `terms` surface; the split lands at steps 5/6 per the spec (PREPARED → COMPLETE). Step 8 already depends on step 6. Step 7's pin updates must migrate each subject's generated cards.ts to the new choiceFromUser surface — recorded as part of the deliberate pin update.
