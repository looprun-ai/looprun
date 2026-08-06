---
date: 2026-07-29
slug: runtime-dead-export-cut
change_kind: runtime
target: —
summary: core: dead runtime exports go module-local (7 symbols un-exported, RuntimeTurnInput erased)
isolated: 212/212
collective: 55/55
coverage: 29/29
certified_models: n/a
slm_canary: n/a
verdict: PASS
suite_cmd: pnpm proofs:run
---

# Proof record — core: dead runtime exports go module-local (7 symbols un-exported, RuntimeTurnInput erased)

**Scope:** `runtime` · **Date:** 2026-07-29 · **Verdict:** PASS

## What changed
Task 6 is the VERIFICATION pass over the runtime seam (Task 3 already moved the governed-turn machine
to `@looprun-ai/core/internal`). The only residual it found: symbols still carrying `export` in
`packages/core/src/runtime/*.ts` that **no barrel, no sibling package and no test** imports — a
half-open surface, `internal` in name but reachable by anyone deep-importing the module.

Seven lose the keyword; each has an in-file caller, so the IMPLEMENTATION is untouched (byte-identical
bodies, same call sites, same order):

| symbol | file | sole caller | inventory verdict |
|---|---|---|---|
| `TERMINAL_TOOLS` | `runtime/terminal.ts` | `TERMINAL_SET` (line 11) | delete |
| `TERMINAL_PROTOCOL` | `runtime/terminal.ts` | `terminalProtocol()` | delete |
| `TERMINAL_PROTOCOL_REPLY_ONLY` | `runtime/terminal.ts` | `terminalProtocol()` | delete |
| `uploadDisplayLabels` | `runtime/prompt.ts` | `renderTurnPrompt()` | delete |
| `isReplyOnly` | `runtime/prompt.ts` | `renderTurnPrompt()` | delete |
| `applyMutators` | `runtime/turn.ts` | `finalizeReply()` | delete |
| `checkReply` | `runtime/turn.ts` | `finalizeReply()` (3 call sites) | delete |

One is ERASED — `RuntimeTurnInput` (`runtime/types.ts`), a `= TurnInput` continuity alias with **zero
references** in the whole tree (the only two hits are prose in test comments). Its sibling
`RuntimeTurnRecord` stays: `/internal` names it. Inventory verdict: delete.

Note the `runtime/terminal.ts#TERMINAL_TOOLS` cut does not touch the guard layer's SEPARATE
`guards/shared.ts#TERMINAL_TOOLS` (a `Set`, imported by `guards/flow.ts`), nor `spec.ts`'s own
module-local array of the same name. Three same-named constants, three owners, only the runtime one
was dead.

**Deliberately KEPT exported** (they fail the "nothing imports them" test): `recordVeto` and
`VETO_STORM_LIMIT` — cross-module callers in `runtime/turn.ts` and `packages/core/test/runtime.test.ts`
— and `shouldFireChain`, imported by `packages/core/test/chains-posttool.test.ts`. Their `delete`
verdicts in inventory §7.1 are about the PUBLIC barrel, which they left in Task 3; a test-imported
module export is not dead code.

## Proof cases
No guard was touched: no `check()`, no `prose()`, no binding, no hook, no assembled prompt byte. The ratchet still
computes **29/29 kinds** and the suite total is unchanged at 495/495 — the same numbers as the parent
commit. No proof case was added, changed or deleted; this record exists because the diff lands in
`packages/core/src/**`, which is a governed surface regardless of behavioral reach.

The strongest evidence that the seam is unchanged is the surface lock itself
(`packages/core/test/proofs/surface-lock.test.ts`): both barrels are asserted against transcribed
arrays, and neither array moved in this commit — the exports removed here were on NEITHER barrel,
which is exactly why they were dead. `declaration-emit.test.ts` (the `declaration: true` consumer
fixture) also stays green, proving no type-closure rider depended on the erased alias.

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
**PASS.** Guard behavior is untouched, and the change is a pure visibility narrowing: seven `export`
keywords removed from symbols with in-file callers, plus one unreferenced type alias erased.

Residuals, recorded rather than fixed here:

1. `packages/core/GUARDS.md` still names `TERMINAL_TOOLS` — correctly, since it points at
   `src/guards/shared.ts`, which keeps its export. The inventory's TASK 12 note on that row is about
   the doc reference and is unaffected by this cut.
2. `recordVeto`, `VETO_STORM_LIMIT` and `shouldFireChain` remain module exports whose only external
   readers are core's own tests. Making them private would mean rewriting those tests to reach the
   behavior through `finalizeReply`/`evaluatePreTool` — a test-design change, not a surface change, and
   out of Task 6's scope.
