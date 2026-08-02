# Full-context Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the guard firewall: full conversation history (user text included) in GuardCtx, real input at onInput, LLM-adjudicated guards (`llmCheck`), and immediate removal of every regex-typed guard parameter (pre-1.0 disposability — no shims).

**Architecture:** Spec `docs/superpowers/specs/2026-08-02-full-context-guards-design.md` is normative. Four tasks: (1) history plumbing, (2) async hooks + llmCheck + adjudicator seam, (3) regex purge, (4) doctrine/docs + skill-side charter rewrite. Per-task Opus review; final whole-batch review with docs sweep.

**Tech Stack:** TypeScript, vitest/node:test, zod (eval), pnpm workspace.

## Global Constraints

- Pre-1.0 law: NO compatibility deferrals. Broken TS bundles/tests are updated or deleted, never shimmed.
- No-regex law stays structural in the config surface; `llmCheck.rubric` is prose.
- Surface-lock riders + tutorial outline + guard-catalog parity in the SAME commit as any surface change.
- All suites (core/mastra/eval) + `pnpm -r typecheck` + `node tests/no-bench-drift.test.mjs` green per commit. Commit per task; never push.

---

### Task 1: `GuardCtx.history` + real `onInput`

**Files:** core `rules.ts` (GuardCtx + history type), `runtime/ledger.ts` (accumulate turns: userText/reply/toolCalls/attemptedCalls/guardEvents), `runtime/turn.ts` + mastra hooks (populate userText; onInput receives the incoming text instead of `{}`); tests in core + mastra.

- [ ] Failing property tests: every hook's ctx carries `history` with the full prior conversation incl. `userText`; the CURRENT turn's userText is visible to onInput (via `ctx.args.userText` or a dedicated field — pick one, document); history is read-only (frozen or typed readonly).
- [ ] Implement; all suites green; surface riders (GuardCtx is a taught type — outline + locks).
- [ ] Commit `feat(core): GuardCtx.history — guards see the whole conversation, onInput sees the input`.

### Task 2: async hooks + `llmCheck` + adjudicator seam

**Files:** core guard types (check may return `Promise<string|null>`), runtime awaits; new `guards/llm-check.ts` (`llmCheck({rubric, failMode})`); runtime options gain host-registered `adjudicator: (rubric, ctx) => Promise<{violation: string|null}>`; eval `norms-config.ts` gains the `llmCheck` kind (schema: hook, tools|any, rubric, failMode; `.strict()`); GUARD_CATALOG + proofs entries.

- [ ] Failing tests: fake adjudicator — deny fires with the adjudicator's violation as reason; null → allow; adjudicator throws → failMode open allows / closed denies; async llmCheck coexists ordered with sync guards; config kind loads and installs; missing adjudicator at runtime with an llmCheck installed → named error at conversation start (fail loud, not mid-turn).
- [ ] Case-35 fixture: a rubric ("did the operator's yes license THIS act?") + scripted adjudicator closes the two-acts-one-yes shape.
- [ ] Commit `feat: llmCheck — LLM-adjudicated guards over full context (async hooks, host adjudicator seam)`.

### Task 3: regex purge (immediate)

**Files:** every guard factory with a RegExp-typed param (grep `Re\b`/`RegExp` in core guards): remove the params; `pendingConfirmMustAsk` keeps ONLY the askUser structural branch; jobs losing coverage are re-expressed as llmCheck rubric DEFAULTS where the guard's contract demands text judgment (each such substitution named in the report); purity/lint lane gains the grep-gate (zero RegExp-typed guard params compiles). Update GUARD_CATALOG, proofs, in-repo fixtures/tests that passed regexes. Delete what has no job left.

- [ ] TDD: the grep-gate test first (fails on current tree), then purge until green; all suites updated — broken proof/fixture tests are REWRITTEN to the new surface, not skipped.
- [ ] Commit `feat!: remove regex-typed guard parameters — text judgment is llmCheck's job (pre-1.0, no shims)`.

### Task 4: doctrine + docs + skill charter

**Files:** core `rules.ts` firewall comment → new contract; GUARDS.md/generated ch04 + ch03 (history/onInput/llmCheck rows); eval README note. SEPARATE agentspec commit (leak-review law): R1 charter re-scoped (hunts pattern-matching + intent routing; reading text is not a finding), N4 "firewall-safe" vocabulary retired, `uncheckable` → may become llmCheck; guard-catalog.md rows.

- [ ] Regenerate ch04 from catalog; parity gates green; drift clean; leak-review confirmation for the skill commit.
- [ ] Commit(s): `docs: firewall retired — full-context guard contract` + agentspec `refs: R1/N4 re-scoped — full-context guards, llmCheck replaces firewall vocabulary`.

### Final: whole-batch Opus review + docs sweep (same rite as prior increments).

## Self-review notes
- Spec §1→T1, §2→T2, §3→T3, §4→T4, §5 tests distributed per task; case-35 fixture in T2.
- T3 is the risk center (wide blast radius in proofs/fixtures) — its reviewer must verify no test was weakened-to-pass rather than rewritten.
