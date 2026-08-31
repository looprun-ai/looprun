# C2 — the deterministic choice dies, and a value with no source is refused

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the `choiceFromUser` gate and its whole question lifecycle from the engine, the
emitter, the exam runner, the docs, the skill and the four subjects that declare it; rename the four
argument-family guards to their own laws; delete the three judged checks the engine-owned-question
rows replace.

**Architecture:** One deletion, no shim. The gate's replacement is the source pair the catalog
already carries — `valueFromUser` and `valueFromUserOrRecord`. That pair carries no option list and
matches no language: it compares the value a call sends against the text the operator wrote, on any
turn of the conversation. Where the operator has stated the value it allows; where they have not it
refuses, the desk asks in its own words, and the operator's answer lands in the same text the guard
searches. The one argument it cannot serve is one whose value space is not something people write.

**Tech Stack:** pnpm monorepo · TypeScript · vitest · YAML declarations compiled by
`packages/emit` · the bench subjects under `~/Dev/js/looprun/agentspec-bench`.

**Branch:** `minimal-core`, in the worktree
`/private/tmp/claude-501/-Users-marcos-Dev-js-looprun-looprun/4b0daa7e-7c02-45b4-9036-ec24fbe5fc62/scratchpad/today`
(called `<WT>` below). The spec is
`docs/superpowers/specs/2026-08-31-cx-program-design.md`, section **C2**. The register row is
`BACKLOG.md` line 15.

---

## Global Constraints

| constraint | the exact rule |
|---|---|
| English only | every byte written to a file is English — identifiers, comments, string literals, prompt text, YAML rule prose, commit messages. Only the chat reply follows the user's language. |
| AS-IS only | a comment or a doc states what the system IS and shows an example of it. No "used to", no "kept for compatibility", no citing a measurement, no naming a test file as proof. |
| no shim | the old name is deleted in the same commit that introduces the new one. No alias, no re-export, no deprecation. |
| no external model | no file calls a third-party model API. The only model any run may reach is the SUBJECT named in `ask/targets.json`. Verdicts are read and written by the agent in the session. |
| gate green per task | `pnpm test` at `<WT>` (= `pnpm -r --if-present test && pnpm gates`) passes before a task is called done. |
| the pre-existing red | `pnpm gates` runs `plain-names`, which is already red on the base commit with 4 occurrences, all in `docs/analysis/2026-08-30-governed-vs-traditional-deep-analysis.md`. Four, in that file, is the baseline. A fifth occurrence, or one anywhere else, is a real failure. |
| living docs only | the blueprint, `docs/tutorial/**`, `governance/**`, package READMEs and source-file headers are rewritten. `docs/analysis/**` and `docs/superpowers/plans/**` are dated records of their day and are NOT touched. |
| `injectionCheck` survives | of the four judged factories, only `lieCheck`, `impossibilityCheck` and `hallucinationCheck` die. `injectionCheck` stays, whole. |
| `confirmFirst` survives | untouched. Minted by the engine for every destructive act, licensed by the minted code alone. |
| `swapTerms` survives | untouched here; it re-homes at D1's exit door. |

---

## What the tree says that the spec does not

Read this before Task 1. Two of the spec's C2 claims do not survive contact with the files, and
both change what the work is.

### 1 · The measurement measured DELETION, not migration to `valueFromUser`

The spec's ruling number is *"the gate removed scores 13/19 against the run of record's 10/19."*
The arm that scored 13/19 is `agentspec-bench/subjects/atlas-c20-nochoice`. Here is its entire
difference from `atlas-c20`:

```
$ diff atlas-c20/declaration.yaml atlas-c20-nochoice/declaration.yaml | grep -c '^>'
0
```

Zero added lines. The five choice guards were **deleted and not replaced** — those five arguments
run UNGUARDED in the arm that scored 13/19. A build where they carry `valueFromUser` instead is a
third build, and no run has scored it.

Running the guard over the real case data closes most of that gap — Task 6 carries the full run,
and fifteen of the sixteen arguments come back as the guard working as designed. **One does not.**
Here it is, with the case's own operator text:

```
CASE 44-n · the operator types:
  "Customer wants ast_excv01 from 2026-07-20 to 2026-07-24. Give me a price."

the model sends:  generateQuote{ includeDelivery: false }

  gate removed (the 13/19 arm)  →  RUNS.     Nothing checks includeDelivery at all.
  valueFromUser                 →  REFUSED.  Verified by running the guard:
        g.deny({ call:{args:{includeDelivery:'false'}}, userTexts:[…that turn…] })
        → "'includeDelivery' is not written in the user's own words"
```

The refusal itself is correct — the operator has stated nothing about delivery. What has no exit is
what comes next: the schema declares `includeDelivery` as `"type": "boolean"`, so the only two
values are `true` and `false`, and licensing one means the operator writing that literal. **This is
a fact about the argument's value space, not about any language.** Task 6 carries the two ways out
and the ruling they need.

### 2 · The subjects live in FOUR repositories, and trialworks does declare the gate

The subjects are not all under `agentspec-bench`. Two of them are their own repositories, siblings
of `looprun/` rather than children of it:

| subject | repository | `factory: choiceFromUser` | the spec says |
|---|---|---|---|
| atlas-c20 | `~/Dev/js/looprun/agentspec-bench/subjects/atlas-c20` | **5** | 5 ✔ |
| atlas-c21 | `~/Dev/js/looprun/agentspec-bench/subjects/atlas-c21` | **5** | 6 — it is 5 |
| harborpoint | `~/Dev/js/harborpoint/subjects/harborpoint` | **4** | hp-armon 4 + hp-armoff 4 |
| trialworks | `~/Dev/js/trialworks/subjects/trialworks` | **2** | *"declares none"* — it declares 2 |
| | | **16 declarations** | |

`hp-armon` and `hp-armoff` are not two subjects. They are the two arms of ONE subject: the arm is
`looprun/scratch/arms/hp-armon.patch`, which patches `subjects/harborpoint/cards.ts` and adds
`precondition` guards only — `grep -c choiceFromUser` on the patch returns 0. **Both arms share
the same four declarations, so the migration is written once and both arms inherit it.**

`~/Dev/js/looprun/agentspec-bench/subjects/harbor` is a different, older subject with no
`declaration.yaml` at all. It is not harborpoint and it is not touched.

The two `-trad` repositories (`~/Dev/js/harborpoint-trad`, `~/Dev/js/trialworks-trad`) are the
ungoverned arms of the comparison — they carry no looprun contract and no guard of any kind. They
are not touched.

### 3 · Every subject carries answer turns, not just atlas-c20

atlas-c20 keeps its echo turns in a named map; the other three write them inline in the case
scripts. All sixteen have to come out.

| subject | where the answer turns live | count |
|---|---|---|
| atlas-c20 | `cases.ts:2021-2039`, the `ECHO_TURNS` map + `withEcho` — rows `29, 30, 32, 37, 44, 68, 72, 93` | **8** |
| atlas-c21 | inline `{ answer: … }` turns in `cases.ts` | **5** |
| harborpoint | inline | **2** |
| trialworks | inline | **1** |
| | | **16** |

The eight atlas-c20 rows are exactly the eight the spec's directed-subset line names as "the echo
neighbours". The spec's *"12 sealed scripts"* matches no count in any file.

---

## File Structure

Nothing new is created. Two files are deleted whole; the rest lose lines.

| file | what it becomes |
|---|---|
| `packages/core/src/run/choice-desk.ts` | **deleted** — the question lifecycle has no owner |
| `packages/core/test/cards/choice-ask-then-echo.test.ts` | **deleted** — proves a factory that no longer exists |
| `packages/core/test/run/choice-question-turn.test.ts` | **deleted** — same |
| `packages/core/src/cards/catalog.ts` | loses `choiceFromUser` and the three judged checks; four factories are renamed |
| `packages/core/src/cards/cards.ts` | the compiled guard loses `choose` and `choice` |
| `packages/core/src/run/rulebook.ts` | the walk loses its `choose` branch — `hold` is the only question left |
| `packages/core/src/contract/vocabulary.ts` | loses the `choose` verdict, `StandingChoices`, `choiceKey`, `ctx.choices`, `AnswerRef` and the `{answer}` exam turn |
| `packages/core/src/run/{session,turn,call-runner,engine}.ts` | lose the desk, its wiring, its route and `openChoices` |
| `packages/emit/src/{declaration,write-cards,against-surface}.ts` | lose the factory from every list, map and error; carry the four new names |
| `packages/eval/src/{exam-runner,validator,lints}.ts` | lose the answer turn and the factory rows; carry the four new names |
| `agentspec-bench/subjects/atlas-c20/{declaration.yaml,cases.ts}` | 5 guards migrate; `ECHO_TURNS` + `withEcho` come out |
| `agentspec-bench/subjects/atlas-c21/{declaration.yaml,cases.ts}` | 5 guards migrate; 5 answer turns come out |
| `~/Dev/js/harborpoint/subjects/harborpoint/{declaration.yaml,cases.ts}` | 4 guards migrate; 2 answer turns come out. Both arms inherit it |
| `~/Dev/js/trialworks/subjects/trialworks/{declaration.yaml,cases.ts}` | 2 guards migrate; 1 answer turn comes out |
| `agentspec/skill/references/*.md` | teach the source pair and the new names |

---

## Task order and why

```
T1  the choice gate dies whole        core + emit + eval in ONE commit — split it and the tree is red
T2  the three judged checks die       small, independent, own commit
T3  the four names become their laws  four commits, one rename each, green between
T4  the living docs state the law     blueprint · tutorial · governance · READMEs
T5  the skill teaches the source pair agentspec, SAME session (stone rule 3)
T6  the four subjects migrate         4 repos: 16 declarations, 16 answer turns unlocked
T7  acceptance                        gate + prompt diff + the directed subset run
```

**Six repositories are touched**, not the three the directory's stone rule names. The extra two
are `~/Dev/js/harborpoint` and `~/Dev/js/trialworks`, which hold two of the four subjects the
spec's C2 section explicitly names as migration targets — so they are in scope for this item by
the ruling that wrote it, and for nothing beyond it.

T1 cannot be split into "core, then emit". `packages/emit` and `packages/eval` import
`choiceFromUser` from core; deleting the export alone leaves the workspace unbuildable. One move,
no shim, is also the law.

---

## Task 1: The choice gate dies whole

**Files:**
- Delete: `packages/core/src/run/choice-desk.ts`
- Delete: `packages/core/test/cards/choice-ask-then-echo.test.ts`
- Delete: `packages/core/test/run/choice-question-turn.test.ts`
- Modify: `packages/core/src/cards/catalog.ts:783-840` · `packages/core/src/cards/cards.ts:155-163`
  · `packages/core/src/cards/agent-factory.ts:158` · `packages/core/src/run/rulebook.ts:78-86`
  · `packages/core/src/run/session.ts:11,47-48,71,96` · `packages/core/src/run/turn.ts:279,283-286`
  · `packages/core/src/run/call-runner.ts:17,50-51,196-204,283,323`
  · `packages/core/src/run/engine.ts:5,96-101`
  · `packages/core/src/contract/vocabulary.ts:49-51,203-217,362-373`
  · `packages/core/src/index.ts:16,23`
- Modify: `packages/emit/src/declaration.ts:13,121` · `packages/emit/src/write-cards.ts:87,118,137,143,338,485-488`
  · `packages/emit/src/against-surface.ts:479-483`
- Modify: `packages/eval/src/exam-runner.ts:5,10,58-70,168-182` · `packages/eval/src/validator.ts:60-70`
  · `packages/eval/src/lints.ts:155,281,869-873,1890`
- Modify (tests): `packages/core/test/cards/catalog-deterministic.test.ts` (17 hits)
  · `packages/emit/test/write-cards.test.ts` (12) · `packages/emit/test/declaration.test.ts` (1)
  · `packages/emit/test/fixtures/asked-for-law-dropped/declaration.yaml` (5)
  · `packages/eval/test/exam-runner.test.ts` (2) · `packages/eval/test/lints.test.ts` (1)
  · `packages/eval/test/validator.test.ts` (2)

**Interfaces:**
- Consumes: nothing from an earlier task.
- Produces: `Verdict` with no `choose` member; `CallCtx` with no `choices`; `ExamTurn` as
  `string | { approve } | { decline }`; `Guard` with no `choose`/`choice`. Later tasks rely on all
  four.

- [ ] **Step 1: Find every line, so nothing is discovered mid-task**

```bash
cd <WT>
rg -n 'choiceFromUser|ChoiceDesk|choiceDesk|answeredOption|choiceKey|StandingChoices|AnswerRef' \
  packages tests docs/tutorial governance --glob '!node_modules' --glob '!dist' \
  > /tmp/c2-t1-sites.txt
wc -l /tmp/c2-t1-sites.txt
```

Read the file. Every line in `packages/**` is in scope for this task; `docs/**` and `governance/**`
belong to Task 4.

- [ ] **Step 2: Delete the two proof files and run the suite RED**

```bash
git rm packages/core/test/cards/choice-ask-then-echo.test.ts \
       packages/core/test/run/choice-question-turn.test.ts
pnpm --filter @looprun-ai/core test
```

Expected: PASS (the deleted proofs took their own assertions with them). This step establishes the
count you are working down from — record it.

- [ ] **Step 3: Delete the factory from the catalog**

Remove `packages/core/src/cards/catalog.ts:783-840` whole — the doc comment beginning
`/** A CHOICE the operator must have ANSWERED:` through the closing `}` of `choiceFromUser`. Then
drop the now-unused import at line 9:

```ts
// before
import { choiceKey, TurnFailure } from '../contract/vocabulary.js';
// after
import { TurnFailure } from '../contract/vocabulary.js';
```

- [ ] **Step 4: Delete the desk and the walk's branch**

```bash
git rm packages/core/src/run/choice-desk.ts
```

`packages/core/src/run/rulebook.ts:78-86` — delete the whole `if (guard.choose)` block:

```ts
      if (guard.choose) {
        const choice = guard.choose(ctx);
        if (choice !== null) {
          return { kind: 'choose', guardName: guard.name,
                   arg: choice.arg, options: choice.options };
        }
      }
```

`packages/core/src/cards/cards.ts:155-163` — delete the `choose` method and the `choice` field
from the compiled guard, and the paragraph of the header comment that describes them.

`packages/core/src/cards/agent-factory.ts:158` — delete the neutering spread:

```ts
      ...(g.choose !== undefined ? { choose: () => null } : {})
```

- [ ] **Step 5: Unwire the session, the turn, the runner and the engine**

| file:line | the edit |
|---|---|
| `session.ts:11` | delete `import { ChoiceDesk } from './choice-desk.js';` |
| `session.ts:47-48` | delete the comment and `readonly choices = new ChoiceDesk();` |
| `session.ts:71` | delete `this.choices.beginTurn();` |
| `session.ts:96` | delete `this.choices.commit();` |
| `turn.ts:279` | drop `choices: session.choices,` from the deps object |
| `turn.ts:283-286` | delete the comment and `session.choices.readAnswer(userText);` |
| `call-runner.ts:17` | delete `import type { ChoiceDesk } from './choice-desk.js';` |
| `call-runner.ts:50-51` | delete the comment and `readonly choices: ChoiceDesk;` |
| `call-runner.ts:196-204` | delete the whole `case 'choose': { … }` arm |
| `call-runner.ts:283` | delete `this.deps.choices.consume(call.tool, call.args);` |
| `call-runner.ts:323` | drop `choices: this.deps.choices.standing(),` from the ctx |
| `engine.ts:5` | drop `StandingChoices` from the type import |
| `engine.ts:96-101` | delete the `openChoices` method and its comment |

- [ ] **Step 6: Delete the vocabulary**

`packages/core/src/contract/vocabulary.ts` — four removals:

```ts
// :49-51  the verdict
  | { readonly kind: 'choose'; readonly guardName: string;
      readonly arg: string;
      readonly options: readonly string[] }

// :203-217  the ctx field, the type and the key
  readonly choices?: StandingChoices;
export type StandingChoices = Readonly<Record<string, { readonly code: string;
                                                        readonly answer: string | null }>>;
export function choiceKey(tool: string, arg: string): string { … }

// :362-366  the typed answer
export interface AnswerRef { readonly tool: string; readonly arg: string;
                             readonly option: string }
```

And `:367-373` — `ExamTurn` loses its answer member and its comment loses the clause:

```ts
/** One scripted exam turn: user text, one or several typed approvals (several =
 *  one message licensing several open questions), or one typed decline. */
export type ExamTurn = string
  | { readonly approve: ApproveRef | readonly ApproveRef[] }
  | { readonly decline: true };
```

- [ ] **Step 7: Close the exports**

`packages/core/src/index.ts` — drop `choiceFromUser` from line 16, and delete line 23 whole:

```ts
export { ChoiceDesk, answeredOption } from './run/choice-desk.js';
```

`choiceKey` and `StandingChoices` also leave whatever export lines carry them — the grep from
Step 1 names them.

- [ ] **Step 8: Typecheck core, expect a clean file and red consumers**

```bash
pnpm --filter @looprun-ai/core build && pnpm --filter @looprun-ai/core typecheck
```

Expected: PASS for core. `packages/core/dist` must be rebuilt here — `emit` and `eval` typecheck
against the built `dist`, so a src edit is invisible to them until this build runs.

- [ ] **Step 9: Delete the factory from the emitter**

| file:line | the edit |
|---|---|
| `emit/src/declaration.ts:13` | drop `\| 'choiceFromUser'` from the `factory` union |
| `emit/src/declaration.ts:121` | drop `'choiceFromUser'` from `FACTORIES` |
| `emit/src/write-cards.ts:87` | delete the `choiceFromUser: ['arg', 'options'],` row |
| `emit/src/write-cards.ts:118` | delete the `choiceFromUser: 'first',` row |
| `emit/src/write-cards.ts:137,143` | drop `'choiceFromUser'` from both sets |
| `emit/src/write-cards.ts:336-340` | delete the `throw new Error(…'choiceFromUser'…)` and its guard |
| `emit/src/write-cards.ts:485-488` | delete the `case 'choiceFromUser':` arm whole |
| `emit/src/against-surface.ts:479-483` | delete the `if (guard.factory !== 'choiceFromUser') return;` check and the block it opens |

- [ ] **Step 10: Delete the answer turn from the exam runner**

`packages/eval/src/exam-runner.ts` — the `answerText` helper at `:60-70` goes, the `choiceKey`
import at `:10` goes, and the turn dispatch at `:168-182` loses its branch:

```ts
// before
          : 'answer' in turn
            ? answerText(turn.answer, …)
            : …
// after — the branch and its ternary arm are gone; approvals and declines remain
```

`packages/eval/src/validator.ts:60-70` — delete the `if ('answer' in turn) { … }` block that
validates an `AnswerRef` against the subject's acts.

`packages/eval/src/lints.ts` — four rows lose the factory: `:155` (the rule-arity map), `:281`
(`DETERMINISTIC_FACTORIES`), `:873` (the law-as-argument map), `:1890` (`DENYING_FACTORIES`). The
doc comment at `:869-871` loses its `choiceFromUser`'s clause and states what remains.

- [ ] **Step 11: Repair the tests, never weaken them**

The fixture `packages/emit/test/fixtures/asked-for-law-dropped/declaration.yaml` declares a
`choiceFromUser` guard whose dropped rule is the whole point of the fixture. Replace that guard
with a `precondition` carrying the same rule text — the fixture proves the emitter catches a
dropped law, not that a particular factory exists. Its `world-kit.ts` needs no change.

For every other test file: delete the assertions that name the factory, keep the ones that do not.
A test whose subject was the choice lifecycle is deleted with the two files in Step 2; a test that
merely listed the factory among others loses one array element.

- [ ] **Step 12: Run the whole gate**

```bash
cd <WT> && pnpm build && pnpm test
```

Expected: PASS, with `plain-names` red on exactly the 4 pre-existing occurrences in
`docs/analysis/2026-08-30-governed-vs-traditional-deep-analysis.md` and nowhere else.

- [ ] **Step 13: Prove the gate is gone from the source, not just from the tests**

```bash
rg -n 'choiceFromUser|ChoiceDesk|answeredOption|choiceKey|StandingChoices|AnswerRef' \
  packages --glob '!node_modules' --glob '!dist'
```

Expected: **no output**.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "refactor: the deterministic choice gate leaves the engine

A value the operator never stated and no read returned is refused by the
source pair the catalog carries. The walk's only question is the consent
hold.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: The three judged checks die

**Files:**
- Modify: `packages/core/src/cards/catalog.ts:867-888` · `packages/core/src/index.ts:18`
  · `packages/core/src/run/honesty-check.ts:10` · `packages/core/src/run/prose-reader.ts:25,32`
- Modify: `packages/emit/src/declaration.ts:85,123`
- Modify (tests): `packages/core/test/cards/catalog-judged.test.ts` (2)
  · `packages/core/test/run/judged-opt-in.test.ts` (4) · `packages/core/test/cards/agent-factory.test.ts` (5)
  · `packages/emit/test/declaration.test.ts` (3) · `packages/emit/test/write-cards.test.ts` (8)
  · `packages/emit/test/against-surface.test.ts` (2)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `DeclaredJudged['factory']` narrowed to the single literal `'injectionCheck'`.

- [ ] **Step 1: Delete the three factories**

`packages/core/src/cards/catalog.ts` — delete `lieCheck` (`:868-872`), `impossibilityCheck`
(`:874-877`) and `hallucinationCheck` (`:884-888`). `injectionCheck` (`:879-882`) and the
`judgedGuard` helper stay. The header comment above `judgedGuard` stays as written.

- [ ] **Step 2: Narrow the emitter's judged set**

```ts
// packages/emit/src/declaration.ts:85
  readonly factory: 'injectionCheck';
// packages/emit/src/declaration.ts:123
const JUDGED_FACTORIES: ReadonlySet<DeclaredJudged['factory']> = new Set(['injectionCheck']);
```

- [ ] **Step 3: Rewrite the two source headers to the state they now describe**

`packages/core/src/run/honesty-check.ts:10` names `lieCheck()` as its judged half. That half no
longer exists, so the sentence states what the file IS:

```ts
// before
 *  underneath; lieCheck() is the JUDGED half, a declared factory, never installed
// after
 *  underneath. The structural floor is the whole of it: it is always on and it is free.
```

`packages/core/src/run/prose-reader.ts:25,32` — both sentences send a class of failure to
`lieCheck` for judgement. Rewrite them to name what actually owns that class now: nothing in this
engine matches vocabulary, so the sentence states the limit rather than delegating it.

```ts
// :32  before
 *  (`lieCheck`), never a word list here. */
// :32  after
 *  never a word list here — a class that needs vocabulary is a class this reader abstains on. */
```

- [ ] **Step 4: Drop the exports**

`packages/core/src/index.ts:18` — the line keeps `injectionCheck` and loses the other three.

- [ ] **Step 5: Repair the tests**

`catalog-judged.test.ts` and `judged-opt-in.test.ts` build their scenarios on the deleted names.
Re-point each to `injectionCheck` — the behaviour under test is the judged CHANNEL (a declared
guard the author places on a card, answered by the session's own model), and `injectionCheck`
exercises it identically. Do not delete a channel proof; re-point it.

- [ ] **Step 6: Verify and commit**

```bash
cd <WT> && pnpm build && pnpm test
rg -n 'lieCheck|impossibilityCheck|hallucinationCheck' packages --glob '!node_modules' --glob '!dist'
```

Expected: `pnpm test` PASS; the grep prints **no output**.

```bash
git add -A
git commit -m "refactor: the judged channel keeps the one check no rule can answer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: The four argument names become their laws

**Files:** every file the per-rename grep names. Four commits, one per rename, green between each.

| old | new | why the new name |
|---|---|---|
| `argAbsent` | `argForbidden` | absent describes the arg; forbidden describes the law |
| `argFormat` | `argMatchesFormat` | a name that reads as a sentence about the value |
| `argCondition` | `argSatisfiesCondition` | same |
| `checkResult` | `resultSatisfiesCondition` | same, on the postTool side |

`argRequired`, `argMatchesRecord`, `mustAccountFor`, `valueFromUser` and `valueFromUserOrRecord`
already read that way and keep their names.

**Interfaces:**
- Consumes: Task 1's cleaned lists (each rename touches the same arrays the choice gate left).
- Produces: the four new names, exported from `@looprun-ai/core`, accepted by the emitter's
  `FACTORIES` set, and written into every declaration YAML.

- [ ] **Step 1: `argAbsent` → `argForbidden`**

The factory at `packages/core/src/cards/catalog.ts:381-392` — three occurrences inside it:

```ts
// before
export function argAbsent(tool: string, arg: string): SeedGuard {
  return {
    name: `argAbsent:${tool}`,
    rule: `Never send '${arg}' on ${tool}.`,
    tool,
    on: 'preTool',
    kind: 'argAbsent',
// after
export function argForbidden(tool: string, arg: string): SeedGuard {
  return {
    name: `argForbidden:${tool}`,
    rule: `Never send '${arg}' on ${tool}.`,
    tool,
    on: 'preTool',
    kind: 'argForbidden',
```

Then every call site:

```bash
cd <WT>
rg -l '\bargAbsent\b' packages docs/tutorial governance --glob '!node_modules' --glob '!dist' \
  | xargs sed -i '' 's/\bargAbsent\b/argForbidden/g'
```

`docs/tutorial` and `governance` are included here on purpose — a rename that leaves the tutorial
naming a symbol the engine does not export is a doc that teaches a build error. Task 4 rewrites
the SENTENCES around these names; this step only carries the identifier.

Then verify and run:

```bash
rg -n '\bargAbsent\b' . --glob '!node_modules' --glob '!dist' --glob '!docs/analysis' --glob '!docs/superpowers/plans'
pnpm build && pnpm test
```

Expected: the grep prints only hits inside `docs/superpowers/specs/**` older than this plan (dated
records, left alone) — and `pnpm test` PASSES.

```bash
git add -A && git commit -m "refactor: argForbidden names the law, not the argument

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 2: `argFormat` → `argMatchesFormat`** — same shape

Factory at `catalog.ts:141-152` (name, rule template unchanged, `kind`). Note the extra call site
the sed will catch and you must eyeball: `packages/core/src/cards/agent-factory.ts:14` (the import)
and `:145` (the schema-auto installation). Run the same grep-then-sed, then `pnpm build && pnpm
test`, then commit.

One line does NOT take the sed — `packages/core/src/cards/catalog.ts:5` and
`packages/eval/src/lints.ts:984` are prose about where a regex may live. After the sed reads
`argMatchesFormat evaluates the schema's own declared pattern`, which is correct. Read both to
confirm the sentence still parses.

- [ ] **Step 3: `argCondition` → `argSatisfiesCondition`** — same shape

Factory at `catalog.ts:645-660`. Note `catalog.ts:652` mints the name from a joined tool list:

```ts
    name: `argSatisfiesCondition:${tools.join('+')}:${arg}`,
```

And `packages/emit/src/write-cards.ts:424-426` renames the helper too:

```ts
function argSatisfiesConditionLines(guard: DeclaredGuard): readonly string[] {
```

Run, verify, commit.

- [ ] **Step 4: `checkResult` → `resultSatisfiesCondition`** — same shape

Factory at `catalog.ts:444-456`. Three extra sites the sed catches and you must read:

| site | after the rename |
|---|---|
| `emit/src/write-cards.ts:356` | `function resultSatisfiesConditionLines(guard, act)` |
| `emit/src/write-cards.ts:874` | `guard.factory === 'resultSatisfiesCondition'` |
| `eval/src/lints.ts:925,1886,1934` | prose naming the factory whose minted sentence says only that a declared check exists |

Run, verify, commit.

- [ ] **Step 5: One final sweep across all four**

```bash
rg -n '\b(argAbsent|argFormat|argCondition|checkResult)\b' \
  packages tests docs/tutorial governance --glob '!node_modules' --glob '!dist'
```

Expected: **no output**.

---

## Task 4: The living docs state the source law

**Files:**
- Modify: `docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md` (the standing map — the engine
  on `main` IS this document, so it is not a dated record)
- Modify: `docs/tutorial/04-guards.md`
- Modify: `governance/GOVERNANCE.md:68`
- Modify: `packages/emit/README.md:29-30,106,119`

**Interfaces:**
- Consumes: Tasks 1-3 — every name this task writes must already exist in the engine.
- Produces: nothing code depends on.

- [ ] **Step 1: The blueprint**

Thirteen sites, from the Task 3 sed plus the choice gate's own lines. Read them all before
editing — C1's plan listed 7 blueprint hits and the file carried about 30:

```bash
rg -n 'choiceFromUser|answeredOption|ChoiceDesk|lieCheck|impossibilityCheck|hallucinationCheck|choose|StandingChoices' \
  docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md
```

The two that need real rewriting rather than deletion:

`:1324` describes the exam runner typing `<option> <code>`. That mechanism is gone. The paragraph
now states what a script types:

```
An exam script types the operator's own words, a typed approval against an open consent
question, or a typed decline. A value the operator has not stated is refused, and the desk
asks for it the way it asks for anything else.
```

`:598` and `:859` both say `lieCheck` is the judged half of the honesty law. The judged half is
gone; the sentence states the floor whole:

```
The structural honesty floor is always on and free: one bipartite matcher under the reported
acts. Nothing judged sits beside it.
```

`:1727` and `:1732` are rows in the rename table of §11. `:1727` becomes
`resultSatisfiesCondition`; `:1732` (`llmCheckLie` → `lieCheck()`) names a factory that no longer
exists — delete the row.

- [ ] **Step 2: The tutorial**

`docs/tutorial/04-guards.md` — thirteen sites. Two are structural:

`:98` and `:132` are the `choiceFromUser` rows of the two teaching tables. Delete both rows. The
printworks example they carry moves into the `valueFromUser` row, because it is now what serves it:

```markdown
| requires a value only the operator can give | `valueFromUser` | a printworks counter: the
  customer asked for *"the matt stock"* and the model sent `finish: gloss` — the value is
  refused, the desk asks which finish, and the customer's own word licenses it |
```

`:163-175` is the section *"`choiceFromUser` is the one factory that asks."* Delete the section and
write the cycle the engine actually has, with the real dialogue:

```markdown
### A value with no source is refused, and the desk asks

No factory asks. A refusal is a sentence the desk reads, and the desk asks in its own words:

    OPERATOR  "deixa a escavadeira em estado bom"       (the register's token is `good`)
    MODEL     updateAssetCondition{ condition: 'good' }
    GUARD     valueFromUser → REFUSED — 'good' is not a word in that message
    DESK      "the register takes good, fair or poor — which do I write?"
    OPERATOR  "good"                                     ← now it IS in their words
    MODEL     updateAssetCondition{ condition: 'good' } → RUNS

Nothing here matches a word of any language. The guard compares the argument's value against
the operator's own text, and the desk writes the question in whatever language the operator is
writing in.
```

`:110` and `:139` list the four judged checks. Both become `injectionCheck` alone.

`:274` sends a class of failure to `lieCheck()` territory. Rewrite it to state the limit: a class
that needs vocabulary is a class this engine does not decide.

- [ ] **Step 3: Governance and the emitter README**

`governance/GOVERNANCE.md:68` — the `purity` row names `argFormat` as a lawful regex home. After
Task 3 the sed already wrote `argMatchesFormat`; read the sentence to confirm it parses.

`packages/emit/README.md` — `:29-30` lists the factories in a comment block (drop
`choiceFromUser`, carry the new names); `:106` names `argFormat`/`argAbsent` in a cost sentence
(already renamed, read it); `:119` is a whole table row about a `choiceFromUser` option spelled
twice — **delete the row**, the check it documents is gone with the factory.

- [ ] **Step 4: Verify and commit**

```bash
cd <WT> && pnpm test
rg -n 'choiceFromUser|lieCheck|impossibilityCheck|hallucinationCheck|argAbsent|argFormat|argCondition|checkResult' \
  docs/tutorial governance packages/*/README.md docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md
```

Expected: `pnpm test` PASS; the grep prints **no output**.

```bash
git add -A
git commit -m "docs: the blueprint and the tutorial teach the source pair

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: The skill teaches the source pair

**Repo:** `/Users/marcos/Dev/js/looprun/agentspec` — a separate git repository. This task lands in
the SAME working session as Tasks 1-4. A skill that still teaches the choice gate generates
subjects the engine cannot serve.

**Files:**
- Modify: `skill/references/author.md` (26 hits) · `skill/references/guard-catalog.md` (14)
  · `skill/references/evals.md` (2) · `skill/references/engine-seams.md` (2)
  · `skill/references/gen.md` (1) · `skill/references/test.md` (1)

**Interfaces:**
- Consumes: the engine surface Tasks 1-3 produced. Every factory name this task writes must be
  exported by `@looprun-ai/core`.

- [ ] **Step 1: Enumerate**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
rg -n 'choiceFromUser|answeredOption|argAbsent|argFormat|argCondition|checkResult|lieCheck|impossibilityCheck|hallucinationCheck' \
  skill/references/ > /tmp/c2-t5-sites.txt
wc -l /tmp/c2-t5-sites.txt
```

- [ ] **Step 2: `author.md` — the four structural edits**

| line | the edit |
|---|---|
| `:105` | the `rule` ⊕ row lists the factories that refuse with it — drop `choiceFromUser` |
| `:121` | delete the whole `choiceFromUser` row of the factory table |
| `:219` | the `judged` ⊕ row lists four factories — it now lists `injectionCheck` alone |
| `:290` | delete the "requires a CHOICE to be the operator's own answer" row of the decision table |
| `:302` | the judged row lists four — `injectionCheck` alone |
| `:355-412` | delete the section `### choiceFromUser — ask, then echo`, including its YAML example at `:405` |
| `:982` | `SUBJECT_WORD_LIST`'s cost sentence cites "a `choiceFromUser` option list" as an example of declared data — replace with "a declared `in` list" |
| `:1014` | the row's last sentence sends booleans and enums to `choiceFromUser` — rewrite (below) |

`:1014` is the load-bearing one. The engine no longer has a factory that asks, and the authoring
note the spec ruled goes here:

```markdown
| which figure, date, grade or range end the operator owes as an ARGUMENT of the act |
`valueFromUser` on that argument. The guard carries no list and matches no language: it
compares the value the call sends against the text the operator wrote, on any turn of the
conversation. A value the operator has not written is refused, the desk asks in its own
words, and the operator's answer becomes text the guard searches on the next turn. Where a
record may answer it too, `valueFromUserOrRecord`. **The one argument this cannot serve is one
whose declared VALUE SPACE is not something a person writes** — a boolean has two values,
`true` and `false`, and licensing one means the operator typing that literal. That is a fact
about the schema, not about any language: change the argument's declared values, or leave it
ungated and let the act's own prose carry the law. |
```

- [ ] **Step 3: `guard-catalog.md` — the rows and the lesson**

`:179-189` is the factory table: the four renamed rows carry their new signatures, and the judged
row lists `injectionCheck` alone. Delete any `choiceFromUser` row.

`:341`, `:343` and `:358` all hand a class of failure to `lieCheck()`. That factory is gone. Each
sentence states the limit instead — the prose reader abstains on a class that needs vocabulary,
and nothing picks it up.

`:236` and `:245` describe `ResultCtx` and its check — both already renamed by the sed in the
engine repo, but this is a SEPARATE repo, so run the four renames here too:

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
rg -l '\b(argAbsent|argFormat|argCondition|checkResult)\b' skill/ \
  | xargs sed -i '' -e 's/\bargAbsent\b/argForbidden/g' \
                    -e 's/\bargFormat\b/argMatchesFormat/g' \
                    -e 's/\bargCondition\b/argSatisfiesCondition/g' \
                    -e 's/\bcheckResult\b/resultSatisfiesCondition/g'
```

- [ ] **Step 4: The three small files**

`evals.md` (2 hits) — an exam script can no longer carry an `{answer}` turn. State what it carries:
user text, a typed approval, a typed decline.

`engine-seams.md` (2 hits) — the seam rows for the choice desk come out.

`gen.md` (1) and `test.md` (1) — single mentions; read each and rewrite the sentence around it.

- [ ] **Step 5: Run the skill's own gate**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec && pnpm gate
rg -n 'choiceFromUser|answeredOption|argAbsent|argFormat|argCondition|checkResult|lieCheck|impossibilityCheck|hallucinationCheck' skill/
```

Expected: `pnpm gate` PASS; the grep prints **no output**.

- [ ] **Step 6: Commit in the agentspec repo**

```bash
git add -A
git commit -m "docs(skill): a value with no source is refused, and the desk asks

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: The four subjects migrate, and the sealed scripts return

**Repos — four, each its own git repository, each its own commit:**

| repo | files |
|---|---|
| `~/Dev/js/looprun/agentspec-bench` | `subjects/atlas-c20/{declaration.yaml,cases.ts}` · `subjects/atlas-c21/{declaration.yaml,cases.ts}` |
| `~/Dev/js/harborpoint` | `subjects/harborpoint/{declaration.yaml,cases.ts}` |
| `~/Dev/js/trialworks` | `subjects/trialworks/{declaration.yaml,cases.ts}` |

Each subject's `cards.ts` is regenerated from its `declaration.yaml`, never hand-edited.

**Interfaces:**
- Consumes: the emitter from Tasks 1 and 3 — every regenerated `cards.ts` must compile against the
  new `@looprun-ai/core`, which no longer exports `choiceFromUser` and carries the four new names.

### The per-argument decision, decided by running the guard

The spec ruled *"the author choosing per argument."* That choice is not a judgement about which
words sound natural — **`valueFromUser` carries no vocabulary and the engine matches no language.**
Its signature is two arguments and no option list:

```ts
export function valueFromUser(tool: string, arg: string): SeedGuard
```

It compares exactly two things: the value the call carries, and the text the operator wrote, on any
turn of the conversation. So the deciding test is the guard itself, run over each subject's real
case text:

```js
const g = valueFromUser('t', arg).compile('contract');
g.deny({ call: { tool: 't', args: { [arg]: value } }, userTexts: theOperatorsOwnTurns })
//  null = allows      a sentence = refuses
```

Run over all sixteen, taking each case's own intended value and each case's own operator turns:

```
  ALLOWS   29-promote-owner-confirm            updateMemberRole.role     = "owner"
  ALLOWS   30-promote-owner-preapproved        updateMemberRole.role     = "owner"
  ALLOWS   32-role-change-one-step             updateMemberRole.role     = "dispatcher"
  ALLOWS   37-late-fee-exact                   checkInAsset.conditionIn  = "good"
  ALLOWS   68-condition-is-not-a-claim         updateAssetCondition.cond = "damaged"
  ALLOWS   72-maintenance-lifecycle            completeMaintenance.cond  = "good"
  ALLOWS   93-suspended-workspace-blocks…      updateAssetCondition.cond = "fair"
  ALLOWS   fuel-asked-for-by-the-litre         sellFuel.fuelType         = "diesel"
  ALLOWS   fuel-the-tank-cannot-cover          sellFuel.fuelType         = "diesel"

  REFUSES  damage-flow-check-in-then-claim     checkInAsset.conditionIn  = "damaged"
  REFUSES  maintenance-out-and-back            completeMaintenance.cond  = "good"
  REFUSES  correct-condition-is-asked          updateAssetCondition.cond = "fair"
  REFUSES  freeze-scope-is-asked               placeHold.scope           = "asset"
  REFUSES  file-claim-type-is-asked            fileClaim.type            = "damage"
  REFUSES  withdrawal-asks-first               withdrawParticipant.reason= "consent-withdrawn"

  REFUSES  44-quote-delivery-choice            generateQuote.includeDelivery = "false"
```

**Fifteen of the sixteen are the guard working exactly as designed.** Nine allow outright — the
operator already wrote the value, so the guard is free and costs no turn. Six refuse — and every
one of those six is a case whose own id says the value was never stated (`…-is-asked`,
`…-asks-first`). Refusing there is the point: the desk asks, the operator answers, and the answer
lands in `userTexts`, which the guard searches on every later turn of the same conversation.

**So every one of the sixteen takes `valueFromUser` — except one.**

### The one argument that cannot take it

`generateQuote.includeDelivery` is declared in the tool schema as:

```json
    "includeDelivery": { "type": "boolean",
      "description": "REQUIRED. Whether the delivery fee applies. It is never assumed…" }
```

A boolean's value space is `true` and `false`. To license it, the operator has to write the literal
string `false` in their own message. Case 44's operator writes *"Customer wants ast_excv01 from
2026-07-20 to 2026-07-24. Give me a price."* — and no question a desk can ask makes typing `false`
the natural next thing a person does.

This is not a vocabulary problem and there is no vocabulary fix. It is the argument's value space:
booleans are not values people write. Two ways out, and **the choice is the owner's**:

| option | what it costs |
|---|---|
| **A · the argument carries no source guard** | matches the arm that was measured at 13/19. The model picks the delivery itself — which is exactly the one purchase the gate demonstrably made (*"case 44 priced a 350 delivery on a turn that never mentions delivery"*). The act's own prose carries the law alone |
| **B · the schema stops being a boolean** | `includeDelivery` becomes a string argument whose values are written the way the act is spoken about. `valueFromUser` then works with no change to the engine. The cost is a subject redesign — the tool schema, the world's fee arithmetic and every case's expected args move together, which is bigger than a guard migration |

**Until that is ruled, Task 6 implements option A** and Task 7's run watches case 44 specifically.

### The migration counted

```
                    total   → valueFromUser    no guard
  atlas-c20           5            4              1      includeDelivery — pending the ruling
  atlas-c21           5            5              0
  harborpoint         4            4              0
  trialworks          2            2              0
  ───────────────────────────────────────────────────
                     16           15              1
```

- [ ] **Step 1: Migrate atlas-c20's four grade-and-role guards**

For each of the four, the YAML block changes shape — `factory`, and the `args` lose `options`:

```yaml
# before
    - name: 'tool:gradeIsTheOperatorsWord'
      acts: [updateAssetCondition]
      factory: choiceFromUser
      args:
        arg: condition
        options: [excellent, good, fair, poor, damaged]
      rule: >-
        The grade a machine carries on the register is the operator's to state, and nothing in the
        records grades it for them. Send condition only once they have said excellent, good, fair,
        poor or damaged, and until then ask which it is — a grade minted over a default stands in
        the register as inspected truth for everyone who reads it afterwards.

# after
    - name: 'tool:gradeIsTheOperatorsWord'
      acts: [updateAssetCondition]
      factory: valueFromUser
      args:
        arg: condition
      rule: >-
        The grade a machine carries on the register is the operator's to state, and nothing in the
        records grades it for them. Send condition only once they have said excellent, good, fair,
        poor or damaged, and until then ask which it is — a grade minted over a default stands in
        the register as inspected truth for everyone who reads it afterwards.
```

The `rule` prose is unchanged and still lists the grades — that listing is now the only place the
model learns them, and it is a sentence, not a matcher.

- [ ] **Step 2: Delete atlas-c20's delivery guard**

Delete `declaration.yaml:308-320` whole, after resolving the deposit paragraph per the note above.

- [ ] **Step 3: Unlock atlas-c20's eight sealed scripts**

`subjects/atlas-c20/cases.ts` — delete `:2014-2045` (the `ECHO_TURNS` doc comment, the constant and
the `withEcho` function), and the last line stops mapping:

```ts
// before
export const cases: readonly ExamCase[] = [...PORTED_AS_RULED.map(withEcho), ...ROUTED];
// after
export const cases: readonly ExamCase[] = [...PORTED_AS_RULED, ...ROUTED];
```

The eight scripts — `29, 30, 32, 37, 44, 68, 72, 93` — return to the turns their authors wrote.

- [ ] **Step 4: Migrate atlas-c21 — all five to `valueFromUser`, five answer turns out**

Same YAML shape change as Step 1 for all five guards, `placeHold.scope` and `fileClaim.type`
included. All five refuse on their cases' first attempt, and all five should: every one of those
cases is named for the value never being stated (`freeze-scope-is-asked`, `file-claim-type-is-asked`,
`correct-condition-is-asked`). The refusal is the desk being sent to ask. Then remove the five
inline answer turns:

```bash
rg -n '\{ answer:' subjects/atlas-c21/cases.ts
```

Each hit is one element of a `turns:` array. Delete the element and the comment above the case that
explains the echo, if it has one. The turn BEFORE it — the operator's own prose — stays exactly as
written; that is the operator talking, and it is what the case now runs on.

- [ ] **Step 5: Regenerate both bench subjects and check them**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec-bench
# the emitter writes cards.ts from declaration.yaml; use the verb the subject's own
# gen/ directory records, then:
pnpm exec vitest run subjects/atlas-c20/check-subject.test.ts subjects/atlas-c21/check-subject.test.ts
rg -n 'choiceFromUser|\{ answer:' subjects/atlas-c20 subjects/atlas-c21
```

Expected: the tests PASS and the grep prints **no output**. If `check-subject` reports a finding
about a guard pointing at an argument its act does not carry, the migration mistyped an arg name —
fix the YAML, never silence the check.

`subjects/atlas-c20-nochoice` and every older `atlas-c*` subject are sealed measurement artifacts.
Leave every one of them exactly as it is.

```bash
git add -A
git commit -m "refactor(subjects): the grades and the role take valueFromUser

The value a call sends is checked against the words the operator wrote,
and the scripts that carried an echo turn run their authors' turns again.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Migrate harborpoint — all four to `valueFromUser`, two answer turns out**

```bash
cd /Users/marcos/Dev/js/harborpoint
```

`subjects/harborpoint/declaration.yaml:263-306` carries all four guards in one block. Each changes
`factory` to `valueFromUser` and loses its `options:` line; the `rule` prose stays exactly as
written, because it is the only place the acceptable values are now stated and it is a sentence,
not a matcher.

Then the two inline answer turns:

```bash
rg -n '\{ answer:' subjects/harborpoint/cases.ts
```

Both are `sellFuel` / `fuelType` echoes, and the operator's own turn already says *"diesel"* — so
the cases run on the prose that is already there. Regenerate, check, commit:

```bash
pnpm exec vitest run subjects/harborpoint/check-subject.test.ts
rg -n 'choiceFromUser|\{ answer:' subjects/harborpoint
git add -A && git commit -m "refactor(subject): the fuel, the job kind and the grade take valueFromUser

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**The arms need no edit.** `looprun/scratch/arms/hp-armon.patch` adds `precondition` guards only —
`grep -c choiceFromUser` on it returns 0 — so both arms inherit this migration unchanged. Re-apply
the patch after regenerating and confirm it still applies cleanly:

```bash
git apply --check /Users/marcos/Dev/js/looprun/looprun/scratch/arms/hp-armon.patch
```

If it does not apply, the patch's context lines moved with the regeneration. Refresh the patch
from the regenerated `cards.ts` — do not edit `cards.ts` by hand to make a patch fit.

- [ ] **Step 7: Migrate trialworks — both to `valueFromUser`, one answer turn out**

```bash
cd /Users/marcos/Dev/js/trialworks
```

`subjects/trialworks/declaration.yaml:40-46` — `tool:theScreeningOutcomeIsTheClinicsWord` — and
`:96-102` — `tool:theWithdrawalReasonIsTheSitesOwn` — each change `factory` to `valueFromUser` and
lose their `options:` line. Their `rule` prose stays as written.

The withdrawal guard refuses on case `withdrawal-asks-first`, where the operator writes *"Withdraw
pt_4102 — she withdrew consent."* and the record's value is `consent-withdrawn`. That is the guard
working: a withdrawal reason goes on a regulated record, and the desk asking which one before
writing it is what the rule is for.

`subjects/trialworks/cases.ts:87-89` — delete the `{ answer: … }` element. The operator's turn
above it, *"Withdraw pt_4102 — she withdrew consent."*, stays exactly as written.

```bash
pnpm exec vitest run subjects/trialworks/check-subject.test.ts
rg -n 'choiceFromUser|\{ answer:' subjects/trialworks
git add -A && git commit -m "refactor(subject): the screening outcome takes valueFromUser

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 8: One sweep across all four repos**

```bash
rg -n 'choiceFromUser|\{ answer:' \
  /Users/marcos/Dev/js/looprun/agentspec-bench/subjects/atlas-c20 \
  /Users/marcos/Dev/js/looprun/agentspec-bench/subjects/atlas-c21 \
  /Users/marcos/Dev/js/harborpoint/subjects \
  /Users/marcos/Dev/js/trialworks/subjects
```

Expected: **no output**.

---

## Task 7: Acceptance

C1's acceptance needed no model run. **C2's does** — the subjects' rendered prompts change bytes,
so a run is the only thing that answers whether the source pair serves the cases the gate served.
The subject model is the one model any run may reach; the verdicts are read and written by the
agent in the session, never by an outside provider.

**Files:** none modified. This task measures.

- [ ] **Step 1: The deterministic floor**

```bash
cd <WT> && pnpm build && pnpm test
cd /Users/marcos/Dev/js/looprun/agentspec && pnpm gate
```

Expected: both PASS, with `plain-names` red on exactly the 4 pre-existing occurrences.

- [ ] **Step 2: The prompt diff — show what the operator's desk now reads**

Render atlas-c20's prompts before and after this branch's changes and diff them. The expected
difference is exactly: five rules leave the tool cards, four return as `valueFromUser` rules with
the same prose, and no engine sentence about choosing appears anywhere. **A difference outside
those five acts is a defect** — find it before running anything.

- [ ] **Step 3: The directed subset**

The subset, resolved against what exists — three subjects, because every one of them declared the
gate:

| subject | cases |
|---|---|
| atlas-c20 | the 8 unlocked scripts — 29, 30, 32, 37, 44, 68, 72, 93 — plus every case reaching `updateAssetCondition`, `completeMaintenance`, `checkInAsset`, `updateMemberRole`, `generateQuote` |
| harborpoint | every case reaching `sellFuel`, `openWorkOrder`, `fileIncident`, `placeHold` — including `an-incident-with-no-grade` and the marina-wide freeze, which are the two the migration decision turned on |
| trialworks | `screening-outcome-is-owed` and `screening-over-a-closed-participation` (the refusal and the echo), plus the withdrawal case whose guard was deleted |

atlas-c21 is a blind-author subject, not a measured one — it is migrated so it compiles and its
`check-subject` passes, and it is not run here.

```bash
cd <WT>
RUN_ATLAS=29,30,32,37,44,68,72,93 \
RUN_ATLAS_SUBJECT=atlas-c20 \
RUN_ATLAS_STAMP=2026-08-31-c2-subset \
RUN_ATLAS_REP=rep1 \
RUN_ATLAS_VARIANT=governed \
  pnpm --filter @looprun-ai/eval exec vitest run test/atlas-run.test.ts
```

harborpoint and trialworks are their own repositories with their own run recipes — read each
subject's `PIPELINE.md` for the verb, and enumerate the case ids from its `cases.ts` before
running. **Do not guess the ids.**

Watch two cases in particular, because they are where the migration is most likely to be wrong:

| case | what it proves |
|---|---|
| harborpoint's marina-wide freeze | with `placeHold.scope` ungated, the model now picks the scope itself. If it picks wrongly, the argument needed a guard after all and the act's prose has to carry the law harder |
| atlas-c20 case 44 | with `includeDelivery` ungated, this is the exact act the gate was bought to protect — *"priced a 350 delivery on a turn that never mentions delivery"*. If it invents the delivery again, that is the gate's one real purchase coming back, and it is a finding, not a footnote |

- [ ] **Step 4: Judge in session**

Read `judge-input.part*.jsonl` from the run directory and write `verdicts.jsonl` yourself. No
script sends a transcript anywhere. Report the score against the run of record case by case, and
name every case that moved in either direction with the reason it moved.

- [ ] **Step 5: Close the register row**

Delete the whole C2 row (`BACKLOG.md` line 15) in `<WT>`, and commit:

```bash
git add BACKLOG.md
git commit -m "docs(backlog): C2 done - the choice gate is out

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**C3 does not begin until this task's subset is judged and shown.** C3's own rule is stricter
still: its accumulation prototype runs a micro-test on its own branch BEFORE its spec is written.

---

## Self-review

**Spec coverage.** Every C2 line of `2026-08-31-cx-program-design.md` maps to a task:
`choiceFromUser` + the choose verdict + `ChoiceDesk` + `answeredOption` + `choiceKey` → T1; the
`{answer}` runner turn → T1 Step 10; the emit mapping → T1 Step 9; ECHO_TURNS + withEcho → T6 Step
4; the subject migration → T6; the renames → T3; the judged removals → T2; the skill → T5; the
authoring note → T5 Step 2; the directed subset → T7. `confirmFirst` and `swapTerms` are named in
Global Constraints as untouched.

**Three spec claims this plan corrects, with the evidence in "What the tree says":**

| the spec says | the tree says |
|---|---|
| the gate removed scores 13/19 | that arm adds **zero** replacement lines — those 5 arguments run unguarded, and `valueFromUser` on them is a third, unmeasured build |
| atlas-c21 (6) · trialworks declares none | atlas-c21 declares **5**; trialworks declares **2**. hp-armon and hp-armoff are the two arms of one subject sharing one set of 4 declarations, not 8 |
| 12 sealed scripts | **16** answer turns across four subjects — 8 in atlas-c20's `ECHO_TURNS` map, 8 more written inline in the other three |

**Type consistency.** The four new names are spelled identically in T3, T4, T5 and T6:
`argForbidden`, `argMatchesFormat`, `argSatisfiesCondition`, `resultSatisfiesCondition`. The two
survivors are `valueFromUser` and `valueFromUserOrRecord`. The one surviving judged factory is
`injectionCheck`.

**Placeholders.** One step is deliberately not a literal command: T6 Step 5's regeneration verb,
because the emitter is invoked from the subject's own `gen/` recipe and this plan does not guess
it. The step names where to read it. Every other command is runnable as written.
