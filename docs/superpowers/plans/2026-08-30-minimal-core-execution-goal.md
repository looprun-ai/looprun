# The minimal-core program — the execution dispatch

> The goal prompt for the session that BUILDS the program. Everything here is settled by
> measurement or ruling; the spec is the plan of record. Paste the dispatch below into a
> fresh session, whole.

---

Your working directory is /Users/marcos/Dev/js/looprun/looprun, branch main. The program
also touches /Users/marcos/Dev/js/looprun/agentspec (the skill) and, at validation time,
/Users/marcos/Dev/js/looprun/agentspec-bench plus the harborpoint and trialworks subject
trees. Rollback for everything is the `pre-minimal-core-2026-08-30` tag on all three repos.

GOAL: execute steps 1–8 of `docs/superpowers/specs/2026-08-30-minimal-core-free-author-proposal.md`
to completion — one step per commit, each step green on its own acceptance test before the
next begins, engine + docs + skill shipped together in the same working session for every
step that changes the engine (the stone rule).

## Read first, in this order

1. `docs/superpowers/specs/2026-08-30-minimal-core-free-author-proposal.md` — the plan of
   record: D1 · D2′ · D3-as-measured · D4-ruled · D5, the step table with acceptances, the
   risks table with every verdict.
2. `docs/superpowers/specs/2026-08-30-minimal-core-free-author-design.md` — AS-IS ⇄ TO-BE
   side by side; §AB2 is the turn you are rebuilding.
3. `docs/analysis/2026-08-30-governed-vs-traditional-deep-analysis.md` — why each item
   exists.

## The rulings that BIND (each measured; do not relitigate)

| ruling | measurement |
|---|---|
| owed facts gate the DESK's message; redrive on the same prefix (D1) | microtest-d1 + the seeded fact-id redrive 6/6 (microtest-6 §S5) |
| the composer DIES everywhere; engineClose becomes a desk close-step, full funnel; ban bracketed codes in prose; keep tool cards in the close call (D2′) | microtest-6: 15/15 vs 11/15 |
| omitted sentences: owed facts NUMBERED + the structured report enumerates fact ids; missing id → redrive quoting the fact | microtest-3: 0/5 → 5/5, zero calls |
| the prompt LAYOUT stays AS-IS; ship only `cache_prompt: true` + `-np 1` in packages/models; tool-array pinning measured at implementation | microtest-7: AS-IS 1.00× · append-only 1.74× · STATE-last 6.50× |
| the tape: window-2 rewrite (`turn.ts:152-159`) dies; append-only; compaction budget-triggered; summaries keep tool ids verbatim, refusals never become facts | microtest-9: window-2 = 2.02× for nothing |
| `choiceFromUser` keeps its name, becomes ask-then-echo: options in the operator's language, licence = option token + the question's minted code, exact-alone; NEGATORS deleted in the SAME commit | microtest-choice 14/14 vs 1/7; microtest-3 §S3 (echo alone false-accepts 2/6; with code 0/6) |
| re-asks follow the language of the operator's LATEST message (prompt line); unannounced latin↔latin flip = accepted limit | microtest-4: 16/20 at zero cost |
| the emitter SHRINKS, never retires: cards.ts stays generated; checks factory-only (+4 new factories for the no-rung shapes); PROSE goes free in the declaration; word-list + world-id lints + strict subject tsconfig land in the same commit as the freedom | microtest-5: hand-editing 16/28 silent |
| `label()` ships at the mask seam (field NAMES only); NO per-turn injectionCheck; the operator-argument injection class belongs to the pre-tool consent hold | microtest-10: 32/32 held, judge +14 calls for nothing |
| the judge keeps its DEDICATED prefix, opt-in per desk; judge rows carry guardName · detail · finish.message · delivery.by; `engine-seams.md` names the stages in the skill | microtest-11: warm judge won't convict its own reply (17/24 vs 23/24) |

## Regression fixtures — port, do not rediscover

Eleven branches in this repo hold the scenario sets and transcripts; port their scenarios
into engine tests as each step lands: `microtest-d1` · `microtest-choice` ·
`microtest-3-omission` · `microtest-4-reask-language` · `microtest-5-handcards` ·
`microtest-6-close-path` · `microtest-7-prefill` · `microtest-9-tape` ·
`microtest-10-injection` · `microtest-11-judge-prefix`. The harborpoint r12 slice
(`~/Dev/js/harborpoint/subjects/harborpoint/test/`) is step 2-3's acceptance: its 5
rotating failures are the target.

## Process laws

- TDD: red first, per step. One step per commit; never bundle steps 2/3/4 (attribution
  dies). Steps 5–6 also touch agentspec — same-session ship-together.
- English in every file. No word of any language in engine runtime matching (declared
  text, operator bytes, digits, structure only). No regex outside the three pattern
  factories. No external model — the session judges.
- Subjects are re-run, never re-authored (step 7); the ONE new subject is step 8's blind
  atlas c21 in agentspec-bench, whole pipeline from zero under the new author.md. Engine
  pin updates per subject are deliberate and recorded.
- An acceptance red twice in a row on the same step: STOP and report — do not widen the
  step. A scope question the spec does not answer: STOP and ask the owner.

## The report, per step

One block: what shipped (files), the acceptance run's actual output, counters moved, and
what the next step is. At program end: the step-7 regression table (harborpoint ≥28 with
the 5 paid · trialworks 29/29 · atlas ≥92, 3× both columns) and the step-8 blind
certification, against the `pre-minimal-core-2026-08-30` baseline.
