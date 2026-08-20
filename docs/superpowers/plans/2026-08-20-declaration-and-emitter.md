# The Declaration and the Emitter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An agent authoring a governed subject writes one YAML declaration of business sentences; an emitter writes every line of TypeScript, and one gate of eleven verbs answers whether it is sound.

**Architecture:** A new `packages/emit` in `looprun` reads `declaration.yaml` beside a world card and emits `cards.ts`, `subject.ts`, `check-subject.test.ts`, `gen/SEAM.md`, the `covers` keys, the `WHY` map and the expected census. Nine new verbs join `packages/eval`, and the three gate lists in the skill collapse into the one file the emitter writes. The skill's pages become a lookup rather than a linear read.

**Tech Stack:** TypeScript 5.9 (strict, `nodenext`), pnpm workspaces, vitest, `yaml` for the declaration, `typescript` compiler API for the AST lints.

## Global Constraints

- Everything written to a file is English — code, comments, docs, commit messages, string literals, prompt text, regex alternation tokens. Only a chat reply follows the user's language.
- AS-IS only. A comment states what the system IS. Never "used to", "no longer", "kept for compatibility"; never cite a measurement, a run or a test file inside a comment.
- The plain-names gate retires seven words, caught inside camelCase: `ledger`, `probe`, `preview`, `trunk`, `challenge`, `arm`, `band`. Only `docs/superpowers/` is allowlisted.
- No file calls a third-party model API. The only model any run may reach is the subject under test named in `ask/targets.json`.
- Break freely — these packages are pre-1.0 and carry no external consumers. Rename and delete in one commit; never add a compatibility shim.
- A subject carries NO regex. The three lawful pattern homes are `blockPattern`, `purgePattern`, `maskPattern` in the engine catalog.
- Build before typecheck: `docs:guards` and `typecheck` read `packages/core/dist`. A `src` edit is invisible until `pnpm build` runs.
- Every spec change ships the engine, the docs and the skill in the same working session.

## File Structure

```
looprun/packages/emit/                     NEW package, @looprun-ai/emit
  src/declaration.ts       the YAML shape and its reader
  src/against-surface.ts   every refusal, each naming the YAML line
  src/write-cards.ts       cards.ts
  src/write-artifacts.ts   subject.ts · the gate file · SEAM.md · covers · census
  src/cli.ts               `looprun emit <subject-dir>`
  src/index.ts             the barrel
  test/*.test.ts

looprun/packages/eval/src/lints.ts         nine verbs added
looprun/packages/core/src/index.ts         PromptWriter already exported

agentspec/skill/
  SKILL.md                         EMIT enters the pipeline table
  references/guard-catalog.md      becomes a lookup, ~8 KB
  references/guard-catalog-lessons.md   NEW — the seventeen lessons
  references/guard-contexts.md          NEW — the four contexts, every field
  references/norms.md              N6 prints and signs; no hand counting
  references/evals.md              the covers key comes from the census
  references/test.md               T1 points at the one gate
  references/ship.md               the bar is 0.95
  references/spec-template.ts      passes the gate it is copied into
```

---

## Task 1: `boilerplate` — repeated wording, priced by the cards it is stamped on

Closes: B2, B1a.

**Files:**
- Modify: `packages/eval/boilerplate.mjs` → delete after porting
- Modify: `packages/eval/src/lints.ts`
- Modify: `packages/eval/src/index.ts`
- Test: `packages/eval/test/lints.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `boilerplate(lines: readonly string[], minRun?: number): readonly string[]`

- [ ] **Step 1: Write the failing test**

```typescript
describe('boilerplate', () => {
  test('prices a repeated run by the lines beyond the first that carry it', () => {
    const tail = ' Read the member record and name a member whose role can do it.';
    const rows = boilerplate([`Money moves on the money capability.${tail}`,
                              `Dispatch runs on the crew capability.${tail}`,
                              `The registry changes on the fleet capability.${tail}`], 30);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('2 lines beyond the first');
    expect(rows[0]).toContain('Read the member record');
  });

  test('a run shorter than the floor is not a row', () => {
    expect(boilerplate(['alpha beta gamma', 'alpha beta delta'], 30)).toEqual([]);
  });

  test('rare-word pairing cannot see what this sees', () => {
    const lines = ['a b c the shared closing sentence every line repeats verbatim here',
                   'd e f the shared closing sentence every line repeats verbatim here'];
    expect(echoes(lines).length).toBe(0);
    expect(boilerplate(lines, 30).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd /Users/marcos/Dev/js/looprun/looprun && npx vitest run packages/eval/test/lints.test.ts -t boilerplate`
Expected: FAIL with `boilerplate is not defined`.

- [ ] **Step 3: Port the verb into `lints.ts`**

Port the body of `packages/eval/boilerplate.mjs` — the pairwise longest-shared-run scan — changing its signature to take already-separated lines and return rows. Keep the character loop; the purity gate forbids a regex in `packages/eval`.

```typescript
/** Two lines of one prompt carrying the same wording. The cost is the run's length times the
 *  lines beyond the first that repeat it: a closing sentence shared by eight rules, stamped on
 *  every act each rule names, is paid once per stamp and teaches once. A rare-word pairing
 *  cannot see it — the words are in every line, so none of them is rare. */
export function boilerplate(lines: readonly string[], minRun = 40): readonly string[] {
  const kept = lines.map(l => l.trim()).filter(l => l.length > 0);
  const carriers = new Map<string, Set<number>>();
  for (let i = 0; i < kept.length; i += 1)
    for (let j = i + 1; j < kept.length; j += 1) {
      const run = longestShared(kept[i], kept[j]).trim();
      if (run.length < minRun) continue;
      const held = carriers.get(run) ?? new Set<number>();
      held.add(i); held.add(j);
      carriers.set(run, held);
    }
  return [...carriers.entries()]
    .map(([run, lineNumbers]) => ({ run, cost: run.length * (lineNumbers.size - 1), lineNumbers }))
    .sort((a, b) => b.cost - a.cost)
    .map(r => `${String(r.cost).padStart(6)} B  ${r.run.length} chars × ${r.lineNumbers.size - 1} `
      + `lines beyond the first\n         "${r.run.slice(0, 96)}"`);
}
```

Add `longestShared` as a module-local helper, ported verbatim from the `.mjs`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/eval/test/lints.test.ts`
Expected: PASS, and the whole file green.

- [ ] **Step 5: Delete the script and export the verb**

```bash
rm packages/eval/boilerplate.mjs
```

Add `boilerplate` to the export list in `packages/eval/src/index.ts`.

- [ ] **Step 6: Run the house lints**

Run: `pnpm build && npx vitest run packages/core/test/lint/`
Expected: `purity` and `nameGate` both empty.

- [ ] **Step 7: Commit**

```bash
git add packages/eval && git commit -m "feat(eval): wording repeated across rendered lines, priced by the stamps it is paid for"
```

---

## Task 2: `overWide` — a rule naming more than one act declares its licence

Closes: B3, V8.

**Files:**
- Modify: `packages/eval/src/lints.ts`, `packages/eval/src/index.ts`
- Test: `packages/eval/test/lints.test.ts`

**Interfaces:**
- Consumes: `ruleCopies` (shipped), `namedToolLists` (module-local, shipped).
- Produces: `overWide(subjectDir: string): readonly LintFinding[]`

- [ ] **Step 1: Write the failing test**

```typescript
describe('overWide', () => {
  const write = (body: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'wide-'));
    writeFileSync(join(dir, 'cards.ts'), body);
    return dir;
  };

  test('a rule over two acts with no licence is a finding', () => {
    const dir = write(`
      const CONTRACT = { guards: [
        { ...onlyAfter(['payInvoice', 'issueRefund'], 'getInvoice'), name: 'moneyReadsTheInvoice' }
      ] };
    `);
    const found = overWide(dir);
    expect(found.map(f => f.code)).toEqual(['RULE_WIDE_UNLICENSED']);
    expect(found[0].sentence).toContain('moneyReadsTheInvoice');
    expect(found[0].sentence).toContain('2 acts');
  });

  test('a declared licence clears it', () => {
    const dir = write(`
      export const WIDE = { moneyReadsTheInvoice: 'sameRefusal' } as const;
      const CONTRACT = { guards: [
        { ...onlyAfter(['payInvoice', 'issueRefund'], 'getInvoice'), name: 'moneyReadsTheInvoice' }
      ] };
    `);
    expect(overWide(dir)).toEqual([]);
  });

  test('a licence outside the closed set is a finding', () => {
    const dir = write(`
      export const WIDE = { moneyReadsTheInvoice: 'itIsFine' } as const;
      const CONTRACT = { guards: [
        { ...onlyAfter(['payInvoice', 'issueRefund'], 'getInvoice'), name: 'moneyReadsTheInvoice' }
      ] };
    `);
    expect(overWide(dir).map(f => f.code)).toEqual(['RULE_WIDE_LICENCE_UNKNOWN']);
  });

  test('a rule over one act asks nothing', () => {
    const dir = write(`
      const CONTRACT = { guards: [{ ...onlyAfter('issueRefund', 'getInvoice'), name: 'refundReads' }] };
    `);
    expect(overWide(dir)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/eval/test/lints.test.ts -t overWide`
Expected: FAIL with `overWide is not defined`.

- [ ] **Step 3: Implement**

```typescript
const WIDE_LICENCES = new Set(['oneLawEveryAct', 'sameRefusal']);

/** A contract rule is stamped on the card of every act it names, in every lane holding that act.
 *  A rule over five acts is five copies of one sentence, and it can only say what all five share.
 *  Naming more than one act therefore costs a licence: `oneLawEveryAct` when the sentence is true
 *  and useful on each, `sameRefusal` when the acts share the refusal word for word. A rule that
 *  claims neither is a rule that splits, one act at a time. */
export function overWide(subjectDir: string): readonly LintFinding[] {
  const sources = subjectSources(subjectDir);
  const lists = namedToolLists(sources);
  const licences = declaredMap(sources, 'WIDE');
  const findings: LintFinding[] = [];
  for (const f of sources) {
    const sf = parse(f);
    for (const guard of guardsWithTools(sf, lists)) {
      if (guard.tools.length < 2) continue;
      const at = `${f.rel}:${sf.getLineAndCharacterOfPosition(guard.node.getStart(sf)).line + 1}`;
      const claim = licences.get(guard.name);
      if (claim === undefined) {
        findings.push({ code: 'RULE_WIDE_UNLICENSED',
          sentence: `${at} — '${guard.name}' names ${guard.tools.length} acts, so its sentence is `
            + `stamped that many times. WIDE names why: oneLawEveryAct, or sameRefusal. `
            + `Neither? Split it, one act at a time.` });
      } else if (!WIDE_LICENCES.has(claim)) {
        findings.push({ code: 'RULE_WIDE_LICENCE_UNKNOWN',
          sentence: `${at} — '${guard.name}' claims '${claim}', which is neither oneLawEveryAct nor sameRefusal.` });
      }
    }
  }
  return findings;
}
```

`declaredMap(sources, name)` generalises the existing `licences()` helper, which today hard-codes
`WHY`; change that helper's signature to take the map name and have `unlicensed` pass `'WHY'`.
`guardsWithTools(sf, lists)` walks object literals and spread factory calls, returning
`{ name, tools, node }` — the same walk `proseRules` performs, without the prose-only filter.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/eval/test/lints.test.ts`
Expected: PASS, including the pre-existing `unlicensed` tests, which prove the `declaredMap` change is behaviour-preserving.

- [ ] **Step 5: Measure it against the three Atlas subjects**

Run:

```bash
cat > /tmp/wide.test.ts <<'EOF'
import { describe, expect, test } from 'vitest';
import { overWide } from '../src/lints.js';
describe('wide', () => { test('atlases', () => {
  for (const n of ['atlas-next', 'atlas-render-handfixed', 'atlas-render2'])
    console.log(n, overWide(`/Users/marcos/Dev/js/looprun/agentspec-bench/subjects/${n}`).length);
  expect(true).toBe(true);
}); });
EOF
cp /tmp/wide.test.ts packages/eval/test/wide.test.ts
npx vitest run packages/eval/test/wide.test.ts
rm packages/eval/test/wide.test.ts
```

Expected: a non-zero count on every subject — none of them declares a `WIDE` map yet. Record the three numbers in the commit body; they are the baseline the Atlas task reduces.

- [ ] **Step 6: Commit**

```bash
git add packages/eval && git commit -m "feat(eval): naming more than one act costs a licence, and the licence set is closed"
```

---

## Task 3: `seamCovered` — every refusal the world can emit, paired

Closes: S3, V4, and findings 2, 30, 72 (the hand walk of 91 KB and 239 refusal sites).

**Files:**
- Modify: `packages/eval/src/lints.ts`, `packages/eval/src/index.ts`
- Test: `packages/eval/test/lints.test.ts`

**Interfaces:**
- Consumes: `SurfaceFacts` from `@looprun-ai/core`.
- Produces: `seamCovered(subjectDir: string, facts): readonly SeamRow[]` where
  `interface SeamRow { readonly act: string; readonly code: string; readonly guard: string | null }`

- [ ] **Step 1: Write the failing test**

```typescript
describe('seamCovered', () => {
  const write = (world: string, cards: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'seam-'));
    writeFileSync(join(dir, 'world.ts'), world);
    writeFileSync(join(dir, 'cards.ts'), cards);
    return dir;
  };

  test('a fail code with no guard over its act is an uncovered row', () => {
    const dir = write(
      `const H = { cancelBooking: (w, a) => fail('BOOKING_ALREADY_OUT') };`,
      `const CONTRACT = { guards: [] };`);
    const rows = seamCovered(dir, { tools: { cancelBooking: {} } } as never);
    expect(rows).toEqual([{ act: 'cancelBooking', code: 'BOOKING_ALREADY_OUT', guard: null }]);
  });

  test('a guard over that act claims the row', () => {
    const dir = write(
      `const H = { cancelBooking: (w, a) => fail('BOOKING_ALREADY_OUT') };`,
      `const CONTRACT = { guards: [{ name: 'cancelBeforeItGoesOut', tool: ['cancelBooking'], on: 'preTool', deny: () => null }] };`);
    const rows = seamCovered(dir, { tools: { cancelBooking: {} } } as never);
    expect(rows[0].guard).toBe('cancelBeforeItGoesOut');
  });

  test('a gates entry is a row too', () => {
    const dir = write(
      `const W = { destructive: { cancelBooking: { gates: [{ kind: 'stateIs', field: 'status', value: 'CONFIRMED' }] } } };`,
      `const CONTRACT = { guards: [] };`);
    const rows = seamCovered(dir, { tools: { cancelBooking: {} } } as never);
    expect(rows.map(r => r.code)).toContain('stateIs:status');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/eval/test/lints.test.ts -t seamCovered`
Expected: FAIL with `seamCovered is not defined`.

- [ ] **Step 3: Implement**

Walk every source in the subject. Collect two kinds of row:

```typescript
/** Every refusal the WORLD can emit, paired to the card guard that refuses earlier in words. A
 *  `fail(CODE)` inside a handler and a `gates` entry on an act are the two shapes; the act is the
 *  enclosing property name of the handler, or the key the gate sits under. A row whose guard is
 *  null is a refusal the operator meets as a bare code. */
export function seamCovered(subjectDir: string,
                            facts: { readonly tools: Readonly<Record<string, unknown>> }): readonly SeamRow[]
```

- For `fail('CODE')` and `gateFail('CODE')`: the act is the nearest enclosing property assignment whose key is a declared tool.
- For a `gates: [...]` array: the act is the property the array sits under; the code is `${kind}:${field}`.
- The guard is the first contract guard whose `tool` list names that act, read with the same `guardsWithTools` walk Task 2 adds.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/eval/test/lints.test.ts`
Expected: PASS.

- [ ] **Step 5: Run it against the real Atlas world and count**

```bash
cat > packages/eval/test/seam.test.ts <<'EOF'
import { describe, expect, test } from 'vitest';
import { factsFromWorld } from '@looprun-ai/core';
import { seamCovered } from '../src/lints.js';
describe('seam', () => { test('atlas', async () => {
  const base = '/Users/marcos/Dev/js/looprun/agentspec-bench/subjects/atlas-render2';
  const { subjectWorld } = await import(`${base}/subject.ts`);
  const rows = seamCovered(base, factsFromWorld(subjectWorld));
  console.log('rows', rows.length, '| uncovered', rows.filter(r => r.guard === null).length);
  expect(rows.length).toBeGreaterThan(50);
}); });
EOF
npx vitest run packages/eval/test/seam.test.ts && rm packages/eval/test/seam.test.ts
```

Expected: over fifty rows. The audit counted 239 `fail(...)` sites and 91 refusal rows transcribed
by hand; this verb replaces that transcription.

- [ ] **Step 6: Commit**

```bash
git add packages/eval && git commit -m "feat(eval): every refusal the world can emit, paired to the guard that speaks first"
```

---

## Task 4: `destructiveDisclosed`, `capPaths`, `floorRedeclared`, `conductComplete`

Closes: C1, C2, C4, C5, R5, and findings 8, 17, 65, 75, 80.

Four verbs in one task: each is under thirty lines, each replaces one hand checkbox in `norms.md`,
and a reviewer would accept or reject all four together.

**Files:**
- Modify: `packages/eval/src/lints.ts`, `packages/eval/src/index.ts`
- Test: `packages/eval/test/lints.test.ts`

**Interfaces:**
- Produces:
  - `destructiveDisclosed(subjectDir: string, facts): readonly LintFinding[]`
  - `capPaths(subjectDir: string): readonly LintFinding[]`
  - `floorRedeclared(subjectDir: string): readonly LintFinding[]`
  - `conductComplete(subjectDir: string): readonly LintFinding[]`

- [ ] **Step 1: Write the failing tests**

```typescript
describe('destructiveDisclosed', () => {
  test('a destructive act with no before is a finding', () => {
    const dir = write(`const CONTRACT = { disclosure: { cancelBooking: { after: 'done' } } };`);
    const found = destructiveDisclosed(dir, { tools: { cancelBooking: { effect: 'destructive' } } } as never);
    expect(found.map(f => f.code)).toEqual(['DISCLOSURE_BEFORE_MISSING']);
    expect(found[0].sentence).toContain('carries only its label');
  });

  test('a write with no before asks nothing', () => {
    const dir = write(`const CONTRACT = { disclosure: {} };`);
    expect(destructiveDisclosed(dir, { tools: { moveBooking: { effect: 'write' } } } as never)).toEqual([]);
  });
});

describe('capPaths', () => {
  test('a cap rooted on a tool name with no needs alias is a finding', () => {
    const dir = write(`const CONTRACT = { disclosure: { issueRefund: {
      needs: { invoice: 'getInvoice' }, before: 'x',
      cap: { at: 'getInvoice.refundable', not: 'above' } } } };`);
    const found = capPaths(dir);
    expect(found.map(f => f.code)).toEqual(['CAP_PATH_UNROOTED']);
    expect(found[0].sentence).toContain("'getInvoice' is a read, not an alias");
    expect(found[0].sentence).toContain("invoice.refundable");
  });

  test('a cap rooted on a declared alias asks nothing', () => {
    const dir = write(`const CONTRACT = { disclosure: { issueRefund: {
      needs: { invoice: 'getInvoice' }, before: 'x',
      cap: { at: 'invoice.refundable', not: 'above' } } } };`);
    expect(capPaths(dir)).toEqual([]);
  });
});

describe('floorRedeclared', () => {
  test('a card declaring what the engine installs is a finding', () => {
    const dir = write(`const CONTRACT = { guards: [{ name: 'noDuplicateCall', on: 'preTool', deny: () => null }] };`);
    expect(floorRedeclared(dir).map(f => f.code)).toEqual(['FLOOR_REDECLARED']);
  });

  test('an authored name the engine does not install asks nothing', () => {
    const dir = write(`const CONTRACT = { guards: [{ name: 'refundReadsTheInvoice', on: 'preTool', deny: () => null }] };`);
    expect(floorRedeclared(dir)).toEqual([]);
  });
});

describe('conductComplete', () => {
  test('a law on some specs and not others is a finding', () => {
    const dir = write(`
      export const billing = { name: 'billing', persona: 'p', guards: [prose('declareHonestly', 'x')] };
      export const claims  = { name: 'claims',  persona: 'p', guards: [] };
    `);
    const found = conductComplete(dir);
    expect(found.map(f => f.code)).toEqual(['CONDUCT_INCOMPLETE']);
    expect(found[0].sentence).toContain('claims');
    expect(found[0].sentence).toContain('declareHonestly');
  });

  test('a law on every spec asks nothing', () => {
    const dir = write(`
      export const billing = { name: 'billing', persona: 'p', guards: [prose('declareHonestly', 'x')] };
      export const claims  = { name: 'claims',  persona: 'p', guards: [prose('declareHonestly', 'y')] };
    `);
    expect(conductComplete(dir)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and watch all three fail**

Run: `npx vitest run packages/eval/test/lints.test.ts -t "destructiveDisclosed|floorRedeclared|conductComplete"`
Expected: FAIL, three undefined functions.

- [ ] **Step 3: Implement**

`destructiveDisclosed` — for every tool whose fact carries `effect: 'destructive'`, the subject's
`disclosure` map must hold an entry with a `before`. The sentence names the cost:

```typescript
sentence: `Destructive act '${tool}' has no disclosure 'before', so the consent question `
  + `carries only its label: no amount, no record, nothing that cannot be undone.`
```

`capPaths` — a `cap.at` path is rooted on an alias the same disclosure entry declares in `needs`,
never on the read's own tool name. A path rooted on a tool never resolves, and the call dies at the
cap it was meant to be held by. The finding names the alias that would have worked.

`floorRedeclared` — a set of the names the engine installs itself, read from
`packages/core/src/cards/agent-factory.ts`'s floor pushes: `confirmFirst`, `groundedIds`,
`groundedDates`, `noDuplicateCall`, `argRequired`, `maxDestructive`, `brokenReply`,
`questionAnswered`, `claimIsGrounded`, `claimIsComplete`. A card declaring any of them, bare or
prefixed, is a finding.

`conductComplete` — collect every `prose(...)` name declared inside an object literal carrying a
`persona`, group by spec, and report any name present on some specs and absent from others.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/eval/test/lints.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/eval && git commit -m "feat(eval): a consent question with no figure, a floor guard redeclared, and a conduct law missing from a desk"
```

---

## Task 5: `coversResolve` and `approvable` — the exam's keys, and whether a case can fire

Closes: C3, C6, D5, S4, G-A, and findings 40, 47, 59, 71, 76.

This is the gate-integrity task: the tutorial's own hotel exam ships a key that resolves to nothing.

**Files:**
- Modify: `packages/eval/src/lints.ts`, `packages/eval/src/index.ts`
- Test: `packages/eval/test/lints.test.ts`

**Interfaces:**
- Consumes: `Engine.guards()` from `@looprun-ai/core` — the census, which includes the honesty floor rows the Rulebook injects and the compiled agent does not carry.
- Produces:
  - `coversResolve(cases: readonly ExamCase[], censusNames: ReadonlySet<string>): readonly LintFinding[]`
  - `approvable(cases: readonly ExamCase[], subject): readonly LintFinding[]`

- [ ] **Step 1: Write the failing test, using the tutorial's real defect**

```typescript
describe('coversResolve', () => {
  test('a key naming nothing the census carries is a finding', () => {
    const found = coversResolve(
      [{ id: 'cancel-asks-first', covers: ['consent:cancelBooking', 'onlyAfter:cancelBooking'] } as never],
      new Set(['confirmFirst:cancelBooking', 'onlyAfter:cancelBooking']));
    expect(found.map(f => f.code)).toEqual(['COVERS_UNRESOLVED']);
    expect(found[0].sentence).toContain('consent:cancelBooking');
    expect(found[0].sentence).toContain('confirmFirst:cancelBooking');
  });

  test('every key resolving asks nothing', () => {
    expect(coversResolve([{ id: 'x', covers: ['onlyAfter:cancelBooking'] } as never],
                         new Set(['onlyAfter:cancelBooking']))).toEqual([]);
  });
});
```

The suggestion in the sentence is the census name with the smallest edit distance — that is what
turns the finding into a fix.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/eval/test/lints.test.ts -t coversResolve`
Expected: FAIL with `coversResolve is not defined`.

- [ ] **Step 3: Implement `coversResolve`**

```typescript
/** A case's `covers` key names the guard the case exercises, spelled exactly as the census carries
 *  it. The census is what `Engine.guards()` returns — the compiled agent's rows plus the honesty
 *  rows the Rulebook injects, which is why a key must be read from the engine and never composed
 *  by hand from a category and a tool. A key naming nothing measures nothing, and a subject whose
 *  keys all resolve to nothing still certifies. */
export function coversResolve(cases: readonly ExamCase[],
                              censusNames: ReadonlySet<string>): readonly LintFinding[]
```

- [ ] **Step 4: Prove it against the tutorial**

```bash
cat > packages/eval/test/covers.test.ts <<'EOF'
import { describe, expect, test } from 'vitest';
import { coversResolve } from '../src/lints.js';
import { cases } from '../../../docs/tutorial/snippets/hotel/exam.js';
describe('tutorial', () => { test('hotel keys', () => {
  const census = new Set(['confirmFirst:cancelBooking', 'onlyAfter:cancelBooking',
                          'precondition:moveBooking', 'valueFromUser:moveBooking']);
  const found = coversResolve(cases, census);
  console.log(found.map(f => f.sentence));
  expect(found.length).toBeGreaterThan(0);
}); });
EOF
npx vitest run packages/eval/test/covers.test.ts
```

Expected: at least one finding, naming `consent:cancelBooking`. Keep this test — the tutorial is a
shipped artifact and this is its regression guard. Fix `docs/tutorial/snippets/hotel/exam.ts:11` in
the same commit, changing `consent:cancelBooking` to `confirmFirst:cancelBooking`, then re-run and
watch it go empty.

- [ ] **Step 5: Write the failing test for `approvable`**

```typescript
describe('approvable', () => {
  test('a case covering a guard its preset cannot trip is a finding', () => {
    const found = approvable(
      [{ id: 'move-confirmed', preset: 'everyoneCheckedIn',
         covers: ['precondition:moveBooking'] } as never],
      { presetLeavesGuardInert: () => true } as never);
    expect(found.map(f => f.code)).toEqual(['CASE_CANNOT_FIRE']);
  });
});
```

`approvable` runs each case's preset through the built world and asks, per covered guard, whether
the guard's own `deny` can return non-null in that state. A case that spells its key correctly and
still cannot fire measures nothing, which is the half of `test.md:51` that `coversResolve` does not
reach.

- [ ] **Step 6: Run the whole file**

Run: `npx vitest run packages/eval/test/lints.test.ts packages/eval/test/covers.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/eval docs/tutorial && git commit -m "feat(eval): a covers key is the census's own name, and a case that cannot fire measures nothing

The tutorial's hotel exam declared consent:cancelBooking; the engine mints confirmFirst:cancelBooking."
```

---

## Task 6: `echoes` takes its thresholds, and excludes generated lines

Closes: B4, G-E, and findings 28, 55.

**Files:**
- Modify: `packages/eval/src/lints.ts`
- Test: `packages/eval/test/lints.test.ts`

**Interfaces:**
- Produces: `promptLines(compiled, system, options?: { readonly skipGenerated?: boolean })`

- [ ] **Step 1: Write the failing test**

```typescript
describe('promptLines', () => {
  test('a contract rule whose acts are outside the lane is not a line this desk reads', () => {
    const compiled = {
      guards: [{ home: 'contract', rule: 'about issueRefund', tools: ['issueRefund'] },
               { home: 'contract', rule: 'about cancelBooking', tools: ['cancelBooking'] }],
      facts: { tools: { issueRefund: { does: 'refund' } } }
    };
    expect(promptLines(compiled as never, 'SYS')).toEqual(['SYS', 'about issueRefund', 'refund']);
  });

  test('skipGenerated drops the world sentences, keeping only what the cards author', () => {
    const compiled = {
      guards: [{ home: 'contract', rule: 'authored', tools: ['a'] }],
      facts: { tools: { a: { does: 'the world wrote this' } } }
    };
    expect(promptLines(compiled as never, 'SYS', { skipGenerated: true }))
      .toEqual(['SYS', 'authored']);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run packages/eval/test/lints.test.ts -t promptLines`
Expected: FAIL — the current `promptLines` returns every contract rule regardless of lane, and has no options parameter.

- [ ] **Step 3: Implement**

Filter contract rules to those naming at least one act in `compiled.facts.tools`, and gate the
`does` sentences behind `skipGenerated`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/eval/test/lints.test.ts`
Expected: PASS.

- [ ] **Step 5: Measure the effect on a real subject**

```bash
cat > packages/eval/test/echo.test.ts <<'EOF'
import { describe, expect, test } from 'vitest';
import { AgentFactory, factsFromWorld, PromptWriter } from '@looprun-ai/core';
import { echoes, promptLines } from '../src/lints.js';
describe('echo', () => { test('atlas', async () => {
  const base = '/Users/marcos/Dev/js/looprun/agentspec-bench/subjects/atlas-render2';
  const { contract, specs, subjectWorld } = await import(`${base}/subject.ts`);
  const facts = factsFromWorld(subjectWorld);
  let all = 0, authored = 0;
  for (const spec of Object.values(specs) as any[]) {
    const c = new AgentFactory().governed(spec, contract, facts);
    const s = new PromptWriter(c).system();
    all += echoes(promptLines(c as any, s)).length;
    authored += echoes(promptLines(c as any, s, { skipGenerated: true })).length;
  }
  console.log('rows all', all, '| rows the author can act on', authored);
  expect(true).toBe(true);
}); });
EOF
npx vitest run packages/eval/test/echo.test.ts && rm packages/eval/test/echo.test.ts
```

Expected: the second number far below the first. The audit recorded every surviving row on the last
two authorings as a pair of world sentences — rows an author is told to delete and cannot.

- [ ] **Step 6: Commit**

```bash
git add packages/eval && git commit -m "feat(eval): a desk's lines are the lines it reads, and a generated sentence is not the author's to delete"
```

---

## Task 7: `byteOrigin` — who wrote each prompt byte

Closes: U1, U2, U3, and finding 62.

Every byte this campaign optimised is the contract-rule slice — 14% of the prompt. The other 86%
was read by no lint, and a quarter of it is authored prose sitting in a directory named
`generated/`.

**Files:**
- Modify: `packages/eval/src/lints.ts`, `packages/eval/src/index.ts`
- Test: `packages/eval/test/lints.test.ts`

**Interfaces:**
- Consumes: `SurfaceFacts`, `PromptWriter`, `AgentFactory` from `@looprun-ai/core`.
- Produces:

```typescript
export interface ByteOrigin {
  readonly systemPrefixes: number;   // personas, facts, voice, conduct laws
  readonly worldSentences: number;   // the `does` a GEN phase wrote, once per card that carries it
  readonly schemas: number;          // argument descriptions and JSON structure
  readonly contractRules: number;    // the sentences NORMS wrote
  readonly lanes: readonly string[]; // one row per act, its lane count, and what that costs
}
export function byteOrigin(desks: readonly CompiledDesk[], facts: SurfaceFacts): ByteOrigin
```

- [ ] **Step 1: Write the failing test**

```typescript
describe('byteOrigin', () => {
  test('a world sentence is charged once per card that carries it', () => {
    const facts = { tools: { getAsset: { name: 'getAsset', does: 'x'.repeat(100), schema: {} } } };
    const desk = { guards: [], facts };
    const origin = byteOrigin([desk, desk] as never, facts as never);
    expect(origin.worldSentences).toBe(200);
  });

  test('a contract rule is charged apart from the sentence the world wrote', () => {
    const facts = { tools: { getAsset: { name: 'getAsset', does: 'world', schema: {} } } };
    const desk = { guards: [{ home: 'contract', rule: 'authored', tools: ['getAsset'] }], facts };
    const origin = byteOrigin([desk] as never, facts as never);
    expect(origin.worldSentences).toBe(5);
    expect(origin.contractRules).toBe(8);
  });

  test('an act in more than one lane is a row naming what it costs', () => {
    const facts = { tools: { getAsset: { name: 'getAsset', does: 'x'.repeat(50), schema: {} } } };
    const desk = { guards: [], facts };
    const origin = byteOrigin([desk, desk, desk] as never, facts as never);
    expect(origin.lanes[0]).toContain('getAsset');
    expect(origin.lanes[0]).toContain('3 lanes');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run packages/eval/test/lints.test.ts -t byteOrigin`
Expected: FAIL with `byteOrigin is not defined`.

- [ ] **Step 3: Implement**

```typescript
/** What each slice of the prompt costs, and who wrote it. A world `does` sentence is authored in
 *  the GEN phase and stamped on the card of every desk holding that act; a schema carries the
 *  argument descriptions someone wrote beside its types; a contract rule is the NORMS phase's own.
 *  The lane rows price the desk split: an act in six lanes sends its card six times, and the split
 *  that decides it is made without counting a byte. */
export function byteOrigin(desks: readonly CompiledDesk[], facts: SurfaceFacts): ByteOrigin
```

Sort the lane rows by `does.length × lanes` descending — the top row is the act whose card is worth
shortening most, and the second is the act worth moving out of a lane.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run packages/eval/test/lints.test.ts`
Expected: PASS.

- [ ] **Step 5: Measure the reference and record the baseline**

```bash
cat > packages/eval/test/origin.test.ts <<'EOF'
import { describe, expect, test } from 'vitest';
import { AgentFactory, factsFromWorld } from '@looprun-ai/core';
import { byteOrigin } from '../src/lints.js';
describe('origin', () => { test('atlas-next', async () => {
  const base = '/Users/marcos/Dev/js/looprun/agentspec-bench/subjects/atlas-next';
  const { contract, specs, subjectWorld } = await import(`${base}/subject.ts`);
  const facts = factsFromWorld(subjectWorld);
  const desks = (Object.values(specs) as any[]).map(s => new AgentFactory().governed(s, contract, facts));
  const o = byteOrigin(desks as any, facts);
  console.log(JSON.stringify({ ...o, lanes: o.lanes.slice(0, 5) }, null, 1));
  expect(o.contractRules).toBeGreaterThan(0);
}); });
EOF
npx vitest run packages/eval/test/origin.test.ts && rm packages/eval/test/origin.test.ts
```

Expected, on the hand-authored reference: the contract-rule slice well under a fifth of the total,
and the world sentences and schemas together over half. Record the four numbers in the commit body.
They are the baseline the semantic reduction spec opens from.

- [ ] **Step 6: Print it in the render phase**

`norms.md` N6 prints these four numbers per subject beside the two it already prints. The author
reads them; nothing gates on them yet, because no bar has been set for a slice nobody has measured.

- [ ] **Step 7: Commit**

```bash
git add packages/eval && git commit -m "feat(eval): every prompt byte, by the phase that wrote it, and what a lane costs"
```

---

## Task 8: The one gate file

Closes: F4, C7, C8, C9, C10, C12, and findings 45, 58, 61.

**Files:**
- Create: `packages/eval/src/gate.ts`
- Modify: `packages/eval/src/index.ts`
- Modify: `agentspec/package.json:9-12`
- Test: `packages/eval/test/gate.test.ts`

**Interfaces:**
- Consumes: every verb from Tasks 1–7, plus the shipped `purity`, `nameGate`, `pairing`, `profile`, `unlicensed`, `doubleStated`, `inertChecks`, `ruleCopies`.
- Produces: `runGate(subjectDir: string, subject): readonly LintFinding[]` — the single list.

- [ ] **Step 1: Write the failing test**

```typescript
describe('runGate', () => {
  test('it runs every verb that returns findings, and names each in its own row', () => {
    const findings = runGate(FIXTURE_DIR, FIXTURE_SUBJECT);
    const codes = new Set(findings.map(f => f.code));
    expect(codes.has('SUBJECT_REGEX')).toBe(true);
    expect(codes.has('COVERS_UNRESOLVED')).toBe(true);
    expect(codes.has('CHECK_INERT')).toBe(true);
  });

  test('a sound subject returns an empty list', () => {
    expect(runGate(SOUND_DIR, SOUND_SUBJECT)).toEqual([]);
  });
});
```

Build `FIXTURE_DIR` as a subject carrying one defect per verb, so the test proves the gate reaches
every verb rather than that any one of them works.

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run packages/eval/test/gate.test.ts`
Expected: FAIL with `runGate is not defined`.

- [ ] **Step 3: Implement**

```typescript
/** The static gate: every verb, one list, one answer. It runs in under a second on a thirty-act
 *  subject, which is why nothing downstream of it is worth spending a model call on until it is
 *  empty. The two row-shaped verbs — doubleStated and echoes — are not here: they return questions
 *  an author answers, and a question is not a failure. */
export function runGate(subjectDir: string, subject: Subject): readonly LintFinding[]
```

- [ ] **Step 4: Fix the repo's dead lint scripts**

`agentspec/package.json:9-12` declares four lint scripts and three point at files that do not
exist. Replace them with one script invoking the gate.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run packages/eval/test/gate.test.ts && pnpm build && npx vitest run --silent`
Expected: the gate tests pass, and the suite shows no new failures beyond the three pre-existing red files.

- [ ] **Step 6: Commit**

```bash
git add packages/eval && cd ../agentspec && git add package.json && git commit -m "chore: the declared lint scripts point at files that exist"
cd ../looprun && git commit -m "feat(eval): one gate, every verb, one list"
```

---

## Task 9: `packages/emit` — the package, and the declaration reader

Closes: F1 (first half), S1.

**Files:**
- Create: `packages/emit/package.json`, `packages/emit/tsconfig.json`, `packages/emit/src/index.ts`, `packages/emit/src/declaration.ts`
- Test: `packages/emit/test/declaration.test.ts`

**Interfaces:**
- Produces:

```typescript
export interface Declaration {
  readonly contract: {
    readonly name: string;
    readonly voice: string;
    readonly facts: readonly string[];
    readonly guards: readonly DeclaredGuard[];
    readonly disclosure: Readonly<Record<string, DeclaredDisclosure>>;
    readonly secrets?: readonly string[];
    readonly limits?: Readonly<Record<string, number>>;
  };
  readonly desks: readonly {
    readonly name: string;
    readonly persona: string;
    readonly tools: readonly string[];
    readonly teammates?: Readonly<Record<string, string>>;
    readonly conduct: Readonly<Record<string, string>>;
  }[];
}
export interface DeclaredGuard {
  readonly name: string;
  readonly acts: readonly string[];
  readonly factory: 'onlyAfter' | 'precondition' | 'valueFromUser' | 'argFormat' | 'cap' | 'deny';
  readonly args?: Readonly<Record<string, unknown>>;
  readonly rule?: string;
  readonly wide?: 'oneLawEveryAct' | 'sameRefusal';
}
export function readDeclaration(path: string): Declaration
```

- [ ] **Step 1: Scaffold the package**

```bash
mkdir -p packages/emit/src packages/emit/test
```

`packages/emit/package.json`:

```json
{
  "name": "@looprun-ai/emit",
  "version": "0.20.0",
  "type": "module",
  "description": "looprun emit: one YAML declaration of business sentences in, every line of a subject's TypeScript out. The emitter writes no sentence — a declaration missing a rule is an error, never a default.",
  "license": "Apache-2.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": { "looprun-emit": "./dist/cli.js" },
  "scripts": { "build": "tsc -p tsconfig.json", "test": "vitest run" },
  "dependencies": {
    "@looprun-ai/core": "workspace:^",
    "@looprun-ai/eval": "workspace:^",
    "yaml": "^2.6.0"
  },
  "devDependencies": { "typescript": "^5.7.0", "vitest": "^2.0.0" },
  "engines": { "node": ">=20" }
}
```

Copy `packages/eval/tsconfig.json` and change only its `include`.

- [ ] **Step 2: Write the failing test**

```typescript
describe('readDeclaration', () => {
  test('it reads a desk and its conduct laws', () => {
    const d = readDeclaration(fixture(`
contract:
  name: seaside-hotel
  voice: Warm, brief, and exact about dates and money.
  facts: ['Check-in is from 15:00.']
  guards: []
  disclosure: {}
desks:
  - name: front-desk
    persona: The front desk.
    tools: [getBooking, moveBooking]
    conduct:
      declareHonestly: Say what ran and what did not.
`));
    expect(d.desks[0].tools).toEqual(['getBooking', 'moveBooking']);
    expect(d.desks[0].conduct.declareHonestly).toBe('Say what ran and what did not.');
  });

  test('a desk with no conduct is an error naming the line', () => {
    expect(() => readDeclaration(fixture(`
contract: { name: x, voice: v, facts: [], guards: [], disclosure: {} }
desks:
  - name: front-desk
    persona: p
    tools: [getBooking]
`))).toThrow(/desks\[0\].*conduct/);
  });
});
```

- [ ] **Step 3: Run and watch it fail**

Run: `cd packages/emit && npx vitest run`
Expected: FAIL — the module does not exist.

- [ ] **Step 4: Implement the reader**

Parse with `yaml`'s `parseDocument` so a failure carries a line and column, and validate every
required field, throwing an `Error` whose message names the path and the line.

- [ ] **Step 5: Run the tests**

Run: `cd packages/emit && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/looprun
git add packages/emit pnpm-lock.yaml && git commit -m "feat(emit): one YAML declaration of business sentences, read and validated by line"
```

---

## Task 10: `against-surface` — every refusal the emitter owes

Closes: F1 (second half), G-B, G-C, V1, V5, V6, and the emitter half of C1 and G-A.

**Files:**
- Create: `packages/emit/src/against-surface.ts`
- Test: `packages/emit/test/against-surface.test.ts`

**Interfaces:**
- Consumes: `Declaration` from Task 9; `SurfaceFacts` from `@looprun-ai/core`.
- Produces: `checkAgainstSurface(declaration: Declaration, facts: SurfaceFacts): readonly string[]` — an empty array, or one sentence per refusal.

- [ ] **Step 1: Write the failing test — one case per refusal**

```typescript
const FACTS = { tools: {
  issueRefund: { name: 'issueRefund', effect: 'destructive', target: 'invoiceId', entity: 'invoices', schema: {} },
  getInvoice:  { name: 'getInvoice',  effect: 'read', target: 'invoiceId', entity: 'invoices', schema: { properties: { invoiceId: {} } } },
  closeBooking:{ name: 'closeBooking',effect: 'write', target: null, entity: 'auditLog', schema: {} }
} } as never;

test('an act the surface does not declare', () => {
  expect(checkAgainstSurface(decl({ guards: [{ name: 'g', acts: ['getInvioce'], factory: 'onlyAfter' }] }), FACTS))
    .toEqual([expect.stringContaining("the surface declares no such act")]);
});

test('a destructive act with no before', () => {
  expect(checkAgainstSurface(decl({ disclosure: {} }), FACTS))
    .toEqual([expect.stringContaining("issueRefund is destructive and declares no `before`")]);
});

test('a precondition reading the record over an act with no target', () => {
  expect(checkAgainstSurface(decl({ guards: [{ name: 'g', acts: ['closeBooking'], factory: 'precondition',
                                               args: { reads: 'record' } }] }), FACTS))
    .toEqual([expect.stringContaining("declares no target")]);
});

test('a conduct law missing from one desk', () => {
  expect(checkAgainstSurface(decl({ desks: [
    { name: 'a', persona: 'p', tools: ['issueRefund'], conduct: { declareHonestly: 'x', oneQuestion: 'y' } },
    { name: 'b', persona: 'p', tools: ['getInvoice'],  conduct: { declareHonestly: 'x' } }] }), FACTS))
    .toEqual([expect.stringContaining("'oneQuestion' is on 1 desk and missing from b")]);
});

test('a disclosure alias whose read cannot answer from the held call', () => {
  expect(checkAgainstSurface(decl({ disclosure: { issueRefund: {
    needs: { invoice: 'getInvoice' }, before: 'x' } } }), { tools: {
      ...(FACTS as never as { tools: Record<string, unknown> }).tools,
      getInvoice: { name: 'getInvoice', effect: 'read', target: 'holdId', entity: 'holds', schema: { properties: { holdId: {} } } }
    } } as never))
    .toEqual([expect.stringContaining("needs getInvoice to accept")]);
});

test('a sound declaration refuses nothing', () => {
  expect(checkAgainstSurface(soundDeclaration(), FACTS)).toEqual([]);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd packages/emit && npx vitest run test/against-surface.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement**

One function per refusal, each returning `string | null`, composed into an array. Each sentence
names the declaration path and what to do instead.

- [ ] **Step 4: Run the tests**

Run: `cd packages/emit && npx vitest run`
Expected: PASS, all six.

- [ ] **Step 5: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/looprun
git add packages/emit && git commit -m "feat(emit): the surface answers what a type cannot — an act that does not exist, a consent with no figure, a record that is never there"
```

---

## Task 11: `write-cards` — the emitter writes the TypeScript

Closes: F1 (third half), F2, S5.

**Files:**
- Create: `packages/emit/src/write-cards.ts`
- Test: `packages/emit/test/write-cards.test.ts`

**Interfaces:**
- Consumes: `Declaration`, `SurfaceFacts`.
- Produces: `writeCards(declaration: Declaration, facts: SurfaceFacts): string` — the full text of `cards.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
test('every conduct law is emitted onto every desk, from one text', () => {
  const out = writeCards(decl({ desks: [
    { name: 'billing', persona: 'p1', tools: ['issueRefund'], conduct: { declareHonestly: 'Say what ran.' } },
    { name: 'claims',  persona: 'p2', tools: ['getInvoice'],  conduct: { declareHonestly: 'Say what ran.' } }
  ] }), FACTS);
  expect(out.match(/Say what ran\./g)).toHaveLength(2);
});

test('the WHY map is emitted from the declaration\'s own law names', () => {
  const out = writeCards(decl({ desks: [{ name: 'billing', persona: 'p', tools: ['issueRefund'],
                                          conduct: { declareHonestly: 'x' } }] }), FACTS);
  expect(out).toContain('export const WHY = {');
  expect(out).toContain("declareHonestly: 'conduct'");
});

test('it emits no sentence of its own', () => {
  const out = writeCards(soundDeclaration(), FACTS);
  for (const line of out.split('\n')) {
    const quoted = line.match(/'([^']{40,})'/);
    if (quoted) expect(declaredSentences()).toContain(quoted[1]);
  }
});

test('the output compiles', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cards-'));
  writeFileSync(join(dir, 'cards.ts'), writeCards(soundDeclaration(), FACTS));
  expect(typecheck(dir)).toEqual([]);
});
```

The third test is the one that matters: it asserts the emitter invents no prose, which is the line
between emitting scaffolding and emitting a subject.

- [ ] **Step 2: Run and watch it fail**

Run: `cd packages/emit && npx vitest run test/write-cards.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Emit, in order: the file comment, the imports the declaration actually needs, the `prose` helper,
the `WHY` map derived from the conduct law names, the `WIDE` map derived from each guard's `wide`
field, the `DomainContract`, one `AgentSpec` per desk with `llmParams: { temperature: 0 }`, and the
`SPECS` map.

- [ ] **Step 4: Run the tests**

Run: `cd packages/emit && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/looprun
git add packages/emit && git commit -m "feat(emit): every brace, every import, every licence — and not one sentence"
```

---

## Task 12: `write-artifacts` and the CLI

Closes: S1, S2e, S3, S4, S6, and the emitter half of R14.

**Files:**
- Create: `packages/emit/src/write-artifacts.ts`, `packages/emit/src/cli.ts`
- Test: `packages/emit/test/write-artifacts.test.ts`

**Interfaces:**
- Produces:
  - `writeSubject(): string` — the three lines of `subject.ts`
  - `writeGateFile(): string` — `check-subject.test.ts`, calling `runGate`
  - `writeSeam(subjectDir, facts): string` — `gen/SEAM.md` from `seamCovered`
  - `writeCovers(censusNames): readonly string[]`
  - `writeCensus(declaration, facts): readonly string[]` — the expected census
  - `emit(subjectDir: string): readonly string[]` — the paths written

- [ ] **Step 1: Write the failing test**

```typescript
test('the seam table carries one row per world refusal, third column empty', () => {
  const md = writeSeam(FIXTURE_DIR, FACTS);
  expect(md).toContain('| act | code | guard | the sentence the operator needs |');
  expect(md.split('\n').filter(l => l.startsWith('| ')).length).toBeGreaterThan(1);
});

test('the expected census names every guard the declaration mints', () => {
  const names = writeCensus(decl({ guards: [{ name: 'refundReadsTheInvoice', acts: ['issueRefund'],
                                              factory: 'onlyAfter', args: { after: 'getInvoice' } }] }), FACTS);
  expect(names).toContain('refundReadsTheInvoice');
});

test('emit writes every artifact and returns their paths', () => {
  const written = emit(FIXTURE_DIR);
  expect(written.map(p => basename(p)).sort())
    .toEqual(['SEAM.md', 'cards.ts', 'check-subject.test.ts', 'subject.ts']);
});

test('emit refuses rather than writing, when the surface refuses', () => {
  expect(() => emit(BROKEN_DIR)).toThrow(/the surface declares no such act/);
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd packages/emit && npx vitest run test/write-artifacts.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement, and write the CLI**

`cli.ts` reads `process.argv[2]`, calls `emit`, prints each path written, and exits 1 with every
refusal sentence on its own line when the declaration does not fit the surface.

- [ ] **Step 4: Run the tests and the CLI**

```bash
cd packages/emit && npx vitest run && cd ../.. && pnpm build
node packages/emit/dist/cli.js packages/emit/test/fixtures/sound
```

Expected: four paths printed.

- [ ] **Step 5: Commit**

```bash
git add packages/emit && git commit -m "feat(emit): the seam, the census, the gate file and the door — and a refusal writes nothing"
```

---

## Task 13: `guard-catalog.md` becomes a lookup

Closes: F5, D1, D4, and findings 4, 77.

**Files:**
- Modify: `agentspec/skill/references/guard-catalog.md`
- Create: `agentspec/skill/references/guard-catalog-lessons.md`
- Modify: `agentspec/skill/references/norms.md`, `agentspec/skill/SKILL.md`

- [ ] **Step 1: Measure the starting point**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec/skill
wc -c SKILL.md references/*.md | sort -rn | head -5
```

Record the total. `guard-catalog.md` is 42% of it.

- [ ] **Step 2: Move the lessons**

Cut `## 6 · Seventeen lessons` in full into `references/guard-catalog-lessons.md` with a one-line
header naming what it is. Lesson 17 does not travel — it is an exam-authoring law and moves to
`references/evals.md` §2 instead, per D4.

- [ ] **Step 3: Rename the three counters D4 touches**

`guard-catalog.md`'s section heading, `norms.md:192`, and `SKILL.md:54` each name a lesson count.
All three become a pointer to the lessons page and carry no number.

- [ ] **Step 4: Delete the five duplications**

Remove `norms.md` N5's laws 2–6 (D1) — law 1 stays, it is `norms.md`'s alone — the duplicated
`### guards on the spec` block at N4 (D2), and the conduct-rules restatement (D3), replacing each
with a pointer that carries no count.

- [ ] **Step 5: Verify the reading path shrank and nothing dangles**

```bash
wc -c SKILL.md references/*.md | tail -1
grep -rn "guard-catalog.md#" SKILL.md references/*.md | head
node skill/scripts/lint-stage-names.mjs
```

Expected: the total down by roughly 4.5 KB on the run path, no anchor pointing at a moved heading.

- [ ] **Step 6: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
git add skill && git commit -m "docs(skill): the catalog is a lookup, the lessons are read once, and nothing is stated twice"
```

---

## Task 14: `guard-contexts.md` — the four contexts, every field

Closes: G-D, and findings 13, 27.

Two independent blind authors read `packages/core/src/contract/vocabulary.ts` to write a `deny`.
This page is what they were looking for.

**Files:**
- Create: `agentspec/skill/references/guard-contexts.md`
- Modify: `agentspec/skill/references/guard-catalog.md`

- [ ] **Step 1: Read the source of truth**

```bash
sed -n '110,145p' /Users/marcos/Dev/js/looprun/looprun/packages/core/src/contract/vocabulary.ts
```

- [ ] **Step 2: Write the page**

One section per context — `InputCtx`, `CallCtx`, `ResultCtx`, `ReplyCtx` — each naming every field
with its type, and each followed by one worked `deny` that reads that context and returns a refusal
sentence. The `CallCtx` example is the shape both authors had to invent:

```typescript
{ name: 'closingIsTheLastStep', on: 'preTool', tool: ['closeBooking'],
  deny: raw => {
    const ctx = raw as CallCtx;
    const row = ctx.state?.bookings?.[String(ctx.call.args.bookingId)];
    return row?.paid === true ? null : 'the invoice on that booking is not paid';
  } }
```

State the type the guard object needs and that `Guard` is importable from `@looprun-ai/core`, which
closes finding 13 — the hand-rolled structural cast.

- [ ] **Step 3: Link it**

`guard-catalog.md`'s configuration section gains one line pointing at the page, beside the sentence
that introduces a hand-written `deny`.

- [ ] **Step 4: Verify every field named exists**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
grep -oE '^\| `[a-zA-Z.]+`' skill/references/guard-contexts.md | tr -d '|` ' | sort -u > /tmp/named.txt
grep -oE '\breadonly [a-zA-Z]+' /Users/marcos/Dev/js/looprun/looprun/packages/core/src/contract/vocabulary.ts | awk '{print $2}' | sort -u > /tmp/real.txt
comm -23 /tmp/named.txt /tmp/real.txt
```

Expected: empty output — every field the page names exists in the engine.

- [ ] **Step 5: Commit**

```bash
git add skill && git commit -m "docs(skill): the four contexts a guard is handed, every field, one worked refusal each"
```

---

## Task 15: `spec-template.ts` passes the gate it is copied into

Closes: R3, R4, and findings 7, 9, 16, 18, 19, 20, 23, 35, 56, 60, 66, 69, 74.

Thirteen findings converge here. The template the skill hands an author is red under two lints the
skill's own gate requires empty, from the moment it is copied.

**Files:**
- Modify: `agentspec/skill/references/spec-template.ts`
- Test: `packages/eval/test/template.test.ts`

- [ ] **Step 1: Write the failing test — the template is the subject**

```typescript
describe('the template the skill hands an author', () => {
  const dir = '/Users/marcos/Dev/js/looprun/agentspec/skill/references';

  test('its WHY map licenses every rule it mints, and no rule it does not', () => {
    expect(unlicensed(dir)).toEqual([]);
  });

  test('no rule sits on the contract without an act', () => {
    expect(pairing(dir).filter(f => f.code === 'RULE_NEVER_RENDERED')).toEqual([]);
  });

  test('every acting tool it declares carries a check', () => {
    expect(profile(dir, ['plantSeedling', 'discardPlant']).unchecked).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd /Users/marcos/Dev/js/looprun/looprun && npx vitest run packages/eval/test/template.test.ts`
Expected: FAIL — seven `PROSE_UNLICENSED`, at least one `RULE_NEVER_RENDERED`, and one unchecked act.

- [ ] **Step 3: Fix the template**

Rewrite the `WHY` map from the names the file's own `prose(...)` calls mint. Move
`noSpeciesGuessing` onto the specs, which is where the catalog says a law naming no act belongs.
Give the `care` desk's write a deterministic check. Correct the disclosure that refuses
`discardPlant` on the record its own rule requires. Write six conduct laws, not four.

- [ ] **Step 4: Run the test**

Run: `npx vitest run packages/eval/test/template.test.ts`
Expected: PASS, all three.

- [ ] **Step 5: Commit**

```bash
git add packages/eval/test/template.test.ts && git commit -m "test(eval): the template an author copies is held to the gate it is copied into"
cd /Users/marcos/Dev/js/looprun/agentspec && git add skill && git commit -m "docs(skill): the worked template passes the gate on arrival"
```

---

## Task 16: `norms.md` N6 prints and signs

Closes: X6, C11, F3, V2, V3, V7, and findings 11, 14, 44, 57, 64.

**Files:**
- Modify: `agentspec/skill/references/norms.md`

- [ ] **Step 1: Prove the printed snippet runs, exactly as printed**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec/skill/references
sed -n '/```typescript/,/```/p' norms.md | sed '1d;$d' > /tmp/n6.ts
cp /tmp/n6.ts /Users/marcos/Dev/js/looprun/looprun/packages/eval/test/n6-snippet.test.ts
cd /Users/marcos/Dev/js/looprun/looprun && npx vitest run packages/eval/test/n6-snippet.test.ts
```

Expected: FAIL — `promptLines` is used and never imported, and two imported verbs are never used.

- [ ] **Step 2: Rewrite the snippet so it runs**

Import exactly the verbs the checklist below it calls, from the packages that export them, and pass
each its real arguments. Then re-run Step 1 and watch it pass. Delete the scratch test.

- [ ] **Step 3: Replace the hand judgements with the verbs**

Four checklist lines become calls: `inertChecks`, `profile`, `unlicensed`, `pairing` — all inside
`runGate`. The N6 checklist keeps only what a verb cannot answer: `doubleStated`, `echoes`,
`ruleCopies` and `boilerplate`, each a list of questions the author answers in writing.

- [ ] **Step 4: Delete the hand byte count**

X6 — the two byte totals stay, and the author stops counting them. The snippet already computes
`pw.system().length` and the sum over `pw.toolCards()`.

- [ ] **Step 5: Three rows the render gate never had**

V7 — the 2x line says "tool-card bytes" and the snippet prints `name → does`; a card also carries a
schema the model reads. Counting schemas puts every desk far past 2x. State which of the two the
line means, and have the snippet print that number.

V3 — a law enforced by `secrets` or a rewrite reaches no prompt. The channel lines ask about guards
only. Add a row: name every law enforced at the seam, and say whether the model is meant to read it.

V2 — a guard deliberately NOT written has nowhere to be recorded. `onlyAfter` pins one prerequisite,
and where two reads both ground a value, pinning one fails the run that used the other. Add a row to
`norms/RENDER.md`: the act, the guard not written, and why.

- [ ] **Step 6: Delete the thinking-log paste**

N4 orders `pairingTable` output pasted into a log nothing reads (finding 64). The artifact is the
gate's own output.

- [ ] **Step 7: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec
git add skill && git commit -m "docs(skill): the render phase prints what the model reads, and every judgement a verb can make is made by one"
```

---

## Task 17: The bar, the pipeline table, and the remaining page fixes

Closes: R1, R2, R6, R7, R10, R13, R14, R15, D6, G-F, G-G, W1, W2, W3, F6, and findings 1, 5, 12, 21, 22, 25, 29, 32, 37, 38, 41, 46, 48, 49, 51, 52, 63, 70, 73, 78, 79.

**Files:**
- Modify: `agentspec/skill/SKILL.md`, `references/ship.md`, `references/test.md`, `references/gen.md`, `references/ask.md`, `references/evals.md`, `references/norms.md`, `references/thinking-template.md`

- [ ] **Step 1: The bar is 0.95, in one home**

`ship.md:12` and `:33` call `certify` with 0.85 while `SKILL.md:47` and `test.md:73` say 0.95.
Change `ship.md`. Then make "holding across two runs" enforceable: state that two repetitions each
reach the bar, not that the union of their failures does.

```bash
cd /Users/marcos/Dev/js/looprun/agentspec/skill
grep -rn "0\.85\|0\.95" SKILL.md references/*.md
```

Expected after the edit: every hit reads 0.95.

- [ ] **Step 2: The panel carries every phase**

`SKILL.md:102-109`'s panel template has no G3 row and no N6 row, and drops three ASK sub-stages.
Add them, in the order `SKILL.md:39` and `ask.md` both use. This is the defect that makes a resumed
run skip a phase.

- [ ] **Step 3: The paths are the loader's paths**

`SKILL.md:21-29` names four files the pipeline produces; `SubjectLoader` reads a different set.
Rewrite the block from what the loader opens, and name `subject.ts` and `subjectWorld` as the door.

- [ ] **Step 4: N1's input exists**

`norms.md:57` declares `gen/WORLD-MODEL.md`, produced by no stage. N1's input is the world card.

- [ ] **Step 5: A gate has no `detail`**

Five places tell an author to write a gate's `detail`; the engine's `Gate` type has no such field.
A custom executor's `{ refuse: … }` carries the sentence. Correct all five.

- [ ] **Step 6: English, and the RAM tiers**

`ask.md:29-30` states the option-label rule in Portuguese — a house-law violation. Translate it, and
say plainly that the validation the original wording carried does not travel. Add the missing
`ram32` tier at `ask.md:15`.

- [ ] **Step 7: The two stale mechanism sentences**

G-F — `guard-catalog.md` says `precondition` names itself after its FIRST tool; `catalog.ts:367`
mints `precondition:${tools.join('+')}`. Correct the mechanism, keep the warning: two gates over
the same act set mint the identical name, nothing throws, and `census` clears both rows when either
fires.

G-G — the surface count. "31 tools" is the ACTING count; this world card declares 54 (23 reads, 16
writes, 15 destructive). Say which number a phase means, wherever a count appears.

- [ ] **Step 8: The three the audit's own fix list lost**

W1 — the invariant heading is verbatim in `evals.md:74` and the lessons page; keep one.
W2 — `gen.md:61-62` omits `make`, the one form whose argument is not the target; add it.
W3 — the unfillable-tense law is unconditional at `norms.md:301` and conditional at `:325`; the
engine refuses the held call, so the unconditional reading wins.

- [ ] **Step 9: The thinking log names its real consumers**

`thinking-template.md:22-23` claims three consumers and one exists. Name the real ones: the next
stage reads §Saw and §Decided, EVALS collects §Seeds, and a resumed run reads all four.

- [ ] **Step 10: Verify no contradiction survives**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec/skill
grep -rn "four conduct\|six conduct" SKILL.md references/*.md
grep -rn "detail" references/gen.md references/norms.md | grep -i gate
grep -rniE "[à-ú]" references/ask.md
```

Expected: one count everywhere, no gate `detail`, no non-English character.

- [ ] **Step 11: Commit**

```bash
git add skill && git commit -m "docs(skill): one bar, one panel, the loader's own paths, and the three the audit dropped"
```

---

## Task 18: TIER 1 — the hotel, end to end

Closes: the spec's §4 TIER 1. Nothing reaches the Atlas until this is green.

**Files:**
- Create: `agentspec-bench/subjects/hotel/declaration.yaml`, `agentspec-bench/subjects/hotel/world.ts`
- Test: the emitted `check-subject.test.ts`

**Interfaces:**
- Consumes: `emit` from Task 12, `runGate` from Task 8.

- [ ] **Step 1: Stage the surface**

```bash
mkdir -p /Users/marcos/Dev/js/looprun/agentspec-bench/subjects/hotel
cp /Users/marcos/Dev/js/looprun/looprun/docs/tutorial/snippets/hotel/world.ts \
   /Users/marcos/Dev/js/looprun/agentspec-bench/subjects/hotel/
cp /Users/marcos/Dev/js/looprun/looprun/docs/tutorial/snippets/hotel/exam.ts \
   /Users/marcos/Dev/js/looprun/agentspec-bench/subjects/hotel/cases.ts
```

- [ ] **Step 2: Write the declaration**

`declaration.yaml` carrying the hotel's business: a booking moves only while confirmed; cancelling
inside 24 hours keeps the first night and the guest hears what stays owed; the desk promises no
upgrade; a card number is never spoken back; the day is the guest's to choose.

- [ ] **Step 3: Emit, and read every refusal**

```bash
cd /Users/marcos/Dev/js/looprun/looprun && pnpm build
node packages/emit/dist/cli.js /Users/marcos/Dev/js/looprun/agentspec-bench/subjects/hotel
```

Expected on the first run: refusals. Fix the declaration, never the emitter, until it writes.

- [ ] **Step 4: Run the emitted gate**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec-bench/subjects/hotel
npx vitest run check-subject.test.ts
```

Expected: green.

- [ ] **Step 5: Run the exam and judge it**

```bash
set -a && . /Users/marcos/Dev/js/looprun/agentspec-bench/.env.local && set +a
cd /Users/marcos/Dev/js/looprun/looprun/packages/eval
RUN_ATLAS_SUBJECT=hotel RUN_ATLAS=all RUN_ATLAS_STAMP=2026-08-20-hotel \
  RUN_ATLAS_REP=rep1 RUN_ATLAS_VARIANT=governed npx vitest run test/atlas-run.test.ts
```

Then read `judge-input.part*.jsonl` yourself and write `verdicts.jsonl`. No script calls a model to
judge; the agent in the session is the judge.

- [ ] **Step 6: Record the numbers**

Write `agentspec-bench/subjects/hotel/RESULT.md`: the wall clock from declaration to green gate, the
prompt bytes per desk, and the judged score. This is the evidence TIER 2 is entered on.

- [ ] **Step 7: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec-bench
git add subjects/hotel && git commit -m "test(bench): the five-act surface, declared and emitted end to end"
```

---

## Task 19: TIER 2 — the Atlas, and the four bars

Closes: the spec's §3.2, and B6 — the speed bar, as 1.5 minutes per desk. Entered only when Task 17 is green.

**Files:**
- Create: `agentspec-bench/subjects/atlas-emit/declaration.yaml`
- Test: `packages/eval/test/atlas-bars.test.ts`

- [ ] **Step 1: Stage the surface**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec-bench/subjects
mkdir -p atlas-emit
cp -r atlas-next/ask atlas-next/generated atlas-next/world.ts atlas-next/world-kit.ts atlas-next/cases.ts atlas-emit/
```

`cards.ts` and `subject.ts` are NOT copied — the emitter writes both.

- [ ] **Step 2: Author the declaration, blind**

The declaration is authored by an agent that has read only the skill's pages, the world card and the
cases. It reads no existing `cards.ts` and no `declaration.yaml` from another subject. Record the
wall clock from its first tool call to the green gate.

- [ ] **Step 3: Emit and gate**

```bash
cd /Users/marcos/Dev/js/looprun/looprun && pnpm build
node packages/emit/dist/cli.js /Users/marcos/Dev/js/looprun/agentspec-bench/subjects/atlas-emit
cd /Users/marcos/Dev/js/looprun/agentspec-bench/subjects/atlas-emit && npx vitest run check-subject.test.ts
```

Expected: green.

- [ ] **Step 4: Measure the static bars**

Add `atlas-emit` to `SUBJECTS` in `packages/eval/test/atlas-bars.test.ts` and run it.

```bash
cd /Users/marcos/Dev/js/looprun/looprun && npx vitest run packages/eval/test/atlas-bars.test.ts
```

Expected:

```
  prompt        ≤ 109 492 B      the reference's 99 538 plus ten per cent
  checks        ≥ 58
  acting        31/31, unchecked 0
```

If prompt is over, the fix is in the skill's pages, never in the emitted `cards.ts`.

- [ ] **Step 5: Run the hundred, twice, and judge every row**

```bash
set -a && . /Users/marcos/Dev/js/looprun/agentspec-bench/.env.local && set +a
cd /Users/marcos/Dev/js/looprun/looprun/packages/eval
for rep in rep1 rep2; do
  RUN_ATLAS_SUBJECT=atlas-emit RUN_ATLAS=all RUN_ATLAS_STAMP=2026-08-20-emit \
    RUN_ATLAS_REP=$rep RUN_ATLAS_VARIANT=governed npx vitest run test/atlas-run.test.ts
done
```

Read every `judge-input.part*.jsonl` and write the verdicts. Run the first ten cases and compare
quality, tokens and cost against `atlas-next` before spending the remaining ninety.

- [ ] **Step 6: Certify**

`certify` counts a case as passing only when the verdict passes AND no invariant fails. Report the
certified number, not the verdict count.

Expected: `0.95` on both repetitions.

- [ ] **Step 7: Record the wall clock**

The bar is 1.5 minutes per desk — 9 minutes for the six, from the author's first tool call to the
green gate.

- [ ] **Step 8: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec-bench
git add subjects/atlas-emit && git commit -m "test(bench): the Atlas, declared and emitted, against the four bars"
```

---

## Task 20: The register check

Closes: the spec's §8.3.

**Files:**
- Create: `packages/eval/test/registers.test.ts`

**Interfaces:**
- Consumes: the spec, the plan, the backlog and the trace map, read as text.

- [ ] **Step 1: Write the test**

```typescript
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string): string => readFileSync(`/Users/marcos/Dev/js/looprun/looprun/${p}`, 'utf8');
const SPEC = read('docs/superpowers/specs/2026-08-20-declaration-and-emitter-design.md');
const PLAN = read('docs/superpowers/plans/2026-08-20-declaration-and-emitter.md');
const BACKLOG = read('docs/analysis/2026-08-20-skill-backlog.md');
const TRACE = read('docs/analysis/2026-08-20-finding-trace.md');

/** Ids are read from the FIRST COLUMN of a table row, never from prose: a row describing the
 *  SHIP sub-stage S2 contains that literal, and a checker reading free text invents a duplicate
 *  that is not there. */
const firstColumn = (block: string): Set<string> => {
  const out = new Set<string>();
  for (const line of block.split('\n')) {
    const m = /^\| ([A-Za-z0-9 -]+?) \|/.exec(line);
    if (!m) continue;
    for (const id of m[1].split(' ')) if (/^([A-Z]+\d+[a-z]?|G-[A-H])$/.test(id)) out.add(id);
  }
  return out;
};

const IN = firstColumn(SPEC.split('### 8.1')[1].split('### 8.2')[0]);
const OUT = firstColumn(SPEC.split('### 8.2')[1].split('### 8.3')[0]);

describe('the registers', () => {
  test('no id sits in both columns', () => {
    expect([...IN].filter(id => OUT.has(id))).toEqual([]);
  });

  test('every IN id has a plan task', () => {
    expect([...IN].filter(id => !new RegExp(`\\b${id}\\b`).test(PLAN))).toEqual([]);
  });

  test('every OUT id is in the backlog\'s deferred section', () => {
    const deferred = BACKLOG.split('## Deferred by the declaration spec')[1] ?? '';
    expect([...OUT].filter(id => !new RegExp(`\\b${id}\\b`).test(deferred))).toEqual([]);
  });

  test('every finding in the map carries an id from one of the two columns', () => {
    const headings = [...TRACE.matchAll(/^## ([A-Z]+\d+[a-z]?|G-[A-H]|W\d) —/gm)].map(m => m[1]);
    expect(headings.filter(id => !IN.has(id) && !OUT.has(id))).toEqual([]);
  });

  test('the map accounts for all eighty survivors', () => {
    expect(TRACE.split('\n').filter(l => /^\| \d+ \|/.test(l))).toHaveLength(80);
  });
});
```

- [ ] **Step 2: Run it**

Run: `cd /Users/marcos/Dev/js/looprun/looprun && npx vitest run packages/eval/test/registers.test.ts`
Expected: PASS, all five. A failure names the id that fell out of the registers.

- [ ] **Step 3: Commit**

```bash
git add packages/eval/test/registers.test.ts && git commit -m "test(eval): an id lives in exactly one register, and eighty findings each carry one"
```

---

## Task 21: The documentation

Closes: the spec's §6.

**Files:**
- Modify: `README.md`, `docs/tutorial/04-guards.md`, `docs/analysis/2026-08-20-skill-backlog.md`
- Create: `packages/emit/README.md`

- [ ] **Step 1: The quickstart carries EMIT**

`README.md` gains the emit step between authoring and running.

- [ ] **Step 2: The tutorial carries the channel law**

`docs/tutorial/04-guards.md` states where a rule is written and whether it is read: a spec guard
reaches the system prefix every turn, a contract guard is stamped on the card of every act it names,
a contract guard naming no act renders nowhere, and a judged guard renders nowhere at all.

- [ ] **Step 3: `packages/emit/README.md`**

The declaration shape, and every refusal with its message.

- [ ] **Step 4: Strike the closed backlog items**

Every id this plan closed is struck through in `docs/analysis/2026-08-20-skill-backlog.md`, with the
commit that closed it named.

- [ ] **Step 5: Verify the tutorial still compiles**

```bash
cd /Users/marcos/Dev/js/looprun/looprun/docs/tutorial/snippets && npx vitest run && npx tsc --noEmit
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/looprun
git add README.md docs packages/emit/README.md && git commit -m "docs: where a rule is written decides whether it is read"
```

---

## Self-review

**Spec coverage.** §1 measurement → Tasks 17, 18 re-measure it. §2 shape → Tasks 8–11. §3.1
mechanisms → Tasks 1, 2, 4, 5, 6, 12, 15. §3.2 bars → Task 18. §4 tiers → Tasks 17, 18. §5
implementation → Tasks 1–11. §6 documentation → Task 20. §7 skill → Tasks 12–16. §8 registers →
Task 19.

**Ids with no task.** Every id in §8.1 appears in a task's "Closes:" line, and Task 19 asserts it
mechanically rather than by inspection.

**Type consistency.** `runGate(subjectDir, subject)` is defined in Task 7 and called by the file
Task 11 emits. `promptLines(compiled, system, options?)` is widened in Task 6 and used by Task 15's
snippet. `Declaration` is defined in Task 8 and consumed unchanged by Tasks 9, 10, 11.

**A risk this plan carries.** Task 18's wall-clock bar is a target set against one measured
authoring, not a prediction. If the emitted path lands at twelve minutes rather than nine, the
finding is the number, and the decision on whether nine was the right bar is the user's.
