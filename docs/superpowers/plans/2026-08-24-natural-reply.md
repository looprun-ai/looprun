# Natural Reply Implementation Plan

**Status: CLOSED.** All seven tasks complete; the spec is stamped CLOSED on the second
repetition of the hundred (spec §5.3 — 96/100 letters, every deterministic counter zero), and
the work is merged to `main`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the natural-reply engine (spec `docs/superpowers/specs/2026-08-24-natural-reply-design.md`) on `main` with a green gate, new proofs, docs and skill teaching, and grow the runner's usage capture so the closing measurement can run.

**Architecture:** The measured build already exists on branch `microtest/coherent-reply-and-bytes` (engine diff = 5 files, `git diff main -- packages/core/src`). This plan applies that diff to a fresh integration branch, rewrites the delivery-format proofs to the new contract, adds proofs for the new mechanisms, updates every touched document and the skill, and adds per-turn usage capture to the eval runner. The closing measurement (§5.1 of the spec) is a gated task: prepared here, run only on the user's explicit order.

**Tech Stack:** TypeScript (pnpm workspace), vitest, zod. No new dependencies.

## Global Constraints

- **No external model, ever.** All judging is done by the agent in the session; the only model any run may reach is the subject named in `ask/targets.json`.
- **A contract guard's rule lives on its tool's card** — never hoisted to the system block, never restated elsewhere.
- **Any prompt-side wording change beyond this plan's verbatim diffs is A/B-measured before it ships** (one byte in a card flipped case 77 3/3).
- **Live runs are 1 rep.** Scale (the full hundred) runs only on the user's explicit order — never proposed by the session.
- Every byte written to a file is English; comments and docs state the system AS-IS.
- Pre-1.0: break freely, no compatibility shims; update callers in the same commit.
- `pnpm --filter @looprun-ai/core build` after every `packages/core/src` edit — generators and typecheck read `dist/`.

---

### Task 1: Apply the measured engine diff to an integration branch

**Files:**
- Modify: `packages/core/src/cards/catalog.ts` (export `figureRuns`, `canonicalAmount`)
- Modify: `packages/core/src/run/delivery-writer.ts` (replace whole file)
- Modify: `packages/core/src/run/finish-desk.ts` (`force(open)`, `Question` import)
- Modify: `packages/core/src/run/prompt-writer.ts` (`slim()` on tool schemas)
- Modify: `packages/core/src/run/turn.ts` (modelView history · settled injection · forced-tools · distrust · figure grounding · lastMessage)

**Interfaces:**
- Produces: `DeliveryWriter.compose(message, acts, open, closed, notes?, rich?)`, `DeliveryWriter.modelView(message, acts, open)`, `DeliveryWriter.settled(acts)`, `FinishDesk.force(open?: readonly Question[])` — consumed by Task 2's proofs and by `turn.ts`.

- [ ] **Step 1: Create the integration branch**

```bash
git checkout main && git checkout -b natural-reply
```

- [ ] **Step 2: Apply the diff exactly as measured**

The source of truth is the prototype branch — apply its engine diff verbatim:

```bash
git diff main microtest/coherent-reply-and-bytes -- packages/core/src | git apply
```

The resulting `delivery-writer.ts` must be byte-identical to the branch's (the file is reproduced in full in the spec's §3 and at `microtest/coherent-reply-and-bytes:packages/core/src/run/delivery-writer.ts`). Key contracts to verify by eye after apply:

```ts
// delivery-writer.ts — the four laws in one file
const idsOf = (text: string): readonly string[] => text.match(/[a-z]+_[a-z0-9]*[0-9][a-z0-9]*/g) ?? [];
function unframed(sentence: string): string { /* strips 'tool(target) — status.'; refusal speaks its rule */ }
function covers(message: string, sentence: string): boolean { /* every id + canonical figure of sentence ∈ message */ }
// compose(): prose first; record() fills only what prose left out; question line suppressed
// iff message.includes(q.code) && message.includes(q.sentence); blocks join with '\n\n'.
// modelView(): prose + EVERY settled sentence — the model's memory never slims.
// settled(): strongest act per a.call.key (canonical, order-insensitive).
```

```ts
// turn.ts — the five hunks (verbatim in the branch diff)
// 1  history: assistant text = dw.modelView(r.finish?.message ?? '', r.acts, open issued)
// 2  stepInput.tools = forced ? [fd.toolCard()] : [...pw.toolCards(), fd.toolCard()]
// 3  question-raise: forced=true + settled acts message + fd.force(desk.open()) — one
//    finish step before engineClose; engineClose(session, draft, lastMessage)
// 4  tryFinish: figure grounding — every canonical figure of finish.message ∈ evidence
//    (userText, user messages, acts+pastActs args/results/sentences, open questions,
//    notes) else violation 'figureIsGrounded' with the figures named
// 5  contradicted report (word vs settled record) ⇒ lastMessage = '' — the record speaks;
//    delivery never empty (settled sentences as message when all else is blank)
```

```ts
// finish-desk.ts — force(open) hands the model each open ask, verbatim:
force(open: readonly Question[] = []): string {
  const consent = open.length === 0 ? ''
    : ' Weave into your message, WORD FOR WORD, each approval statement with its literal: '
      + open.map(q => `"${q.sentence}" — the operator approves by replying ${q.code}`).join('; ')
      + '. Open with your own short sentence answering the operator, then the statement, then '
      + 'name the literal. One flowing message.';
  return `Call ${FINISH_TOOL} now with your closing message and the report of what happened. `
    + `No other call remains available. Write the message in the language the operator wrote in.`
    + consent;
}
```

```ts
// prompt-writer.ts — slim(): '$schema' | 'additionalProperties' | 'pattern' leave the
// schemas sent to the model; 'description' stays. Card guard filter UNCHANGED.
```

- [ ] **Step 3: Build**

Run: `pnpm --filter @looprun-ai/core build`
Expected: clean tsc.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src && git commit -m "feat: the natural reply — the prose is the delivery, the record fills the gaps"
```

---

### Task 2: Rewrite the delivery-format proofs to the new contract

**Files:**
- Modify: every failing test under `packages/core/test/**` (enumerate in Step 1; expected at minimum `packages/core/test/proofs/p08-forced-finish.test.ts` and `packages/core/test/cards/catalog-deterministic.test.ts` — both assert the composition this change retires)

- [ ] **Step 1: Enumerate the failures**

Run: `pnpm --filter @looprun-ai/core test`
Record the failing list in the ledger before touching any test.

- [ ] **Step 2: Rewrite each failing proof to assert the NEW invariant it protects**

The invariant survives; only its observable changes. The mapping:

| old assertion | new assertion |
|---|---|
| forced close opens `Completed: …` | forced close delivers the desk's `lastMessage`, or the settled sentences when no trustworthy message exists; never empty |
| act lines always printed | a write's facts reach the delivery: in the prose (covers) or as its unframed sentence beneath it |
| every open question line present | the question line is present UNLESS the message carries `q.sentence` and `q.code` verbatim |
| history echoes `r.text` | history echoes `modelView` — prose + every settled sentence |

- [ ] **Step 3: Run the whole gate**

Run: `pnpm test` (repo root)
Expected: green. A failure outside `packages/core/test` is a finding — record it, fix it, never skip it.

- [ ] **Step 4: Commit**

```bash
git add -A packages/core/test && git commit -m "test: the delivery proofs state the prose-first contract"
```

---

### Task 3: Proofs for the new mechanisms (unit, no model)

**Files:**
- Create: `packages/core/test/run/delivery-writer.test.ts`
- Create: `packages/core/test/run/figure-grounding.test.ts`

**Interfaces:** Consumes Task 1's exports. Fixtures are plain `Act` literals — no world, no port.

- [ ] **Step 1: Write the delivery-writer proofs (failing first where the file is new)**

```ts
import { describe, expect, test } from 'vitest';
import { DeliveryWriter } from '../../src/run/delivery-writer.js';

const act = (tool: string, args: Record<string, unknown>, status: string, reason: string | null,
             effect: string, sentence: string, questionId: string | null = null) => ({
  origin: 'model', call: { tool, args, key: JSON.stringify({ args: Object.fromEntries(Object.entries(args).sort()), tool }) },
  effect, said: 'yes', status, reason, evidence: 'executor', sentence, result: null,
  id: 'a1', turn: 1, questionId, guard: null
} as never);

describe('settled', () => {
  test('one act per canonical call — arg order never splits it', () => {
    const dw = new DeliveryWriter();
    const done = act('issueRefund', { amount: 100, invoiceId: 'inv_7001' }, 'done', null, 'destructive', 'x — done. 100 back.');
    const retry = act('issueRefund', { invoiceId: 'inv_7001', amount: 100 }, 'not-done', 'blocked', 'destructive', 'x — not-done (again)');
    expect(dw.settled([done, retry])).toEqual([done]);
  });
});

describe('compose', () => {
  test('prose covering ids and figures silences the receipt', () => {
    const dw = new DeliveryWriter();
    const w = act('cancelBooking', { bookingId: 'bk_1001' }, 'done', null, 'destructive',
      'cancelBooking(bk_1001) — done. bk_1001 is cancelled: 0 of deposit stands.');
    expect(dw.compose('A bk_1001 foi cancelada; 0 de caução segue retido.', [w], [], []))
      .toBe('A bk_1001 foi cancelada; 0 de caução segue retido.');
  });
  test('a missing figure prints the unframed receipt beneath the prose', () => {
    const dw = new DeliveryWriter();
    const w = act('cancelBooking', { bookingId: 'bk_1001' }, 'done', null, 'destructive',
      'cancelBooking(bk_1001) — done. bk_1001 is cancelled: 0 of deposit stands.');
    expect(dw.compose('A bk_1001 foi cancelada.', [w], [], []))
      .toBe('A bk_1001 foi cancelada.\n\nbk_1001 is cancelled: 0 of deposit stands.');
  });
  test('the woven ask suppresses the question line; a thin prose does not', () => {
    const dw = new DeliveryWriter();
    const q = { id: 'q1', code: 'CONFIRM abc123', call: {} as never, sentence: 'Cancelling bk_1001 ends the rental.', state: 'open', bornAtTurn: 1 } as never;
    const held = act('cancelBooking', { bookingId: 'bk_1001' }, 'not-done', 'held', 'destructive', 'x — not-done (awaiting approval)', 'q1');
    expect(dw.compose('Cancelling bk_1001 ends the rental. Reply CONFIRM abc123.', [held], [q], []))
      .toBe('Cancelling bk_1001 ends the rental. Reply CONFIRM abc123.');
    expect(dw.compose('Pronto para cancelar.', [held], [q], []))
      .toBe('Pronto para cancelar.\n\n[CONFIRM abc123] Cancelling bk_1001 ends the rental.');
  });
  test('a pure-text read prints as a quote on an ask turn and only there', () => {
    const dw = new DeliveryWriter();
    const policy = act('lookupPolicy', {}, 'done', null, 'read',
      'lookupPolicy() — done. The published policy reads: "a hold lifts once resolved".');
    const held = act('releaseHold', { holdId: 'hold_6001' }, 'not-done', 'held', 'destructive', 'x', 'q1');
    expect(dw.compose('m', [policy, held], [], [])).toContain('The published policy reads');
    expect(dw.compose('m', [policy], [], [])).toBe('m');
  });
  test('never empty: with no prose, the settled sentences speak', () => {
    const dw = new DeliveryWriter();
    const w = act('issueRefund', { invoiceId: 'inv_7001' }, 'done', null, 'destructive',
      'issueRefund(inv_7001) — done. 100 is paid back on inv_7001.');
    expect(dw.compose('', [w], [], [], [], true)).toBe('100 is paid back on inv_7001.');
  });
});

describe('modelView', () => {
  test('the memory keeps every settled sentence the delivery may drop', () => {
    const dw = new DeliveryWriter();
    const r = act('getMember', {}, 'done', null, 'read', 'getMember() — done. Member mem_1001, role billing.');
    expect(dw.modelView('short prose', [r], [])).toContain('role billing');
    expect(dw.compose('short prose', [r], [], [])).toBe('short prose');
  });
});
```

- [ ] **Step 2: Write the figure-grounding proof**

```ts
// figure-grounding.test.ts — exercises the tryFinish evidence rule at unit level via a
// direct reimplementation guard: the exported figureRuns/canonicalAmount pair over the
// spec's two recorded lies.
import { expect, test } from 'vitest';
import { canonicalAmount, figureRuns } from '../../src/cards/catalog.js';

const canon = (t: string): Set<string> => new Set(figureRuns(t).map(canonicalAmount));

test('desk arithmetic grounds on nothing', () => {
  const evidence = canon('settlement 9000 requested; deposit held 1200 on bk_1003');
  const stated = canon('A diferença de 7800 deve ser tratada fora deste sistema.');
  expect([...stated].filter(f => !evidence.has(f))).toEqual(['7800']);
});

test('pt-BR formatting covers the plain figure', () => {
  expect(canon('limite de 5.000.000')).toEqual(canon('5000000 of deposit float'));
});
```

- [ ] **Step 3: Run** `pnpm --filter @looprun-ai/core test` — expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core/test && git commit -m "test: proofs for coverage, weaving, memory and grounded figures"
```

---

### Task 4: Usage capture in the runner

**Files:**
- Modify: `packages/core/src/contract/ports.ts` (StepResult gains optional usage)
- Modify: the `ToolPort`/model-seat implementation that adapts the provider (locate with `grep -rn "step(" packages/*/src --include="*.ts"`; the AI SDK response carries `usage`)
- Modify: `packages/eval/src/**` exam runner + dump shape

**Interfaces:**
- Produces: dump field `usage: readonly { turn: number; inputTokens: number; outputTokens: number; cachedInputTokens: number; wallClockMs: number; modelCalls: number }[]` — consumed by the closing measurement (Task 7).

- [ ] **Step 1: Write the failing dump-shape test** — a fixture run (toy subject, stub port returning fixed usage) asserts the dump carries per-turn usage totals.
- [ ] **Step 2: Thread `usage` from the provider response** through `StepResult` (optional field; a port with no numbers reports zeros, never lies) and accumulate per turn in the exam runner.
- [ ] **Step 3: Run the eval package tests** — PASS; run one toy-subject case end-to-end offline (stub port) and eyeball the dump.
- [ ] **Step 4: Commit** `feat(eval): the dump carries what each turn cost`.

---

### Task 5: Documentation

**Files:**
- Modify: `README.md` — the delivery contract: the reply is the desk's prose; coverage and the net; the woven consent; a real two-turn example (case 01's, from the spec §1)
- Modify: `docs/tutorial/**` — every lesson that shows a delivered reply gets the new shape
- Modify: `governance/**` — the honesty-guarantee wording: figures reach the operator through the prose under `figureIsGrounded` and coverage, with the engine's sentences as the net; a contradicted message is never delivered
- Verify: source headers of the five engine files state the new truth (rewritten on the branch already — carried by Task 1's diff)

- [ ] **Step 1: Sweep** `grep -rn "Completed:" README.md docs/ governance/` — every hit is a page that shows the retired shape.
- [ ] **Step 2: Rewrite each page AS-IS** (no history, no "previously").
- [ ] **Step 3: Run the docs gates** (`pnpm test` includes lesson-compile and registers tests).
- [ ] **Step 4: Commit** `docs: the delivered reply is one voice`.

---

### Task 6: The skill (agentspec), same working session

**Files (in `../agentspec`):**
- Modify: the delivery/reply teaching pages (locate: `grep -rln "act line\|Completed:" skills pages`)
- Modify: the evals/test pages — the two-halves bar (letters AND deterministic counters; already agentspec `BACKLOG.md` row 1)
- Modify: consent authoring guidance — the before-tense sentence is woven verbatim into prose: authors write it as a sentence that can sit inside a message
- Add: the A/B law for prompt-side wording (case 77: one byte, one case)

- [ ] **Step 1: Update the pages; run the skill's lints** (`node lint-authoring.mjs` or the repo's battery).
- [ ] **Step 2: Commit in agentspec** `docs(skill): the reply is the desk's prose; the bar has two halves`.

---

### Task 7: The closing measurement — GATED, runs only on the user's explicit order

**Files:**
- Create (after the run): `agentspec-bench/subjects/atlas-c17/test/<date>-natural-100/rep1/**` (sealed) and the comparison table appended to the spec

- [ ] **Step 1: WAIT for the user's order.** Nothing in this task starts without it.
- [ ] **Step 2: Run the English hundred, 1 rep** — `SUBJECT_DIR=subjects/atlas-c17`, final build, usage capture on.
- [ ] **Step 3: Judge every letter in session** (letter-strict; the agent is the judge — no external model) and compute the deterministic counters.
- [ ] **Step 4: Produce the three-column table** (sealed baseline `2026-08-23-c17-w100` · this run · `atlas-traditional/runs/final/stats.json`): letters, counters, tokens in/out/cached, wall clock, delivered bytes, model calls, cost per conversation and per turn.
- [ ] **Step 5: Stamp the spec** — CLOSED with the figures if the two-halves bar holds (letters ≥ 96/100, counters zero); otherwise the misses are findings, back to the loop.
- [ ] **Step 6: Retire looprun `BACKLOG.md` row 1** (natural reply) with the result; seal the run in agentspec-bench; commit both repos.

---

## Out of scope (registered, not lost)

- **Declared vocabulary** (engine words per subject language: `done`, `CONFIRM` literals, closures) — spec §4; needs declaration schema + emit + core; its own design.
- **Prompt bytes −50%** — looprun `BACKLOG.md` row 2, its own adversarial evaluation; this plan ships only the measured-safe −8% (slim) and the forced-step cut.
- **atlas-c17-ptbr full authoring in pt-BR** — subject work in agentspec-bench.
