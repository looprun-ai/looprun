# The floor speaks the declaration — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every engine-authored delivery speaks human sentences — declared seam wording for
refusal codes, fact and ask texts, a human code instruction — and the one machinery shape a
model reply can carry (the act-log line) is refused by structure.

**Architecture:** Four pieces on one branch: the floor's composition in
`packages/core/src/run/` stops printing act-log lines and bare codes; `brokenReply` (the
existing plain-prose floor) gains the act-log shape proven on branch
`microtest-reply-shape-floor`; the engine's consent-ask instruction is reworded to speech; the
skill teaches the zero-legible tense and the persona voice. Acceptance runs the directed 12 at
both doors and in two languages, judged in session.

**Tech Stack:** TypeScript, vitest, the bench's exam runners, the subject model named in
`ask/targets.json` — no other model, ever.

## Global Constraints

- English in every file; the pt-BR operator turns in the acceptance fixture are the measured
  object, quoted as such.
- No language words in engine matching — the act-log shape is markup only.
- A change that costs a point on the directed 12 is not a change (revert it).
- Rendered-prompt byte diff over the live subjects: ZERO outside the ask-instruction sentence.
- Work on branch `floor-speaks-the-declaration`; merge only on the owner's word.

### Task 1: Scope the floor path and the seam plumbing (read-only)

- [ ] Read `packages/core/src/run/delivery-facts.ts` and the floor/forcedFinish path in
      `turn.ts`; name where the act-log lines and the bare code enter the floor text.
- [ ] Trace whether declared seam sentences exist engine-side as data (from the emitted
      contract) or as prompt prose only; record which of the spec's two forms piece 3 takes
      (seam-as-data, or the engine template fallback).

### Task 2: `brokenReply` gains the act-log shape

- [ ] Move the microtest's samples into
      `packages/core/test/run/broken-reply-machinery.test.ts` as failing tests against
      `brokenReply()` — the leaked four refuse, the clean twelve pass.
- [ ] Run: `npx vitest run test/run/broken-reply-machinery.test.ts` — expect FAIL (the shape
      is not yet in the guard).
- [ ] Add the shape to `brokenReply` in `packages/core/src/cards/catalog.ts`:
      `/\b\w+\([^()\n]*\)\s*—\s*(?:done|not-done)\b|\bCompleted:\s*\w+[.,]/u`, with the rule
      sentence extended to name the act-log line.
- [ ] Run the test — expect PASS; run the core suite — expect green.
- [ ] Commit.

### Task 3: The floor composes from sentences

- [ ] Write failing tests in `packages/core/test/run/floor-speaks.test.ts`: a floor delivery
      over facts carrying a refusal code, an ask sentence and a consent code contains (a) no
      act-log line, (b) no bare code standing alone, (c) the ask text, (d) the human refusal
      sentence (seam wording where data exists, the labelled template otherwise), (e) the code
      inside the engine's human instruction.
- [ ] Implement in `delivery-facts.ts` (+ the `turn.ts` call site): compose from fact texts
      only; refusal facts resolve their sentence; the `Completed:`/act-log prefix dies.
- [ ] Run the tests and the core suite — green.
- [ ] Commit.

### Task 4: The ask instruction speaks like a person

- [ ] Find the instruction sentence the desks echo (`alone`-register) in the engine's prompt
      or question text; reword to plain speech (the code request a person would type).
- [ ] Adjust the tests that pin the old wording; suite green.
- [ ] Commit.

### Task 5: The skill teachings (same session)

- [ ] `author.md` disclosure section: a tense reads naturally at EVERY value its slot takes.
- [ ] `author.md` persona/conduct: the desk speaks TO the operator, never AS the operator.
- [ ] agentspec gate green; commit.

### Task 6: Docs

- [ ] `delivery-facts.ts` / `turn.ts` headers state the floor's law AS-IS.
- [ ] The tutorial lesson touching delivery/disclosure rewritten to the new truth, if it names
      the floor's wording.
- [ ] Commit.

### Task 7: Acceptance

- [ ] Workspace suite green; rendered-prompt byte diff over the live subjects zero outside the
      ask sentence.
- [ ] Pinned directed 12 → judged in session, no point lost vs 12/12.
- [ ] Chat door, English: the 12 unpinned → judged; zero machinery shapes, zero bare codes.
- [ ] Chat door, Portuguese: the 12 with pt-BR operator turns (ids and codes verbatim) →
      judged; reply language, letters, and the floor-language question NAMED for the owner.
- [ ] Report; merge waits for the word.
