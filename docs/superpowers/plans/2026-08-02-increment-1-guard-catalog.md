# Increment 1 — GuardCatalog Data-only Implementation Plan

> **Status:** shipped. `loadNormsConfig` ships in `packages/eval/src/validate.ts`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the config-only guard layer: structural guard primitives, the zod norms schema + loader, the deny/abstain policies, and E1 (invariants see guard-vetoed attempts).

**Architecture:** New primitives live beside the existing guard factories in `packages/core/src/guards/`; the JSON schema + loader live in `packages/eval` (zod is already a dependency there and subject loading is eval's job); E1 spans `packages/mastra` (record vetoed attempts) and `packages/eval` (evaluate over them). No generated-bundle migration here.

**Tech Stack:** TypeScript, vitest (eval/mastra) + node:test where the package already uses it, zod ^3.24 (eval), pnpm workspace.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-02-guard-catalog-data-only-design.md` — normative, incl. the cut: **no schema field accepts a regex or free predicate**; guard prose lives ON the guard entry; `uncheckable` entries carry prose only.
- Export-surface law: any change to a package's public exports updates its surface-lock test riders AND the tutorial outline spec in the SAME commit.
- Deny policy: a rendered deny NAMES THE READ, never interpolates world figures/roles.
- Anchored edits only; run the touched package's tests + `pnpm -r typecheck` before every commit. Commit per task; never push.
- Fixtures reproduce the measured defects they close (case-35 shape for consentToken; case-72 shape for askedEarlier; the fabricated-premium shape for E1).

---

### Task 1: Structural primitives — `askedEarlier` + `confirmedNeedsEarlierSimulate` (consent binding)

**Files:**
- Create: `packages/core/src/guards/structural.ts`
- Modify: `packages/core/src/guards/index.ts` (or wherever `custom`/`requiresBefore` are re-exported — check `packages/core/src/index.ts` and `internal.ts`)
- Test: `packages/core/test/guards-structural.test.ts` (follow the runner style of existing `packages/core/test/*`)

**Interfaces:**
- Consumes: `GuardCtx` (`packages/core/src/rules.ts:45`) — fields `observed: ObservedCall[]`, `args`, `turnIndex`; `Guard` shape as returned by `custom()` (`packages/core/src/guards/custom.ts:4`). Read both files FIRST and mirror their exact option/return shapes.
- Produces: `askedEarlier(opts: { tool: string; arg?: string }): Guard` and `confirmedNeedsEarlierSimulate(opts: { tools: string[] }): Guard` — exported from `@looprun-ai/core` (public) for Task 2's loader.

- [x] **Step 1: Write the failing tests** — build a minimal fake `GuardCtx` (plain object with `observed`, `args`, `turnIndex`) and assert:

```ts
// askedEarlier: deny when no earlier-turn askUser exists; allow when one does; SAME-turn ask does not count
const g = askedEarlier({ tool: 'completeMaintenance', arg: 'condition' });
expect(g.check(ctxWith({ observed: [], turnIndex: 2, args: { condition: 'good' } }))).toMatch(/ask/i);
expect(g.check(ctxWith({ observed: [ask(1)], turnIndex: 2, args: { condition: 'good' } }))).toBeNull();
expect(g.check(ctxWith({ observed: [ask(2)], turnIndex: 2, args: { condition: 'good' } }))).toMatch(/ask/i);
// absent arg → not this guard's business
expect(g.check(ctxWith({ observed: [], turnIndex: 2, args: {} }))).toBeNull();

// confirmedNeedsEarlierSimulate: the case-35 reproduction
const c = confirmedNeedsEarlierSimulate({ tools: ['chargeDeposit', 'payInvoice'] });
// confirmed call with NO earlier-turn simulate of the SAME tool+args-subset → deny
expect(c.check(ctxConfirmed('chargeDeposit', { bookingId: 'bk_1', confirmed: true }, [simulate('payInvoice', 1)], 2))).toMatch(/simulation|simulate|confirm/i);
// simulate of the same tool with matching args in an EARLIER turn → allow
expect(c.check(ctxConfirmed('chargeDeposit', { bookingId: 'bk_1', confirmed: true }, [simulate('chargeDeposit', 1, { bookingId: 'bk_1' })], 2))).toBeNull();
// same-turn simulate → deny (consent must arrive in a LATER message)
expect(c.check(ctxConfirmed('chargeDeposit', { bookingId: 'bk_1', confirmed: true }, [simulate('chargeDeposit', 2, { bookingId: 'bk_1' })], 2))).toMatch(/later/i);
```

where `ask(turn)` = `{ name: 'askUser', ok: true, turnIndex: turn, args: { text: 'q?' } }` and `simulate(tool, turn, args?)` = `{ name: tool, ok: true, turnIndex: turn, args: { ...args, confirmed: false } }`.

- [x] **Step 2: Run to verify failure** — `pnpm -C packages/core test` (or the package's test script) → FAIL: module not found.
- [x] **Step 3: Implement** `structural.ts` via the existing `custom()` factory. `askedEarlier`: fires only when `ctx.args[arg]` is present; exemption = any `observed` entry with `name === 'askUser' && ok && turnIndex < ctx.turnIndex`. Deny text (policy): `Ask the operator for <arg> first — record it only after they answer.` `confirmedNeedsEarlierSimulate`: fires on `ctx.args.confirmed === true` for a listed tool; exemption = an observed SAME-tool call with `args.confirmed !== true`, `ok`, `turnIndex < ctx.turnIndex`, and every non-`confirmed` key of the simulate's args strictly equal in the confirmed call's args. Prose (rendered): one agreement covers one act; the simulation and the go-ahead live in different messages.
- [x] **Step 4: Tests green** — same command, plus `pnpm -r typecheck`.
- [x] **Step 5: Surface-lock riders + tutorial outline** for the two new core exports, SAME commit.
- [x] **Step 6: Commit** — `feat(core): structural guards — askedEarlier + confirmedNeedsEarlierSimulate (no text matching)`.

---

### Task 2: Norms config schema + loader (`@looprun-ai/eval`)

**Files:**
- Create: `packages/eval/src/norms-config.ts` (schema + `loadNormsConfig`)
- Modify: `packages/eval/src/index.ts` (export `loadNormsConfig`, `NormsConfig` type) + `test/surface-lock.test.ts` riders + tutorial outline spec
- Test: `packages/eval/test/norms-config.test.ts`

**Interfaces:**
- Consumes: Task 1's exports; core factories `requiresBefore(deps: string[])` (`guards/flow.ts:11`), `precondition(ok, reason, prose?)` (`guards/world.ts:15`); the `AgentSpec` construction path used by `packages/eval/test/fixtures/toy-subject` (read that fixture FIRST — the loader must produce the same spec shape `loadSubject` consumes).
- Produces: `loadNormsConfig(json: unknown, deps: { predicates?: Record<string, (w: AgentWorld) => boolean> }): AgentSpec` — throws `NormsConfigError` with a path-qualified message on any violation.

- [x] **Step 1: Failing tests** — three fixtures:

```ts
// (a) valid config with one guard of each kind loads and installs the expected guard ids
const spec = loadNormsConfig(fixtureValid, { predicates: { seatFree: () => true } });
expect(guardIds(spec)).toEqual(expect.arrayContaining([
  'agent:planChangeReadsUsageFirst', 'agent:chargeConsent', 'agent:conditionAsked']));
// (b) REGEX BAN structural proof: any string field shaped like a pattern is just data — but a
// config attempting a `pattern`/`regex`/`re` KEY anywhere fails validation by name
expect(() => loadNormsConfig(fixtureWithPatternKey)).toThrow(/pattern|regex.*not.*supported/i);
// (c) prose placement law: a guards[] entry missing `prose` when kind requires it → named error;
// an `uncheckable` entry with anything beyond {ruleId, prose} → named error
expect(() => loadNormsConfig(fixtureProseless)).toThrow(/prose/);
```

- [x] **Step 2: Verify failure** — `pnpm -C packages/eval exec vitest run test/norms-config.test.ts` → FAIL.
- [x] **Step 3: Implement** — zod schema per the spec's shape (`id`, `persona`, `tools`, `destructiveTools`, `guards[]` as a discriminated union on `kind` ∈ {`requiresBefore`, `consentToken` → installs `confirmedNeedsEarlierSimulate`, `askedEarlier`, `precondition` with the closed expression predicate}, `uncheckable[]`, `behavior[]`, `scope`). Use `.strict()` on every object so unknown keys — including any pattern-ish key — fail loudly. The `precondition` predicate compiles the closed expression (`op`, `left`, `right` over `{count|limit|field|arg}` refs) into a world predicate; unknown refs throw at LOAD time, not run time.
- [x] **Step 4: Green** + typecheck.
- [x] **Step 5: Commit** — `feat(eval): norms-config schema + loader — guards from data, regex structurally impossible`.

---

### Task 3: Deny-policy renderer for catalog guards

**Files:**
- Modify: `packages/eval/src/norms-config.ts` (deny strings built ONLY by `renderDeny`)
- Create: `renderDeny(readNames: string[], subjectNoun: string): string` in the same file
- Test: extend `packages/eval/test/norms-config.test.ts`

**Interfaces:**
- Consumes: guard entries' `reads`/`tool` fields.
- Produces: every catalog-installed guard's deny message; format: `Read <reads.join(' or ')> first and report the <subjectNoun> from that result.`

- [x] **Step 1: Failing test** — install a `requiresBefore` guard via the loader against a fixture world holding figures (e.g. `limits: {seats: 2}`), trigger the deny, and assert: `expect(deny).not.toMatch(/\d/)` and `expect(deny).toMatch(/getPlanUsage/)`. (The policy IS the test: names the read, never the figures.)
- [x] **Step 2: FAIL** (loader currently passes reasons through). **Step 3:** route all catalog deny text through `renderDeny`; configs cannot override it (no `reason` field in the schema — remove it if Step 3 of Task 2 added one). **Step 4:** green + typecheck. **Step 5: Commit** — `feat(eval): deny policy — catalog denies name the read, never the figures`.

---

### Task 4: Engine-owned honest abstain

**Files:**
- Create: `buildHonestAbstain(world: AgentWorld, okTools: string[], writeTools: readonly string[]): string` in `packages/core/src/assembled-prompt.ts` (beside `DomainContract`) — or `packages/core/src/runtime/` if assembled-prompt.ts is prompt-only; decide by where `exhaustionReply` is consumed (grep `exhaustionReply` in `packages/core/src/runtime/` first).
- Test: `packages/core/test/honest-abstain.test.ts`

**Interfaces:**
- Consumes: `world.toolCalls` action history entries `{name, tookEffect}`.
- Produces: the default abstain string; `loadNormsConfig` wires it as the contract's `exhaustionReply` when the domain config does not opt out.

- [x] **Step 1: Failing test** — action history with a simulate (`tookEffect: false`) for `cancelDispatch`, an effected `createBooking`, and a read `getMember`:

```ts
const s = buildHonestAbstain(worldWithActionHistory, ['cancelDispatch', 'createBooking', 'getMember'], ['cancelDispatch', 'createBooking']);
expect(s).not.toContain('cancelDispatch');   // no-effect WRITE never announced as succeeded
expect(s).toContain('createBooking');        // effected write is announced
expect(s).toContain('getMember');            // reads are announced
```

- [x] **Step 2: FAIL. Step 3:** implement (filter: keep a name iff not a write, or some action history entry under it has `tookEffect === true`). **Step 4:** green + typecheck + surface-lock rider if exported publicly. **Step 5: Commit** — `feat(core): engine-owned honest abstain — a no-effect simulate is never announced as done`.

---

### Task 5: E1 — invariants see guard-vetoed ATTEMPTS

**Files:**
- Modify: `packages/mastra/src/hooks.ts` (or wherever preTool vetoes are decided — grep `veto` / `deny` in `packages/mastra/src/` and READ before editing): on veto, record `{name, args, vetoed: true, turnIndex}` into the turn record (new field `attemptedCalls` on `TurnRecord` in `packages/core/src/` where `TurnRecord` is defined — grep `interface TurnRecord`).
- Modify: `packages/eval/src/run.ts:86-104` — `evaluateInvariants(inv, calls, attempts)` gains a third parameter; forbidden entries match over `[...calls, ...attempts]`; required entries stay execution-only. `runCase` collects `attempts` from `res.turnRecords[].attemptedCalls`. Dump gains `attemptedCalls` per turn.
- Test: `packages/eval/test/subject-runner.test.ts` — new test using `fakeLLM` + the toy-subject:

```ts
it('E1: a guard-vetoed forbidden call FAILS the invariant (attempt basis)', async () => {
  // script a call the toy subject's guard vetoes before the world sees it, on a case that forbids it
  const dump = await runCase(subject, caseForbidding('reserveRoom'), { model: fakeLLM(vetoedScript).model, modelId: 'scripted' });
  expect(dump.turns.some((t) => t.attemptedCalls?.some((a) => a.name === 'reserveRoom'))).toBe(true);
  expect(dump.invariantVerdict.pass).toBe(false);
  expect(dump.invariantVerdict.violations[0]).toMatch(/forbidden call attempted/);
});
```

- [x] **Step 1: Write the test, watch it fail** (attempt invisible today — this is the fabricated-premium reproduction). **Step 2:** mastra records vetoed attempts. **Step 3:** eval evaluates forbidden over executed ∪ attempted; violation text distinguishes `executed` vs `attempted (guard-vetoed)`. **Step 4:** ALL suites green (`pnpm -C packages/eval exec vitest run`, mastra tests, `pnpm -r typecheck`); update `CertSummary.artifactNote` base note to state the attempt basis; surface-lock riders + tutorial outline if `CaseDump`/`TurnRecord` shapes are in locked surfaces. **Step 5: Commit** — `feat: E1 — forbidden invariants evaluate over ATTEMPTS incl. guard-vetoed calls`.

---

### Task 6: Toy-subject norms-config parity proof

**Files:**
- Create: `packages/eval/test/fixtures/toy-subject/norms/front-desk.json` (the toy subject's front-desk spec expressed as config)
- Test: `packages/eval/test/norms-config.test.ts` — final test:

```ts
it('config-built spec is assembled prompt-byte-identical to the TS-built one', async () => {
  const ts = subject.specs['front-desk'];
  const cfg = loadNormsConfig(readJson('fixtures/toy-subject/norms/front-desk.json'));
  const world = subject.makeWorld('default');
  expect(renderAssembledPrompt(world, cfg, [], subject.contract))
    .toBe(renderAssembledPrompt(world, ts, [], subject.contract));
});
```

- [x] **Step 1:** author the JSON from the TS spec (guards it uses that have no catalog kind yet → `uncheckable` prose, and note the diff in the test file header). **Step 2:** iterate loader until byte-identity holds (this is the loader's acceptance proof). **Step 3:** commit — `test(eval): toy-subject norms config renders byte-identical assembled prompt (loader acceptance)`.

---

## Self-review notes

- Spec coverage: schema/loader → T2; primitives (askedEarlier, consentToken) → T1; deny policy → T3; abstain → T4; E1 → T5; acceptance/parity → T6. Text-classification-without-regex: the schema simply has no such kind (T2b proof); removing `pendingConfirmMustAsk`'s regex branch is deliberately DEFERRED to the bundle-migration round (touching it now would void coworking's measured numbers mid-increment) — recorded here, not silently dropped.
- Files I could not read before writing this plan (`guards/custom.ts` options object, `TurnRecord` definition, mastra hook internals) are marked READ-FIRST in their tasks; the implementer anchors on the real shapes before coding — the contracts above are binding, the literal signatures are not.
- No placeholder steps; fixtures are named after the measured defects they reproduce.
