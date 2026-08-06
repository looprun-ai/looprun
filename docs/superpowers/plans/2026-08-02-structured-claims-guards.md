# Structured-Claims Guards (SCG) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the guard layer from zero on structured turn-claims: the agent DECLARES its operations (`did: TurnClaim[]`) through one structured terminal (`respond`), the engine cross-checks the declaration against the world ledger it controls, and the user-facing operation report is ENGINE-RENDERED from verified claims — fabrication cannot reach the user.

**Architecture:** Spec `docs/superpowers/specs/2026-08-02-structured-claims-guards-redesign.md` is normative. Engine owns the `TurnClaim`/`CoreOutcome` core, the three cross-check guards, and the did→message renderer; agentspec extends only vocabulary (domain `op` names + domain outcomes that MUST declare a core-outcome mapping). Tier ③ reply-text guards are DELETED with their breaks recorded. A re-chartered red-team certifies by FAILING to break.

**Tech Stack:** TypeScript, vitest + node:test, zod (eval), pnpm workspace. Repos: looprun (engine) + agentspec (skill, separate commits, leak-review law).

## Global Constraints

- **Pre-1.0 law: NO retroactive compatibility.** Old TS bundles, sims, and measured numbers are disposable. Broken tests are REWRITTEN to the new surface or deleted — never shimmed, never skipped.
- **No-regex law:** no guard factory takes a RegExp-typed param (grep-gate `guards-purity.test.ts` stays green). Claim `target` matching uses literal equality/substring over LEDGER VALUES (data the world produced), never authored patterns.
- **No guard reads conversation text except `llmCheck`.** The cross-check guards read `did` × `world.toolCalls`/`observed` — structure, not prose.
- **Engine stays domain-neutral:** zero business strings in `@looprun-ai/core`; domain vocabulary (op names, outcome words, render templates) arrives via spec/contract seams.
- **Prose leak laws:** no raw tool/terminal names in user-delivered text; deny reasons never name `respond` (say "close the turn"/"your final message").
- Surface-lock riders + tutorial outline + guard-catalog parity in the SAME commit as any surface change (`test/guard-catalog-parity.test.ts`, `scripts/gen-guards-chapter.mjs`).
- All suites (`pnpm -C packages/core test`, `-C packages/mastra test`, `-C packages/eval test`) + `pnpm -r typecheck` + `node tests/no-bench-drift.test.mjs` green per commit. Commit per task; **NEVER push**.
- agentspec commits are SEPARATE and end with the explicit leak-review confirmation (no dev-context strings in generated artifacts).
- Progress ledger: append to `.superpowers/sdd/progress.md` with prefix `SCG-T<N>`.

## File Structure (locked)

```
packages/core/src/runtime/claims.ts        NEW  — TurnClaim/CoreOutcome types, outcome resolution,
                                                  claim↔ledger matching, deriveClaimsFromLedger, renderer
packages/core/src/runtime/terminal.ts      MOD  — replyToUser/askUser → ONE `respond` terminal
packages/core/src/runtime/ledger.ts        MOD  — record did/asked; HistoryTurn.did
packages/core/src/runtime/turn.ts          MOD  — finalizeReply over RespondPayload; renderer wiring;
                                                  claims-derived exhaustion closure
packages/core/src/rules.ts                 MOD  — GuardCtx.did/asked; HistoryTurn.did
packages/core/src/guards/claims.ts         NEW  — claimIsGrounded, claimIsComplete, claimCoversRubric
packages/core/src/guards/reply.ts          MOD  — DELETE replyMentions/replySingleQuestion/
                                                  replyMaxOccurrences/emptyReply; keep degenerationGuard
                                                  (message-artifact lint) + jargonScrub (mutator)
packages/core/src/guards/confirmation.ts   MOD  — re-key askUser → isAskEvent(respond{asked:true})
packages/core/src/guards/structural.ts     MOD  — askedEarlier re-keyed the same way
packages/core/src/guards/catalog.ts        MOD  — catalog rows; FORM/TRUTH sets in turn.ts
packages/mastra/src/{tools,hooks,run-conversation,compile}.ts  MOD — respond wiring, redrive returns payload
packages/vercel/, packages/server/, packages/models/           MOD — same terminal re-wiring where they name terminals
packages/eval/src/norms-config.ts          MOD  — +claimCoversRubric kind, +outcome-map block; deleted kinds removed
packages/core/test/redteam/                MOD  — batches a–d re-run against the new surface + new adversaries
docs/GUARDS.md (canonical: packages/core/GUARDS.md if that is its path — locate at T5), generated ch04, outline riders
agentspec repo: guard-catalog.md, templates, norms — separate task
```

---

### Task 1: Core claims module + the `respond` terminal

**Files:**
- Create: `packages/core/src/runtime/claims.ts`
- Modify: `packages/core/src/runtime/terminal.ts`
- Test: `packages/core/test/claims-core.test.ts` (new), update `packages/core/test/**` that reference `replyToUser`/`askUser` terminal defs

**Interfaces (Produces — later tasks rely on these exact names):**

```ts
// claims.ts
export type CoreOutcome =
  | 'success' | 'failure' | 'not_found' | 'blocked' | 'refused'
  | 'pending_confirmation' | 'no_op';
export const CORE_OUTCOMES: readonly CoreOutcome[];

export interface TurnClaim {
  op: string;              // advisory label — NEVER carries check semantics
  target?: string;         // entity label/id the op acted on
  outcome: string;         // a CoreOutcome, or a domain outcome declared in the OutcomeMap
  amount?: number;
}

/** Domain outcome vocabulary: every non-core outcome MUST map to a CoreOutcome. */
export type OutcomeMap = Readonly<Record<string, CoreOutcome>>;

/** Resolve an outcome word to its core meaning; null = undeclared (a violation by construction). */
export function resolveOutcome(outcome: string, map?: OutcomeMap): CoreOutcome | null;

/** Structural validation of a raw `did` value (shape only — grounding is the guards' job). */
export function validateClaims(did: unknown): { claims: TurnClaim[]; errors: string[] };

/** True when this observed call is the ASK event (respond with asked:true). */
export function isAskEvent(o: { name: string; args?: Record<string, unknown> }): boolean;

/** The payload one `respond` call carries. */
export interface RespondPayload { message: string; did: TurnClaim[]; asked: boolean }
export function respondPayload(args: Record<string, unknown>): RespondPayload; // tolerant extraction
```

- [ ] **Step 1: Write failing tests** in `packages/core/test/claims-core.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveOutcome, validateClaims, isAskEvent, respondPayload, CORE_OUTCOMES } from '../src/runtime/claims.js';

test('core outcomes resolve to themselves without a map', () => {
  for (const o of CORE_OUTCOMES) assert.equal(resolveOutcome(o, undefined), o);
});
test('domain outcome resolves through the map; undeclared resolves to null', () => {
  assert.equal(resolveOutcome('settled', { settled: 'success' }), 'success');
  assert.equal(resolveOutcome('settled', undefined), null);
  assert.equal(resolveOutcome('vanished', { settled: 'success' }), null);
});
test('a domain word may not shadow a core outcome', () => {
  // map entry keyed by a core outcome is ignored: core meaning wins
  assert.equal(resolveOutcome('success', { success: 'refused' as const }), 'success');
});
test('validateClaims: non-array, non-object items, wrong field types, empty op are ERRORS', () => {
  assert.ok(validateClaims('nope').errors.length);
  assert.ok(validateClaims([null]).errors.length);
  assert.ok(validateClaims([{ op: '', outcome: 'success' }]).errors.length);
  assert.ok(validateClaims([{ op: 'cancel', outcome: 42 }]).errors.length);
  assert.ok(validateClaims([{ op: 'cancel', outcome: 'success', amount: 'big' }]).errors.length);
});
test('validateClaims: [] is VALID (a read-only/ask turn did nothing)', () => {
  assert.deepEqual(validateClaims([]), { claims: [], errors: [] });
});
test('isAskEvent keys on respond+asked:true only', () => {
  assert.ok(isAskEvent({ name: 'respond', args: { asked: true } }));
  assert.ok(!isAskEvent({ name: 'respond', args: {} }));
  assert.ok(!isAskEvent({ name: 'askUser', args: {} })); // the old terminal is DEAD
});
```

Strictness law (red-team batches a/b: `typeof`/`trim` guesses broke arg guards): `validateClaims` uses exhaustive typed checks — string fields must be `typeof === 'string'` AND non-empty after trim; `amount` must be a finite number; unknown extra keys on a claim are an error.

- [ ] **Step 2: Run tests, verify FAIL** (`pnpm -C packages/core test -- claims-core`), then implement `claims.ts`.

- [ ] **Step 3: Rewrite `terminal.ts` — ONE terminal `respond`:**
  - `TERMINAL_TOOLS = ['respond']`; `isTerminal` unchanged in shape.
  - Tool schema: `message` (string, minLength 1, "the COMPLETE user-facing prose in the USER'S language — explanation and answers ONLY; NEVER assert an operation you performed here, operations go in did"), `did` (array of `{op, target?, outcome, amount?}`, required — `[]` when no operations), `asked` (boolean, optional — true when `message` poses your ONE clarifying question and you will wait for the answer). `additionalProperties: false` at both levels.
  - The tool `description` + `TERMINAL_PROTOCOL` prose teach: every turn ends with exactly one `respond`; each DOMAIN operation attempted this turn gets one `did` entry with its honest outcome; results you only READ are not `did` entries unless the user asked for that lookup (then outcome `success`/`not_found`); never claim an operation the tools did not confirm.
  - `forcedTerminalPrompt` re-written for `respond` (reply-only variant: `asked` must stay false).
  - `prematureTerminalTools` unchanged in logic (respond sharing a step with a domain call still invalidates).
  - `supersededTerminalCalls` simplifies: multiple `respond` calls in one step → all but the delivered one (last with non-empty `message`) are pruned. Key on `args.message` now, not `args.text`.
  - `normalizeTerminalToolDef` / `terminalToolDefs` follow the one-contract shape.
- [ ] **Step 4: Fix every core test that referenced `replyToUser`/`askUser`** — REWRITE to `respond` (asked:true where the old test used askUser). No skips. Run `pnpm -C packages/core test`; expect green except suites owned by later tasks (list them in the report if any fail for later-task reasons — they should not: core compiles as a unit, so ledger/turn call-sites must be minimally re-keyed HERE to keep the package green; keep those edits mechanical, the behavioral rewrite is T2/T4).
- [ ] **Step 5: Commit** `feat!(core): structured respond terminal + TurnClaim/CoreOutcome core (SCG-T1)`.

### Task 2: Ledger + GuardCtx plumbing — claims become first-class turn state

**Files:**
- Modify: `packages/core/src/runtime/ledger.ts`, `packages/core/src/rules.ts`
- Test: `packages/core/test/claims-ledger.test.ts` (new)

**Interfaces:**
- Consumes: `RespondPayload`, `respondPayload`, `validateClaims`, `isAskEvent` from T1.
- Produces: `TurnLedger.did: TurnClaim[]` + `TurnLedger.asked: boolean` (the CURRENT turn's delivered declaration, set when the delivered respond is chosen); `GuardCtx.did?: TurnClaim[]`, `GuardCtx.asked?: boolean` (populated for onReply/postTool ctx); `HistoryTurn.did: ReadonlyArray<TurnClaim>`; `recordTurnHistory` stores the VERIFIED claims (post-cross-check, as delivered).

- [ ] **Step 1: Failing tests:** a respond call recorded via `recordTerminalCall` surfaces `did`/`asked` on the ledger; `beginTurn` resets them; `recordTurnHistory` freezes claims into `history[n].did`; onReply GuardCtx built by `finalizeReply`'s check path carries `did`/`asked` (assert via a simulate guard capturing its ctx).
- [ ] **Step 2: Implement.** `observed` keeps respond entries exactly as terminals are kept today (ok:true, args intact) so `isAskEvent` works over `observed` — the pruning of superseded responds keeps working via T1's rewrite.
- [ ] **Step 3: All core suites green; commit** `feat(core): claims in the turn ledger + GuardCtx.did/asked + history (SCG-T2)`.

### Task 3: The cross-check guards — the deterministic honesty core

**Files:**
- Create: `packages/core/src/guards/claims.ts`
- Modify: `packages/core/src/guards/index.ts`, `packages/core/src/guards/catalog.ts`, `packages/core/src/spec.ts` (auto-install), `packages/core/src/runtime/turn.ts` (TRUTH set)
- Test: `packages/core/test/claims-guards.test.ts` (new)

**Interfaces:**
- Consumes: `resolveOutcome`, `TurnClaim`, `OutcomeMap` (T1); `GuardCtx.did` (T2); `DomainContract.writeTools: readonly string[]` (exists — verify name at implementation, it is what `buildHonestAbstain` consumes; thread it into the factories).
- Produces (exact factories):

```ts
claimIsGrounded(opts: { writeTools: readonly string[]; outcomes?: OutcomeMap }): Guard  // onReply, dim 'behavior'
claimIsComplete(opts: { writeTools: readonly string[] }): Guard                          // onReply, dim 'behavior'
claimCoversRubric(opts: { targets: string[]; outcome: CoreOutcome | 'any' }, reason: string): Guard // onReply
```

**Check semantics (the spec's table, made exact — this is the heart of the plan):**

Let `calls` = `ctx.observed` entries of THIS turn that are domain tools (not terminals), `writes` = those whose name ∈ writeTools, `attempts` = this turn's guard-vetoed attempts (from `ctx.notes`/ledger veto records — expose vetoed attempts on GuardCtx if not already readable: add `attemptedThisTurn: ReadonlyArray<{name: string; args: unknown}>` to GuardCtx in this task, populated from the ledger's veto record). `matches(claim, call)` = claim.target is undefined, OR the target string appears (case-insensitive literal equality or substring) in the canonicalized `call.args` values or `call.result` values — values are LEDGER DATA, never authored patterns.

`claimIsGrounded` — for each claim, resolve outcome via the map; then:
| resolved | grounded iff |
|---|---|
| (null — undeclared word) | NEVER — violation names the undeclared outcome |
| `success` | ∃ write in `calls` with `tookEffect === true` and `matches` |
| `failure` | ∃ call in `calls` with `ok === false` and `matches` |
| `blocked` / `refused` | ∃ vetoed attempt in `attempts` with `matches`, OR ∃ call with `ok === false` and `matches` (world refusals count) |
| `not_found` | ∃ read (non-write) in `calls`, ok, whose result is empty (`null`/`undefined`/`[]`/`{}`/`{success:true, data:[]}`-style: empty = no non-empty array and no truthy record fields besides booleans/status — implement as one small `isEmptyReadResult(result)` helper with exhaustive unit tests) and `matches` |
| `pending_confirmation` | ∃ call in `calls` with `resultFlags?.requiresConfirmation === true` and `matches` |
| `no_op` | NO write in `calls` with `tookEffect === true` and `matches` |

`claimIsComplete` — every write in `calls` with `tookEffect === true` must be covered by ≥1 claim whose resolved outcome is `success` and which `matches` it. Violation names the unclaimed tool by its produced label when available (`ctx.producedThisTurn`), else says "an action you did not report".

`claimCoversRubric` — every configured `target` must appear in `ctx.did` with resolved outcome === configured `outcome` (or any outcome when `'any'`). This replaces replyMentions: polarity is a FIELD, so "Não encontrei BK-1" can never satisfy a `success` requirement again.

- [ ] **Step 1: Failing tests — one block per table row above,** plus: fabricated success (claim success, no write) → violation; hidden write (write took effect, no claim) → claimIsComplete violation; honest not_found on empty read → NO violation; simulate (`tookEffect:false` write) + `no_op` claim → NO violation; domain outcome `'settled'→'success'` grounds against a write; undeclared domain word → violation; rubric polarity: claim `{target:'BK-1', outcome:'not_found'}` FAILS a rubric requiring `success` and PASSES one requiring `not_found`.
- [ ] **Step 2: Implement.** All three are TRUTH guards: add their kinds to `TRUTH_GUARD_KINDS` in turn.ts (never salvaged over, never delivered over).
- [ ] **Step 3: Auto-install** `claimIsGrounded` + `claimIsComplete` in the spec class where `noDuplicateCall`/`emptyReply`-class always-on guards are installed today (find the site in `spec.ts` — the outline calls it the auto-installed set), fed by the contract's writeTools + the spec's outcome map (add `outcomes?: OutcomeMap` to the spec/contract seam — pick the seam where `writeTools` already lives so both arrive together; document the choice in the task report). `claimCoversRubric` is config-bound only (per-case norms), never auto-installed.
- [ ] **Step 4: Catalog entries** for the three kinds (category `'honesty'` — the section is repopulated, deterministically this time); parity test green; regenerate ch04.
- [ ] **Step 5: Commit** `feat(core): claim cross-check guards — grounded/complete/coversRubric over the world ledger (SCG-T3)`.

### Task 4: The did→message renderer + finalizeReply over RespondPayload

**Files:**
- Modify: `packages/core/src/runtime/claims.ts` (renderer), `packages/core/src/runtime/turn.ts`, `packages/core/src/trunk.ts` (DomainContract seam)
- Test: `packages/core/test/claims-render.test.ts` (new), update `packages/core/test/**` finalizeReply suites

**Interfaces:**
- Produces:

```ts
// claims.ts
export interface RenderOpts { renderClaim?: (c: TurnClaim, core: CoreOutcome) => string; outcomes?: OutcomeMap }
export function renderOperationReport(did: TurnClaim[], opts?: RenderOpts): string;
export function deriveClaimsFromLedger(observed: ObservedCall[], turnIndex: number, writeTools: readonly string[], produced: string[]): TurnClaim[];
// turn.ts — the redrive callback now returns a payload, not a string:
finalizeReply(spec, contract, world, ledger, initial: RespondPayload,
  redrive: (message: string) => Promise<RespondPayload>, maxRedrives): Promise<FinalizedReply>
```

- `DomainContract` gains optional `renderClaim` (+ `outcomes` if T3 seated the map here) — the domain's wording (and language) for one verified claim; engine default is a neutral English line per core outcome (e.g. success → `"${target ?? op}: done"`, not_found → `"${target ?? op}: no record found"`, pending_confirmation → `"${target ?? op}: awaiting your confirmation"`). No tool names, no the-word-`respond`, ever.
- **Delivery composition:** delivered text = `message` when `did` is empty; else `message + '\n\n' + renderOperationReport(verifiedDid)`. The mutators (jargonScrub) apply to `message` only; onReply checks run BEFORE composition against the payload (claims guards read `ctx.did`; degenerationGuard reads `ctx.reply` = message).
- **Redrive:** violations (claims + llmCheck + postTool) feed the same bounded no-tools redrive; the backend's redrive re-generates one `respond` payload (message + did + asked) with the correction appended. The model can FIX its declaration; the ledger cannot be argued with.
- **Exhaustion closure (replaces `defaultExhaustionReply`/`buildHonestAbstain`):** when redrives exhaust, the engine DERIVES the true claims itself — `deriveClaimsFromLedger` maps each this-turn domain call to a claim (write+tookEffect→success with produced label as target; write ok:false→failure; requiresConfirmation→pending_confirmation; reads contribute nothing) — and delivers `renderOperationReport(derived)` + one engine sentence ("I could not safely finish the rest — how would you like to proceed?" / nothing-landed variant). This CLOSES the "Abstain tool-name leak" backlog row: produced labels, never tool names; a name with no produced label renders as a generic "one action completed".
- **Salvage:** re-keyed to the last ok `respond` observation; the salvage candidate is its full payload re-validated by the same checks (claims guards included — a fabricated did is never salvaged; that is the point of the redesign).
- [ ] **Step 1: Failing tests:** composition (empty did → message alone; non-empty → message+report); renderer never emits a tool name (feed claims derived from a ledger whose produced labels differ from tool names; assert no tool name in output); exhaustion path delivers ledger-derived truth (simulate-only turn → "nothing was changed" shape, no fabricated success); redrive receives correction text and its returned payload is re-checked; salvage rejects a payload whose did fails claimIsGrounded.
- [ ] **Step 2: Implement; rewrite the existing finalizeReply/exhaustion/salvage tests to the payload surface.** All core suites green.
- [ ] **Step 3: Commit** `feat!(core): engine-rendered operation report + claims-derived exhaustion closure (SCG-T4)`.

### Task 5: Tier ① re-key + tier ③ deletion + docs

**Files:**
- Modify: `guards/confirmation.ts`, `guards/structural.ts`, `guards/reply.ts`, `guards/index.ts`, `guards/catalog.ts`, `runtime/turn.ts` (FORM set), GUARDS.md + generated ch04 + outline riders
- Test: rewrite `packages/core/test/**` for the four deleted kinds; confirmation/structural proofs re-keyed

- [ ] **Step 1: Re-key the ask signal** everywhere `name === 'askUser'` is read: `confirmFirst` (via 'ask'/'either' variants), `noActAfterAskSameTurn`, `pendingConfirmMustAsk` (relay = an ok ask-event this turn, i.e. delivered respond with asked:true — note the delivered respond lands at turn END; the guard runs onReply, so the structural relay signal is `ctx.asked === true` from T2, not an observed mid-turn call — implement via ctx.asked with the observed-scan as fallback for chain/mid-turn contexts), `askedEarlier` (earlier-turn ask = `history[k].did`? NO — earlier-turn ask = some history turn where the delivered respond had asked:true; add `HistoryTurn.asked: boolean` in this task, one-line T2 extension). Use `isAskEvent` for observed scans; never string-match 'askUser' again (grep the tree to zero).
- [ ] **Step 2: DELETE** `replyMentions`, `replySingleQuestion`, `replyMaxOccurrences`, `emptyReply` (subsumed: `message` minLength 1 in the respond schema + the forced-terminal fallback guarantee). Each deletion gets a one-line RECORD in the catalog's tombstone comment naming the red-team break that justified it (replyMentions: polarity blindness "Não encontrei BK-1"; replySingleQuestion/replyMaxOccurrences: punctuation/CTA literalism, batch-c; emptyReply: zero-width break, batch-a). `degenerationGuard` STAYS (message-artifact lint, batch-independent) and `jargonScrub` STAYS (mutator). Purge `FORM_GUARD_KINDS` of deleted kinds; `claimCoversRubric` is TRUTH (already in T3).
- [ ] **Step 3: Rewrite/delete their tests; catalog parity + ch04 regen + GUARDS.md rewrite** (the honesty section returns as the cross-check trio; consent story re-worded: relay checkpoint ③ is now `asked`-structural). All core suites + typecheck green.
- [ ] **Step 4: Commit** `feat!(core): tier-③ reply-text guards deleted (breaks recorded); ask signal re-keyed to respond.asked (SCG-T5)`.

### Task 6: Backends + eval package

**Files:**
- Modify: `packages/mastra/src/{tools,hooks,run-conversation,compile,agent-construction}.ts`, `packages/vercel/**`, `packages/server/**`, `packages/models/**` (grep `replyToUser|askUser|text` at terminal seams), `packages/eval/src/{norms-config,lint-spec-quality,ungoverned,validate}.ts`
- Test: mastra suite rewritten to the payload surface; eval config-kind tests

- [ ] **Step 1: Backends.** Terminal tool registration ships the one `respond` def; the delivered-reply extraction reads `message`/`did`/`asked` via `respondPayload`; the redrive implementation re-generates ONE respond (tools disabled except respond, `toolChoice` pinned) and returns the payload; forced-terminal fallback likewise. The ungoverned variant (eval `ungoverned.ts`) keeps the FULL byte-identical prompt with enforcement disarmed — verify it still compiles the respond schema (structure stays; only enforcement is off), per the prose-only design.
- [ ] **Step 2: Eval config surface** (`norms-config.ts`): add `claimCoversRubric` kind `{ kind, id, targets: string[].min(1), outcome: enum(core outcomes + 'any'), reason: string }` `.strict()`; REMOVE `replyMentions`-class kinds and any deleted-kind rows; add the spec-level `outcomes` map block (`Record<string, coreOutcome enum>`) that loads into the T3 seam; lints follow (Q-rules that referenced deleted kinds re-point or drop — each named in the report).
- [ ] **Step 3: All three package suites + `pnpm -r typecheck` + no-bench-drift green. Commit** `feat!: respond payload through mastra/vercel/server + eval claim vocabulary (SCG-T6)`.

### Task 7: agentspec — vocabulary extension + rewrite (SEPARATE REPO, leak-review law)

**Files (in `~/Dev/js/looprun/agentspec`):** guard-catalog.md, authoring norms/laws, generator templates, R1 red-team charter refs — locate via the repo's own index; commits stay in agentspec.

- [ ] **Step 1:** Rewrite the guard catalog to the new surface: the cross-check trio + tier ① kinds + llmCheck + custom; deleted kinds removed with their replacement named ("reply coverage → claimCoversRubric over `did`"). Document the MAPPING LAW verbatim: *every domain outcome DECLARES its core outcome (`'settled' → 'success'`); domain adds words, never a way to escape the ledger.* Templates generate the outcome map beside writeTools; norms teach `did` authoring (one claim per attempted operation, honest outcomes, reads only when the user asked for the lookup).
- [ ] **Step 2:** R1 charter re-scope: the red-team hunts (a) claims that can pass ungrounded, (b) effected writes that can hide from `did`, (c) rubric polarity escapes — text-scanning findings are extinct by construction.
- [ ] **Step 3:** Leak-review over every touched artifact (no "SCG", no bench/session vocabulary, no engine-internal names in generated-facing text) — end the report with the explicit leak-review confirmation. Commit in agentspec: `feat!: structured-claims guard vocabulary — outcome mapping law, catalog + norms rewrite`.

### Task 8: The re-chartered red-team (the certification is the failure to break)

**Files:** `packages/core/test/redteam/` — batches a–d REWRITTEN as permanent regression against the new surface + new adversarial batches; `docs/superpowers/specs/2026-08-02-structured-claims-guards-redesign.md` appendix (or a sibling `…-redteam-verdicts.md`) with per-guard impossibility statements.

- [ ] **Step 1:** Re-run every batch a–d vector against the new surface as REAL tests (value-shape attacks on `validateClaims`/claim fields; consent cluster attacks on the re-keyed ask signal; the replyMentions polarity case proving `claimCoversRubric` closes it; D2/D4/D5 runtime compositions). Each lands as a permanent named test.
- [ ] **Step 2:** Dispatch independent adversary reviews (one per cluster: claims-core/grounding table, completeness/hiding, rubric/polarity+renderer, terminal/runtime composition) with the charter: *prove a forbidden thing passes; run to exhaustion; "unbreakable only by removing ambiguity X" is a finding.* Every confirmed break → failing test → fix → test stays.
- [ ] **Step 3:** Write the per-guard verdicts doc: for each shipped guard, the adversary's "could not break, and here is why it is structurally impossible" statement OR the recorded break+fix. A guard with neither does not ship (delete it — user law).
- [ ] **Step 4:** Commit `test(redteam): structured-claims adversarial regression + per-guard impossibility verdicts (SCG-T8)`.

### Final: whole-branch review (most capable model) over `scripts/review-package <SCG-T1 base> HEAD` + docs sweep (roadmap/GUARDS/backlog rows: close "Abstain tool-name leak", "pendingConfirmMustAsk regex-branch" if still open). ONE fix subagent for the full findings list.

## Self-review notes

- Spec §core→T1/T2, §cross-check table→T3 (made row-exact here), §renderer→T4, §three-tier→T5, §layering→T3 seam+T7, §red-team→T8, deliverable 4 phases map 1:1.
- Leaf decisions this plan locks (flag to user only if contested in review): ONE `respond` terminal (spec's literal shape) replacing the replyToUser/askUser pair; ask = `asked:true` field; outcome map + renderClaim seated beside `writeTools` on the contract seam; `claimCoversRubric` config-only.
- Risk center = T4 (finalizeReply blast radius) and T6 (backend surface) — their reviewers must verify tests were rewritten, not weakened.
