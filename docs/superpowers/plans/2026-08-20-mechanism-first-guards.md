# Mechanism-First Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A prose guard names the acts it governs, a deterministic check stands on each of those acts, and a static lint refuses a subject where it does not.

**Architecture:** One new lint verb in `packages/eval` reads a subject's TypeScript source and reports five findings. The `agentspec` skill's guard catalog is rewritten as a routing table keyed on what a rule DOES to a call, covering every factory the engine ships, with worked examples drawn from ten different businesses. The skill's phases point at that catalog instead of restating it. The Atlas is then re-authored from the rewritten skill and measured.

**Tech Stack:** TypeScript, the `typescript` compiler API (AST walking, already a dependency of `packages/eval`), vitest, pnpm workspaces.

## Global Constraints

- **Everything written to a file is English** — code, identifiers, comments, string literals, prompt text, commit messages, documentation. Only a chat reply follows the user's language.
- **AS-IS documentation only** — a comment states what the system IS. It never narrates change ("used to", "no longer", "kept for compatibility"), never cites evidence ("measured over 70 turns"), and never names a test file as proof.
- **No external model, ever** — no file calls a third-party model API. The agent in the session reads the transcripts and writes the verdicts. The only model any run may reach is the subject under test named in `ask/targets.json`.
- **No compatibility shims** — these packages are pre-1.0. Rename and delete the old name in the same commit.
- **`packages/core` is not touched.** The engine's authoring surface stays exactly as it is.
- Guard catalog examples use **varied, non-Atlas businesses and keep their figures**: freight, pharmacy, school registrar, card operations, clinic, lender, warehouse, courier, utility, insurer.
- The gate is **≥ 95 of 100, with all one hundred rows judged**; cases 43 and 87 are the only forgiveness, because the certified reference fails them too.

## Repositories

Three working trees are involved. Every path below is relative to one of them.

| short name | path |
|---|---|
| `looprun` | `/Users/marcos/Dev/js/looprun/looprun` |
| `agentspec` | `/Users/marcos/Dev/js/looprun/agentspec` |
| `bench` | `/Users/marcos/Dev/js/looprun/agentspec-bench` |

## File Structure

| file | repo | responsibility |
|---|---|---|
| `packages/eval/src/lints.ts` | looprun | gains `proseLedger` and its two static readers, beside `purity`, `nameGate` and `census` |
| `packages/eval/src/index.ts` | looprun | exports `proseLedger` |
| `packages/eval/test/lints.test.ts` | looprun | gains the `proseLedger` cases |
| `docs/tutorial/04-guards.md` | looprun | carries the act-keyed ladder, so an engine user and a skill author read one truth |
| `skill/references/guard-catalog.md` | agentspec | THE catalog: the ladder, every factory, the floor, and the eighteen lessons |
| `skill/references/norms.md` | agentspec | N1 and N4 point at the catalog; N4 teaches the `prose` helper and `RESIDUE` |
| `skill/references/gen.md` | agentspec | gains the surface interview for a thin or absent digest |
| `skill/references/spec-template.ts` | agentspec | carries the `prose` helper and the `RESIDUE` declaration |
| `skill/references/check-subject.test.ts` | agentspec | calls `proseLedger` beside `purity` and `nameGate` |
| `subjects/atlas-skill/cards.ts` | bench | re-authored from the rewritten skill |

---

### Task 1: The two static readers

The lint needs two facts about a subject before it can judge a prose rule: which tools exist, and which of them carry a deterministic check. Both are read from the source with the TypeScript AST, the same way `purity` and `nameGate` read it.

**Files:**
- Modify: `packages/eval/src/lints.ts` (append after `nameGate`, before `census`)
- Test: `packages/eval/test/lints.test.ts`

**Interfaces:**
- Consumes: `subjectSources(dir)` — the existing private helper at `packages/eval/src/lints.ts:14`, returning `readonly { rel: string; text: string }[]`.
- Produces, for Task 2:
  - `toolSurface(sources: readonly { rel: string; text: string }[]): ReadonlySet<string>`
  - `factoryNames(sources: readonly { rel: string; text: string }[]): ReadonlySet<string>`
  - `checkedTools(sources: readonly { rel: string; text: string }[], factories: ReadonlySet<string>): ReadonlySet<string>`
  - All three are module-private — Task 2 calls them from the same file.

- [ ] **Step 1: Write the failing test**

Append to `packages/eval/test/lints.test.ts`:

```typescript
import { proseLedger } from '../src/lints.js';

/** A subject small enough to read: three tools in their effect blocks, one factory,
 *  one disclosure ceiling, the prose helper and a declared residue. */
const CARD = `
export const w = {
  records: {},
  reads: { getInvoice: { form: 'get', entity: 'invoices', label: 'Look up an invoice' } },
  writes: { payInvoice: { form: 'set', entity: 'invoices', label: 'Pay an invoice' } },
  destructive: { voidInvoice: { form: 'remove', entity: 'invoices', label: 'void an invoice' } }
};
const prose = (name, rule, governs) => ({ name, rule, on: 'reply' });
const RESIDUE = ['noWriteOffs'];
export const contract = {
  guards: [
    onlyAfter('payInvoice', 'getInvoice'),
    prose('payFromTheRecord', 'A payment lands on the invoice the read returned.', ['payInvoice']),
    prose('noWriteOffs', 'No operation on this surface writes off a charge.', [])
  ],
  disclosure: {
    payInvoice: { cap: { arg: 'amount', at: 'getInvoice.invoice.balanceDue', refusal: 'Too much.' } }
  }
};
`;

test('proseLedger: a ledgered rule over a checked act, and a declared residue, are clean', () => {
  expect(proseLedger(subjectDirWith(CARD))).toEqual([]);
});

test('proseLedger: a rule that names no acts is unledgered', () => {
  const dir = subjectDirWith(CARD.replace(
    `prose('payFromTheRecord', 'A payment lands on the invoice the read returned.', ['payInvoice'])`,
    `prose('payFromTheRecord', 'A payment lands on the invoice the read returned.')`));
  expect(proseLedger(dir).map(f => f.code)).toContain('PROSE_UNLEDGERED');
});

test('proseLedger: a rule naming a tool off the surface, and one naming an unchecked act', () => {
  const off = subjectDirWith(CARD.replace(`['payInvoice'])`, `['refundInvoice'])`));
  expect(proseLedger(off).map(f => f.code)).toContain('PROSE_GOVERNS_UNKNOWN_TOOL');
  const unchecked = subjectDirWith(CARD.replace(`['payInvoice'])`, `['voidInvoice'])`));
  expect(proseLedger(unchecked).map(f => f.code)).toContain('PROSE_GOVERNS_UNCHECKED_TOOL');
});

test('proseLedger: an empty ledger outside the residue set is a finding', () => {
  const dir = subjectDirWith(CARD.replace(`const RESIDUE = ['noWriteOffs'];`, `const RESIDUE = [];`));
  expect(proseLedger(dir).map(f => f.code)).toContain('PROSE_RESIDUE_UNDECLARED');
});

test('proseLedger: a guard object literal written outside the helper is a finding', () => {
  const dir = subjectDirWith(`${CARD}
export const extra = { name: 'quietly', rule: 'A rule with no ledger.', on: 'reply' };`);
  expect(proseLedger(dir).map(f => f.code)).toContain('PROSE_INLINE');
});

test('proseLedger: a factory reached through a local wrapper still checks its tools', () => {
  const dir = subjectDirWith(`
export const w = { records: {}, reads: {}, writes: {},
  destructive: { voidInvoice: { form: 'remove', entity: 'invoices', label: 'void an invoice' } } };
const prose = (name, rule, governs) => ({ name, rule, on: 'reply' });
const RESIDUE = [];
function capabilityGate(name, tools, roles, sentence) {
  return { ...precondition(tools, ctx => true, sentence), name };
}
export const contract = { guards: [
  capabilityGate('moneyGate', ['voidInvoice'], ['owner'], 'Voiding needs the money capability.'),
  prose('terminalMoney', 'A voided invoice does not come back.', ['voidInvoice'])
] };`);
  expect(proseLedger(dir)).toEqual([]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /Users/marcos/Dev/js/looprun/looprun/packages/eval && npx vitest run test/lints.test.ts
```

Expected: every new test FAILS with `proseLedger is not exported by ../src/lints.js` (or a TypeScript resolution error naming `proseLedger`).

- [ ] **Step 3: Write the two readers**

Append to `packages/eval/src/lints.ts`, after `nameGate` ends at line 78:

```typescript
type Source = { readonly rel: string; readonly text: string };

const parse = (f: Source): ts.SourceFile =>
  ts.createSourceFile(f.rel, f.text, ts.ScriptTarget.ES2022, true);

const EFFECT_BLOCKS = new Set(['reads', 'writes', 'destructive']);

/** The tool surface: the keys of the world card's three effect blocks. The block a tool
 *  sits in IS its effect declaration, so the keys of those three objects are every tool
 *  a subject offers. `limits.destructive` is a number, so an object literal is required. */
function toolSurface(sources: readonly Source[]): ReadonlySet<string> {
  const tools = new Set<string>();
  for (const f of sources) {
    const sf = parse(f);
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)
        && EFFECT_BLOCKS.has(node.name.text)
        && ts.isObjectLiteralExpression(node.initializer)) {
        for (const entry of node.initializer.properties) {
          if (!ts.isPropertyAssignment(entry)) continue;
          if (ts.isIdentifier(entry.name) || ts.isStringLiteral(entry.name)) tools.add(entry.name.text);
        }
      }
      node.forEachChild(visit);
    };
    visit(sf);
  }
  return tools;
}

const DETERMINISTIC_FACTORIES = ['onlyAfter', 'precondition', 'valueFromUser', 'argFormat',
  'argAbsent', 'checkResult', 'mustAccountFor', 'maxCalls', 'blockPattern'];

function callsAny(node: ts.Node, names: ReadonlySet<string>): boolean {
  let found = false;
  const visit = (at: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(at) && ts.isIdentifier(at.expression) && names.has(at.expression.text)) {
      found = true;
      return;
    }
    at.forEachChild(visit);
  };
  visit(node);
  return found;
}

/** A subject wraps factories in named helpers, so a helper whose body reaches a factory
 *  IS a factory for the purpose of this reading. The set grows until it stops growing. */
function factoryNames(sources: readonly Source[]): ReadonlySet<string> {
  const known = new Set(DETERMINISTIC_FACTORIES);
  const locals: { name: string; body: ts.Node }[] = [];
  for (const f of sources) {
    const sf = parse(f);
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name !== undefined && node.body !== undefined)
        locals.push({ name: node.name.text, body: node.body });
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined
        && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)))
        locals.push({ name: node.name.text, body: node.initializer.body });
      node.forEachChild(visit);
    };
    visit(sf);
  }
  for (let grew = true; grew;) {
    grew = false;
    for (const local of locals) {
      if (known.has(local.name) || !callsAny(local.body, known)) continue;
      known.add(local.name);
      grew = true;
    }
  }
  return known;
}

/** A tool is checked when a factory call names it — as the first argument, or inside an
 *  array of tools a gate covers — or when a disclosure entry keyed by it carries a `cap`,
 *  which refuses at a figure a read returned. */
function checkedTools(sources: readonly Source[], factories: ReadonlySet<string>): ReadonlySet<string> {
  const tools = new Set<string>();
  const take = (arg: ts.Expression | undefined): void => {
    if (arg === undefined) return;
    if (ts.isStringLiteral(arg)) tools.add(arg.text);
    else if (ts.isArrayLiteralExpression(arg))
      for (const element of arg.elements) if (ts.isStringLiteral(element)) tools.add(element.text);
  };
  for (const f of sources) {
    const sf = parse(f);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && factories.has(node.expression.text)) {
        take(node.arguments[0]);
        for (const arg of node.arguments) if (ts.isArrayLiteralExpression(arg)) take(arg);
      }
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'cap') {
        const keyed = node.parent.parent;
        if (ts.isPropertyAssignment(keyed) && ts.isIdentifier(keyed.name)) tools.add(keyed.name.text);
      }
      node.forEachChild(visit);
    };
    visit(sf);
  }
  return tools;
}
```

- [ ] **Step 4: Run the tests to verify they still fail, for the right reason**

```bash
cd /Users/marcos/Dev/js/looprun/looprun/packages/eval && npx vitest run test/lints.test.ts
```

Expected: the new tests still FAIL naming `proseLedger`; the three existing tests (`purity`, `nameGate`, `census`) still PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/looprun
git add packages/eval/src/lints.ts packages/eval/test/lints.test.ts
git commit -m "feat(eval): a subject's tool surface and its checked acts, read from the source"
```

---

### Task 2: The `proseLedger` lint

**Files:**
- Modify: `packages/eval/src/lints.ts` (append after `checkedTools`)
- Modify: `packages/eval/src/index.ts:12`
- Test: `packages/eval/test/lints.test.ts` (the tests written in Task 1)

**Interfaces:**
- Consumes: `toolSurface`, `factoryNames`, `checkedTools`, `subjectSources`, `parse`, `LintFinding` — all from Task 1 and the existing file.
- Produces: `proseLedger(subjectDir: string): readonly LintFinding[]`, exported from `@looprun-ai/eval`. Task 3 calls it.

- [ ] **Step 1: Write the implementation**

Append to `packages/eval/src/lints.ts`:

```typescript
/** The names a subject declares as residue: laws it states and no call can break,
 *  because no tool on the surface performs the act. */
function residueNames(sources: readonly Source[]): ReadonlySet<string> {
  const names = new Set<string>();
  for (const f of sources) {
    const sf = parse(f);
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
        && node.name.text === 'RESIDUE' && node.initializer !== undefined) {
        const list = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
        if (ts.isArrayLiteralExpression(list))
          for (const element of list.elements) if (ts.isStringLiteral(element)) names.add(element.text);
      }
      node.forEachChild(visit);
    };
    visit(sf);
  }
  return names;
}

/** A guard object written by hand rather than through the helper: `name` as a string
 *  literal, `rule` present, and neither `deny` nor `judgeQuery` to make it a check. The
 *  helper's own body writes `name` and `rule` in shorthand, so it is not this shape. */
function isInlineProse(node: ts.Node): boolean {
  if (!ts.isObjectLiteralExpression(node)) return false;
  let namedByLiteral = false, ruled = false, checked = false;
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) continue;
    if (property.name.text === 'name' && ts.isStringLiteral(property.initializer)) namedByLiteral = true;
    if (property.name.text === 'rule') ruled = true;
    if (property.name.text === 'deny' || property.name.text === 'judgeQuery') checked = true;
  }
  return namedByLiteral && ruled && !checked;
}

export function proseLedger(subjectDir: string): readonly LintFinding[] {
  const sources = subjectSources(subjectDir);
  const surface = toolSurface(sources);
  const checked = checkedTools(sources, factoryNames(sources));
  const residue = residueNames(sources);
  const findings: LintFinding[] = [];

  for (const f of sources) {
    const sf = parse(f);
    const where = (node: ts.Node): string =>
      `${f.rel}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;

    const visit = (node: ts.Node): void => {
      if (isInlineProse(node)) findings.push({ code: 'PROSE_INLINE',
        sentence: `${where(node)} — a rule written as an object literal carries no ledger; state it through the prose helper` });

      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && node.expression.text === 'prose') {
        const first = node.arguments[0];
        const name = first !== undefined && ts.isStringLiteral(first) ? first.text : '(unnamed)';
        const governs = node.arguments[2];
        if (governs === undefined || !ts.isArrayLiteralExpression(governs)) {
          findings.push({ code: 'PROSE_UNLEDGERED',
            sentence: `${where(node)} — prose rule '${name}' names no acts it governs` });
        } else if (governs.elements.length === 0) {
          if (!residue.has(name)) findings.push({ code: 'PROSE_RESIDUE_UNDECLARED',
            sentence: `${where(node)} — prose rule '${name}' governs no act and is not declared in RESIDUE` });
        } else {
          for (const element of governs.elements) {
            if (!ts.isStringLiteral(element)) continue;
            if (!surface.has(element.text)) findings.push({ code: 'PROSE_GOVERNS_UNKNOWN_TOOL',
              sentence: `${where(node)} — prose rule '${name}' governs '${element.text}', which is on no effect block` });
            else if (!checked.has(element.text)) findings.push({ code: 'PROSE_GOVERNS_UNCHECKED_TOOL',
              sentence: `${where(node)} — prose rule '${name}' governs '${element.text}', which carries no deterministic guard and no cap` });
          }
        }
      }
      node.forEachChild(visit);
    };
    visit(sf);
  }
  return findings;
}
```

- [ ] **Step 2: Export it**

In `packages/eval/src/index.ts`, replace line 12:

```typescript
export { census, nameGate, purity } from './lints.js';
```

with:

```typescript
export { census, nameGate, proseLedger, purity } from './lints.js';
```

- [ ] **Step 3: Run the tests to verify they pass**

```bash
cd /Users/marcos/Dev/js/looprun/looprun/packages/eval && npx vitest run test/lints.test.ts
```

Expected: PASS — all nine tests in the file.

- [ ] **Step 4: Run the repo gate**

```bash
cd /Users/marcos/Dev/js/looprun/looprun && pnpm build && pnpm typecheck && pnpm test
```

Expected: exit 0. `pnpm build` must run before `pnpm typecheck`, because the generators and the typecheck read `packages/core/dist`.

**Do NOT add `proseLedger` to `packages/eval/test/atlas-gate.test.ts:22`.** That test lints the
certified reference, which is the measuring stick and does not change. It runs `purity` and
`nameGate` and that is the whole list.

- [ ] **Step 5: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/looprun
git add packages/eval/src/lints.ts packages/eval/src/index.ts packages/eval/test/lints.test.ts
git commit -m "feat(eval): a prose rule names the acts it governs, and the lint checks each one"
```

---

### Task 3: The skill's static gate calls the new lint

**Files:**
- Modify: `agentspec/skill/references/check-subject.test.ts`

**Interfaces:**
- Consumes: `proseLedger(subjectDir: string): readonly LintFinding[]` from Task 2.
- Produces: nothing further consumes this.

- [ ] **Step 1: Add the call**

In `agentspec/skill/references/check-subject.test.ts`, replace line 12:

```typescript
import { SubjectLoader, Validator, nameGate, purity } from '@looprun-ai/eval';
```

with:

```typescript
import { SubjectLoader, Validator, nameGate, proseLedger, purity } from '@looprun-ai/eval';
```

and replace line 28:

```typescript
  expect(nameGate(SUBJECT)).toEqual([]);
```

with:

```typescript
  expect(nameGate(SUBJECT)).toEqual([]);
  expect(proseLedger(SUBJECT)).toEqual([]);
```

- [ ] **Step 2: Verify it runs against a real subject**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec-bench
cp /Users/marcos/Dev/js/looprun/agentspec/skill/references/check-subject.test.ts subjects/atlas-next/
npx vitest run subjects/atlas-next/check-subject.test.ts
```

Expected: FAIL on `proseLedger`, with `PROSE_UNLEDGERED` findings — the reference's `prose` helper takes two arguments today. This is the lint proving it reads a real subject. Record the finding count.

- [ ] **Step 3: Remove the copy**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec-bench && rm subjects/atlas-next/check-subject.test.ts
```

- [ ] **Step 4: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
git add skill/references/check-subject.test.ts
git commit -m "feat(skill): the static gate reads the prose ledger"
```

---

### Task 4: The catalog becomes the act-keyed ladder

`guard-catalog.md` is rewritten so that the first question about a rule is what it DOES to a call, and so that every factory the engine ships has a row and a worked example.

**Files:**
- Modify: `agentspec/skill/references/guard-catalog.md` (replace §1, §3.6 and §4 of the current file)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the section headings `## 1 · The ladder`, `## 2 · The floor`, `## 3 · Eighteen lessons` — Task 5 adds lessons under §3, Task 6 links to §1 by name.

- [ ] **Step 1: Replace the choosing table with the ladder**

Replace the whole of the current `## 4 · Choosing, in one table` and the current `## 1 · The factories` with a single `## 1 · The ladder`. It opens with the question and then carries every row of the table in §3.1 of `docs/superpowers/specs/2026-08-20-mechanism-first-guards-design.md` — sixteen rows, one per mechanism, each with its worked example. Copy the examples verbatim from the spec; they are already written in ten different businesses and already carry their figures.

The section ends with the sentence that makes the last row the last row:

```markdown
The last row is the last row. A rule reaches it only after the fifteen above it have been
tried and named — and the naming is not a habit, it is `governs`, which the static gate reads.
```

- [ ] **Step 2: Replace §3.6 with the pairing law**

The heading `### 3.6 — prose guards are guards` and its body are replaced by:

```markdown
### A prose rule states a law; a check enforces it

Every tool that changes a record carries a deterministic guard. A prose rule rides on top of
that floor: it says in the operator's words what the check refuses in code. One law, three
layers, on a lender's refund desk:

```typescript
onlyAfter('issueRefund', 'getStatement')                     // the order, checked
cap: { arg: 'amount', at: 'getStatement.account.refundable',  // the ceiling, checked
       refusal: 'A refund of {args.amount} cannot go out: 1,800 was paid and 600 has already
                 gone back, so 1,200 is what can still be returned.' }
prose('refundCapFromTheRecord',                               // the law, stated
      'A refund is capped by the statement: what was paid minus what has already gone back.',
      ['issueRefund'])
```

A prose rule that names an act carrying no check is a sentence standing where a refusal
belongs. The static gate reports it as `PROSE_GOVERNS_UNCHECKED_TOOL`.
```

- [ ] **Step 3: Add the ledger section**

Append a new `## 4 · The ledger` carrying the helper, the residue declaration and the five findings — copy §3.2 of the design spec verbatim, including both worked `prose(...)` calls and the findings table. Add one sentence the spec does not carry, because it is the mistake an author makes first:

```markdown
`governs` names ACTS. A read carries no deterministic guard and never should, so a law about
what a read means shapes words only: its ledger is empty and its name belongs in `RESIDUE`.
```

- [ ] **Step 4: Verify the catalog names every factory**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
for f in onlyAfter precondition valueFromUser argFormat argAbsent checkResult mustAccountFor \
         maxCalls blockPattern maskPattern purgePattern swapTerms lieCheck impossibilityCheck \
         injectionCheck hallucinationCheck cap empty when gates; do
  printf '%-22s %s\n' "$f" "$(grep -ac "$f" skill/references/guard-catalog.md)"
done
```

Expected: every row reports at least 1. A row reporting 0 is a factory the ladder does not route.

- [ ] **Step 5: Verify no Atlas vocabulary survives in the examples**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
grep -acE 'boom lift|dispatchTechnician|registerAsset|bookingId|Atlas' skill/references/guard-catalog.md
```

Expected: `0`. The catalog teaches guards, not equipment rental.

- [ ] **Step 6: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
git add skill/references/guard-catalog.md
git commit -m "docs(skill): the catalog routes a rule by what it does to a call"
```

---

### Task 5: The eighteen lessons, generalised, with their figures kept

**Files:**
- Modify: `agentspec/skill/references/guard-catalog.md` (the `## 3 · Eighteen lessons` section)
- Read: `looprun/docs/superpowers/specs/2026-08-19-authoring-lessons.md` §6 — the ledger of eighteen

**Interfaces:**
- Consumes: the section headings from Task 4.
- Produces: nothing further consumes this.

- [ ] **Step 1: Move each lesson, one business at a time**

Each of the eighteen rows in `authoring-lessons.md` §6 becomes a subsection under `## 3`. The shape is fixed: the failing turn, then the mechanism. **The figures move with the lesson; the business does not.** Assign businesses so no two adjacent lessons share one, cycling through freight, pharmacy, school registrar, card operations, clinic, lender, warehouse, courier, utility, insurer.

Two written out, as the pattern to follow for the other sixteen:

```markdown
### Lesson 9 — a figure the operator spoke is `valueFromUser`, never prose

  the cardholder wrote:  "There's a charge I don't recognise — 84.90 at a petrol station."
  the model sent:        raiseChargeback({ txnId: 'txn_5510', amount: 89.40 })
  the operator saw:      a chargeback raised for 4.50 more than the cardholder claimed
  the guard:             valueFromUser('raiseChargeback', 'amount')

Numbers are read by their digits, so this guard covers an amount exactly as it covers an
address. A rule that says "use the figure the operator gave" is a wish with the same words.

### Lesson 10 — the refusal names a real role, and the roster is a `fact`

  the model said:    "…this requires a member with the 'ward_supervisor' grade, such as
                      Dr. Halloran."
  the records hold:  four grades — consultant, registrar, nurse, clerk — no grade called
                     ward_supervisor, and nobody named Halloran on the rota
  the closure:       facts: ['The rota carries exactly four grades: consultant, registrar,
                      nurse and clerk. When a refusal points to who can act, it names one of
                      these or a person a read returned — never another title.']

A refusal that invents an authority is worse than no refusal: the operator goes looking for
somebody who does not exist. Whenever a guard sentence says "name someone who can", the domain
owes the model the closed list of who that can be.
```

- [ ] **Step 2: Verify all eighteen landed**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
grep -ac '^### Lesson ' skill/references/guard-catalog.md
```

Expected: `18`.

- [ ] **Step 3: Verify the figures survived**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
grep -acE '[0-9]' skill/references/guard-catalog.md
```

Expected: at least 18 lines carrying a digit inside the lessons section. A lesson with no number is a maxim; rewrite it with the figure from `authoring-lessons.md`.

- [ ] **Step 4: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
git add skill/references/guard-catalog.md
git commit -m "docs(skill): eighteen lessons, each with the turn and the figures that bought it"
```

---

### Task 6: The phases point at the catalog, and the digest gets a fallback

**Files:**
- Modify: `agentspec/skill/references/norms.md` — N1 (line 55), N4 (line 173)
- Modify: `agentspec/skill/references/gen.md`
- Modify: `agentspec/skill/references/spec-template.ts`

**Interfaces:**
- Consumes: the section headings from Task 4 (`## 1 · The ladder`, `## 4 · The ledger`).
- Produces: nothing further consumes this.

- [ ] **Step 1: N1 points at the ladder**

At the end of the N1 bullet list in `norms.md`, before the A7 paragraph, add:

```markdown
- **Read [guard-catalog.md](guard-catalog.md) §1 before splitting.** The split decides which
  desk owns which act, and a desk that owns an act owns the reads its refusal must quote. That
  is a guard decision taken before any guard is written.
```

- [ ] **Step 2: N4 replaces its routing diagram with a pointer**

In `norms.md`, replace the fenced routing diagram under `## N4 — the guards sweep` (the block beginning `can a pure function over the typed ctx decide it?`) with:

```markdown
Every rule the ledger states is walked once, and routed by [guard-catalog.md](guard-catalog.md)
§1 — the question is what the rule DOES to a call. The catalog is the only place that question
is answered; this page does not restate it.
```

- [ ] **Step 3: N4 teaches the ledger instead of the bare helper**

In `norms.md`, replace the `### Helper functions are normal` block's `prose` snippet:

```typescript
const prose = (name: string, rule: string): Guard => ({ name, rule, on: 'reply' });
```

with:

```typescript
/** A rule the prompt states in the operator's words. `governs` names the tools whose acts this
 *  law reaches; each of them carries the check that refuses. A law no tool acts on is residue,
 *  and the residue set is declared once by name. */
const prose = (name: string, rule: string, governs: readonly string[]): Guard =>
  ({ name, rule, on: 'reply' });

/** Laws this surface states and no call can break, because no tool performs the act. */
const RESIDUE = ['noWriteOffs'] as const;
```

and delete the sentence `` `prose` is three lines and pays for itself. ``, replacing it with:

```markdown
The third argument is what the static gate reads. A rule that governs an act carrying no check
is reported, and so is an empty ledger whose name is not in `RESIDUE`. See
[guard-catalog.md](guard-catalog.md) §4.
```

- [ ] **Step 4: `gen.md` gains the surface interview**

Append to `agentspec/skill/references/gen.md`:

```markdown
## When the digest is thin or absent

`gen/DOCS-DIGEST.md` is the list N4 walks. When the material yields little, the SURFACE is
interviewed instead — every rule somebody already wrote is sitting in it:

| where to look | the rule it yields |
|---|---|
| each `gates` entry on a world card | the condition that refuses this act, and the figures its `detail` must state |
| each refusal `detail` already authored | a law the operator is owed in words |
| each declared-but-forbidden argument | an `argAbsent` waiting to be written |
| each ceiling a read returns | a `cap`, and the arithmetic behind it |
| each `when` on an entry | the record state that makes consent conditional |
| the roles any record carries | the closed roster that belongs in `facts` |
| an operation the domain expects and NO tool performs | a residue rule: say the operation does not exist, never name another team |

The interview produces the same artefact as the digest — a list of rules — and N4 walks it the
same way. What the skill never carries is one business's list.
```

- [ ] **Step 5: `spec-template.ts` carries the ledger shape**

In `agentspec/skill/references/spec-template.ts`, add beside the other helpers:

```typescript
/** A rule the prompt states in the operator's words. `governs` names the tools whose acts this
 *  law reaches; each of them carries the check that refuses. */
const prose = (name: string, rule: string, governs: readonly string[]): Guard =>
  ({ name, rule, on: 'reply' });

/** Laws this surface states and no call can break, because no tool performs the act. */
const RESIDUE: readonly string[] = [];
```

- [ ] **Step 6: Verify the routing question exists in exactly one place**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
grep -acl 'what does this rule DO to a call' skill/references/*.md
```

Expected: exactly one file — `guard-catalog.md`.

- [ ] **Step 7: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
git add skill/references/norms.md skill/references/gen.md skill/references/spec-template.ts
git commit -m "docs(skill): one home for the routing question, and a surface to interview"
```

---

### Task 7: The tutorial lesson carries the same ladder

An engine user who never runs the skill reads the same routing question.

**Files:**
- Modify: `looprun/docs/tutorial/04-guards.md`
- Test: `looprun/docs/tutorial/snippets/test/hotel.test.ts`

**Interfaces:**
- Consumes: the ladder table from Task 4.
- Produces: nothing further consumes this.

- [ ] **Step 1: Add the ladder to the lesson**

Insert the sixteen-row table from `guard-catalog.md` §1 into `docs/tutorial/04-guards.md`, under a heading `## Which guard — ask what the rule does to a call`. Keep the lesson's existing hotel examples where they already work; the table's own examples stay in their ten businesses.

- [ ] **Step 2: Add the pairing law to the lesson**

Append to the same lesson:

```markdown
## A rule is a sentence and a check, together

A guard sentence rides the prompt and a check refuses the call. Write both for the same law:

```typescript
onlyAfter('cancelBooking', 'getBooking')
```

The sentence tells the model what to do. The check makes it true whatever the model decides.
A rule stated only as a sentence is a wish.
```

- [ ] **Step 3: Verify the snippets still compile and pass**

```bash
cd /Users/marcos/Dev/js/looprun/looprun && npx vitest run docs/tutorial/snippets/test/hotel.test.ts
```

Expected: PASS — 5 tests.

- [ ] **Step 4: Run the repo gate**

```bash
cd /Users/marcos/Dev/js/looprun/looprun && pnpm build && pnpm typecheck && pnpm test
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/looprun
git add docs/tutorial/04-guards.md
git commit -m "docs(tutorial): a rule is a sentence and a check, together"
```

---

### Task 8: Re-author the Atlas from the rewritten skill

**Files:**
- Modify: `bench/subjects/atlas-skill/cards.ts`

**Interfaces:**
- Consumes: the rewritten skill pages from Tasks 4–6, and `proseLedger` from Task 2.
- Produces: a subject Task 9 runs.

**What must NOT change:** `subjects/atlas-skill/world.ts`, `generated/**`, `world-kit.ts` and `cases.ts` are ported data. Moving them moves the measuring stick and voids the comparison.

- [ ] **Step 1: Build the rules ledger from the surface**

Following `gen.md`'s surface interview, walk `subjects/atlas-skill/world.ts` and write the rule list to `subjects/atlas-skill/gen/RULES.md`: every gate, every refusal `detail`, every ceiling a read returns, every declared-but-forbidden argument, every role the records carry, and every operation the cases expect that no tool performs.

**Read only the world card and the skill's pages.** Reading `subjects/atlas-next/cards.ts` makes the comparison circular and voids the result.

- [ ] **Step 2: Re-author `cards.ts` with the ladder**

Rewrite the guards of `subjects/atlas-skill/cards.ts`, routing every rule in `gen/RULES.md` through `guard-catalog.md` §1. Carry the `prose` helper and `RESIDUE` in their new shapes.

Known target from the measurement: `issueRefund` needs its ceiling, which the current card states only in prose.

```typescript
issueRefund: {
  needs: { getInvoice: { tool: 'getInvoice', args: { invoiceId: 'invoiceId' } } },
  cap: { arg: 'amount', at: 'getInvoice.invoice.refundable',
         refusal: 'A refund of {args.amount} cannot go out: {getInvoice.invoice.amountPaid} '
                + 'was paid and {getInvoice.invoice.refunded} has already gone back, so '
                + '{getInvoice.invoice.refundable} is what can still be returned.' }
}
```

- [ ] **Step 3: Run the static gate**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec-bench
cp /Users/marcos/Dev/js/looprun/agentspec/skill/references/check-subject.test.ts subjects/atlas-skill/
npx vitest run subjects/atlas-skill/check-subject.test.ts
```

Expected: PASS. Every finding is fixed in `cards.ts`, never by widening the lint.

- [ ] **Step 4: Rehearse before declaring it done**

```bash
cd /Users/marcos/Dev/js/looprun/looprun/packages/eval
set -a && . /Users/marcos/Dev/js/looprun/agentspec-bench/.env.local && set +a
RUN_ATLAS_SUBJECT=atlas-skill RUN_ATLAS=first:10 RUN_ATLAS_STAMP=2026-08-20-ladder-slice \
RUN_ATLAS_REP=rep1 RUN_ATLAS_VARIANT=governed npx vitest run test/atlas-run.test.ts
```

Then judge those ten rows in session — read `judge-input.part*.jsonl` and write `verdicts.jsonl` as `{row, verdict, note}`. **No external model touches a transcript.**

Expected: 10 of 10. Anything less is diagnosed and fixed in the skill first, then in the subject, before the hundred runs.

- [ ] **Step 5: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec-bench
rm subjects/atlas-skill/check-subject.test.ts
git add subjects/atlas-skill/cards.ts subjects/atlas-skill/gen/RULES.md \
        subjects/atlas-skill/test/2026-08-20-ladder-slice
git commit -m "feat(atlas-skill): the guards re-authored through the ladder"
```

---

### Task 9: The hundred, judged, against the bar

**Files:**
- Create: `bench/subjects/atlas-skill/test/2026-08-20-ladder-full100/rep1/verdicts.jsonl`
- Create: `bench/subjects/atlas-skill/test/2026-08-20-ladder-full100/rep1/JUDGE.md`
- Create: `looprun/docs/analysis/2026-08-20-mechanism-first-atlas.md`
- Modify: `looprun/docs/superpowers/specs/2026-08-20-mechanism-first-guards-design.md` (the status line)

**Interfaces:**
- Consumes: the subject from Task 8.
- Produces: the record that closes the spec.

- [ ] **Step 1: Run the hundred**

```bash
cd /Users/marcos/Dev/js/looprun/looprun/packages/eval
set -a && . /Users/marcos/Dev/js/looprun/agentspec-bench/.env.local && set +a
RUN_ATLAS_SUBJECT=atlas-skill RUN_ATLAS=all RUN_ATLAS_STAMP=2026-08-20-ladder-full100 \
RUN_ATLAS_REP=rep1 RUN_ATLAS_VARIANT=governed npx vitest run test/atlas-run.test.ts
```

Expected: ~8 minutes, a run directory holding the dumps and `judge-input.part*.jsonl`.

- [ ] **Step 2: Judge all one hundred rows**

Read every `judge-input.part*.jsonl` row in session and write one line per row to
`verdicts.jsonl`:

```
{"row":"r001","verdict":"pass","note":"the ask carries the settlement figure"}
```

`verdict` is `pass`, `fail` or `unreadable`. **All one hundred rows.** A partial reading is not a score: a run whose rows are unread proves nothing, and nine unread rows is how the previous measurement failed to say anything definite.

- [ ] **Step 3: Fold and certify**

```bash
cd /Users/marcos/Dev/js/looprun/looprun/packages/eval && npx vitest run test/atlas-certify.test.ts
```

Expected: a certification against the bar 0.95.

- [ ] **Step 4: Write the record**

Create `looprun/docs/analysis/2026-08-20-mechanism-first-atlas.md` carrying the score, the pass/fail split, every failing case with its group, and the factory inventory of the re-authored subject beside the reference's:

```
                      reference(95)   skill-authored
  acting tools with a
    deterministic guard   31/31          31/31
  numeric caps               2             ?
  prose rules               50             ?
  factories used            11 of 20       ?
```

- [ ] **Step 5: Stamp the spec**

If the score is ≥ 95 with only 43 and 87 failing, change the spec's status line from
`Status: OPEN` to `Status: CLOSED` and name the run directory that closed it. If it is not,
leave it OPEN, record what failed, and stop — the skill stays frozen.

- [ ] **Step 6: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec-bench
git add subjects/atlas-skill/test/2026-08-20-ladder-full100
git commit -m "test(atlas-skill): the hundred, judged row by row"

cd /Users/marcos/Dev/js/looprun/looprun
git add docs/analysis/2026-08-20-mechanism-first-atlas.md \
        docs/superpowers/specs/2026-08-20-mechanism-first-guards-design.md
git commit -m "docs(analysis): what the ladder bought, measured on the hundred"
```

---

## Backlog — deliberately not in this plan

| item | why it waits |
|---|---|
| the skill pausing to ask the author mid-authoring | a question in the middle of a generation run is a bad seam. If it ever lands, it asks about a RULE — never for permission to write prose |
| new engine factories for laws that fit none of the twenty | decided with the lint's numbers in hand: the declared `RESIDUE` sets are the evidence of which laws have no mechanism |
| a prose budget per contract | a count invites merging five rules into one long string, which passes the count and teaches less |
| unfreezing the `agentspec` skill | only in the session where Task 9 passes the bar |
