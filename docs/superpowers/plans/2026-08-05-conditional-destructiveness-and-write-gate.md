# Conditional Destructiveness and the Contract Write Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a call — not a tool — the unit of destructiveness, make one world condition one
declaration, and let the artifact laws accuse a lane whose world refuses a write it never gates.

**Architecture:** Two per-tool predicate maps on the existing confirmation kinds, fed from one new
spec option; one new key on `DomainContract` that installs a `precondition` on every spec carrying a
write; and three laws in `@looprun-ai/eval` that read the subject's own presets. Nothing new is
configurable about consent: the predicate decides which CALL is destructive, never who licensed it.

**Tech Stack:** TypeScript, pnpm workspaces, vitest, the `@looprun-ai/core` guard catalog.

**Spec:** [`docs/superpowers/specs/2026-08-05-conditional-destructiveness-and-write-gate-need.md`](../specs/2026-08-05-conditional-destructiveness-and-write-gate-need.md)

## Global Constraints

- **English only.** Every byte written to a file — code, identifiers, comments, error strings, guard
  prose, docs, commit messages. Only a chat reply follows the user's language.
- **AS-IS comments and docs.** A comment states what the system IS and shows an example. Never "used
  to", "no longer", "kept for compatibility"; never a measurement narrative; never a test filename as
  proof.
- **Guard purity holds.** No clock, no entropy, no network, no LLM call inside
  `packages/core/src/guards/**`. A predicate reads the acting call's own arguments and nothing else.
- **Consent stays engine-owned.** No option added here reads, writes or accepts a consent. A domain
  never reads `ctx.consent`; the predicate answers only "is THIS call destructive".
- **Immutability.** New objects, never in-place mutation.
- **Byte-stable guard ids.** `base:confirmFirst`, `base:confirmFirstPriorAsk`,
  `base:destructiveThrottle` stay one install each. A per-tool predicate is a MAP on one guard, never
  one guard per tool.
- **Governed surfaces need a proof record.** `packages/core/src/**`, `packages/core/GUARDS.md`.
  Task 9 produces it; do not merge without it. `packages/eval/src/**` is not governed.
- **Three decisions are settled — do not reopen them.** (1) `destructiveThrottle` shares the
  predicate. (2) `writeGate` opt-out is an exemption list on the contract. (3) `GUARD-NEVER-TARGETED`
  accepts no declared gap: the repair is a case or a preset.

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/trunk.ts` | MODIFY — `DomainContract.writeGate` (the type only; `DomainContract` is declared here). |
| `packages/core/src/spec.ts` | MODIFY — `cfg.destructiveWhen`; the `writeGate` install in `installMinimal`; the predicate wiring and stray-key throws in `installBase`. |
| `packages/core/src/guards/confirmation.ts` | MODIFY — the `when` map on `confirmFirst` and on `destructiveThrottle`. |
| `packages/core/test/guards-confirmation.test.ts` | MODIFY — the predicate's two branches on both kinds. |
| `packages/core/test/agent-spec.test.ts` | MODIFY — the install wiring, the stray-key throws, the workspace-hold shape that construction now accepts. |
| `packages/core/test/write-gate.test.ts` | CREATE — the contract gate: install, exemption, absent-writeTools throw. |
| `packages/eval/src/lint-subject.ts` | MODIFY — the parity law, the target-silence law, the `(agent, guardId)` diff key, the `GUARD-NEVER-TARGETED` message. |
| `packages/eval/src/lint.ts` | MODIFY — the explicit-`{ id }` law in `lintSpecLaws`. |
| `packages/eval/test/lint-subject-parity.test.ts` | CREATE — both polarities of the three subject laws. |
| `packages/core/src/guards/catalog.ts` | MODIFY — the `confirmFirst`, `destructiveThrottle`, `precondition` entries. The chapter is REGENERATED from this file. |
| `packages/core/GUARDS.md` · `docs/tutorial/03-agent-anatomy.md` · `docs/tutorial/05-running-and-eval.md` · `packages/eval/README.md` · `BACKLOG.md` | MODIFY — Task 8. |
| `packages/core/test/proofs/catalog-run-output.ts` | MODIFY — the new polarity on the `confirmFirst` proof and on the throttle's. |
| `governance/proofs/2026-08-05-conditional-destructiveness.md` · `governance/MATRIX.md` | CREATE/REGENERATE — Task 9. |
| `~/Dev/js/looprun/agentspec/skill/**` | MODIFY — Task 10, separate repo, separate commit. |

**Order.** Task 1 (`writeGate`) lands before the lint tasks: the parity law's shape narrows to what
the contract cannot cover, and Task 5's fixtures use the gate.

---

### Task 1: `contract.writeGate` — one world condition, one declaration

**Files:**
- Modify: `packages/core/src/trunk.ts:38-85` (the `DomainContract` interface)
- Modify: `packages/core/src/spec.ts:28` (import), `packages/core/src/spec.ts:439-450` (`installMinimal`)
- Test: `packages/core/test/write-gate.test.ts` (create)

**Interfaces:**
- Consumes: `precondition(ok, reason, prose?)` from `./guards/index.js`; `this.contract`, `this.addGuard` on `AgentSpecBase`.
- Produces: `DomainContract.writeGate?: { ok(world): boolean; reason: string; prose?: string; exempt?: readonly string[] }`; the guard id `minimal:writeGate`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/write-gate.test.ts`:

```ts
/**
 * THE CONTRACT WRITE GATE — one declaration installs the state gate on every spec that writes.
 */
import { describe, it, expect } from 'vitest';
import { AgentSpecBase } from '../src/spec.js';
import type { AgentWorld } from '../src/world/index.js';
import type { DomainContract } from '../src/trunk.js';

const world = (status: string): AgentWorld => ({ status: () => status }) as unknown as AgentWorld;

const contract = (over: Partial<DomainContract> = {}): DomainContract =>
  ({
    voice: 'A rental desk.',
    stateBlock: () => '',
    coreInvariants: [],
    languageClause: 'Answer in English.',
    writeTools: ['createBooking', 'placeHold'],
    ...over,
  }) as DomainContract;

const spec = (c: DomainContract) =>
  new AgentSpecBase({
    id: 'rentals',
    persona: 'The rentals desk.',
    scope: 'Bookings.',
    tools: ['createBooking', 'placeHold', 'getBooking'],
    contract: c,
  });

describe('contract.writeGate', () => {
  it('installs one preTool gate on the write tools', () => {
    const s = spec(contract({
      writeGate: { ok: (w) => (w as { status(): string }).status() !== 'suspended', reason: 'This workspace is suspended.' },
    }));
    const gate = s.guards.preTool.find((b) => b.id === 'minimal:writeGate');
    expect(gate).toBeDefined();
    expect(gate!.target).toEqual(['createBooking', 'placeHold']);
    expect(gate!.guard.check({ tool: 'createBooking', args: {}, world: world('suspended'), observed: [], turnIndex: 0, userText: '', history: [] } as never))
      .toBe('This workspace is suspended.');
    expect(gate!.guard.check({ tool: 'createBooking', args: {}, world: world('active'), observed: [], turnIndex: 0, userText: '', history: [] } as never))
      .toBeNull();
  });

  it('an exempt write keeps running while the gate denies the rest', () => {
    const s = spec(contract({
      writeGate: { ok: (w) => (w as { status(): string }).status() !== 'suspended', reason: 'This workspace is suspended.', exempt: ['placeHold'] },
    }));
    expect(s.guards.preTool.find((b) => b.id === 'minimal:writeGate')!.target).toEqual(['createBooking']);
  });

  it('an exempt tool that is not a write tool throws at construction', () => {
    expect(() => spec(contract({
      writeGate: { ok: () => true, reason: 'r', exempt: ['getBooking'] },
    }))).toThrow(/writeGate.exempt names tool\(s\) that are not in contract.writeTools: getBooking/);
  });

  it('a gate with no write surface throws at construction', () => {
    expect(() => spec(contract({ writeTools: [], writeGate: { ok: () => true, reason: 'r' } })))
      .toThrow(/writeGate is declared with no contract.writeTools/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @looprun-ai/core exec vitest run test/write-gate.test.ts`
Expected: FAIL — `minimal:writeGate` is undefined (the contract key does not exist yet).

- [ ] **Step 3: Add the contract key**

In `packages/core/src/trunk.ts`, inside `interface DomainContract`, directly after the `writeTools`
member:

```ts
  /** The world condition every write of this domain is refused under — declared ONCE, installed on
   *  every spec that carries a write. `ok(world)` is the whole condition: a gate keyed on a third of
   *  it is a gate that misses the other two thirds on every lane at once. `exempt` names the writes
   *  that must stay usable while the condition holds — a compliance hold is the shape that needs it —
   *  and each entry must be one of {@link writeTools}, so an exemption is visible beside the rule it
   *  suspends rather than per lane. `prose` is what the trunk renders; absent ⇒ the reason. */
  writeGate?: {
    ok: (world: AgentWorld) => boolean;
    reason: string;
    prose?: string;
    exempt?: readonly string[];
  };
```

- [ ] **Step 4: Install it**

In `packages/core/src/spec.ts:28`, add `precondition` to the guard import:

```ts
import { claimIsComplete, claimIsGrounded, confirmFirst, degenerationGuard, destructiveThrottle, noDuplicateCall, precondition } from './guards/index.js';
```

In `installMinimal`, immediately after the `claimIsComplete` install block (`packages/core/src/spec.ts:450`), before the method's closing brace:

```ts
    // THE WRITE GATE: the domain states ONCE what its world refuses every write under, and it installs
    // on every spec that carries a write. Declared per lane it is six chances to key on a third of the
    // condition; declared here there is one predicate and no lane can diverge from it.
    const gate = this.contract?.writeGate;
    if (gate) {
      if (!writeTools?.length) {
        throw new Error(
          `AgentSpec "${this.id}": contract.writeGate is declared with no contract.writeTools — the gate has no ` +
            'surface to install on and would enforce nothing.',
        );
      }
      const strayExempt = (gate.exempt ?? []).filter((t) => !writeTools.includes(t));
      if (strayExempt.length) {
        throw new Error(
          `AgentSpec "${this.id}": contract.writeGate.exempt names tool(s) that are not in contract.writeTools: ${strayExempt.join(', ')}. ` +
            'An exemption from a gate that never covered the tool reads as a decision nobody made.',
        );
      }
      const gated = writeTools.filter((t) => !(gate.exempt ?? []).includes(t));
      if (gated.length) {
        this.addGuard('preTool', [...gated], precondition(gate.ok, gate.reason, gate.prose), {
          layer: 'minimal',
          id: 'minimal:writeGate',
        });
      }
    }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @looprun-ai/core exec vitest run test/write-gate.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Run the core suite for regressions**

Run: `pnpm --filter @looprun-ai/core test`
Expected: PASS. A spec with no `writeGate` installs exactly what it installed before.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/trunk.ts packages/core/src/spec.ts packages/core/test/write-gate.test.ts
git commit -m "feat(core): the contract declares the condition its world refuses writes under"
```

---

### Task 2: `confirmFirst({ when })` — the call decides, not the tool

**Files:**
- Modify: `packages/core/src/guards/confirmation.ts:26-60`
- Test: `packages/core/test/guards-confirmation.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `confirmFirst(opts?: { flag?: string | false; when?: Record<string, (args: Record<string, unknown>) => boolean> })`. The map is keyed BY TOOL because one install covers a tool set and the ids are byte-stable.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/guards-confirmation.test.ts`:

```ts
describe('confirmFirst({ when })', () => {
  const when = { placeHold: (args: Record<string, unknown>) => args.scope === 'workspace' };

  it('the protective branch runs with no consent at all', () => {
    const g = confirmFirst({ when });
    expect(g.check(ctx({ tool: 'placeHold', args: { scope: 'asset', confirmed: true }, consent: [] }))).toBeNull();
  });

  it('the destructive branch is gated exactly as an unconditional tool is', () => {
    const g = confirmFirst({ when });
    expect(g.check(ctx({ tool: 'placeHold', args: { scope: 'workspace', confirmed: true }, consent: [] })))
      .toMatch(/has not confirmed this action/);
  });

  it('a tool with no predicate keeps the unconditional reading', () => {
    const g = confirmFirst({ when });
    expect(g.check(ctx({ tool: 'cancelBooking', args: { confirmed: true }, consent: [] })))
      .toMatch(/has not confirmed this action/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @looprun-ai/core exec vitest run test/guards-confirmation.test.ts -t 'confirmFirst({ when })'`
Expected: FAIL — the first test denies, because today the flag alone decides.

- [ ] **Step 3: Implement the predicate**

Replace the signature and the head of `check` in `packages/core/src/guards/confirmation.ts:40-50`:

```ts
export function confirmFirst(opts?: {
  flag?: string | false;
  when?: Record<string, (args: Record<string, unknown>) => boolean>;
}): Guard {
  const flag = opts?.flag === undefined ? 'confirmed' : opts.flag;
  const when = opts?.when;
  return {
    kind: 'confirmFirst',
    dim: 'run',
    check(ctx) {
      const tool = ctx.tool;
      if (!tool) return null;
      // WHEN a call is destructive is a pure question about its own arguments, and it is asked FIRST:
      // the protective branch of a listed tool is an act the world carries out with no question raised,
      // so a gate on it denies a call no consent can ever license. A tool with no entry here is
      // destructive on every call, which is what a bare list means.
      if (when?.[tool] && !when[tool](ctx.args)) return null;
      // A preview changes nothing and is how the question gets asked; only the acting call is gated.
      if (flag !== false && ctx.args[flag] !== true) return null;
```

Update the doc comment above the function: after the `flag: false` paragraph, add

```
 * `when` answers a SECOND question, on a second axis: WHICH CALLS of this tool are destructive at all.
 * It is a pure predicate over the acting call's own arguments, keyed by tool:
 *
 * ```
 *   placeHold({scope:'asset'})       when → false  → the world executes it; nothing is gated
 *   placeHold({scope:'workspace'})   when → true   → gated on the token, exactly as any destructive call
 * ```
 *
 * It licenses nothing. `ctx.consent` remains the only thing that allows an act.
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @looprun-ai/core exec vitest run test/guards-confirmation.test.ts`
Expected: PASS — the three new tests and every existing one (no predicate ⇒ unchanged behavior).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/guards/confirmation.ts packages/core/test/guards-confirmation.test.ts
git commit -m "feat(core): confirmFirst asks which call is destructive, not which tool"
```

---

### Task 3: `destructiveThrottle` shares the predicate

**Files:**
- Modify: `packages/core/src/guards/confirmation.ts:99-170`
- Test: `packages/core/test/guards-confirmation.test.ts`

**Interfaces:**
- Consumes: the same `when` map shape as Task 2.
- Produces: `destructiveThrottle(tools, opts?: { confirmArg?: string; flagless?: readonly string[]; when?: Record<string, (args: Record<string, unknown>) => boolean> })`.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/guards-confirmation.test.ts`:

```ts
describe('destructiveThrottle({ when })', () => {
  const when = { placeHold: (args: Record<string, unknown>) => args.scope === 'workspace' };
  const ran = (args: Record<string, unknown>) => ({ name: 'placeHold', args, ok: true, tookEffect: true, turnIndex: 1 });

  it('a protective call is not capped by a prior protective effect', () => {
    const g = destructiveThrottle(['placeHold'], { when });
    expect(g.check(ctx({ tool: 'placeHold', args: { scope: 'asset', confirmed: true }, observed: [ran({ scope: 'asset', confirmed: true })] })))
      .toBeNull();
  });

  it('a destructive call is capped by a prior destructive effect', () => {
    const g = destructiveThrottle(['placeHold'], { when });
    expect(g.check(ctx({ tool: 'placeHold', args: { scope: 'workspace', confirmed: true }, observed: [ran({ scope: 'workspace', confirmed: true })] })))
      .toMatch(/already ran this turn/);
  });

  it('a protective effect does not count against a destructive call', () => {
    const g = destructiveThrottle(['placeHold'], { when });
    expect(g.check(ctx({ tool: 'placeHold', args: { scope: 'workspace', confirmed: true }, observed: [ran({ scope: 'asset', confirmed: true })] })))
      .toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @looprun-ai/core exec vitest run test/guards-confirmation.test.ts -t 'destructiveThrottle({ when })'`
Expected: FAIL on the first and third tests — every listed call counts today.

- [ ] **Step 3: Implement**

In `packages/core/src/guards/confirmation.ts`, extend the signature and the two predicates:

```ts
export function destructiveThrottle(
  destructiveTools: string[],
  opts?: {
    confirmArg?: string;
    flagless?: readonly string[];
    when?: Record<string, (args: Record<string, unknown>) => boolean>;
  },
): Guard {
  const set = new Set(destructiveTools);
  const confirmArg = opts?.confirmArg ?? 'confirmed';
  const when = opts?.when;
  // The blast radius is measured in DESTRUCTIVE acts. A call the predicate declines is one the world
  // carries out freely, so it neither consumes the turn's single act nor is stopped by one: three
  // protective holds in a turn are three legitimate calls, and the cap still stops the second freeze.
  const isDestructive = (name: string, args: Record<string, unknown> | undefined): boolean =>
    !when?.[name] || when[name](args ?? {});
```

Fold the predicate into the effect test (`packages/core/src/guards/confirmation.ts:146-147`):

```ts
  const isEffectAmong = (pending: readonly ObservedCall[]) => (o: ObservedCall): boolean =>
    set.has(o.name) && isDestructive(o.name, o.args) && !(pending.includes(o) ? pendingIsProbe(o) : executedIsProbe(o));
```

And short-circuit the gated call itself (`packages/core/src/guards/confirmation.ts:152`):

```ts
      if (!ctx.tool || !set.has(ctx.tool)) return null;
      if (!isDestructive(ctx.tool, ctx.args)) return null;
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @looprun-ai/core exec vitest run test/guards-confirmation.test.ts`
Expected: PASS — including every pre-existing throttle test (no `when` ⇒ `isDestructive` is always true).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/guards/confirmation.ts packages/core/test/guards-confirmation.test.ts
git commit -m "feat(core): the blast-radius cap counts destructive acts, not listed tools"
```

---

### Task 4: `cfg.destructiveWhen` — the auto-install carries the predicate

**Files:**
- Modify: `packages/core/src/spec.ts:328-340` (the cfg block), `:362-364` + `:409-411` (the fields), `:457-511` (`installBase`)
- Test: `packages/core/test/agent-spec.test.ts`

**Interfaces:**
- Consumes: `confirmFirst({ when })` (Task 2), `destructiveThrottle(tools, { when })` (Task 3).
- Produces: `cfg.destructiveWhen?: Record<string, (args: Record<string, unknown>) => boolean>`; `protected readonly destructiveWhen`.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/agent-spec.test.ts`:

```ts
describe('destructiveWhen', () => {
  const build = (over: Record<string, unknown> = {}) =>
    new AgentSpecBase({
      id: 'workspace',
      persona: 'The workspace desk.',
      scope: 'Holds.',
      tools: ['placeHold', 'releaseHold'],
      destructiveTools: ['placeHold'],
      destructiveWhen: { placeHold: (args: Record<string, unknown>) => args.scope === 'workspace' },
      destructiveLabels: { placeHold: 'freeze the entire workspace' },
      ...over,
    });

  it('the workspace-hold shape constructs: the label names a listed tool', () => {
    expect(() => build()).not.toThrow();
  });

  it('the protective branch is allowed and the destructive branch is gated', () => {
    const s = build();
    const gate = s.guards.preTool.find((b) => b.id === 'base:confirmFirst')!;
    const at = (args: Record<string, unknown>) =>
      gate.guard.check({ tool: 'placeHold', args, consent: [], world: {} as never, observed: [], turnIndex: 1, userText: '', history: [] } as never);
    expect(at({ scope: 'asset', confirmed: true })).toBeNull();
    expect(at({ scope: 'workspace', confirmed: true })).toMatch(/has not confirmed this action/);
  });

  it('a predicate for a tool that is not destructive throws at construction', () => {
    expect(() => build({ destructiveWhen: { releaseHold: () => true } }))
      .toThrow(/destructiveWhen names tool\(s\) that are not in destructiveTools: releaseHold/);
  });

  it('a predicated arg-mechanism tool still owes its confirm flag', () => {
    expect(() => build().assertDestructiveConfirmable([{ name: 'placeHold', inputSchema: { properties: { scope: {} } } }]))
      .toThrow(/must declare a 'confirmed' flag/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @looprun-ai/core exec vitest run test/agent-spec.test.ts -t destructiveWhen`
Expected: FAIL — `destructiveWhen` is not a known option, so the predicate never reaches the guard.

- [ ] **Step 3: Declare the option**

In `packages/core/src/spec.ts`, after the `destructiveLabels` member of the cfg interface (`:339`):

```ts
  /** Per destructive tool whose destructiveness depends on its ARGUMENTS, the pure predicate that says
   *  which calls are destructive. The tool stays on {@link destructiveTools} — that is what installs the
   *  protocol and what makes a {@link destructiveLabels} entry legal for it — and the predicate decides
   *  which of its calls the protocol applies to. A tool with no predicate is destructive on every call.
   *  Reads the acting call's own arguments and nothing else: it answers what the call IS, never who
   *  licensed it. */
  destructiveWhen?: Record<string, (args: Record<string, unknown>) => boolean>;
```

Add the field beside `destructiveLabels` (`packages/core/src/spec.ts:364`):

```ts
  protected readonly destructiveWhen: Record<string, (args: Record<string, unknown>) => boolean>;
```

and its assignment beside the others (`packages/core/src/spec.ts:411`):

```ts
    this.destructiveWhen = { ...(cfg.destructiveWhen ?? {}) };
```

- [ ] **Step 4: Wire it into `installBase`**

In `packages/core/src/spec.ts:457-511`, add the stray-key check beside the stray-label check (after
the block ending at `:479`):

```ts
    // A predicate for a tool that is not destructive is a gate on nothing: the protocol it modifies was
    // never installed on that tool.
    const strayWhen = Object.keys(this.destructiveWhen).filter((t) => !destructive.includes(t));
    if (strayWhen.length) {
      throw new Error(
        `AgentSpec "${this.id}": destructiveWhen names tool(s) that are not in destructiveTools: ${strayWhen.join(', ')}.`,
      );
    }
```

and pass the map to all three installs (`packages/core/src/spec.ts:502-510`):

```ts
    const when = this.destructiveWhen;
    if (argTools.length) {
      this.addGuard('preTool', argTools, confirmFirst({ when }), { layer: 'base', id: 'base:confirmFirst' });
    }
    if (priorAskTools.length) {
      this.addGuard('preTool', priorAskTools, confirmFirst({ flag: false, when }), { layer: 'base', id: 'base:confirmFirstPriorAsk' });
    }
    this.addGuard('preTool', destructive, destructiveThrottle(destructive, { flagless: priorAskTools, when }), { layer: 'base', id: 'base:destructiveThrottle' });
```

`assertDestructiveConfirmable` is unchanged on purpose: the destructive branch of a predicated tool
is gated on the same `confirmed` flag every arg-mechanism tool is, so a schema without it still makes
the protocol unhonourable. Add that sentence to its doc comment, after "A `'prior-ask'` tool is a
zero-arg confirm — exempt by design.":

```
   * A predicated tool is NOT exempt: its destructive branch is gated on the same flag, so a schema
   * without it leaves that branch asking forever.
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @looprun-ai/core exec vitest run test/agent-spec.test.ts && pnpm --filter @looprun-ai/core test`
Expected: PASS — all four new tests, and the whole core suite.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/spec.ts packages/core/test/agent-spec.test.ts
git commit -m "feat(core): a spec declares which calls of a destructive tool are destructive"
```

---

### Task 5: The parity law — a world that refuses a write no lane gates

**Files:**
- Modify: `packages/eval/src/lint-subject.ts:115-169`
- Test: `packages/eval/test/lint-subject-parity.test.ts` (create)

**Interfaces:**
- Consumes: `Subject` (`makeWorld`, `specs`, `cases`, `toolDefs`), `WRITE_NAME_RE`, `tryPreset` — all already in the file.
- Produces: the finding `WRITE-REFUSED-UNGATED`.

- [ ] **Step 1: Write the failing test**

Create `packages/eval/test/lint-subject-parity.test.ts`:

```ts
/**
 * THE PARITY LAW — a condition the world refuses a write under is a condition some spec gates.
 */
import { describe, it, expect } from 'vitest';
import { AgentSpecBase } from '@looprun-ai/core';
import { lintSubject } from '../src/lint-subject.js';
import type { Subject } from '../src/subject.js';

const CONTRACT = {
  voice: 'A rentals desk.',
  stateBlock: () => '',
  coreInvariants: [],
  languageClause: 'Answer in English.',
  writeTools: ['createBooking'],
} as never;

const makeWorld = (preset?: string) => {
  if (preset && !['default', 'suspended'].includes(preset)) throw new Error(`unknown preset ${preset}`);
  const suspended = preset === 'suspended';
  return {
    status: () => (suspended ? 'suspended' : 'active'),
    exec: (name: string) => (suspended ? { ok: false } : { ok: true, id: 'BK-1' }),
  } as never;
};

const subject = (contract: unknown): Subject => {
  const spec = new AgentSpecBase({
    id: 'rentals', persona: 'p', scope: 's', tools: ['createBooking'], contract: contract as never,
  });
  return {
    dir: '.', specs: { rentals: spec }, contract: contract as never,
    caseAgent: { 'c-1': 'rentals' },
    cases: [{ id: 'c-1', setup: { preset: 'suspended' }, turns: [{ userText: 'book it' }], targets: ['minimal:claimIsGrounded'] }],
    toolDefs: [{ name: 'createBooking', description: '', inputSchema: { properties: {} } }] as never,
    makeWorld,
  } as Subject;
};

describe('WRITE-REFUSED-UNGATED', () => {
  it('accuses a lane whose world refuses a write it never gates', () => {
    const out = lintSubject(subject(CONTRACT));
    expect(out.some((f) => f.includes("WRITE-REFUSED-UNGATED: preset 'suspended'") && f.includes('createBooking'))).toBe(true);
  });

  it('is silent once the contract declares the gate', () => {
    const gated = { ...CONTRACT, writeGate: { ok: (w: { status(): string }) => w.status() !== 'suspended', reason: 'This workspace is suspended.' } };
    expect(lintSubject(subject(gated)).some((f) => f.includes('WRITE-REFUSED-UNGATED'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @looprun-ai/eval exec vitest run test/lint-subject-parity.test.ts`
Expected: FAIL on the first test — no such finding exists.

- [ ] **Step 3: Implement the law**

In `packages/eval/src/lint-subject.ts`, add above `lintSubject`:

```ts
/** A write the world carries out on the default preset and refuses on another is refused BY STATE —
 *  the differential is what makes the condition decidable without reading the world's source. */
function refusesWrite(world: AgentWorld, name: string): boolean {
  try {
    const r = world.exec(name, {}) as Record<string, unknown> | undefined;
    if (!r || typeof r !== 'object') return false;
    return r.ok === false || r.success === false;
  } catch {
    return false; // A throw on empty args is argument validation, not a state refusal.
  }
}

/** Does any preTool guard of this spec deny the call on this world? */
function anyGateDenies(spec: AgentSpec, world: AgentWorld, tool: string): boolean {
  return (spec.guards.preTool ?? []).filter((b) => !b.disabled).some((b) => {
    const target = b.target;
    if (Array.isArray(target) && !target.includes(tool)) return false;
    try {
      return typeof b.guard.check({
        tool, args: {}, world, observed: [], turnIndex: 0, userText: '', history: [], consent: [],
      } as never) === 'string';
    } catch {
      return false;
    }
  });
}

/**
 * THE PARITY LAW. A world refuses a write under some condition; a preset is that condition made
 * reachable. Every lane that carries the write must have a spec-side gate that denies on that preset —
 * otherwise the refusal reaches the model as a tool failure and the lane's prose invents the reason.
 * One declaration satisfies it for every lane (`contract.writeGate`); six copies satisfy it too, and
 * that is the shape this law exists to make unnecessary rather than to forbid.
 */
function parityFindings(subject: Subject): string[] {
  const out: string[] = [];
  if (typeof subject.makeWorld !== 'function') return out;
  const base = tryPreset(subject.makeWorld, 'default').world;
  if (!base) return out;
  const writes = new Set(subject.contract?.writeTools ?? (subject.toolDefs ?? []).map((t) => t.name).filter((n) => WRITE_NAME_RE.test(n)));
  const presets = new Set<string>();
  for (const c of subject.cases ?? []) if (c.setup?.preset && c.setup.preset !== 'default') presets.add(c.setup.preset);

  for (const preset of presets) {
    const world = tryPreset(subject.makeWorld, preset).world;
    if (!world) continue;
    for (const tool of writes) {
      if (!refusesWrite(world, tool) || refusesWrite(base, tool)) continue;
      for (const [agent, spec] of Object.entries(subject.specs ?? {})) {
        if (!spec.surface.tools.includes(tool)) continue;
        if (anyGateDenies(spec, world, tool)) continue;
        out.push(
          `WRITE-REFUSED-UNGATED: preset '${preset}' refuses '${tool}' and agent ${agent} carries it with no gate that denies there — ` +
            'the refusal reaches the model as a tool failure and the reply invents its reason. Declare contract.writeGate, or gate the lane on the same condition',
        );
      }
    }
  }
  return out;
}
```

Extend the import at `packages/eval/src/lint-subject.ts:14`:

```ts
import type { AgentSpec, AgentWorld } from '@looprun-ai/core';
```

(already present — no change needed) and fold the family into `lintSubject`:

```ts
export function lintSubject(subject: Subject): string[] {
  return [...coverageFindings(subject), ...worldFindings(subject), ...parityFindings(subject)];
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @looprun-ai/eval exec vitest run test/lint-subject-parity.test.ts && pnpm --filter @looprun-ai/eval test`
Expected: PASS — both new tests, and the eval suite.

- [ ] **Step 5: Commit**

```bash
git add packages/eval/src/lint-subject.ts packages/eval/test/lint-subject-parity.test.ts
git commit -m "feat(eval): the artifact laws accuse a write the world refuses and no lane gates"
```

---

### Task 6: The target-silence law — a target must be able to fire on a preset the case runs

**Files:**
- Modify: `packages/eval/src/lint-subject.ts` (the coverage family)
- Test: `packages/eval/test/lint-subject-parity.test.ts`

**Interfaces:**
- Consumes: `anyGateDenies`-style evaluation from Task 5; `tryPreset`.
- Produces: the finding `TARGET-SILENT-ON-EVERY-PRESET`.

- [ ] **Step 1: Write the failing test**

Append to `packages/eval/test/lint-subject-parity.test.ts`:

```ts
describe('TARGET-SILENT-ON-EVERY-PRESET', () => {
  const gated = { ...CONTRACT, writeGate: { ok: (w: { status(): string }) => w.status() !== 'suspended', reason: 'This workspace is suspended.' } };

  it('is silent when the target denies on the case preset', () => {
    const s = subject(gated);
    s.cases = [{ ...s.cases[0], targets: ['minimal:writeGate'] }];
    expect(lintSubject(s).some((f) => f.includes('TARGET-SILENT-ON-EVERY-PRESET'))).toBe(false);
  });

  it('accuses a target that can never deny on the presets the case runs', () => {
    const s = subject(gated);
    s.cases = [{ ...s.cases[0], setup: { preset: 'default' }, targets: ['minimal:writeGate'] }];
    expect(lintSubject(s).some((f) => f.includes("TARGET-SILENT-ON-EVERY-PRESET: case \"c-1\" targets 'minimal:writeGate'"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @looprun-ai/eval exec vitest run test/lint-subject-parity.test.ts -t TARGET-SILENT`
Expected: FAIL on the second test — no such finding exists.

- [ ] **Step 3: Implement**

In `packages/eval/src/lint-subject.ts`, add beside `anyGateDenies`:

```ts
/**
 * A target the case can never make speak. The question is about STATE, not about the call list: a
 * guard bound to a tool the case never calls is doing its job when the case's forced path reaches it,
 * and it goes silent precisely when the agent complies. So the test is run BEFORE any compliance —
 * an empty `observed`, on the world the case declares — and a target that stays silent on every one
 * of them proves nothing wherever it is listed.
 *
 * Only world-dim gates are decidable this way: a guard that reads the acting call's arguments cannot
 * be evaluated without inventing them, and an invented argument is an invented accusation.
 */
const WORLD_GATE_KINDS = new Set(['precondition', 'consentRequired']);

function targetSilenceFindings(subject: Subject): string[] {
  const out: string[] = [];
  if (typeof subject.makeWorld !== 'function') return out;
  for (const c of subject.cases ?? []) {
    const agent = subject.caseAgent?.[c.id];
    const spec = agent ? subject.specs?.[agent] : undefined;
    if (!spec) continue;
    const world = tryPreset(subject.makeWorld, c.setup?.preset ?? 'default').world;
    if (!world) continue;
    for (const id of c.targets ?? []) {
      const bound = (spec.guards.preTool ?? []).find((b) => b.id === id && !b.disabled);
      if (!bound || !WORLD_GATE_KINDS.has(bound.guard.kind)) continue;
      const tools = Array.isArray(bound.target) ? bound.target : spec.surface.tools;
      const speaks = tools.some((tool) => {
        try {
          return typeof bound.guard.check({
            tool, args: {}, world, observed: [], turnIndex: 0, userText: '', history: [], consent: [],
          } as never) === 'string';
        } catch {
          return true; // A guard that throws here is a defect of its own; the execution lint owns it.
        }
      });
      if (!speaks) {
        out.push(
          `TARGET-SILENT-ON-EVERY-PRESET: case "${c.id}" targets '${id}', which is silent on preset '${c.setup?.preset ?? 'default'}' before the agent has done anything — ` +
            'the case grades a rule that cannot speak there. Run the case on the preset whose state the guard refuses, or target the rule the case really tests',
        );
      }
    }
  }
  return out;
}
```

Fold it in:

```ts
export function lintSubject(subject: Subject): string[] {
  return [...coverageFindings(subject), ...worldFindings(subject), ...parityFindings(subject), ...targetSilenceFindings(subject)];
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @looprun-ai/eval exec vitest run test/lint-subject-parity.test.ts && pnpm --filter @looprun-ai/eval test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/eval/src/lint-subject.ts packages/eval/test/lint-subject-parity.test.ts
git commit -m "feat(eval): a case's target must be able to speak on a preset the case runs"
```

---

### Task 7: The id laws and the absolute on accepted gaps

**Files:**
- Modify: `packages/eval/src/lint.ts:85-120` (`lintSpecLaws`), `packages/eval/src/lint-subject.ts:26-105` (the coverage family)
- Test: `packages/eval/test/lint-subject-parity.test.ts`

**Interfaces:**
- Consumes: `AgentSpec.guards`, `Subject.caseAgent`.
- Produces: the finding `GUARD-ID-POSITIONAL`; the coverage sets keyed by `${agent} ${id}`; the `GUARD-NEVER-TARGETED` message that names both repairs and no third one.

- [ ] **Step 1: Write the failing test**

Append to `packages/eval/test/lint-subject-parity.test.ts`:

```ts
describe('the id laws', () => {
  it('a minted, positional guard id is a violation', async () => {
    const { lintSpecLaws } = await import('../src/lint.js');
    const spec = new AgentSpecBase({ id: 'rentals', persona: 'p', scope: 's', tools: ['createBooking'], contract: CONTRACT });
    spec.addGuard('preTool', ['createBooking'], { kind: 'custom', dim: 'run', check: () => null, prose: () => 'x' } as never);
    expect(lintSpecLaws({ rentals: spec }).some((f) => f.includes('GUARD-ID-POSITIONAL') && f.includes('agent:custom#1'))).toBe(true);
  });

  it('a guard id shared by two lanes is not covered by the other lane targeting it', () => {
    const s = subject(CONTRACT);
    const other = new AgentSpecBase({ id: 'fleet', persona: 'p', scope: 's', tools: ['createBooking'], contract: CONTRACT });
    other.addGuard('preTool', ['createBooking'], { kind: 'precondition', dim: 'run', check: () => 'no', prose: () => 'x' } as never, { id: 'agent:sharedGate' });
    const mine = s.specs.rentals;
    mine.addGuard('preTool', ['createBooking'], { kind: 'precondition', dim: 'run', check: () => 'no', prose: () => 'x' } as never, { id: 'agent:sharedGate' });
    s.specs = { rentals: mine, fleet: other };
    s.cases = [{ ...s.cases[0], targets: ['agent:sharedGate'] }];
    expect(lintSubject(s).some((f) => f.includes("GUARD-NEVER-TARGETED: 'agent:sharedGate' on agent fleet"))).toBe(true);
  });

  it('the never-targeted message offers no way to accept the gap', () => {
    const s = subject(CONTRACT);
    s.cases = [{ ...s.cases[0], targets: [] }];
    const msg = lintSubject(s).find((f) => f.includes('GUARD-NEVER-TARGETED'));
    expect(msg).toMatch(/Repair one of/);
    expect(msg).not.toMatch(/accept|ignore|allowlist/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @looprun-ai/eval exec vitest run test/lint-subject-parity.test.ts -t 'the id laws'`
Expected: FAIL on all three.

- [ ] **Step 3: The positional-id law**

In `packages/eval/src/lint.ts`, inside `lintSpecLaws`, per spec:

```ts
    // A MINTED id is positional: `${layer}:${kind}#${n}` counts installs, so inserting one guard above
    // silently re-points every case and every profile keyed on the ids below it. An explicit id is the
    // only stable name a case can target.
    for (const bound of [...spec.guards.onInput, ...spec.guards.preTool, ...spec.guards.postTool, ...spec.guards.onReply]) {
      if (/#\d+$/.test(bound.id)) {
        out.push(
          `spec "${spec.id}": GUARD-ID-POSITIONAL: '${bound.id}' was minted from an install counter — a guard inserted above it re-points every case and profile that names it. Pass an explicit { id }`,
        );
      }
    }
```

- [ ] **Step 4: The per-lane coverage key and the absolute**

In `packages/eval/src/lint-subject.ts`, key both sides of the coverage diff by lane. Where `authored`
and `targeted` are built, use `${agent} ${id}`:

```ts
  // A guard id is not unique across lanes: two specs may install `agent:sharedGate`, and a case that
  // targets it on one lane says nothing about the copy on the other. The diff is per (agent, guardId)
  // so a copy no case on ITS lane can reach still reads as uncovered.
  const key = (agent: string, id: string) => `${agent} ${id}`;
```

and replace the final loop with:

```ts
  for (const [agent, spec] of Object.entries(subject.specs ?? {})) {
    for (const id of authoredGuardIds(spec)) {
      if (targeted.has(key(agent, id))) continue;
      out.push(
        `GUARD-NEVER-TARGETED: '${id}' on agent ${agent} shipped and no case on that lane targets it — a guard the exam never exercises passes in BOTH variants of a discrimination run, so it reads as coverage while never having fired. Repair one of: write a case whose preset makes it deny; give the world the preset that condition needs. A gap here cannot be accepted, only closed`,
      );
    }
  }
```

Populate `targeted` with `key(agent, t)` where the case's agent is `subject.caseAgent[c.id]`.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @looprun-ai/eval test`
Expected: PASS — the three new tests and the existing suite. Expect to update existing assertions
that match the old `GUARD-NEVER-TARGETED` wording; update the assertion, never the law.

- [ ] **Step 6: Commit**

```bash
git add packages/eval/src/lint.ts packages/eval/src/lint-subject.ts packages/eval/test/lint-subject-parity.test.ts
git commit -m "feat(eval): guard ids are explicit, coverage is per lane, and a gap is closed not accepted"
```

---

### Task 8: The doc surfaces

**Files:**
- Modify: `packages/core/src/guards/catalog.ts:135-150` and the `precondition` entry
- Modify: `packages/core/GUARDS.md` (`:321`, `:322`, `:536-538`, `:585`, `:664`)
- Modify: `docs/tutorial/03-agent-anatomy.md` (`:158-159`, `:291`, `:333`, `:384-390`)
- Modify: `docs/tutorial/05-running-and-eval.md` (`:209-217`, `:506-510`, `:526`)
- Modify: `packages/eval/README.md`, `BACKLOG.md`
- Regenerate: `docs/tutorial/04-guards.md`

- [ ] **Step 1: The catalog is the source**

In `packages/core/src/guards/catalog.ts`, the `confirmFirst` entry: replace "Takes no options." in
`summary` with "The tool's own arguments decide which of its calls are destructive." and append to
`whenToUse`:

```
 A tool that is destructive on one branch and protective on another declares `destructiveWhen` on the spec: the predicate reads the acting call's arguments and says which calls the protocol applies to. It licenses nothing — consent is still the token the user typed.
```

Set `example` to:

```ts
    example: `confirmFirst({ when: { placeHold: (args) => args.scope === 'workspace' } })`,
```

In the `destructiveThrottle` entry, append to `whenToUse`:

```
 It shares the spec's `destructiveWhen` predicates, so the cap counts destructive acts: three protective calls in one turn are three legitimate calls, and the second destructive one is still stopped.
```

In the `precondition` entry, append to `whenToUse`:

```
 A condition EVERY lane of the domain refuses writes under belongs on `contract.writeGate` instead — declared once, installed on every spec that carries a write. `precondition` stays the gate for what one lane alone refuses on.
```

- [ ] **Step 2: Regenerate the chapter and verify it is in sync**

Run: `pnpm docs:guards && node scripts/gen-guards-chapter.mjs --check`
Expected: the chapter is rewritten and `--check` exits 0. Never hand-edit `docs/tutorial/04-guards.md`.

- [ ] **Step 3: `packages/core/GUARDS.md`**

| line | what to write |
|---|---|
| `:321` (contract table) | add a row: `cfg.contract.writeGate` **present** → `precondition(ok, reason, prose)` on `contract.writeTools` minus `exempt` (preTool, `minimal:writeGate`) — the domain's one statement of what its world refuses every write under. Declared with no `writeTools`, or with an `exempt` entry that is not a write tool, it throws at construction. |
| `:322` (destructive row) | state that the list installs the protocol and `cfg.destructiveWhen` decides which CALLS of a listed tool it applies to; the ⊆-validation of `destructiveLabels` and `confirmMechanism` is unchanged, and `destructiveWhen` is validated the same way. |
| `:536-538` (construction throws) | keep the `destructiveLabels`-for-a-non-destructive-tool throw as written, and add the `destructiveWhen` stray-key throw beside it. A predicated tool IS on the list, so its label is legal — this is the sentence that must read true after the change. |
| `:585` (`confirmFirst` options) | two options: `flag` says WHICH call acts, `when` says WHICH calls are destructive. Neither is about licensing. |
| `:664` (labels table) | a label is owed by a tool whose destructive branch names a record its arguments never carry — the workspace hold is that shape, and it is listed with a predicate. |

- [ ] **Step 4: The tutorial chapters**

`docs/tutorial/03-agent-anatomy.md`: the `destructiveTools` row (`:158`) gains the predicate as the
answer for a tool that is destructive per call; the `CONTRACT` block (`:291`) gains a `writeGate`
declaration; the `writeTools?` row (`:333`) gains a `writeGate?` row beside it; the "declaring
installs a protocol" section (`:384`) states that the protocol binds the destructive branch.

`docs/tutorial/05-running-and-eval.md`: the run-start throw (`:209-217`) states that a predicated
arg-mechanism tool still owes its `confirmed` flag; the preflight lint table (`:506-510`) gains the
three new findings under `lintSubject` with what each one reads (the subject's presets); the
`GUARD-NEVER-TARGETED` line (`:526`) states that the gap is closed, never accepted.

- [ ] **Step 5: `packages/eval/README.md` and `BACKLOG.md`**

README: `--spec-laws` covers the parity law, the target-silence law and the positional-id law, and
what each needs from the subject. `BACKLOG.md:13` (the probe-parity row): the execution-based half is
the same question this law answers, and the row states which part remains.

- [ ] **Step 6: Verify the docs gate**

Run: `pnpm test`
Expected: PASS — including `node scripts/gen-guards-chapter.mjs --check`, which fails on a
hand-edited chapter.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/guards/catalog.ts docs/tutorial packages/core/GUARDS.md packages/eval/README.md BACKLOG.md
git commit -m "docs: the vocabulary says a call is destructive and a contract states its write gate"
```

---

### Task 9: The proof record

**Files:**
- Modify: `packages/core/test/proofs/catalog-run-output.ts:198-260`
- Create: `governance/proofs/2026-08-05-conditional-destructiveness.md`
- Regenerate: `governance/MATRIX.md`

- [ ] **Step 1: Add the predicate polarity to the `confirmFirst` proof**

In `packages/core/test/proofs/catalog-run-output.ts`, extend `confirmFirstProof.specTweaks` with
`destructiveWhen: { purgeAll: (args) => args.scope === 'workspace' }` is NOT the shape to use —
`purgeAll` is `prior-ask`. Add a third destructive tool instead, so the proof carries the branch the
world executes:

```ts
  specTweaks: {
    destructiveTools: ['deleteItem', 'purgeAll', 'placeHold'],
    confirmMechanism: { purgeAll: 'prior-ask' },
    destructiveLabels: { purgeAll: 'delete every item' },
    destructiveWhen: { placeHold: (args: Record<string, unknown>) => args.scope === 'workspace' },
  },
```

and a case:

```ts
    {
      name: 'the protective branch of a predicated tool runs with no consent',
      polarity: 'positive',
      ctx: { tool: 'placeHold', args: { scope: 'asset', confirmed: true }, consent: [], turnIndex: 1 },
      l1: 'silent',
      l3: {
        preset: 'empty',
        turns: [{ userText: 'put a hold on itm-1' }],
        script: [
          [{ tool: 'placeHold', args: { scope: 'asset', id: 'itm-1', confirmed: true } }],
          [{ tool: 'respond', args: { message: 'The hold is on itm-1.', did: [{ op: 'hold', target: 'itm-1', outcome: 'success' }] } }],
        ],
        expect: 'pass',
      },
    },
```

Do the same for the `destructiveThrottle` proof: a turn with two protective calls passes, a turn with
two destructive ones is vetoed.

- [ ] **Step 2: Run the proofs**

Run: `pnpm proofs:run`
Expected: PASS, and the per-kind completeness describes for `confirmFirst` and `destructiveThrottle`
stay green with the added polarity.

- [ ] **Step 3: Write the record and regenerate the matrix**

```bash
pnpm proofs:record -- \
  --slug conditional-destructiveness \
  --change "a call is destructive by predicate; the contract states the condition its world refuses writes under" \
  --scope runtime
```

Expected: `governance/proofs/2026-08-05-conditional-destructiveness.md` with `verdict: PASS`, and a
regenerated `governance/MATRIX.md`.

- [ ] **Step 4: Verify the gate**

Run: `node scripts/proofs/check-record-required.mjs`
Expected: green — the core change carries a passing record.

- [ ] **Step 5: Commit**

```bash
git add packages/core/test/proofs governance/proofs governance/MATRIX.md
git commit -m "test(proofs): the predicate's silent branch is proven beside the gated one"
```

---

### Task 10: The `agentspec` skill (separate repo, separate commit)

**Files (all under `~/Dev/js/looprun/agentspec/skill/`):**
- Modify: `references/guard-catalog.md` (`:49-53`, `:331`, `:333-334`, `:486`, `:496`)
- Modify: `references/norms.md` (`:235-257`, `:310-314`, `:517`)
- Modify: `references/spec-template.ts`, `references/test.md`, `references/ship.md`
- Modify: `scripts/lint-authoring.mjs`

- [ ] **Step 1: Resolve the contradiction the skill publishes**

`references/guard-catalog.md:486` advises that only genuinely destructive tools get `confirmFirst`;
`references/norms.md:517` requires every destructive tool on the list. A tool destructive on one
branch satisfies neither. Both places now route to one answer:

```
a tool whose destructiveness depends on its arguments
  → it goes ON destructiveTools, and cfg.destructiveWhen carries the predicate
  → the protective branch runs untouched; the label stays legal because the tool is listed
  → nothing hand-reads ctx.consent, ever
```

Update `references/guard-catalog.md:333` to `confirmFirst({ flag?, when? })` with the predicate's
meaning, and `:334` to state that the throttle shares it.

- [ ] **Step 2: Route the shared world condition to the contract**

`references/guard-catalog.md:331` (the `precondition` row) and the laws-to-guards table (`:496`), plus
the `norms.md:310-314` walk: a condition every lane refuses writes under is `contract.writeGate`;
`precondition` stays for what one lane alone refuses on. Add `writeGate` to the contract block in
`references/spec-template.ts` and to the NORMS checklist (`norms.md:517`) beside the `writeTools` line.

- [ ] **Step 3: The three authoring rules the engine now enforces**

Add to the NORMS checklist and to `references/test.md`:

```
- [ ] every addGuard carries an explicit { id } — a minted id is positional and re-points on insert
- [ ] a case targets a guard on ITS OWN lane; a shared id on another lane is not coverage
- [ ] every shipped guard has a case that makes it DENY on a preset the case runs;
      a gap is closed with a case or a preset — there is no way to record one
```

- [ ] **Step 4: Teach `lint-authoring.mjs` the id rule**

Add a check that flags `addGuard(` calls in a subject's spec files with no `{ id:` in the same call,
so the author sees it before the engine lint does. Print the file, the line and the fix.

- [ ] **Step 5: Verify**

```bash
cd ~/Dev/js/looprun/agentspec
node skill/scripts/lint-authoring.mjs subjects/*/specs 2>&1 | head -20
```
Expected: the new rule fires on an id-less `addGuard` and is silent on an explicit one.

- [ ] **Step 6: Commit (in the agentspec repo)**

```bash
cd ~/Dev/js/looprun/agentspec
git add skill
git commit -m "docs(skill): a call is destructive by predicate, and one contract states the write gate"
```

---

## Self-Review

**Spec coverage:**

| spec section | task |
|---|---|
| §1 conditional destructiveness | 2, 3, 4 |
| §1 the label/list deadlock | 4 (the workspace-hold shape constructs), 8 (the two `GUARDS.md` sentences), 9 (the proven silent branch) |
| §1 `destructiveThrottle` open question | 3 — it shares the predicate |
| §1 `assertDestructiveConfirmable` open question | 4 — unchanged, and the doc says why |
| §2 `contract.writeGate` | 1 |
| §2 opt-out open question | 1 — an exemption list on the contract |
| §3 the parity law | 5 |
| §3 the corrected preset-aware predicate | 6 |
| §3 the two neighbours (positional id, per-lane diff) | 7 |
| §4 the two ledgers | 7 — the absolute, and the message that names both repairs |
| propagation: the catalog is the source | 8 steps 1-2 |
| propagation: the doc surfaces | 8 steps 3-5 |
| propagation: the `agentspec` skill | 10 |
| propagation: the proof record | 9 |

**Deviation from the spec's sketch, stated:** §1 shows `confirmFirst({ when: (args) => … })` with a
bare predicate. The implemented option is a map keyed by tool, because one install covers a tool set
and the guard ids are byte-stable — a bare predicate would force one install per tool and rename
`base:confirmFirst`. The declaration an author writes is `cfg.destructiveWhen`, which is per tool
either way.
