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

Ten branches IN THIS REPO hold the scenario sets, harnesses and verbatim transcripts.
The worktrees that made them are disposable; the BRANCHES are the access path. To open
one: `git worktree add /tmp/mt <branch>` (read, port, then `git worktree remove /tmp/mt`).
Never merge a microtest branch into main — port scenarios into engine tests instead.

| branch | report file | proves |
|---|---|---|
| `microtest-d1` | `microtests/d1-desk-writer/REPORT.md` | D1 rulers + redrive |
| `microtest-choice` | `microtests/choice-from-question/REPORT.md` | ask-then-echo 14/14 |
| `microtest-3-omission` | `microtests/03-omission-channel/REPORT.md` | numbered facts; echo+code |
| `microtest-4-reask-language` | `microtests/04-reask-language/REPORT.md` | latest-language line |
| `microtest-5-handcards` | `microtests/05-handcards/catch-table.md` | the 28-mutation net audit |
| `microtest-6-close-path` | `microtests/06-close-path/CLOSE-REPORT.md` | D2′ 15/15; seeded redrive |
| `microtest-7-prefill` | `microtests/07-prefill/PREFILL-REPORT.md` | layout refutation 1/1.74/6.5× |
| `microtest-9-tape` | `microtests/09-tape/TAPE-REPORT.md` | the tape law |
| `microtest-10-injection` | `microtests/10-injection/INJECTION-REPORT.md` | label() ships; judge skipped |
| `microtest-11-judge-prefix` | `microtests/11-judge-prefix/JUDGE-REPORT.md` | dedicated judge prefix |

The harborpoint r12 slice (`~/Dev/js/harborpoint/subjects/harborpoint/test/`) is step
2-3's acceptance: its 5 rotating failures are the target.

## Serving and keys — the exact recipes (do not rediscover these either)

- **Gemini (the subject model)**: `google/gemini-3.1-flash-lite`, temperature 0,
  `providerOptions.google.thinkingConfig.thinkingBudget: 0`. The key is
  `GOOGLE_GENERATIVE_AI_API_KEY`, loaded from a repo-local `.env.local`
  (e.g. `/Users/marcos/Dev/js/atlas-trad/.env.local`) — never printed, never committed.
  `unset GEMINI_API_KEY` first: a stale global key shadows the right one.
- **NO LOCAL SERVING IN THIS RUN (ruled)**: steps 4/4b ship their CODE with unit-level
  acceptance only (flags present and passed; byte rulers with no model). The local
  llama.cpp measurement (prefill/turn, tokens/s, RAM, the microtest-7 ruler against the
  engine's own client) is DEFERRED to looprun BACKLOG row 8 — do not start a local
  server in this run.

## Anti-stall laws — the run ends, it never spins

- **Model-call retries**: any gemini call that fails (429/5xx/timeout) retries at most 3
  times with backoff; still failing → STOP the step and report the error verbatim. Never
  wrap a model call in an unbounded loop.
- **One run is the score**: a case's verdict comes from the round's single run; never
  re-roll a flaky case to chase a pass (variance mining).
- **Round caps**: any fix-and-re-run loop inside a step dries after 3 consecutive rounds
  that pay nothing — stop and report, exactly like the T-loop law.
- **Spend ladder** on every judged run (steps 7-8): slice first (12 → 40 → full), each
  slice judged and shown before the next; never launch the full hundred cold.
- **Build order**: the gate and typecheck read `packages/core/dist` — rebuild core (and
  eval) before running any gate, or a source edit is invisible and you will chase a
  ghost.
- **Report filenames**: harness hooks on this machine refuse writes to files named
  exactly `REPORT.md` from subagents — name reports `<TOPIC>-REPORT.md`.

## Process laws

- TDD: red first, per step. One step per commit; never bundle steps 2/3/4 (attribution
  dies). Steps 5–6 also touch agentspec — same-session ship-together.
- English in every file. No word of any language in engine runtime matching (declared
  text, operator bytes, digits, structure only). No regex outside the three pattern
  factories. No external model — the session judges.
- Subjects are re-run, never re-authored (step 7); the ONE new subject is step 8's blind
  atlas c21 in agentspec-bench, whole pipeline from zero under the new author.md. Engine
  pin updates per subject are deliberate and recorded.
- An acceptance red twice in a row on the same step, or a scope question the spec does
  not answer: PARK IT — never widen the step, never guess a ruling. Unattended protocol
  below.

## Unattended mode — the run's standing assumption (the owner returns in ~10h)

Nobody answers questions mid-run. The run must END WELL on its own:

- **Work on branch `minimal-core`**, never on main. One commit per step. Push the branch
  after every landed step (backup); main is merged by the owner after review.
- **Park, don't ask**: a blocked step (twice-red acceptance, scope question) gets a full
  entry in `docs/superpowers/plans/minimal-core-DECISIONS.md` — what blocked, what was
  tried, the exact question the owner must answer — and the run moves to the next step
  the dependency map allows. Never sit waiting; never force a gate.
- **Dependency map for skipping**: step 1 (choiceFromUser+NEGATORS) is independent ·
  steps 2→3 chain (D1 then D2′) · step 4 (models wiring) is independent · step 4b needs
  4 landed conceptually but not 2/3 · step 5 (judge rows + engine-seams.md) is
  independent · step 6 needs 5. Step 7 runs on WHATEVER landed, reporting against both
  the new targets and the pre-minimal-core baseline — a parked step makes its target
  line "n/a (parked)", not a failure.
- **Step 8 (blind c21) does NOT auto-run.** The blind law demands a fresh, clean-context
  author; it is a separate dispatch after the owner reviews steps 1-7. Park it by
  default.
- **Time boxes**: a step exceeding ~2h of wall clock is parked with its entry, whatever
  its state. The gemini spend ladder (12→40→full) is never skipped to save time.
- **The ledger**: append one line per event to
  `docs/superpowers/plans/minimal-core-LEDGER.md` (step started/landed/parked, commit
  hash, acceptance output summary) — the owner reads the whole run's state from this
  one file plus DECISIONS.md.
- **The final act** of the run, always reached: a FINAL-REPORT section appended to the
  LEDGER — steps landed with hashes, steps parked with their questions, the step-7
  table as far as it ran, and the exact command the owner runs to resume.

## The report, per step

One block: what shipped (files), the acceptance run's actual output, counters moved, and
what the next step is. At program end: the step-7 regression table (harborpoint ≥28 with
the 5 paid · trialworks 29/29 · atlas ≥92, 3× both columns) and the step-8 blind
certification, against the `pre-minimal-core-2026-08-30` baseline.
