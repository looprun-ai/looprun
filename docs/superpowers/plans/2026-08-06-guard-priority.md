# Guard Priority Implementation Plan

> **CLOSED.** Shipped on `main`. `Priority` and its five values live in `packages/core/src/spec.ts`;
> the contract field is `writeTools` bound at priority `changeAllowed`
> (`packages/core/src/assembled-prompt.ts`); the catalog category is `consent`
> (`packages/core/src/guards/catalog.ts`).
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the guard binding's `layer` to `priority`, so a guard id's prefix names the question that guard answers instead of a class hierarchy that no longer exists.

**Architecture:** One type (`Layer` → `Priority`) with five values, one order map, one binding field, seven engine guard ids, one contract field (`writeGate` → `changeAllowed`), and one catalog category (`confirmation` → `consent`). The rename is mechanical everywhere except one place: the coverage census keys on the old value `minimal`, which splits into three priorities, so its rule is restated. Four repos land as four commits.

**Tech Stack:** TypeScript, pnpm workspaces, vitest, Node ≥22.

**Spec:** `docs/superpowers/specs/2026-08-06-guard-priority-design.md`

## Global Constraints

- **English only.** Every byte written to a file is English — identifiers, comments, docs, commit messages, prompt strings, regex alternatives. Only the chat reply follows the user's language.
- **AS-IS only.** No comment or doc narrates change ("was", "used to", "no longer", "kept for compatibility") and none cites the evidence behind a rule ("measured over N turns", "see foo.test.ts"). Rewrite a stale comment to the new truth.
- **No compatibility alias.** Pre-1.0 carries zero retro-compatibility: the old name is deleted in the same commit that introduces the new one. No shim, no deprecation, no re-export.
- **No name is explained by what it replaced.** No file says "formerly the layer" or "renamed from `minimal:`". The two exceptions are `CHANGELOG.md` (a dated release note IS the pair of names) and this plan plus its design spec.
- **The five priority values, verbatim:** `agent` · `changeAllowed` · `consent` · `honesty` · `always`.
- **The order, verbatim:** `{ agent: 0, changeAllowed: 1, consent: 2, honesty: 3, always: 4 }`.
- **The seven engine ids, verbatim:** `always:noDuplicateCall` · `always:degenerationGuard` · `honesty:claimIsGrounded` · `honesty:claimIsComplete` · `consent:confirmFirst` · `consent:destructiveThrottle` · `changeAllowed:precondition`.
- **`full` is deleted** — the union member and its order slot both go.
- **One commit per repo.** A partial rename is worse than none: a reader then meets both vocabularies in the same file. Within `looprun`, Tasks 1–7 are separate commits on one branch; `agentspec` is one commit of its own.

## File Structure

```
looprun/
  packages/core/src/spec.ts                    the type, the order map, the binding fields,
                                               addGuard/addReplyCheck/addMutator, the seven installs,
                                               the contract read + its two throw messages
  packages/core/src/index.ts                   the public barrel export
  packages/core/src/internal.ts                one comment naming the type
  packages/core/src/assembled-prompt.ts        the `writeGate?` render input
  packages/core/src/guards/catalog.ts          the category union, two entries, precondition prose
  packages/core/src/guards/confirmation.ts  →  packages/core/src/guards/consent.ts
  packages/core/src/guards/index.ts            the barrel's import path + its category list comment
  packages/core/src/testing/proof.ts           the proof `auto` field: which priority auto-installs the kind
  packages/core/test/proofs/catalog-*.ts       the `auto` values of the four constructor-installed kinds
  skills/looprun-governance/                   the proof-case scaffold script + its authoring reference
  packages/core/GUARDS.md                      hand-written; four rows name the ids
  packages/eval/src/lint-subject.ts            the census filter + its comment, the writeGate repair
  packages/eval/src/validate.ts                the census filter (second copy)
  packages/eval/src/norms-config.ts            seven `layer: 'agent'` installs
  packages/eval/README.md                      the WRITE-REFUSED-UNGATED row
  docs/tutorial/03-agent-anatomy.md            the `writeGate?` contract-field row
  docs/tutorial/04-guards.md                   GENERATED §5 — regenerated, never hand-edited
  docs/tutorial/05-running-and-eval.md         the `targets` census prose + the parity repair
  docs/tutorial/snippets/scheduler-subject/evals/cases.ts   two case targets
  tests/guard-priority.test.mjs                NEW — the grep gate
  package.json                                 wires the gate into `pnpm test` + `pnpm test:laws`
```

Tests that assert the renamed surface:

```
packages/core/test/agent-spec.test.ts          ten assertions on ids and order
packages/core/test/write-gate.test.ts          the contract field + the state gate's id
packages/core/test/guards-confirmation.test.ts  →  guards-consent.test.ts
packages/core/test/redteam/redteam-r2-partition.test.ts:406   one `layer: 'agent'`
packages/eval/test/lint-subject-parity.test.ts  five id strings
```

---

## Task 1: The type, the order, the field

**Files:**
- Modify: `packages/core/src/spec.ts:38` `:73` `:91` `:200` `:295` `:305` `:548` `:568` `:571` `:575` `:579` `:580` `:583`
- Modify: `packages/core/src/index.ts:86`
- Modify: `packages/core/src/internal.ts:163`
- Modify: `packages/eval/src/norms-config.ts:326` `:335` `:339` `:345` `:351` `:361` `:371`
- Modify: `packages/core/test/agent-spec.test.ts:130-137`
- Modify: `packages/core/test/redteam/redteam-r2-partition.test.ts:406`
- Modify: `packages/core/test/proofs/surface-lock.test.ts:58`
- Modify: `packages/core/test/fixtures/declaration-consumer/internal-consumer.ts:7`
- Test: `packages/core/test/agent-spec.test.ts`, `packages/core/test/proofs/surface-lock.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export type Priority = 'agent' | 'changeAllowed' | 'consent' | 'honesty' | 'always'` from `@looprun-ai/core`; `GuardBinding.priority: Priority`; `MutatorBinding.priority: Priority`; `addGuard(hook, target, guard, opts?: { id?: string; priority?: Priority })`; same `opts` shape on `addReplyCheck` and `addMutator`. Tasks 2–5 all consume these.

The engine's seven guard ids do NOT change in this task. Renaming the type and renaming the ids are two things a reviewer can accept or reject separately, so they are two commits.

- [ ] **Step 1: Update the order test to the new field and values**

In `packages/core/test/agent-spec.test.ts:130-137`, replace the whole `describe` block. Its title and its `it` title both name the old vocabulary, and the last-position assertion names the old lowest value:

```ts
describe('priority resolution (agent wins)', () => {
  it('sorts agent → consent → always', () => {
    const spec = new AgentSpecBase({ id: 'l', mode: 'M', persona, tools: ['deleteItem'], destructiveTools: ['deleteItem'] });
    spec.addGuard('preTool', ['deleteItem'], precondition(() => true, 'agent gate'), { id: 'agent:gate' });
    const order = resolveBindings(spec.guards.preTool, 'deleteItem').map((b) => b.priority);
    expect(order[0]).toBe('agent');
    expect(order[order.length - 1]).toBe('always');
  });
```

The last binding is `always` because this spec installs `noDuplicateCall` (`always`) and the two consent guards, and `always` is the highest number in `PRIORITY_ORDER`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -C packages/core test -- agent-spec`
Expected: FAIL — `b.priority` is `undefined`, so `order` is `[undefined, undefined, undefined]`.

- [ ] **Step 3: Rename the type and the order map**

In `packages/core/src/spec.ts:38`, replace the type:

```ts
export type Priority = 'agent' | 'changeAllowed' | 'consent' | 'honesty' | 'always';
```

At `spec.ts:200`, replace the order map. `full` is deleted here — the union above has no such member and this map has no such slot:

```ts
const PRIORITY_ORDER: Record<Priority, number> =
  { agent: 0, changeAllowed: 1, consent: 2, honesty: 3, always: 4 };
```

- [ ] **Step 4: Rename the binding field on both interfaces**

At `spec.ts:73` (`MutatorBinding`) and `spec.ts:91` (`GuardBinding`), replace `layer: Layer;` with:

```ts
  priority: Priority;
```

- [ ] **Step 5: Rename the two sort sites**

At `spec.ts:295` (inside `resolveBindings`) and `spec.ts:305` (inside `resolveMutators`):

```ts
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
```

- [ ] **Step 6: Rename the three install-method signatures and their bodies**

At `spec.ts:548`, `:575`, `:579`, replace `layer?: Layer` in each `opts` type with `priority?: Priority`. Then the mint and the push at `:568` and `:571`:

```ts
    const id = opts?.id ?? `${opts?.priority ?? 'agent'}:${guard.kind}#${++this.seq}`;
    const all = [...this.guards.onInput, ...this.guards.preTool, ...this.guards.postTool, ...this.guards.onReply];
    if (all.some((b) => b.id === id)) throw new Error(`AgentSpec guard id "${id}" already exists`);
    this.guards[hook].push({ id, target, guard: attributeGuard(guard, hook, id), priority: opts?.priority ?? 'agent', disabled: false });
```

And in `addMutator` at `:580` and `:583`:

```ts
    const id = opts?.id ?? `${opts?.priority ?? 'agent'}:${mutator.kind}#${++this.seq}`;
    const list = (this.guards.onReplyMutate ??= []);
    if (list.some((b) => b.id === id)) throw new Error(`AgentSpec mutator id "${id}" already exists`);
    list.push({ id, mutator: attributeMutator(mutator, id), priority: opts?.priority ?? 'agent', disabled: false });
```

- [ ] **Step 7: Rename the seven engine install sites' field only**

At `spec.ts:427` `:433` `:450` `:454` `:479` `:527` `:528`, each `addGuard`/`addReplyCheck` call passes `layer: '<old value>'`. Change the KEY on each and map the value:

```
layer: 'minimal'  on noDuplicateCall     →  priority: 'always'
layer: 'minimal'  on degenerationGuard   →  priority: 'always'
layer: 'minimal'  on claimIsGrounded     →  priority: 'honesty'
layer: 'minimal'  on claimIsComplete     →  priority: 'honesty'
layer: 'minimal'  on the write gate      →  priority: 'changeAllowed'
layer: 'base'     on confirmFirst        →  priority: 'consent'
layer: 'base'     on destructiveThrottle →  priority: 'consent'
```

Leave every `id:` string exactly as it is. Task 2 changes those.

- [ ] **Step 8: Rename the public export and the two comments that name the type**

`packages/core/src/index.ts:86`:

```ts
export type { AgentControls, ChainSpec, StateDirective, GuardBinding, MutatorBinding, Priority } from './spec.js';
```

`packages/core/src/internal.ts:163` — replace `Layer` with `Priority` in the list of nameable types.

`packages/core/src/spec.ts:13` — the file's opening map says guards are "layer-tagged". Rewrite to:

```
 * ONE class, `AgentSpecBase` — a spec is a spec. Its constructor auto-installs, priority-tagged and
```

`packages/core/src/spec.ts:24` — rewrite the sentence that names the ordering. Keep the ids as they stand; Task 2 rewrites them:

```
 * auto-schema layer. The `minimal:`/`base:` id namespaces are load-bearing for resolveBindings priority
 * ordering + assembled prompt prose order. resolveBindings sorts each hook agent → changeAllowed → consent
 * → honesty → always so an agent correction always wins.
```

- [ ] **Step 9: Rename the seven eval install sites and the one red-team fixture**

In `packages/eval/src/norms-config.ts`, lines 326, 335, 339, 345, 351, 361, 371 each pass `layer: 'agent'`. Change every key to `priority`:

```ts
        priority: 'agent',
```

Same single change at `packages/core/test/redteam/redteam-r2-partition.test.ts:406`.

- [ ] **Step 9b: Move the type in the public-surface lock**

`packages/core/test/proofs/surface-lock.test.ts:58` holds the exported type names in ALPHABETICAL order, so this is a move and not only a rename: `Layer` leaves its slot after `HistoryTurn`, and `Priority` takes the slot its own letter earns. Delete `'Layer',` from line 58 and insert `'Priority',` in alphabetical position within the same array.

Run: `pnpm -C packages/core test -- surface-lock`
Expected: PASS. This test is what makes the breaking export change deliberate rather than accidental — if it fails with a name you did not touch, the barrel changed by mistake.

`packages/core/test/fixtures/declaration-consumer/internal-consumer.ts:7` names `Layer` in a comment listing the types reachable from the internal barrel. Replace it with `Priority`.

- [ ] **Step 10: Run the typechecker to find every remaining site**

Run: `pnpm typecheck`
Expected: PASS. A remaining `layer:` or `.layer` anywhere in the workspace is a type error naming its own file and line — fix each one it reports and run again until clean.

- [ ] **Step 11: Run the full core and eval suites**

Run: `pnpm -C packages/core test && pnpm -C packages/eval test`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add packages/core/src packages/core/test packages/eval/src/norms-config.ts packages/core/src/index.ts
git commit -m "refactor(core)!: a guard binding carries the priority of the question it answers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: The seven engine ids, and the invariant that keeps them unique

**Files:**
- Modify: `packages/core/src/spec.ts:15-16` `:22` `:24` `:427` `:433` `:451` `:455` `:480` `:487-488` `:527` `:528`
- Modify: `packages/core/test/agent-spec.test.ts:28` `:29` `:32` `:34` `:35` `:103` `:118` `:126` `:215`
- Modify: `packages/core/test/write-gate.test.ts:42` `:61`
- Modify: `packages/eval/test/lint-subject-parity.test.ts:49` `:81` `:87` `:89`
- Test: `packages/core/test/agent-spec.test.ts`

**Interfaces:**
- Consumes: `Priority`, `GuardBinding.priority` from Task 1.
- Produces: the seven verbatim ids listed in Global Constraints. Tasks 5, 6, 8, 9 and 10 all quote them.

- [ ] **Step 1: Write the failing assertions for all seven ids**

In `packages/core/test/agent-spec.test.ts`, replace every old id string with its new one:

```ts
    expect(spec.guards.preTool.map((b) => b.id)).toContain('always:noDuplicateCall');
    expect(spec.guards.onReply.map((b) => b.id)).toContain('always:degenerationGuard');
```

At line 32, the test title names the old vocabulary. Rewrite the title and its body:

```ts
  it('a non-destructive spec installs no consent guard', () => {
    // …existing spec construction…
    expect(spec.guards.preTool.map((b) => b.id)).toEqual(['always:noDuplicateCall']);
    expect(spec.guards.preTool.every((b) => !b.id.startsWith('consent:'))).toBe(true);
```

At lines 103, 118 and 126:

```ts
    expect(ids).toEqual(['always:noDuplicateCall', 'consent:confirmFirst', 'consent:destructiveThrottle']);
```

```ts
      'always:noDuplicateCall', 'consent:confirmFirst', 'consent:destructiveThrottle',
```

```ts
    expect(spec.guards.onReply.map((b) => b.id)).toEqual(['always:degenerationGuard']);
```

At line 215:

```ts
    const gate = s.guards.preTool.find((b) => b.id === 'consent:confirmFirst')!;
```

- [ ] **Step 2: Add the uniqueness test**

Append to `packages/core/test/agent-spec.test.ts`. This is the test that makes the id rule checkable — the rule holds only while each engine priority carries distinct kinds, and `addGuard`'s duplicate-id throw is what enforces it:

```ts
  it('an engine id is its priority and its kind, and a repeat of the pair throws', () => {
    const s = destructiveSpec();
    const engineIds = [...s.guards.preTool, ...s.guards.onReply]
      .filter((b) => b.priority !== 'agent')
      .map((b) => b.id);
    for (const b of [...s.guards.preTool, ...s.guards.onReply].filter((x) => x.priority !== 'agent')) {
      expect(b.id).toBe(`${b.priority}:${b.guard.kind}`);
    }
    expect(new Set(engineIds).size).toBe(engineIds.length);
    expect(() => s.addGuard('preTool', 'any', noDuplicateCall(), { priority: 'always', id: 'always:noDuplicateCall' }))
      .toThrow('AgentSpec guard id "always:noDuplicateCall" already exists');
  });
```

Import `noDuplicateCall` at the top of the file if it is not already imported. Reuse whatever helper the file already uses to build a destructive spec; if it has none, build one inline with `destructiveTools: ['deleteItem']` matching the other tests in the file.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm -C packages/core test -- agent-spec`
Expected: FAIL — the ids are still `minimal:*` and `base:*`.

- [ ] **Step 4: Rename the seven ids at their install sites**

In `packages/core/src/spec.ts`:

```ts
    this.addGuard('preTool', 'any', noDuplicateCall(), { priority: 'always', id: 'always:noDuplicateCall' });
```

```ts
    this.addGuard('onReply', 'any', degenerationGuard(), { priority: 'always', id: 'always:degenerationGuard' });
```

At `:451` and `:455`, the two honesty ids:

```ts
        id: 'honesty:claimIsGrounded',
```

```ts
        id: 'honesty:claimIsComplete',
```

At `:480`, the state gate. Its id names its KIND (`precondition`), not the declaration that installed it — the priority already says which declaration that was, and the engine mints one id for every domain, so no domain word may appear here:

```ts
          priority: 'changeAllowed',
          id: 'changeAllowed:precondition',
```

At `:527` and `:528`:

```ts
    this.addGuard('preTool', destructive, confirmFirst({ when }), { priority: 'consent', id: 'consent:confirmFirst' });
    this.addGuard('preTool', destructive, destructiveThrottle(destructive, { when }), { priority: 'consent', id: 'consent:destructiveThrottle' });
```

- [ ] **Step 5: State the id rule and its invariant in the class doc comment**

Rewrite `packages/core/src/spec.ts:15-16` and `:22` so the doc comment names the new ids, and add the rule. Replace the whole auto-install list with:

```
 *   - ALWAYS the invariants EVERY agent carries: noDuplicateCall (preTool, id `always:noDuplicateCall`)
 *     + degenerationGuard (onReply, id `always:degenerationGuard`, the sole `always` onReply guard — a
 *     param-free artifact-shape lint). The non-empty-reply guarantee is ENGINE-OWNED rather than a guard:
 *     `finalizeReply` routes a blank delivery (zero-width included) to the non-empty engine-derived
 *     closure, because the respond schema's `message` minLength cannot decide it (a zero-width message
 *     satisfies it). Reply-honesty TEXT judgment is an `llmCheck` an author binds where the domain needs it;
 *   - IFF `destructiveTools` is non-empty, the destructive-safety protocol on those tools:
 *     confirmFirst (id `consent:confirmFirst`) + destructiveThrottle (id `consent:destructiveThrottle`).
 *
 * AN ENGINE-INSTALLED GUARD'S ID IS ITS PRIORITY AND ITS KIND — `always:noDuplicateCall`,
 * `changeAllowed:precondition`, `consent:confirmFirst`. The composition is unique only while each
 * priority carries distinct kinds, and `addGuard`'s duplicate-id throw is what holds it there: a second
 * `precondition` installed at `changeAllowed` composes the same id twice and fails at construction.
 * `agent` is exempt — an author-added guard with no explicit id is minted `agent:${kind}#${seq}`, and the
 * counter is what lets one author install `precondition` six times.
```

Then rewrite `:24` to name the new namespaces:

```
 * auto-schema layer. The id namespaces are load-bearing for resolveBindings priority ordering +
 * assembled prompt prose order. resolveBindings sorts each hook agent → changeAllowed → consent →
 * honesty → always so an agent correction always wins.
```

At `:487-488`, the destructive-layer method comment names both ids — rewrite to `consent:confirmFirst` and `consent:destructiveThrottle`.

- [ ] **Step 6: Update the write-gate and parity tests**

`packages/core/test/write-gate.test.ts:42` and `:61`:

```ts
    const gate = s.guards.preTool.find((b) => b.id === 'changeAllowed:precondition');
```

```ts
    expect(s.guards.preTool.find((b) => b.id === 'changeAllowed:precondition')!.target).toEqual(['createBooking']);
```

`packages/eval/test/lint-subject-parity.test.ts:49`, `:81`, `:87`, `:89`:

```ts
        targets: ['honesty:claimIsGrounded'],
```

```ts
    s.cases = [{ ...s.cases[0], targets: ['changeAllowed:precondition'] }];
```

```ts
    s.cases = [{ ...s.cases[0], setup: { preset: 'default' }, targets: ['changeAllowed:precondition'] }];
```

```ts
      lintSubject(s).some((f) => f.includes('TARGET-SILENT-ON-EVERY-PRESET: case "c-1" targets \'changeAllowed:precondition\'')),
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm -C packages/core test && pnpm -C packages/eval test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/spec.ts packages/core/test packages/eval/test
git commit -m "refactor(core)!: an engine guard's id is its priority and its kind

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `contract.writeGate` → `contract.changeAllowed`

**Files:**
- Modify: `packages/core/src/spec.ts:461` `:465` `:472`, and the `DomainContract` field declaration
- Modify: `packages/core/src/assembled-prompt.ts:80`
- Modify: `packages/eval/src/lint-subject.ts:247` `:274`
- Modify: `packages/core/test/write-gate.test.ts` (all `writeGate` occurrences)
- Modify: `packages/eval/test/lint-subject-parity.test.ts:59`
- Test: `packages/core/test/write-gate.test.ts`

**Interfaces:**
- Consumes: `Priority` from Task 1, `changeAllowed:precondition` from Task 2.
- Produces: `contract.changeAllowed?: { ok: (world: AgentWorld) => boolean; reason: string; prose?: string; exempt?: string[] }`. Tasks 6, 8, 9 and 10 all quote this name.

The finding name `WRITE-REFUSED-UNGATED` does NOT change. It names a world that refuses a write no lane gates, which is what it names after the rename too.

- [ ] **Step 1: Rename the field in the tests first**

In `packages/core/test/write-gate.test.ts`, replace every `writeGate` with `changeAllowed` — the `describe` title at line 32, the two contract literals at `:36` and `:54`, and the two `toThrow` regexes at `:67` and `:72`:

```ts
describe('contract.changeAllowed', () => {
```

```ts
    ).toThrow(/changeAllowed\.exempt names tool\(s\) that are not in contract\.writeTools: getBooking/);
```

```ts
      /changeAllowed is declared with no contract\.writeTools/,
```

Rename the file itself to match what it tests:

```bash
git mv packages/core/test/write-gate.test.ts packages/core/test/change-allowed.test.ts
```

Do the same single rename at `packages/eval/test/lint-subject-parity.test.ts:59`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm -C packages/core test -- change-allowed`
Expected: FAIL — `changeAllowed` is not a field of `DomainContract`, so nothing installs and the throw messages do not match.

- [ ] **Step 3: Rename the contract field**

Find the `writeGate?:` field on the `DomainContract` interface in `packages/core/src/spec.ts` and rename it, keeping its documentation and rewriting it to the new truth:

```ts
  /** The ONE world condition under which every write of the domain is refused, stated once. It
   *  installs a `precondition` (id `changeAllowed:precondition`) on every agent that carries a write,
   *  so no lane can key on a third of the condition while the others key on the rest. `exempt` names
   *  the writes that must stay usable while the condition holds — a compliance hold is that shape —
   *  and each entry must be one of `writeTools`. Declared with no `writeTools`, or exempting a tool
   *  that is not a write, it throws at construction. */
  changeAllowed?: {
    ok: (world: AgentWorld) => boolean;
    reason: string;
    prose?: string;
    exempt?: string[];
  };
```

Match the exact member types already on the field — copy them from the current declaration rather than from this block if they differ.

- [ ] **Step 4: Rename the read and the two throw messages**

At `spec.ts:461`, `:465` and `:472`:

```ts
    const gate = this.contract?.changeAllowed;
```

```ts
          `AgentSpec "${this.id}": contract.changeAllowed is declared with no contract.writeTools — the gate has no ` +
            'surface to install on and would enforce nothing.',
```

```ts
          `AgentSpec "${this.id}": contract.changeAllowed.exempt names tool(s) that are not in contract.writeTools: ${strayExempt.join(', ')}. ` +
            'An exemption from a gate that never covered the tool reads as a decision nobody made.',
```

Rewrite the block comment above at `:458` so it names the field:

```ts
    // THE CHANGE GATE: the domain states ONCE what its world refuses every write under, and it installs
    // on every spec that carries a write. Declared per lane it is six chances to key on a third of the
    // condition; declared here there is one predicate and no lane can diverge from it.
```

- [ ] **Step 5: Rename the prompt render input**

`packages/core/src/assembled-prompt.ts:80` — rename the optional input field `writeGate?` to `changeAllowed?`, and update its caller in `spec.ts` (the typechecker names the line).

- [ ] **Step 6: Rename the lint repair sentence**

`packages/eval/src/lint-subject.ts:247` (a doc comment) and `:274` (the finding's repair text):

```ts
            'the refusal reaches the model as a tool failure and the reply invents its reason. Declare contract.changeAllowed, or gate the lane on the same condition',
```

- [ ] **Step 7: Run typecheck and the suites**

Run: `pnpm typecheck && pnpm -C packages/core test && pnpm -C packages/eval test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(core)!: the contract states when a change is allowed

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: The catalog category `confirmation` → `consent`

**Files:**
- Rename: `packages/core/src/guards/confirmation.ts` → `packages/core/src/guards/consent.ts`
- Rename: `packages/core/test/guards-confirmation.test.ts` → `packages/core/test/guards-consent.test.ts`
- Modify: `packages/core/src/guards/index.ts:21` `:34`
- Modify: `packages/core/src/guards/catalog.ts:19` `:111` `:136` `:145`
- Modify: `docs/tutorial/04-guards.md` (regenerated, never hand-edited)
- Test: `packages/core/test/guards-consent.test.ts`

**Interfaces:**
- Consumes: `contract.changeAllowed` from Task 3 (the `precondition` catalog entry's prose names it).
- Produces: `GUARD_CATALOG` entries for `confirmFirst` and `destructiveThrottle` carrying `category: 'consent'`.

**The category IS a file name.** `scripts/gen-guards-chapter.mjs:153` renders each catalog row as `` `${e.category}.ts` ``, so a category with no matching file in `packages/core/src/guards/` publishes a broken reference in the tutorial. The file rename is not optional dressing — it is what keeps the generated chapter true.

- [ ] **Step 1: Rename the source file and its test**

```bash
git mv packages/core/src/guards/confirmation.ts packages/core/src/guards/consent.ts
git mv packages/core/test/guards-confirmation.test.ts packages/core/test/guards-consent.test.ts
```

- [ ] **Step 2: Update the barrel's import and its category list**

`packages/core/src/guards/index.ts:34`:

```ts
} from './consent.js';
```

`packages/core/src/guards/index.ts:21` — the comment lists the categories. Replace `confirmation` with `consent`:

```
 * (`docs/superpowers/specs/2026-07-28-tutorial-outline-final.md` §4): flow · args · world · consent · honesty · reply · custom.
```

- [ ] **Step 3: Rename the category in the catalog union and its two entries**

`packages/core/src/guards/catalog.ts:19`:

```ts
  category: 'flow' | 'args' | 'world' | 'consent' | 'honesty' | 'reply' | 'structural' | 'custom' | 'llm-check';
```

At `:136` and `:145`:

```ts
    category: 'consent',
```

- [ ] **Step 4: Rename `contract.writeGate` inside the precondition entry's prose**

`packages/core/src/guards/catalog.ts:111` — the string ends `…belongs on \`contract.writeGate\` instead…`. Replace that one occurrence with `contract.changeAllowed`.

- [ ] **Step 5: Verify no guard kind moved category by accident**

Run: `rg -n "category: 'consent'" packages/core/src/guards/catalog.ts`
Expected: exactly two lines — the `confirmFirst` entry and the `destructiveThrottle` entry. `consentRequired` lives in `world.ts` and keeps `category: 'world'`; it is not part of this rename.

- [ ] **Step 6: Regenerate the tutorial chapter**

Run: `pnpm docs:guards`
Expected: `docs/tutorial/04-guards.md` is rewritten between its `BEGIN GENERATED` / `END GENERATED` markers. Inspect the diff: the two `confirmation.ts` file references become `consent.ts`, and the `precondition` row now names `contract.changeAllowed`.

- [ ] **Step 7: Run the generator's own check plus the suites**

Run: `node scripts/gen-guards-chapter.mjs --check && pnpm -C packages/core test`
Expected: PASS on both.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(core)!: the consent category and the consent priority share one word

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: The coverage census counts what a bundle chose

**Files:**
- Modify: `packages/eval/src/lint-subject.ts:34-37` `:43`
- Modify: `packages/eval/src/validate.ts:93`
- Modify: `docs/tutorial/05-running-and-eval.md:424-434`
- Test: `packages/eval/test/lint-subject-parity.test.ts`

**Interfaces:**
- Consumes: `GuardBinding.priority` from Task 1, the seven ids from Task 2.
- Produces: no new symbol. This is the only task in the plan that changes BEHAVIOUR rather than words.

**What changes.** Today two identical lines exclude `layer !== 'minimal'` from the guards a case must target. `minimal` splits into three priorities, so there is no single value to transcribe. The exclusion exists for guards "the constructor installs on every spec in every domain" — and only `always:*` is that. `honesty:*` arrives iff the contract declares `writeTools`, `changeAllowed:*` iff it declares the gate; both are this bundle's own choices, exactly as `consent:*` is.

- [ ] **Step 1: Write the failing test**

Append to `packages/eval/test/lint-subject-parity.test.ts`. The file already has the two pieces this needs: `subject(contract)` builds a `rentals` Subject with one case, and `GATED` is the `DomainContract` carrying the change gate.

```ts
  it('the census demands a case for an honesty guard and for the change gate, and never for an always guard', () => {
    const s = subject(GATED);
    s.cases = [{ ...s.cases[0], targets: ['agent:none'] }];
    const findings = lintSubject(s).join('\n');
    expect(findings).toContain('honesty:claimIsGrounded');
    expect(findings).toContain('changeAllowed:precondition');
    expect(findings).not.toContain('always:noDuplicateCall');
    expect(findings).not.toContain('always:degenerationGuard');
  });
```

`targets: ['agent:none']` leaves every installed guard untargeted, so the census reports each one it demands. If `--spec-laws` rejects an unresolvable target before the census runs, use the id of a guard the spec does install and assert the other two are still reported.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -C packages/eval test -- lint-subject-parity`
Expected: FAIL — `honesty:claimIsGrounded` and `changeAllowed:precondition` are absent from the findings, because `priority !== 'minimal'` excludes nothing and `authoredGuardIds` still filters on a value no binding carries.

- [ ] **Step 3: Change both copies of the filter**

`packages/eval/src/lint-subject.ts:43` and `packages/eval/src/validate.ts:93`:

```ts
].filter((b) => !b.disabled && b.priority !== 'always').map((b) => b.id);
```

- [ ] **Step 4: Rewrite the comment above the filter to the new rule**

`packages/eval/src/lint-subject.ts:34-37`:

```ts
/**
 * The guards a case is expected to target: the ones this BUNDLE chose.
 *
 * `always` is excluded — those two are the invariants the constructor installs on every spec in every
 * domain, and the engine proves them in its own suite. Demanding a per-subject case for each would
 * file the same finding against every bundle ever generated, which is how a census stops being read.
 * Every other priority stays in: `consent` arrives from this bundle's `destructiveTools`, `honesty`
 * from its `contract.writeTools`, `changeAllowed` from its `contract.changeAllowed`. Each is a
 * declaration this bundle made, so exercising it is this bundle's job.
 */
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm -C packages/eval test`
Expected: PASS.

- [ ] **Step 6: Rewrite the tutorial's census prose**

`docs/tutorial/05-running-and-eval.md:424-434`. Replace the ids in the example list and the rule sentence:

```markdown
`targets` names the guard ids the case exercises — `agent:noDoubleBook`, `consent:confirmFirst`,
`always:noDuplicateCall`. It is not decoration: a guard no case targets passes in **both** variants of a
```

and the rule paragraph:

```markdown
"authored" excludes the `always` priority, the two invariants `AgentSpecBase` installs on every spec in
every domain and the engine proves in its own suite. So `always:noDuplicateCall` is a legal target
and leaving it untargeted would not have been a finding. Every other priority is demanded:
`consent:`, `honesty:`, `changeAllowed:` and `agent:` ids all name something this bundle declared.
```

- [ ] **Step 7: Commit**

```bash
git add packages/eval/src packages/eval/test docs/tutorial/05-running-and-eval.md
git commit -m "fix(eval): the census demands a case for every guard the bundle chose

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: The prose sweep

**Files:**
- Modify: `packages/core/GUARDS.md:418` `:419` `:420` `:421` `:437`
- Modify: `packages/eval/README.md:97`
- Modify: `docs/tutorial/03-agent-anatomy.md:334`
- Modify: `docs/tutorial/05-running-and-eval.md:557`
- Modify: `docs/tutorial/snippets/scheduler-subject/evals/cases.ts:53` `:72`
- NOT touched: anything under `docs/superpowers/` — a spec or a plan is a dated record

**Interfaces:**
- Consumes: every name produced by Tasks 1–5.
- Produces: nothing. This is the last task before the gate can go green.

`packages/core/GUARDS.md` is HAND-WRITTEN — do not run a generator over it. Only `docs/tutorial/04-guards.md` §5 is generated, and Task 4 already regenerated it.

- [ ] **Step 1: Rewrite the four auto-install rows in GUARDS.md**

Line 418 — replace `minimal:noDuplicateCall` with `always:noDuplicateCall`, `minimal:degenerationGuard` with `always:degenerationGuard`, and "the SOLE minimal onReply guard" with "the SOLE `always` onReply guard".

Line 419 — replace `(onReply, \`minimal:*\`)` with `(onReply, \`honesty:*\`)`.

Line 420 — replace the row's key `cfg.contract.writeGate` with `cfg.contract.changeAllowed`, and the id `minimal:writeGate` with `changeAllowed:precondition`.

Line 421 — replace `base:destructiveThrottle` with `consent:destructiveThrottle` and `base:confirmFirst` with `consent:confirmFirst`.

Line 437 — the sentence names "The `minimal:`/`base:` id namespaces + install order". Rewrite to:

```markdown
The priority-composed id namespaces + install order are
```

- [ ] **Step 2: Rewrite the eval README finding row**

`packages/eval/README.md:97` — replace `contract.writeGate` with `contract.changeAllowed`. Leave the finding's name `WRITE-REFUSED-UNGATED` untouched.

- [ ] **Step 3: Rewrite the tutorial's contract-field row**

`docs/tutorial/03-agent-anatomy.md:334` — the row key `` `writeGate?` `` becomes `` `changeAllowed?` ``, and the id it names, `minimal:writeGate`, becomes `changeAllowed:precondition`.

- [ ] **Step 4: Rewrite the tutorial's parity repair sentence**

`docs/tutorial/05-running-and-eval.md:557` — replace `contract.writeGate` with `contract.changeAllowed`.

- [ ] **Step 5: Rewrite the tutorial snippet's case targets**

`docs/tutorial/snippets/scheduler-subject/evals/cases.ts:53` and `:72`:

```ts
    targets: ['consent:confirmFirst', 'consent:destructiveThrottle'],
```

```ts
    targets: ['always:noDuplicateCall'],
```

**`docs/superpowers/` is not swept.** A design spec and its plan are dated records of a decision, read to learn what was decided and on what grounds — not documentation of the system as it stands. Rewriting one makes it describe a decision nobody took. Six files there carry the old names across 75 occurrences, and all six stay exactly as they are.

- [ ] **Step 6: Run the full workspace suite**

Run: `pnpm test`
Expected: PASS — this runs every package's tests, `gen-guards-chapter.mjs --check`, and the plain-names gate.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "docs: a guard's prefix names the question, and the contract names when a change is allowed

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: The gate

**Files:**
- Create: `tests/guard-priority.test.mjs`
- Modify: `package.json` (the `test` and `test:laws` scripts)

**Interfaces:**
- Consumes: every name produced by Tasks 1–6.
- Produces: `node tests/guard-priority.test.mjs [--root <path>]`, exit 0 when clean. Task 8 runs it with `--root` against the agentspec repo.

**What the gate can and cannot check.** It bans identifiers, not words. `layer` stays ordinary English — "the action layer", "the two-layer law", "the honesty layer" name something else entirely, in twenty-four places in the agentspec skill alone — so only its property form `.layer` is banned, and its object-literal form `layer:` is left to `pnpm typecheck`, which names every site exactly once the field is renamed. `full` is not banned at all: it is ordinary English in every repo, and Task 1 removed its only two sites by reading.

- [ ] **Step 1: Write the gate**

Create `tests/guard-priority.test.mjs`:

```js
#!/usr/bin/env node
/**
 * THE GUARD-PRIORITY GATE — a guard id's prefix names the QUESTION that guard answers, and the field
 * carrying it is `priority`. The retired identifiers may not survive in any file a person reads:
 * source, types, tests, docs, guard text, CLI output, generated subjects.
 *
 * Three things keep an old identifier: a run taken on a date, a release note, and a phrase where the
 * word is ordinary English — a validator's four numbered stages, an attestation's Layer 1.
 *
 * `layer:` as an object key is absent from this gate on purpose: renaming `GuardBinding.layer` makes
 * every such site a type error, and `pnpm typecheck` names each one exactly. A gate that banned the
 * word would fire on "the action layer" and "the two-layer law", which name something else.
 *
 * Run: node tests/guard-priority.test.mjs [--root <path>]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = flag('--root') ?? join(HERE, '..');

// `base:` is banned only when a non-space follows it: `base:confirmFirst` is the retired id prefix,
// `base: string` is a parameter annotation. `minimal:` has no such collision and is banned outright.
const NAMES = {
  'minimal: prefix': /minimal:/,
  'base: prefix': /\bbase:(?! )/,
  LAYER_ORDER: /LAYER_ORDER/,
  writeGate: /\bwriteGate\b|\bWriteGate\b/,
  Layer: /\bLayer\b/,
  '.layer': /\.layer\b/,
};

// Each entry protects ONE sense in ONE place: a path (exact file or directory prefix), the name it
// allows, and why. Allowing `Layer` in the validator does not also allow `writeGate` there.
const ALLOW = [
  { path: 'packages/eval/src/validate.ts', name: 'Layer', why: 'the validator\'s own four numbered stages' },
];

const SKIP_DIR = new Set(['node_modules', 'dist', 'results', 'coverage']);
const EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.sh']);

// THREE KINDS OF DATED RECORD keep the names they were written with, because rewriting one makes it
// disagree with what it records:
//   docs/superpowers/**   a spec states what was decided and on what grounds; a plan, how it was
//                         carried out. Neither documents the system as it stands.
//   **/cases.jsonl        a transcript of what a model did on a date, guard denials and all.
//   **/CHANGELOG.md       a release note keeps the names its release shipped, or a consumer on that
//                         version has no migration to follow.
const skipFile = (rel) =>
  rel.startsWith('docs/superpowers/') ||
  rel.endsWith('cases.jsonl') ||
  rel.endsWith('CHANGELOG.md');

// A dot-directory holds tooling state and vendored third-party files, neither of which this repo
// writes: `examples/hermes-sim/.hermes-home/` ships skill files where `Layer` is a graphics layer.
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR.has(entry) || entry.startsWith('.')) continue;
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) yield* walk(abs);
    else if (EXT.has(entry.slice(entry.lastIndexOf('.')))) yield abs;
  }
}

const allowed = (rel, name) =>
  ALLOW.some((a) => rel.startsWith(a.path) && (a.name === undefined || a.name === name));

const hits = [];
for (const abs of walk(ROOT)) {
  const rel = relative(ROOT, abs);
  if (skipFile(rel)) continue;
  const lines = readFileSync(abs, 'utf8').split('\n');
  for (const [name, re] of Object.entries(NAMES)) {
    if (allowed(rel, name)) continue;
    lines.forEach((line, i) => {
      if (re.test(line)) hits.push(`${rel}:${i + 1}  ${name}  ${line.trim().slice(0, 120)}`);
    });
  }
}

if (hits.length) {
  console.error(`guard-priority: ${hits.length} retired identifier(s) in ${ROOT}\n`);
  for (const h of hits) console.error(`  ${h}`);
  process.exit(1);
}
console.log(`guard-priority: clean (${Object.keys(NAMES).join(', ')}) in ${ROOT}`);
```

- [ ] **Step 2: Run the gate and fix what it finds**

Run: `node tests/guard-priority.test.mjs`
Expected on the first run: a list of whatever Tasks 1–6 missed. Fix each line it names, then run again. Repeat until it prints `guard-priority: clean`.

If it reports a hit you believe is ordinary English rather than a retired identifier, add an `ALLOW` entry naming the path, the name and the sense — never widen a regex to make a single file pass.

- [ ] **Step 3: Wire the gate into the workspace scripts**

In `package.json`, append the gate to both scripts that hold the repo's laws:

```json
    "test": "pnpm -r --if-present test && node scripts/gen-guards-chapter.mjs --check && node tests/plain-names.test.mjs && node tests/guard-priority.test.mjs",
    "test:laws": "pnpm -C packages/core test && node tests/no-bench-drift.test.mjs && node tests/plain-names.test.mjs && node tests/guard-priority.test.mjs",
```

- [ ] **Step 4: Allowlist this plan and its spec in the plain-names gate**

`tests/plain-names.test.mjs` already carries an entry for `2026-08-06-guard-priority-design.md`. Run the sibling gate to confirm the new plan file does not trip it:

Run: `node tests/plain-names.test.mjs`
Expected: PASS. If the plan file trips it, add an `ALLOW` entry beside the existing one, with the path and the reason.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: PASS, ending with `guard-priority: clean`.

- [ ] **Step 6: Commit**

```bash
git add tests/guard-priority.test.mjs package.json
git commit -m "test: a retired guard identifier fails the build

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: The agentspec skill

**Files (in `~/Dev/js/looprun/agentspec`):**
- Modify: `skill/references/guard-catalog.md:49-50` `:68` `:71` `:342` `:526`
- Modify: `skill/references/norms.md:311` `:508` `:528`
- Modify: `skill/references/spec-template.ts:7`

**Interfaces:**
- Consumes: every name produced by Tasks 1–7. Nothing in this repo is imported by the engine.
- Produces: the vocabulary every future generated subject is authored in.

Ten spots across three files. Run the gate from the looprun checkout with `--root` pointed here.

- [ ] **Step 1: Rewrite the auto-install list**

`skill/references/guard-catalog.md:49-50` — the row names both consent ids:

```markdown
- **when `destructiveTools` is non-empty** — `confirmFirst()` under `consent:confirmFirst` +
  `destructiveThrottle` under `consent:destructiveThrottle`, on exactly those tools (⊆-validated
```

Check the bullets above it too: the `always` bullet and the `contract.writeTools` bullet name their guards without ids today; if either names an id, rename it to the Global Constraints list.

- [ ] **Step 2: Rewrite the "every other kind" sentence**

`skill/references/guard-catalog.md:68`:

```markdown
Never hand-add these. Every other kind is author-added, at `agent` priority, explicitly.
```

- [ ] **Step 3: Rewrite the binding-resolution order**

`skill/references/guard-catalog.md:71`:

```markdown
minimal`, so an agent-layer correction outranks an inherited one. On `preTool` the FIRST deny
```

becomes:

```markdown
**Binding resolution, and what a deny does.** Per hook, bindings sort `agent → changeAllowed →
consent → honesty → always`, so an author's correction outranks an inherited one. On `preTool` the
FIRST deny wins: the call is vetoed, the correction goes back, and no later binding on that call runs.
```

Keep whatever follows "runs." on the original lines — only the sentence naming the order changes.

- [ ] **Step 4: Rewrite the two `contract.writeGate` mentions in the catalog**

`skill/references/guard-catalog.md:342` (the `precondition` row) and `:526` (the world-refuses-every-write row) — replace `contract.writeGate` with `contract.changeAllowed` in both. Leave `WRITE-REFUSED-UNGATED` untouched.

- [ ] **Step 5: Rewrite the norms references**

`skill/references/norms.md:311` and `:528` — replace `contract.writeGate` with `contract.changeAllowed`.

`skill/references/norms.md:508` — the profile join-key law:

```markdown
- The JOIN KEY is the guard's registered id (`agent:*` plus the four engine priorities —
  `changeAllowed:*`, `consent:*`, `honesty:*`, `always:*`) — profiles may
```

- [ ] **Step 6: Rewrite the spec template's opening map**

`skill/references/spec-template.ts:7`:

```
 * super(config) → author-added guards → default export of a singleton.
```

- [ ] **Step 7: Run the gate against this repo**

Run: `node ~/Dev/js/looprun/looprun/tests/guard-priority.test.mjs --root ~/Dev/js/looprun/agentspec`
Expected: `guard-priority: clean`. Fix every line it names.

- [ ] **Step 8: Run the skill's own lints**

Run: `node skill/scripts/lint-guard-catalog.mjs && node skill/scripts/lint-authoring.mjs skill/scripts/test/fixtures/clean`
Expected: PASS on both. If `lint-guard-catalog.mjs` compares the skill's catalog against the engine's, it needs the engine built first — run `pnpm -C ~/Dev/js/looprun/looprun build` and retry.

- [ ] **Step 9: Commit**

```bash
cd ~/Dev/js/looprun/agentspec
git add -A
git commit -m "docs(skill)!: a guard's prefix names the question it answers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

---

## Acceptance

```
node tests/guard-priority.test.mjs                                      clean
node tests/guard-priority.test.mjs --root ../agentspec                  clean

pnpm test                                          in looprun          green
pnpm typecheck                                     in looprun          green
```

The plan covers two repos: the engine and the agentspec skill. `agentspec-bench` and the three domain
repos (`accounting`, `lawfirm`, `homeservices`) are out of scope — each pins the engine version that
measured it, and renames on its own schedule.

## Changelog

The release note is the one place both vocabularies appear, because a consumer on the previous version has no migration to follow without them. Add to `packages/core/CHANGELOG.md` under the next version:

```markdown
Breaking, @looprun-ai/core: `Layer` → `Priority` with values
`agent | changeAllowed | consent | honesty | always` (`full` removed);
`GuardBinding.layer` / `MutatorBinding.layer` → `.priority`;
`addGuard`/`addReplyCheck`/`addMutator` opts `layer` → `priority`;
`contract.writeGate` → `contract.changeAllowed`;
guard ids `minimal:noDuplicateCall` → `always:noDuplicateCall`,
`minimal:degenerationGuard` → `always:degenerationGuard`,
`minimal:claimIsGrounded` → `honesty:claimIsGrounded`,
`minimal:claimIsComplete` → `honesty:claimIsComplete`,
`minimal:writeGate` → `changeAllowed:precondition`,
`base:confirmFirst` → `consent:confirmFirst`,
`base:destructiveThrottle` → `consent:destructiveThrottle`.
```

Breaking, @looprun-ai/eval: the coverage census demands a case target for every guard priority except `always`.
