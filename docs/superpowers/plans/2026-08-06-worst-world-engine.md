# Worst World, Owned Truth — Implementation Plan

> **CLOSED.** Shipped on `main` (engine and skill repos). The sensitive-data seam is
> `packages/core/src/runtime/sensitive-filter.ts`, driven by `contract.sensitiveFields` and
> `contract.scrubTextFields`. The atlas regeneration and its re-measurement stay outside this plan.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a schema-licensed simulation pass the guard gate as a read, make a rule-grounded refusal declarable, render the engine's knowledge (report lines, open approvals, authored error sentences) under every delivery, and filter sensitive data at the executor boundary.

**Architecture:** One short-circuit in `evaluatePreTool` (simulation → always-family only); one new grounding row in `honesty.ts`; the operation record and the exhaustion closure enriched from data the action history already holds; a new `sensitive-filter` module driven by two contract declarations, applied at three seams (executor result, write arguments, delivery funnel).

**Tech Stack:** TypeScript, pnpm workspaces, vitest. Spec: `docs/superpowers/specs/2026-08-06-worst-world-design.md`.

**Scope:** two repos. `looprun` — engine (Tasks 1–9), the eval-DSL no-effect invariant (Task 10), and every doc/tutorial surface (Task 11). `agentspec` (`/Users/marcos/Dev/js/looprun/agentspec`) — the skill's gen/evals/catalog references (Tasks 12–13), the authoring lints (Task 14), and the full documentation sweep (Task 15). The atlas regeneration and its re-measurement are their own plan, outside this one's scope.

## Global Constraints

- **Precondition:** working tree clean, simulate-first consent merged (v0.14.0+). Verify before Task 1: `packages/core/src/runtime/approval-request.ts` exists and `git status --short` is empty. If not, STOP and ask.
- **Stone rules:** every byte written is English; comments state what the system IS — no "used to", no "renamed from", no test names, no measurements.
- **Vocabulary (verbatim):** `simulate`, `simulationResult`, `simulatableTools`, `actionHistory`, `ApprovalRequest`, `approvalCode`, audit `outcome: 'simulated'`.
- **No compatibility alias.** New contract fields are additive; nothing renames.
- **Test commands:** package: `pnpm -F @looprun-ai/core test` (vitest, tests in `packages/core/test/*.test.ts`). Repo: `pnpm test` at the root (all packages + `node scripts/gen-guards-chapter.mjs --check`). Proofs: `pnpm proofs:run`.
- **Test setup:** every new test file mirrors the ctx/action-history builders of the named sibling test file — do not invent new harness helpers.

---

### Task 1: A schema-licensed simulation is a read

**Files:**
- Modify: `packages/core/src/runtime/turn.ts` (`evaluatePreTool`, the guard loop around lines 104–167)
- Test: `packages/core/test/simulation-is-a-read.test.ts` (new; mirror the setup of `packages/core/test/simulatable-tools.test.ts`)

**Interfaces:**
- Consumes: `actionHistory.simulatableTools: Set<string>` (seated at run start), `resolveGuards`.
- Produces: exported `ALWAYS_GUARD_KINDS: ReadonlySet<string>` from `turn.ts` — the guard kinds that still gate a simulation. Tasks 9's proof cases reference it.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/test/simulation-is-a-read.test.ts
import { describe, expect, test } from 'vitest';
// Mirror simulatable-tools.test.ts: build a spec with one destructive simulatable tool
// ('cancelBooking', schema declaring `simulate`) plus a spec-authored precondition guard
// on that tool whose check always denies with 'blocked by mirror'.

describe('a schema-licensed simulation is a read', () => {
  test('simulate:true on a simulatable tool passes a denying precondition guard', async () => {
    const verdict = await evaluatePreTool(/* ctx for */ 'cancelBooking', { bookingId: 'bk_1', simulate: true });
    expect(verdict.verdict).toBe('allow');
  });

  test('simulate:true on a tool whose schema has no simulate is NOT exempt', async () => {
    // same spec, tool 'purgeLogs' destructive but not in simulatableTools
    const verdict = await evaluatePreTool('purgeLogs', { simulate: true });
    expect(verdict.verdict).toBe('deny'); // the call is an act; an executor drops unknown args
  });

  test('noDuplicateCall still gates a repeated identical simulation', async () => {
    await evaluatePreTool('cancelBooking', { bookingId: 'bk_1', simulate: true }); // recorded
    const second = await evaluatePreTool('cancelBooking', { bookingId: 'bk_1', simulate: true });
    expect(second.verdict).toBe('deny'); // a looping simulation is a loop
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -F @looprun-ai/core test -- simulation-is-a-read`
Expected: FAIL — first test gets `deny` (the mirror guard fires on the simulation today).

- [ ] **Step 3: Implement the short-circuit**

In `evaluatePreTool`, after resolving the guard list and registering the in-flight call, before the guard loop:

```ts
/** Guard kinds that gate even a simulation — a simulation changes nothing, but a looping
 *  simulation is still a loop. Every other preTool guard checks a rule the WORLD validates
 *  in full on a simulation, so the world's own answer is the enforcement. */
export const ALWAYS_GUARD_KINDS: ReadonlySet<string> = new Set(['noDuplicateCall']);

const isSimulation = args.simulate === true && actionHistory.simulatableTools?.has(tool) === true;
const active = isSimulation ? guards.filter((g) => ALWAYS_GUARD_KINDS.has(g.kind)) : guards;
```

and iterate `active` instead of `guards`. `confirmFirst` keeps its own schema-licensed bypass line — the guard states the law for the isolated proof lane; this filter extends it to every guard.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm -F @looprun-ai/core test -- simulation-is-a-read` → PASS, then `pnpm -F @looprun-ai/core test` → no regressions.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/runtime/turn.ts packages/core/test/simulation-is-a-read.test.ts
git commit -m "feat(core): a schema-licensed simulation passes the guard gate as a read"
```

---

### Task 2: Refusal by rule is groundable

**Files:**
- Modify: `packages/core/src/guards/honesty.ts` (`isGrounded`, the `'blocked'/'refused'` case, around lines 337–343)
- Test: `packages/core/test/refusal-by-rule.test.ts` (new; mirror the ctx builder of the existing grounded tests — see `packages/core/test/claims-action-history.test.ts`)

**Interfaces:**
- Consumes: `isGrounded`'s existing helpers `addressed`, `effectedWrite`, `isRead`, `targetIn`, `addressedEvidence`.
- Produces: no new exports — the grounding-table row only.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/test/refusal-by-rule.test.ts
describe('refusal by rule', () => {
  test('refused grounds on a read that addressed the entity with no effected write', () => {
    // observed: getBooking({bookingId:'bk_1003'}) ok, read, result names bk_1003
    // did: [{ action: 'release', target: 'bk_1003', outcome: 'refused' }]
    // attempts: []  → today this is UNGROUNDED; the new row grounds it
    expect(check(ctx)).toBeNull();
  });

  test('an effected write on the entity still refutes the refusal', () => {
    // observed additionally: releaseDeposit bk_1003 tookEffect:true
    expect(check(ctx)).toMatch(/report only what actually happened/);
  });

  test('refused on an entity no read addressed stays ungrounded', () => {
    // observed: one read that names only bk_9999
    expect(check(ctx)).toMatch(/report only what actually happened/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -F @looprun-ai/core test -- refusal-by-rule`
Expected: FAIL — the first test gets a deny string (no attempt, no failed call → ungrounded today).

- [ ] **Step 3: Implement the row**

```ts
case 'blocked':
case 'refused':
  return (
    attempts.some((a) => claimMatches(claim, attemptEvidence(a))) ||
    calls.some((c) => c.ok === false && addressed(c)) ||
    // Refusal by RULE: the turn read the entity and changed nothing — the refusal is the
    // spec's own law speaking, and demanding an attempt as its proof would order the model
    // to reach for the act it is refusing. An effected write on the entity still refutes it.
    (calls.some((c) => isRead(c) && c.ok && addressed(c)) &&
      !calls.some((c) => effectedWrite(c) && targetIn(claim.target, addressedEvidence(ctx, c).identity)))
  );
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm -F @looprun-ai/core test -- refusal-by-rule` → PASS, then the full package suite.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/guards/honesty.ts packages/core/test/refusal-by-rule.test.ts
git commit -m "feat(core): a rule-grounded refusal is declarable without an attempt"
```

---

### Task 3: The grounded deny names what IS declarable

**Files:**
- Modify: `packages/core/src/guards/honesty.ts` (`claimIsGrounded`'s deny path, around lines 369–399)
- Test: extend `packages/core/test/refusal-by-rule.test.ts`

**Interfaces:**
- Consumes: `isGrounded` (Task 2's final form).
- Produces: the deny string format `…report only what actually happened. Declarable for <target> with this turn's evidence: <outcomes|none>.` — Task 9's proof cases assert on it.

- [ ] **Step 1: Write the failing test**

```ts
test('the deny lists the outcomes the evidence supports', () => {
  // observed: getBooking bk_1003 ok (read); did: [{ target:'bk_1003', outcome:'success' }]
  const deny = check(ctx);
  expect(deny).toMatch(/Declarable for bk_1003 with this turn's evidence: /);
  expect(deny).toContain('refused'); // the rule-grounded row (Task 2) makes it declarable
  expect(deny).not.toContain('success');
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm -F @looprun-ai/core test -- refusal-by-rule` → FAIL (no such sentence today).

- [ ] **Step 3: Implement**

At the point the guard composes its deny for an ungrounded claim:

```ts
const CORE_OUTCOMES: CoreOutcome[] = ['success', 'failure', 'blocked', 'refused', 'not_found', 'pending_confirmation', 'no_op'];
const declarable = CORE_OUTCOMES.filter((o) => isGrounded(ctx, claim, o, calls, attempts, writes));
const hint = ` Declarable for ${claim.target ?? 'this entity'} with this turn's evidence: ${declarable.length ? declarable.join(', ') : 'none'}.`;
```

appended to the existing deny sentence. The redrive already joins guard reasons verbatim (`redriveMessage`), so the model reads the hint on the next rewrite — no `turn.ts` change.

- [ ] **Step 4: Run to verify pass** — package suite green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/guards/honesty.ts packages/core/test/refusal-by-rule.test.ts
git commit -m "feat(core): the grounded deny names the outcomes the turn's evidence supports"
```

---

### Task 4: The result's report line rides the operation record

**Files:**
- Modify: `packages/core/src/runtime/action-history.ts` (`recordToolResult`, `ObservedCall` type)
- Modify: `packages/core/src/runtime/claims.ts` (`deriveClaimsFromActionHistory`, `operationRecord`)
- Test: `packages/core/test/report-line.test.ts` (new; mirror `packages/core/test/claims-render.test.ts`)

**Interfaces:**
- Consumes: `recordToolResult`'s existing extraction pattern (`producedLabel`).
- Produces: `ObservedCall.report?: string`; operation-record rendering `<target>: <outcome> — <report>`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/test/report-line.test.ts
test('a write result report line renders after the outcome', () => {
  // recordToolResult(actionHistory, 'cancelDispatch', {bookingId:'bk_1001'},
  //   { ok:true, id:'bk_1001', report:'removed tech_4003; 2026-07-10 freed' }, world)
  // derive claims, render operationRecord
  expect(rendered).toContain('bk_1001: done — removed tech_4003; 2026-07-10 freed');
});

test('a simulation result report line rides the pending line', () => {
  // result: { ok:true, requiresConfirmation:true, report:'charges 3000 USD deposit' }
  expect(rendered).toMatch(/bk_1001: awaiting your confirmation — charges 3000 USD deposit/);
});

test('a result without report renders exactly as before', () => {
  expect(rendered).toContain('bk_1001: done');
  expect(rendered).not.toContain(' — ');
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm -F @looprun-ai/core test -- report-line` → FAIL.

- [ ] **Step 3: Implement**

In `recordToolResult`, beside the `producedLabel` extraction:

```ts
// The result's own sentence about what it did — authored in the world/tool, rendered
// verbatim under the delivery so the fact arrives even when the prose forgets it.
const rep = (output as { report?: unknown } | null | undefined)?.report;
const report = typeof rep === 'string' && rep.trim() !== '' ? rep : undefined;
```

pushed onto the observed entry (`...(report !== undefined ? { report } : {})`). In `deriveClaimsFromActionHistory`, carry the grounding row's `report` onto the derived claim; in `operationRecord`, render `` — ${report}`` after the outcome word for claims that carry one.

- [ ] **Step 4: Run to verify pass** — package suite green (existing render tests unchanged: no `report` field → identical output).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/runtime/action-history.ts packages/core/src/runtime/claims.ts packages/core/test/report-line.test.ts
git commit -m "feat(core): the result's report line rides the operation record"
```

---

### Task 5: Open approvals render every turn

**Files:**
- Modify: `packages/core/src/runtime/turn.ts:357` (the `composeDeliveryText` call site)
- Test: `packages/core/test/open-approvals-render.test.ts` (new; mirror `packages/core/test/approval-action-history.test.ts`)

**Interfaces:**
- Consumes: `actionHistory.approvals`, `ApprovalRequest.consumedTurn/closed`.
- Produces: delivery text carries every OPEN approval's question, not only this turn's.

- [ ] **Step 1: Write the failing test**

```ts
test('an approval issued last turn and still open renders in this turn delivery', () => {
  // turn 1: issueApproval(actionHistory, { tool:'chargeDeposit', subject:'bk_1001', meaning:'bk_1001' })
  // turn 2: beginTurn with a message that does NOT carry the code; deliver a reply
  expect(delivered).toContain('To confirm bk_1001, reply: CONFIRM BK_1001');
});

test('a consumed or closed approval renders nothing', () => {
  expect(delivered).not.toContain('CONFIRM BK_1001');
});
```

- [ ] **Step 2: Run to verify failure** — FAIL: the call site passes `approvalsIssuedThisTurn`.

- [ ] **Step 3: Implement**

```ts
// Every question still standing renders on every delivery: an approval the user has not
// answered is outstanding work, and the turn that stops naming it is the turn the user
// forgets it exists.
const openApprovals = actionHistory.approvals.filter((a) => a.consumedTurn === undefined && !a.closed);
return composeDeliveryText(payload.message, payload.did, openApprovals, contract);
```

(If `approvalsIssuedThisTurn` loses its last reader, delete it — no alias survives.)

- [ ] **Step 4: Run to verify pass** — package suite green; adjust any existing delivery test that asserted the narrower source.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/runtime/turn.ts packages/core/test/open-approvals-render.test.ts
git commit -m "feat(core): every open approval renders on every delivery"
```

---

### Task 6: The closure speaks in authored sentences

**Files:**
- Modify: `packages/core/src/spec.ts` (the `Guard` interface: optional `publicReason`)
- Modify: `packages/core/src/runtime/action-history.ts` (`recordVeto` stores it on the observed row)
- Modify: `packages/core/src/runtime/turn.ts` (`evaluatePreTool` passes `g.publicReason`; `deriveExhaustionClosure`)
- Modify: `packages/core/src/runtime/claims.ts` (the failure line, around line 415)
- Test: `packages/core/test/closure-sentences.test.ts` (new; mirror `packages/core/test/engine-text.test.ts`)

**Interfaces:**
- Consumes: `world.toolCalls` result lookup (the `wtc` join in `recordToolResult`).
- Produces: `Guard.publicReason?: string` (user-facing, spec-authored); closure failure lines `<target>: could not be completed — <world error message | guard publicReason>`.

- [ ] **Step 1: Write the failing tests**

```ts
test('a failed call closure line carries the world error message', () => {
  // observed: scheduleMaintenance ok:false, world.toolCalls result
  //   { ok:false, error:'ASSET_IN_MAINTENANCE', message:'ast_genr01 is already in maintenance' }
  expect(closure).toContain('could not be completed — ast_genr01 is already in maintenance');
});

test('a vetoed call closure line carries the guard public sentence when authored', () => {
  // guard { kind:'precondition', publicReason:'the workspace is suspended', ... } vetoes a write
  expect(closure).toContain('— the workspace is suspended');
});

test('no authored sentence → the line renders exactly as before', () => {
  expect(closure).toContain('An action could not be completed.');
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm -F @looprun-ai/core test -- closure-sentences` → FAIL.

- [ ] **Step 3: Implement**

`Guard` gains:

```ts
/** One user-facing sentence for the delivery when this guard stops a call. Authored in the
 *  spec, never composed at runtime — the closure ships after the reply checks are exhausted,
 *  so only authored text may ride it. Absent: the closure keeps its generic failure line. */
publicReason?: string;
```

`recordVeto(actionHistory, name, args, correction, publicReason?)` stores `publicReason` on the observed row; the `evaluatePreTool` deny branch passes `g.publicReason`. In the closure derivation, a `failure` claim resolves its sentence: the world result's `message` for an executed `ok:false` call, else the observed row's `publicReason` for a veto, else nothing — rendered as `` — ${sentence}`` on the failure line. Raw read data never enters: only these two authored strings.

- [ ] **Step 4: Run to verify pass** — package suite green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/spec.ts packages/core/src/runtime/action-history.ts packages/core/src/runtime/turn.ts packages/core/src/runtime/claims.ts packages/core/test/closure-sentences.test.ts
git commit -m "feat(core): the closure composes authored sentences from the action history"
```

---

### Task 7: The sensitive-data filter module

**Files:**
- Create: `packages/core/src/runtime/sensitive-filter.ts`
- Modify: `packages/core/src/spec.ts` (the contract interface that declares `writeTools`/`writeGate` — add the two fields beside them, following `writeGate`'s doc-comment style)
- Test: `packages/core/test/sensitive-filter.test.ts`

**Interfaces:**
- Consumes: nothing from the runtime — pure functions.
- Produces:

```ts
export type SensitiveMode = 'omit' | 'mask';
/** contract.sensitiveFields — dot-suffix paths over result keys: 'customer.phone' matches a
 *  `phone` key directly under a `customer` object anywhere in the result; a bare 'phone'
 *  matches any `phone` key. */
export function filterSensitiveFields(value: unknown, fields: Record<string, SensitiveMode>): unknown;
/** Pattern scrub for free text: emails, card numbers passing the Luhn check, and
 *  conservative phone shapes (+country or 7+ digits with separators). Names and addresses
 *  are the assumed residue — no pattern covers them. */
export function scrubText(text: string): string;
export function maskValue(s: string): string; // 'o•••@northside.example' shape
```

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/test/sensitive-filter.test.ts
test('omit deletes the field wherever its path suffix matches', () => {
  const out = filterSensitiveFields(
    { customer: { phone: '555-0199', name: 'Ana' }, items: [{ customer: { phone: 'x' } }] },
    { 'customer.phone': 'omit' },
  );
  expect(JSON.stringify(out)).not.toContain('phone');
  expect((out as any).customer.name).toBe('Ana');
});

test('mask replaces the value, keeps the shape recognizable', () => {
  const out = filterSensitiveFields({ customer: { email: 'ops@northside.example' } }, { 'customer.email': 'mask' });
  expect((out as any).customer.email).toBe('o•••@northside.example');
});

test('inputs are never mutated', () => {
  const input = { customer: { phone: '555-0199' } };
  filterSensitiveFields(input, { 'customer.phone': 'omit' });
  expect(input.customer.phone).toBe('555-0199');
});

test('scrubText masks well-formed classes and nothing else', () => {
  expect(scrubText('mail ops@x.example or +1 415 555 0199')).toBe('mail ••• or •••');
  expect(scrubText('invoice inv_7001 total 2930 on 2026-08-03')).toBe('invoice inv_7001 total 2930 on 2026-08-03');
});

test('card numbers pass only via Luhn', () => {
  expect(scrubText('card 4539 1488 0343 6467')).toBe('card •••'); // Luhn-valid
  expect(scrubText('ref 4539 1488 0343 6468')).toBe('ref 4539 1488 0343 6468'); // Luhn-invalid
});
```

- [ ] **Step 2: Run to verify failure** — module does not exist.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/runtime/sensitive-filter.ts
export type SensitiveMode = 'omit' | 'mask';

export function maskValue(s: string): string {
  const at = s.indexOf('@');
  return at > 0 ? `${s[0]}•••${s.slice(at)}` : s.length > 0 ? `${s[0]}•••` : s;
}

/** Immutable deep walk: returns a new value with declared fields omitted or masked. */
export function filterSensitiveFields(value: unknown, fields: Record<string, SensitiveMode>): unknown {
  const suffixes = Object.entries(fields).map(([k, mode]) => ({ parts: k.split('.'), mode }));
  const matches = (path: string[]) => suffixes.find((s) => s.parts.length <= path.length && s.parts.every((p, i) => p === path[path.length - s.parts.length + i]));
  const walk = (v: unknown, path: string[]): unknown => {
    if (Array.isArray(v)) return v.map((x) => walk(x, path));
    if (v === null || typeof v !== 'object') return v;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const hit = matches([...path, k]);
      if (hit?.mode === 'omit') continue;
      out[k] = hit?.mode === 'mask' && typeof x === 'string' ? maskValue(x) : walk(x, [...path, k]);
    }
    return out;
  };
  return walk(value, []);
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\d[\s.-]?){7,14}\d/g; // conservative: 8+ digits with separators or +country
const CARD = /\b(?:\d[ -]?){13,19}\b/g;

function luhnValid(run: string): boolean {
  const digits = run.replace(/\D/g, '');
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return digits.length >= 13 && sum % 10 === 0;
}

export function scrubText(text: string): string {
  return text
    .replace(CARD, (m) => (luhnValid(m) ? '•••' : m))
    .replace(EMAIL, '•••')
    .replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 8 && /[\s.+-]/.test(m) ? '•••' : m));
}
```

Tune the phone pattern against the test's negative cases (`inv_7001`, `2930`, dates) until both assertions hold — the negatives are the requirement, not the pattern. Contract fields on the domain contract type:

```ts
/** Fields no result may carry into the model's context: 'omit' deletes, 'mask' keeps a
 *  recognizable masked form. Dot-suffix paths over result keys. The executor is not
 *  trusted to hide anything — this filter runs on our side of the boundary. */
sensitiveFields?: Record<string, SensitiveMode>;
/** Free-text fields (dot-suffix over tool argument and result keys) whose CONTENT is
 *  pattern-scrubbed: emails, Luhn-valid card numbers, conservative phone shapes. A field
 *  that legitimately carries contact data is simply not declared — the acceptance is
 *  authored and visible. */
scrubTextFields?: string[];
```

- [ ] **Step 4: Run to verify pass** — `pnpm -F @looprun-ai/core test -- sensitive-filter` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/runtime/sensitive-filter.ts packages/core/src/spec.ts packages/core/test/sensitive-filter.test.ts
git commit -m "feat(core): sensitive-data filter — declared fields and free-text patterns"
```

---

### Task 8: Wire the filter at the three seams

**Files:**
- Modify: `packages/mastra/src/hooks.ts` (executor result → filter before the model and before `recordToolResult`; write args → scrub declared free-text fields after guards allow, before dispatch)
- Modify: `packages/core/src/runtime/turn.ts` (`composeDeliveryText` output → `scrubText` over declared-scrub content as the final net)
- Test: `packages/core/test/sensitive-filter-seams.test.ts` (runtime-level; mirror the fixture-world setup of `packages/core/test/runtime-neutrality.test.ts`)

**Interfaces:**
- Consumes: Task 7's `filterSensitiveFields`, `scrubText`; the contract fields.
- Produces: every context entry, stored argument and delivered byte is clean by construction.

- [ ] **Step 1: Write the failing tests**

```ts
test('a raw executor result reaches the model filtered', async () => {
  // fixture world tool getCustomer returns { phone:'555-0199', email:'ops@x.example' };
  // contract: { sensitiveFields: { phone:'omit', email:'mask' } }
  const result = await runTool('getCustomer', {});
  expect(JSON.stringify(result)).not.toContain('555-0199');
  expect(JSON.stringify(result)).toContain('o•••@x.example');
  // and the action history recorded the FILTERED form:
  expect(JSON.stringify(actionHistory.observed)).not.toContain('555-0199');
});

test('a declared free-text write argument is scrubbed before the executor', async () => {
  // contract: { scrubTextFields: ['fileClaim.description'] }
  await runTool('fileClaim', { description: 'boom cracked — call +1 415 555 0199' });
  expect(worldReceivedArgs.description).toBe('boom cracked — call •••');
});

test('the delivery funnel is the final net', () => {
  // a reply whose prose carries an email that slipped in via user text
  expect(delivered).not.toMatch(/@x\.example/);
});
```

- [ ] **Step 2: Run to verify failure** — raw values pass through today.

- [ ] **Step 3: Implement**

In the backend seam where the executor's output returns (the `afterToolCall`/exec path in `hooks.ts`): `output = filterSensitiveFields(output, contract.sensitiveFields ?? {})` — ONE line, before the model sees it and before `recordToolResult` records it (the footer, the consent question and the closure read from the filtered record for free). In the allow path before dispatch: for each `scrubTextFields` suffix matching `<tool>.<argKey>`, `args[argKey] = scrubText(String(args[argKey]))`. In `composeDeliveryText`'s return: when the contract declares any `scrubTextFields`, pass the composed text through `scrubText` as the last net.

- [ ] **Step 4: Run to verify pass** — package + repo suites green.

- [ ] **Step 5: Commit**

```bash
git add packages/mastra/src/hooks.ts packages/core/src/runtime/turn.ts packages/core/test/sensitive-filter-seams.test.ts
git commit -m "feat(core): the sensitive filter runs at the executor, argument and delivery seams"
```

---

### Task 9: Governance — proofs, records, matrix

**Files:**
- Create: proof cases for the changed surfaces (follow `skills/looprun-governance/references/proof-case-authoring.md`)
- Create: `governance/proofs/2026-08-06-worst-world-engine.md` (via the looprun-governance skill)
- Modify: `governance/MATRIX.md` (re-derived)

**Interfaces:**
- Consumes: everything Tasks 1–8 shipped, `ALWAYS_GUARD_KINDS`, the Task 3 deny format.
- Produces: a PASS proof record; `check-record-required` gates the merge.

- [ ] **Step 1: Invoke the looprun-governance skill** — this is a guard-runtime change (`change_kind: runtime`); the skill drives the record shape.

- [ ] **Step 2: Author the proof cases** — positive/negative/neutral per changed behavior: simulation-passes-guards (schema-licensed yes, unlicensed no, duplicate simulation still gated); refusal-by-rule (grounds, refuted-by-effect, unaddressed stays denied); declarable-outcomes deny format; report/approval rendering; closure sentences; filter omit/mask/scrub including one stored-argument scrub; ≥1 L3 loop case; the collective non-interference check.

- [ ] **Step 3: Run** `pnpm proofs:run` — Expected: all lanes PASS. Fix regressions before recording.

- [ ] **Step 4: Record the result** in the proof record with the lane table from `governance/.artifacts/proofs.json`, re-derive `governance/MATRIX.md`.

- [ ] **Step 5: Full-repo verification and commit**

Run: `pnpm test` at the root (includes `node scripts/gen-guards-chapter.mjs --check` — regenerate the guards chapter if the catalog text changed).

```bash
git add governance/ packages/
git commit -m "test(core): route proofs + governance record for the worst-world engine laws"
```

---

### Task 10: The no-effect invariant in the eval DSL

**Files:**
- Modify: `packages/eval/src/cases-config.ts` (the invariants type beside `forbiddenToolCalls`)
- Modify: `packages/eval/src/validate.ts` (the verdict computation)
- Test: beside the eval package's existing validate tests (`packages/eval/test/` — mirror the file that exercises `forbiddenToolCalls`)

**Interfaces:**
- Consumes: the world action-history rows a run records (`tookEffect`).
- Produces: `invariants.noEffectToolCalls?: Array<{ name: string; args?: Record<string, unknown> }>` — violated only by a matching call that TOOK EFFECT; a veto, a simulation or a failed call never counts. Task 13's evals.md recipe references it.

- [ ] **Step 1: Write the failing tests**

```ts
test('noEffectToolCalls passes on a vetoed attempt of the named call', () => {
  // trace: cancelBooking bk_1004 vetoed (attemptedCalls entry, no world row)
  expect(verdict.pass).toBe(true);
});

test('noEffectToolCalls fails when the named call took effect', () => {
  // trace: cancelBooking bk_1004 world row tookEffect:true
  expect(verdict.violations[0]).toMatch(/took effect: cancelBooking/);
});

test('a simulation of the named call passes', () => {
  // trace: cancelBooking bk_1004 simulate:true, tookEffect:false
  expect(verdict.pass).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm -F @looprun-ai/eval test` → FAIL (field unknown).

- [ ] **Step 3: Implement** — add the field to the invariants type and, in `validate.ts`, one check over the world action history: a row matching name (and `args` subset, canonicalized like `forbiddenToolCalls` matches them) with `tookEffect === true` → violation `` `took effect: ${name}` ``. It reads the WORLD history only — the engine's enforcement is what it asserts, so the model's vetoed reach is invisible to it by construction.

- [ ] **Step 4: Run to verify pass** — eval package suite green.

- [ ] **Step 5: Commit**

```bash
git add packages/eval/src/cases-config.ts packages/eval/src/validate.ts packages/eval/test/
git commit -m "feat(eval): a no-effect invariant asserts the engine's share without punishing the veto"
```

---

### Task 11: looprun docs and tutorial say the new truth

**Files:**
- Modify: `packages/core/src/guards/catalog.ts` (the chapter source) + regenerate via `node scripts/gen-guards-chapter.mjs`
- Modify: `docs/tutorial/04-guards.md` (if hand-written parts exist), `docs/tutorial/03-agent-anatomy.md`, `docs/tutorial/05-running-and-eval.md`, `docs/tutorial/06-advanced.md`, `docs/tutorial/01-concepts.md`
- Modify: any hit of the stale-statement grep below (README.md, docs/benchmarks.md)

**Interfaces:**
- Consumes: everything Tasks 1–10 shipped.
- Produces: no doc states the pre-change behavior; the AS-IS rule holds (no "used to", no history).

- [ ] **Step 1: Find every stale statement**

```bash
grep -rn "every preTool guard\|guard gates\|approvalsIssuedThisTurn\|An action could not be completed" docs/ README.md packages/core/src/guards/catalog.ts | grep -v superpowers
```

- [ ] **Step 2: Write the new truths, each where the grep hit** — state, in the file's own voice:
  - the guard gate law: "a schema-licensed simulation is a read — only the always-family gates it; the world validates it in full and answers with the same error the act would" (catalog intro + 04-guards);
  - `publicReason`: one authored user-facing sentence a guard may carry for the closure (04-guards);
  - the operation record: a result's `report` line renders after the outcome, and every OPEN approval renders on every delivery until answered or closed (03-agent-anatomy);
  - the closure: composes authored sentences — the world's error message, a guard's public sentence — never raw read data (03-agent-anatomy or 06-advanced, wherever the delivery is described);
  - the sensitive filter: `contract.sensitiveFields` (omit/mask, executor never trusted) and `contract.scrubTextFields` (well-formed classes only; names and addresses are the stated residue) (06-advanced);
  - the exam: `noEffectToolCalls` asserts the engine's share; a consented act stopped by the throttle is the runtime working (05-running-and-eval);
  - worst world: a fixture implements exactly the documented surface (01-concepts, where worlds are introduced).

- [ ] **Step 3: Regenerate and verify** — `node scripts/gen-guards-chapter.mjs` then `pnpm test` at the root (the `--check` gate must pass); re-run the Step 1 grep → zero stale hits.

- [ ] **Step 4: Commit**

```bash
git add docs/ README.md packages/core/src/guards/catalog.ts
git commit -m "docs: the guard gate, the record, the closure and the filter as they are"
```

---

### Task 12: agentspec gen.md carries the four laws

**Files:**
- Modify: `/Users/marcos/Dev/js/looprun/agentspec/skill/references/gen.md`

**Interfaces:**
- Consumes: the spec's §1–§4 laws verbatim.
- Produces: the G-laws Task 14's lints enforce and Task 15's sweep cross-references.

- [ ] **Step 1: Add the worst-world law** to the world-authoring section:

> A generated world implements exactly what the tool surface documents — nothing safer. Documented behavior is mirrored faithfully; silence is modeled at its worst: raw data returned, any well-formed call executed, no simulation. Every validation, mask or refusal in `world.ts` cites the `tools.json` entry or docs line that promises it — a safety behavior with no citation is a governance responsibility smuggled into the fixture. Citation form, on the line above the behavior: `// promised: <tools.json pointer or docs line>`.

- [ ] **Step 2: Add the guard ownership law** to the guards section:

> A guard exists for every rule the surface does not document; a guard that duplicates a documented world error is deleted — the call (or its simulation) returns the domain error, with the figures the reply needs. A guard may carry `publicReason`: one user-facing sentence for the closure when it stops a call.

- [ ] **Step 3: Add the contract declarations** to the contract section — `sensitiveFields` (omit/mask; preference order: omit wherever nothing consumes the field, mask where the user must recognize it; there is no third mode), `scrubTextFields` (free-text pattern scrub; declaring is a per-field decision — a field that legitimately carries contact data is not declared, and the acceptance is authored), the id-by-reference law (`sendSMS({customerId})`, never `sendSMS({phone})`), and the `report` authoring law: every write result and every simulation result carries one authored `report` sentence naming what changed, in the figures the result returned.

- [ ] **Step 4: Verify and commit** — re-read the edited sections against spec §1–§4 (no law missing, no vocabulary drift), then:

```bash
cd /Users/marcos/Dev/js/looprun/agentspec && git add skill/references/gen.md
git commit -m "docs(skill): gen carries the worst-world, ownership, filter and report laws"
```

---

### Task 13: agentspec evals.md, guard-catalog.md and the template

**Files:**
- Modify: `/Users/marcos/Dev/js/looprun/agentspec/skill/references/evals.md` (the rapid-fire recipe, line ~211)
- Modify: `/Users/marcos/Dev/js/looprun/agentspec/skill/references/guard-catalog.md` (the `destructiveThrottle` entry, line ~345, and the catalog intro)
- Modify: `/Users/marcos/Dev/js/looprun/agentspec/skill/references/spec-template.ts` (contract example)

**Interfaces:**
- Consumes: Task 10's `noEffectToolCalls`, Task 12's laws.
- Produces: the recipe every future subject's rapid-fire cases are authored from.

- [ ] **Step 1: Rewrite the rapid-fire recipe in evals.md** — replace the current line's "AND a rapid-fire same-turn case" clause with:

> …AND a rapid-fire same-turn case: two approval codes typed in one message. The case requires the FIRST act, asserts the second with `noEffectToolCalls` (never `forbiddenToolCalls` — the engine's veto of a consented second act is the runtime working, and an attempt invariant would score the engine's own enforcement as the model's defect), and its rubric holds the model's share: the final reply reports the second act as outstanding, taking another turn. The same rule covers a code that licensed nothing: attempting the act is what re-raises the question.

- [ ] **Step 2: Rewrite the guard-catalog.md throttle entry** — append to the `destructiveThrottle` row: "The veto of a consented second act is the cap working; a case asserts it with a no-effect invariant, never as a forbidden attempt." Add to the catalog intro the gate law: "A schema-licensed simulation passes every guard but the always-family — the world validates it in full."

- [ ] **Step 3: Extend spec-template.ts** — add to the contract example, with one-line comments in the template's own style:

```ts
sensitiveFields: { 'customer.phone': 'omit', 'customer.email': 'mask' },
scrubTextFields: ['fileClaim.description'],
```

and one guard example carrying `publicReason: 'the workspace is suspended'`.

- [ ] **Step 4: Verify and commit** — `node skill/scripts/lint-guard-catalog.mjs` (must pass), then:

```bash
cd /Users/marcos/Dev/js/looprun/agentspec && git add skill/references/
git commit -m "docs(skill): rapid-fire cases assert the engine's share; the catalog states the gate law"
```

---

### Task 14: agentspec lints enforce the laws

**Files:**
- Modify: `/Users/marcos/Dev/js/looprun/agentspec/skill/scripts/lint-world.mjs` (the citation rule)
- Modify: `/Users/marcos/Dev/js/looprun/agentspec/skill/scripts/lint-authoring.mjs` (declaration checks)
- Test: the scripts' own fixture runs (follow each script's existing self-check pattern; if none exists, run against `subjects/` in agentspec-bench as the fixture)

**Interfaces:**
- Consumes: Task 12's citation form (`// promised: <pointer>`), the contract declarations.
- Produces: failing exit codes that gate generation.

- [ ] **Step 1: The citation rule in lint-world.mjs** — every `return`/`throw` of an error object in a generated `world.ts` (match the world's own error-shape idiom, e.g. `err('CODE'` or `{ ok: false, error:`) and every masking helper call must be preceded, within 3 lines, by `// promised:`. Report each miss as `world.ts:<line>: undocumented kindness — cite the surface promise or move it to governance`.

- [ ] **Step 2: The declaration checks in lint-authoring.mjs** —
  - every `sensitiveFields` key's last segment must appear in NO tool `inputSchema` property (the id-by-reference law: a value the model must never see cannot be a value a tool asks the model to supply);
  - every `scrubTextFields` entry must resolve to an existing free-text (`type: 'string'`) argument or result field;
  - every destructive tool's world handler must set `report` on its success and simulation results (grep the handler for `report:`), or the lint names the tool.

- [ ] **Step 3: Run both lints against the atlas fixture** — `node skill/scripts/lint-world.mjs <path-to-atlas-world>` — Expected: FAILURES on the undocumented masking and permGate (the worst-world debt this design creates is VISIBLE, which is the point; the regeneration plan pays it).

- [ ] **Step 4: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec && git add skill/scripts/
git commit -m "feat(skill): lints enforce the citation and declaration laws"
```

---

### Task 15: agentspec documentation sweep

**Files:**
- Modify: every hit of the Step 1 grep across `/Users/marcos/Dev/js/looprun/agentspec/skill/` (`SKILL.md`, `references/norms.md`, `references/ask.md`, `references/test.md`, `references/ship.md`, `references/debate.md`, `references/thinking-template.md`)

**Interfaces:**
- Consumes: Tasks 12–14's laws (the sweep must not contradict them).
- Produces: one vocabulary, zero passages teaching fixture-side kindness.

- [ ] **Step 1: Find every passage that teaches the old shape**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec && grep -rn -i "mask\|pii\|never leaves the world\|permGate\|viewer read-only\|read-only across all writes" skill/ --include='*.md' --include='*.ts' | grep -v scripts/
```

- [ ] **Step 2: Rewrite each hit AS-IS** — a passage that told the generator to mask in the world now points at `contract.sensitiveFields` + the filter; a passage that told it to enforce roles in the world now points at the guard ownership law. No file says what the guidance used to be.

- [ ] **Step 3: Verify** — re-run the Step 1 grep: remaining hits are only the NEW laws' own statements. Run `node skill/scripts/lint-guard-catalog.mjs` and `node skill/scripts/lint-stage-names.mjs` — both pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/marcos/Dev/js/looprun/agentspec && git add skill/
git commit -m "docs(skill): the references teach the worst-world shape everywhere"
```

---

## Self-Review

- **Spec coverage:** §2.2 → Task 1; §3.1 → Tasks 2–3; §3.3 → Tasks 4–5; §3.2 → Task 6; §4 → Tasks 7–8; governance → Task 9; §5 → Tasks 10 + 13; §1 + §2.1 (as skill law + lint) → Tasks 12 + 14; documentation everywhere → Tasks 11 + 15. The atlas regeneration is its own plan, outside this one's scope.
- **Placeholder scan:** clean — every step carries its code, its exact command, or the passage to write.
- **Type consistency:** `ALWAYS_GUARD_KINDS` (Tasks 1, 9), `publicReason` (Tasks 6, 12, 13), `SensitiveMode`/`filterSensitiveFields`/`scrubText` (Tasks 7–8, 12), `ObservedCall.report` (Tasks 4, 12, 14), `noEffectToolCalls` (Tasks 10, 13) — names match across tasks and repos.
