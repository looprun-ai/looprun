# F5 — The Skill's Corrections and the Exam's Repairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close backlog-da-skill rows 2, 4, 5, 6 and 7 — the exam repaired first, then the pages — every fix validated by directed cases before F2's campaign.

**Architecture:** Two halves in strict order. First the ruler: case 76 through the repair loop on `atlas-c17`'s declaration.yaml, and cases 61/62/68/48 redesigned with written reasons. Then the pages: nine teachings (five gaps + four c12 findings), each landing WITH an engine-level fixture asserting what the sentence claims. Every backlog row closes as its fix lands.

**Tech Stack:** the skill's own repair loop · the bench runner (`tools/run-cases-unpinned.test.ts`) · vitest

**Spec:** `docs/superpowers/specs/2026-08-29-f5-skill-and-exam-repairs-design.md`
**Precondition:** F3 merged (the emit accepts what the skill teaches). This plan is the owner's skill unlock, SCOPED to these rows.

## Global Constraints

- Skill edits: ONLY what rows 2 and 4 name. One sentence per teaching, on the page where its moment lives.
- Case 76's shipped wording comes from RUNNING the repair round (hand edits are hypothesis tests only).
- Every exam change commits with: the old demand, the new demand, and why.
- Directed slices only; the full hundred belongs to F2. All letters read in session.
- Everything written to a file is English.

---

### Task 1: Case 76 — the booking-restraint law, through the loop

- [ ] **Step 1:** The repair round, as the loop's page teaches: read the failed evals of 76 (`…/2026-08-29-f1-cert100` and the three follow-up runs), name the defect class (an expectation with no written rule), and add the desk law to `atlas-c17/declaration.yaml` on the booking desk's conduct — the hypothesis wording:
  > Open a booking only when the operator asked for one in this conversation; a booking you offered waits for their yes before it is opened.
- [ ] **Step 2:** Regenerate through the emit (F3's stamp must go green).
- [ ] **Step 3:** Directed slice — `76, 02, 44, 59, 67` (`SUBJECT_DIR=subjects/atlas-c17-conduct RUN_DIR=…f5-case76 CASE_IDS=…` with the bench runner). The bar: 76's booking never opens unasked; 02 and 67 still book ON request; 44 and 59 still quote-and-ask. Letters read in session. A red case → adjust the wording, re-run the slice — this IS the loop.
- [ ] **Step 4:** Commit bench (`subject(atlas-c17): the booking desk opens a booking only when asked — the law case 76 always demanded`) and close backlog row 5.

### Task 2: The four questions redesigned — 61, 62, 68, 48

**Files (bench):** `subjects/atlas-c17/generated/cases-data.ts` (the exam rows; edited by a verified script, since the file is generated), each edit carrying its reason in the commit.

- [ ] **Step 1 — 61:** the rubric's r1 accepts the lawful first reply (the delivery-choice ask) OR the turn gains the choice ("…delivered, skip the checks") so the booking can lawfully open. Pick the smaller edit; write why.
- [ ] **Step 2 — 62:** add `requiredToolCalls: listCustomers` where the rubric already implies it, and sharpen r2: the no-contact answer must be quoted from that read's result.
- [ ] **Step 3 — 68:** the route expectation follows the manual's amendment (`subjects/atlas/norms/index.ts` `CASE_ROUTE`) — turn 2 expects `claims`; r2/r3 reworded to demand the deferral SENTENCE from whichever desk answers, not the desk itself.
- [ ] **Step 4 — 48:** r2 asks the dispatch-permission sentence of the desk that RECEIVES the request (per the registered redesign note); the route expectation for turn 2 becomes `fieldops` per the same manual amendment.
- [ ] **Step 5:** Directed slice — `61, 62, 68, 48, 78, 79, 81` — every letter of every NEW rubric read in session; the three neighbors guard against over-fitting. Red → the case's edit is wrong, not the subject: revisit.
- [ ] **Step 6:** Commit with the three-part reasons; close backlog rows 6 and 7.

### Task 3: The five missing teachings (row 2), each with its fixture

One sentence per teaching + one engine test asserting the engine behavior the sentence describes (the test lives where the refusal lives — emit or core):

- [ ] 1. `reads: record` needs a target-bearing act → sentence beside the factory in `guard-catalog.md`; fixture: an emit test where `precondition(reads: record)` on a target-less act is refused naming the line.
- [ ] 2. which factories DECIDE an acting tool → sentence in the catalog's ladder; fixture: core test asserting `onlyAfter` never blocks the act it gates once the read ran (it decides nothing).
- [ ] 3. the `needs` alias stays in the holding desk's lane → sentence at `norms.md` N5; fixture: emit refusal when a needs read sits outside the desk's tools.
- [ ] 4. no channel speaks a boolean → sentence where the tenses are taught, with the author's way out (a choice term); fixture: emit refusal of a boolean-valued tense slot, if the engine refuses it — otherwise the sentence states the exam's own convention and the fixture is the choice-term round trip.
- [ ] 5. `later` on non-consent acts → sentence defining the scope where `later` is taught; fixture: core test pinning when a non-consent `later` renders.
- [ ] Each lands as its own commit: the page sentence + the fixture together. Close row 2.

### Task 4: The four c12 findings (row 4) — verify, then fix or close

- [ ] For each: read the current page; if it already answers, close with a pointer in the backlog row's removal commit; if not, one sentence + fixture, same shape as Task 3:
  1. currency-mark carve-out on `valueFromUser` ("R$ 100" ≡ `100` — the engine already canonicalizes; the page must say so);
  2. `precondition`'s target requirement taught at `declare.md`;
  3. read-law homing taught earlier in the reading path;
  4. result shapes visible on a page (`gen/` artifacts or the world card's section).
- [ ] Close row 4.

### Task 5: The register

- [ ] `agentspec/BACKLOG.md`: rows 2, 4, 5, 6, 7 gone (each removal commit names what closed it); renumber; the F5 spec stamped CLOSED with the slice results; memory updated. F2 is now unblocked.
