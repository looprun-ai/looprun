---
date: 2026-07-29
slug: mastra-facade-trim
change_kind: runtime
target: —
summary: mastra: barrel trimmed to the 7-symbol LoopRunAgent facade; agent.ts construction split out
isolated: 212/212
collective: 55/55
coverage: 29/29
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — mastra: barrel trimmed to the 7-symbol LoopRunAgent facade; agent.ts construction split out

**Scope:** `runtime` · **Date:** 2026-07-29 · **Verdict:** PASS

## What changed
Task 7 converges `@looprun-ai/mastra` onto the tutorial contract (`docs/tutorial/00-outline.md` §4)
and splits the one file over the 500-line cap. **No guard, hook, prompt byte or turn step changed.**

**1 · Barrel trim (18 names off, 0 behavior).** `src/index.ts` now exports the 7 taught mastra rows —
`LoopRunAgent` `LoopRunAgentConfig` `LoopRunOptions` (ch02) · `worldFromTools` `StateView` (ch03) ·
`runSpecConversation` `RuntimeDeps` (ch05) — plus `export * from '@looprun-ai/core'` (kept: chapters
02–04 teach core through the `looprun/mastra` specifier). Everything with an `internal`/`delete`
verdict in inventory §7.2 stays module-local; mastra has no `/internal` subpath, so in-package code
imports the module files directly. Implementations are untouched (`compile.ts`, `session.ts`,
`tools.ts`, `hooks.ts`, `json-schema-zod.ts`, `surface.ts` are byte-identical).

Only `createLoopRunAgent` is DELETED outright — inventory: zero callers anywhere, 0 doc hits.

**2 · `agent.ts` 551 → 448.** The construction half moved verbatim to `src/agent-construction.ts`
(151 lines): config validation → world resolution → native-surface intersection → tool build →
certification drift gate → static instructions → Agent pass-through. Every check, message string and its ORDER
is preserved. `agent.ts` keeps exactly one responsibility: the governed turn.

TWO construction statements move relative to that resolved block; both are inert, and both are stated
here rather than left to a reader's diff:

| statement | before | after | why it cannot change behavior |
|---|---|---|---|
| `makeGuardHooks(spec, getSession)` | between the surface `Set` and the native-surface checks | after the whole resolve | a pure closure factory: it reads `spec` and stores a lazily-called `getSession`, executes no guard and touches no world |
| `new SessionStore(world)` | right after the world was resolved | after the whole resolve | the constructor is a `typeof world === 'function'` test plus field assignments — an empty `Map`, `factory`, `singleton` (`session.ts`) — no world call, no throw path |

Both still run before `super()`, so the Agent sees the identical arguments. The consequence of the
move is strictly ordering of THROWS: a config that fails the native-surface or drift-gate check now
throws before those two objects are built, never after — the same error, the same message.

**3 · The lock.** New `packages/mastra/test/surface-lock.test.ts` (compiler-API, same mechanism as
core's): the barrel = the 7 taught names + core's public barrel, the §7.2 verdicts are absent, and no
taught name collides with a core name. Verified to FAIL on an injected re-export.

## Proof cases
No new guard behavior, so no new proof cases: this change is proven by the EXISTING suite running
unchanged over a restructured loop. `packages/mastra/test/proofs/**` (L3 + collective) is the
regression evidence — 15 mastra test files, 246 assertions, edited only for import paths
(`surfaceFingerprint` → `../src/surface.js`, `repeatedToolCallStop` → `../src/hooks.js`); not one
assertion changed.

## Results
Recorded from `governance/.artifacts/proofs.json` (`scripts/proofs/run-proofs.mjs`):

| lane | pass/total |
|---|---|
| isolated (L1 + L3) | 212/212 |
| collective | 55/55 |
| ratchet | 58/58 |
| coverage (kinds fully proven) | 29/29 |
| **all** | **495/495** |

## SLM canary (advisory)
Not run for this change (report-only lane; never gates the PR).

## Verdict & residuals
**PASS.** Full gate green: `pnpm -r build` · `pnpm test` (820 tests: core 512 · models 11 · mastra 252
· server 22 · eval 23) · `pnpm -r --if-present typecheck` including `examples/hermes-sim`.

Residuals (both for Task 12, neither a behavior risk):

- `LoopRunResultMeta` has an `internal` verdict but its only consumer is the SIBLING package
  `@looprun-ai/server`, which cannot reach a module-local type without a `/internal` subpath mastra
  does not have. The shape is now declared in `packages/server/src/types.ts` (server owns the type of
  its own public `TurnEvent`); it stays off the server barrel, so no package's surface grew.
- `compileSpec` is off the barrel but still referenced in published docs (`README.md`,
  `governance/MATRIX.md`, `governance/proofs/2026-07-28-compile-freeze-reply-only.md`). The
  implementation and its L-level proof (`test/proofs/compile-freeze.test.ts`, which imports the module
  file directly) are untouched; the doc sweep is Task 12.
