# C6+C3 — Needs and the Accumulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `onlyAfter`/`onlyAfterWhen` become the one `needs` declaration whose read the engine arms itself, and every consumer of `RecordsPort.snapshot()` — guard ctx, grading photos, the prompt tail, the micro-step — reads the ReadsLog of this conversation's own tool answers instead; the port dies.

**Architecture:** Spec: `docs/superpowers/specs/2026-09-01-c6c3-needs-and-the-accumulation-design.md`. Seven engine tasks (each green on its own), then subjects, docs, skill, and the measured close: escada 12→40 directed, then the program's one FULL RULER.

**Tech Stack:** TypeScript, vitest, pnpm workspace; agentspec-bench/harborpoint/trialworks for the subjects.

## Global Constraints

- English only in every file; AS-IS comments; no history, no evidence, no test names in comments.
- Old names deleted in the same commit as their replacement — no shim, no compatibility path.
- **The engine never guesses a payload's shape**: every engine walk into an answer follows a DECLARED path; authored subject code may read its own surface's shapes.
- No external model call, ever; the subject model in `ask/targets.json` is the only model any run reaches; every verdict judged in session.
- Branch: create `c6c3-needs-and-the-accumulation` from `main` in `~/Dev/js/looprun/looprun`; subject repos work on their own `main`.
- The escada is 12 → 40 → 100: each checkpoint judged and SHOWN to the owner before the next rung; the FULL RULER runs once, at the end, only after the owner sees the 40.
- `stash@{0}` in the looprun checkout is parked WIP — never dropped.

---

### Task 1: The `needs` factory; `onlyAfter` and `onlyAfterWhen` die in core

**Files:**
- Modify: `packages/core/src/cards/catalog.ts:59-89` (replace `onlyAfter`), `:739-780` (delete `onlyAfterWhen`)
- Modify: `packages/core/src/run/call-runner.ts:195-214` (the owe route arms declared args)
- Modify: `packages/core/src/cards/agent-factory.ts` (compile-merge into `DisclosureBinding.needs`; the construction throw on a doubled alias)
- Test: `packages/core/test/cards/needs.test.ts` (new); every core test naming the old factories (find with `grep -rln "onlyAfter" packages/core/test/`)

**Interfaces:**
- Produces: `needs(tool: string, spec: NeedsSpec): SeedGuard` with
  `NeedsSpec = { read: string; args?: Record<string,string>; pick?: {list,by,key}; when?: (reads: ReadsView) => boolean | null; rule?: string }`.
  Until Task 3 lands, `ReadsView` is a placeholder type alias (`Readonly<Record<string, never>>`) and `when` compiles but always binds (`true | null` semantics) — Task 4 wires the real view.
- Produces: kind `'needs'`, name `needs:${tool}`; the owe verdict's `reads[0].args` carry the resolved declared renames.

- [ ] **Step 1: Write the failing proofs**

```typescript
import { test, expect } from 'vitest';
import { AgentFactory } from '../../src/cards/agent-factory.js';
import { needs } from '../../src/cards/catalog.js';
import { factsFromWorld } from '../../src/cards/facts.js';
import { Rulebook } from '../../src/run/rulebook.js';
import { HOSTILE } from '../fixtures/hostile-world.js';

const FACTS = factsFromWorld(HOSTILE);
const f = new AgentFactory();
const ctx = (turnActs = [], pastActs = []) => ({
  call: { tool: 'cancelBooking', args: { id: 'bk_9' }, key: 'cancel:bk_9' },
  effect: 'destructive', consented: false, state: null,
  userText: 'cancel bk_9', userTexts: ['cancel bk_9'], turnActs, pastActs });

test('an unpaid needs owes its read with the declared renames resolved', () => {
  const rulebook = new Rulebook(f.governed({ name: 'a', persona: 'p' },
    { name: 'd', guards: [needs('cancelBooking',
        { read: 'getBooking', args: { bookingId: 'id' } })] }, FACTS));
  const verdict = rulebook.checkPreTool(ctx());
  expect(verdict).toMatchObject({ kind: 'owe',
    reads: [{ alias: 'getBooking', tool: 'getBooking', args: { bookingId: 'bk_9' } }] });
});

test('a paid needs stands down', () => {
  const done = { id: 'a_1', call: { tool: 'getBooking', args: { bookingId: 'bk_9' }, key: 'g' },
    effect: 'read', status: 'done', result: {}, sentence: 'getBooking — done' };
  const rulebook = new Rulebook(f.governed({ name: 'a', persona: 'p' },
    { name: 'd', guards: [needs('cancelBooking',
        { read: 'getBooking', args: { bookingId: 'id' } })] }, FACTS));
  expect(rulebook.checkPreTool(ctx([done]))).toMatchObject({ kind: 'hold' });
});

test('the relation lands in the disclosure binding under the read alias', () => {
  const c = f.governed({ name: 'a', persona: 'p' },
    { name: 'd', guards: [needs('cancelBooking',
        { read: 'getBooking', args: { bookingId: 'id' } })] }, FACTS);
  expect(c.disclosureBindings['cancelBooking'].needs['getBooking'])
    .toMatchObject({ tool: 'getBooking', args: { bookingId: 'id' } });
});

test('a doubled alias — disclosure needs AND a needs guard — throws at construction', () => {
  expect(() => f.governed({ name: 'a', persona: 'p' },
    { name: 'd',
      guards: [needs('cancelBooking', { read: 'getBooking', args: { bookingId: 'id' } })],
      disclosure: { cancelBooking: { needs: { getBooking: 'getBooking' } } } }, FACTS))
    .toThrow(/one declaration/);
});
```

Adapt the `disclosure` contract field name to the shape `AgentFactory.governed` actually
takes (read `agent-factory.ts` first); the assertion stands.

- [ ] **Step 2: Run — expect every proof red (`needs` does not exist).**
- [ ] **Step 3: Implement `needs` in catalog.ts** — the body adapts `onlyAfter`'s compile verbatim (satisfied/attemptedThisTurn on `spec.read`, the read/write branch of `deny`) with: owe returns the DECLARED renames resolved from the held call (`Object.entries(spec.args ?? {}).map(([readArg, heldArg]) => [readArg, ctx.call.args[heldArg] ?? null])`); `when` consulted before owe/deny (false → null, null/true → bind); kind `'needs'`. Delete `onlyAfterWhen` whole; delete the old `onlyAfter` body.
- [ ] **Step 4: The owe route arms declared args** (`call-runner.ts:195-214`): a read whose `args` are non-empty — or whose schema requires none — runs directly (`await this.runChecked({ tool: read.tool, args: read.args }, 'engine', draft, 0)`); the micro-step remains only for an owed read with empty args AND required schema args.
- [ ] **Step 5: Compile-merge in agent-factory.ts** — each compiled `needs` guard's relation lands in `disclosureBindings[tool].needs[read]`; a pre-existing alias with the same name throws `one declaration, one home: '${read}' is declared on both the guard and the disclosure of '${tool}'`.
- [ ] **Step 6: Sweep core** — `grep -rn "onlyAfter" packages/core/src packages/core/test` → every use becomes `needs` (tests updated to the new shapes); run `pnpm --filter @looprun-ai/core test` → green.
- [ ] **Step 7: Commit** `feat(core): needs — the owed read is one declaration, and the engine arms it`

### Task 2: Emit follows — declarations speak `needs`

**Files:**
- Modify: `packages/emit/src/declaration.ts:13-15,121` (factory list), `packages/emit/src/write-cards.ts:83`, `packages/emit/src/against-surface.ts:119-121,310`
- Test: the emit suite (`pnpm --filter @looprun-ai/emit test`)

**Interfaces:**
- Consumes: Task 1's `needs` seed shape.
- Produces: a `declaration.yaml` guard `factory: needs` with `args: { read, args?, pick?, when? }`; `against-surface` verifies `read` against `facts.tools` the way it verified `after`.

- [ ] **Step 1: Rename the factory across the three files; the `after` arg becomes `read`; `onlyAfterWhen`'s `field` special-case (`against-surface.ts:310`) folds into the `when` presence check.**
- [ ] **Step 2: Update emit fixtures/tests naming the old factories; run the emit suite → green.**
- [ ] **Step 3: Commit** `feat(emit): declarations state needs`

### Task 3: The ReadsLog

**Files:**
- Create: `packages/core/src/run/reads-log.ts`
- Test: `packages/core/test/run/reads-log.test.ts`

**Interfaces:**
- Produces: `class ReadsLog { constructor(now: () => number, validForMs = DEFAULT_READ_VALID_FOR_MS); record(tool, argsKey, answer): void; latest(tool, argsKey?): { answer, at } | null; entries(): readonly { tool, argsKey, answer, at }[] }` and `DEFAULT_READ_VALID_FOR_MS = 300_000`. Whole answers, opaque; no shape walking.

- [ ] **Step 1: Write the proofs** — record/latest roundtrip; `latest(tool)` with no argsKey answers the newest across keys; a row past `validForMs` is null (stale = unread); re-recording restarts the clock; `entries()` lists only valid rows; an answer is stored as given (nested JSON untouched).
- [ ] **Step 2: Implement (the microtest prototype minus `rowsOf` — rows keyed `tool → argsKey → { answer, at }`); run → green.**
- [ ] **Step 3: Commit** `feat(core): the reads log — what this conversation's calls answered, on the clock`

### Task 4: Guards read the log — `CallCtx.state` dies

**Files:**
- Modify: `packages/core/src/contract/vocabulary.ts` (CallCtx: `state` → `reads: ReadsView`; export `ReadsView`)
- Modify: `packages/core/src/run/call-runner.ts:99` (build ctx from the log), `:291-301` (callCtx)
- Modify: `packages/core/src/cards/catalog.ts` — the state-reaching families per the spec's §2d table: `precondition` (`{ record, reads }`, absent/stale target answer refuses `read it first — the row was not read this conversation`), `role` (`{ read, at, in }` declared path), `valueFromUserOrRecord`/`argMatchesRecord` (`from` names a read, `at` a declared path), `argSatisfiesCondition` (predicate over `reads` where it read state)
- Modify: `packages/core/src/run/session.ts` / `turn.ts` (the log lives on the session, fed by every executed call's masked answer; the consent clock injected)
- Test: `packages/core/test/run/reads-ctx.test.ts` (new) + every core test passing `state:` in a ctx

**Interfaces:**
- Produces: `ReadsView = { latest(tool, argsKey?): { answer: Json, at: number } | null }`; `CompiledGuard` hooks unchanged in shape.
- Consumes: Task 3's ReadsLog.

- [ ] **Step 1: Proofs first** — a precondition whose target answer is unread refuses in the read-it-first words; read → passes; stale → refuses again; a role gate walks its declared `at` path over the named read's answer; `needs.when` sees the view (false stands down, null binds).
- [ ] **Step 2: Implement; sweep `state` out of CallCtx and every core test ctx literal; core green.**
- [ ] **Step 3: Commit** `feat(core): a guard sees what the tools returned, and nothing else`

### Task 5: Grading from the answer alone

**Files:**
- Modify: `packages/core/src/run/status-clerk.ts` (drop `before`/`after`; the said-no diff overrule and `evidence: 'diff'` die), `packages/core/src/contract/vocabulary.ts:54` (`recordCorrected` dies), `packages/core/src/run/call-runner.ts:231-233`
- Test: `packages/core/test/run/status-clerk.test.ts` updates

- [ ] **Step 1: Proofs: yes → done/executor; no → not-done/refused; unknown → unknown; a thrown read still fails the turn.**
- [ ] **Step 2: Implement; sweep `recordCorrected`/`'diff'` from core and tests; green.**
- [ ] **Step 3: Commit** `feat(core): an act's status is the tool's own answer`

### Task 6: The tail renders the reads

**Files:**
- Modify: `packages/core/src/run/turn.ts:250-330` (both snapshot sites), `packages/core/src/run/prompt-writer.ts:82-83` (`STATE:` → `READS:`), `packages/core/src/contract/vocabulary.ts:289-294` (`tail` and `note` leave `SurfaceFacts`), `packages/core/src/cards/facts.ts` (stop minting them)
- Test: prompt-writer/turn tests naming STATE

- [ ] **Step 1: Proofs: before any read the tail carries no READS block; after `getBooking(bk_9)` it carries that one masked answer labeled with its read and age; a stale answer leaves the block; the micro-step sees the same rendering.**
- [ ] **Step 2: Implement — `turn.ts` builds the block from `log.entries()` through the masker; `facts.note`/`facts.tail` deleted with their world-card declarations (world.ts types).**
- [ ] **Step 3: Commit** `feat(core): the turn head renders what was read, never the records`

### Task 7: The port dies

**Files:**
- Modify: `packages/core/src/contract/ports.ts:8` (delete `RecordsPort`), `packages/core/src/run/session.ts`, `packages/core/src/run/turn.ts`, `packages/core/src/engine.ts` (wiring), `packages/core/src/run/call-runner.ts:46` (dep leaves)
- Keep: `packages/core/src/world/patch-desk.ts:67` and `world-builder.ts:78` — the WORLD's own executors still read their records; the engine no longer can.

- [ ] **Step 1: Delete the port and its wiring; `grep -rn "recordsPort\|RecordsPort" packages/` → only world-internal uses remain.**
- [ ] **Step 2: Whole workspace `pnpm build && pnpm test` → engine green (subjects break in their own repos until Task 8 — expected, they are separate repos).**
- [ ] **Step 3: Commit** `feat(core): nothing reaches the world but a tool call`

### Task 8: The five subjects (+ the two arms) migrate

**Files (per repo):**
- `agentspec-bench/subjects/{atlas-c20,atlas-c21,atlas-next}/…` · `harborpoint/subjects/{harborpoint,hp-armon,hp-armoff}/…` · `trialworks/subjects/trialworks/…`

**The molds (one worked example each — apply per occurrence):**

```yaml
# declaration.yaml — 50× onlyAfter → needs (atlas-c20 example)
- name: 'tool:chargeReadsTheDepositBalance'
  acts: [chargeDeposit]
  factory: needs
  args: { read: getDepositBalance, args: { bookingId: bookingId } }
```

```typescript
// cards.ts — the acting-member role gate (24×), declared read paths
{ ...role(['chargeDeposit', /*…*/], {
    read: 'getMember', at: 'member.role', in: ['owner', 'billing'] }),
  name: 'tool:moneyMoveReadsTheRole' },

// cards.ts — an authored precondition reads its own surface's answers
{ ...precondition('cancelBooking', ({ record }) =>
    record !== null && (record as { booking?: { status?: string } }).booking?.status === 'confirmed',
  'Cancel a booking only while the read shows it confirmed.') }

// harborpoint arms — the freeze row reads the last listHolds answer (authored walk:
// the author knows their surface answers { holds: [{ active, scope, vesselId }] })
{ ...precondition(['sellFuel', 'openWorkOrder', 'fileIncident'],
    ({ reads, record }) => {
      const answer = reads.latest('listHolds')?.answer as
        { holds?: readonly { active?: boolean; scope?: string; vesselId?: string }[] } | undefined;
      if (answer?.holds === undefined) return 'the freeze register was not read this conversation';
      const active = answer.holds.filter(h => h.active === true);
      const vesselId = (record as { id?: string } | null)?.id;
      return !active.some(h => h.scope === 'harbor'
        || (h.scope === 'vessel' && h.vesselId === vesselId));
    },
    'A freeze standing over the harbour, or over this vessel, stops new dock work — no fuel sale, no yard job and no incident filing until the hold is lifted.') }
```

- [ ] **Step 1: Per subject: migrate declaration.yaml (emit-owned guards), re-emit where the subject is emitter-born, hand-edit the hand-carried cards; keep the arm's one-line difference.**
- [ ] **Step 2: Per repo: the subject gates (`check-subject`, census, arm-wiring) green.**
- [ ] **Step 3: Commit per repo** `refactor(subjects): needs and the reads log`

### Task 9: Documentation

- [ ] **Blueprint v3: the ports row, the walk drawing's STATE line, the grading rows, the tail section — AS-IS to the ReadsLog truth.**
- [ ] **Tutorial 01/03/04/05: per the spec's §3 table (the state door; needs as the one declaration; the mechanism table rows; `readValidForMs`).**
- [ ] **Source headers: `ports.ts`, `call-runner.ts:1-4`, `status-clerk.ts:1-2`, `disclosure-desk.ts:1-11`, vocabulary comments.**
- [ ] **Sweep: `grep -rn "onlyAfter\|snapshot\|STATE:" docs/ README.md` → rewrite or clear each hit; commit** `docs: the one declaration and the reads log`

### Task 10: The skill (same session as the engine tasks)

- [ ] **`agentspec/skill/references/`: guard-catalog.md (the needs section: read · renames · pick · when; the authored-condition law; the read-it-first refusal), author.md, evals.md, norms.md, resume.md, spec-template.ts — every old-factory naming moves.**
- [ ] **The probe teaching lands where conditions are taught: a condition over an answer is born from a REAL sample — probe the read with the case's own args (and every variant the condition's branches touch: found, not-found, empty list, refusal shape), store the sample beside the declaration, write the condition against it, pin it with a deterministic probe test. A declared output schema is a hint, never verification. Every edge — `undefined`, `null`, empty, not-found, refusal — is handled IN the condition and refuses in words, never throws, never silently allows.**
- [ ] **`references/check-subject.test.ts` parity lists learn `needs`; `pnpm gate` in agentspec green; commit** `docs(skill): the owed read is one declaration`

### Task 11: The escada — 12 then 40, judged, each shown

- [ ] **Step 1: Directed 12 on atlas-c20** (state-guard + needs-chain cases + case 18 + the four: 39, 47, 51, 55) into `subjects/atlas-c20/test/<date>-c6c3-directed12`; judge in session; SHOW the owner.
- [ ] **Step 2: On the owner's word, the 40 stratified rung; judge; SHOW.** Bar: no regression outside the *licensed-from-an-unread-row* class; the NOTE-channel cases priced explicitly.

### Task 12: The FULL RULER — the program's certification (only after the owner sees the 40)

- [ ] **atlas-c20's 100 + harborpoint + trialworks, judged in session; the program closes with the number; then the merge question goes to the owner.**
