# C1 — The Rehearsal Seam Comes Out — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every way the engine learns what an act would answer without running it — the `rehearse` port seam, the `simulate` declaration route, and the consent-path rehearsal — leaving the engine two moves: call, or do not call.

**Architecture:** Pure deletion driven by the type system: the `simulation` field leaves `ToolFact`/`WorldToolEntry`, `rehearse` leaves `ToolPort`, and every compile error that follows marks a consumer to delete. No behavior on any live subject changes — none declares the seam — so acceptance is the gate plus a byte-identity argument, no model run.

**Tech Stack:** TypeScript, pnpm workspace, vitest. Spec: `docs/superpowers/specs/2026-08-31-cx-program-design.md` (section C1).

## Global Constraints

- Work lands on branch `minimal-core`, checked out at `/private/tmp/claude-501/-Users-marcos-Dev-js-looprun-looprun/4b0daa7e-7c02-45b4-9036-ec24fbe5fc62/scratchpad/today` (called `<WT>` below). Task 4 additionally touches the agentspec repo at `/Users/marcos/Dev/js/looprun/agentspec` (its own git, its own commit).
- Every byte written to a file is English.
- Comments and docs state what the system IS — no "removed", no "no longer", no "used to", no test names, no evidence citations.
- Old names are deleted in the same commit; no shim, no deprecation alias.
- NO observation about dry runs anywhere: if a real surface offers one, it arrives as one more tool, and no file says so.
- The bench subjects (`agentspec-bench`, `harborpoint`) are not touched by this plan.
- Verification commands run from `<WT>` unless stated otherwise.

---

### Task 1: The seam leaves the engine core

**Files:**
- Modify: `packages/core/src/contract/vocabulary.ts:30-33, 44-45, 59, 86, 255-257, 294-301, 331-339`
- Modify: `packages/core/src/contract/ports.ts:7-11`
- Modify: `packages/core/src/cards/facts.ts:28, 43, 58`
- Modify: `packages/core/src/cards/wordings.ts:26`
- Modify: `packages/core/src/world/world-builder.ts:72-91`
- Modify: `packages/core/src/run/call-runner.ts` (deps, hold route, rehearsal methods, imports)
- Modify: `packages/core/src/run/session.ts:49-50`
- Modify: `packages/core/src/run/turn.ts:281`
- Delete: `packages/core/test/cases/m8-simulate-revoke.test.ts`
- Modify (type-driven): `packages/core/test/cards/facts-from-world.test.ts`, `test/cards/wordings.test.ts`, `test/cases/pins.test.ts`, `test/cases/m2-consent-decline-expire.test.ts`, `test/cases/m4-disclosure.test.ts`, `test/cases/m7-world-refusals.test.ts`, `test/world/world-builder.test.ts`, `test/fixtures/compiled-agents.ts`, `test/fixtures/hostile-world.ts`, `test/cards/agent-factory.test.ts`, `test/contract/canonical-call.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ToolPort` = `{ call(call: ReadyCall): Promise<ToolAnswer> }` (one method). `ToolFact` without `simulation`. `WorldToolEntry` without `simulation`. `Correction` union without `simulationRevoked`. `EngineSentenceKey` without `'simulatedResult'`. `CallRunnerDeps` without `revoked`. Tasks 2–5 rely on these exact shapes.

- [ ] **Step 1: Record the dead-path proof (baseline)**

Run:
```bash
rg -l 'simulation' /Users/marcos/Dev/js/looprun/agentspec-bench/subjects/atlas-c20 \
  /Users/marcos/Dev/js/looprun/agentspec-bench/subjects/atlas-c21 \
  /Users/marcos/Dev/js/harborpoint/subjects/hp-armon \
  /Users/marcos/Dev/js/harborpoint/subjects/hp-armoff --glob '*.ts'
```
Expected: empty output — no live subject declares the seam. The `simulate` property enters a rendered prompt only through `formSchema` when a card declares `simulation: true` (`packages/core/src/cards/facts.ts:28`), so with zero declarations the rendered prompts are byte-identical before and after this plan. Paste the empty result into the task report.

- [ ] **Step 2: Edit `packages/core/src/contract/vocabulary.ts` — seven hunks**

Hunk 1 (lines 30-33) — the `ReadyCall` comment loses its simulation sentence:
```ts
// OLD
/** The call as the executor receives it: the tool name and the coerced REAL args — nothing else.
 *  A simulation downgrade exists only as the tool's OWN declared parameter set inside args.
 *  No other field exists: no options, no flags, no attestation override. */
// NEW
/** The call as the executor receives it: the tool name and the coerced REAL args — nothing else.
 *  No other field exists: no options, no flags, no attestation override. */
```

Hunk 2 (lines 44-45) — the hold verdict comment:
```ts
// OLD
  | { readonly kind: 'hold'; readonly guardName: string;    // consent: hold-and-ask; a declared
      readonly sentence: string }                           //   simulation rides the hold route
// NEW
  | { readonly kind: 'hold'; readonly guardName: string;    // consent: hold-and-ask
      readonly sentence: string }
```

Hunk 3 (line 59) — the correction kind dies:
```ts
// DELETE this line from the Correction union
  | { readonly kind: 'simulationRevoked'; readonly tool: string }
```

Hunk 4 (line 86) — the act result comment:
```ts
// OLD
  readonly result: Json;                      // masked; on a held call with simulation: the simulated result
// NEW
  readonly result: Json;                      // masked
```

Hunk 5 (lines 255-257) — the sentence key dies:
```ts
// OLD
export type EngineSentenceKey = 'approvalInstruction' | 'exhaustionClosure' | 'unknownStatus'
                              | 'questionExpired' | 'questionSuperseded' | 'questionDeclined'
                              | 'deniedByGuard' | 'simulatedResult';
// NEW
export type EngineSentenceKey = 'approvalInstruction' | 'exhaustionClosure' | 'unknownStatus'
                              | 'questionExpired' | 'questionSuperseded' | 'questionDeclined'
                              | 'deniedByGuard';
```

Hunk 6 (line 299, inside `ToolFact`) — delete the field:
```ts
// DELETE
                            readonly simulation: { readonly arg: string; readonly value: Json } | null;
```

Hunk 7 (line 339, inside `WorldToolEntry`) — delete the field:
```ts
// OLD
                                  readonly when?: ConsentWhen;
                                  readonly simulation?: true }
// NEW
                                  readonly when?: ConsentWhen }
```

- [ ] **Step 3: Edit `packages/core/src/contract/ports.ts` — one method on the tool port**

```ts
// OLD (lines 7-11)
export interface ToolPort         { call(call: ReadyCall): Promise<ToolAnswer>;
                                    /** The rehearsal: the same call against a throwaway copy of the
                                     *  world — a refusal here is what the real call would answer.
                                     *  Absent on hosts that cannot rehearse safely. */
                                    rehearse?(call: ReadyCall): Promise<ToolAnswer> }
// NEW
export interface ToolPort         { call(call: ReadyCall): Promise<ToolAnswer> }
```

- [ ] **Step 4: Edit `packages/core/src/cards/facts.ts` — three deletions**

Delete line 28:
```ts
  if (entry.simulation === true) properties.simulate = { type: 'boolean' };
```
Delete line 43 (in `declaredFact`) and line 58 (in `remoteFact`):
```ts
    simulation: entry.simulation === true ? { arg: 'simulate', value: true } : null,
```

- [ ] **Step 5: Edit `packages/core/src/cards/wordings.ts` — the sentence dies**

```ts
// OLD (lines 24-27)
  questionDeclined: 'You declined, so nothing ran.',
  deniedByGuard: 'A rule stopped this call.',
  simulatedResult: 'A simulated result — nothing has run yet:'
};
// NEW
  questionDeclined: 'You declined, so nothing ran.',
  deniedByGuard: 'A rule stopped this call.'
};
```

- [ ] **Step 6: Edit `packages/core/src/world/world-builder.ts` — the copy path dies**

Hunk 1 (lines 72-74) — `call()` always acts on the real store:
```ts
// OLD
    const simulated = entry.simulation === true && coerced.simulate === true;
    const target = simulated ? new Store(this.store.snapshot()) : this.store;
    const answer = this.perform(entry, call.tool, ready, target);
// NEW
    const answer = this.perform(entry, call.tool, ready, this.store);
```

Hunk 2 (lines 80-91) — delete the whole `rehearse` method with its comment:
```ts
// DELETE
  /** The rehearsal: the shared act path against a throwaway copy of the store.
   *  Pure executors make it always safe; no audit row — the engine records the
   *  outcome as its own act. */
  rehearse(call: ReadyCall): Promise<ToolAnswer> {
    const found = findEntry(this.declared, call.tool);
    if (found === null) return Promise.resolve(refusal(`No such tool: ${call.tool}.`));
    const coerced = this.coerce(found.entry, call.args);
    if (typeof coerced === 'string') return Promise.resolve(refusal(coerced));
    const ready: ReadyCall = { tool: call.tool, args: coerced };
    return Promise.resolve(this.perform(found.entry, call.tool, ready,
      new Store(this.store.snapshot())));
  }
```

- [ ] **Step 7: Edit `packages/core/src/run/call-runner.ts` — six hunks**

Hunk 1 — delete `refusedSentence` (lines 22-35, function plus its comment; its only caller dies in hunk 5).

Hunk 2 — the masker comment and the `revoked` dep (lines 52-57):
```ts
// OLD
  /** The record-seam masker: stored calls, results and the simulated line. */
  readonly masker: Masker;
  /** The compiled disclosure recipes; the hold route reads and renders through it. */
  readonly disclosure: DisclosureDesk;
  /** Tools whose simulation mutated state this session — plain consent for them. */
  readonly revoked: Set<string>;
// NEW
  /** The record-seam masker: stored calls and results. */
  readonly masker: Masker;
  /** The compiled disclosure recipes; the hold route reads and renders through it. */
  readonly disclosure: DisclosureDesk;
```

Hunk 3 — the hold route loses the rehearsal (lines 188-204). The `emptySentence` block ends at line 187; the OLD text from there to the consent hold is:
```ts
// OLD
        // The rehearsal outranks the ask: the held call runs against a throwaway
        // copy of the world first, and a refusal there IS the answer — the desk
        // never asks about an act the world would refuse.
        const rehearsed = await this.rehearse(call, fact, draft);
        if (rehearsed.refusal !== null) {
          return this.record(draft, {
            origin, call: call.data(v => this.deps.masker.maskData(v)), effect: fact.effect,
            said: null, status: 'not-done', reason: 'blocked', evidence: 'engine',
            sentence: `${this.head(call, fact)} — not-done (${rehearsed.refusal})`,
            owed: { kind: 'refusal', text: rehearsed.refusal }, result: null
          }, undefined, null, 'rehearsal');
        }
        const tenses = this.deps.disclosure.tenses(call.tool, ctx.call, reads);
        let sentence = tenses.before ?? verdict.sentence;
        sentence += rehearsed.line;
// NEW
        const tenses = this.deps.disclosure.tenses(call.tool, ctx.call, reads);
        const sentence = tenses.before ?? verdict.sentence;
```

Hunk 4 — delete the two private methods whole (lines 251-289): `rehearse` with its doc comment ("The rehearsal on hold. …") and `rehearsalAnswer`.

Hunk 5 — imports. Line 5-6: drop `ToolAnswer` (its uses die with hunk 4); line 10: drop `canonicalJson`:
```ts
// OLD
import type { Act, CallCtx, CanonicalCallData, Json, OwedRead, RawCall, StateSnapshot,
              ToolAnswer } from '../contract/vocabulary.js';
...
import { CanonicalCall, canonicalJson, isJson } from '../contract/canonical-call.js';
// NEW
import type { Act, CallCtx, CanonicalCallData, Json, OwedRead, RawCall,
              StateSnapshot } from '../contract/vocabulary.js';
...
import { CanonicalCall, isJson } from '../contract/canonical-call.js';
```

Hunk 6 — the file's other lines stay byte-for-byte; in particular the `execute`, `refuseUnpaidDebt`, `callCtx`, `head`, `record` methods are untouched.

- [ ] **Step 8: Edit `packages/core/src/run/session.ts` — the revocation set dies (lines 49-50)**

```ts
// DELETE
  /** Tools whose simulation mutated state — they fall back to plain consent here. */
  readonly revokedSimulations = new Set<string>();
```

- [ ] **Step 9: Edit `packages/core/src/run/turn.ts` — the wiring (line 281)**

```ts
// OLD
      revoked: session.revokedSimulations, microStep });
// NEW
      microStep });
```

- [ ] **Step 10: Delete the seam's own suite**

```bash
git rm packages/core/test/cases/m8-simulate-revoke.test.ts
```

- [ ] **Step 11: Delete the dead-wording pin in `packages/core/test/cases/pins.test.ts`**

Delete the whole test at lines 49-61 — `test('the simulated-result wording is a contract override away', …)` — including its fixture override `wording: { sentence: { simulatedResult: 'A dry look at the outcome:' } }`. Every OTHER pin in this file must pass UNCHANGED: an edit to any other pinned byte fails this task's review.

- [ ] **Step 12: Build, and let the compiler mark the remaining test consumers**

Run:
```bash
pnpm -r --if-present build 2>&1 | tail -20
pnpm --filter @looprun-ai/core exec vitest run 2>&1 | tail -30
```
Expected: errors ONLY in the files this task lists. Fix each by DELETING the seam reference, with this decision rule: a fixture field `simulation: …` is removed from the object literal; an assertion that the seam mints `simulate`/`simulation` (`facts-from-world.test.ts`, 7 refs) is deleted; an assertion on the `simulatedResult` default (`wordings.test.ts`, 3 refs) is deleted; a scenario driving `rehearse`/`simulate: true` (`world-builder.test.ts` 3, `m2` 2, `m4` 3, `m7` 2) loses that scenario only; a passing mention in a comment (`agent-factory.test.ts` 1, `canonical-call.test.ts` 1, `compiled-agents.ts` 1, `hostile-world.ts` 1) is rewritten to the surviving truth. Never weaken an assertion that does not name the seam.

- [ ] **Step 13: Verify green and grep-zero in core**

```bash
pnpm --filter @looprun-ai/core exec vitest run 2>&1 | tail -5
rg -in 'rehears|simulat' packages/core/src packages/core/test
```
Expected: suite green; grep empty.

- [ ] **Step 14: Commit**

```bash
git add -A packages/core
git commit -m "refactor: the rehearsal seam comes out - the engine calls, or does not call"
```

---

### Task 2: The word leaves emit and eval

**Files:**
- Modify: `packages/emit/src/write-cards.ts:650`
- Modify: `packages/eval/src/lints.ts:1797`

**Interfaces:**
- Consumes: `EngineSentenceKey` without `'simulatedResult'` (Task 1).
- Produces: the emit sentence-key list matching `EngineSentenceKey` exactly.

- [ ] **Step 1: Edit `packages/emit/src/write-cards.ts` (lines 649-651)**

```ts
// OLD
  sentence: ['approvalInstruction', 'exhaustionClosure', 'unknownStatus', 'questionExpired',
    'questionSuperseded', 'questionDeclined', 'deniedByGuard', 'simulatedResult']
// NEW
  sentence: ['approvalInstruction', 'exhaustionClosure', 'unknownStatus', 'questionExpired',
    'questionSuperseded', 'questionDeclined', 'deniedByGuard']
```

- [ ] **Step 2: Edit `packages/eval/src/lints.ts` (line 1797)**

The lint runs the AUTHOR's own executor offline to prove its refusal codes — build-time verification, not an engine seam — and it stays. Only its minted-id label stops wearing the dead word:
```ts
// OLD
    const out = executor({ args, records, mintId: entity => `${entity}_rehearsal` });
// NEW
    const out = executor({ args, records, mintId: entity => `${entity}_probe` });
```

- [ ] **Step 3: Verify the two packages and grep-zero across all src**

```bash
pnpm --filter @looprun-ai/emit exec vitest run 2>&1 | tail -5
pnpm --filter @looprun-ai/eval exec vitest run 2>&1 | tail -5
rg -in 'rehears|simulat' packages/*/src
```
Expected: both suites green; grep empty. (If a package name differs, read it from its `package.json` `name` field and reuse.)

- [ ] **Step 4: Commit**

```bash
git add packages/emit packages/eval
git commit -m "refactor: the simulated-result sentence leaves the emit surface"
```

---

### Task 3: The blueprint states the two-move law

**Files:**
- Modify: `docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md:31, 292, 353, 366-367, 376, 391, 540`

**Interfaces:**
- Consumes: the shapes Task 1 produced — the blueprint must match them verbatim.
- Produces: nothing downstream.

This file is the engine's standing map (`CLAUDE.md` names it); historical specs, plans and analyses are records of decisions and are NOT touched.

- [ ] **Step 1: Apply the seven line edits**

Line 31: `tool's governance facts (effect class, target argument, simulation parameter, sensitive` → drop `simulation parameter, `.

Line 292: the fact-field list `` `label` / `target` / `proxy` / `simulation` / `does` `` → drop `` `simulation` / ``.

Line 353: delete the line `` *  A simulation downgrade exists only as the tool's OWN declared parameter set inside args.`` (matches the vocabulary comment after Task 1).

Lines 366-367:
```
// OLD
  | { readonly kind: 'hold' }                                 // consent, no simulation declared: hold-and-ask
  | { readonly kind: 'simulate' }                             // consent, simulation declared: preview, then ask (R5.4)
// NEW
  | { readonly kind: 'hold' }                                 // consent: hold-and-ask
```

Line 376: delete `  | { readonly kind: 'simulationRevoked'; readonly tool: string }`.

Line 391: `readonly result: Json;                      // masked; on a held call with simulation: the preview result` → `readonly result: Json;                      // masked`.

Line 540: the fact list `(name · label · does · effect · target · schema · simulation · proxy)` → `(name · label · does · effect · target · schema · proxy)`.

- [ ] **Step 2: Verify no other living-doc hit remains**

```bash
rg -n 'rehears|simulat' docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md docs/tutorial README.md
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md
git commit -m "docs: the blueprint states the two-move consent law"
```

---

### Task 4: The skill teaches a world with one way to act

**Files (agentspec repo — `/Users/marcos/Dev/js/looprun/agentspec`, its own git):**
- Modify: `skill/references/gen.md:104-141`
- Sweep: `skill/references/engine-seams.md`, `skill/references/guard-contexts.md`, `skill/references/author.md`, `skill/references/guard-catalog-lessons.md`, `skill/references/local-performance.md`, `skill/scripts/synth-fork.mjs`, `skill/scripts/extract-fork.mjs`

**Interfaces:**
- Consumes: the two-move law (Task 1) and the surviving `WorldToolEntry` shape (no `simulation` field).
- Produces: a skill that generates subjects the post-C1 engine serves.

- [ ] **Step 1: `gen.md` — the field table row dies (line 109)**

```
// DELETE this table row
| `simulation` | `true` when the tool can run harmlessly against a copy |
```

- [ ] **Step 2: `gen.md` — the refusal paragraph states the surviving truth (lines 127-141)**

```
// OLD (first paragraph of the block)
**A world refusal is a sentence a person reads, because the engine REHEARSES.** Before it asks
anyone to approve a held call, the engine runs that call against a throwaway copy of the world.
A refusing rehearsal cancels the question and records the act as blocked, carrying the world's
own words. Those words come from one of two places, and only one of them is yours to write:
// NEW
**A world refusal is a sentence a person reads.** The world answers only when an act runs: an
approved act the world refuses comes back as a refusal the operator reads, carrying the world's
own words. Those words come from one of two places, and only one of them is yours to write:
```
The two-source table that follows (a `gates` entry / a custom executor) states world-side wording and stands unchanged.

- [ ] **Step 3: Sweep the remaining files**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec && rg -n 'rehears|simulat' skill
```
Fix every hit by this decision rule: a sentence TEACHING the seam (declare `simulation`, expect a rehearsal, read a simulated result) is deleted or rewritten to the two-move law; a sentence FORBIDDING it (the three hostile-world laws in `gen.md`) stands; a word naming a business concept in an invented-domain example, not the engine seam, stands. After the sweep the only allowed hits are the forbidding laws.

- [ ] **Step 4: Run the skill's own lints, then commit in agentspec**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec && node skill/scripts/lint-authoring.mjs 2>&1 | tail -5 || true
git add skill && git commit -m "docs(skill): the world answers only when an act runs"
```
(If the lint script lives under a different name, list `skill/scripts/` and run the authoring lint found there.)

---

### Task 5: Acceptance, and C1 leaves the backlog

**Files:**
- Modify: `BACKLOG.md` (the C1 row)

**Interfaces:**
- Consumes: everything above.
- Produces: the program's gate for starting C2.

- [ ] **Step 1: The whole workspace gate**

```bash
cd <WT> && pnpm test 2>&1 | tail -10
```
Expected: green (`pnpm -r --if-present test && pnpm gates`).

- [ ] **Step 2: Grep-zero, engine-wide**

```bash
rg -in 'rehears|simulat' packages/
```
Expected: empty — src and tests both.

- [ ] **Step 3: The byte-identity argument, restated with evidence**

Re-run the Task 1 Step 1 grep (still empty) and state in the report: zero live subjects declare `simulation`; the `simulate` property entered a rendered prompt only through the schema minting this plan deleted; therefore every rendered prompt is byte-identical, and no model run is owed. The pins criterion (Task 1 Step 11: every surviving pin unchanged) is the in-repo proof.

- [ ] **Step 4: The C1 row leaves the table**

In `<WT>/BACKLOG.md`, delete the whole `| C1 | **The rehearsal seam comes out** | … |` row — the backlog keeps only work still owed.

- [ ] **Step 5: Commit**

```bash
git add BACKLOG.md
git commit -m "docs(backlog): C1 done - the rehearsal seam is out"
```

---

## Self-review notes

- Spec coverage: C1's four law sections map to Task 1+2 (implementation), Task 3 (documentation), Task 4 (skill), Task 5 + Task 1 Step 1 (measurement: the dead-path proof and the byte-identity argument — the spec's "no model run" acceptance).
- Type consistency: `ToolPort`, `ToolFact`, `WorldToolEntry`, `EngineSentenceKey`, `CallRunnerDeps` shapes in Tasks 2-4 match Task 1's produced interfaces.
- The `eval/lints.ts` executor probe is deliberately kept: it runs the author's own executor at build time — verification, not an engine mechanism.
