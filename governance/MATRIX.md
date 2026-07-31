<!-- GENERATED — do not edit by hand; run `pnpm proofs:matrix`. -->
# Proof record matrix

One row per governance proof record (`governance/proofs/*.md`), sorted date DESC then slug ASC.
Regenerate with `pnpm proofs:matrix`; CI runs `--check` to keep it in sync.

| Date | Record | Change | Scope | Isolated | Collective | Coverage | Certified models | SLM canary | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 2026-07-29 | [core-internal-subpath](proofs/2026-07-29-core-internal-subpath.md) | core: public barrel cut to the 51-symbol tutorial contract; the internal seam moves to @looprun-ai/core/internal | runtime | 212/212 | 55/55 | 29/29 | n/a | n/a | PASS |
| 2026-07-29 | [guard-catalog-summaries-detaxonomized](proofs/2026-07-29-guard-catalog-summaries-detaxonomized.md) | core: guard catalog summaries drop the risk-family prefixes; two whenToUse rows corrected (forbidThisTurn scope, custom hook) | docs | 212/212 | 55/55 | 29/29 | n/a | n/a | PASS |
| 2026-07-29 | [guards-md-demoted-to-internals](proofs/2026-07-29-guards-md-demoted-to-internals.md) | core: GUARDS.md demoted to maintainer internals (kind list + risk-family taxonomy removed, catalog is the vocabulary of record); GUARD_CATALOG prose backticks identifier cross-references | docs | 212/212 | 55/55 | 29/29 | n/a | n/a | PASS |
| 2026-07-29 | [guards-split-catalog](proofs/2026-07-29-guards-split-catalog.md) | core: guards.ts split byte-exactly into guards/ per category; GUARD_CATALOG ships on /internal | runtime | 212/212 | 55/55 | 29/29 | n/a | n/a | PASS |
| 2026-07-29 | [mastra-facade-trim](proofs/2026-07-29-mastra-facade-trim.md) | mastra: barrel trimmed to the 7-symbol LoopRunAgent facade; agent.ts construction split out | runtime | 212/212 | 55/55 | 29/29 | n/a | n/a | PASS |
| 2026-07-29 | [runtime-dead-export-cut](proofs/2026-07-29-runtime-dead-export-cut.md) | core: dead runtime exports go module-local (7 symbols un-exported, RuntimeTurnInput erased) | runtime | 212/212 | 55/55 | 29/29 | n/a | n/a | PASS |
| 2026-07-29 | [task-12-doc-sweep](proofs/2026-07-29-task-12-doc-sweep.md) | Task 12 sweep: comment-only edits on governed paths (agent.ts getTools to listTools per Mastra v1; outline path rewrites; Task-N forward refs resolved) | docs | 212/212 | 55/55 | 29/29 | n/a | n/a | PASS |
| 2026-07-29 | [trunk-fold-coherence-cut](proofs/2026-07-29-trunk-fold-coherence-cut.md) | core: coherence queries erased; the trunk table + fold survive as trunk-fold.ts (module-local) | runtime | 212/212 | 55/55 | 29/29 | n/a | n/a | PASS |
| 2026-07-28 | [ask-channel-survives-deny](proofs/2026-07-28-ask-channel-survives-deny.md) | terminal tools are protocol-owned: never routed to world.exec, ask channel survives any preTool deny | runtime | 212/212 | 55/55 | 29/29 | n/a | n/a | PASS |
| 2026-07-28 | [compile-freeze-reply-only](proofs/2026-07-28-compile-freeze-reply-only.md) | compileSpec freezes replyOnly at beginTurn: prompt and activeTools can never disagree mid-turn | runtime | 212/212 | 55/55 | 29/29 | n/a | n/a | PASS |
| 2026-07-27 | [governed-runtime-baseline](proofs/2026-07-27-governed-runtime-baseline.md) | Baseline of the governed runtime: typed guard catalog, terminal-protocol turn machine with the governance veto envelope, terminal-only closing step and superseded-terminal pruning, the TRUTH/FORM salvage frontier, and runtime-owned terminal tool definitions | runtime | 212/212 | 55/55 | 29/29 | n/a | n/a | PASS |
