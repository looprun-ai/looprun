# C4 — Records Refuse First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Rulebook.checkPreTool` walks its covering rows twice — restate · owe · deny across all rows first, hold second — so no question ever opens over an act any rule refuses; the two harborpoint arms migrate off `choiceFromUser` and are committed.

**Architecture:** One method changes in `packages/core/src/run/rulebook.ts`; everything else is proofs, docs, skill and the arm migration. Spec: `docs/superpowers/specs/2026-09-01-c4-records-refuse-first-design.md`.

**Tech Stack:** TypeScript, vitest, pnpm workspace.

## Global Constraints

- English only in every file; AS-IS comments (no history, no evidence, no test names).
- No shim, no compatibility path: old behavior is replaced in the same commit.
- No external model call anywhere; the directed subset reaches only the subject model in `ask/targets.json`, and its verdicts are judged in session.
- The four slice40 cases (39/47/51/55) are NOT claimed by this item and stay red.
- Branch: `c4-refusal-walks-first` in `~/Dev/js/looprun/looprun`; harborpoint work in `~/Dev/js/harborpoint` on `main`. Nothing is pushed; nothing merges without the owner's word.

---

### Task 1: The order proofs, failing first

**Files:**
- Create: `packages/core/test/run/refusal-before-question.test.ts`

**Interfaces:**
- Consumes: `AgentFactory.governed`, `Rulebook`, `factsFromWorld`, `HOSTILE` fixture — the same pattern `packages/core/test/cards/agent-factory.test.ts` uses.
- Produces: the five proofs the spec's acceptance table names.

- [ ] **Step 1: Write the failing proofs**

```typescript
import { test, expect } from 'vitest';
import type { Act } from '../../src/contract/vocabulary.js';
import { AgentFactory } from '../../src/cards/agent-factory.js';
import { onlyAfter, precondition } from '../../src/cards/catalog.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { Rulebook } from '../../src/run/rulebook.js';
import { HOSTILE } from '../fixtures/hostile-world.js';

const FACTS = factsFromWorld(HOSTILE);
const f = new AgentFactory();

const spent: Act = { id: 'a_1', call: { tool: 'cancelBooking', args: { id: 'bk_9' }, key: 'cancel:bk_9' },
  effect: 'destructive', status: 'done', result: { id: 'bk_9' },
  sentence: 'cancelBooking(bk_9) — done' } as unknown as Act;

const call = (tool: string, args: Record<string, string>, key: string,
              turnActs: readonly Act[] = [], consented = false) => ({
  call: { tool, args, key }, effect: 'destructive' as const, consented, state: null,
  userText: 'go', userTexts: ['go'], turnActs, pastActs: [] });

test('a later deny beats an earlier hold — the budget refuses before consent asks', () => {
  const rulebook = new Rulebook(f.governed({ name: 'a', persona: 'p' }, undefined, FACTS));
  const verdict = rulebook.checkPreTool(call('cancelBooking', { id: 'bk_2' }, 'cancel:bk_2', [spent]));
  expect(verdict).toMatchObject({ kind: 'refuse', guardName: 'maxDestructive' });
});

test('a question opens where nothing refuses', () => {
  const rulebook = new Rulebook(f.governed({ name: 'a', persona: 'p' }, undefined, FACTS));
  const verdict = rulebook.checkPreTool(call('cancelBooking', { id: 'bk_2' }, 'cancel:bk_2'));
  expect(verdict).toMatchObject({ kind: 'hold' });
});

test('refusals keep declaration order — the earlier row speaks', () => {
  const rulebook = new Rulebook(f.governed(
    { name: 'a', persona: 'p',
      guards: [{ name: 'spec-no', rule: 'No.', on: 'preTool', deny: () => 'the spec refuses' }] },
    { name: 'd', guards: [precondition('cancelBooking', () => false, 'The contract refuses.')] },
    FACTS));
  const verdict = rulebook.checkPreTool(call('cancelBooking', { id: 'bk_2' }, 'cancel:bk_2'));
  expect(verdict).toMatchObject({ kind: 'refuse', guardName: 'spec-no' });
});

test('a duplicate restates before anything else speaks', () => {
  const rulebook = new Rulebook(f.governed({ name: 'a', persona: 'p' }, undefined, FACTS));
  const verdict = rulebook.checkPreTool(call('cancelBooking', { id: 'bk_9' }, 'cancel:bk_9', [spent]));
  expect(verdict).toEqual({ kind: 'restate', actId: 'a_1' });
});

test('an owed read still precedes the consent question', () => {
  const rulebook = new Rulebook(f.governed(
    { name: 'a', persona: 'p' },
    { name: 'd', guards: [onlyAfter('cancelBooking', 'getBooking')] }, FACTS));
  const verdict = rulebook.checkPreTool(call('cancelBooking', { id: 'bk_2' }, 'cancel:bk_2'));
  expect(verdict).toMatchObject({ kind: 'owe' });
});
```

Adjust the two hand-built guard literals to the `CompiledGuard`/seed shapes the factory
actually accepts (the spec-guard literal follows the shape agent-factory.test.ts already
passes; `precondition(...)` is a seed the contract accepts as declared guards).

- [ ] **Step 2: Run and verify the first proof fails**

Run: `pnpm --filter @looprun-ai/core exec vitest run test/run/refusal-before-question.test.ts`
Expected: proof 1 FAILS (today the verdict is `hold`); the others pass.

- [ ] **Step 3: Commit the red proofs? No — hold the commit until Task 2 makes them green (one commit, code + proofs).**

### Task 2: The two walks

**Files:**
- Modify: `packages/core/src/run/rulebook.ts:1-5` (header) and `:65-84` (`checkPreTool`)

**Interfaces:**
- Produces: `checkPreTool(ctx: CallCtx): Verdict` — same signature, two-walk order.

- [ ] **Step 1: Replace `checkPreTool` with the spec's §2 code, verbatim; rewrite the header line "first non-allow verdict wins on input/preTool" to the two-walk truth.**

- [ ] **Step 2: Run the proofs**

Run: `pnpm --filter @looprun-ai/core exec vitest run test/run/refusal-before-question.test.ts`
Expected: 5/5 PASS.

- [ ] **Step 3: Full workspace**

Run: `pnpm build && pnpm test`
Expected: green (engine + skill + gates). Fix any test asserting the one-walk order by
re-reading it against the spec — the spec governs.

- [ ] **Step 4: Commit**

```bash
git add -A packages/core && git commit -m "feat(core): the records refuse before the desk asks"
```

### Task 3: The harborpoint arms leave choiceFromUser

**Files (in `~/Dev/js/harborpoint`):**
- Modify: `subjects/hp-armon/{declaration.yaml,cards.ts,cases.ts,check-subject.test.ts}`
- Modify: `subjects/hp-armoff/{declaration.yaml,cards.ts,cases.ts,check-subject.test.ts}`
- Commit (currently untracked): both subject dirs + `tools/arm-wiring.test.ts` + `tools/probe-conditions.test.ts`

- [ ] **Step 1: Verify the arms differ from `dceb4b5^` only by the arm**

```bash
for f in declaration.yaml cards.ts cases.ts check-subject.test.ts; do
  git show "dceb4b5^:subjects/harborpoint/$f" | diff - "subjects/hp-armoff/$f"
  git show "dceb4b5^:subjects/harborpoint/$f" | diff - "subjects/hp-armon/$f"
done
```
Expected: armoff identical on all four; armon differs in `cards.ts` only — the `DEAD` import
and three `DEAD.vesselIsFrozen` lines.

- [ ] **Step 2: Copy the post-migration files and re-apply the arm**

```bash
for f in declaration.yaml cards.ts cases.ts check-subject.test.ts; do
  git show "dceb4b5:subjects/harborpoint/$f" > "subjects/hp-armoff/$f"
  git show "dceb4b5:subjects/harborpoint/$f" > "subjects/hp-armon/$f"
done
# hp-armon/cards.ts: add back `import { DEAD } from './world.js';` and the three
# DEAD.vesselIsFrozen conditions exactly where hp-armoff reads NOTHING_BLOCKS_THIS_ACT.
```

- [ ] **Step 3: Prove the arm survived**

Run: `diff subjects/hp-armon/cards.ts subjects/hp-armoff/cards.ts`
Expected: exactly the import line + three condition lines.

- [ ] **Step 4: Green in harborpoint**

Run: `pnpm exec vitest run tools/arm-wiring.test.ts tools/census.test.ts subjects/hp-armon/check-subject.test.ts subjects/hp-armoff/check-subject.test.ts` (paths as the repo's runner takes them)
Expected: PASS.

- [ ] **Step 5: Commit in harborpoint**

```bash
git add subjects/hp-armon subjects/hp-armoff tools/arm-wiring.test.ts tools/probe-conditions.test.ts
git commit -m "test(subjects): the two consent arms, migrated off the choice gate"
```

### Task 4: Documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md` (the §12 walk drawing and any one-pass description of `checkPreTool`)
- Modify: `docs/tutorial/04-guards.md` (the order teaching)
- Sweep: `grep -rn "first non-allow\|hold.*before.*deny" docs/ README.md`

- [ ] **Step 1: Amend the blueprint walk text to the two-walk order; R5.1/R5.4 already state the law — align the drawing.**
- [ ] **Step 2: Tutorial 04: add the law with the budget example (approval never buys a refusal).**
- [ ] **Step 3: Sweep and rewrite AS-IS; commit `docs: the walk refuses before it asks`.**

### Task 5: The skill (same session)

**Files (in `~/Dev/js/looprun/agentspec`):**
- Modify: `skill/references/guard-catalog.md` — *"The array has an order"* section

- [ ] **Step 1: Amend: refusals keep declaration order among themselves; a question never precedes a refusal (the walk finishes every refusal before any question opens). Keep the diagnosis-order teaching.**
- [ ] **Step 2: Run the skill's own gate (`check-subject.test.ts` / lint battery) if it covers references; commit `docs(skill): the walk refuses before it asks`.**

### Task 6: Prompt parity proof

- [ ] **Step 1: Render the five live subjects' prompts on `main` and on the branch (no model): `SubjectLoader.promptProof` per subject, bytes to files, `diff`.**
Expected: ZERO bytes differ (the change touches no prompt path).

### Task 7: Directed subset, judged in session

- [ ] **Step 1: Run the consent family on the C4 build**

```bash
cd ~/Dev/js/looprun/agentspec-bench
SUBJECT_DIR=subjects/atlas-c20 RUN_DIR=subjects/atlas-c20/test/2026-09-01-c4-directed \
CASE_IDS=01,05,07,17,29,95 <looprun>/node_modules/.bin/vitest run tools/run-cases.test.ts
```

- [ ] **Step 2: Judge in session (read the dumps against the rubrics; write `verdicts.jsonl`). Bar: every question that opened in `2026-09-01-c2-slice40` still opens; no regression.**
- [ ] **Step 3: Rewrite `BACKLOG.md` — the C4 row to this spec's truth; the four cases registered on the C6+C3 row, home pending the owner's ruling. Commit.**
- [ ] **Step 4: Report to the owner and STOP — no merge without the word.**
