---
'@looprun-ai/core': major
'@looprun-ai/mastra': major
'@looprun-ai/models': major
'@looprun-ai/eval': major
'@looprun-ai/server': major
'@looprun-ai/vercel': major
'looprun': major
---

**Breaking: the public API is now exactly what the tutorial teaches.**

Every package barrel was converged onto a single contract — the symbols taught by
`docs/tutorial/01`–`06`. Names that no package documented and no consumer imported were deleted;
names that only the runtime needs moved behind `@looprun-ai/core/internal`. Each barrel is now
pinned by a surface-lock test, so it cannot drift back.

| package | public exports | before |
|---|---|---|
| `@looprun-ai/core` | 51 taught (+11 type-closure riders) | 107 named + 2 wildcard re-exports |
| `@looprun-ai/mastra` | 7 + core flow-through | 25 named + 1 wildcard |
| `@looprun-ai/models` | 8 (+2 riders) | 24 |
| `@looprun-ai/eval` | 19 (+9 riders) | 52 |
| `@looprun-ai/server` | 4 (+3 riders) | 13 |

**What moved rather than vanished.** `@looprun-ai/core/internal` is a new, explicitly unstable
subpath carrying the runtime primitives (ledger, turn machine, trunk internals, `GUARD_CATALOG`,
`GuardExecutionError`). It exists so in-repo tooling and forks keep working; it carries no
compatibility promise across releases.

**What was cut outright.** The `coherence` guard family and its trunk section were removed
(-396 LOC); the trunk fold was proven byte-identical across the change. Runtime helpers that had
been exported from `@looprun-ai/core` without ever being documented or imported — including
`uploadDisplayLabels` and `isReplyOnly` — are now module-local to `renderTurnPrompt`. Package
`CHANGELOG.md` entries that announced them stay unedited: they are an accurate record of what those
versions shipped.

**Also in this release.** `packages/core/src/guards.ts` was split into `guards/` (30 catalogued
factories, all files ≤500 lines); `@looprun-ai/mastra`'s `agent.ts` was split; and the nine
superseded documents under `docs/` were replaced by the six-chapter tutorial, every code block of
which is compiled in CI against the published packages.

Migration table for external consumers: `docs/superpowers/specs/2026-07-28-migration-notes.md`.
