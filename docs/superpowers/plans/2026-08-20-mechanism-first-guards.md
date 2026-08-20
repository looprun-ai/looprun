# Mechanism-First Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A prose guard names the acts it reaches in `Guard.tool`, a deterministic check stands on each of those acts, and a static lint refuses a subject where it does not.

**Architecture:** Two new verbs in `packages/eval` read a subject's TypeScript source: one reports four findings, the other emits the justification table from the card so it cannot go stale. The `agentspec` skill's guard catalog is rewritten as a routing table keyed on what a rule DOES to a call, covering every factory the engine ships, with worked examples drawn from ten different businesses. The skill's phases point at that catalog instead of restating it. The Atlas is then re-authored from the rewritten skill and measured.

**Tech Stack:** TypeScript, the `typescript` compiler API (AST walking, already a dependency of `packages/eval`), vitest, pnpm workspaces.

## Global Constraints

- **Everything written to a file is English** — code, identifiers, comments, string literals, prompt text, commit messages, documentation. Only a chat reply follows the user's language.
- **AS-IS documentation only** — a comment states what the system IS. It never narrates change ("used to", "no longer", "kept for compatibility"), never cites evidence ("measured over 70 turns"), and never names a test file as proof.
- **No external model, ever** — no file calls a third-party model API. The agent in the session reads the transcripts and writes the verdicts. The only model any run may reach is the subject under test named in `ask/targets.json`.
- **No compatibility shims** — these packages are pre-1.0. Rename and delete the old name in the same commit.
- **`packages/core` is not touched.** The engine's authoring surface stays exactly as it is.
- **The plain-names gate is a law.** `tests/plain-names.test.mjs` retires seven words — `ledger`, `probe`, `preview`, `trunk`, `challenge`, `arm`, `band` — and catches them inside camelCase (`createLedger`, `bandJson`). They may not survive in any file a person reads, in EITHER repo; only `docs/superpowers/` is allowlisted. Check a new identifier against the gate before naming anything.
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
| `packages/eval/src/lints.ts` | looprun | gains `pairing`, `pairingTable` and their four static readers, beside `purity`, `nameGate` and `census` |
| `packages/eval/src/index.ts` | looprun | exports `pairing` and `pairingTable` |
| `packages/eval/test/lints.test.ts` | looprun | gains the `pairing` and `pairingTable` cases |
| `docs/tutorial/04-guards.md` | looprun | carries the act-keyed ladder, so an engine user and a skill author read one truth |
| `skill/references/guard-catalog.md` | agentspec | THE catalog: the ladder, every factory, the floor, and the eighteen lessons |
| `skill/references/norms.md` | agentspec | N1 and N4 point at the catalog; N4 teaches the `prose` helper and `RESIDUE` |
| `skill/references/gen.md` | agentspec | gains the surface interview for a thin or absent digest |
| `skill/references/spec-template.ts` | agentspec | carries the `prose` helper and the `RESIDUE` declaration |
| `skill/references/check-subject.test.ts` | agentspec | calls `pairing` beside `purity` and `nameGate` |
| `subjects/atlas-skill/cards.ts` | bench | re-authored from the rewritten skill |

---

### Task 1: The three static readers

The lint needs three facts about a subject before it can judge a prose rule: which tools exist,
which mechanisms cover each of them, and what the subject declares as residue. All three are
read from the source with the TypeScript AST, the same way `purity` and `nameGate` read it.

**Files:**
- Modify: `packages/eval/src/lints.ts` (append after `nameGate`, before `census`)
- Test: `packages/eval/test/lints.test.ts`

**Interfaces:**
- Consumes: `subjectSources(dir)` — the existing private helper at `packages/eval/src/lints.ts:14`, returning `readonly { rel: string; text: string }[]`.
- Produces, for Task 2 — all module-private, called from the same file:
  - `type Source = { readonly rel: string; readonly text: string }`
  - `parse(f: Source): ts.SourceFile`
  - `toolSurface(sources: readonly Source[]): ReadonlySet<string>`
  - `factoryNames(sources: readonly Source[]): ReadonlySet<string>`
  - `checksByTool(sources: readonly Source[], factories: ReadonlySet<string>): ReadonlyMap<string, readonly string[]>`
  - `residue(sources: readonly Source[]): ReadonlyMap<string, string>`

- [ ] **Step 1: Write the failing tests**

Append to `packages/eval/test/lints.test.ts`:

```typescript
import { pairing, pairingTable } from '../src/lints.js';

/** A subject small enough to read: three tools in their effect blocks, one factory, one
 *  disclosure ceiling, the prose helper and a declared residue with its reason. */
const CARD = `
export const w = {
  records: {},
  reads: { getInvoice: { form: 'get', entity: 'invoices', label: 'Look up an invoice' } },
  writes: { payInvoice: { form: 'set', entity: 'invoices', label: 'Pay an invoice' } },
  destructive: { voidInvoice: { form: 'remove', entity: 'invoices', label: 'void an invoice' } }
};
const prose = (name, rule, tool) =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };
const RESIDUE = { noWriteOffs: 'No tool on this surface writes off a charge, so no call can break it.' };
export const contract = {
  guards: [
    onlyAfter('payInvoice', 'getInvoice'),
    prose('payFromTheRecord', 'A payment lands on the invoice the read returned.', ['payInvoice']),
    prose('noWriteOffs', 'No operation on this surface writes off a charge.')
  ],
  disclosure: {
    payInvoice: { cap: { arg: 'amount', at: 'getInvoice.invoice.balanceDue', refusal: 'Too much.' } }
  }
};
`;

test('pairing: a rule over a checked act, and an explained residue, are clean', () => {
  expect(pairing(subjectDirWith(CARD))).toEqual([]);
});

test('pairing: a rule naming a tool off the surface, and one naming an unchecked act', () => {
  const off = subjectDirWith(CARD.replace(`['payInvoice'])`, `['refundInvoice'])`));
  expect(pairing(off).map(f => f.code)).toContain('PROSE_TOOL_UNKNOWN');
  const unchecked = subjectDirWith(CARD.replace(`['payInvoice'])`, `['voidInvoice'])`));
  expect(pairing(unchecked).map(f => f.code)).toContain('PROSE_TOOL_UNCHECKED');
});

test('pairing: a rule that names no act and no reason is a finding', () => {
  const dir = subjectDirWith(CARD.replace(
    `const RESIDUE = { noWriteOffs: 'No tool on this surface writes off a charge, so no call can break it.' };`,
    `const RESIDUE = {};`));
  expect(pairing(dir).map(f => f.code)).toContain('PROSE_RESIDUE_UNDECLARED');
});

test('pairing: a residue reason too short to weigh is a finding', () => {
  const dir = subjectDirWith(CARD.replace(
    `'No tool on this surface writes off a charge, so no call can break it.'`, `'n/a'`));
  expect(pairing(dir).map(f => f.code)).toContain('PROSE_RESIDUE_UNEXPLAINED');
});

test('pairing: a guard written as an object literal is read the same way', () => {
  const dir = subjectDirWith(`${CARD}
export const extra = { name: 'quietly', rule: 'A rule with no check.', on: 'reply',
                       tool: ['voidInvoice'] };`);
  expect(pairing(dir).map(f => f.code)).toContain('PROSE_TOOL_UNCHECKED');
});

test('pairing: a deterministic guard is not a prose rule, whatever shape it takes', () => {
  const dir = subjectDirWith(`${CARD}
export const spread = { ...onlyAfter('payInvoice', 'getInvoice'), rule: 'Read it first.' };
export const named = { ...precondition('payInvoice', c => true, 'Only while open.'), name: 'openOnly' };`);
  expect(pairing(dir)).toEqual([]);
});

test('pairing: a factory reached through a local wrapper still checks its tools', () => {
  const dir = subjectDirWith(`
export const w = { records: {}, reads: {}, writes: {},
  destructive: { voidInvoice: { form: 'remove', entity: 'invoices', label: 'void an invoice' } } };
const prose = (name, rule, tool) =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };
const RESIDUE = {};
function capabilityGate(name, tools, roles, sentence) {
  return { ...precondition(tools, ctx => true, sentence), name };
}
export const contract = { guards: [
  capabilityGate('moneyGate', ['voidInvoice'], ['owner'], 'Voiding needs the money capability.'),
  prose('terminalMoney', 'A voided invoice does not come back.', ['voidInvoice'])
] };`);
  expect(pairing(dir)).toEqual([]);
});

test('pairingTable: the residue row carries the reason, and a checked row names its mechanism', () => {
  const table = pairingTable(subjectDirWith(CARD));
  expect(table).toContain('payFromTheRecord');
  expect(table).toContain('onlyAfter');
  expect(table).toContain('No tool on this surface writes off a charge');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /Users/marcos/Dev/js/looprun/looprun/packages/eval && npx vitest run test/lints.test.ts
```

Expected: every new test FAILS naming `pairing` or `pairingTable` as not exported.

- [ ] **Step 3: Write the three readers**

Append to `packages/eval/src/lints.ts`, after `nameGate` ends at line 78:

```typescript
type Source = { readonly rel: string; readonly text: string };

const parse = (f: Source): ts.SourceFile =>
  ts.createSourceFile(f.rel, f.text, ts.ScriptTarget.ES2022, true);

const EFFECT_BLOCKS = new Set(['reads', 'writes', 'destructive']);

/** The tool surface: the keys of the world card's three effect blocks. The block a tool sits
 *  in IS its effect declaration. `limits.destructive` is a number, so an object literal is
 *  required before the keys count. */
function toolSurface(sources: readonly Source[]): ReadonlySet<string> {
  const tools = new Set<string>();
  for (const f of sources) {
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
    visit(parse(f));
  }
  return tools;
}

const DETERMINISTIC_FACTORIES = ['onlyAfter', 'precondition', 'valueFromUser', 'argFormat',
  'argAbsent', 'checkResult', 'mustAccountFor', 'maxCalls', 'blockPattern'];

function callsAny(node: ts.Node, names: ReadonlySet<string>): boolean {
  let found = false;
  const visit = (at: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(at) && ts.isIdentifier(at.expression) && names.has(at.expression.text))
      found = true;
    else at.forEachChild(visit);
  };
  visit(node);
  return found;
}

/** A subject wraps factories in named helpers, so a helper whose body reaches a factory IS a
 *  factory for this reading. The set grows until it stops growing. */
function factoryNames(sources: readonly Source[]): ReadonlySet<string> {
  const known = new Set(DETERMINISTIC_FACTORIES);
  const locals: { name: string; body: ts.Node }[] = [];
  for (const f of sources) {
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name !== undefined && node.body !== undefined)
        locals.push({ name: node.name.text, body: node.body });
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined
        && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)))
        locals.push({ name: node.name.text, body: node.initializer.body });
      node.forEachChild(visit);
    };
    visit(parse(f));
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

/** Tool → the mechanisms that refuse on it. A factory call names its tool first, or names
 *  several inside an array; a disclosure entry carrying a `cap` refuses at a figure a read
 *  returned, which is a mechanism on the tool that entry is keyed by. */
function checksByTool(sources: readonly Source[],
                      factories: ReadonlySet<string>): ReadonlyMap<string, readonly string[]> {
  const byTool = new Map<string, string[]>();
  const note = (tool: string, mechanism: string): void => {
    const at = byTool.get(tool);
    if (at === undefined) byTool.set(tool, [mechanism]);
    else if (!at.includes(mechanism)) at.push(mechanism);
  };
  const take = (arg: ts.Expression | undefined, mechanism: string): void => {
    if (arg === undefined) return;
    if (ts.isStringLiteral(arg)) note(arg.text, mechanism);
    else if (ts.isArrayLiteralExpression(arg))
      for (const element of arg.elements) if (ts.isStringLiteral(element)) note(element.text, mechanism);
  };
  for (const f of sources) {
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && factories.has(node.expression.text)) {
        const mechanism = node.expression.text;
        take(node.arguments[0], mechanism);
        for (const arg of node.arguments) if (ts.isArrayLiteralExpression(arg)) take(arg, mechanism);
      }
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'cap') {
        const keyed = node.parent.parent;
        if (ts.isPropertyAssignment(keyed) && ts.isIdentifier(keyed.name)) note(keyed.name.text, 'cap');
      }
      node.forEachChild(visit);
    };
    visit(parse(f));
  }
  return byTool;
}

/** The laws a subject states and no call can break, each with the reason a reviewer weighs. */
function residue(sources: readonly Source[]): ReadonlyMap<string, string> {
  const reasons = new Map<string, string>();
  for (const f of sources) {
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
        && node.name.text === 'RESIDUE' && node.initializer !== undefined) {
        const object = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
        if (ts.isObjectLiteralExpression(object))
          for (const property of object.properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            if (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) continue;
            if (ts.isStringLiteral(property.initializer))
              reasons.set(property.name.text, property.initializer.text);
          }
      }
      node.forEachChild(visit);
    };
    visit(parse(f));
  }
  return reasons;
}
```

- [ ] **Step 4: Run the tests to verify they still fail, for the right reason**

```bash
cd /Users/marcos/Dev/js/looprun/looprun/packages/eval && npx vitest run test/lints.test.ts
```

Expected: the new tests still FAIL naming `pairing`; the three existing tests (`purity`, `nameGate`, `census`) still PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/looprun
git add packages/eval/src/lints.ts packages/eval/test/lints.test.ts
git commit -m "feat(eval): a subject's tool surface, the mechanisms on each act, and its residue"
```

---

### Task 2: `pairing` and `pairingTable`

**Files:**
- Modify: `packages/eval/src/lints.ts` (append after `residue`)
- Modify: `packages/eval/src/index.ts:12`
- Test: `packages/eval/test/lints.test.ts` (the tests written in Task 1)

**Interfaces:**
- Consumes: `Source`, `parse`, `toolSurface`, `factoryNames`, `checksByTool`, `residue`, `subjectSources`, `LintFinding` — all from Task 1 and the existing file.
- Produces, exported from `@looprun-ai/eval`:
  - `pairing(subjectDir: string): readonly LintFinding[]` — Task 3 calls it
  - `pairingTable(subjectDir: string): string` — the skill's N4 writes its output into the thinking log

- [ ] **Step 1: Write the prose reader and the two verbs**

Append to `packages/eval/src/lints.ts`:

```typescript
/** A rule the prompt states and no function decides — whichever shape it was written in.
 *  `tools` is null when the rule declares none: it reaches no act at all. */
type ProseRule = { readonly name: string; readonly tools: readonly string[] | null;
                   readonly node: ts.Node };

const toolsOf = (arg: ts.Expression | undefined): readonly string[] | null => {
  if (arg === undefined) return null;
  if (ts.isStringLiteral(arg)) return [arg.text];
  if (!ts.isArrayLiteralExpression(arg)) return null;
  return arg.elements.filter(ts.isStringLiteral).map(element => element.text);
};

/** Two shapes reach the same place: a `prose(name, rule, tool)` call, and an object literal
 *  naming itself with a string, carrying a rule, and carrying neither `deny` nor `judgeQuery`.
 *  A factory's own output is neither — it names itself through a spread, or carries a check. */
function proseRules(sf: ts.SourceFile): readonly ProseRule[] {
  const rules: ProseRule[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'prose') {
      const first = node.arguments[0];
      if (first !== undefined && ts.isStringLiteral(first))
        rules.push({ name: first.text, tools: toolsOf(node.arguments[2]), node });
    }
    if (ts.isObjectLiteralExpression(node)) {
      let name: string | null = null, ruled = false, decides = false;
      let tools: readonly string[] | null = null;
      for (const property of node.properties) {
        const key = property.name !== undefined && ts.isIdentifier(property.name)
          ? property.name.text : null;
        if (key === null) continue;
        if (key === 'deny' || key === 'judgeQuery') decides = true;
        if (!ts.isPropertyAssignment(property)) continue;
        if (key === 'name' && ts.isStringLiteral(property.initializer)) name = property.initializer.text;
        if (key === 'rule') ruled = true;
        if (key === 'tool') tools = toolsOf(property.initializer);
      }
      if (name !== null && ruled && !decides) rules.push({ name, tools, node });
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return rules;
}

/** Shorter than this and a residue reason is a label, not a justification a reviewer weighs. */
const A_REASON = 20;

export function pairing(subjectDir: string): readonly LintFinding[] {
  const sources = subjectSources(subjectDir);
  const surface = toolSurface(sources);
  const checks = checksByTool(sources, factoryNames(sources));
  const reasons = residue(sources);
  const findings: LintFinding[] = [];

  for (const [name, reason] of reasons)
    if (reason.trim().length < A_REASON) findings.push({ code: 'PROSE_RESIDUE_UNEXPLAINED',
      sentence: `RESIDUE names '${name}' with no reason a reviewer can weigh` });

  for (const f of sources) {
    const sf = parse(f);
    for (const rule of proseRules(sf)) {
      const at = `${f.rel}:${sf.getLineAndCharacterOfPosition(rule.node.getStart(sf)).line + 1}`;
      if (rule.tools === null || rule.tools.length === 0) {
        if (!reasons.has(rule.name)) findings.push({ code: 'PROSE_RESIDUE_UNDECLARED',
          sentence: `${at} — prose rule '${rule.name}' names no act, and RESIDUE does not say why` });
        continue;
      }
      for (const tool of rule.tools) {
        if (!surface.has(tool)) findings.push({ code: 'PROSE_TOOL_UNKNOWN',
          sentence: `${at} — prose rule '${rule.name}' names '${tool}', which is on no effect block` });
        else if (!checks.has(tool)) findings.push({ code: 'PROSE_TOOL_UNCHECKED',
          sentence: `${at} — prose rule '${rule.name}' names '${tool}', which carries no deterministic guard and no cap` });
      }
    }
  }
  return findings;
}

/** The justification table, read from the card. The rows above the rule are derived; the rows
 *  below it are the residue, and their reason is the only line an author writes. */
export function pairingTable(subjectDir: string): string {
  const sources = subjectSources(subjectDir);
  const checks = checksByTool(sources, factoryNames(sources));
  const reasons = residue(sources);
  const carried: string[] = [], residual: string[] = [];
  for (const f of sources)
    for (const rule of proseRules(parse(f))) {
      if (rule.tools === null || rule.tools.length === 0) {
        residual.push(`| ${rule.name} | — | nothing | ${reasons.get(rule.name) ?? '(undeclared)'} |`);
        continue;
      }
      const mechanisms = [...new Set(rule.tools.flatMap(t => checks.get(t) ?? []))];
      carried.push(`| ${rule.name} | ${rule.tools.join(' · ')} | `
        + `${mechanisms.length === 0 ? 'nothing' : mechanisms.join(' · ')} | — |`);
    }
  return ['| prose rule | reaches | what carries it | why nothing stronger |',
          '|---|---|---|---|', ...carried, ...residual].join('\n');
}
```

- [ ] **Step 2: Export both verbs**

In `packages/eval/src/index.ts`, replace line 12:

```typescript
export { census, nameGate, purity } from './lints.js';
```

with:

```typescript
export { census, nameGate, pairing, pairingTable, purity } from './lints.js';
```

- [ ] **Step 3: Run the tests to verify they pass**

```bash
cd /Users/marcos/Dev/js/looprun/looprun/packages/eval && npx vitest run test/lints.test.ts
```

Expected: PASS — all eleven tests in the file.

- [ ] **Step 4: Run the repo gate**

```bash
cd /Users/marcos/Dev/js/looprun/looprun && pnpm build && pnpm typecheck && pnpm test
```

Expected: exit 0. `pnpm build` must run before `pnpm typecheck`, because the generators and the typecheck read `packages/core/dist`.

**Do NOT add `pairing` to `packages/eval/test/atlas-gate.test.ts:22`.** That test lints the
certified reference, which is the measuring stick and does not change. It runs `purity` and
`nameGate` and that is the whole list.

- [ ] **Step 5: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/looprun
git add packages/eval/src/lints.ts packages/eval/src/index.ts packages/eval/test/lints.test.ts
git commit -m "feat(eval): a prose rule names the acts it reaches, and the lint checks each one"
```

---

### Task 3: The skill's static gate calls the new lint

**Files:**
- Modify: `agentspec/skill/references/check-subject.test.ts`

**Interfaces:**
- Consumes: `pairing(subjectDir: string): readonly LintFinding[]` from Task 2.
- Produces: nothing further consumes this.

- [ ] **Step 1: Add the call**

In `agentspec/skill/references/check-subject.test.ts`, replace line 12:

```typescript
import { SubjectLoader, Validator, nameGate, purity } from '@looprun-ai/eval';
```

with:

```typescript
import { SubjectLoader, Validator, nameGate, pairing, purity } from '@looprun-ai/eval';
```

and replace line 28:

```typescript
  expect(nameGate(SUBJECT)).toEqual([]);
```

with:

```typescript
  expect(nameGate(SUBJECT)).toEqual([]);
  expect(pairing(SUBJECT)).toEqual([]);
```

- [ ] **Step 2: Verify it runs against a real subject**

`agentspec-bench` carries no vitest, so the verb runs from `packages/eval`, which does:

```bash
pnpm build
node -e "
const { pairing } = require('node:module').createRequire('$PWD/')('./packages/eval/dist/lints.js');
const found = pairing('/Users/marcos/Dev/js/looprun/agentspec-bench/subjects/atlas-next');
console.log(found.length, [...new Set(found.map(f => f.code))].join(' '));
"
```

Expected: FAIL on `pairing`, with `PROSE_RESIDUE_UNDECLARED` findings — the reference's prose rules declare no `tool` and it has no `RESIDUE`. This is the lint proving it reads a real subject. Record the finding count.

- [ ] **Step 3: Remove the copy**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec-bench && rm subjects/atlas-next/check-subject.test.ts
```

- [ ] **Step 4: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
git add skill/references/check-subject.test.ts
git commit -m "feat(skill): the static gate reads the prose pairing"
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

Replace the whole of the current `## 4 · Choosing, in one table` and the current `## 1 · The factories` with a single `## 1 · The ladder`. It opens with the question and then carries every row of the table in §3.1 of `docs/superpowers/specs/2026-08-20-mechanism-first-guards-design.md` — seventeen rows: sixteen mechanisms, and prose last, each with its worked example. Copy the examples verbatim from the spec; they are already written in ten different businesses and already carry their figures.

The section ends with the sentence that makes the last row the last row:

```markdown
The last row is the last row. A rule reaches it only after the fifteen above it have been
tried, and the act it reaches is named in `Guard.tool`, which the static gate reads.
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
belongs. The static gate reports it as `PROSE_TOOL_UNCHECKED`.
```

- [ ] **Step 3: Add the pairing section**

Append a new `## 6 · The pairing` carrying the helper, the residue declaration and the five findings — copy §3.2 of the design spec verbatim, including both worked `prose(...)` calls and the findings table. Add one sentence the spec does not carry, because it is the mistake an author makes first:

```markdown
`tool` names ACTS. A read carries no deterministic guard and never should, so a law about what
a read means shapes words only: it declares no tool, and its name and reason belong in `RESIDUE`.
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
- Read: `looprun/docs/superpowers/specs/2026-08-19-authoring-lessons.md` §6 — the pairing of eighteen

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
- Consumes: the section headings from Task 4 (`## 1 · The ladder`, `## 6 · The pairing`).
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
Every rule the pairing states is walked once, and routed by [guard-catalog.md](guard-catalog.md)
§1 — the question is what the rule DOES to a call. The catalog is the only place that question
is answered; this page does not restate it.
```

- [ ] **Step 3: N4 teaches the pairing instead of the bare helper**

In `norms.md`, replace the `### Helper functions are normal` block's `prose` snippet:

```typescript
const prose = (name: string, rule: string): Guard => ({ name, rule, on: 'reply' });
```

with:

```typescript
/** A rule the prompt states in the operator's words. `tool` names the acts this law reaches,
 *  and each of them carries the check that refuses. On a reply-phase guard the field is a pure
 *  declaration: `checkReply` collects with no tool in hand, so it never filters. A law no call
 *  can break is residue. */
const prose = (name: string, rule: string, tool?: readonly string[]): Guard =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };

/** Laws this surface states and no call can break, because no tool performs the act. The
 *  sentence is the justification a reviewer reads and the lint requires. */
const RESIDUE = {
  noWriteOffs: 'No tool on this surface writes off a charge, so no call can break this rule.'
} as const;
```

and delete the sentence `` `prose` is three lines and pays for itself. ``, replacing it with:

```markdown
`tool` is a field the engine already carries — *"exact declared tool names this guard covers"*.
The static gate reads it: a rule naming an act that carries no check is reported, and so is a
rule naming no act whose name is absent from `RESIDUE`. See [guard-catalog.md](guard-catalog.md) §4.

And add the closing line of N4, which is where the justification lands:

```markdown
**N4 closes with the table.** Write `pairingTable(subjectDir)`'s output into
`norms/N4.thinking.md`. It is read from the card, so it cannot drift from it: every prose rule,
the acts it reaches, the mechanism carrying each, and — for the residue — the reason nothing
stronger exists. The residue rows are the only lines anyone writes by hand, and across subjects
they are the list of laws the engine has no mechanism for.
```
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

- [ ] **Step 5: `spec-template.ts` carries the pairing shape**

In `agentspec/skill/references/spec-template.ts`, add beside the other helpers:

```typescript
/** A rule the prompt states in the operator's words. `tool` names the acts this law reaches,
 *  and each of them carries the check that refuses. */
const prose = (name: string, rule: string, tool?: readonly string[]): Guard =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };

/** Laws this surface states and no call can break, because no tool performs the act. */
const RESIDUE: Readonly<Record<string, string>> = {};
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

- [ ] **Step 3: One shape of `prose`, in both repos**

`docs/tutorial/04-guards.md:33` and `docs/tutorial/snippets/hotel/cards.ts:9` declare a
two-argument helper. The skill declares a three-argument one. Two shapes under one name is a
second truth about the same thing, so the tutorial's takes the pairing too.

In `docs/tutorial/snippets/hotel/cards.ts`, replace lines 6–9:

```typescript
/** A prose-only guard: no check can decide it, so it rides the prompt as the sentence it is
 *  and `agent.guards()` prints it beside every other guard. `tool` names the acts this law
 *  reaches — each of them carries the check that refuses. A law no call can break is residue. */
const prose = (name: string, rule: string, tool?: readonly string[]): Guard =>
  tool === undefined ? { name, rule, on: 'reply' } : { name, rule, on: 'reply', tool };

/** Laws this hotel states and no call can break, because no tool performs the act. */
const RESIDUE = {
  'no-promises': 'No tool on this surface promises anything, so no call can break this rule.'
} as const;
```

and the call at line 49:

```typescript
    prose('no-promises',
      'Never promise an upgrade or a discount; the front desk decides those.')
```

Make the same two replacements in `docs/tutorial/04-guards.md:33` and its worked call, and add
the sentence that explains the empty pairing:

```markdown
`no-promises` reaches no act: no tool on this surface promises anything, so the rule shapes
words only. It declares no `tool`, and its name and reason sit in `RESIDUE` — which is how an
author says "nothing enforces this, I know it, and here is why".
```

- [ ] **Step 4: The snippet obeys its own lesson**

Append to `docs/tutorial/snippets/test/hotel.test.ts`:

```typescript
import { pairing } from '@looprun-ai/eval';

test('the hotel snippet passes the pairing lint the lesson teaches', () => {
  expect(pairing(new URL('../hotel', import.meta.url).pathname)).toEqual([]);
});
```

- [ ] **Step 5: Verify the snippets still compile and pass**

```bash
cd /Users/marcos/Dev/js/looprun/looprun && npx vitest run docs/tutorial/snippets/test/hotel.test.ts
```

Expected: PASS — 6 tests.

- [ ] **Step 6: Run the repo gate**

```bash
cd /Users/marcos/Dev/js/looprun/looprun && pnpm build && pnpm typecheck && pnpm test
```

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/looprun
git add docs/tutorial/04-guards.md docs/tutorial/snippets/hotel/cards.ts \
        docs/tutorial/snippets/test/hotel.test.ts
git commit -m "docs(tutorial): a rule is a sentence and a check, together"
```

---

### Task 8: Re-author the Atlas from the rewritten skill

**Files:**
- Modify: `bench/subjects/atlas-skill/cards.ts`

**Interfaces:**
- Consumes: the rewritten skill pages from Tasks 4–6, and `pairing` from Task 2.
- Produces: a subject Task 9 runs.

**What must NOT change:** `subjects/atlas-skill/world.ts`, `generated/**`, `world-kit.ts` and `cases.ts` are ported data. Moving them moves the measuring stick and voids the comparison.

- [ ] **Step 1: Build the rule list from the surface**

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

`SubjectLoader` needs a runner that resolves TypeScript, and `agentspec-bench` has none. Write
the gate as a throwaway inside `packages/eval`, run it, and delete it:

```bash
cd /Users/marcos/Dev/js/looprun/looprun/packages/eval
cat > test/skill-gate.tmp.test.ts <<'EOF'
import { test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { SubjectLoader } from '../src/subject-loader.js';
import { Validator } from '../src/validator.js';
import { nameGate, pairing, purity } from '../src/lints.js';

const SUBJECT = join(fileURLToPath(import.meta.url),
  '../../../../../agentspec-bench/subjects/atlas-skill');

test('the re-authored subject loads, validates and passes every static lint', async () => {
  const subject = await SubjectLoader.load(SUBJECT);
  expect(Object.keys(subject.specs)).toHaveLength(6);
  expect(subject.cases).toHaveLength(100);
  expect(SubjectLoader.promptProof(subject).size).toBe(1);
  expect(new Validator().run(subject).findings).toEqual([]);
  expect(purity(SUBJECT)).toEqual([]);
  expect(nameGate(SUBJECT)).toEqual([]);
  expect(pairing(SUBJECT)).toEqual([]);
});
EOF
npx vitest run test/skill-gate.tmp.test.ts
rm test/skill-gate.tmp.test.ts
```

Expected: PASS. Every finding is fixed in `cards.ts`, never by widening the lint. The file is
deleted whether it passed or not — it names one subject and is not a suite the repo keeps.

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
