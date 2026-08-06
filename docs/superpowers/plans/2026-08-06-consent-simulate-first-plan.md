# Consent: One Check, Simulate-First — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Invert the destructive-tool polarity (bare call acts, `simulate: true` simulates), collapse the two consent mechanisms into one schema-detected check, and close both consent dead ends (Route A downgrade, Route B veto-raises-the-question).

**Architecture:** One law in `confirmFirst` — a destructive call that is not a schema-licensed simulation requires the user's typed approval code. The simulatable set is computed from the injected tool definitions at run start and seated on the runtime. `evaluatePreTool` gains a `downgrade` verdict (re-run the denied act as a simulation); `issueApprovalForVeto` derives its subject from the call's own arguments before falling back to the label.

**Tech Stack:** TypeScript, pnpm workspaces, vitest. Spec: `docs/superpowers/specs/2026-08-06-consent-dead-ends-design.md`.

**Scope:** the `looprun` repo only (engine). The agentspec skill and the generated subjects/benches are separate follow-on plans (spec §Order of work, steps 2–3).

## Global Constraints

- **Precondition:** the plain-names rename is merged and the working tree is clean. Verify before Task 1: `packages/core/src/runtime/action-history.ts` and `approval-request.ts` exist, and `git status --short` is empty. If not, STOP and ask.
- **Vocabulary (as landed, verbatim):** `TurnActionHistory`, `ApprovalRequest`, `approvalMatchesCall`, `approvalCode`, `issueApproval`, `issueApprovalForVeto`, `consumeApprovals`, `simulationResult`, `simulationResultOf`, audit `outcome: 'simulated'`.
- **Stone rules:** every byte written is English; comments state what the system IS — no "used to", no "renamed from", no test names, no measurements.
- **The argument name is `simulate`, boolean, `true` = simulation.** The acting call carries no protocol field.
- **Deleted, never aliased:** `confirmMechanism`, `'prior-ask'`, `base:confirmFirstPriorAsk`, `confirmFirst({ flag })`, `destructiveThrottle({ confirmArg, flagless })`, `assertDestructiveConfirmable`, the `confirmed` argument.
- **Test commands:** package: `pnpm -F @looprun-ai/core test` (vitest). Repo: `pnpm test` at the root (all packages + `node scripts/gen-guards-chapter.mjs --check`).
- **Governance:** `confirmFirst` and `destructiveThrottle` change behavior → fresh proof records + MATRIX before merge (Task 6 runs the looprun-governance skill).

---

### Task 1: The simulatable-set seam

A destructive tool whose DECLARED schema carries `simulate` is Route A; every other destructive
tool is Route B. The set is computed once per run from the injected tool definitions and seated on
the runtime; the guard reads it from `GuardCtx`.

**Files:**
- Modify: `packages/core/src/spec.ts` (replace `assertDestructiveConfirmable` with `simulatableToolNames`)
- Modify: `packages/core/src/runtime/action-history.ts` (new `TurnActionHistory` field)
- Modify: `packages/core/src/rules.ts` (new `GuardCtx` field)
- Modify: `packages/core/src/runtime/turn.ts` (thread the field into the guard ctx)
- Modify: `packages/mastra/src/run-conversation.ts:134` (seat the set where `assertDestructiveConfirmable` is called today)
- Modify: `packages/eval/src/ungoverned.ts:64` (rewrite the comment that names the deleted method)
- Test: `packages/core/test/simulatable-tools.test.ts` (create)

**Interfaces:**
- Consumes: `AgentSpecBase.destructiveTools` (protected field, existing).
- Produces: `AgentSpecBase.simulatableToolNames(toolDefs): ReadonlySet<string>`;
  `TurnActionHistory.simulatableTools?: ReadonlySet<string>`;
  `GuardCtx.simulatableTools?: ReadonlySet<string>`. Tasks 2 and 4 rely on all three.

- [ ] **Step 1: Verify the precondition (Global Constraints)** — file names, clean tree. STOP if unmet.

- [ ] **Step 2: Write the failing test**

```ts
// packages/core/test/simulatable-tools.test.ts
import { describe, it, expect } from 'vitest';
import { AgentSpecBase } from '../src/spec.js';

const spec = new AgentSpecBase({
  id: 's', mode: 'm', persona: 'p',
  tools: ['cancelBooking', 'unsubscribeCustomer', 'getBooking'],
  destructiveTools: ['cancelBooking', 'unsubscribeCustomer'],
});

const toolDefs = [
  { name: 'cancelBooking', inputSchema: { properties: { bookingId: {}, simulate: { type: 'boolean' } } } },
  { name: 'unsubscribeCustomer', inputSchema: { properties: { customerId: {} } } },
  { name: 'getBooking', inputSchema: { properties: { bookingId: {}, simulate: { type: 'boolean' } } } },
];

describe('simulatableToolNames — the declared schema decides the route', () => {
  it('contains the destructive tool whose schema declares simulate', () => {
    expect(spec.simulatableToolNames(toolDefs).has('cancelBooking')).toBe(true);
  });
  it('excludes the destructive tool whose schema does not', () => {
    expect(spec.simulatableToolNames(toolDefs).has('unsubscribeCustomer')).toBe(false);
  });
  it('excludes a non-destructive tool even when its schema declares simulate', () => {
    expect(spec.simulatableToolNames(toolDefs).has('getBooking')).toBe(false);
  });
  it('returns the empty set when no toolDefs are known', () => {
    expect(spec.simulatableToolNames([]).size).toBe(0);
  });
});
```

- [ ] **Step 3: Run it — expect FAIL** (`pnpm -F @looprun-ai/core test simulatable-tools`): `simulatableToolNames is not a function`.

- [ ] **Step 4: Implement.** In `spec.ts`, delete the whole `assertDestructiveConfirmable` method
  (and its doc comment) and add in its place:

```ts
/**
 * The destructive tools whose DECLARED schema carries a `simulate` parameter — the set that
 * licenses the guard's simulation bypass and the runtime's downgrade. Computed from the injected
 * tool definitions (the backend, at run start: the first moment schemas exist) and seated on the
 * runtime beside `destructiveLabels`. A destructive tool absent from this set is gated on every
 * call, and its veto raises the approval question.
 */
simulatableToolNames(toolDefs: ReadonlyArray<{ name: string; inputSchema?: { properties?: Record<string, unknown> } }>): ReadonlySet<string> {
  const byName = new Map(toolDefs.map((d) => [d.name, d]));
  return new Set(
    this.destructiveTools.filter((t) => {
      const props = byName.get(t)?.inputSchema?.properties;
      return !!props && 'simulate' in props;
    }),
  );
}
```

In `action-history.ts`, add to `TurnActionHistory` (beside `destructiveLabels`), and initialize
nothing (absent set = every destructive tool is Route B — the safe default):

```ts
/** The destructive tools whose declared schema carries `simulate` — the only tools whose
 *  simulation bypass is licensed and whose denied act is downgraded. Seated by the backend at
 *  run start from the injected tool definitions; absent ⇒ every destructive call is gated. */
simulatableTools?: ReadonlySet<string>;
```

In `rules.ts` `GuardCtx`, add the same field with the same doc shape. In `turn.ts`
`evaluatePreTool`, thread `simulatableTools: actionHistory.simulatableTools` into the `gctx`
literal (beside `consent`).

In `run-conversation.ts:134`, replace `spec.assertDestructiveConfirmable?.(deps.toolDefs);` with:

```ts
if (spec.simulatableToolNames) session.actionHistory.simulatableTools = spec.simulatableToolNames(deps.toolDefs);
```

In `ungoverned.ts:64`, rewrite the comment to name the new seam ("simulatableToolNames: omitted —
the ungoverned variant installs no guards, so no bypass set is needed").

- [ ] **Step 5: Remove dead references.** `grep -rn "assertDestructiveConfirmable" packages docs
  --include="*.ts" --include="*.md"` — for each test hit, delete the describe/it blocks that test
  the removed method; for each doc hit, rewrite the sentence to the new seam. Zero hits when done.

- [ ] **Step 6: Run** `pnpm -F @looprun-ai/core test` and `pnpm -F @looprun-ai/mastra test` — all pass.

- [ ] **Step 7: Commit** — `feat(core): the declared schema decides a destructive tool's consent route`

---

### Task 2: The polarity flip

Atomic: the guard, the spec installer, the world, the fixture worlds and their tests flip
together — a half-flipped tree reads both polarities in one file.

**Files:**
- Modify: `packages/core/src/guards/confirmation.ts` (the `confirmFirst` factory only)
- Modify: `packages/core/src/spec.ts` (`AgentSpecConfig`, `installBase`)
- Modify: `packages/core/src/world/define-world.ts:41,147-151` and the world types file that declares `twoStep`
- Modify: `packages/core/src/testing/fixture-world.ts` (its destructive-tool handling + comments)
- Modify: `packages/core/src/guards/catalog.ts` (the `confirmFirst` entry's prose/config)
- Modify: `packages/core/test/guards-confirmation.test.ts` (the `confirmFirst` describe blocks)
- Modify: every test that passes `confirmed: true|false` (enumerated in Step 5)

**Interfaces:**
- Consumes: `GuardCtx.simulatableTools` (Task 1), `approvalMatchesCall` (existing).
- Produces: `confirmFirst(opts?: { when?: Record<string, (args) => boolean> })` — no `flag`
  option. `defineWorld` tool decl field `simulatable: boolean` (replaces `twoStep`); the
  simulation branch fires on `received.simulate === true`. Tasks 3–6 rely on these.

- [ ] **Step 1: Rewrite the `confirmFirst` tests** (replace the existing describe body; the
  `ApprovalRequest` fixture and `ctx` helper stay):

```ts
describe('confirmFirst — one law: an act that is not a schema-licensed simulation needs the code', () => {
  const g = confirmFirst();
  const sim = new Set(['cancelBooking']);

  it('lets a schema-licensed simulation through — it is how the world raises the question', () => {
    expect(g.check(ctx({ tool: 'cancelBooking', args: { id: 'BK-1', simulate: true }, simulatableTools: sim, consent: [] }))).toBeNull();
  });
  it('gates a hallucinated simulate on a tool whose schema has none', () => {
    expect(g.check(ctx({ tool: 'unsubscribeCustomer', args: { id: 'BK-1', simulate: true }, simulatableTools: sim, consent: [] }))).not.toBeNull();
  });
  it('gates every bare call when no bypass set was seated', () => {
    expect(g.check(ctx({ tool: 'cancelBooking', args: { id: 'BK-1', simulate: true }, consent: [] }))).not.toBeNull();
  });
  it('allows the act the user consented to', () => {
    expect(g.check(ctx({ tool: 'cancelBooking', args: { id: 'BK-1' }, simulatableTools: sim, consent: [consented] }))).toBeNull();
  });
  it('denies the bare act when no consent arrived', () => {
    expect(g.check(ctx({ tool: 'cancelBooking', args: { id: 'BK-1' }, simulatableTools: sim, consent: [] }))).not.toBeNull();
  });
  it('denies an act on a record the consent does not name', () => {
    expect(g.check(ctx({ tool: 'cancelBooking', args: { id: 'BK-12' }, simulatableTools: sim, consent: [consented] }))).not.toBeNull();
  });
  it('keeps the when predicate first: a non-destructive branch runs with nothing asked', () => {
    const gw = confirmFirst({ when: { placeHold: (a) => a.scope === 'workspace' } });
    expect(gw.check(ctx({ tool: 'placeHold', args: { scope: 'asset' }, consent: [] }))).toBeNull();
    expect(gw.check(ctx({ tool: 'placeHold', args: { scope: 'workspace' }, consent: [] }))).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (the factory still takes `flag`, still keys on `confirmed`).

- [ ] **Step 3: Implement the factory** exactly as the spec's §The one check sketch (drop `flag`,
  keep `when`; bypass `ctx.args.simulate === true && ctx.simulatableTools?.has(tool)`; the deny
  string and the `prose()` verbatim from the spec, lines 88–115). Rewrite the factory's doc
  comment to the one law + the hallucinated-argument example; no flag vocabulary anywhere in it.

- [ ] **Step 4: Collapse `installBase`** in `spec.ts`:
  - Delete `confirmMechanism` from `AgentSpecConfig` (field + doc), the class field, the
    constructor copy, the `strayMech` validation block, and `mechOf`/`argTools`/`priorAskTools`.
  - The destructive layer installs exactly two bindings:

```ts
this.addGuard('preTool', destructive, confirmFirst({ when }), { layer: 'base', id: 'base:confirmFirst' });
this.addGuard('preTool', destructive, destructiveThrottle(destructive, { when }), { layer: 'base', id: 'base:destructiveThrottle' });
```

  (`destructiveThrottle` still accepts its old options until Task 5 — passing only `when` compiles.)

- [ ] **Step 5: Flip `defineWorld` and the fixture worlds.**
  - World types: rename the tool-decl field `twoStep` → `simulatable` (declaration + the
    `define-world.ts:41` mapping).
  - `define-world.ts:147`: `if (tool.simulatable && received.simulate === true) { …outcome:
    'simulated'… }` — the bare call falls through to the act. A `simulatable` tool's arg decl
    gains `simulate` (so `receive()` admits it); rewrite the branch comment to "an explicit
    `simulate: true` asks; the bare call acts".
  - `testing/fixture-world.ts`: same flip in its destructive handling; rewrite the
    `base:confirmFirstPriorAsk / pendingConfirmMustAsk` comment at line 241 to name only
    `base:confirmFirst`.
  - Enumerate every remaining old-polarity site: `grep -rln "confirmed" packages/core/src
    packages/core/test packages/mastra/src packages/eval/src --include="*.ts"` — flip each test's
    args (acting call = bare; simulation = `simulate: true`) and each src comment's wording. The
    `hooks.ts:69` comment ("a tool that mutates under `confirmed:false`") becomes "a tool that
    mutates while claiming `simulate: true`".
  - Update the `confirmFirst` entry in `guards/catalog.ts` to the one-law prose; regenerate the
    guards chapter: `node scripts/gen-guards-chapter.mjs`.

- [ ] **Step 6: Run the whole repo** — `pnpm test` at the root. Fix every failure inside this
  task's scope (they are all polarity sites); nothing outside it.

- [ ] **Step 7: Commit** — `feat(core)!: simulate-first polarity — the bare destructive call acts and is gated`

---

### Task 3: Route B — the veto derives its subject from the call

**Files:**
- Modify: `packages/core/src/runtime/action-history.ts:150` (`issueApprovalForVeto`)
- Modify: `packages/core/src/runtime/turn.ts:139` (pass `args`)
- Test: `packages/core/test/approval-veto.test.ts` (create)

**Interfaces:**
- Consumes: `preferredIdentityValues` (already imported in `action-history.ts`), `issueApproval`
  (module-private, existing), `consumeApprovals`, `approvalMatchesCall`.
- Produces: `issueApprovalForVeto(actionHistory, tool, args?: Record<string, unknown>)` — Task 4's
  deny branch calls it with `args`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/test/approval-veto.test.ts
import { describe, it, expect } from 'vitest';
import { createActionHistory, issueApprovalForVeto } from '../src/runtime/action-history.js';
import { approvalMatchesCall, consumeApprovals } from '../src/runtime/approval-request.js';

describe('issueApprovalForVeto — the denial is the question, about the record the call names', () => {
  it('derives the subject from the call arguments', () => {
    const h = createActionHistory();
    issueApprovalForVeto(h, 'unsubscribeCustomer', { customerId: 'cust_2001' });
    expect(h.approvals).toHaveLength(1);
    expect(h.approvals[0].subject).toBe('cust_2001');
  });
  it('the issued approval licenses the same call once its code is typed', () => {
    const h = createActionHistory();
    issueApprovalForVeto(h, 'unsubscribeCustomer', { customerId: 'cust_2001' });
    const consumed = consumeApprovals(h.approvals, h.approvals[0].token, 1);
    expect(consumed).toHaveLength(1);
    expect(approvalMatchesCall(consumed[0], 'unsubscribeCustomer', { customerId: 'cust_2001' })).toBe(true);
  });
  it('falls back to the declared label when the call names no record', () => {
    const h = createActionHistory();
    h.destructiveLabels = { purgeAllLogs: 'purge all system logs' };
    issueApprovalForVeto(h, 'purgeAllLogs', {});
    expect(h.approvals).toHaveLength(1);
    expect(h.approvals[0].subject).toBeUndefined();
  });
  it('the record wins over the label when both exist', () => {
    const h = createActionHistory();
    h.destructiveLabels = { unsubscribeCustomer: 'unsubscribe a customer' };
    issueApprovalForVeto(h, 'unsubscribeCustomer', { customerId: 'cust_2001' });
    expect(h.approvals[0].subject).toBe('cust_2001');
  });
  it('issues nothing when there is neither record nor label', () => {
    const h = createActionHistory();
    issueApprovalForVeto(h, 'purgeAllLogs', {});
    expect(h.approvals).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (subject undefined where a record was expected; two-arg signature).

- [ ] **Step 3: Implement** — replace the body and doc of `issueApprovalForVeto` with the spec's
  §Route B code (subject := first `preferredIdentityValues(args)`; label fallback; neither ⇒
  nothing), and pass `args` at the `turn.ts` call site.

- [ ] **Step 4: Run** `pnpm -F @looprun-ai/core test` — pass.

- [ ] **Step 5: Commit** — `feat(core): a vetoed destructive call raises its approval from its own arguments`

---

### Task 4: Route A — the denied act is downgraded to its simulation

**Files:**
- Modify: `packages/core/src/runtime/turn.ts` (`PreToolVerdict` union + the deny branch)
- Modify: `packages/core/src/runtime/action-history.ts` (new `recordDowngradedAttempt`)
- Modify: `packages/mastra/src/hooks.ts` (`beforeToolCall` consumes the verdict)
- Modify: `packages/core/src/internal.ts` (export the new function if hooks needs it)
- Test: `packages/core/test/downgrade.test.ts` (create)

**Interfaces:**
- Consumes: `TurnActionHistory.simulatableTools` (Task 1), `issueApprovalForVeto(h, tool, args)` (Task 3).
- Produces: `PreToolVerdict` gains `{ verdict: 'downgrade'; args: Record<string, unknown> }`;
  `evaluatePreTool(spec, actionHistory, world, tool, args, opts?: { canDowngrade?: boolean })`;
  `recordDowngradedAttempt(actionHistory, name, args)`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/test/downgrade.test.ts
import { describe, it, expect } from 'vitest';
import { AgentSpecBase } from '../src/spec.js';
import { createActionHistory, recordDowngradedAttempt } from '../src/runtime/action-history.js';
import { evaluatePreTool } from '../src/runtime/turn.js';

const spec = new AgentSpecBase({
  id: 's', mode: 'm', persona: 'p',
  tools: ['cancelBooking', 'unsubscribeCustomer'],
  destructiveTools: ['cancelBooking', 'unsubscribeCustomer'],
});
const world = { toolCalls: [] } as never; // evaluatePreTool never calls the world

const history = () => {
  const h = createActionHistory();
  h.simulatableTools = new Set(['cancelBooking']);
  return h;
};

describe('the downgrade verdict', () => {
  it('downgrades a bare pre-consent act on a simulatable tool', async () => {
    const h = history();
    const v = await evaluatePreTool(spec, h, world, 'cancelBooking', { bookingId: 'bk_1001' });
    expect(v.verdict).toBe('downgrade');
    if (v.verdict === 'downgrade') expect(v.args).toEqual({ bookingId: 'bk_1001', simulate: true });
  });
  it('a downgrade is not a veto: no observed row, no vetoStreak, no approval issued', async () => {
    const h = history();
    await evaluatePreTool(spec, h, world, 'cancelBooking', { bookingId: 'bk_1001' });
    expect(h.observed).toHaveLength(0);
    expect(h.vetoStreak).toBe(0);
    expect(h.approvals).toHaveLength(0);
  });
  it('the re-entry with simulate:true is allowed (the bypass licenses it)', async () => {
    const h = history();
    const v = await evaluatePreTool(spec, h, world, 'cancelBooking', { bookingId: 'bk_1001', simulate: true });
    expect(v.verdict).toBe('allow');
  });
  it('a non-simulatable tool is vetoed and the veto raises the question from the args', async () => {
    const h = history();
    const v = await evaluatePreTool(spec, h, world, 'unsubscribeCustomer', { customerId: 'cust_2001' });
    expect(v.verdict).toBe('deny');
    expect(h.approvals).toHaveLength(1);
    expect(h.approvals[0].subject).toBe('cust_2001');
  });
  it('canDowngrade:false routes the simulatable tool through the veto-question path too', async () => {
    const h = history();
    const v = await evaluatePreTool(spec, h, world, 'cancelBooking', { bookingId: 'bk_1001' }, { canDowngrade: false });
    expect(v.verdict).toBe('deny');
    expect(h.approvals).toHaveLength(1);
    expect(h.approvals[0].subject).toBe('bk_1001');
  });
});

describe('recordDowngradedAttempt', () => {
  it('records the attempt for E1 and a guard-events note, and nothing else', () => {
    const h = createActionHistory();
    recordDowngradedAttempt(h, 'cancelBooking', { bookingId: 'bk_1001' });
    expect(h.attemptedCalls).toEqual([{ name: 'cancelBooking', args: { bookingId: 'bk_1001' } }]);
    expect(h.turnCorrections).toEqual(['downgrade:confirmFirst:cancelBooking']);
    expect(h.observed).toHaveLength(0);
    expect(h.vetoStreak).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`downgrade` is not a verdict; `recordDowngradedAttempt` not exported).

- [ ] **Step 3: Implement.**
  - `PreToolVerdict`: add the `downgrade` member to the union.
  - `evaluatePreTool(…, opts?: { canDowngrade?: boolean })` (default `true`). In the guard loop's
    deny path, BEFORE `recordVeto`:

```ts
if (g.kind === 'confirmFirst' && (opts?.canDowngrade ?? true)
    && actionHistory.simulatableTools?.has(tool) && args.simulate !== true) {
  // The bare call is what made this destructive. Re-running it as a simulation costs nothing —
  // a simulation changes nothing by construction — and it is the only way the turn produces a
  // question the user can answer: the world validates the act, describes it, and names the
  // record the question binds to.
  const selfIx = actionHistory.inFlightCalls.indexOf(selfEntry);
  if (selfIx >= 0) actionHistory.inFlightCalls.splice(selfIx, 1);
  recordDowngradedAttempt(actionHistory, tool, args);
  return { verdict: 'downgrade', args: { ...args, simulate: true } };
}
```

    The existing veto path (recordVeto + `issueApprovalForVeto(actionHistory, tool, args)`) stays
    for every other deny.
  - `recordDowngradedAttempt` in `action-history.ts` (export via `internal.ts` if `hooks.ts`
    imports from there):

```ts
/** Record a destructive attempt the runtime DOWNGRADED to its simulation (the call re-runs with
 *  `simulate: true`; the world was not reached by the bare form). The attempt is scoring surface —
 *  the agent reached for the act, and the downgrade repairs the conversation, not the mistake —
 *  so it lands in `attemptedCalls` and the guard-events log. It is not a veto: no observed row,
 *  no vetoStreak — the turn progresses. */
export function recordDowngradedAttempt(actionHistory: TurnActionHistory, name: string, args: Record<string, unknown>): void {
  actionHistory.attemptedCalls.push({ name, args });
  actionHistory.turnCorrections.push(`downgrade:confirmFirst:${name}`);
}
```

  - `hooks.ts` `beforeToolCall`, after the existing deny branch:

```ts
if (verdict.verdict === 'downgrade') {
  // One downgrade, never a loop: the re-entry carries simulate:true, so it cannot downgrade
  // again; any other guard's denial of it stands.
  const again = await evaluatePreTool(spec, session.actionHistory, session.world, toolName, verdict.args, { canDowngrade: false });
  if (again.verdict !== 'allow') {
    const r = again.verdict === 'deny' ? again : { guard: { kind: 'confirmFirst' }, reason: 'denied', mustCloseTurn: false };
    return { proceed: false as const, output: governanceVeto(r.guard.kind, r.reason, r.mustCloseTurn) };
  }
  // The runtime executes the simulation itself and hands the model its result: the model asked
  // for the act and receives requiresConfirmation + the simulation — which is what keeps its next
  // sentence honest.
  const output = session.world.exec(toolName, verdict.args);
  recordToolResult(session.actionHistory, toolName, verdict.args, output, session.world);
  return { proceed: false as const, output };
}
```

    Pass `{ canDowngrade: !opts.nativeToolsMode }` to the FIRST `evaluatePreTool` call
    (hooks.ts:50): in native-tools mode there is no `world.exec` to run the simulation with, so a
    simulatable tool falls back to the veto-question route — safe, the question is still born from
    the call's arguments.

- [ ] **Step 4: Run** `pnpm -F @looprun-ai/core test && pnpm -F @looprun-ai/mastra test` — pass.

- [ ] **Step 5: Commit** — `feat: a destructive call denied for consent re-runs as its own simulation`

---

### Task 5: `destructiveThrottle` reads the simulate shape

**Files:**
- Modify: `packages/core/src/guards/confirmation.ts` (the `destructiveThrottle` factory)
- Modify: `packages/core/src/spec.ts` (the install call — already `{ when }` from Task 2)
- Modify: `packages/core/test/guards-confirmation.test.ts` (the throttle describe blocks)

**Interfaces:**
- Consumes: nothing new.
- Produces: `destructiveThrottle(destructiveTools, opts?: { when? })` — no `confirmArg`, no `flagless`.

- [ ] **Step 1: Rewrite the throttle tests** (in the existing file, replacing flag-based cases):

```ts
describe('destructiveThrottle — one effect per turn; simulations are free', () => {
  const g = destructiveThrottle(['cancelBooking', 'freezeAccount']);
  const effect: ObservedCall = { name: 'cancelBooking', args: { id: 'BK-1' }, ok: true, turnIndex: 1, tookEffect: true };

  it('stops the second effect of the turn', () => {
    expect(g.check(ctx({ tool: 'freezeAccount', args: { id: 'AC-9' }, observed: [effect] }))).not.toBeNull();
  });
  it('an executed simulation does not consume the turn', () => {
    const sim: ObservedCall = { name: 'cancelBooking', args: { id: 'BK-1', simulate: true }, ok: true, turnIndex: 1, tookEffect: false, resultFlags: { requiresConfirmation: true } };
    expect(g.check(ctx({ tool: 'cancelBooking', args: { id: 'BK-1' }, observed: [sim] }))).toBeNull();
  });
  it('two simulate siblings in one step both pass — a multi-simulation is legal', () => {
    const sib: ObservedCall = { name: 'cancelBooking', args: { id: 'BK-1', simulate: true }, ok: true, turnIndex: 1 };
    expect(g.check(ctx({ tool: 'cancelBooking', args: { id: 'BK-2', simulate: true }, observed: [], siblingCallsThisStep: [sib] }))).toBeNull();
  });
  it('a bare sibling counts as an effect from the first one', () => {
    const sib: ObservedCall = { name: 'cancelBooking', args: { id: 'BK-1' }, ok: true, turnIndex: 1 };
    expect(g.check(ctx({ tool: 'cancelBooking', args: { id: 'BK-2' }, observed: [], siblingCallsThisStep: [sib] }))).not.toBeNull();
  });
  it('a call that took effect counts whatever its flags claim', () => {
    const lyingSim: ObservedCall = { name: 'cancelBooking', args: { id: 'BK-1', simulate: true }, ok: true, turnIndex: 1, tookEffect: true };
    expect(g.check(ctx({ tool: 'freezeAccount', args: { id: 'AC-9' }, observed: [lyingSim] }))).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement.** Delete `confirmArg` and `flagless` (options, locals, doc mentions).
  The two probe tests become:

```ts
// The caller's DECLARED simulation: an explicit `simulate: true`, or a result that came back
// asking for confirmation. Effect beats flags: `tookEffect === true` counts, whatever the args say.
const flagsDeclareSimulation = (o: ObservedCall): boolean =>
  o.resultFlags?.requiresConfirmation === true || o.args?.simulate === true;
const executedIsSimulation = (o: ObservedCall): boolean => o.tookEffect === false && flagsDeclareSimulation(o);
// A same-step sibling has not run, so its own `simulate: true` is the only evidence there is;
// a bare sibling is an act and counts from the first one.
const pendingIsSimulation = (o: ObservedCall): boolean => o.args?.simulate === true;
```

  Rewrite the factory's doc comment as-is (simulations are free; effect beats flags; the bare
  sibling counts — no residual paragraph about uncountable flag shapes, because the shape no
  longer exists). Update the catalog entry prose for the throttle and regenerate the guards
  chapter (`node scripts/gen-guards-chapter.mjs`).

- [ ] **Step 4: Run** `pnpm test` at the root — pass.

- [ ] **Step 5: Commit** — `feat(core): the throttle reads the simulate shape; a bare sibling is an effect`

---

### Task 6: Engine proofs + governance record

**Files:**
- Create: `packages/core/test/proofs/consent-routes.test.ts`
- Create/Modify: `governance/proofs/*` + `governance/MATRIX.md` (driven by the skill)

**Interfaces:**
- Consumes: everything Tasks 1–5 produced; `defineWorld` (Task 2's `simulatable` decl).

- [ ] **Step 1: Write the two route proofs** — end-to-end over a real `defineWorld` world and a
  real `AgentSpecBase`, exercising `evaluatePreTool` → `world.exec` → `recordToolResult` →
  `consumeApprovals`, mirroring the harness style of the existing files under
  `packages/core/test/proofs/`:

```
ROUTE A   spec: cancelBooking simulatable; bare pre-consent call
  assert  verdict downgrade → exec({...simulate:true}) → audit outcome 'simulated', no effect
          approval issued with subject bk_1001 (from the simulation result)
          attemptedCalls carries the bare attempt; vetoStreak 0
          next turn: consumeApprovals(code) → evaluatePreTool(bare) → allow → exec → tookEffect
ROUTE B   spec: unsubscribeCustomer not simulatable; bare pre-consent call
  assert  verdict deny; approval subject cust_2001; reply-side approvals issued this turn
          next turn with the code: the SAME bare call → allow → exec → tookEffect
NEGATIVE  purgeAllLogs, no identity arg, no label: deny and NO approval ever exists;
          a later turn typing anything never licenses it
```

  Write each assertion as real vitest code against the APIs above (the proof file is the
  executable form of the spec's §How to measure, first two bullets).

- [ ] **Step 2: Run — expect PASS** (Tasks 1–5 built it all; a failure here is a defect in them — fix there, not in the proof).

- [ ] **Step 3: Invoke the looprun-governance skill** for the changed guard kinds (`confirmFirst`,
  `destructiveThrottle`): produce the deterministic proof records under `governance/proofs/` and
  the MATRIX update it demands; the `check-record-required` gate must be green.

- [ ] **Step 4: Commit** — `test(core): route proofs for the one consent check + governance records`

---

### Task 7: Docs — the tree states the new truth

**Files:**
- Modify: `packages/core/GUARDS.md` (regenerated + hand sections), `docs/tutorial/03-agent-anatomy.md`,
  `docs/tutorial/04-guards.md`, `docs/tutorial/05-running-and-eval.md`, `packages/eval/README.md`
  (hit list from Step 1)

- [ ] **Step 1: Enumerate every stale passage:**
  `grep -rniE "confirmed|confirmMechanism|prior-ask|two-step|flagless" docs packages/*/README.md packages/core/GUARDS.md`
  (excluding `docs/superpowers/**` — dated design records keep their words).

- [ ] **Step 2: Rewrite each hit AS-IS** — the protocol is: simulate first where the tool offers
  `simulate: true`; the bare call acts and runs only on the typed approval code; a tool that
  cannot simulate is asked about by being attempted. No passage narrates the change or names the
  old polarity.

- [ ] **Step 3: Run** `pnpm test` at the root (includes the guards-chapter `--check`).

- [ ] **Step 4: Commit** — `docs: the consent protocol as it is — simulate first, act on the code`

---

### Task 8: Acceptance sweep

- [ ] **Step 1: The identifier search returns zero:**

```bash
grep -rniE "confirmMechanism|prior-ask|confirmFirstPriorAsk|confirmArg|CONFIRM_FLAG|flagless|\bconfirmed['\"]?\s*[:=]" \
  packages docs scripts governance/MATRIX.md \
  --include="*.ts" --include="*.md" --include="*.mjs" --include="*.json" \
  | grep -vE "docs/superpowers/(specs|plans)|governance/proofs|node_modules|dist"
```

  Expected: no output. Each hit is unfinished Task 2/5/7 work — fix it there. (The English word
  "confirmed" in prose is legal; the pattern above matches only the identifier shapes.)

- [ ] **Step 2: Full suite** — `pnpm test` at the root. Expected: all green.

- [ ] **Step 3: Commit anything the sweep fixed** — `chore: consent polarity acceptance sweep`

---

## Out of scope (follow-on plans, per spec §Order of work)

1. **agentspec skill** — `gen.md` laws (simulate-validity, simulate×act parity, emend-via-proxy),
   `guard-catalog.md`, `evals.md` (route coverage + the forbidden entry keyed on the acting
   shape), `spec-template.ts`, `lint-authoring.mjs` (+ the new label-or-record rule).
2. **Subjects and benches** — regenerate worlds/specs; rewrite the `-preapproved` forbidden entry
   to the acting shape (`simulate` not `true`, pre-consent, over executed ∪ attempted); re-measure
   the slice governed-only.
