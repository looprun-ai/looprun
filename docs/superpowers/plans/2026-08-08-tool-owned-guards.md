# Tool-Owned Guards Implementation Plan

> **CLOSED — 2026-08-08.** All 9 tasks executed inline and merged to `main`; released as
> **v0.17.0** (tag on origin). Proof record:
> `governance/proofs/2026-08-08-tool-owned-guard-bindings.md`. Follow-ons from the out-of-scope
> table: the agentspec skill shipped (`agentspec` `b9eb9ca`); the atlas work lives on
> `agentspec-bench` `main` (`80f7372` and below), with the `0.17.0` dependency pins still
> uncommitted there at closing time.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guard that governs a tool is declared once on the domain contract and reaches the model in the tool's own description, on both execution paths (world seam and native/MCP).

**Architecture:** The `DomainContract` gains a guard-binding list with named tool sets (`writeTools`, `destructiveTools`); `changeAllowed` becomes an ordinary binding. A new pure function `composeToolDescription(def, spec)` appends the resolved guard prose to a tool's declared description; the mastra backend applies it on the world seam and — via a new wrap of host tools — in native mode, where `toolDefs` becomes required and is reconciled against the live tools at construction. `## Tool rules` then leaves the assembled prompt.

**Tech Stack:** TypeScript, pnpm workspace, vitest, zod v3 + `zod-to-json-schema` (already in the lockfile at 3.25.2).

**Spec:** `docs/superpowers/specs/2026-08-08-tool-owned-guards-design.md` at `ff10a69`.

## Global Constraints

- Everything written to a file is English — code, comments, prose strings, commit messages.
- AS-IS comments only: no "used to", no "kept for compatibility", no test names, no measurements cited in a comment. A comment states what the system IS.
- Pre-1.0: breaking changes land without shims; the old name is deleted in the same commit.
- The clause `has not confirmed this action` in `confirmFirst.check()` must not change — three core tests match it by regex.
- The priority table (`agent 0 · changeAllowed 1 · consent 2 · honesty 3 · always 4`) is unchanged; no tier is added or reordered.
- `ToolTarget` stays `'any' | string[]` — a named set NEVER becomes a `ToolTarget` string (the `String.prototype.includes` substring hazard, spec §3.3).
- Stability tests that read installed bindings or prompt bytes are UPDATED to the new expected values, never relaxed.
- `packages/core` must be rebuilt (`pnpm -C packages/core build`) before running the root test script — `gen-guards-chapter.mjs --check` reads `packages/core/dist`.
- Commit format: `<type>(<scope>): <description>` — scopes used in this repo: `core`, `mastra`, `eval`, `docs`.

## Design decisions taken by this plan (flag to the user if wrong)

1. **Rule format in the description:** spec §3.6 says "`; `-joined" in prose but its normative example shows one `- ` bullet per rule under the heading. This plan follows the example: newline bullets. The "priority order" phrase is honored either way.
2. **`resultInvariant` joins the prose normalization.** Spec §3.1 lists four kinds, but `resultInvariant` (`guards/world.ts`) carries the same positional `prose?` and the section's own rule is "a single convention". It is normalized in the same commit.
3. **§3.9 schema reconciliation across formats:** the file holds JSON Schema; a live Mastra tool holds a zod v3 schema. Equality is defined as deep equality of a canonical PROJECTION (`type`, sorted `properties` keys recursed, sorted `required`, `enum`, `items`) of the file schema vs `zodToJsonSchema(live, { $refStrategy: 'none' })`. The projection ignores prose-level keys (`description`, `$schema`), so authored wording never false-throws, while a renamed argument, a new field, or a changed type does throw.

---

### Task 1: Prose override on `requiresBefore`, normalized to `opts.prose` on all positional kinds

**Files:**
- Modify: `packages/core/src/guards/flow.ts` (`requiresBefore`, `forbidThisTurn`)
- Modify: `packages/core/src/guards/world.ts` (`precondition`, `resultInvariant`)
- Modify: `packages/core/src/guards/catalog.ts` (the four kinds' documented signatures/examples)
- Modify: `packages/core/src/spec.ts:488` (the `precondition(gate.ok, gate.reason, gate.prose)` call — interim update; Task 2 rewrites this block)
- Modify: `packages/eval/src/norms-config.ts` (the `precondition` compiler call site, ~line 241)
- Modify: every test file passing a 3rd positional `prose` argument — grep `precondition(` and `forbidThisTurn(` and `resultInvariant(` across `packages/*/test`; known hits: `packages/core/test/{simulation-is-a-read,agent-spec,runtime,prompt-stability,chains-posttool}.test.ts`, `packages/core/test/proofs/{runtime-consistency,simulation-routes,prompt-provenance}.test.ts`, `packages/core/test/proofs/catalog-{run-output,spatial-input}.ts`, `packages/core/test/redteam/batch-{a,d}.test.ts`, `packages/mastra/test/governance-extras.test.ts`, `packages/mastra/test/proofs/{guard-audit,signal-mechanics}.test.ts`
- Test: `packages/core/test/prose-override.test.ts` (new)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces (later tasks call these exact signatures):
  - `requiresBefore(deps: string[], opts?: { within?: number; prose?: string }): Guard`
  - `forbidThisTurn(reason: string, opts?: { prose?: string }): Guard`
  - `precondition<W>(ok: (world: W) => boolean, reason: string, opts?: { prose?: string }): Guard`
  - `resultInvariant<W>(pred: (result: unknown, world: W) => boolean, reason: string, opts?: { prose?: string }): Guard`

- [x] **Step 1: Write the failing test**

```ts
// packages/core/test/prose-override.test.ts
import { describe, expect, test } from 'vitest';
import { forbidThisTurn, precondition, requiresBefore, resultInvariant } from '../src/guards/index.js';

describe('opts.prose overrides the derived prose on every kind that accepts it', () => {
  test('requiresBefore renders the derived sentence without opts.prose', () => {
    expect(requiresBefore(['getBooking']).prose()).toBe('only after getBooking has run');
  });
  test('requiresBefore renders the author prose when passed', () => {
    const g = requiresBefore(['getBooking'], { prose: 'read the booking first — the record names the asset' });
    expect(g.prose()).toBe('read the booking first — the record names the asset');
  });
  test('requiresBefore check is untouched by the prose option', () => {
    const g = requiresBefore(['getBooking'], { prose: 'x' });
    const deny = g.check({ tool: 'cancelBooking', args: {}, observed: [], turnIndex: 0, world: { toolCalls: [] } } as never);
    expect(deny).toMatch(/getBooking/);
  });
  test('forbidThisTurn takes prose in opts', () => {
    expect(forbidThisTurn('denied', { prose: 'not on this turn' }).prose()).toBe('not on this turn');
    expect(forbidThisTurn('denied').prose()).toBe('do not call this tool in this turn — not even once');
  });
  test('precondition takes prose in opts', () => {
    expect(precondition(() => true, 'account frozen', { prose: 'only while the account is active' }).prose()).toBe('only while the account is active');
    expect(precondition(() => true, 'account frozen').prose()).toBe('account frozen');
  });
  test('resultInvariant takes prose in opts', () => {
    expect(resultInvariant(() => true, 'empty report', { prose: 'the report must hold rows' }).prose()).toBe('the report must hold rows');
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm -C packages/core exec vitest run test/prose-override.test.ts`
Expected: FAIL — `requiresBefore` rejects the second argument shape / `forbidThisTurn` treats the object as a string.

- [x] **Step 3: Change the four factories**

In `flow.ts`:

```ts
export function requiresBefore(deps: string[], opts?: { within?: number; prose?: string }): Guard {
  // ... body unchanged ...
    prose: () => opts?.prose ?? `only after ${deps.join(' → ')} has run`,
```

```ts
export function forbidThisTurn(reason: string, opts?: { prose?: string }): Guard {
  return {
    kind: 'forbidThisTurn',
    dim: 'spatial',
    check: () => reason,
    prose: () => opts?.prose ?? 'do not call this tool in this turn — not even once',
  };
}
```

In `world.ts`, same shape: `precondition(ok, reason, opts?: { prose?: string })` with `prose: () => opts?.prose ?? reason`, and `resultInvariant(pred, reason, opts?: { prose?: string })` with `prose: () => opts?.prose ?? '<existing neutral default>'`. Update each factory's JSDoc to say "pass `opts.prose` to override" — never narrating that the signature changed.

- [x] **Step 4: Update every call site**

`packages/core/src/spec.ts:488`: `precondition(gate.ok, gate.reason, { prose: gate.prose })`.
`packages/eval/src/norms-config.ts` precondition compiler: wrap the third argument the same way.
`packages/core/src/guards/catalog.ts`: the `signature`/`example` strings for the four kinds.
Then `grep -rn "precondition(\|forbidThisTurn(\|resultInvariant(" packages/*/src packages/*/test` and convert every call passing a 3rd positional string to `{ prose: ... }` (calls with 2 args are untouched).

- [x] **Step 5: Run the full core + eval + mastra suites**

Run: `pnpm -C packages/core build && pnpm -C packages/core test && pnpm -C packages/eval test && pnpm -C packages/mastra test`
Expected: PASS (including `guard-catalog-parity.test.ts`).

- [x] **Step 6: Commit**

```bash
git add -A packages
git commit -m "feat(core)!: every prose override arrives as opts.prose, and requiresBefore accepts one"
```

---

### Task 2: `ContractGuardBinding` — the contract declares tool guards; `changeAllowed` becomes one

**Files:**
- Modify: `packages/core/src/assembled-prompt.ts` (add `DeclaredToolSet`, `ContractGuardBinding`, `DomainContract.guards`; DELETE the `changeAllowed` field and its JSDoc)
- Modify: `packages/core/src/spec.ts` (delete the `changeAllowed` install block in `installUniversalAndContractGuards`; add `installContractBindings`; header comment: the id-namespace paragraph gains `tool:`)
- Modify: `packages/core/src/index.ts` (export the two new types)
- Modify: `packages/core/src/guards/catalog.ts:111` (the sentence advising `contract.changeAllowed` now advises the binding form)
- Test: rewrite `packages/core/test/change-allowed.test.ts`; new `packages/core/test/contract-bindings.test.ts`

**Interfaces:**
- Consumes: `precondition(ok, reason, { prose })` from Task 1.
- Produces (later tasks rely on):

```ts
export type DeclaredToolSet = 'writeTools' | 'destructiveTools';
export interface ContractGuardBinding {
  hook: Hook;
  target: string[] | DeclaredToolSet;
  guard: Guard;
  id: string;
  priority?: Priority;        // default 'agent'
  exempt?: string[];          // only with a named set
}
// DomainContract gains:  guards?: ContractGuardBinding[];
// DomainContract loses:  changeAllowed
```

- [x] **Step 1: Write the failing tests**

```ts
// packages/core/test/contract-bindings.test.ts
import { describe, expect, test } from 'vitest';
import { AgentSpecBase, precondition, requiresBefore, resolveBindings } from '../src/index.js';
import type { DomainContract } from '../src/index.js';

const contractWith = (guards: DomainContract['guards']): DomainContract => ({
  voice: 'v', stateBlock: () => '', coreInvariants: [], languageClause: 'English.',
  writeTools: ['cancelBooking', 'chargeDeposit', 'issueRefund', 'getQuoteWrite'],
  guards,
});

const lane = (contract: DomainContract, tools: string[], destructiveTools: string[] = []) =>
  new AgentSpecBase({ id: 'a', mode: 'm', persona: 'p', tools, destructiveTools, contract });

describe('contract guard bindings', () => {
  test('a named set expands to a plain string[] at install time (never a ToolTarget string)', () => {
    const c = contractWith([{ hook: 'preTool', target: 'writeTools', guard: precondition(() => true, 'frozen'), id: 'tool:writeGate' }]);
    const spec = lane(c, ['cancelBooking', 'getBooking']);
    const b = spec.guards.preTool.find((x) => x.id === 'tool:writeGate')!;
    expect(Array.isArray(b.target)).toBe(true);
    expect(b.target).toEqual(['cancelBooking']); // ∩ lane surface
  });
  test('an empty intersection installs nothing', () => {
    const c = contractWith([{ hook: 'preTool', target: 'writeTools', guard: precondition(() => true, 'frozen'), id: 'tool:writeGate' }]);
    const spec = lane(c, ['getBooking']);
    expect(spec.guards.preTool.some((x) => x.id === 'tool:writeGate')).toBe(false);
  });
  test('destructiveTools resolves from the INSTALLING lane', () => {
    const c = contractWith([{ hook: 'preTool', target: 'destructiveTools', guard: requiresBefore(['getAsset']), id: 'tool:readFirst' }]);
    const spec = lane(c, ['retireAsset', 'getAsset'], ['retireAsset']);
    const b = spec.guards.preTool.find((x) => x.id === 'tool:readFirst')!;
    expect(b.target).toEqual(['retireAsset']);
  });
  test('exempt names withdrawn from the set; a stray exempt throws', () => {
    const ok = contractWith([{ hook: 'preTool', target: 'writeTools', exempt: ['getQuoteWrite'], guard: precondition(() => true, 'frozen'), id: 'tool:writeGate' }]);
    expect(lane(ok, ['cancelBooking', 'getQuoteWrite']).guards.preTool.find((x) => x.id === 'tool:writeGate')!.target).toEqual(['cancelBooking']);
    const stray = contractWith([{ hook: 'preTool', target: 'writeTools', exempt: ['notAWrite'], guard: precondition(() => true, 'frozen'), id: 'tool:writeGate' }]);
    expect(() => lane(stray, ['cancelBooking'])).toThrow(/notAWrite/);
  });
  test('exempt with a literal target throws', () => {
    const c = contractWith([{ hook: 'preTool', target: ['cancelBooking'], exempt: ['cancelBooking'], guard: precondition(() => true, 'frozen'), id: 'tool:x' }]);
    expect(() => lane(c, ['cancelBooking'])).toThrow(/named set/);
  });
  test('contract bindings precede lane bindings within the agent tier', () => {
    const c = contractWith([{ hook: 'preTool', target: ['cancelBooking'], guard: requiresBefore(['getBooking']), id: 'tool:readFirst' }]);
    const spec = lane(c, ['cancelBooking', 'getBooking']);
    spec.addGuard('preTool', ['cancelBooking'], requiresBefore(['getQuote']), { id: 'agent:laneRule' });
    const order = resolveBindings(spec.guards.preTool, 'cancelBooking').map((b) => b.id);
    expect(order.indexOf('tool:readFirst')).toBeLessThan(order.indexOf('agent:laneRule'));
  });
});
```

Rewrite `change-allowed.test.ts` keeping every behavioral assertion (deny while the world condition holds false, exemption stays callable) but constructing the gate as the §3.4 binding:

```ts
guards: [{
  hook: 'preTool', target: 'writeTools', exempt: ['getQuoteWrite'],
  guard: precondition((w) => !(w as { frozen?: boolean }).frozen, 'The account is frozen — no changes.', { prose: 'nothing changes while the account is frozen' }),
  id: 'changeAllowed:precondition', priority: 'changeAllowed',
}]
```

Target-array assertions change to the INTERSECTED arrays (migration note, spec §3.4) — update the expected values, never relax the assertion.

- [x] **Step 2: Run to verify the new tests fail**

Run: `pnpm -C packages/core exec vitest run test/contract-bindings.test.ts test/change-allowed.test.ts`
Expected: FAIL — `guards` is not a `DomainContract` property; `changeAllowed` removal breaks the old construction.

- [x] **Step 3: Implement**

In `assembled-prompt.ts`: add the two types beside `DomainContract` (import `Hook`, `Priority` types from `./spec.js`, `Guard` from `./rules.js`), add `guards?: ContractGuardBinding[]` with a JSDoc stating the resolution rule verbatim from spec §3.2 (`'writeTools'` = contract-wide ∩ lane − exempt; `'destructiveTools'` = lane-declared − exempt; a lane whose surface misses the whole target installs nothing). Delete `changeAllowed`.

In `spec.ts`, replace the deleted `changeAllowed` block with:

```ts
protected installContractBindings(): void {
  for (const b of this.contract?.guards ?? []) {
    const target = this.resolveContractTarget(b);
    if (!target.length) continue;
    this.addGuard(b.hook, target, b.guard, { id: b.id, priority: b.priority ?? 'agent' });
  }
}

/** A named set expands to a literal string[] here — `ToolTarget` never carries a set name, because
 *  `resolveBindings`' `target.includes(tool)` on a string is a SUBSTRING match and would attach the
 *  guard to a tool nobody bound it to. */
private resolveContractTarget(b: ContractGuardBinding): string[] {
  const exempt = b.exempt ?? [];
  if (Array.isArray(b.target)) {
    if (exempt.length) {
      throw new Error(
        `AgentSpec "${this.id}": binding "${b.id}" carries exempt with a literal target — exempt only withdraws names from a named set.`,
      );
    }
    return b.target.filter((t) => this.surface.tools.includes(t));
  }
  const set = b.target === 'writeTools' ? [...(this.contract?.writeTools ?? [])] : [...this.destructiveTools];
  const stray = exempt.filter((t) => !set.includes(t));
  if (stray.length) {
    throw new Error(
      `AgentSpec "${this.id}": binding "${b.id}" exempts tool(s) not in ${b.target}: ${stray.join(', ')}. ` +
        'An exemption from a gate that never covered the tool reads as a decision nobody made.',
    );
  }
  return set.filter((t) => this.surface.tools.includes(t) && !exempt.includes(t));
}
```

Call `this.installContractBindings()` at the end of `installUniversalAndContractGuards` (contract bindings enter during `super()`, before any lane `addGuard`, which is what makes insertion order within the `agent` tier deterministic). Export both types from `index.ts`. Update the `spec.ts` header: the id-namespace list gains `tool:` as the contract-binding provenance namespace; the priority table prose stays byte-identical. Update `catalog.ts:111` to advise "a `writeTools` binding on `contract.guards`" instead of `contract.changeAllowed`.

- [x] **Step 4: Run core suite; update stability expectations**

Run: `pnpm -C packages/core build && pnpm -C packages/core test`
Expected: contract-bindings + change-allowed PASS. Any stability test reading installed `changeAllowed:precondition` targets moves to the intersected arrays — update expected values only.

- [x] **Step 5: Commit**

```bash
git add -A packages/core
git commit -m "feat(core)!: the contract declares tool guards as bindings, and changeAllowed is one of them"
```

---

### Task 3: The eval lints follow the binding form

**Files:**
- Modify: `packages/eval/src/lint-subject.ts` (lines 38, 248, 275 — detection and advisory text)
- Test: `packages/eval/test/lint-subject-parity.test.ts` (update fixtures/expectations)

**Interfaces:**
- Consumes: `ContractGuardBinding` and `DomainContract.guards` from Task 2.
- Produces: nothing new — the lint's finding ids and report shape are unchanged.

- [x] **Step 1: Update the parity test fixture to the binding form and run it**

Change any fixture contract carrying `changeAllowed: {...}` to the §3.4 binding (same shape as Task 2's rewrite). Run: `pnpm -C packages/eval exec vitest run test/lint-subject-parity.test.ts`
Expected: FAIL — the lint still reads `contract.changeAllowed`.

- [x] **Step 2: Update the lint**

Detection: a domain-wide write gate exists when `contract.guards?.some((g) => g.priority === 'changeAllowed')` (the id stays `changeAllowed:precondition` by convention, but the PRIORITY is the load-bearing marker — an author may rename the id). Advisory text at line 275 becomes: `'…Declare a writeTools binding at priority changeAllowed on contract.guards, or gate the lane on the same condition'`. The header comment at line 38 states the new source of truth.

- [x] **Step 3: Run the eval suite**

Run: `pnpm -C packages/eval test`
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add -A packages/eval
git commit -m "fix(eval): the write-gate lint reads the contract's binding list"
```

---

### Task 4: `composeToolDescription` — the prose lands in the tool description

**Files:**
- Modify: `packages/core/src/prompt-fold.ts` (move `proseKey`/`proseText` here as exports)
- Modify: `packages/core/src/assembled-prompt.ts` (import them instead of defining)
- Create: `packages/core/src/tool-description.ts`
- Modify: `packages/core/src/index.ts` (export `composeToolDescription`, `TOOL_RULES_HEADING`)
- Test: `packages/core/test/tool-description.test.ts` (new)

**Interfaces:**
- Consumes: `resolveBindings` (existing), `proseKey`/`proseText` (moved here).
- Produces (Tasks 5–6 call this exact signature):

```ts
export const TOOL_RULES_HEADING = 'RULES YOU MUST FOLLOW TO CALL THIS TOOL';
export function composeToolDescription(def: { name: string; description: string }, spec: AgentSpec): string;
```

- [x] **Step 1: Write the failing test**

```ts
// packages/core/test/tool-description.test.ts
import { describe, expect, test } from 'vitest';
import { AgentSpecBase, composeToolDescription, requiresBefore, TOOL_RULES_HEADING } from '../src/index.js';

const mkSpec = () =>
  new AgentSpecBase({
    id: 'a', mode: 'm', persona: 'p',
    tools: ['cancelBooking', 'getBooking'],
    destructiveTools: ['cancelBooking'],
    destructiveLabels: { cancelBooking: 'cancel the booking' },
  });

describe('composeToolDescription', () => {
  test('appends every resolved rule as a bullet under the fixed heading, in priority order', () => {
    const spec = mkSpec();
    spec.addGuard('preTool', ['cancelBooking'], requiresBefore(['getBooking'], { prose: 'read the booking first' }), { id: 'tool:readFirst' });
    const out = composeToolDescription({ name: 'cancelBooking', description: 'Cancel a booking.' }, spec);
    expect(out.startsWith('Cancel a booking.\n\n' + TOOL_RULES_HEADING + '\n')).toBe(true);
    const rules = out.split(TOOL_RULES_HEADING + '\n')[1].split('\n');
    expect(rules[0]).toBe('- read the booking first');                 // agent tier before consent tier
    expect(out).toMatch(/make the call — it does not run/);            // consent:confirmFirst prose rides along
    expect(out).toMatch(/at most one destructive action per turn/);    // consent:destructiveThrottle
  });
  test('a tool with no tool-targeted bindings keeps its description byte-identical', () => {
    const spec = mkSpec();
    expect(composeToolDescription({ name: 'getBooking', description: 'Read a booking.' }, spec)).toBe('Read a booking.');
  });
  test('two bindings whose prose is byte-identical print the sentence once', () => {
    const spec = mkSpec();
    spec.addGuard('preTool', ['cancelBooking'], requiresBefore(['getBooking'], { prose: 'read the booking first' }), { id: 'tool:a' });
    spec.addGuard('preTool', ['cancelBooking'], requiresBefore(['getBooking'], { prose: 'read the booking first' }), { id: 'tool:b' });
    const out = composeToolDescription({ name: 'cancelBooking', description: 'Cancel a booking.' }, spec);
    expect(out.match(/read the booking first/g)!.length).toBe(1);
  });
  test("target 'any' never enters a description — it has no single description to live in", () => {
    const spec = mkSpec();
    const out = composeToolDescription({ name: 'getBooking', description: 'Read a booking.' }, spec);
    expect(out).not.toMatch(/never repeat/); // always:noDuplicateCall is target 'any'
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `pnpm -C packages/core exec vitest run test/tool-description.test.ts`
Expected: FAIL — `composeToolDescription` is not exported.

- [x] **Step 3: Implement**

Move `proseKey`/`proseText` (with their JSDoc) from `assembled-prompt.ts` into `prompt-fold.ts` as exports; `assembled-prompt.ts` imports them. Then:

```ts
// packages/core/src/tool-description.ts
/**
 * The COMPOSED tool description: the tool's declared business sentence, then — when any binding
 * targets the tool — a fixed heading and one bullet per resolved `prose()`, in priority order,
 * de-duplicated per tool. This is the channel a tool-scoped rule reaches the model through; the
 * assembled prompt carries only `target:'any'` sections. `prose()` is nullary, so the composition
 * is a pure function of (def, spec) and byte-stable across turns.
 */
import { resolveBindings } from './spec.js';
import type { AgentSpec, GuardBinding } from './spec.js';
import { proseKey, proseText } from './prompt-fold.js';

export const TOOL_RULES_HEADING = 'RULES YOU MUST FOLLOW TO CALL THIS TOOL';

export function composeToolDescription(def: { name: string; description: string }, spec: AgentSpec): string {
  const hookLists: Array<GuardBinding[] | undefined> = [
    spec.guards.preTool, spec.guards.postTool, spec.guards.onInput, spec.guards.onReply,
  ];
  const seenForTool = new Set<string>();
  const rules: string[] = [];
  for (const bindings of hookLists) {
    for (const b of resolveBindings(bindings)) {
      if (b.target === 'any' || !b.target.includes(def.name)) continue;
      const p = b.guard.prose();
      if (!p?.trim() || seenForTool.has(proseKey(p))) continue;
      seenForTool.add(proseKey(p));
      rules.push(proseText(p));
    }
  }
  if (!rules.length) return def.description;
  return `${def.description}\n\n${TOOL_RULES_HEADING}\n${rules.map((r) => `- ${r}`).join('\n')}`;
}
```

Export both from `index.ts`.

- [x] **Step 4: Run the core suite**

Run: `pnpm -C packages/core build && pnpm -C packages/core test`
Expected: PASS (`## Tool rules` still renders — it leaves in Task 7).

- [x] **Step 5: Commit**

```bash
git add -A packages/core
git commit -m "feat(core): composeToolDescription puts a tool's guard prose in its own description"
```

---

### Task 5: The world seam composes descriptions

**Files:**
- Modify: `packages/mastra/src/tools.ts` (`buildWorldTools` gains `spec`)
- Modify: `packages/mastra/src/agent-construction.ts` (the `buildWorldTools` call)
- Test: `packages/mastra/test/tool-description-seam.test.ts` (new)

**Interfaces:**
- Consumes: `composeToolDescription(def, spec)` from Task 4.
- Produces: `buildWorldTools(toolDefs: ToolDef[], surface: ReadonlySet<string>, getSession: SessionAccessor, spec: AgentSpec, contract?: DomainContract): Record<string, any>` — `spec` is the new 4th parameter; `contract` moves to 5th.

- [x] **Step 1: Write the failing test**

```ts
// packages/mastra/test/tool-description-seam.test.ts
import { describe, expect, test } from 'vitest';
import { AgentSpecBase, requiresBefore, TOOL_RULES_HEADING } from '@looprun-ai/core';
import { buildWorldTools } from '../src/tools.js';

describe('buildWorldTools', () => {
  test('a domain tool is served with its composed description', () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'm', persona: 'p', tools: ['cancelBooking', 'getBooking'] });
    spec.addGuard('preTool', ['cancelBooking'], requiresBefore(['getBooking'], { prose: 'read the booking first' }), { id: 'tool:readFirst' });
    const defs = [
      { name: 'cancelBooking', description: 'Cancel a booking.', inputSchema: { type: 'object', properties: {} } },
      { name: 'getBooking', description: 'Read a booking.', inputSchema: { type: 'object', properties: {} } },
    ];
    const session = { world: { exec: () => ({}) }, actionHistory: [] };
    const tools = buildWorldTools(defs as never, new Set(['cancelBooking', 'getBooking']), () => session as never, spec);
    expect(tools.cancelBooking.description).toContain(TOOL_RULES_HEADING);
    expect(tools.cancelBooking.description).toContain('- read the booking first');
    expect(tools.getBooking.description).toBe('Read a booking.');
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `pnpm -C packages/core build && pnpm -C packages/mastra exec vitest run test/tool-description-seam.test.ts`
Expected: FAIL — `buildWorldTools` has no `spec` parameter / description lacks the heading.

- [x] **Step 3: Implement**

`tools.ts`: signature `buildWorldTools(toolDefs, surface, getSession, spec: AgentSpec, contract?: DomainContract)`; in the DOMAIN-tool branch only, `description: composeToolDescription(def, spec)` (the terminal branch keeps `def.description` — terminals are protocol-owned and no binding may target them). `agent-construction.ts`: `buildWorldTools(config.toolDefs ?? [], surface, getSession, spec, contract)`.

- [x] **Step 4: Run the mastra suite**

Run: `pnpm -C packages/mastra test`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add -A packages/mastra
git commit -m "feat(mastra)!: the world seam serves composed tool descriptions"
```

---

### Task 6: Native mode — `toolDefs` required, reconciled, and wrapped (§3.9)

**Files:**
- Modify: `packages/mastra/package.json` (add `"zod-to-json-schema": "^3.25.2"` to dependencies — already in the lockfile)
- Create: `packages/mastra/src/reconcile-surface.ts`
- Modify: `packages/mastra/src/agent-construction.ts` (error inversion at ~:56; wrap at ~:103; header comment; fingerprint branch at ~:115 UNCHANGED)
- Test: `packages/mastra/test/native-surface.test.ts` (new)

**Interfaces:**
- Consumes: `composeToolDescription` from Task 4.
- Produces:

```ts
// reconcile-surface.ts
/** Throws when gen/tools.json does not describe THIS host: name sets must be equal and every
 *  declared inputSchema must project-equal the live zod schema. */
export function reconcileNativeSurface(
  toolDefs: ReadonlyArray<{ name: string; inputSchema?: unknown }>,
  liveTools: Record<string, { inputSchema?: unknown }>,
  activeNames: readonly string[],
  specId: string,
): void;
/** The drift-relevant canonical projection of a JSON schema: type, sorted properties (recursed),
 *  sorted required, enum, items. Prose-level keys never enter it. */
export function schemaProjection(schema: unknown): unknown;
```

- [x] **Step 1: Write the failing tests**

```ts
// packages/mastra/test/native-surface.test.ts
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { reconcileNativeSurface, schemaProjection } from '../src/reconcile-surface.js';

const fileSchema = {
  type: 'object',
  properties: { bookingId: { type: 'string', description: 'the booking id' } },
  required: ['bookingId'],
};

describe('schemaProjection', () => {
  test('prose-level keys never enter the projection', () => {
    const bare = { type: 'object', properties: { bookingId: { type: 'string' } }, required: ['bookingId'] };
    expect(schemaProjection(fileSchema)).toEqual(schemaProjection(bare));
  });
});

describe('reconcileNativeSurface', () => {
  const live = { cancelBooking: { inputSchema: z.object({ bookingId: z.string() }) } };
  test('a file that describes the host passes', () => {
    expect(() =>
      reconcileNativeSurface([{ name: 'cancelBooking', inputSchema: fileSchema }], live, ['cancelBooking'], 'a'),
    ).not.toThrow();
  });
  test('a name the file declares and the host lacks throws', () => {
    expect(() =>
      reconcileNativeSurface(
        [{ name: 'cancelBooking', inputSchema: fileSchema }, { name: 'issueRefund' }], live, ['cancelBooking'], 'a',
      ),
    ).toThrow(/issueRefund/);
  });
  test('a live schema that gained a field throws', () => {
    const drifted = { cancelBooking: { inputSchema: z.object({ bookingId: z.string(), force: z.boolean() }) } };
    expect(() =>
      reconcileNativeSurface([{ name: 'cancelBooking', inputSchema: fileSchema }], drifted, ['cancelBooking'], 'a'),
    ).toThrow(/cancelBooking/);
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `pnpm -C packages/mastra exec vitest run test/native-surface.test.ts`
Expected: FAIL — module does not exist.

- [x] **Step 3: Implement `reconcile-surface.ts`**

```ts
import { zodToJsonSchema } from 'zod-to-json-schema';

export function schemaProjection(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return null;
  const rec = schema as Record<string, unknown>;
  const props =
    rec.properties && typeof rec.properties === 'object'
      ? Object.fromEntries(
          Object.entries(rec.properties as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, schemaProjection(v)]),
        )
      : undefined;
  return {
    type: rec.type ?? null,
    ...(rec.enum !== undefined ? { enum: rec.enum } : {}),
    ...(props ? { properties: props } : {}),
    ...(Array.isArray(rec.required) ? { required: [...(rec.required as string[])].sort() } : {}),
    ...(rec.items !== undefined ? { items: schemaProjection(rec.items) } : {}),
  };
}

/** A live schema is a zod validator; the file's is JSON Schema. Both are compared through the
 *  projection so authored wording never fails the check while a renamed argument, a new field or a
 *  changed type does. */
export function reconcileNativeSurface(
  toolDefs: ReadonlyArray<{ name: string; inputSchema?: unknown }>,
  liveTools: Record<string, { inputSchema?: unknown }>,
  activeNames: readonly string[],
  specId: string,
): void {
  const declared = toolDefs.map((d) => d.name).sort();
  const live = [...activeNames].sort();
  if (JSON.stringify(declared) !== JSON.stringify(live)) {
    throw new Error(
      `LoopRunAgent "${specId}": gen/tools.json does not describe this host — ` +
        `declared [${declared.join(', ')}] vs live [${live.join(', ')}]. ` +
        'Re-run the surface intake step and re-certify.',
    );
  }
  for (const def of toolDefs) {
    const liveSchema = liveTools[def.name]?.inputSchema;
    const liveJson = liveSchema ? zodToJsonSchema(liveSchema as never, { $refStrategy: 'none' }) : undefined;
    const a = JSON.stringify(schemaProjection(def.inputSchema));
    const b = JSON.stringify(schemaProjection(liveJson));
    if (a !== b) {
      throw new Error(
        `LoopRunAgent "${specId}": the declared inputSchema of "${def.name}" does not match the live tool's — ` +
          'the model would read one schema while the host validates another. Re-run the surface intake step.',
      );
    }
  }
}
```

- [x] **Step 4: Extend the test for construction, then wire `agent-construction.ts`**

Add to `native-surface.test.ts` (construct `LoopRunAgent`/the exported constructor the existing mastra tests use — follow `packages/mastra/test/governance-extras.test.ts` for the minimal native construction shape):

```ts
test('native construction without toolDefs throws and names the pipeline step', () => {
  // tools present, toolDefs absent → construction throws with /toolDefs/ and /gen\/tools\.json/
});
test('a natively registered tool is served with the composed description and the host execute', () => {
  // description contains TOOL_RULES_HEADING; admitted execute === the host tool's execute
});
```

Then in `agent-construction.ts`:

```ts
// ~:56 — the error inverts: tools+toolDefs is the REQUIRED pairing
if (config.tools && config.world) {
  throw new Error(`LoopRunAgent "${spec.id}": pass EITHER native tools (tools+toolDefs) OR world+toolDefs — not both.`);
}
if (config.tools && !config.toolDefs?.length) {
  throw new Error(
    `LoopRunAgent "${spec.id}": native tools require toolDefs — the declared surface (gen/tools.json) is ` +
      'what guard prose and certification compose from. Produce it with the surface intake step and pass it here.',
  );
}
```

```ts
// ~:103 — the passthrough becomes a wrap: host execute kept, composed description served
if (nativeToolsMode) {
  reconcileNativeSurface(config.toolDefs!, config.tools!, nativeActiveNames, spec.id);
  const defByName = new Map(config.toolDefs!.map((d) => [d.name, d]));
  const admitted: Record<string, any> = {};
  for (const t of nativeActiveNames) {
    admitted[t] = { ...config.tools![t], description: composeToolDescription(defByName.get(t)!, spec) };
  }
  tools = { ...admitted, ...buildTerminalTools(getSession) };
}
```

The fingerprint branch (`schemaOf` reading `config.tools![name]?.inputSchema` in native mode) is NOT touched — it is the drift gate against the CERTIFIED surface and must keep reading the live schema. Update the module header comment: the native/world split is about EXECUTION only; both paths declare their surface in `tools.json`.

- [x] **Step 5: Run the mastra suite**

Run: `pnpm -C packages/mastra test`
Expected: PASS, including every pre-existing native-mode test updated to pass `toolDefs`.

- [x] **Step 6: Commit**

```bash
git add -A packages/mastra
git commit -m "feat(mastra)!: native mode declares its surface in toolDefs, reconciled against the host"
```

---

### Task 7: `## Tool rules` leaves the assembled prompt

**Files:**
- Modify: `packages/core/src/assembled-prompt.ts` (drop `SECTION_TOOL`, `composedRow`, the toolRows loop, the `all` array; rewrite the PROSE-RENDERING RULE comment and the module header)
- Modify: `packages/core/src/prompt-fold.ts` (delete the `tool` field of `PromptLine` and its mentions — nothing renders a per-tool row anymore)
- Modify: `packages/core/src/spec.ts` (the `GuardBinding.target` JSDoc: both halves rewritten to the §3.7 routing table)
- Modify: `packages/core/test/prompt-stability.test.ts`, `packages/core/test/proofs/prompt-provenance.test.ts`
- Modify: `docs/tutorial/03-agent-anatomy.md` (the assembled-prompt lesson stops showing `## Tool rules`; the tool-description view replaces it)
- Test: extend `packages/core/test/prompt-stability.test.ts`

**Interfaces:**
- Consumes: `composeToolDescription` (Task 4) — the test asserts the rule lives there and only there.
- Produces: the assembled prompt sections are exactly: voice · scope · core rules · flow · `## Global tool rules` · `## Input rules` · `## Reply rules` · governance · behavior · language.

- [x] **Step 1: Write the failing assertions**

In `prompt-stability.test.ts` add:

```ts
test('a tool-targeted rule renders in the tool description and nowhere in the assembled prompt', () => {
  // build a spec with a tool-targeted requiresBefore({ prose: 'read the booking first' })
  // and any DomainContract fixture already used in this file:
  expect(prompt).not.toContain('## Tool rules');
  expect(prompt).not.toContain('read the booking first');
  expect(prompt).toContain('## Global tool rules'); // target:'any' preTool prose stays
  expect(composeToolDescription({ name: 'cancelBooking', description: 'Cancel a booking.' }, spec)).toContain('read the booking first');
});
```

- [x] **Step 2: Run to verify it fails**

Run: `pnpm -C packages/core exec vitest run test/prompt-stability.test.ts`
Expected: FAIL — the prompt still contains `## Tool rules`.

- [x] **Step 3: Implement the removal**

In `ruleBlocks`: delete the toolRows loop, `toolBlock`, the `all` array, `SECTION_TOOL`, and `composedRow`. Return `[globalBlock, inputBlock, replyBlock]`. Rewrite the PROSE-RENDERING RULE comment to the §3.7 routing table verbatim (five rows, tool-targeted → the tool's own description) and state that per-tool de-duplication lives in `composeToolDescription`. In `prompt-fold.ts` delete `PromptLine.tool` and the two `## Tool rules` comment mentions; in `spec.ts` rewrite the `GuardBinding.target` JSDoc: CHECK half unchanged, RENDER half now routes tool-naming targets to the tool's own description via `composeToolDescription`. Module header of `assembled-prompt.ts`: the section list drops Tool rules; the shared-prefix paragraph states where tool prose lives.

- [x] **Step 4: Update the moved tests and the tutorial**

`prompt-provenance.test.ts`: remove/replace assertions over `tool`-attributed lines; provenance for tool rules is now asserted through `composeToolDescription` output. `docs/tutorial/03-agent-anatomy.md`: the assembled-prompt walkthrough shows the new section list and one composed description under `RULES YOU MUST FOLLOW TO CALL THIS TOOL`.

- [x] **Step 5: Run the full repo suite**

Run: `pnpm -C packages/core build && pnpm test`
Expected: PASS — including the root `gen-guards-chapter.mjs --check`, `tests/plain-names.test.mjs`, `tests/guard-priority.test.mjs`; update any of them that renders `## Tool rules`, never relax.

- [x] **Step 6: Commit**

```bash
git add -A packages/core packages/mastra docs/tutorial tests scripts
git commit -m "feat(core)!: tool-scoped prose lives in the tool description — the Tool rules section is gone"
```

---

### Task 8: Docs sweep (§6.1)

**Files:**
- Modify: `README.md` (the guard example, if it binds a tool rule per agent — show the contract-binding form)
- Modify: `GUARDS.md` (§2: the routing table gains the description row; new law: "engine prose names no mechanism a surface may lack — `prose()` is nullary and cannot see the schema, so a clause conditional on a parameter renders on surfaces that have none"; the prose≠reason law is NOT restated)
- Modify: `docs/reference/**` page on `DomainContract` (`changeAllowed` gone; `guards` binding list + named sets documented with the §3.2 resolution table)
- Modify: `docs/tutorial/*` lesson that introduces guards (the contract-binding declaration appears where the per-agent tool binding was shown)

**Interfaces:**
- Consumes: the shipped shapes from Tasks 1–7 — every documented signature is copied from the source, not from this plan.
- Produces: nothing — docs only.

- [x] **Step 1: Locate every stale mention**

Run: `grep -rn "changeAllowed\|## Tool rules\|Tool rules" README.md GUARDS.md docs --include="*.md" | grep -v superpowers`
Expected: a hit list; every hit is rewritten in the steps below.

- [x] **Step 2: Rewrite each artifact AS-IS**

Each doc states the current system only: the binding list, the named sets and their resolution places, the routing table with the description row, the new prose law. No doc narrates that a section was removed or a field replaced.

- [x] **Step 3: Regenerate and check**

Run: `pnpm -C packages/core build && pnpm docs:guards && pnpm test`
Expected: PASS; `git diff` shows only intended doc changes.

- [x] **Step 4: Commit**

```bash
git add README.md GUARDS.md docs
git commit -m "docs: tool guards are contract bindings and their prose lives in the tool description"
```

---

### Task 9: Gates + governance proof record

**Files:**
- Modify: whatever the looprun-governance skill requires (proof record, MATRIX.md)

**Interfaces:**
- Consumes: everything above.
- Produces: a green board and the proof record the merge gate requires.

- [x] **Step 1: Full build + full suite**

Run: `pnpm build && pnpm test`
Expected: PASS across packages plus the three root checks.

- [x] **Step 2: The §6.3 no-rule-twice check**

For the tutorial/fixture spec with tool-targeted bindings, assert (already covered by Task 7's stability test — re-run and confirm): no `proseKey` appears in both the assembled prompt and a composed description. Run: `pnpm -C packages/core exec vitest run test/prompt-stability.test.ts` — PASS.

- [x] **Step 3: Governance proof record**

This change touches guards and the guard runtime — invoke the `looprun-governance` skill and follow it to produce/refresh the deterministic proof record before merge (`check-record-required` gate, MATRIX.md).

- [x] **Step 4: Commit anything the skill produced**

```bash
git add -A
git commit -m "chore(core): proof record for the tool-owned guard bindings"
```

---

## Out of scope for this plan (follow-on, other repos / after release)

| step | where | blocked on |
|---|---|---|
| §4 — atlas: 17 bindings move to `norms/contract.ts`; case targets renamed to `tool:` ids; `looprun-eval validate` clean | `agentspec-bench` | engine released |
| §6.2 — agentspec skill: norms.md, guard-catalog.md, gen.md, test.md, lint-authoring.mjs (two new findings) | `agentspec` repo | engine released |
| §5.1 — release `0.17.0`, move the bench pin off the hand-copied `dist` | `looprun` + `agentspec-bench` | Tasks 1–9 merged |
| §7 cache gate — 5-case measurement, cache-read ≥ pre-change baseline | `agentspec-bench` | subject migrated |
| §8 — the 19-case remediation run (`r4-remediation`), same judge as r1/r2 | `agentspec-bench` | subject migrated |
