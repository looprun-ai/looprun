# Mandatory Intention + Red-team Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two paradigm red-team findings (P1 free-prose fabrication, P2 bare `asked`) by making every `respond` declare ≥1 intention (`did` `.min(1)`), partitioning intention ops into engine speech-ops vs domain action-ops, replacing the `asked` boolean with an `ask` intention, and specifying the op vocabulary (esp. the `inform` guardrail) in the tool + prompt — then fold in the nine mechanical red-team fixes (M1–M9), each PoC becoming permanent regression.

**Architecture:** Spec `docs/superpowers/specs/2026-08-03-mandatory-intention-design.md` is normative (extends `2026-08-02-structured-claims-guards-redesign.md`). Builds on the shipped SCG branch `scg-structured-claims-guards`. Engine owns the speech-op vocabulary + partition + cross-check-on-action-intents; the honesty guarantee is deterministic for real actions and a forcing-function-plus-`llmCheck` for prose.

**Tech Stack:** TypeScript, vitest + node:test, zod (eval), pnpm workspace. Repos: looprun (engine) + agentspec (skill, separate commits, leak-review law).

## Global Constraints

- **Pre-1.0 law: NO retroactive compatibility.** Broken tests are REWRITTEN to the new surface or deleted — never shimmed, never skipped.
- **No-regex law:** no guard factory takes a RegExp-typed param (grep-gate `guards-purity.test.ts` green). Target matching is whole-value / token-boundary equality over ACTION HISTORY-issued values (never authored patterns, never agent-authored args).
- **Engine domain-neutral:** the four speech-op names (`inform`/`greet`/`refuse`/`ask`) are the ONLY op vocabulary in core; all action ops arrive via spec/contract. Zero business strings in `@looprun-ai/core`.
- **Prose leak laws:** no raw tool/terminal names in user-delivered text; deny/protocol prose the user could see never names `respond`. Model-facing protocol prose MAY name `respond`/`did`/`inform` (it is instruction).
- **The honesty guarantee is precise:** real actions are deterministically un-hideable/un-fabricable; the prose-misuse residual is addressed by the forcing function + an OPTIONAL `did × message` `llmCheck` (D6) — never claim prose lies are deterministically blocked.
- Surface-lock riders + tutorial outline + guard-catalog parity in the SAME commit as any surface change.
- All suites (`core`/`mastra`/`eval`/`server`/`models`) + `pnpm -r typecheck` + `node tests/no-bench-drift.test.mjs` green per commit. Commit per task; **NEVER push**; NEVER `pnpm release`.
- agentspec commits are SEPARATE and end with the explicit leak-review confirmation.
- Progress action history: append to `.superpowers/sdd/progress.md` with prefix `MI-T<N>`.
- The red-team PoCs already on disk (`packages/core/test/redteam/redteam-{grounding,completeness,consent,shape}.test.ts`) encode the breaks as FAILING assertions. Converting each to a passing regression (guard now denies) is the acceptance signal for the matching M-fix — never delete a PoC without its fix landing.

## File Structure (locked)

```
packages/core/src/runtime/claims.ts     MOD — Intention type; SPEECH_OPS const + isSpeechOp/isActionOp;
                                               validateClaims .min(1) + speech/action shape; isAskEvent
                                               keys on an ask intent; deriveClaimsFromActionHistory (M5/M6);
                                               isEmptyReadResult (M4); renderer (action intents only)
packages/core/src/runtime/terminal.ts   MOD — respond schema: did minLength 1, asked field REMOVED;
                                               protocol prose enumerates ops + inform guardrail (D4);
                                               prematureTerminalCalls(steps) helper (M8)
packages/core/src/guards/honesty.ts      MOD — matches() boundary equality + drop args scan (M1/M2);
                                               claimIsGrounded/Complete over action intents; target-defined
                                               + injective coverage (M3); resolveOutcome shadow (m10)
packages/core/src/guards/confirmation.ts MOD — ask signal = ask intent (D3); pendingConfirmMustAsk ctx
                                               authoritative (M8); destructiveThrottle tookEffect (M7)
packages/core/src/guards/structural.ts   MOD — askedEarlier keys on HistoryTurn ask intent
packages/core/src/runtime/turn.ts        MOD — ctx ask-intent plumbing; blank floor category strip (M9);
                                               TRUTH/FORM sets; delivery composition
packages/core/src/runtime/action-history.ts      MOD — asked→ask-intent; HistoryTurn shape; prune premature (M8 seam)
packages/core/src/rules.ts               MOD — GuardCtx/HistoryTurn: asked→ask-intent representation
packages/core/src/guards/{catalog,llm-check}.ts MOD — did×message consistency llmCheck rubric (D6); catalog
packages/mastra|vercel|server            MOD — respond schema (did.min(1), no asked), premature prune (M8)
packages/eval/src/norms-config.ts        MOD — did×message llmCheck config availability; ask/outcome kinds
packages/core/test/redteam/*             MOD — the 4 PoC files → passing regression as each M-fix lands
agentspec repo                           — intention vocabulary + inform guardrail + ask structure; R1; leak
```

---

### Task 1: Mandatory `did` + the intention partition (core types + schema + prompt)

**Files:** `runtime/claims.ts`, `runtime/terminal.ts`; tests `test/claims-core.test.ts` (extend), `test/redteam/redteam-shape.test.ts` (the did-shape PoCs → regression).

**Interfaces (Produces):**
```ts
export const SPEECH_OPS = ['inform', 'greet', 'refuse', 'ask'] as const;
export type SpeechOp = typeof SPEECH_OPS[number];
export function isSpeechOp(op: string): op is SpeechOp;
export function isActionOp(op: string): boolean;      // = !isSpeechOp(op)
export interface Intention { op: string; target?: string; outcome?: string; amount?: number }
// validateClaims: did MUST be a non-empty array; each item a valid Intention;
//   an ACTION op REQUIRES a non-empty outcome; a SPEECH op MUST NOT carry outcome/amount.
export interface RespondPayload { message: string; did: Intention[] }   // `asked` REMOVED
export function hasAskIntent(did: Intention[]): boolean;                 // did.some(i => i.op === 'ask')
```

- [ ] **Step 1: Failing tests** — `validateClaims([])` is an ERROR (was valid); a single `{op:'greet'}` is VALID; `{op:'inform', outcome:'success'}` is an ERROR (speech op must not carry outcome); `{op:'refund'}` (action op, no outcome) is an ERROR; `{op:'refund', outcome:'success'}` VALID; `hasAskIntent([{op:'ask'}])` true, `hasAskIntent([{op:'greet'}])` false; the respond tool schema declares `did` minLength 1 and NO `asked` property. Re-point the redteam-shape did-shape vectors to assert the new strictness.
- [ ] **Step 2:** Run, see fail; implement `SPEECH_OPS`/`isSpeechOp`/`isActionOp`/`hasAskIntent`; `validateClaims` mandatory-non-empty + speech/action shape rules; `RespondPayload` drops `asked`; `respondPayload` extracts did only (no asked). Terminal schema: `did` items required `[op]` (outcome conditionally required is enforced in validateClaims, not JSON-schema), `minItems: 1`, `asked` removed.
- [ ] **Step 3: Protocol prose (D4)** in `terminal.ts`: enumerate the op families with one worked line each; the `inform` guardrail VERBATIM from the design D4 ("MUST NOT be used to assert that you performed an action … reporting a done action as inform is dishonest"). `forcedTerminalPrompt` updated (a closing respond still needs ≥1 intention; the reply-only variant uses `greet`/`inform`/`refuse`, never `ask`).
- [ ] **Step 4:** Full core suite green (later-task guard/action history sites re-keyed minimally to compile — asked→ask-intent is Task 2's behavioral job, but core must compile; keep mechanical). Commit `feat!(core): mandatory did (.min(1)) + speech/action intention partition + op prompt spec (MI-T1)`.

### Task 2: `ask` intention replaces `asked`; consent guards re-key; premature prune (P2 + M8)

**Files:** `runtime/action-history.ts`, `rules.ts`, `runtime/terminal.ts` (prematureTerminalCalls), `runtime/turn.ts`, `guards/confirmation.ts`, `guards/structural.ts`, mastra `agent.ts`/`run-conversation.ts` premature branch; tests `test/redteam/redteam-consent.test.ts` (→ regression), confirmation/structural suites.

**Interfaces:** Consumes `hasAskIntent`, `isAskEvent` (T1). Produces: `TurnActionHistory` carries the delivered turn's `did` (ask-intent derivable) — the `asked: boolean` field is removed; `HistoryTurn.did` already exists (SCG-T2), so `HistoryTurn.asked` is DELETED and readers use `hasAskIntent(turn.did)`; `GuardCtx` exposes the current turn's ask via `hasAskIntent(ctx.did)` (ctx.did populated onReply). `prematureTerminalCalls(steps): Array<{name,args}>` mirrors `supersededTerminalCalls`.

- [ ] **Step 1: Failing tests** — the redteam-consent GHOST-ASK vector (M8): a premature `respond` carrying an ask intent must be PRUNED from `observed`, so next-turn `confirmFirst` does NOT license (the PoC asserts the secure denial). `pendingConfirmMustAsk`: relay satisfied iff the delivered turn's `did` has an ask intent (`ctx`), NOT a stale observed entry. `askedEarlier`: an earlier HistoryTurn with an ask intent licenses; same-turn does not; a fake/ghost ask does not survive. `confirmFirst` via ask/either keyed on ask intents.
- [ ] **Step 2:** Implement. `pruneSupersededTerminals(action history, prematureTerminalCalls(steps))` in BOTH backends' premature branch. `pendingConfirmMustAsk` uses `hasAskIntent(ctx.did)` authoritatively when ctx.did is defined; observed-scan fallback only for the chain/mid-turn window and reads ask intents, never the removed `asked`. Every `name==='askUser'`/`args.asked` reader tree-wide re-keyed (grep to zero).
- [ ] **Step 3:** Core + confirmation/structural suites green; the consent PoCs flip to passing regression. Commit `feat!(core): ask-intent replaces asked; consent guards + premature-ask prune (MI-T2 / P2 / M8)`.

### Task 3: honesty cross-check on action intents + matching hardening (M1/M2/M3/m10)

**Files:** `guards/honesty.ts`, `runtime/claims.ts` (resolveOutcome m10); tests `test/claims-guards.test.ts`, `test/redteam/redteam-grounding.test.ts` (→ regression).

**Interfaces:** `matches(claim, call)` grounds `claim.target` ONLY against world-issued result/identity values (drop `leafValues(c.args)`) using whole-value / token-boundary equality (split canonicalized values on non-alphanumerics; require a whole-token or whole-value equal — no substring). `claimIsGrounded`/`claimIsComplete` iterate ACTION intents only (skip speech intents). `claimIsComplete` coverage requires `claim.target !== undefined` and spends each matching claim once (occurrence, not existence).

- [ ] **Step 1: Failing tests** = the redteam-grounding + redteam-completeness vectors as SECURE assertions: `ORD-2` claim does NOT ground/cover an `ORD-25` write (M1); a target stuffed into a decoy write's free-text arg does NOT ground (M2); a target-less action intent does NOT satisfy completeness (M3); two writes to the same target need two claims (injective); `claimCoversRubric` `BK-1` NOT satisfied by a `BK-10` claim (M1); `resolveOutcome('Success', {Success:'failure'})` — a core-word case-variant map key is REJECTED at spec-load (m10). Speech intents don't trigger grounding.
- [ ] **Step 2:** Implement; each break-PoC flips green. `matches` boundary equality is the risk center — unit-test the tokenizer (id `BK-1` vs `BK-10` vs `xBK-1y` vs exact).
- [ ] **Step 3:** Core suite green; commit `feat!(core): matching by value/token equality, action-intent grounding, injective completeness (MI-T3 / M1-M3, m10)`.

### Task 4: renderer/derivation + throttle + blank-floor + llmCheck backstop (M4/M5/M6/M7/M9/D6)

**Files:** `runtime/claims.ts` (deriveClaimsFromActionHistory, isEmptyReadResult, renderer), `runtime/turn.ts` (blank floor), `guards/confirmation.ts` (destructiveThrottle), `guards/llm-check.ts`+`guards/catalog.ts`+`eval/norms-config.ts` (D6); tests `test/claims-render.test.ts`, `test/redteam/redteam-{completeness,consent,shape}.test.ts` (→ regression).

- [ ] **Step 1: Failing tests** — `isEmptyReadResult({message:{booking:'BK-1'}})` is FALSE (a record under a status key is NOT empty — M4); `deriveClaimsFromActionHistory` attaches each produced label to its own call, a read's label does not shift a write's target (M5), and an effected write carrying requiresConfirmation derives as success not pending (M6); `destructiveThrottle` counts two `confirmed:false` writes that took effect as TWO effects (M7); `isBlankDelivery` treats U+2063/2062/2064/180E/3164 as blank (M9); the D6 `did×message` llmCheck rubric exists as a config-available kind (fake adjudicator: message asserting an op absent from did → deny; consistent → allow), NOT auto-installed.
- [ ] **Step 2:** Implement; PoCs flip green. `isEmptyReadResult`: only skip a status key whose value is scalar/boolean. Blank floor: category strip (Cf + default-ignorable) before trim.
- [ ] **Step 3:** Core suite green; commit `feat!(core): derivation/throttle/blank-floor fixes + did×message llmCheck (MI-T4 / M4-M7,M9,D6)`.

### Task 5: backends + eval to the mandatory-intention surface

**Files:** `packages/mastra|vercel|server|models` terminal seams; `packages/eval/src/{norms-config,ungoverned,lint*}.ts`; mastra tests.

- [ ] **Step 1:** Backends ship the `respond` schema with `did` minLength 1 and no `asked`; delivered-reply/redrive read did-only via `respondPayload`; the premature prune (M8) wired in both backends (verify T2 landed the seam). Eval: `ask`/outcome/`did×message` llmCheck config kinds; `ungoverned.ts` keeps the FULL byte-identical prompt (respond schema incl. the op prose) with enforcement disarmed; lints re-point.
- [ ] **Step 2:** Whole workspace green (`pnpm -r typecheck` + core/mastra/eval/server/models suites + no-bench-drift). Rewrite backend/L3 fixtures that spoke the old `asked` surface. Commit `feat!: mandatory-intention respond through backends + eval (MI-T5)`.

### Task 6: agentspec — intention vocabulary + inform guardrail + ask structure (SEPARATE REPO, leak-review)

**Files (`~/Dev/js/looprun/agentspec`):** guard-catalog, authoring norms, generator templates, R1 charter.

- [ ] **Step 1:** Document the intention model: `did` always declares ≥1 intention; speech ops (`inform`/`greet`/`refuse`/`ask`) vs action ops; the `inform` guardrail verbatim (must not assert a performed action); `ask` = the structured question. Norms teach: every response declares its intention; an action goes in an action op (verified), never in `inform`; the optional `did×message` llmCheck for sensitive domains.
- [ ] **Step 2:** R1 charter: hunt claims that ground ungrounded, actions hidden from `did`, and `inform`-misuse (an operational assertion classified as speech). Leak-review every touched file; end the report with the explicit leak-review confirmation. Commit `feat!: mandatory-intention vocabulary — speech/action ops, inform guardrail, ask structure`.

### Task 7: red-team round 2 (the certification is the failure to break)

**Files:** `packages/core/test/redteam/` — the 4 PoC files now all-green regression + new adversaries on the NEW surface; `docs/superpowers/specs/2026-08-03-mandatory-intention-design.md` appendix (or sibling verdicts doc) with per-guard impossibility statements.

- [ ] **Step 1:** Confirm all prior PoCs are green regression (every M-fix landed). Dispatch independent adversaries against the NEW attack surface: (a) `inform`-misuse (assert an action as speech — prove the forcing function + optional llmCheck is the only line, document it honestly as non-deterministic); (b) speech/action partition (can a domain op collide with a reserved speech op? can an action intent masquerade as speech to skip grounding?); (c) ask-intent ghosting round 2 (any remaining premature/superseded gap); (d) matching tokenizer (id-boundary bypass on exotic id shapes).
- [ ] **Step 2:** Every confirmed break → failing test → fix → green. Write per-guard verdicts: "could not break, structurally impossible" OR the recorded break+fix. A guard with neither does not ship. Be honest that the prose-misuse residual is forcing-function + llmCheck, not a deterministic wall (that is the design's stated guarantee).
- [ ] **Step 3:** Commit `test(redteam): mandatory-intention adversarial regression + per-guard verdicts (MI-T7)`.

### Final: whole-branch review (most capable model) over `scripts/review-package <MI-T1 base> HEAD` + docs sweep (roadmap/GUARDS/backlog). ONE fix subagent for the full findings list.

## Self-review notes
- Design D1→T1, D2→T1/T3, D3→T2, D4→T1, D5→T3/T4, D6→T4; M1-M3→T3, M4-M6→T4, M7→T4, M8→T2, M9→T4, m10→T3.
- Risk centers: T3 (matching tokenizer — the shared root of most breaks) and T5 (backend surface). Their reviewers verify tests were rewritten, not weakened, and that every red-team PoC is a PASSING regression by the end.
- Leaf decision locked (flag only if contested): `ask` is a `did` intention (not a separate field); speech-op names are reserved core vocabulary; the `did×message` llmCheck is available-not-auto.
