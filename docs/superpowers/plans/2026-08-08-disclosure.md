# Disclosure Implementation Plan

> **CLOSED.** Shipped on `main` in both repos. `contract.disclose` / `contract.discloseMissing` are
> in `packages/core/src/assembled-prompt.ts`; the renderer is
> `packages/core/src/runtime/disclosure.ts`. The atlas authoring and the 19-case measurement stay
> outside this plan.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One engine-rendered sentence per destructive tool, printed directly above that tool's own consent question, with `{readTool.path}` slots filled from the turn's own reads.

**Architecture:** `DomainContract` gains `disclose` / `discloseMissing`. The observed call row gains the tool's `result`, written by the one hook that sees the output on BOTH execution paths (`recordToolResult`). A new pure module, `disclosure.ts`, renders one sentence from (approval, contract, action history); `composeDeliveryText` prints it above each open approval's question. `looprun-eval validate` gains a fourth blocking layer that proves every slot resolves against a real seeded record.

**Tech Stack:** TypeScript (ESM, Node ≥22), vitest, pnpm workspaces. Two repositories move together: `looprun` (engine, eval, docs, governance) and `agentspec` (skill references + `lint-authoring.mjs`).

## Global Constraints

- **English only.** Every byte written to a file — code, identifiers, comments, docs, string literals, commit messages — is English. Only the chat reply follows the user's language.
- **AS-IS prose only.** A comment states what the system IS and shows a concrete example. It never narrates change ("used to", "no longer", "kept for compatibility"), never cites evidence ("measured over 70 turns"), never names a test file.
- **Break freely.** No compatibility shims, no optional-parameter escape hatches to spare a call site. Rename and update every caller in the same commit.
- **Placeholder default:** `'NA'`.
- **Slot grammar:** `{` identifier (`.` identifier)* `}`. A brace pair that does not match renders literally.
- **Binding rule:** the LATEST successful call of the named read tool, this conversation, whose RESULT deep-contains the approval's `subject`. Not latest-wins.
- **Governance gate:** any diff under `packages/core/src/` or `packages/mastra/src/` requires a `governance/proofs/*.md` with `verdict: PASS` in the same change (Task 8). `governance/MATRIX.md` is GENERATED — never hand-edited; `pnpm proofs:matrix` rewrites it.
- **Build order:** `packages/core/dist` is what `pnpm typecheck` and `node scripts/gen-guards-chapter.mjs` read. After editing `packages/core/src`, run `pnpm -C packages/core build` before typechecking dependents.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/rules.ts` | `ObservedCall` gains the optional `result` field (+ its JSDoc) |
| `packages/core/src/runtime/action-history.ts` | `recordToolResult` stores the result on the observed row |
| `packages/core/src/assembled-prompt.ts` | `DomainContract.disclose` / `.discloseMissing` — the reference JSDoc |
| `packages/core/src/runtime/disclosure.ts` | **new** — `renderDisclosure`, pure; the binding rule and its header |
| `packages/core/src/runtime/turn.ts` | `composeDeliveryText` prints the disclosure above each question |
| `packages/core/test/observed-result.test.ts` | **new** — the observed row carries the result on both paths |
| `packages/core/test/disclosure.test.ts` | **new** — the six pins of §7 |
| `packages/eval/src/validate.ts` | **new layer** — `checkDisclosureSlots`, the fourth blocking layer |
| `packages/eval/src/commands.ts`, `campaign.ts` | wire the new layer into `validate` and campaign preflight |
| `packages/eval/test/disclosure-slots.test.ts` | **new** — the layer's own tests |
| `docs/tutorial/03-agent-anatomy.md` | where the field is introduced, with the three-seam table |
| `docs/tutorial/04-guards.md` | the consent lesson's transcript carries a disclosure line |
| `docs/tutorial/05-running-and-eval.md` | validate's new blocking issue |
| `packages/core/GUARDS.md` | the delivered-reply passages: two engine blocks per approval |
| `../agentspec/skill/references/norms.md` | N2 authoring: declare `disclose`, and the two authoring laws |
| `../agentspec/skill/references/test.md` | how to read the new blocking issue |
| `../agentspec/skill/scripts/lint-authoring.mjs` | `DESTRUCTIVE-WITHOUT-DISCLOSURE`, `DISCLOSURE-SLOT-NOT-REQUIRED` |
| `governance/proofs/2026-08-08-disclosure.md` | the proof record the PR gate demands |

---

### Task 1: The observed row carries the result

**Files:**
- Modify: `packages/core/src/rules.ts` — `ObservedCall` (around line 36)
- Modify: `packages/core/src/runtime/action-history.ts:232` — the `observed.push` in `recordToolResult`
- Test: `packages/core/test/observed-result.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ObservedCall.result?: unknown` — present on every row `recordToolResult` writes with `ok: true`, absent otherwise. Task 2 and Task 3 read it.

Why this seam: `recordToolResult` is handed the tool's `output` by `afterToolCall` whether a world executed the call (`packages/mastra/src/hooks.ts:111`) or the tool ran itself (native-tools / MCP, where the stub world records nothing). It is the ONE place the result exists on both paths.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/observed-result.test.ts`:

```ts
/**
 * THE OBSERVED ROW CARRIES THE RESULT — written by the one hook that sees a tool's output whether a
 * world executed the call or the tool ran itself.
 */
import { describe, it, expect } from 'vitest';
import { createActionHistory, recordToolResult } from '../src/runtime/action-history.js';

describe('recordToolResult', () => {
  it('stores a successful call\'s result on the observed row', () => {
    const actionHistory = createActionHistory();
    recordToolResult(actionHistory, 'getAsset', { assetId: 'ast_1' }, { asset: { id: 'ast_1', name: 'Light Tower' } });
    expect(actionHistory.observed[0].result).toEqual({ asset: { id: 'ast_1', name: 'Light Tower' } });
  });

  it('stores the result with NO world — the native path records the same row', () => {
    const actionHistory = createActionHistory();
    recordToolResult(actionHistory, 'getAsset', { assetId: 'ast_1' }, { asset: { id: 'ast_1' } });
    expect(actionHistory.observed[0].result).toEqual({ asset: { id: 'ast_1' } });
    expect(actionHistory.observed[0].tookEffect).toBeUndefined();
  });

  it('omits the result on a FAILED call — a refusal grounds nothing', () => {
    const actionHistory = createActionHistory();
    recordToolResult(actionHistory, 'getAsset', { assetId: 'nope' }, { error: 'NOT_FOUND' });
    expect(actionHistory.observed[0].ok).toBe(false);
    expect('result' in actionHistory.observed[0]).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/core exec vitest run test/observed-result.test.ts`
Expected: FAIL — `result` is `undefined` on the first two cases.

- [ ] **Step 3: Add the field to `ObservedCall`**

In `packages/core/src/rules.ts`, inside `interface ObservedCall`, directly after `turnIndex: number;`:

```ts
  /** What this call RETURNED, on a call that succeeded — absent on a failure, where the result is a
   *  refusal and grounds nothing. Written by the one hook that receives a tool's output on either
   *  execution path: a world executed the call, or the tool executed itself and no world action
   *  history exists to join against. A guard reading `ctx.observed` sees this turn's results with the
   *  same reach `ctx.history` gives it for every sealed turn.
   *
   *  ```
   *    getAsset({assetId:'ast_1'}) → {asset:{id:'ast_1',name:'Light Tower'}}
   *    observed row                  { name:'getAsset', ok:true, result:{asset:{…}} }
   *  ``` */
  result?: unknown;
```

- [ ] **Step 4: Store it in `recordToolResult`**

In `packages/core/src/runtime/action-history.ts`, in the `actionHistory.observed.push({ … })` call, add the line directly after `turnIndex: actionHistory.turnIndex,`:

```ts
    ...(ok ? { result: output } : {}),
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm -C packages/core exec vitest run test/observed-result.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Run the whole core suite — nothing else may move**

Run: `pnpm -C packages/core test`
Expected: PASS, same count as before this task.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/rules.ts packages/core/src/runtime/action-history.ts packages/core/test/observed-result.test.ts
git commit -m "feat(core): the observed call row carries the tool's result"
```

---

### Task 2: `DomainContract.disclose` and the renderer

**Files:**
- Modify: `packages/core/src/assembled-prompt.ts` — `DomainContract`, after `engineText`
- Create: `packages/core/src/runtime/disclosure.ts`
- Test: `packages/core/test/disclosure.test.ts` (create)

**Interfaces:**
- Consumes: `ObservedCall.result` (Task 1).
- Produces:
  - `DomainContract.disclose?: Record<string, string>` and `DomainContract.discloseMissing?: string`
  - `renderDisclosure(approval: ApprovalRequest, contract: Pick<DomainContract, 'disclose' | 'discloseMissing'> | undefined, actionHistory: TurnActionHistory): string | null` — exported from `packages/core/src/runtime/disclosure.ts`. Task 3 calls it.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/disclosure.test.ts`:

```ts
/**
 * THE DISCLOSURE — one authored sentence per destructive tool, filled from the turn's own reads and
 * printed above that tool's consent question.
 */
import { describe, it, expect } from 'vitest';
import { renderDisclosure } from '../src/runtime/disclosure.js';
import { createActionHistory, recordToolResult } from '../src/runtime/action-history.js';
import type { ApprovalRequest } from '../src/runtime/approval-request.js';
import type { TurnActionHistory } from '../src/runtime/action-history.js';

const CONTRACT = {
  disclose: {
    retireAsset: 'Retiring {getAsset.asset.id} ({getAsset.asset.name}) takes it out of the rentable fleet for good.',
    updateMemberRole: 'Promoting {getMember.member.name} to owner gives them billing control.',
    purgeArchive: 'Emptying the archive cannot be undone.',
  },
};

const approvalFor = (tool: string, subject?: string): ApprovalRequest => ({
  tool,
  ...(subject !== undefined ? { subject } : {}),
  meaning: subject ?? tool,
  token: 'CONFIRM X',
  issuedTurn: 0,
});

/** An action history whose observed rows are written by the SAME hook the runtime uses — no world. */
function historyWith(calls: Array<{ name: string; args: Record<string, unknown>; result: unknown }>): TurnActionHistory {
  const actionHistory = createActionHistory();
  for (const c of calls) recordToolResult(actionHistory, c.name, c.args, c.result);
  return actionHistory;
}

describe('renderDisclosure', () => {
  it('fills a slot from the read whose result names the subject', () => {
    const actionHistory = historyWith([
      { name: 'getAsset', args: { assetId: 'ast_ltwr01' }, result: { asset: { id: 'ast_ltwr01', name: 'Allmand Light Tower' } } },
    ]);
    expect(renderDisclosure(approvalFor('retireAsset', 'ast_ltwr01'), CONTRACT, actionHistory)).toBe(
      'Retiring ast_ltwr01 (Allmand Light Tower) takes it out of the rentable fleet for good.',
    );
  });

  it('binds to the SUBJECT, not to the latest call of the same read', () => {
    const actionHistory = historyWith([
      { name: 'getMember', args: { memberId: 'mem_1004' }, result: { member: { id: 'mem_1004', name: 'Sam Whitfield' } } },
      { name: 'getMember', args: {}, result: { member: { id: 'mem_1001', name: 'Dana Okafor' } } },
    ]);
    expect(renderDisclosure(approvalFor('updateMemberRole', 'mem_1004'), CONTRACT, actionHistory)).toBe(
      'Promoting Sam Whitfield to owner gives them billing control.',
    );
  });

  it('renders the placeholder when the bound result carries no value at the path', () => {
    const actionHistory = historyWith([
      { name: 'getAsset', args: { assetId: 'ast_ltwr01' }, result: { asset: { id: 'ast_ltwr01', name: null } } },
    ]);
    expect(renderDisclosure(approvalFor('retireAsset', 'ast_ltwr01'), CONTRACT, actionHistory)).toBe(
      'Retiring ast_ltwr01 (NA) takes it out of the rentable fleet for good.',
    );
  });

  it('renders every slot as the placeholder when the approval names no record', () => {
    const actionHistory = historyWith([
      { name: 'getAsset', args: { assetId: 'ast_ltwr01' }, result: { asset: { id: 'ast_ltwr01', name: 'Allmand Light Tower' } } },
    ]);
    expect(renderDisclosure(approvalFor('retireAsset'), CONTRACT, actionHistory)).toBe(
      'Retiring NA (NA) takes it out of the rentable fleet for good.',
    );
  });

  it('honours a domain-declared placeholder', () => {
    const actionHistory = createActionHistory();
    expect(renderDisclosure(approvalFor('retireAsset', 'ast_x'), { ...CONTRACT, discloseMissing: '—' }, actionHistory)).toBe(
      'Retiring — (—) takes it out of the rentable fleet for good.',
    );
  });

  it('renders a malformed brace literally', () => {
    const contract = { disclose: { retireAsset: 'Retiring { getAsset.asset.id } is final; {} is not a slot.' } };
    expect(renderDisclosure(approvalFor('retireAsset', 'ast_x'), contract, createActionHistory())).toBe(
      'Retiring { getAsset.asset.id } is final; {} is not a slot.',
    );
  });

  it('renders a slotless sentence unchanged', () => {
    expect(renderDisclosure(approvalFor('purgeArchive'), CONTRACT, createActionHistory())).toBe(
      'Emptying the archive cannot be undone.',
    );
  });

  it('returns null when the tool has no entry', () => {
    expect(renderDisclosure(approvalFor('cancelBooking', 'BK-1'), CONTRACT, createActionHistory())).toBeNull();
    expect(renderDisclosure(approvalFor('retireAsset', 'ast_x'), undefined, createActionHistory())).toBeNull();
  });

  it('ignores a FAILED read — a refusal grounds no slot', () => {
    const actionHistory = historyWith([
      { name: 'getAsset', args: { assetId: 'ast_x' }, result: { error: 'FROZEN', asset: { id: 'ast_x', name: 'Ghost' } } },
    ]);
    expect(renderDisclosure(approvalFor('retireAsset', 'ast_x'), CONTRACT, actionHistory)).toBe(
      'Retiring NA (NA) takes it out of the rentable fleet for good.',
    );
  });

  it('renders the placeholder when the path lands on a record rather than a value', () => {
    const contract = { disclose: { retireAsset: 'Retiring {getAsset.asset} is final.' } };
    const actionHistory = historyWith([
      { name: 'getAsset', args: { assetId: 'ast_x' }, result: { asset: { id: 'ast_x' } } },
    ]);
    expect(renderDisclosure(approvalFor('retireAsset', 'ast_x'), contract, actionHistory)).toBe(
      'Retiring NA is final.',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/core exec vitest run test/disclosure.test.ts`
Expected: FAIL — `Cannot find module '../src/runtime/disclosure.js'`

- [ ] **Step 3: Add the two contract fields**

In `packages/core/src/assembled-prompt.ts`, inside `interface DomainContract`, directly after the `engineText?: Partial<EngineText>;` entry:

```ts
  /** What agreeing to a destructive act WOULD DO, one sentence per tool, printed by the engine
   *  directly above that tool's own consent question. The agent writes no part of it.
   *
   *  A `{readTool.path}` slot is filled from the LATEST successful call of `readTool` in this
   *  conversation whose RESULT names the approval's subject — never simply the latest call, because
   *  a second read of the same tool commonly answers about a different record:
   *
   *  ```
   *    disclose: { retireAsset: 'Retiring {getAsset.asset.id} ({getAsset.asset.name}) takes it out '
   *                           + 'of the rentable fleet for good.' }
   *
   *    getAsset({assetId:'ast_ltwr01'}) → {asset:{id:'ast_ltwr01',name:'Allmand Light Tower'}}
   *    → Retiring ast_ltwr01 (Allmand Light Tower) takes it out of the rentable fleet for good.
   *      To confirm ast_ltwr01, reply: CONFIRM AST_LTWR01
   *  ```
   *
   *  A slot that resolves to nothing renders {@link discloseMissing}; the sentence is never dropped
   *  and never renders an empty gap, so it must read correctly with the marker standing in any slot
   *  (`settlement: NA`, not `settles at NA`). Slot grammar is `{` identifier (`.` identifier)* `}`;
   *  any other brace pair renders literally. */
  disclose?: Record<string, string>;
  /** What an unresolved {@link disclose} slot renders. Default `'NA'`. */
  discloseMissing?: string;
```

- [ ] **Step 4: Write the renderer**

Create `packages/core/src/runtime/disclosure.ts`:

```ts
/**
 * THE DISCLOSURE — what agreeing to a destructive act would do, in the domain's own sentence, filled
 * from the records THIS conversation read.
 *
 * The model is not in the path. It does not compose the sentence, it cannot soften it, and it cannot
 * omit it: the engine prints it above the consent question the same attempt raised.
 *
 * WHY A SLOT BINDS TO THE SUBJECT AND NOT TO THE LATEST CALL. One read tool commonly answers about
 * two different records in one turn — the record being acted on, and the person acting:
 *
 * ```
 *   the act is updateMemberRole(mem_1004 → owner)
 *
 *   getMember({memberId:'mem_1004'})  → Sam Whitfield, billing     the person being promoted
 *   getMember({})                     → Dana Okafor, owner         the acting user
 *
 *   latest call wins   "Promoting Dana Okafor to owner…"   the engine names the wrong person
 *                                                          in a privilege-escalation question
 *   subject-bound      "Promoting Sam Whitfield to owner…" what the user is being asked
 * ```
 *
 * So a slot reads the latest successful call of its read tool whose RESULT carries the approval's
 * subject as a whole string value. No such call — including an approval that names no record at all —
 * and the slot renders the placeholder.
 */
import type { DomainContract } from '../assembled-prompt.js';
import type { ObservedCall } from '../rules.js';
import type { ApprovalRequest } from './approval-request.js';
import type { TurnActionHistory } from './action-history.js';

/** `{` identifier (`.` identifier)* `}`. A brace pair of any other shape is not a slot: the engine
 *  renders it verbatim rather than guessing what an author meant. */
const SLOT = /\{([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\}/g;

/** The default marker for a slot that resolves to nothing. */
const MISSING = 'NA';

/** Does this result carry `needle` as a whole string value, at any depth? */
function namesSubject(v: unknown, needle: string): boolean {
  if (typeof v === 'string') return v === needle;
  if (Array.isArray(v)) return v.some((x) => namesSubject(x, needle));
  if (v !== null && typeof v === 'object') return Object.values(v as Record<string, unknown>).some((x) => namesSubject(x, needle));
  return false;
}

/** Walk a dot path over a result. A step off a non-object yields nothing. */
function walk(result: unknown, steps: readonly string[]): unknown {
  let current = result;
  for (const step of steps) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[step];
  }
  return current;
}

/**
 * The value one slot renders, or `undefined` when nothing grounds it.
 *
 * A record is not a value: a path that lands on an object or an array renders the placeholder, because
 * a sentence carrying `[object Object]` states nothing the reader can act on.
 */
function slotValue(observed: readonly ObservedCall[], readTool: string, steps: readonly string[], subject: string | undefined): unknown {
  if (subject === undefined) return undefined;
  let bound: unknown;
  let found = false;
  for (const call of observed) {
    if (call.name !== readTool || !call.ok || !('result' in call)) continue;
    if (!namesSubject(call.result, subject)) continue;
    bound = call.result;
    found = true;
  }
  if (!found) return undefined;
  const value = walk(bound, steps);
  if (value === null || value === undefined) return undefined;
  return typeof value === 'object' ? undefined : value;
}

/**
 * The sentence printed above ONE approval's consent question, or `null` when the domain declares none
 * for that tool.
 *
 * PURE: no clock, no entropy, no I/O. Its whole input is the approval, the contract and the
 * conversation's observed calls — whose results are written by the same hook whether a world executed
 * the call or the tool executed itself, so both execution paths serve a slot identically.
 */
export function renderDisclosure(
  approval: ApprovalRequest,
  contract: Pick<DomainContract, 'disclose' | 'discloseMissing'> | undefined,
  actionHistory: TurnActionHistory,
): string | null {
  const template = contract?.disclose?.[approval.tool];
  if (!template) return null;
  const missing = contract?.discloseMissing ?? MISSING;
  return template.replace(SLOT, (_literal, path: string) => {
    const [readTool, ...steps] = path.split('.');
    const value = slotValue(actionHistory.observed, readTool, steps, approval.subject);
    return value === undefined ? missing : String(value);
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm -C packages/core exec vitest run test/disclosure.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 6: Typecheck**

Run: `pnpm -C packages/core typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/assembled-prompt.ts packages/core/src/runtime/disclosure.ts packages/core/test/disclosure.test.ts
git commit -m "feat(core): the domain declares what a destructive act would do"
```

---

### Task 3: The print site

**Files:**
- Modify: `packages/core/src/runtime/turn.ts` — the module header, `composeDeliveryText` (lines 336–376), `composeDelivery` (line 403)
- Modify: `packages/core/test/approval-render.test.ts`, `packages/core/test/sensitive-filter-seams.test.ts`, `packages/core/test/redteam/lie-check.test.ts`, `packages/core/test/proofs/sensitive-filter-routes.test.ts` — the new argument
- Test: `packages/core/test/disclosure.test.ts` (extend)

**Interfaces:**
- Consumes: `renderDisclosure(approval, contract, actionHistory)` (Task 2).
- Produces: `composeDeliveryText(message: string, did: Intention[], approvals: readonly ApprovalRequest[], actionHistory: TurnActionHistory, contract?: Pick<DomainContract, 'renderClaim' | 'outcomes' | 'engineText' | 'scrubTextFields' | 'disclose' | 'discloseMissing'>): string` — the action history is now the FOURTH positional argument, ahead of `contract`. Every caller already holds one.

The order per approval is `disclosure`, then `question`, joined by a newline; approvals are separated from each other by a blank line, so two disclosed acts never read as one paragraph.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/disclosure.test.ts`:

```ts
import { composeDeliveryText } from '../src/runtime/turn.js';

describe('the delivered text', () => {
  const approval: ApprovalRequest = {
    tool: 'retireAsset',
    subject: 'ast_ltwr01',
    meaning: 'ast_ltwr01',
    token: 'CONFIRM AST_LTWR01',
    issuedTurn: 0,
  };

  it('prints the disclosure directly above the question it belongs to', () => {
    const actionHistory = historyWith([
      { name: 'getAsset', args: { assetId: 'ast_ltwr01' }, result: { asset: { id: 'ast_ltwr01', name: 'Allmand Light Tower' } } },
    ]);
    expect(composeDeliveryText('I have reviewed the record for ast_ltwr01.', [{ op: 'inform' }], [approval], actionHistory, CONTRACT)).toBe(
      'I have reviewed the record for ast_ltwr01.\n\n' +
        'Retiring ast_ltwr01 (Allmand Light Tower) takes it out of the rentable fleet for good.\n' +
        'To confirm ast_ltwr01, reply: CONFIRM AST_LTWR01\n\n' +
        'No operation was carried out on this turn.',
    );
  });

  it('keeps a question whose tool the domain discloses nothing about', () => {
    const other: ApprovalRequest = { tool: 'cancelBooking', subject: 'BK-1', meaning: 'BK-1', token: 'CONFIRM BK-1', issuedTurn: 0 };
    const text = composeDeliveryText('Two acts are pending.', [{ op: 'inform' }], [other], createActionHistory(), CONTRACT);
    expect(text).toContain('To confirm BK-1, reply: CONFIRM BK-1');
    expect(text).not.toContain('NA');
  });

  it('separates two disclosed acts with a blank line', () => {
    const second: ApprovalRequest = { tool: 'purgeArchive', meaning: 'the archive', token: 'CONFIRM THE-ARCHIVE', issuedTurn: 0 };
    const actionHistory = historyWith([
      { name: 'getAsset', args: { assetId: 'ast_ltwr01' }, result: { asset: { id: 'ast_ltwr01', name: 'Allmand Light Tower' } } },
    ]);
    const text = composeDeliveryText('Pending.', [{ op: 'inform' }], [approval, second], actionHistory, CONTRACT);
    expect(text).toContain(
      'To confirm ast_ltwr01, reply: CONFIRM AST_LTWR01\n\nEmptying the archive cannot be undone.\nTo confirm the archive, reply: CONFIRM THE-ARCHIVE',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/core exec vitest run test/disclosure.test.ts`
Expected: FAIL — `composeDeliveryText` takes the contract in the fourth position, so the disclosure never renders.

- [ ] **Step 3: Widen the signature and render the disclosure**

In `packages/core/src/runtime/turn.ts`, add the import beside the other runtime imports:

```ts
import { renderDisclosure } from './disclosure.js';
```

Replace the `composeDeliveryText` signature and body (lines 366–376) with:

```ts
export function composeDeliveryText(
  message: string,
  did: Intention[],
  approvals: readonly ApprovalRequest[],
  actionHistory: TurnActionHistory,
  contract?: Pick<DomainContract, 'renderClaim' | 'outcomes' | 'engineText' | 'scrubTextFields' | 'disclose' | 'discloseMissing'>,
): string {
  const text = resolveEngineText(contract?.engineText);
  const report = renderOperationReport(did, { renderClaim: contract?.renderClaim, outcomes: contract?.outcomes, text });
  const asked = approvals
    .map((c) => [renderDisclosure(c, contract, actionHistory), text.approval(c.meaning, c.token)].filter(Boolean).join('\n'))
    .join('\n\n');
  return [authoredProse(message.trim(), contract), asked, report].filter((s) => s.trim()).join('\n\n');
}
```

Update `composeDelivery` (line 403) to pass it through:

```ts
function composeDelivery(payload: RespondPayload, actionHistory: TurnActionHistory, contract?: DomainContract): string {
  return composeDeliveryText(payload.message, payload.did, openApprovals(actionHistory), actionHistory, contract);
}
```

- [ ] **Step 4: Update the doc block above `composeDeliveryText`**

Replace the block comment at lines 336–365 with one that states the two engine blocks per approval. Keep the existing scrub paragraph and its example verbatim; change the opening and the transcript to:

```
/**
 * The DELIVERED text: the agent's `message`, then the CONSENT QUESTIONS this turn raised — each under
 * the domain's own sentence about what agreeing would do — then the engine-rendered OPERATION RECORD
 * of the (already action history-grounded) `did`.
 *
 * ```
 *   Your booking BK-1 carries an 80.00 fee.      ← the agent's prose
 *
 *   Cancelling BK-1 releases the room and        ← the engine's disclosure
 *   forfeits the 80.00 deposit.
 *   To confirm BK-1, reply: CONFIRM BK-1         ← the engine's question
 *
 *   No operation was carried out on this turn.   ← the engine's account
 * ```
 *
 * The engine blocks are the parts the agent does not write: what agreeing does, the question it must
 * not be able to reframe, and the account of what changed it must not be able to soften. This is the
 * ONE place any of them enters the delivered text.
 *
 * … (the remaining paragraphs and the scrub example are unchanged, with the example call updated to
 *    `composeDeliveryText('I will write to ops@x.example.', [{ op: 'inform' }], [], actionHistory, contract)`)
 */
```

- [ ] **Step 5: Update the four test files that call it directly**

In each of `packages/core/test/approval-render.test.ts`, `packages/core/test/sensitive-filter-seams.test.ts`, `packages/core/test/redteam/lie-check.test.ts`, `packages/core/test/proofs/sensitive-filter-routes.test.ts`:

Add the import and a shared empty action history near the top of the file:

```ts
import { createActionHistory } from '../src/runtime/action-history.js';   // '../../src/…' in the nested dirs

/** No reads happened — a delivery composed over an empty conversation. */
const NO_READS = createActionHistory();
```

Then insert `NO_READS` as the fourth argument in every `composeDeliveryText(…)` call. Two shapes appear:

```ts
composeDeliveryText('All set.', [{ op: 'inform' }], [])
  → composeDeliveryText('All set.', [{ op: 'inform' }], [], NO_READS)

composeDeliveryText('I will write to ops@x.example.', [{ op: 'inform' }], [], SCRUBBING)
  → composeDeliveryText('I will write to ops@x.example.', [{ op: 'inform' }], [], NO_READS, SCRUBBING)
```

Find every site with: `grep -rn "composeDeliveryText(" packages/core/test/`

- [ ] **Step 6: Run the whole core suite**

Run: `pnpm -C packages/core test`
Expected: PASS — every previously green test, plus the three new delivery tests.

- [ ] **Step 7: Build core, then typecheck the workspace**

Run: `pnpm -C packages/core build && pnpm typecheck`
Expected: no errors. (`packages/mastra` and `packages/eval` read `packages/core/dist`.)

- [ ] **Step 8: Run the whole workspace suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/runtime/turn.ts packages/core/test/
git commit -m "feat(core): the consent question is delivered under the act's disclosure"
```

---

### Task 4: `validate` proves every slot resolves

**Files:**
- Modify: `packages/eval/src/validate.ts` — new section + `ValidateReport.disclosure` + `validateSubjectConfig`
- Modify: `packages/eval/src/commands.ts:172,175` — the layer list and the blocking count
- Modify: `packages/eval/src/campaign.ts:203` — the preflight blocking list
- Test: `packages/eval/test/disclosure-slots.test.ts` (create)

**Interfaces:**
- Consumes: `DomainContract.disclose` (Task 2).
- Produces: `checkDisclosureSlots(subject: Subject): string[]` — exported from `packages/eval/src/validate.ts`; and `ValidateReport.disclosure: string[]`, a BLOCKING layer.

The reception trap this layer must not fall into: a read invoked without its schema-required args refuses at RECEPTION in every preset — `getAsset({})` errors everywhere — which must never read as "the slot never resolves". So the layer invokes each read once per identity value the preset's projection carries, filling every schema-required string argument with that value.

- [ ] **Step 1: Write the failing test**

Create `packages/eval/test/disclosure-slots.test.ts`:

```ts
/**
 * THE DISCLOSURE-SLOT LAYER — a slot naming a field no result ever carries is an authoring error,
 * caught offline; a field that exists but is empty on one record is a data condition, and passes.
 */
import { describe, it, expect } from 'vitest';
import { checkDisclosureSlots } from '../src/validate.js';
import type { Subject } from '../src/subject.js';
import type { AgentWorld } from '@looprun-ai/core';

const ASSETS: Record<string, { id: string; name: string; settlement: number | null }> = {
  ast_1: { id: 'ast_1', name: 'Light Tower', settlement: 200 },
  ast_2: { id: 'ast_2', name: 'Generator', settlement: null },
};

function makeWorld(): AgentWorld {
  return {
    exec(name: string, args: Record<string, unknown>) {
      if (name !== 'getAsset') return { error: 'UNKNOWN_TOOL' };
      const asset = ASSETS[String(args.assetId ?? '')];
      return asset ? { asset } : { error: 'NOT_FOUND' };
    },
    advanceTurn() {},
    ingestAttachment: (u: string) => u,
    toolCalls: [],
    sseActions: [],
    projection: () => ({ assets: Object.values(ASSETS).map((a) => ({ id: a.id, name: a.name })) }),
  } as unknown as AgentWorld;
}

const subjectWith = (disclose: Record<string, string>): Subject => ({
  dir: '/toy',
  specs: { fleet: { id: 'fleet', surface: { tools: ['getAsset', 'retireAsset'] } } as never },
  contract: { voice: '', stateBlock: () => '', coreInvariants: [], languageClause: '', disclose },
  caseAgent: {},
  cases: [{ id: 'c1', turns: [{ userText: 'hi' }] }],
  toolDefs: [
    { name: 'getAsset', description: '', inputSchema: { type: 'object', properties: { assetId: { type: 'string' } }, required: ['assetId'] } },
    { name: 'retireAsset', description: '', inputSchema: { type: 'object', properties: { assetId: { type: 'string' } }, required: ['assetId'] } },
  ],
  makeWorld,
});

describe('checkDisclosureSlots', () => {
  it('passes a slot that resolves on a seeded record', () => {
    expect(checkDisclosureSlots(subjectWith({ retireAsset: 'Retiring {getAsset.asset.id} ({getAsset.asset.name}) is final.' }))).toEqual([]);
  });

  it('passes a field that exists but is empty on one record', () => {
    expect(checkDisclosureSlots(subjectWith({ retireAsset: 'Settlement: {getAsset.asset.settlement}' }))).toEqual([]);
  });

  it('fails a path no result ever carries, and names the fields the results do carry', () => {
    const issues = checkDisclosureSlots(subjectWith({ retireAsset: 'Retiring {getAsset.asset.serial} is final.' }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('retireAsset');
    expect(issues[0]).toContain('{getAsset.asset.serial}');
    expect(issues[0]).toContain('asset.name');
  });

  it('fails a slot whose read tool is on no lane carrying the disclosed tool', () => {
    const issues = checkDisclosureSlots(subjectWith({ retireAsset: 'Retiring {getInvoice.invoice.id} is final.' }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('getInvoice');
  });

  it('is silent when the contract declares no disclosure', () => {
    expect(checkDisclosureSlots(subjectWith({}))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C packages/eval exec vitest run test/disclosure-slots.test.ts`
Expected: FAIL — `checkDisclosureSlots` is not exported.

- [ ] **Step 3: Write the layer**

In `packages/eval/src/validate.ts`, add a new section directly before `// ── Orchestration ──`:

```ts
// ── Stage 5: DISCLOSURE SLOTS ────────────────────────────────────────────────────────────────────

/** `{` identifier (`.` identifier)* `}` — the same grammar the engine renders. */
const DISCLOSE_SLOT = /\{([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*)\}/g;

/** How many distinct identity values one preset contributes before the sweep stops widening. */
const IDENTITY_CAP = 200;

/** Structural success on a replayed read — the same shape the engine's own check keys on. */
function structurallyOk(r: unknown): boolean {
  if (r && typeof r === 'object') {
    const o = r as Record<string, unknown>;
    if (o.ok === false || o.success === false || o.PREREQ_NOT_MET === true || typeof o.error === 'string') return false;
  }
  return r !== undefined;
}

/** Every distinct string leaf a preset's projection carries — the identity values a read can be
 *  invoked with. A world with no `projection()` contributes none. */
function projectionStrings(world: AgentWorld): string[] {
  const project = (world as { projection?: unknown }).projection;
  if (typeof project !== 'function') return [];
  const seen = new Set<string>();
  const visit = (v: unknown): void => {
    if (seen.size >= IDENTITY_CAP) return;
    if (typeof v === 'string') {
      if (v.trim()) seen.add(v);
      return;
    }
    if (Array.isArray(v)) return void v.forEach(visit);
    if (v !== null && typeof v === 'object') return void Object.values(v as Record<string, unknown>).forEach(visit);
  };
  visit((project as () => unknown).call(world));
  return [...seen];
}

/** The declared arg shape of one tool: which args are required, and each one's declared type. */
function argShape(subject: Subject, tool: string): { required: string[]; types: Record<string, string> } | undefined {
  const def = subject.toolDefs?.find((d) => d.name === tool);
  if (!def) return undefined;
  const schema = def.inputSchema as { required?: unknown; properties?: Record<string, { type?: unknown }> } | undefined;
  const required = Array.isArray(schema?.required) ? schema.required.filter((x): x is string => typeof x === 'string') : [];
  const types: Record<string, string> = {};
  for (const [k, v] of Object.entries(schema?.properties ?? {})) types[k] = typeof v?.type === 'string' ? v.type : 'string';
  return { required, types };
}

/** Every dot path a result carries down to its value leaves — what the failure line offers instead. */
function leafPaths(v: unknown, prefix = '', out: string[] = []): string[] {
  if (out.length >= 40) return out;
  if (v === null || typeof v !== 'object') {
    if (prefix) out.push(prefix);
    return out;
  }
  if (Array.isArray(v)) {
    if (v.length) leafPaths(v[0], prefix ? `${prefix}[0]` : '[0]', out);
    return out;
  }
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) leafPaths(val, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

/** Walk a dot path over a result; a step off a non-object yields nothing. */
function walkPath(result: unknown, steps: readonly string[]): unknown {
  let current = result;
  for (const step of steps) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[step];
  }
  return current;
}

/**
 * Every `disclose` slot resolves against a real seeded record, in at least one declared preset.
 *
 * The RECEPTION trap this avoids: a read invoked without its schema-required args refuses in every
 * preset — `getAsset({})` errors everywhere — and that refusal says nothing about the slot. So each
 * read is invoked once per identity value the preset's projection carries, with every schema-required
 * string argument set to that value; a path is proven by any result that comes back structurally ok.
 *
 * A field that EXISTS but is empty on a given record (`settlement: null` on a claim under review) is a
 * data condition the engine renders as the placeholder — it is not a defect, so a path that RESOLVES
 * anywhere passes. A path no result ever carries is an authoring error, and it fails here rather than
 * mid-run.
 */
export function checkDisclosureSlots(subject: Subject): string[] {
  const disclose = subject.contract?.disclose;
  if (!disclose || !Object.keys(disclose).length) return [];

  const issues: string[] = [];
  const presets = [...new Set((subject.cases ?? []).map((c) => c.setup?.preset ?? 'default')), 'default'];
  const uniquePresets = [...new Set(presets)];

  for (const [tool, template] of Object.entries(disclose)) {
    // The lanes that carry the disclosed tool — the only surfaces a slot's read could have run on.
    const lanes = Object.values(subject.specs ?? {}).filter((s) => s.surface.tools.includes(tool));
    const reachable = new Set(lanes.flatMap((s) => s.surface.tools));

    for (const match of template.matchAll(DISCLOSE_SLOT)) {
      const [readTool, ...steps] = match[1].split('.');
      if (lanes.length && !reachable.has(readTool)) {
        issues.push(
          `disclosure: "${tool}" slot ${match[0]} names read tool "${readTool}", which is on no lane carrying "${tool}" — the read can never have happened, so the slot always renders the placeholder`,
        );
        continue;
      }
      const shape = argShape(subject, readTool);
      if (!shape) {
        issues.push(`disclosure: "${tool}" slot ${match[0]} names read tool "${readTool}", which has no toolDef`);
        continue;
      }

      let resolved = false;
      const carried = new Set<string>();
      for (const preset of uniquePresets) {
        if (resolved) break;
        let world: AgentWorld;
        try {
          world = subject.makeWorld(preset);
        } catch {
          continue; // a preset that throws is the references layer's finding, not this one's
        }
        for (const identity of projectionStrings(world)) {
          const args: Record<string, unknown> = {};
          for (const key of shape.required) {
            const type = shape.types[key] ?? 'string';
            args[key] = type === 'number' ? 1 : type === 'boolean' ? false : identity;
          }
          let result: unknown;
          try {
            result = world.exec(readTool, args);
          } catch {
            continue;
          }
          if (!structurallyOk(result)) continue;
          for (const p of leafPaths(result)) carried.add(p);
          if (steps.length && walkPath(result, steps) !== undefined) {
            resolved = true;
            break;
          }
        }
      }

      if (!steps.length) {
        issues.push(`disclosure: "${tool}" slot ${match[0]} walks no path — a slot renders a value, and "${readTool}"'s whole result is a record`);
      } else if (!resolved) {
        const offer = [...carried].sort().slice(0, 8).join(', ') || '(no result came back ok in any preset)';
        issues.push(
          `disclosure: "${tool}" slot ${match[0]} resolves in no preset — "${readTool}" results carry: ${offer}`,
        );
      }
    }
  }
  return issues;
}
```

Then add the field to `ValidateReport` (after `world`):

```ts
  /** Disclosure-slot layer — every `contract.disclose` slot resolves against a seeded record. */
  disclosure: string[];
```

…and to `validateSubjectConfig`'s returned object:

```ts
    disclosure: checkDisclosureSlots(subject),
```

- [ ] **Step 4: Wire it into the CLI and the campaign preflight**

In `packages/eval/src/commands.ts`, extend the layer list and the blocking count:

```ts
  for (const layer of ['schema', 'references', 'premise', 'world', 'disclosure'] as const) {
    for (const line of report[layer]) log(line);
  }
  for (const line of report.advisory) log(`ADVISORY ${line}`);
  const blocking = report.schema.length + report.references.length + report.premise.length + report.world.length + report.disclosure.length;
```

Update the function's doc block opening to name the layer:

```
 * `looprun-eval validate` — schema + references + premise coherence + world model + disclosure slots
 * over a subject, offline (no model, no spend). Returns the full report; a non-empty layer means the
 * subject is not fit to run. Advisory lines (reverse-coverage) are reported but never blocking.
```

In `packages/eval/src/campaign.ts:203`:

```ts
  const blocking = [...report.schema, ...report.references, ...report.premise, ...report.disclosure];
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm -C packages/eval exec vitest run test/disclosure-slots.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Run the eval suite and typecheck**

Run: `pnpm -C packages/eval test && pnpm -C packages/eval typecheck`
Expected: PASS. `packages/eval/test/validate.test.ts` asserts on a full report — if it compares object shapes, add `disclosure: []`.

- [ ] **Step 7: Commit**

```bash
git add packages/eval/src/validate.ts packages/eval/src/commands.ts packages/eval/src/campaign.ts packages/eval/test/disclosure-slots.test.ts packages/eval/test/validate.test.ts
git commit -m "feat(eval): validate proves every disclosure slot resolves"
```

---

### Task 5: Documentation

**Files:**
- Modify: `README.md` (only if it shows a contract)
- Modify: `docs/tutorial/03-agent-anatomy.md:336` — the contract table
- Modify: `docs/tutorial/04-guards.md:398` — the consent transcript
- Modify: `docs/tutorial/05-running-and-eval.md` — validate's layers
- Modify: `packages/core/GUARDS.md:574` — the delivered-reply passages

**Interfaces:**
- Consumes: everything Tasks 1–4 produced. Produces: no code.

No doc narrates the change; each states what the system IS.

- [ ] **Step 1: The contract table in `docs/tutorial/03-agent-anatomy.md`**

Add two rows directly after the `engineText?` row (line 337):

```markdown
| `disclose?` | optional: one sentence per destructive tool, printed by the engine directly above that tool's own consent question — what agreeing to the act would do. `{readTool.path}` slots are filled from the latest successful call of that read whose result names the approval's subject |
| `discloseMissing?` | optional: what an unresolved slot renders. Default `NA`. The sentence is never dropped, so it must read correctly with the marker standing in any slot |
```

Immediately below the table, add the three-seam block:

```markdown
Three seams put domain words on the user's screen, and they are told apart by WHEN:

```
disclose      before the act    what agreeing to this would do
renderClaim   after the act     what one verified claim did
engineText    around both       the engine's own sentences, and their language
```

A slot binds to the read whose RESULT names the record the question is about, not to the latest call
of that read — one read tool commonly answers about two records in a turn:

```
the act is updateMemberRole(mem_1004 → owner)

  getMember({memberId:'mem_1004'})  → Sam Whitfield      the person being promoted
  getMember({})                     → Dana Okafor        the acting user

  subject-bound   "Promoting Sam Whitfield to owner…"    what the user is being asked
```
```

- [ ] **Step 2: The consent transcript in `docs/tutorial/04-guards.md`**

At line 398, the transcript currently shows the question alone. Put the domain's sentence above it and name it in the surrounding prose:

```
                  Cancelling BK-1 releases the room and forfeits the 80.00 deposit.
                  To confirm BK-1, reply: CONFIRM BK-1
```

Add one sentence beside the transcript: *the first line is `contract.disclose.cancelBooking`, filled from the booking this turn read; the second is the engine's question. Neither is the agent's.*

Apply the same to the second transcript at line 745 only if that lesson's contract declares a disclosure; if it does not, leave it — a tool with no entry renders the question alone.

- [ ] **Step 3: `validate`'s new layer in `docs/tutorial/05-running-and-eval.md`**

Wherever the chapter enumerates validate's layers, add the disclosure layer with its failure line:

```
disclosure   every `contract.disclose` slot resolves against a seeded record, in at least one preset

  disclosure: "retireAsset" slot {getAsset.asset.serial} resolves in no preset —
  "getAsset" results carry: asset.id, asset.name, asset.status
```

State the distinction the layer draws: a path no result ever carries is an authoring error; a field
that exists and is empty on one record is a data condition the engine renders as `NA`, and passes.

- [ ] **Step 4: The delivered-reply passages in `packages/core/GUARDS.md`**

At the passages enumerating what a delivery carries (around lines 574 and 686), state that an approval
contributes TWO engine blocks — the disclosure and the question — and show it:

```
         engine:  Cancelling BK-1 releases the room and forfeits the 80.00 deposit.
                  To confirm BK-1, reply: CONFIRM BK-1
```

- [ ] **Step 5: `README.md`**

Run `grep -n "DomainContract\|coreInvariants" README.md`. If the README shows a contract literal, add a
`disclose` entry to it; if it does not, leave the file untouched and note that in the commit body.

- [ ] **Step 6: Verify the docs gate**

Run: `pnpm -C packages/core build && node scripts/gen-guards-chapter.mjs --check`
Expected: PASS (the generated chapter §5 is unaffected; this confirms nothing drifted).

- [ ] **Step 7: Commit**

```bash
git add README.md docs/tutorial packages/core/GUARDS.md
git commit -m "docs: the engine states what agreeing to a destructive act would do"
```

---

### Task 6: The skill — authoring laws and two lints

**Files:**
- Modify: `../agentspec/skill/references/norms.md`
- Modify: `../agentspec/skill/references/test.md`
- Modify: `../agentspec/skill/scripts/lint-authoring.mjs`
- Test: `../agentspec/skill/scripts/test/` (follow the directory's existing harness)

**Interfaces:**
- Consumes: the contract fields (Task 2) and validate's layer (Task 4).
- Produces: lint rule ids `DESTRUCTIVE-WITHOUT-DISCLOSURE` and `DISCLOSURE-SLOT-NOT-REQUIRED` (UPPER-KEBAB, the convention every rule in the file follows).

The skill moves in the SAME session as the engine: a skill that still teaches the old contract
generates subjects the new engine cannot serve.

- [ ] **Step 1: N2 authoring in `skill/references/norms.md`**

In the section that walks the contract's fields, add `disclose` with its decision test and the two
authoring laws:

```markdown
### `disclose` — what agreeing to the act would do

One sentence per destructive tool, printed by the engine above that tool's own consent question. The
decision test: **does the user need to know this BEFORE agreeing?**

```ts
  disclose: {
    retireAsset: 'Retiring {getAsset.asset.id} ({getAsset.asset.name}) takes it out of the '
               + 'rentable fleet for good.',
  },
```

**Law — the sentence must read correctly with the placeholder standing in every slot.** An unresolved
slot renders `NA` and the sentence is never dropped, so write it so the marker can stand in it:

| Reads badly | Reads correctly |
|---|---|
| `settles at {getClaim.claim.settlementAmount}` | `settlement: {getClaim.claim.settlementAmount}` |

**Law — a slot names a read the tool's own `requiresBefore` already demands.** If no `requiresBefore`
on the disclosed tool demands that read, the read is optional: every turn the agent skips it, the slot
renders `NA`, and the author cannot see that from the sentence.
```

- [ ] **Step 2: `validate`'s new blocking issue in `skill/references/test.md`**

Add the layer beside the others, with the failure line and how to read it:

```markdown
`disclosure` — every `contract.disclose` slot resolves against a seeded record, in at least one preset.

```
disclosure: "retireAsset" slot {getAsset.asset.serial} resolves in no preset —
"getAsset" results carry: asset.id, asset.name, asset.status
```

The line offers the fields the results DO carry: the fix is almost always the field name. A field that
exists and is empty on one record does not fail here — the engine renders `NA` for it, which is a data
condition, not an authoring error.
```

- [ ] **Step 3: Write the two lint rules**

In `../agentspec/skill/scripts/lint-authoring.mjs`, inside `lintFile`, after the
`DESTRUCTIVE-WITHOUT-HANDLER` block:

```js
  // DESTRUCTIVE-WITHOUT-DISCLOSURE — a tool on `destructiveTools` with no `disclose` entry asks the
  // user to agree to something nobody described. The question names the record and nothing else, so
  // what the act WOULD DO is left to the model's own prose.
  const disclosed = new Set(
    [...src.matchAll(/disclose\s*:\s*\{([\s\S]*?)\n\s*\}/g)]
      .flatMap((m) => [...m[1].matchAll(/(?:^|\n)\s*([A-Za-z_$][\w$]*)\s*:/g)].map((x) => x[1])),
  );
  if (destructive && !exempted(lines[destructive.line - 1])) {
    for (const tool of destructive.items) {
      if (!disclosed.has(tool)) {
        F(file, destructive.line, 'DESTRUCTIVE-WITHOUT-DISCLOSURE',
          `destructive tool \`${tool}\` has no \`disclose\` entry — the consent question names the record and nothing else, so the user is asked to agree to an act nobody described`);
      }
    }
  }

  // DISCLOSURE-SLOT-NOT-REQUIRED — a slot naming a read no `requiresBefore` on the same tool demands.
  // The read is then optional, so the slot renders the placeholder on any turn the agent skipped it —
  // and the author cannot see that from the sentence.
  for (const block of src.matchAll(/disclose\s*:\s*\{([\s\S]*?)\n\s*\}/g)) {
    const start = src.slice(0, block.index).split('\n').length;
    for (const entry of block[1].matchAll(/(?:^|\n)\s*([A-Za-z_$][\w$]*)\s*:\s*((?:'[^']*'|"[^"]*"|`[^`]*`|\s*\+\s*)+)/g)) {
      const line = start + block[1].slice(0, entry.index).split('\n').length - 1;
      if (exempted(lines[line - 1])) continue;
      const demanded = requiredReadsFor(src, entry[1]);
      for (const slot of entry[2].matchAll(/\{([A-Za-z_$][\w$]*)(?:\.[A-Za-z_$][\w$]*)*\}/g)) {
        if (!demanded.has(slot[1])) {
          F(file, line, 'DISCLOSURE-SLOT-NOT-REQUIRED',
            `\`${entry[1]}\`'s disclosure reads \`${slot[1]}\`, which no \`requiresBefore\` on that tool demands — the read is optional, so the slot renders the placeholder on every turn the agent skipped it`);
        }
      }
    }
  }
```

Add the helper beside `declaredList`:

```js
/**
 * The reads a tool's own `requiresBefore` bindings demand — the guarantee a disclosure slot rests on.
 *
 * ```
 *   { hook: 'preTool', target: ['retireAsset'], guard: requiresBefore(['getAsset']), … }
 *   requiredReadsFor(src, 'retireAsset')  →  Set { 'getAsset' }
 * ```
 */
function requiredReadsFor(src, tool) {
  const reads = new Set();
  for (const m of src.matchAll(/target\s*:\s*\[([^\]]*)\][\s\S]{0,200}?requiresBefore\(\s*\[([^\]]*)\]/g)) {
    const targets = [...m[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]);
    if (!targets.includes(tool)) continue;
    for (const r of m[2].matchAll(/['"`]([^'"`]+)['"`]/g)) reads.add(r[1]);
  }
  return reads;
}
```

- [ ] **Step 4: Exercise both rules on a fixture**

Inspect `../agentspec/skill/scripts/test/` and follow whatever harness is already there. If it holds
fixture bundles, add one contract that trips each rule and one clean contract that trips neither, and
assert the finding ids. If the directory holds ad-hoc scripts, add one that runs the lint over an
inline fixture and exits non-zero when the expected rule id is absent.

- [ ] **Step 5: Run the lint against a real bundle**

Run: `node ../agentspec/skill/scripts/lint-authoring.mjs ../agentspec-bench/subjects/atlas`
Expected: the two new rules fire on atlas's `destructiveTools` (it declares no `disclose` yet). This is
the rules working — atlas is authored in Task 9, which is out of this spec's two-repo scope.

- [ ] **Step 6: Commit (in the agentspec repo)**

```bash
cd ../agentspec
git add skill/references/norms.md skill/references/test.md skill/scripts/
git commit -m "feat(skill): the domain declares what a destructive act would do"
```

---

### Task 7: Full gates

**Files:** none — this task runs what the previous six produced.

- [ ] **Step 1: Build core, then the workspace**

Run: `pnpm -C packages/core build && pnpm build`
Expected: no errors.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Full test suite**

Run: `pnpm test`
Expected: PASS across `packages/core`, `packages/mastra`, `packages/eval`, plus
`gen-guards-chapter --check`, `plain-names`, `guard-priority`.

- [ ] **Step 4: Record the counts**

Note the isolated / collective / coverage counts the suite reports — Task 8's proof record carries them.

---

### Task 8: The governance proof record

**Files:**
- Create: `governance/proofs/2026-08-08-disclosure.md`
- Regenerate: `governance/MATRIX.md`

The PR gate (`scripts/proofs/check-record-required.mjs`) refuses a diff under `packages/core/src/` or
`packages/mastra/src/` without a proof record carrying `verdict: PASS` in the same change.
`governance/MATRIX.md` is GENERATED — it is never hand-edited.

- [ ] **Step 1: Author the record with the governance skill**

Invoke the `looprun-governance` skill. Scope: `runtime`. Change line:

> The engine states what agreeing to a destructive act would do: one contract-declared sentence per
> destructive tool, printed above that tool's own consent question, with slots bound to the read whose
> result names the approval's subject; the observed call row carries its result on both execution paths.

Carry the counts from Task 7 Step 4 and the verdict.

- [ ] **Step 2: Regenerate the matrix**

Run: `pnpm proofs:matrix`
Expected: `governance/MATRIX.md` gains the new row at the top.

- [ ] **Step 3: Verify the gate is satisfied**

Run: `pnpm proofs:check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add governance/proofs/2026-08-08-disclosure.md governance/MATRIX.md
git commit -m "docs(governance): proof record for the disclosure change"
```

---

### Task 9: Measurement — DEFERRED, requires a live billed run

**Files:** `../agentspec-bench/subjects/atlas/norms/contract.ts` (a THIRD repository)

This task is **not executed by this plan.** Two reasons, both stated so nobody assumes it happened:

1. The spec scopes itself to two repositories — `looprun` and `agentspec`. Authoring `disclose` on the
   atlas subject edits `agentspec-bench`, which the spec puts out of scope.
2. The measurement is a live model run against `gemini-3.1-flash-lite` judged twice by
   `gemini-3.1-pro-preview` — real API spend, and the user's call.

What it requires, when the user asks for it:

```
author       disclose entries on atlas's destructive tools, one per tool, in norms/contract.ts
gates        lint-world clean · lint-authoring clean · world/bundle/premise green · validate clean
run          the 19-case remediation set, governed, judged TWICE with the SAME sealed ruler
floor        baseline to beat: 1/19. The engine-rendered variant measured 9/18 on the failing subset,
             which is 10/19 on the full set. Materially below that means the implementation
             diverged from what was measured.
```

The measurement is a diagnostic, not a range: it answers whether the named cause moved. It produces no
rate, no premium, no certificate, and no seal is minted from it.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §2 the decision — two contract fields | Task 2 |
| §3.1 subject binding, not latest-wins | Task 2 (test 2, renderer header) |
| §3.2 the placeholder | Task 2 (tests 3–5) |
| §3.3 a path that cannot exist → validate | Task 4 |
| §4.1 `DomainContract` gains two fields | Task 2 |
| §4.2 the observed row gains the result | Task 1 |
| §4.3 the render site | Task 3 |
| §4.4 the renderer | Task 2 |
| §4.5 what does NOT change | no task — `approvalCode`, `Guard.prose`, `renderClaim` and the world are untouched by construction; Task 7's full suite is what proves it |
| §5 documentation | Task 5 (`governance/MATRIX.md` moves in Task 8 — it is generated) |
| §6 the skill | Task 6 |
| §7 gates | Tasks 7, 8; the measurement is Task 9 (deferred) |
| §8 out of scope | no task |

**One spec row corrected here:** §5 lists `governance/MATRIX.md` as an artifact to edit. It carries a
`GENERATED — do not edit by hand` banner and is rewritten by `pnpm proofs:matrix` from the proof
records, so it moves in Task 8 as a regeneration, never as an edit.

**One engine rule the spec left open:** a slot whose path lands on an object or an array renders the
placeholder. `String({})` is `[object Object]`, which states nothing a reader can act on, and the
engine never puts a non-fact in a sentence. Pinned by the last test in Task 2 and reported by validate
(Task 4) when the slot walks no path at all.
