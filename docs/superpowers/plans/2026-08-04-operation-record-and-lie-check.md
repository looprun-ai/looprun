# Implementation plan — the operation record and the lie check

**Spec:** `docs/superpowers/specs/2026-08-04-closed-operation-record-design.md`
**Branch:** `operation-record-and-lie-check`
**Status:** every task done; `pnpm test` and `pnpm proofs:run` green
**Measured harness to port from:** `packages/eval/test/battery/gated-pipeline.ts` (commit `b5c64d8`)

---

## Global constraints

| | |
|---|---|
| **No historical narration** | comments and docs describe what the code IS. Never "was", "used to", "previously", "retired". |
| **No domain code in the engine** | domains live only in `examples/`, isolated and didactic. |
| **The record never reads the message** | its inputs are the verified `did` and the world ledger. A test must pin this. |
| **The session list is never delivered** | it is input to the check and the rewriter only. |
| **Fail closed on absence** | a runtime with no judge callback delivers the message unchanged with the record beneath it. It never silently skips the record. |
| **Governance** | `pnpm proofs:run` and the proof-record gate must be green before the branch is done. |

---

## Task 1 — the closed record

**Files:** `packages/core/src/runtime/claims.ts`, its tests.

`renderOperationReport` gains the closure and stops returning the empty string.

```
≥ 1 action line   →  lines + "Nothing else was changed on this turn."
  0 action lines  →  "No operation was carried out on this turn."
```

- [x] **1.1** Two closure constants, chosen by whether any action line was rendered.
- [x] **1.2** A turn whose `did` carries only speech intentions renders the empty-case closure, not `''`.
- [x] **1.3** Test: same `did`, same ledger, three different messages → byte-identical record.
- [x] **1.4** Test: the empty-case closure does not presuppose an operation — assert the exact sentence, since this is the whole reason there are two.
- [x] **1.5** Every existing caller of `renderOperationReport` that branched on `''` is updated. The empty string is no longer a signal.

---

## Task 2 — the session record

**Files:** new module under `packages/core/src/runtime/`, its tests.

One line per DISTINCT ENTITY carrying its latest state, accumulated across the session.

- [x] **2.1** Build from effected writes only — a call whose effect the world attested. Skip the rest.
- [x] **2.2** Key by entity, last write wins. The same event cancelled three times is one line.
- [x] **2.3** Entity identity uses the key-scoped, whole-value matching already in `guards/honesty.ts`. Do not invent a second identity rule.
- [x] **2.4** No turn window, never reset within the session.
- [x] **2.5** When there is nothing, the section is omitted entirely — no empty heading.
- [x] **2.6** Test: 3 writes on one entity → 1 line. 3 writes on 3 entities → 3 lines. 0 writes → empty, and the heading is absent.

---

## Task 3 — the judge callback

**Files:** `packages/core/src/spec.ts` or the runtime config surface, `packages/mastra/src/agent.ts`.

One backend-supplied callback carries both model calls.

```ts
judge: (prompt: string) => Promise<string>
```

- [x] **3.1** Backend-supplied, never host-configured. Same model, same endpoint as the turn.
- [x] **3.2** The call carries no persona, no tools, no history — two texts in, one answer out.
- [x] **3.3** Absent callback: the message is delivered unchanged with the record beneath it. No throw, no silent skip of the record.
- [x] **3.4** Test: with no `judge`, a turn that would have been rewritten delivers the original and the record.

---

## Task 4 — eligibility and the check

**Files:** the reply-finalization path, its tests.

```
no action was carried out this turn  →  run the check
any action was carried out           →  deliver the message as it stands
```

- [x] **4.1** Eligibility is computed from the record's action lines. No model call, no prose read.
- [x] **4.2** An ineligible turn makes ZERO model calls for check and rewrite.
- [x] **4.3** The check prompt is composed by the engine from the two lists and the message. The agent writes no part of it. Its wording is the spec's §5, verbatim.
- [x] **4.4** The answer is read as a closed SIM/NAO on the first word.
- [x] **4.5** Test: a turn with one action line is never checked. A turn with none always is.

---

## Task 5 — the rewrite

**Files:** the same path, its tests.

- [x] **5.1** Runs only when the check answers SIM.
- [x] **5.2** Inputs: the conversation, the reply, and the two lists. Never the raw `did`.
- [x] **5.3** Returns prose only. `did` is untouched, so no second grounding pass runs.
- [x] **5.4** The prompt is the spec's §5, verbatim, including the three clauses that each closed a measured defect.
- [x] **5.5** Test: the rewritten prose replaces `message` for delivery; the record beneath it is unchanged.

---

## Task 6 — the red-team tests

**Files:** `packages/core/test/redteam/`.

Each of the four failure modes gets a test that fails if the mode ever returns.

- [x] **6.1** The check runs on a turn where an action was carried out → must be impossible.
- [x] **6.2** A detected lie is not rewritten → must be impossible.
- [x] **6.3** An ineligible turn does not deliver the message and the record as they are → must be impossible.
- [x] **6.4** The record is absent from a finalized turn → must be impossible.
- [x] **6.5** The session list reaches the delivered text → must be impossible.

---

## Task 7 — the battery arm

**Files:** `packages/eval/test/battery/`.

Port the measured harness so the numbers are reproducible against the engine rather than against a fixture.

- [x] **7.1** The three failure modes that measured zero stay at zero.
- [x] **7.2** Lies in the checked branch: safe after rewrite.
- [x] **7.3** Record coverage: every hand-labelled lie contradicted.
- [x] **7.4** Damage: no true date, time, name, listing or question lost; no fabricated claim; no machinery named.
- [x] **7.5** Gated behind the same env flag as the rest of the battery — not part of the everyday run.

---

## Task 8 — governance and docs

- [x] **8.1** `GUARDS.md` describes the record and the check as they are.
- [x] **8.2** `governance/MATRIX.md` updated; `pnpm proofs:run` green; the proof record present.
- [x] **8.3** The agentspec skill teaches the shipped behaviour — a domain authored to it must not fail closed against the engine.

---

## Deliberately not in this plan

| | |
|---|---|
| **The record's language** | the lines render in English regardless of the conversation. Real, and its own piece of work. |
| **`como solicitado`** | one extra check call, no damage. An efficiency cost, not a correctness one. |
| **A cap on the session list** | unbounded by design. If a cap is ever needed it must be generous, because exceeding it makes the agent deny a real action. |

---

## What the plan did not foresee

| | |
|---|---|
| **the prompts' language** | the measured lie check was Portuguese. Everything written to a file here is English, so what ships is the translation. The question's shape carries over; its rate does not — the gated arm re-measures it. |
| **a clean check is not a correction** | `turnCorrections` is the log of what the engine had to correct. A check that found nothing corrected nothing, so only a fired check and its rewrite are recorded. |
| **the blank-delivery floor** | the composed text is never empty now, so the floor tests the PROSE plus the record's line count: no prose AND no line is the case with nothing to deliver. |
| **the fake model answers the judge** | a judge call is engine machinery, so the scripted model answers it out of band and consumes no script step. A script stays about what the agent does. |
