# Symbol usage inventory — looprun simplification (Phase 0)

**Date of scan:** 2026-07-28/29 · **Branch:** `worktree-simplification` · **Task:** simplification plan, Task 1

This is the **authority** every later refactor task cites for cuts. One row per symbol exported
from the `src/index.ts` of `core`, `mastra`, `models`, `eval`, `server`, `vercel` — 265 rows,
every symbol exactly once.

---

## 1. Verdicts at a glance

```
package    public   internal   delete    total
--------   ------   --------   ------    -----
core          51        32        66       149
mastra         5         1        19        25
models         6         2        16        24
eval          11         0        41        52
server         4         0         9        13
vercel         0         0         2         2
--------   ------   --------   ------    -----
TOTAL         77        35       153       265
```

```
public   ████████████████████████                      77  (29.1%)
internal ███████████                                   35  (13.2%)
delete   ████████████████████████████████████████████ 153  (57.7%)
```

**Well over half** of the exported surface has no consumer outside the package that defines it.

---

## 2. What the verdicts mean

| verdict | rule | what the later tasks do with it |
|---|---|---|
| **public** | referenced from `examples/`, `skills/`, `scripts/`, `governance/`, `looprun-bench`, `agentspec`, `yntelli` — or documented as user-facing API (see §3) | stays on the package's public `index.ts` |
| **internal** | referenced only from another `packages/*` (mastra / eval / server / models / vercel / the `looprun` CLI facade) | moves behind an `/internal` subpath export |
| **delete** | zero references outside the defining package's own `src/` and its own `test/` | drops off `index.ts` (the implementation usually stays; only the *export* goes) |

`delete` almost never means "erase the function". It means **stop exporting it**. A symbol used by
its own package's `src/` still compiles fine as a module-local export.

---

## 3. Method — and where grep lies

Three passes, because a naive `grep -w Symbol` is wrong in both directions.

| pass | what it does | why |
|---|---|---|
| **A. word grep** | `grep -rlw` over all consumer roots | fast baseline; **over-counts** — `custom`, `Layer`, `Hook`, `Guard`, `Dim` are ordinary English words |
| **B. import-aware scan** | Node script parsing every `import {…} from`, `export {…} from`, `require({…})` and attributing each named binding to the module it came from | authoritative; a hit only counts when the file actually imports the symbol from `looprun*` / `@looprun-ai/*` (or a relative path inside the owning package) |
| **C. doc + dynamic-import sweep** | `grep` over `*.md` in `docs/`, `skills/`, `examples/`, and the **agentspec generator skill**; plus manual reading of the two shipped `bin/*.mjs` | catches API that is real but invisible to pass B (see below) |

**Roots scanned** (always excluding `node_modules/` and `dist/`):

```
<worktree>/packages   <worktree>/examples   <worktree>/skills   <worktree>/scripts
<worktree>/tests      <worktree>/governance
/Users/marcos/Dev/js/looprun/looprun-bench
/Users/marcos/Dev/js/looprun/agentspec
/Users/marcos/Dev/js/yntelli/yntelli
```

### Three things pass B cannot see, handled by hand

1. **Dynamic namespace imports in the shipped CLIs.** `packages/eval/bin/looprun-eval.mjs` does
   `const api = await import('@looprun-ai/eval')` then `api.runCommand(...)`; `packages/looprun/bin/looprun.mjs`
   does the same with `@looprun-ai/models`. Eleven `eval` symbols and three `models` symbols are only
   reachable this way. They are promoted (`eval` → public, since `looprun-eval` is a shipped
   user-facing binary; `models` → internal, since the `looprun` CLI is a sibling package).
   The symbols: `runCommand foldCommand certCommand lintPaths lintSpecLaws lintSpecExecution
   lintSpecQuality lintSubject loadSubject mintSeal verifySeal` (eval) and
   `LlamaCppRuntime resolveAlias localModelStatus` (models).

2. **Guards that `AgentSpecBase` auto-installs.** Every one of the 31 guard factories in
   `packages/core/src/guards.ts` is documented in the **agentspec generator skill's**
   `references/guard-catalog.md` — that file *is* the public catalog users author against.
   Several (`confirmFirst`, `destructiveThrottle`, `noDuplicateCall`, the reply-honesty family)
   are auto-installed by the `AgentSpecBase` constructor, so consumer specs *name them in prose*
   without ever importing them. All 31 are **public**; the rows carry a note where the verdict
   rests on the catalog rather than on an import.

3. **Three source files are binary to `grep`.** `packages/core/src/coherence.ts`,
   `packages/mastra/src/surface.ts` and `packages/server/src/session.ts` embed raw `\x00` / `\x01`
   bytes as string separators (`` `${l.subject}\x00${l.polarity}` ``). `file(1)` reports them as
   `data`, and **plain `grep` silently skips them** — no match, no warning. Pass B (Node
   `readFileSync`) reads them correctly, and every grep re-check in this document used `grep -a`.
   This is a live trap for any future repo scan; see §6.

### Companion types

Where a `*Config` / `*Options` type exists only as the parameter of a public value, it inherits that
value's verdict and carries a note (`AgentSpecConfig`, `LoopRunAgentConfig`, `LoopRunOptions`,
`ModelServer`, `ModelServerConfig`). Other types are judged on their own imports.

### Column key

| column | meaning |
|---|---|
| **used by (consumers)** | `examples` · `skills` · `scripts` · `governance` · `bench` · `agentspec` · `yntelli` |
| **used by (sibling packages)** | another `packages/*`; `#test` marks a hit in that package's `test/` |
| **own pkg only** | the defining package's own `src/` (`core`) and `test/` (`core#test`); the package's own `index.ts` barrel is **not** counted as usage |
| **doc hits** | count of `*.md` files mentioning it across `docs/`, `skills/`, `examples/`, and `agentspec/skill` + `agentspec/docs` |

---

## 4. Pre-seeded zero-usage claims — RE-VERIFIED

The plan pre-seeded 16 symbols as measured at zero non-test usage. **All 16 confirmed** by an
independent `grep -ra -w` across every root (`*.ts`, `*.mjs`, `*.md`):

| symbol | every hit found | confirmed |
|---|---|---|
| `findContradictions` | core barrel, `core/test/proofs/trunk-provenance.test.ts`, plan docs | yes |
| `findDuplications` | core barrel, `core/src/trunk.ts`, core proof test, plan docs | yes |
| `findMultiOwnerSubjects` | core barrel, core proof test, plan docs | yes |
| `findSubjectlessLines` | core barrel, core proof test, plan docs | yes |
| `findUnassessableLines` | core barrel, plan docs **only** | yes |
| `foldRow` | core barrel, plan docs **only** | yes |
| `foldTrunk` | core barrel, `core/src/trunk.ts`, core proof test, plan docs | yes |
| `withPolarityLexicon` | core barrel, core proof test, plan docs | yes |
| `derivePolarity` | core barrel, `core/src/trunk.ts`, core proof test, plan docs | yes |
| `deriveSubject` | core barrel, `core/src/trunk.ts`, core proof test, plan docs | yes |
| `trunkLines` | core barrel, core proof test, plan docs | yes |
| `mutatorLines` | core barrel, core proof test, plan docs | yes |
| `isSingleClause` | core barrel, plan docs **only** | yes |
| `DEFAULT_POLARITY_LEXICON` | core barrel, plan docs **only** | yes |
| `chainOrder` | core barrel, `core/src/trunk.ts`, plan docs | yes |
| `renderTrunkBlocks` | core barrel, `core/src/trunk.ts`, core proof test, plan docs | yes |

No consumer in `examples`, `skills`, `scripts`, `looprun-bench`, `agentspec` or `yntelli` references
any of them. Four (`findUnassessableLines`, `foldRow`, `isSingleClause`, `DEFAULT_POLARITY_LEXICON`)
plus `TrunkPolarity`-family types are not referenced *anywhere* — not even inside `core/src`.

**Note for Task 5:** `coherence.ts` (428 lines) exports 33 symbols; `trunk.ts` genuinely uses
6 of them (`derivePolarity`, `deriveSubject`, `foldTrunk`, `SubjectRule`, `TrunkBlock`, `TrunkLine`,
`TrunkRow`). The other 27 exist only for `core/test/proofs/trunk-provenance.test.ts` or for nothing.

---

## 5. Spot-checks (independent re-grep, 6 symbols)

| symbol | verdict | independent `grep -ra -w` result | agrees |
|---|---|---|---|
| `surfaceFingerprint` (mastra) | delete | `mastra/src/agent.ts`, `mastra/src/surface.ts`, `mastra/src/index.ts`, `mastra/test/native-surface.test.ts` — nothing else | yes |
| `redriveMessage` (core) | public | core barrel + `core/src/runtime/turn.ts` + core test, **and** `looprun-bench/benchmarks/tau2-telecom/harness/shim/src/step-handler.ts` (real import) | yes |
| `pruneSupersededTerminals` (core) | internal | core barrel + `core/src/runtime/ledger.ts`, **and** `mastra/src/agent.ts` + `mastra/src/run-conversation.ts` — no consumer root | yes |
| `Layer` (core) | delete | only `core/src/spec.ts` + core barrel. All 8 bench/yntelli hits are the English word in comments ("Layer rationale: …") — **spurious** | yes |
| `worldFromTools` (mastra) | public | `mastra/src/agent.ts` + barrel, **and** `yntelli/apps/criaty-api/.../specs/index.test.ts` → `import { validateSpec, worldFromTools } from 'looprun/mastra'` | yes |
| `createLoopRunAgent` (mastra) | delete | defined in `mastra/src/agent.ts`, re-exported by the barrel, **zero callers anywhere** | yes |

6 / 6 agree with the table.

---

## 6. Findings worth acting on beyond this task

| # | finding | impact |
|---|---|---|
| 1 | 153 / 265 exports (58%) have no consumer outside their own package; another 35 (13%) are consumed only by sibling packages. **Only 77 (29%) are genuinely user-facing.** | the headline number the plan is built on — confirmed |
| 2 | `packages/eval` exports 52 symbols; **41** are used only inside `eval/src` + `eval/test`. The real contract is the 11 the `looprun-eval` bin calls | eval's `index.ts` can shrink ~80% |
| 3 | `packages/server` exports 13; only `createModelServer` + `TurnEvent` (+2 companion types) are consumed | same |
| 4 | `packages/models` exports 24; the documented API is `localModel` / `geminiFlashLiteThinkOff` / `localModelStatus` + 3 types. The five `QWEN*` alias constants and `MODEL_ALIASES` have no consumer at all | same |
| 5 | **`coherence.ts`, `surface.ts`, `session.ts` contain raw control bytes** (`\x00`, `\x01`) in string literals, so `file(1)` calls them `data` and plain `grep` skips them without warning | any future repo-wide grep audit is silently blind to 3 files. Fix: write the separators as escape sequences (backslash-u-0000) instead of raw bytes. Until then, use `grep -a` |
| 6 | `packages/vercel` is a 25-line reserved stub whose only two exports are unused; `createLoopRunAgent` there always throws, and it *shadows* the same-named (also unused) mastra export | worth deciding whether the package ships at all |
| 7 | `packages/looprun` and `packages/looprun/src/core.ts` are pure `export *` facades over `@looprun-ai/core` | whatever core's `index.ts` becomes, the `looprun` root export inherits automatically — no extra work |

---

## 7. The table

Rows are grouped by package, in `index.ts` declaration order. `—` = no hits in that bucket.

### 7.1 `@looprun-ai/core` — 149 symbols (51 public · 32 internal · 66 delete)

| symbol | used by (consumers) | used by (sibling packages) | own pkg only | doc hits | verdict | note |
|---|---|---|---|---|---|---|
| `Dim` | — | — | core, core#test | 0 | ~~delete~~ |  |
| `AgentWorld` | bench, examples, yntelli | eval, eval#test, mastra, mastra#test, vercel | core, core#test | 2 | **public** |  |
| `ObservedCall` | bench | mastra, mastra#test | core, core#test | 0 | **public** |  |
| `GuardCtx` | bench | eval, mastra | core, core#test | 5 | **public** |  |
| `Guard` | bench, yntelli | mastra#test | core, core#test | 7 | **public** |  |
| `ReplyMutator` | — | — | core | 1 | ~~delete~~ |  |
| `SpatialEdge` | — | — | core | 0 | ~~delete~~ |  |
| `GuardExecutionError` | — | — | core, core#test | 0 | ~~delete~~ |  |
| `custom` | agentspec, bench, examples, yntelli | eval#test, mastra#test | core#test | 8 | **public** |  |
| `requiresBefore` | agentspec, bench, examples, yntelli | eval#test, mastra#test, server#test | core#test | 6 | **public** |  |
| `forbidThisTurn` | examples | mastra#test | core#test | 4 | **public** |  |
| `argRequired` | bench, yntelli | — | core#test | 4 | **public** |  |
| `argAbsent` | yntelli | — | core#test | 2 | **public** |  |
| `argFormat` | bench, examples, yntelli | mastra#test | core#test | 3 | **public** |  |
| `precondition` | agentspec, bench, yntelli | — | core#test | 6 | **public** |  |
| `maxCalls` | bench, examples, yntelli | — | core#test | 2 | **public** |  |
| `canonArgs` | yntelli | — | core | 2 | **public** |  |
| `noDuplicateCall` | — | mastra#test | core, core#test | 5 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `confirmFirst` | — | mastra#test | core, core#test | 4 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `noActAfterAskSameTurn` | bench, yntelli | — | core#test | 2 | **public** |  |
| `destructiveThrottle` | — | mastra#test | core, core#test | 4 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `resultInvariant` | — | mastra#test | core#test | 2 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `noFabricatedSuccess` | bench, examples, yntelli | mastra#test | core#test | 2 | **public** |  |
| `replyMustMention` | — | mastra#test | core#test | 3 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `replyMaxOccurrences` | — | mastra#test | core#test | 3 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `replySingleQuestion` | — | mastra#test | core#test | 3 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `replyConfirmsLabels` | — | eval#test | core#test | 3 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `emptyReply` | — | — | core, core#test | 3 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `degenerationGuard` | — | mastra#test | core, core#test | 3 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `pendingConfirmMustAsk` | bench, examples, yntelli | mastra#test | core#test | 2 | **public** |  |
| `destructiveClaimRequiresSuccess` | bench, examples, yntelli | mastra#test | core#test | 3 | **public** |  |
| `noFalseFailureClaim` | agentspec, bench | mastra#test | core, core#test | 3 | **public** |  |
| `minimalDisclosure` | — | mastra#test | core#test | 2 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `noInstructionFromData` | — | mastra#test | core#test | 2 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `noCompetitorClaim` | — | mastra#test | core#test | 2 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `noOutOfSurfaceActionClaim` | — | mastra#test | core#test | 2 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `noUngroundedRegulatedFigure` | — | mastra#test | core#test | 3 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `consentRequired` | — | mastra#test | core#test | 2 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `jargonScrub` | agentspec, bench, examples, yntelli | mastra#test | core#test | 2 | **public** |  |
| `DENY_ONLY_PROSE_KINDS` | — | eval | — | 1 | internal |  |
| `CONFIRM_CLASS_KINDS` | — | eval | — | 1 | internal |  |
| `ARMED_SEAMS` | — | eval | — | 1 | internal |  |
| `AgentSpecBase` | agentspec, bench, examples, yntelli | eval#test, mastra#test, server#test | core, core#test | 2 | **public** |  |
| `resolveBindings` | — | — | core, core#test | 1 | ~~delete~~ |  |
| `resolveGuards` | bench | mastra | core, core#test | 1 | **public** |  |
| `resolveMutators` | — | — | core | 1 | ~~delete~~ |  |
| `AgentSpec` | bench, examples, yntelli | eval, eval#test, mastra, vercel | core | 9 | **public** |  |
| `AgentSpecConfig` | — | — | core | 1 | **public** | companion type of `AgentSpecBase` (public) — no standalone import |
| `AgentControls` | — | — | — | 0 | ~~delete~~ |  |
| `AgentScope` | — | — | — | 0 | ~~delete~~ |  |
| `ChainSpec` | — | — | core, core#test | 0 | ~~delete~~ |  |
| `GuardBinding` | — | eval | core | 0 | internal |  |
| `MutatorBinding` | — | — | — | 0 | ~~delete~~ |  |
| `StateDirective` | — | — | — | 0 | ~~delete~~ |  |
| `TerminalPolicy` | — | — | — | 0 | ~~delete~~ |  |
| `Hook` | — | — | core | 0 | ~~delete~~ |  |
| `ToolTarget` | — | — | core | 0 | ~~delete~~ |  |
| `Layer` | — | — | — | 0 | ~~delete~~ |  |
| `renderScopedSpecTrunk` | bench, yntelli | eval, mastra | core, core#test | 1 | **public** |  |
| `renderTrunkBlocks` | — | — | core#test | 1 | ~~delete~~ |  |
| `chainOrder` | — | — | — | 1 | ~~delete~~ |  |
| `DomainContract` | examples | eval, eval#test, mastra, mastra#test, vercel | core, core#test | 1 | **public** |  |
| `TrunkRenderOptions` | — | — | — | 0 | ~~delete~~ |  |
| `GUARD_KIND_SUBJECT` | — | — | core#test | 0 | ~~delete~~ |  |
| `derivePolarity` | — | — | core, core#test | 1 | ~~delete~~ |  |
| `deriveSubject` | — | — | core, core#test | 1 | ~~delete~~ |  |
| `foldRow` | — | — | — | 2 | ~~delete~~ |  |
| `foldTrunk` | — | — | core, core#test | 2 | ~~delete~~ |  |
| `trunkLines` | — | — | core#test | 1 | ~~delete~~ |  |
| `findContradictions` | — | — | core#test | 2 | ~~delete~~ |  |
| `findDuplications` | — | — | core#test | 1 | ~~delete~~ |  |
| `findMultiOwnerSubjects` | — | — | core#test | 1 | ~~delete~~ |  |
| `findSubjectlessLines` | — | — | core#test | 1 | ~~delete~~ |  |
| `findUnassessableLines` | — | — | — | 1 | ~~delete~~ |  |
| `isSingleClause` | — | — | — | 1 | ~~delete~~ |  |
| `DEFAULT_POLARITY_LEXICON` | — | — | — | 1 | ~~delete~~ |  |
| `withPolarityLexicon` | — | — | core#test | 1 | ~~delete~~ |  |
| `mutatorLines` | — | — | core#test | 1 | ~~delete~~ |  |
| `TrunkLine` | — | — | core | 0 | ~~delete~~ |  |
| `TrunkRow` | — | — | core | 0 | ~~delete~~ |  |
| `TrunkBlock` | — | — | core | 0 | ~~delete~~ |  |
| `TrunkPolarity` | — | — | — | 0 | ~~delete~~ |  |
| `SubjectRule` | — | — | core | 0 | ~~delete~~ |  |
| `NormativeLine` | — | — | core#test | 0 | ~~delete~~ |  |
| `ContradictionFinding` | — | — | — | 0 | ~~delete~~ |  |
| `DuplicationFinding` | — | — | — | 0 | ~~delete~~ |  |
| `SingleOwnerFinding` | — | — | — | 0 | ~~delete~~ |  |
| `PolarityLexicon` | — | — | core#test | 0 | ~~delete~~ |  |
| `MutatorBindingLike` | — | — | — | 0 | ~~delete~~ |  |
| `validateSpec` | — | eval, mastra | core#test | 0 | internal |  |
| `MAX_TOOL_SURFACE` | — | — | — | 0 | ~~delete~~ |  |
| `SpecWarning` | — | — | — | 0 | ~~delete~~ |  |
| `geminiThinkingOff` | yntelli | eval, models | core#test | 0 | **public** |  |
| `pinnedDecoding` | yntelli | eval | core#test | 1 | **public** |  |
| `normalizeModelParams` | — | mastra | core#test | 0 | internal |  |
| `resolveModelSettings` | — | mastra | core#test | 0 | internal |  |
| `SamplingSettings` | — | — | core | 0 | ~~delete~~ |  |
| `ToolDef` | bench, examples | eval, mastra, mastra#test, vercel | core | 1 | **public** |  |
| `TokenUsage` | — | mastra | — | 1 | internal |  |
| `TurnInput` | — | mastra | — | 0 | internal |  |
| `TurnRecord` | — | eval, mastra | — | 1 | internal |  |
| `RunResult` | — | mastra, mastra#test | — | 1 | internal |  |
| `RuntimeTurnInput` | — | — | — | 0 | ~~delete~~ |  |
| `RuntimeTurnRecord` | — | mastra | — | 0 | internal |  |
| `createLedger` | bench | mastra | core#test | 1 | **public** |  |
| `beginTurn` | bench | mastra | core#test | 1 | **public** |  |
| `resultOk` | — | mastra#test | core#test | 0 | internal |  |
| `recordVeto` | — | — | core, core#test | 1 | ~~delete~~ |  |
| `recordToolResult` | — | mastra | core#test | 1 | internal |  |
| `recordTerminal` | — | mastra | core#test | 1 | internal |  |
| `recordTerminalCall` | — | mastra | core#test | 1 | internal |  |
| `pruneSupersededTerminals` | — | mastra | — | 1 | internal |  |
| `vetoStormHit` | — | mastra | core#test | 1 | internal |  |
| `VETO_STORM_LIMIT` | — | — | core#test | 1 | ~~delete~~ |  |
| `TurnLedger` | — | mastra | core | 0 | internal |  |
| `PostToolViolation` | — | — | — | 0 | ~~delete~~ |  |
| `TERMINAL_TOOLS` | — | — | — | 1 | ~~delete~~ |  |
| `isTerminal` | — | mastra | core | 1 | internal |  |
| `terminalProtocol` | — | mastra | core | 2 | internal |  |
| `TERMINAL_PROTOCOL` | — | — | — | 0 | ~~delete~~ |  |
| `TERMINAL_PROTOCOL_REPLY_ONLY` | — | — | — | 0 | ~~delete~~ |  |
| `forcedTerminalPrompt` | — | mastra | — | 1 | internal |  |
| `terminalToolDefs` | — | mastra | — | 1 | internal |  |
| `normalizeTerminalToolDef` | — | mastra, mastra#test | — | 0 | internal |  |
| `prematureTerminalTools` | — | mastra, mastra#test | core#test | 0 | internal |  |
| `supersededTerminalCalls` | — | mastra | core#test | 0 | internal |  |
| `renderTurnPrompt` | — | mastra, mastra#test | — | 1 | internal |  |
| `uploadDisplayLabels` | — | — | — | 0 | ~~delete~~ |  |
| `isReplyOnly` | — | — | — | 0 | ~~delete~~ |  |
| `TurnPrompt` | — | — | — | 0 | ~~delete~~ |  |
| `TurnPromptInput` | — | — | — | 0 | ~~delete~~ |  |
| `evaluatePreTool` | bench | mastra | core#test | 0 | **public** |  |
| `evaluateOnInput` | — | mastra | core#test | 0 | internal |  |
| `applyMutators` | — | — | — | 0 | ~~delete~~ |  |
| `checkReply` | — | — | — | 0 | ~~delete~~ |  |
| `enforcePostTool` | bench | mastra | core#test | 0 | **public** |  |
| `redriveMessage` | bench | — | core#test | 0 | **public** |  |
| `defaultExhaustionReply` | — | mastra#test | — | 0 | internal |  |
| `finalizeReply` | bench | mastra | core#test | 0 | **public** |  |
| `governanceVeto` | — | mastra, mastra#test | — | 0 | internal |  |
| `shouldFireChain` | — | — | core#test | 0 | ~~delete~~ |  |
| `runChainCompletionPass` | — | mastra | core#test | 0 | internal |  |
| `PreToolVerdict` | — | — | — | 0 | ~~delete~~ |  |
| `GovernanceVeto` | — | — | — | 0 | ~~delete~~ |  |
| `ReplyViolation` | bench | — | — | 0 | **public** |  |
| `FinalizedReply` | — | mastra | — | 0 | internal |  |
| `PostToolEnforcement` | — | — | — | 0 | ~~delete~~ |  |
| `ChainPassCtx` | — | — | — | 0 | ~~delete~~ |  |
| `ChainPassResult` | — | — | — | 0 | ~~delete~~ |  |

### 7.2 `@looprun-ai/mastra` — 25 symbols (5 public · 1 internal · 19 delete)

`mastra/src/index.ts` also ends with `export * from '@looprun-ai/core'` — that re-export is covered by §7.1, not repeated here.

| symbol | used by (consumers) | used by (sibling packages) | own pkg only | doc hits | verdict | note |
|---|---|---|---|---|---|---|
| `LoopRunAgent` | examples, yntelli | server, server#test | mastra#test | 12 | **public** |  |
| `createLoopRunAgent` | — | — | — | 1 | ~~delete~~ |  |
| `LoopRunAgentConfig` | — | — | — | 0 | **public** | companion type of `LoopRunAgent` (public) — no standalone import |
| `LoopRunOptions` | — | — | — | 0 | **public** | companion type of `LoopRunAgent` (public) — no standalone import |
| `LoopRunResultMeta` | — | server | — | 0 | internal |  |
| `runSpecConversation` | bench | eval | mastra, mastra#test | 2 | **public** |  |
| `DEFAULT_MAX_STEPS` | — | — | mastra | 0 | ~~delete~~ |  |
| `DEFAULT_REDRIVES` | — | — | mastra | 0 | ~~delete~~ |  |
| `RuntimeDeps` | — | — | — | 0 | ~~delete~~ |  |
| `compileSpec` | — | — | mastra#test | 2 | ~~delete~~ |  |
| `CompiledSpec` | — | — | — | 0 | ~~delete~~ |  |
| `SessionStore` | — | — | mastra | 1 | ~~delete~~ |  |
| `LoopRunSession` | — | — | mastra | 0 | ~~delete~~ |  |
| `WorldFactory` | — | — | mastra | 0 | ~~delete~~ |  |
| `worldFromTools` | yntelli | — | mastra | 2 | **public** |  |
| `StateView` | — | — | mastra | 0 | ~~delete~~ |  |
| `buildWorldTools` | — | — | mastra | 1 | ~~delete~~ |  |
| `buildTerminalTools` | — | — | mastra | 1 | ~~delete~~ |  |
| `makeGuardHooks` | — | — | mastra | 1 | ~~delete~~ |  |
| `makeInputProcessors` | — | — | mastra | 1 | ~~delete~~ |  |
| `repeatedToolCallStop` | — | — | mastra, mastra#test | 1 | ~~delete~~ |  |
| `GuardHooks` | — | — | mastra | 0 | ~~delete~~ |  |
| `jsonSchemaToZodObject` | — | — | mastra | 1 | ~~delete~~ |  |
| `jsonTypeToZod` | — | — | — | 1 | ~~delete~~ |  |
| `surfaceFingerprint` | — | — | mastra, mastra#test | 1 | ~~delete~~ |  |

### 7.3 `@looprun-ai/models` — 24 symbols (6 public · 2 internal · 16 delete)

| symbol | used by (consumers) | used by (sibling packages) | own pkg only | doc hits | verdict | note |
|---|---|---|---|---|---|---|
| `LocalModelSpec` | — | — | models | 0 | **public** | README + docs/guides/local-models.md headline API; code hit only in packages/mastra/canary |
| `ModelRuntimePort` | — | — | models | 2 | **public** | README + docs/guides/local-models.md headline API; code hit only in packages/mastra/canary |
| `RuntimeStatus` | — | — | models | 0 | ~~delete~~ |  |
| `EnsureServerResult` | — | — | models | 0 | ~~delete~~ |  |
| `MODEL_ALIASES` | — | — | — | 0 | ~~delete~~ |  |
| `QWEN35_4B` | — | — | models#test | 0 | ~~delete~~ |  |
| `QWEN35_RAM8` | — | — | models#test | 0 | ~~delete~~ |  |
| `QWEN36_RAM16` | — | — | models#test | 0 | ~~delete~~ |  |
| `QWEN36_RAM24` | — | — | models#test | 0 | ~~delete~~ |  |
| `QWEN36_RAM32` | — | — | models#test | 0 | ~~delete~~ |  |
| `resolveAlias` | — | — | models#test | 0 | internal | reached by `looprun` bin via dynamic `await import()` (namespace access) |
| `modelPath` | — | — | models, models#test | 0 | ~~delete~~ |  |
| `LlamaCppRuntime` | — | — | models#test | 0 | internal | reached by `looprun` bin via dynamic `await import()` (namespace access) |
| `launchFlags` | — | — | models#test | 0 | ~~delete~~ |  |
| `serverBaseURL` | — | — | — | 0 | ~~delete~~ |  |
| `slotStateDir` | — | — | — | 0 | ~~delete~~ |  |
| `downloadModel` | — | — | models | 0 | ~~delete~~ |  |
| `downloadUrl` | — | — | models#test | 0 | ~~delete~~ |  |
| `LocalModelOptions` | — | — | — | 0 | **public** | README + docs/guides/local-models.md headline API; code hit only in packages/mastra/canary |
| `localModel` | — | mastra | — | 3 | **public** | README + docs/guides/local-models.md headline API; code hit only in packages/mastra/canary |
| `localModelClient` | — | — | — | 0 | ~~delete~~ |  |
| `geminiFlashLiteThinkOff` | examples | — | — | 1 | **public** |  |
| `localModelStatus` | — | — | — | 0 | **public** | scripts/proofs/run-canary.mjs + `looprun` bin (dynamic import) |
| `LooprunLocalModelSpec` | — | — | — | 0 | ~~delete~~ |  |

### 7.4 `@looprun-ai/eval` — 52 symbols (11 public · 0 internal · 41 delete)

| symbol | used by (consumers) | used by (sibling packages) | own pkg only | doc hits | verdict | note |
|---|---|---|---|---|---|---|
| `loadSubject` | — | — | eval, eval#test | 0 | **public** | reached by `looprun-eval` bin via dynamic `await import()` (namespace access) |
| `validateSubject` | — | — | eval, eval#test | 0 | ~~delete~~ |  |
| `agentForCase` | — | — | eval | 0 | ~~delete~~ |  |
| `checkTrunkStatic` | — | — | eval, eval#test | 0 | ~~delete~~ |  |
| `readDeclaredTarget` | — | — | eval, eval#test | 0 | ~~delete~~ |  |
| `Subject` | — | — | eval, eval#test | 2 | ~~delete~~ |  |
| `SubjectCase` | — | — | eval | 0 | ~~delete~~ |  |
| `CaseTurn` | — | — | — | 0 | ~~delete~~ |  |
| `CaseInvariants` | — | — | eval | 0 | ~~delete~~ |  |
| `ReqCall` | — | — | — | 0 | ~~delete~~ |  |
| `RubricItem` | — | — | — | 0 | ~~delete~~ |  |
| `DeclaredTarget` | — | — | — | 0 | ~~delete~~ |  |
| `runCase` | — | — | eval, eval#test | 0 | ~~delete~~ |  |
| `toolCallMatches` | — | — | eval#test | 0 | ~~delete~~ |  |
| `evaluateInvariants` | — | — | eval#test | 0 | ~~delete~~ |  |
| `CaseDump` | — | — | eval, eval#test | 2 | ~~delete~~ |  |
| `DumpTurn` | — | — | — | 0 | ~~delete~~ |  |
| `DumpToolCall` | — | — | — | 0 | ~~delete~~ |  |
| `InvariantVerdict` | — | — | — | 0 | ~~delete~~ |  |
| `RunCaseOptions` | — | — | — | 0 | ~~delete~~ |  |
| `stripGovernance` | — | — | eval, eval#test | 0 | ~~delete~~ |  |
| `UngovernedBundle` | — | — | — | 0 | ~~delete~~ |  |
| `selectModel` | — | — | eval | 0 | ~~delete~~ |  |
| `SelectedModel` | — | — | — | 0 | ~~delete~~ |  |
| `TargetSelection` | — | — | — | 0 | ~~delete~~ |  |
| `foldVerdicts` | — | — | eval, eval#test | 0 | ~~delete~~ |  |
| `renderResultsMd` | — | — | eval | 0 | ~~delete~~ |  |
| `readJsonl` | — | — | eval | 0 | ~~delete~~ |  |
| `FoldResult` | — | — | — | 0 | ~~delete~~ |  |
| `FoldRow` | — | — | — | 0 | ~~delete~~ |  |
| `VerdictLine` | — | — | eval | 0 | ~~delete~~ |  |
| `buildCert` | — | — | eval | 0 | ~~delete~~ |  |
| `CertOptions` | — | — | — | 0 | ~~delete~~ |  |
| `CertSummary` | — | — | eval | 0 | ~~delete~~ |  |
| `runCommand` | — | — | — | 0 | **public** | reached by `looprun-eval` bin via dynamic `await import()` (namespace access) |
| `foldCommand` | — | — | eval#test | 0 | **public** | reached by `looprun-eval` bin via dynamic `await import()` (namespace access) |
| `certCommand` | — | — | eval#test | 0 | **public** | reached by `looprun-eval` bin via dynamic `await import()` (namespace access) |
| `RunCommandOptions` | — | — | — | 0 | ~~delete~~ |  |
| `FoldCommandOptions` | — | — | — | 0 | ~~delete~~ |  |
| `CertCommandOptions` | — | — | — | 0 | ~~delete~~ |  |
| `lintSource` | — | — | eval#test | 0 | ~~delete~~ |  |
| `lintPaths` | — | — | — | 0 | **public** | reached by `looprun-eval` bin via dynamic `await import()` (namespace access) |
| `lintSpecLaws` | — | — | — | 0 | **public** | reached by `looprun-eval` bin via dynamic `await import()` (namespace access) |
| `lintSpecExecution` | — | — | eval#test | 0 | **public** | reached by `looprun-eval` bin via dynamic `await import()` (namespace access) |
| `BANNED_TOKENS` | — | — | — | 0 | ~~delete~~ |  |
| `LintViolation` | — | — | — | 0 | ~~delete~~ |  |
| `lintSpecQuality` | — | — | — | 0 | **public** | reached by `looprun-eval` bin via dynamic `await import()` (namespace access) |
| `lintSubject` | — | — | — | 0 | **public** | reached by `looprun-eval` bin via dynamic `await import()` (namespace access) |
| `computeArtifactHash` | — | — | — | 0 | ~~delete~~ |  |
| `mintSeal` | — | — | eval#test | 0 | **public** | reached by `looprun-eval` bin via dynamic `await import()` (namespace access) |
| `verifySeal` | — | — | eval#test | 0 | **public** | reached by `looprun-eval` bin via dynamic `await import()` (namespace access) |
| `sealedFiles` | — | — | eval#test | 0 | ~~delete~~ |  |

### 7.5 `@looprun-ai/server` — 13 symbols (4 public · 0 internal · 9 delete)

| symbol | used by (consumers) | used by (sibling packages) | own pkg only | doc hits | verdict | note |
|---|---|---|---|---|---|---|
| `createOpenAiHandler` | — | — | server, server#test | 0 | ~~delete~~ |  |
| `DEFAULT_CONTEXT_LENGTH` | — | — | server#test | 0 | ~~delete~~ |  |
| `createModelServer` | examples | — | server#test | 0 | **public** |  |
| `SESSION_HEADER` | — | — | — | 0 | ~~delete~~ |  |
| `fingerprintSession` | — | — | server#test | 0 | ~~delete~~ |  |
| `lastUserText` | — | — | server, server#test | 0 | ~~delete~~ |  |
| `resolveSessionId` | — | — | server, server#test | 0 | ~~delete~~ |  |
| `CompletionRequestBody` | — | — | server | 0 | ~~delete~~ |  |
| `LoopRunEnvelopeMeta` | — | — | server | 0 | ~~delete~~ |  |
| `ModelServer` | — | — | server, server#test | 0 | **public** | companion type of `createModelServer` (public) — no standalone import |
| `ModelServerConfig` | — | — | server | 0 | **public** | companion type of `createModelServer` (public) — no standalone import |
| `TurnEvent` | examples | — | server#test | 0 | **public** |  |
| `WireMessage` | — | — | server, server#test | 0 | ~~delete~~ |  |

### 7.6 `@looprun-ai/vercel` — 2 symbols (0 public · 0 internal · 2 delete)

| symbol | used by (consumers) | used by (sibling packages) | own pkg only | doc hits | verdict | note |
|---|---|---|---|---|---|---|
| `VercelBackendConfig` | — | — | — | 0 | ~~delete~~ |  |
| `createLoopRunAgent` | — | — | — | 1 | ~~delete~~ |  |

---

**Row count check:** 149 + 25 + 24 + 52 + 13 + 2 = **265** — every symbol exported by the six `index.ts` files appears exactly once.
