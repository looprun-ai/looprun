# TO-BE Phase 1 — Fresh Build Implementation Plan

> **CLOSED — 2026-09-01.** Executed and merged; the build moved into `packages/*` at `856ac18`
> and is the engine on main.

> **Status: DONE — packages/next core merged to main.**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/next/core` (`@looprun-ai/next-core`): the contract leaf, the L1 card/fact types, the 4-species catalog seed, and THE one turn machine — gated by twelve scripted-model proofs, no network.

**Architecture:** Walking skeleton per the phase-1 build design (`docs/superpowers/specs/2026-08-17-to-be-phase-1-implementation-design.md`): from Task 2 on, a whole scripted turn always runs; each later task enriches one collaborator and lands its proof. Class signatures come verbatim from blueprint v3 (`docs/superpowers/specs/2026-08-12-to-be-blueprint-v3.md` §5.1 L329–517, §5.3 L684–1007).

**Tech Stack:** TypeScript 5.7 strict (NodeNext, `verbatimModuleSyntax` — relative imports need `.js` extensions), vitest 2, zod (FinishDesk's `z.strictObject` — the ONLY runtime dep), eslint 9 + typescript-eslint (R2.8).

## Global Constraints

- Branch: `to-be-phase-1`, branched from `main`. One commit per task. Merge to main only at Task 9 (gate green).
- Everything under `packages/next/core/` ONLY — the old engine at `packages/core` is never touched. The only file outside: `pnpm-workspace.yaml` gains the `packages/next/*` glob (Task 0).
- Package is `"private": true` until the phase-5 swap — release scripts must skip it.
- English everywhere; AS-IS comments only (no history, no evidence, no test names in comments).
- Layer law (blueprint §6): `contract/` imports NOTHING; `cards/` imports `contract/` only; `run/` imports `contract/` + `cards/`; `src/` never imports `test/`.
- No `any` (eslint error, no disables), no regex in `src/**`, no `fetch`/`node:http`/`node:https` in `src/**`.
- §11 name gate scoped to `packages/next/**`: the banned-identifier list in Task 0 is a build failure.
- Every crossing object travels deep-frozen (R2.9); `TurnDraft` is the one mutable work area.
- The gate command (Task 9): `pnpm -C packages/next/core gate` = `tsc --noEmit && eslint . && vitest run`.

## Deviations from blueprint-verbatim, decided here

| point | phase-1 form | why |
|---|---|---|
| `ModelSeat.create` | `create(targets: readonly ModelTarget[], choice: ModelChoice, make: (t: ModelTarget) => ModelPort)` | the blueprint's two-arg form presumes the models package registry (phase 3); the target list is a parameter until that package exists |
| `CompiledAgent` fields | `{ guards, limits, promptParts, facts }` | the design cut: `judged`/`rewrites`/`maskKeys`/`disclosureBindings`/`wording` enter with their phase-2 owners (Judge, DeliveryWriter rewrites, Masker, DisclosureDesk, Wordings) |
| engine sentences | hard-coded where spoken (FinishDesk closure, denial lines) | `Wordings` is L2, phase 2; it centralizes them when it arrives |
| `Engine.excluded()` | returns frozen `[]` | SurfaceGate (phase 2) is the producer of exclusions |
| masking | `call.data(v => v as Json)` identity masker at the record seam | Masker is phase 2; the SEAM (data(masker)) exists now so phase 2 only swaps the function |

---

### Task 0: Scaffold + the four structural lints

**Files:**
- Modify: `pnpm-workspace.yaml` (add `- 'packages/next/*'`)
- Create: `packages/next/core/package.json`, `tsconfig.json`, `eslint.config.js`
- Create: `packages/next/core/test/lint/name-gate.test.ts`, `layer-rule.test.ts`, `purity.test.ts`, `no-network.test.ts`
- Create: `packages/next/core/src/contract/vocabulary.ts` (empty export marker so the tree compiles)

**Interfaces (produces):** the lint suite every later task runs under; the `gate` script.

- [ ] **Step 1: branch + scaffold**

```bash
git checkout -b to-be-phase-1
mkdir -p packages/next/core/{src/{contract,cards,run},test/{lint,fixtures,proofs}}
```

`package.json`:

```json
{
  "name": "@looprun-ai/next-core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "license": "Apache-2.0",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "gate": "tsc --noEmit && eslint . && vitest run"
  },
  "dependencies": { "zod": "^3.24.0" },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "eslint": "^9.0.0",
    "typescript": "^5.7.0",
    "typescript-eslint": "^8.0.0",
    "vitest": "^2.0.0"
  },
  "engines": { "node": ">=22" }
}
```

`tsconfig.json`: `{ "extends": "../../../tsconfig.base.json", "include": ["src", "test"] }`

`eslint.config.js` (the R2.8 law — type-checked rules, error level, no disables):

```js
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['eslint.config.js'] },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-return': 'error'
    }
  }
);
```

- [ ] **Step 2: the four lints (they run on the whole `packages/next/` tree)**

All four walk the tree with `node:fs` (`readdirSync` recursive over `../../` relative to the test file, filtering `.ts`/`.js`, skipping `node_modules`). The name-gate excludes ITSELF from the scan — its banned array is the register.

`name-gate.test.ts` — whole-identifier match (split file content on non-identifier chars, exact token compare — never substring):

```ts
const BANNED = [
  'say', 'view', 'CallView', 'ReplyView', 'InstalledRule', 'ruleName',
  'intake', 'IntakeGate', 'IntakeTool', 'CertifiedIntake', 'intakeFromWorld',
  'toolDefs', 'expectedSurfaceHash', 'volatile', 'requiresBefore', 'readFirst',
  'forbidThisTurn', 'neverCall', 'consentRequired', 'resultInvariant',
  'destructiveThrottle', 'degenerationGuard', 'jargonScrub', 'llmCheck',
  'llmCheckLie', 'ask', 'control', 'ControlStrip', 'controlCompile',
  'stateView', 'modelParams', 'terminalProtocol', 'stopOnRepeatedToolCall',
  'redrives', 'tookEffect', 'effectInferred', 'probe', 'dryRun',
  'sampling', 'Sampling', 'internal'
];
```

(Register rows that ban a field-in-context only — `AgentSpec.mode`, world-audit `custom` — are enforced by the field's absence from the types, not by token scan: `mode` legitimately lives in `secrets` entries.)

`layer-rule.test.ts` — for each `src/` file, extract `from '...'` specifiers; assert: `contract/` files import only `./`-relative contract files (vocabulary imports nothing); `cards/` imports only `../contract/` or `./`; `run/` imports only `../contract/`, `../cards/`, `./`; no `src/` file imports `test/`; only `run/engine.ts` imports `./turn.js`; nothing imports `../run/engine.js`.

`purity.test.ts` — parse each `src/` file with the `typescript` package (`ts.createSourceFile`, walk the AST): any `RegularExpressionLiteral` node, or `new RegExp` / `RegExp(` call, fails. The exception set is empty.

`no-network.test.ts` — token scan of `src/`: `fetch`, `node:http`, `node:https`, `XMLHttpRequest`, `WebSocket` are build failures.

- [ ] **Step 3: install + run**

Run: `pnpm install`, then `pnpm -C packages/next/core gate`
Expected: PASS (lints green on the near-empty tree; vitest finds the 4 lint files).

- [ ] **Step 4: Commit** — `feat(next): scaffold next-core with the four structural lints`

---

### Task 1: `contract/` whole — vocabulary, ports, freeze, CanonicalCall (TDD)

**Files:**
- Create: `src/contract/vocabulary.ts`, `src/contract/ports.ts`, `src/contract/freeze.ts`, `src/contract/canonical-call.ts`
- Test: `test/contract/canonical-call.test.ts`, `test/contract/freeze.test.ts`

**Interfaces (produces):** every crossing type of blueprint §5.1 — `Json`, `Effect`, `Done`, `Status`, `Reason`, `ReportWord`, `Evidence`, `QuestionClose`, `QuestionState`, `Msg`, `ToolAnswer`, `Patch`, `ReadyCall`, `CanonicalCallData`, `Verdict`, `OwedRead`, `Correction`, `Act`, `ReportLine`, `FinishPayload`, `RawCall`, `ToolCard`, `StepInput`, `ModelStep`, `Question`, `TurnRecord`, `TurnFailure`, `CardError`, `InputCtx`/`CallCtx`/`ResultCtx`/`ReplyCtx`, `StateSnapshot`, `InstalledGuard`, `Rewrite`, `GuardCensus`, `EngineSentenceKey`, `RoutingStrategy`, `ModelTarget`, `ModelChoice`, `ProviderPreset`, `LlmParams`, `ServingHandle`, `TierSpec`; the four ports; `deepFreeze`; class `CanonicalCall`.

- [ ] **Step 1: `vocabulary.ts`** — transcribe the §5.1 type block VERBATIM from the blueprint (`2026-08-12-to-be-blueprint-v3.md` L329–480), doc comments included. `TurnFailure` and `CardError` get constructors (`constructor(kind, detail)` / `constructor(problems)`) that call `super(...)` with a composed message and set `name`.

- [ ] **Step 2: `ports.ts`** — the four one-method interfaces verbatim (blueprint L494–499).

- [ ] **Step 3: failing tests for `deepFreeze` + `CanonicalCall`**

```ts
test('deepFreeze freezes nested objects in place and returns the same reference', () => {
  const v = { a: { b: [1, 2] } };
  const f = deepFreeze(v);
  expect(f).toBe(v);
  expect(() => { (f.a.b as number[]).push(3); }).toThrow();
});

test('of coerces declared number from a numeric string and sorts the key', () => {
  const decl = fact('getBooking', 'read', { type: 'object',
    properties: { id: { type: 'string' }, day: { type: 'number' } }, required: ['id'] });
  const c = CanonicalCall.of('getBooking', { day: '3', id: 'bk_1' }, decl);
  if ('badArg' in c) throw new Error('expected a call');
  expect(c.args).toEqual({ day: 3, id: 'bk_1' });
  expect(c.key).toBe('{"args":{"day":3,"id":"bk_1"},"tool":"getBooking"}');
});

test('of rejects a non-coercible value loudly, naming the arg', () => {
  const c = CanonicalCall.of('getBooking', { id: { nested: true } }, declWithStringId);
  expect(c).toEqual({ badArg: 'id' });
});

test('equals is key equality; array values stay order-significant', () => { /* two of() calls, arg order swapped → equals true; array [1,2] vs [2,1] → false */ });
```

Run: `pnpm -C packages/next/core test` — Expected: FAIL (modules missing).

- [ ] **Step 4: implement**

`freeze.ts`: `export function deepFreeze<T>(v: T): T` — in-place recursive `Object.freeze`, skips already-frozen (shared sealed history stays shared).

`canonical-call.ts` — the class verbatim (blueprint L506–515). Coercion subset for phase 1: schema is `{ type:'object', properties: { k: { type:'string'|'number'|'boolean' } }, required?: string[] }` as `Json`; declared `number` accepts a numeric string, declared `boolean` accepts `'true'`/`'false'`; an object/array where a scalar is declared → `{ badArg }`; an arg not in `properties` → `{ badArg }`. `key` = JSON of `{ args, tool }` with deep-sorted object keys (arrays untouched). NOTE: sorting without regex — the purity lint watches.

- [ ] **Step 5: run tests → PASS. Commit** — `feat(next): contract leaf — vocabulary, ports, deepFreeze, CanonicalCall`

---

### Task 2: THE SKELETON — one scripted turn end to end (P1 · P11 · P12)

**Files:**
- Create: `src/cards/cards.ts`, `src/cards/facts.ts`
- Create: `src/run/session.ts`, `action-history.ts`, `status-clerk.ts`, `call-runner.ts`, `rulebook.ts`, `model-seat.ts`, `prompt-writer.ts`, `finish-desk.ts`, `delivery-writer.ts`, `turn.ts`, `engine.ts`
- Create: `test/fixtures/scripted-model.ts`, `hostile-tool-port.ts`, `records-port-stub.ts`, `compiled-agents.ts`
- Test: `test/proofs/p01-sealed-transcript.test.ts`, `p11-frozen-seal.test.ts`, `p12-serialized-entry.test.ts`

**Interfaces (produces):**

```ts
// cards.ts (L1, types only)
export interface Guard { name; rule; tool?; on; deny?; judgeQuery?; judgePolicy? }   // §3 verbatim (blueprint L151–170)
export interface Limits { calls?; destructive?; retries?; questionTurns? }           // §3 verbatim (L204–213)
export interface CompiledGuard extends InstalledGuard {
  readonly deny: (ctx: InputCtx | CallCtx | ResultCtx | ReplyCtx) => string | null;
}
export interface PromptParts { readonly persona: string; readonly voice: string | null; readonly facts: readonly string[] }
export interface CompiledAgent { readonly guards: readonly CompiledGuard[];   // priority order: spec → contract → engine floor
                                 readonly limits: Required<Limits>;
                                 readonly promptParts: PromptParts;
                                 readonly facts: SurfaceFacts }
// facts.ts (L1, types only)
export interface ToolFact { readonly name: string; readonly label: string | null; readonly does: string;
                            readonly effect: Effect; readonly target: string | null; readonly schema: Json;
                            readonly simulation: { readonly arg: string; readonly value: Json } | null;
                            readonly proxy: string | null }
export interface SurfaceFacts { readonly tools: Readonly<Record<string, ToolFact>> }

// run/ — blueprint §5.3 verbatim signatures
class Engine { static create(cfg: EngineConfig): Engine; chat(sessionId, text): Promise<TurnRecord>;
               guards(): GuardCensus; excluded(): readonly string[]; endSession(sessionId): void }
interface EngineConfig { compiled: CompiledAgent; toolPort: ToolPort; recordsPort: RecordsPort | null; seat: ModelSeat }
class Turn { run(session: Session, userText: string): Promise<TurnRecord> }
class Session { readonly id; enter<T>(job: () => Promise<T>): Promise<T>; draft(): TurnDraft; seal(draft): TurnRecord }
interface TurnDraft { turn: number; userText: string; acts: Act[]; corrections: Correction[];
                      issued: Question[]; consumed: string[]; closed: { id: string; why: QuestionClose }[];
                      finish: FinishPayload | null; closedBy: 'model' | 'engine'; servedBy: string }
class ActionHistory { mint(): string; add(act, draft): Act; ofTurn(turn): readonly Act[];
                      seen(call: CanonicalCall, turn: number): Act | null;
                      destructiveInTurn(turn): number; sealed(): readonly TurnRecord[] }
class CallRunner { run(raw: RawCall, origin: 'model' | 'engine' | 'licence', draft: TurnDraft): Promise<Act> }
class StatusClerk { grade(input, effect, before, after, draft): { status; reason; evidence; corrections } }
class Rulebook { checkInput(ctx): Verdict; checkPreTool(ctx): Verdict;
                 checkPostTool(ctx): readonly {guardName; detail}[]; checkReply(ctx): readonly {guardName; detail}[];
                 guards(): GuardCensus }
class ModelSeat { static create(targets, choice, make): ModelSeat; port(): ModelPort; serving(): string;
                  reroute(failure: TurnFailure): boolean }
class PromptWriter { system(): string; toolCards(): readonly ToolCard[];
                     tail(userText, state, open): string; correction(sentences): string }
class FinishDesk { toolCard(): ToolCard; split(calls): { domain; finish; corrections };
                   parse(args): { ok: true; finish } | { ok: false; detail }; force(): string;
                   closure(acts): string }
class DeliveryWriter { compose(message, acts, open, closed): string }
```

Task-2 minimal bodies: `Rulebook` holds the compiled arrays but they are EMPTY in this task's fixture; `StatusClerk` grades only the `answer` input (`yes`→done row); `CallRunner` routes only `allow`; `ModelSeat` single target, no reroute; `FinishDesk` split+parse only; `PromptWriter` composes persona+facts+tool cards once. The turn walk: checkInput → model loop (serial calls in emission order via `CallRunner`) → finish parse → checkReply (empty) → `DeliveryWriter.compose` → `session.seal(draft)` deep-freezes the record.

**Fixtures:**

```ts
// scripted-model.ts — a ModelPort fed a queue of ModelStep values; records every StepInput it receives
export class ScriptedModel implements ModelPort {
  readonly seen: StepInput[] = [];
  constructor(private readonly steps: ModelStep[]) {}
  step(input: StepInput): Promise<ModelStep> { this.seen.push(input); const s = this.steps.shift();
    if (!s) throw new TurnFailure('provider-quota', 'script exhausted'); return Promise.resolve(s); }
}
// hostile-tool-port.ts — per-tool behavior map: answer | throw; call log for re-execution assertions
// records-port-stub.ts — snapshot(): StateSnapshot from a mutable store the test scripts between calls
// compiled-agents.ts — hand-built CompiledAgent values (AgentFactory does not exist yet):
//   booking(): getBooking(read) + cancelBooking(destructive, target 'id') + sendEmail(write), guards []
```

The finish call in scripts: `{ tool: 'finish', args: { message: 'done', report: [...] } }`.

- [ ] **Step 1: write P1 failing**

```ts
test('a scripted turn seals [toolCall, toolResult, reply] in order, complete TurnRecord', async () => {
  const model = new ScriptedModel([
    { calls: [{ tool: 'getBooking', args: { id: 'bk_1001' } }], text: '' },
    { calls: [{ tool: 'finish', args: { message: 'Booking found.', report: [] } }], text: '' }
  ]);
  const engine = testEngine({ model });          // helper in fixtures: Engine.create over booking() + stubs
  const r = await engine.chat('s1', 'check booking bk_1001');
  expect(r.acts).toHaveLength(1);
  expect(r.acts[0]).toMatchObject({ origin: 'model', status: 'done', turn: 1,
    call: { tool: 'getBooking', args: { id: 'bk_1001' } } });
  expect(r.finish?.message).toBe('Booking found.');
  expect(r.closedBy).toBe('model');
  expect(r.text).toContain('Booking found.');
  expect(r.servedBy).toBe('scripted-1');
});
```

- [ ] **Step 2: run → FAIL.** Then implement the skeleton until green. P11 and P12 next:

```ts
test('the sealed TurnRecord and every ctx travel deep-frozen; sealed history shared by reference', async () => {
  const r = await engine.chat('s1', 'check booking bk_1001');
  expect(Object.isFrozen(r) && Object.isFrozen(r.acts) && Object.isFrozen(r.acts[0])).toBe(true);
  expect(() => { (r.acts as Act[]).push(r.acts[0]); }).toThrow();
  const r2 = await engine.chat('s1', 'again');    // second scripted turn
  // the guard ctx of turn 2 carries turn 1's acts BY REFERENCE (fixture guard captures its ctx)
  expect(capturedCtx.pastActs[0]).toBe(r.acts[0]);
});

test('two concurrent chat calls on one session serialize; the second sees the first sealed', async () => {
  const [r1, r2] = await Promise.all([engine.chat('s1', 'first'), engine.chat('s1', 'second')]);
  expect(r1.turn).toBe(1); expect(r2.turn).toBe(2);
  // the model input of turn 2 contains turn 1's delivered text in its messages — never a torn draft
  expect(model.seen.at(-1)!.messages.some(m => m.text === r1.text)).toBe(true);
});
```

(P11's ctx capture needs ONE fixture guard installed — a spec guard `{ on: 'input', deny: ctx => { captured = ctx; return null; } }` compiled by hand into the fixture agent. `Rulebook.checkInput` iterating its input array is therefore already real in this task; the ARRAYS beyond that stay empty.)

- [ ] **Step 3: green → Commit** — `feat(next): the walking skeleton — one scripted turn seals a frozen record`

---

### Task 3: StatusClerk complete — the whole grading table (P5)

**Files:** Modify `src/run/status-clerk.ts`, `src/run/call-runner.ts`; Test `test/proofs/p05-status-clerk.test.ts`.

**Interfaces (consumes):** `grade` signature from Task 2. `CallRunner` now snapshots `before`/`after` around execution when a `recordsPort` exists.

- [ ] **Step 1: failing tests — one per row (unit level, direct `grade` calls):**

| input | effect | expected |
|---|---|---|
| `{ answer: { done: 'yes' } }` | any | `status 'done'`, evidence `'executor'` |
| `{ answer: { done: 'no' } }` | any | `'not-done'`, reason `'refused'` |
| `{ answer: { done: 'unknown' } }` | write | `'unknown'` — and `closure()` later says "could not confirm", never "nothing changed" |
| `{ threw: 'ECONNRESET' }` | read | throws `TurnFailure` kind `'executor'` |
| `{ threw: 'ECONNRESET' }` | write | `'unknown'` (it may have landed) |
| `{ verdict: refuse }` | any | `'not-done'`, reason `'blocked'`, evidence `'engine'` |
| `{ answer: { done: 'no' } }` + snapshot diff shows the record changed | write | corrected to `'done'`, evidence `'diff'`, corrections `[{ kind: 'recordCorrected', actId, said: 'no' }]` |

Plus one integration test: hostile ToolPort answers `done:'no'` for `cancelBooking` while the RecordsPort stub's store mutates → the sealed act reads `done` with a `recordCorrected` correction in the record.

- [ ] **Step 2: implement the table.** The diff compares `before`/`after` snapshots by deep equality (no regex). `recordCorrected.actId` is the graded act's id — `grade` receives the minted id via the draft (grade is called after `mint()`; pass the id in the `input` object: extend the input union member with `actId`). Run → PASS.

- [ ] **Step 3: Commit** — `feat(next): StatusClerk — the whole grading table incl. snapshot diff`

---

### Task 4: Rulebook pipe + catalog seed `onlyAfter` · `maxCalls` (P3 · P4 · P10)

**Files:** Create `src/cards/catalog.ts`; modify `src/run/rulebook.ts`, `src/run/call-runner.ts`; test `test/proofs/p03-refuse.test.ts`, `p04-owe.test.ts`, `p10-census.test.ts`.

**Interfaces (produces):**

```ts
// catalog.ts — factories return Guard with phase filled; name minted 'kind:tool' (GUARD_NAME_DUP on collision at compile — phase 2; phase-1 fixtures install by hand)
export function onlyAfter(tool: string, prerequisite: string): Guard;   // on:'preTool'
export function maxCalls(tool: string, n: number, opts: { scope: 'conversation' | 'turn'; reason: string }): Guard;  // on:'preTool'
```

`onlyAfter` semantics (blueprint §5.2): the gated call may run only after the prerequisite SUCCEEDED this conversation (a done act for `prerequisite` in `pastActs`/`turnActs`). Absent: if the prerequisite's declared effect is `read` → verdict `owe` with `reads: [{ alias: prerequisite, tool: prerequisite, args: {} }]` — the engine derives NO arguments; the CallRunner's owe route pays the debt with ONE forced micro-step (single-tool surface, the session's own seat fills the read's args), and an unpaid debt refuses with the owning rule so the turn always answers; if `write` → deny, the detail teaching the order. A deny-form Guard cannot return `owe` through `deny: () => string|null` — so `onlyAfter` compiles to a `CompiledGuard` whose Rulebook row the pipe SPECIAL-CASES? No: widen the compiled seam instead — `CompiledGuard.deny` stays `string | null`, and `catalog.onlyAfter` returns a Guard whose compiled form carries `owe: (ctx: CallCtx) => readonly OwedRead[] | null` beside `deny`. `Rulebook.checkPreTool` asks `owe` first (non-null → `{ kind: 'owe', reads }`), then `deny` (non-null → refuse). Both derive from the SAME parameters (R6.3).

`Rulebook` full pipe: four frozen arrays built in the constructor from `CompiledAgent.guards` split by `on`; first-non-allow wins on input/preTool; postTool/reply collect ALL; `guards()` returns a census whose `guards` member is built over THE SAME four array objects (concatenated view, band order) — never a copy (`toBe` provable per element and per array identity via an exposed-for-census structure: keep the four arrays as readonly fields and build the census lazily from them each call, `guards[i]` object identity preserved).

`CallRunner` verdict routing grows: `refuse` → denial act (`status 'not-done'`, `reason 'blocked'`, sentence = `rule + ' — ' + detail`, evidence `'engine'`, `said: null`); `owe` → run each owed read through `this.run(read, 'engine', draft)` (recorded, masked), then RE-CHECK the original call once and follow the fresh verdict.

- [ ] **Step 1: failing proofs**

```ts
// P3 — sendEmail carries maxCalls(sendEmail, 1, { scope: 'conversation', reason: 'One email per person, ever.' })
//   script: turn 1 sends the email (done); turn 2 tries again → the act is not-done/blocked,
//   the delivery contains 'One email per person, ever.', and the turn STILL seals with the model's finish.
// P4 — cancelBooking guarded by onlyAfter('cancelBooking', 'getBooking'); script proposes cancelBooking directly
//   → the sealed acts: [getBooking(origin 'engine', status done), cancelBooking(origin 'model', done)] in THAT order.
// P10 — engine.guards(): census.guards[i] is the SAME object the rulebook's phase arrays hold (toBe),
//   census.limits equals the resolved limits, census.rewrites is [].
```

- [ ] **Step 2: implement → green. Commit** — `feat(next): rulebook pipe + onlyAfter/maxCalls — refuse and owe walk the machine`

---

### Task 5: catalog seed `noDuplicateCall` + `argRequired` (P2)

**Files:** Modify `src/cards/catalog.ts`; test `test/proofs/p02-restate.test.ts`, `test/cards/arg-required.test.ts`.

**Interfaces (produces):**

```ts
export function noDuplicateCall(): Guard;                    // on:'preTool', always-on floor; home 'engine'
export function argRequired(tool: string, arg: string): Guard;  // on:'preTool', schema-auto; whitespace-only = MISSING
```

With `AgentFactory` absent, `test/fixtures/compiled-agents.ts` performs its derivation BY HAND: for every fixture agent, install `noDuplicateCall` (floor) and one `argRequired` per schema-required arg, after the spec/contract guards in the frozen array.

`noDuplicateCall` compiles to a row with `restate: (ctx: CallCtx) => string | null` (the duplicate act's id) beside `deny` — `checkPreTool` maps it to `{ kind: 'restate', actId }`. The duplicate check rides `ActionHistory.seen` — canonical key, this conversation. `CallRunner` route `restate`: record an act whose `result` is the FIRST act's result, `status` mirrors it, evidence `'engine'`, the executor NOT called.

- [ ] **Step 1: failing P2** — script calls `getBooking(bk_1001)` twice in one turn (and once again next turn): the hostile port's call log shows ONE execution; acts 2 and 3 restate act 1's result.
- [ ] **Step 2: failing argRequired tests** — a call missing the required arg (or passing `'   '`) → refuse with the arg named; the coercion rejection (`CanonicalCall.of` → `badArg`) also surfaces as a refuse-shaped denial act naming the arg (loud, R1.6 — never a silent drop).
- [ ] **Step 3: implement → green. Commit** — `feat(next): noDuplicateCall + argRequired — restate lands, coercion rejects loudly`

---

### Task 6: FinishDesk complete (P8)

**Files:** Modify `src/run/finish-desk.ts`, `src/run/turn.ts`; test `test/proofs/p08-forced-finish.test.ts`.

**Interfaces:** the Task-2 signature, now whole. The ONE `z.strictObject` schema:

```ts
const finishSchema = z.strictObject({
  message: z.string().min(1),
  report: z.array(z.strictObject({
    tool: z.string(), target: z.string(),
    word: z.enum(['done', 'held', 'refused', 'blocked', 'unknown'])
  }))
});
```

`toolCard()` renders FROM this object (keys + enum walked from the zod def — a taught key the validator rejects cannot exist). `split`: finish beside domain calls → the finish DEFERS with `{ kind: 'earlyFinish' }`; two finishes → last wins with `{ kind: 'staleFinish' }`. `force()`: the forced-finish instruction sent with `StepInput.forceFinish: true`. `closure(acts)`: pure — any done act → names its tools; any unknown → "could not confirm"; neither → "nothing changed". Turn exhaustion: when `limits.calls` is spent or the model answers twice without a finish, ONE forced step; if it still yields no valid finish, the ENGINE closes: `finish: null`, `closedBy: 'engine'`, delivery text ends with `closure(acts)` and a `{ kind: 'forcedFinish' }` correction.

- [ ] **Step 1: failing P8** — script exhausts `limits.calls: 2` with domain calls and never finishes → the forced step's `StepInput.forceFinish` is true; the scripted forced answer ALSO returns no finish → sealed record: `closedBy 'engine'`, corrections contain `forcedFinish`, text contains the tool names the closure derived from the done acts. Second test: `earlyFinish` defers (finish beside a call → the call runs, the finish waits, correction recorded).
- [ ] **Step 2: implement → green. Commit** — `feat(next): FinishDesk — strict schema, deferral, forced finish, act-derived closure`

---

### Task 7: ModelSeat complete (P6)

**Files:** Modify `src/run/model-seat.ts`, `src/run/turn.ts`, `src/run/engine.ts`; test `test/proofs/p06-turn-failure.test.ts`.

**Interfaces:** Task-2 signature + `llmParams(base: LlmParams): LlmParams` (the local-tier brakes: a `tier: { local }` target pins `temperature: 0` and caps `maxOutputTokens` at the tier's declared cap when the base leaves it open). `create` throws on an uncertified target in the set. `reroute(failure)` advances the strategy cursor BETWEEN turn attempts only; returns false when the set is spent.

Turn-failure walk: `ScriptedModel` throwing `TurnFailure` mid-turn (after a call already recorded into the draft) → `Turn.run` lets it propagate; `Session.enter`'s job rejects; the draft is DISCARDED (never sealed); `Engine.chat` rejects with the `TurnFailure`. A retry `chat` starts clean: turn index unchanged, zero partial acts in history.

- [ ] **Step 1: failing P6** — script: step 1 emits a call (recorded), step 2 throws `TurnFailure('network', ...)` → `await expect(engine.chat(...)).rejects.toBeInstanceOf(TurnFailure)`; then a fresh scripted retry succeeds with `turn: 1` and `history.sealed()` holds exactly that one record (zero partial acts from the failed attempt). Reroute test: a two-target seat — the failed attempt reroutes, the retry's record says `servedBy: 'scripted-2'`; and within ONE turn the serving target never changes (every `StepInput` of a turn hits the same port). Certification test: `ModelSeat.create` with an uncertified target throws. Brakes test: a local-tier target → the `StepInput.llmParams` the model sees carries the pinned decoding.
- [ ] **Step 2: implement → green. Commit** — `feat(next): ModelSeat — certification, brakes, reroute between attempts; a failed turn seals nothing`

---

### Task 8: PromptWriter byte-stable (P7)

**Files:** Modify `src/run/prompt-writer.ts`, `src/run/turn.ts`; test `test/proofs/p07-byte-stable-prompt.test.ts`.

**Interfaces:** Task-2 signature, now with the channel law: business-common blocks first (voice, facts, tool cards — a CONTRACT tool guard's `rule` renders into its tool's own `ToolCard.does`), per-agent divergence late (persona, spec guard rules), the state block and open questions ride the `tail`. `system()` freezes its string on first render.

- [ ] **Step 1: failing P7** — run three scripted turns on one engine; every `StepInput.system` the ScriptedModel recorded startsWith the SAME `system()` string (byte compare), and only the tail differs; `pw.system() === pw.system()` returns the same frozen reference. A contract guard on `cancelBooking` → its `rule` appears inside the `cancelBooking` ToolCard `does`; a spec guard's rule appears in the system tail-end block, not in any ToolCard.
- [ ] **Step 2: implement → green. Commit** — `feat(next): PromptWriter — byte-stable system, guard channel law`

---

### Task 9: GATE — P9, the full sweep, merge

**Files:** Test `test/proofs/p09-serial-execution.test.ts`; no src beyond what P9 demands.

- [ ] **Step 1: failing P9** — one scripted step emits TWO calls `[getBooking(bk_1), getBooking(bk_2)]`; the hostile port records entry/exit timestamps with an artificial delay on the first → assertions: the second call ENTERS the port only after the first EXITED (serial), and the sealed acts hold emission order.
- [ ] **Step 2: implement (the Task-2 loop is already serial `for…await`; this proof pins it) → green.**
- [ ] **Step 3: the sweep**

Run: `pnpm -C packages/next/core gate` (tsc + eslint + vitest: 12 proofs + unit tests + 4 lints) — Expected: ALL PASS.
Run: `pnpm test` at the repo root — Expected: PASS (the old engine untouched; root scripts unaffected by the private new package).

- [ ] **Step 4: Commit** — `feat(next): P9 serial execution — the phase-1 gate is green`
- [ ] **Step 5: merge** — `git checkout main && git merge --no-ff to-be-phase-1`. Phase 1 is paid; phase 2 gets its own build design.

## Proof ↔ law register (the gate instrument)

| P | file | law |
|---|---|---|
| P1 | p01-sealed-transcript | R2.7 |
| P2 | p02-restate | R8.2 |
| P3 | p03-refuse | R5.6 |
| P4 | p04-owe | R5.2 |
| P5 | p05-status-clerk | R3.6 |
| P6 | p06-turn-failure | R2.10 |
| P7 | p07-byte-stable-prompt | R7.3 |
| P8 | p08-forced-finish | R7.2 |
| P9 | p09-serial-execution | R2.6 |
| P10 | p10-census | R1.5 |
| P11 | p11-frozen-seal | R2.9 |
| P12 | p12-serialized-entry | R8.3 |
