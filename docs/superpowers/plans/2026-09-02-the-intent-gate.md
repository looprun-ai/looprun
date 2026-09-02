# The intent gate — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One intent decision per turn, as data, at ONE door — and on an act turn the finish
leaves the tool list until an attempt stands, so execution is structural.

**Architecture:** ONE door: every message — chat or pinned — enters through the front desk's
`route()` call, whose schema gains `act: yes|no|unclear` (a pinned turn routes over a one-desk
window). `turn.ts` withholds the finish card on act turns until one non-read attempt is
recorded. Nothing desk-side restates the law and no second mechanism exists.

**Tech Stack:** TypeScript, vitest, the bench runners, the subject model of `ask/targets.json`.

## Global Constraints

- THE GATE: no engine task starts before Task 1's number holds — zero false `no` on the three
  residual cases (55, 100, 48), `unclear` acceptable where a human cannot tell either.
- No prose is ever read by the engine; the intent is data from a forced structured step.
- A change that costs a point on the directed 12 is not a change.
- English in every file; pt-BR strings in fixtures are the measured object.
- Work on a branch; merge only on the owner's word, only with the acceptance paid.

### Task 1: The micro-test — the classifier's own number (no engine work)

- [ ] Assemble ~30 real operator turns from the judged runs: the directed twelve's asks (EN
      and PT variants) and information-turn neighbours (72-t1, 91-style look-ups, chit-chat).
- [ ] For each, one forced single-tool call to the subject model on the minimal window
      (desk lines + the turn), tool `intent({ act: yes|no|unclear })`, temperature 0.
- [ ] Judge in session against my own reading; table: turn · expected · answered.
- [ ] DECIDE: zero false `no` on 55/100/48-class asks → proceed; otherwise stop and report —
      the spec falls and the deprecated declination branch is reconsidered.

### Task 2: The router carries the intent (chat door)

- [ ] Failing tests in `packages/core/test/run/front-desk.test.ts`: the composed window's
      `route` schema requires `act`; `readDecision` returns `{ desk, act }` and null on a
      missing or foreign `act`.
- [ ] Implement in `front-desk.ts` (schema + reader + one instruction sentence); adjust the
      routed-agent call sites to thread `act` into the turn options.
- [ ] Suite green; commit.

### Task 3: The pinned path enters the same door

- [ ] Failing test: a pinned governed turn makes the same `route()` call over a one-desk
      window; the answered `act` rides into the turn options; unreadable twice fails the
      turn; the desk half of the answer is the one desk by construction.
- [ ] Implement by pointing the pinned entry (exam runner / LoopRunAgent path) at the
      existing front-desk composer — no new machinery; commit.

### Task 4: The tool list is the law

- [ ] Failing tests in `packages/core/test/run/`: on `act: 'yes'`, the step's tools exclude
      the finish card until `draft.acts` holds a non-read attempt; after one, the finish
      returns; `act: 'no'`/`'unclear'` turns are untouched; `forceFinish` on an exhausted act
      turn still closes through the engine (the floor speaks the owed facts).
- [ ] Implement in `turn.ts` (the `stepInput.tools` composition — the one place).
- [ ] Suite green; commit.

### Task 5: The supersession lands

- [ ] Remove the "declination" repair-channel row from agentspec `test.md`; gate 24/24;
      commit (same session as the engine).
- [ ] Delete branch `the-declined-act-still-answers` (its spec is already stamped
      deprecated).

### Task 6: Acceptance

- [ ] Workspace suite green; prompt byte diff limited to the router schema field.
- [ ] Pinned 12 → judged, no point lost.
- [ ] Chat EN 12 → judged, letters hold.
- [ ] Chat PT 12 → judged: 55, 100, 48 pay through the mandatory attempt.
- [ ] Report; merge waits for the word.
