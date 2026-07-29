# Symbol usage inventory — looprun simplification (Phase 0)

**Scan date:** 2026-07-28 · **Revised:** 2026-07-29 after two independent reviews (see §9) · **Branch:** `worktree-simplification`

This is the **authority** every later refactor task cites for cuts. One row per symbol exported from
the `src/index.ts` **barrel** of `core`, `mastra`, `models`, `eval`, `server`, `vercel` — 265 rows,
every symbol exactly once. It is a **barrel-only** enumeration; §8 lists what that leaves out.

---

## 1. Verdicts at a glance

```
package    public   internal   delete    total
--------   ------   --------   ------    -----
core          53        30        66       149
mastra         5         1        19        25
models         2         6        16        24
eval          13         0        39        52
server         4         0         9        13
vercel         0         0         2         2
--------   ------   --------   ------    -----
TOTAL         77        37       151       265
```

```
public   ██████████████████████████                    77  (29.1%)
internal ████████████                                  37  (14.0%)
delete   ███████████████████████████████████████████  151  (57.0%)
```

**Well over half** of the exported surface has no consumer outside the package that defines it.

---

## 2. What the verdicts mean

| verdict | rule | what the later tasks do with it |
|---|---|---|
| **public** | referenced from `examples/`, `skills/`, `scripts/`, `governance/`, `looprun-bench`, `agentspec`, `yntelli` | stays on the package's public `index.ts` |
| **internal** | referenced only from another `packages/*` (mastra / eval / server / models / vercel / the `looprun` CLI facade) | moves behind an `/internal` subpath export |
| **delete** | zero references outside the defining package's own `src/` and its own `test/` | drops off `index.ts` |

> ### `delete` means *stop exporting*, never *erase*
>
> A `delete` verdict removes the symbol from the public barrel. It does **not** authorize deleting the
> implementation. Most `delete` rows are still called by their own package's `src/` or exercised by its
> own tests, and a barrel-only scan is not a liveness analysis.
>
> **Live example for Task 5:** all 16 coherence/trunk symbols in §4 are `delete`, yet
> `packages/core/test/proofs/trunk-provenance.test.ts` imports and asserts on most of them. Removing the
> *exports* is safe; removing the *functions* breaks that proof suite. Whoever does Task 5 must decide
> the fate of that test explicitly, not implicitly.

---

## 3. Method — and where grep lies

Four passes, because a naive `grep -w Symbol` is wrong in both directions.

| pass | what it does | why |
|---|---|---|
| **A. word grep** | `grep -rlw` over all consumer roots | fast baseline; **over-counts** — `custom`, `Layer`, `Hook`, `Guard`, `Dim` are ordinary English words |
| **B. import-aware scan** | Node script parsing every `import {…} from`, `export {…} from`, `require({…})` and attributing each named binding to the module it came from | main evidence; a hit only counts when the file actually imports the symbol from `looprun*` / `@looprun-ai/*` (or a relative path inside the owning package) |
| **C. re-export resolution** | second scan resolving every consumer binding against the **owner** of the name rather than the specifier the consumer typed | closes pass B's cross-package blind spot (below) |
| **D. docs + dynamic imports** | `grep -a` over every `*.md` in the repo's published surface, plus manual reading of the two shipped `bin/*.mjs` and the four `agentspec/skill/scripts/*.mjs` | catches API that is real but invisible to static import parsing |

**Roots scanned** (always excluding `node_modules/` and `dist/`):

```
<worktree>/packages   <worktree>/examples   <worktree>/skills   <worktree>/scripts
<worktree>/tests      <worktree>/governance
/Users/marcos/Dev/js/looprun/looprun-bench
/Users/marcos/Dev/js/looprun/agentspec
/Users/marcos/Dev/js/yntelli/yntelli
```

### Four things static import parsing cannot see

**1 · Cross-package re-export.** `mastra/src/index.ts` ends with `export * from '@looprun-ai/core'`,
and every `packages/looprun/src/*.ts` is a pure `export *` facade. So a consumer writing
`from 'looprun/mastra'` may in fact be reaching a **core** symbol. Pass B attributed such bindings to
the specifier's package and silently dropped them.

> **Closure check (pass C).** Every named binding imported from any looprun specifier in every
> consumer root was re-resolved against the true owner of the name. Exactly **one** mismatch exists in
> the whole corpus:
>
> ```
> core|validateSpec  <-  yntelli via 'looprun/mastra'
> ```
>
> `validateSpec` is therefore **public**, not internal. No other core symbol is reached through a
> `mastra` or `looprun` specifier. The check is complete for the scanned roots.

**2 · Computed / dynamic namespace imports.** Six scripts load a looprun package through a value
specifier and reach members off the namespace object — invisible to any static parse.

| file | how | members reached |
|---|---|---|
| `packages/eval/bin/looprun-eval.mjs:54` | `const api = await import('@looprun-ai/eval')` | `runCommand foldCommand certCommand lintPaths lintSpecLaws lintSpecExecution lintSpecQuality lintSubject loadSubject mintSeal verifySeal` |
| `packages/looprun/bin/looprun.mjs:50` | `await import('@looprun-ai/models')` | `LlamaCppRuntime resolveAlias localModelStatus` |
| `scripts/proofs/run-canary.mjs:32` | `await import('@looprun-ai/models')` | `localModelStatus` |
| `agentspec/skill/scripts/synth-fork.mjs:105-106` | `importFromCwd('@looprun-ai/core' \| '@looprun-ai/eval')` | `core.renderTurnPrompt`, `evalPkg.loadSubject`, **`evalPkg.agentForCase`**, **`evalPkg.stripGovernance`** |
| `agentspec/skill/scripts/extract-fork.mjs:184-185` | `importFromCwd(...)` | `core.renderTurnPrompt`, `evalPkg.loadSubject` |
| `agentspec/skill/scripts/lint-guard-catalog.mjs:14` | `createRequire(...).resolve('@looprun-ai/core')` then reads `dist/guards.d.ts` | **every** `declare function` in `guards.d.ts` |

> **Closure check.** A namespace-member-access grep (`(core\|evalPkg\|models\|api)\.[A-Za-z0-9_]+`)
> over every dynamic-import site in every root yields exactly the 17 members above and nothing else.
> Effect on verdicts: `agentForCase` and `stripGovernance` → **public**; `renderTurnPrompt` →
> **public** (this one was missed by both reviews and found in re-verification).

**3 · Machine-enforced guard parity.** `agentspec/skill/scripts/lint-guard-catalog.mjs` reads the
**built** `guards.d.ts` and **fails CI** if any `declare function` there is absent from
`references/guard-catalog.md`. That is a hard, tested link between `packages/core/src/guards.ts` and
the generator skill's catalog, and it is why all 31 guard factories are **public** even where no
consumer imports them by name: several (`confirmFirst`, `destructiveThrottle`, `noDuplicateCall`, the
reply-honesty family) are auto-installed by the `AgentSpecBase` constructor, so consumer specs name
them only in prose. Removing one from `guards.ts` breaks agentspec's lint.
The **authoritative** catalog is `/Users/marcos/Dev/js/looprun/agentspec/skill/references/guard-catalog.md`.
(`looprun-bench/.agents/skills/agentspec/references/guard-catalog.md` and the `.claude/` twin are
**stale vendored snapshots** — do not cite them.)

**4 · Three source files are binary to `grep`.** `packages/core/src/coherence.ts`,
`packages/mastra/src/surface.ts` and `packages/server/src/session.ts` embed raw `\x00` / `\x01` bytes
as string separators. `file(1)` reports them as `data`, and **plain `grep` skips them with no match
and no warning**. Pass B (Node `readFileSync`) reads them correctly, and every grep in this document
used `grep -a`. See §6 finding 5.

### Policy: a doc mention is a note, never a promotion

Verdicts are **usage-based only**. A symbol that appears in a README, in `packages/core/GUARDS.md`,
or in a `governance/` proof but has no code consumer stays `delete` / `internal` — and instead carries
a note naming the doc, so **Task 12's documentation sweep** updates or removes that reference. The
`doc hits` column counts `*.md` mentions across `docs/` (excluding this plan's own files), `skills/`,
`examples/`, `governance/`, the root README, every `packages/*/README.md`, `packages/core/GUARDS.md`,
every `packages/*/CHANGELOG.md`, and `agentspec/skill` + `agentspec/docs`.

CHANGELOG hits were surveyed and **excluded from the notes** — a symbol named in a historical release
entry is not documented API. Notes cite only README / `GUARDS.md` / `governance/`.

Applying this policy consistently cost one earlier call: the first revision promoted `localModel` and
its three companion types to public on README evidence. Its **real** code usage is
`packages/mastra/canary/guard-canary.canary.ts` — a sibling package — so it is now **internal**, with a
loud note that `README.md:66`, `docs/illustrated-guide.md:485` and `docs/guides/local-models.md:71`
present it as the headline API. **That conflict is real and Task 12 must resolve it**: either the docs
overstate what is exported, or `models` needs a genuine public entry point.
`localModelStatus` and `geminiFlashLiteThinkOff` keep `public` on real code evidence
(`scripts/proofs/run-canary.mjs` and `examples/` respectively).

### Companion types

Where a `*Config` / `*Options` type exists only as the parameter of another value, it inherits that
value's verdict and carries a note: `AgentSpecConfig`, `LoopRunAgentConfig`, `LoopRunOptions`,
`ModelServer`, `ModelServerConfig`, `LocalModelOptions`, `ModelRuntimePort`, `LocalModelSpec`.

### Column key — and a caveat that matters

| column | meaning |
|---|---|
| **used by (consumers)** | `examples` · `skills` · `scripts` · `governance` · `bench` · `agentspec` · `yntelli` |
| **used by (sibling packages)** | another `packages/*`; `#test` marks a hit in that package's `test/` |
| **same-pkg cross-file imports** | the defining package's own `src/` (`core`) and `test/` (`core#test`) |
| **doc hits** | `*.md` files mentioning it, scope as above |

> **⚠ Read the third column correctly.** It counts **cross-file `import` statements only**. It does
> **not** count same-file usage, and it does not count a symbol used inside the file that declares it.
> A `—` there means *"no other file in this package imports it by name"* — it does **not** mean
> *"nothing uses it"* and it must **never** be read as *"safe to erase the implementation"*.
>
> Spot-measured: of the 76 rows showing `—`, roughly **63 are contradicted by real intra-package
> usage** (e.g. `foldRow`, `isSingleClause` and `DEFAULT_POLARITY_LEXICON` are all used inside
> `coherence.ts` itself). This does not affect a single verdict — `delete` and `internal` turn on the
> first two columns only — but it makes the third column useless as a liveness signal.

---

## 4. Pre-seeded zero-usage claims — RE-VERIFIED

The plan pre-seeded 16 symbols as measured at zero non-test usage. **All 16 confirmed as `delete`** by
an independent `grep -ra -w` across every root (`*.ts`, `*.mjs`, `*.md`): no consumer in `examples`,
`skills`, `scripts`, `looprun-bench`, `agentspec` or `yntelli` references any of them, and no sibling
package imports them.

| symbol | where it is still used |
|---|---|
| `findContradictions` | `core/test/proofs/trunk-provenance.test.ts` |
| `findDuplications` | `core/src/trunk.ts`, that proof test |
| `findMultiOwnerSubjects` | that proof test |
| `findSubjectlessLines` | that proof test |
| `findUnassessableLines` | **nothing** — its only other hit is a JSDoc `{@link}` in `coherence.ts:301` |
| `foldRow` | `coherence.ts:230` (inside `foldTrunk`) |
| `foldTrunk` | `core/src/trunk.ts`, that proof test |
| `withPolarityLexicon` | that proof test |
| `derivePolarity` | `core/src/trunk.ts`, that proof test |
| `deriveSubject` | `core/src/trunk.ts`, that proof test |
| `trunkLines` | that proof test |
| `mutatorLines` | that proof test |
| `isSingleClause` | `coherence.ts:309` and `:321` |
| `DEFAULT_POLARITY_LEXICON` | `coherence.ts:148` (default arg of `derivePolarity`) |
| `chainOrder` | `core/src/trunk.ts` |
| `renderTrunkBlocks` | `core/src/trunk.ts`, that proof test |

**Exactly one — `findUnassessableLines` — is genuinely referenced nowhere.** The other fifteen are
live code inside `core`; only their *export* is dead. (An earlier revision of this document wrongly
claimed four of them were unreferenced anywhere; that was an artifact of the column caveat above and
is corrected here.)

**Note for Task 5:** `coherence.ts` (428 lines) exports 33 symbols. `trunk.ts` imports 7 of them
(`derivePolarity`, `deriveSubject`, `foldTrunk`, `SubjectRule`, `TrunkBlock`, `TrunkLine`, `TrunkRow`);
the rest are used only within `coherence.ts` itself, only by `trunk-provenance.test.ts`, or not at all.

---

## 5. Spot-checks (independent re-grep)

| symbol | verdict | independent `grep -ra -w` result | agrees |
|---|---|---|---|
| `surfaceFingerprint` (mastra) | delete | `mastra/src/{agent,surface,index}.ts` + `mastra/test/native-surface.test.ts` — nothing else | yes |
| `redriveMessage` (core) | public | core src/test **+** `looprun-bench/.../shim/src/step-handler.ts` (real import) | yes |
| `pruneSupersededTerminals` (core) | internal | core src **+** `mastra/src/agent.ts` + `mastra/src/run-conversation.ts`; no consumer root | yes |
| `Layer` (core) | delete | only `core/src/spec.ts` + barrel. All 8 bench/yntelli hits are the English word in prose ("Layer rationale: …") — **spurious** | yes |
| `worldFromTools` (mastra) | public | `mastra/src/agent.ts` **+** `yntelli/.../specs/index.test.ts` → `from 'looprun/mastra'` | yes |
| `createLoopRunAgent` (mastra) | delete | defined + re-exported, **zero callers anywhere** | yes |
| `validateSpec` (core) | **public** *(corrected)* | `yntelli/.../marketing/specs/index.test.ts:7` and `.../super-admin/specs/index.test.ts:4`, both `import { validateSpec } from 'looprun/mastra'` | corrected |
| `agentForCase` (eval) | **public** *(corrected)* | `agentspec/skill/scripts/synth-fork.mjs:113` → `evalPkg.agentForCase(subject, caseId)` | corrected |
| `stripGovernance` (eval) | **public** *(corrected)* | `agentspec/skill/scripts/synth-fork.mjs:116` → `evalPkg.stripGovernance(spec, contract)` | corrected |
| `renderTurnPrompt` (core) | **public** *(corrected)* | `synth-fork.mjs:178,190` + `extract-fork.mjs:210,222` → `core.renderTurnPrompt({…})` | corrected |

---

## 6. Findings worth acting on beyond this task

| # | finding | impact |
|---|---|---|
| 1 | 151 / 265 exports (57%) have no consumer outside their own package; another 37 (14%) are consumed only by sibling packages. **Only 77 (29%) are user-facing.** | the headline number the plan is built on — confirmed |
| 2 | `packages/eval` exports 52; **39** are used only inside `eval/src` + `eval/test`. The real contract is the 13 the `looprun-eval` bin and the agentspec fork scripts call | eval's barrel can shrink ~75% |
| 3 | `packages/server` exports 13; only `createModelServer` + `TurnEvent` (+2 companion types) are consumed | same |
| 4 | `packages/models` exports 24; only `localModelStatus` and `geminiFlashLiteThinkOff` have consumer-root usage. The five `QWEN*` alias constants and `MODEL_ALIASES` have **no consumer at all**, and the README's headline `localModel` has none either | **the models docs and the models exports disagree — Task 12 must reconcile** |
| 5 | **`coherence.ts`, `surface.ts`, `session.ts` contain raw control bytes** (`\x00`, `\x01`) in string literals, so `file(1)` calls them `data` and plain `grep` skips them without warning | any future repo-wide grep audit is silently blind to 3 files. Fix: write the separators as escape sequences instead of raw bytes. Until then, use `grep -a` |
| 6 | **Three consumer imports name symbols that do not exist in any barrel:** `TrunkTheme` (`looprun-bench` atlas `index.ts` + `theme.ts` across several spec sets, and yntelli), `EvalCase` (`looprun-bench/.../evals/cases.ts`), `EvalConfig` (`looprun-bench/.../telecom/looprun.eval.config.ts`) — all imported from `@looprun-ai/core` / `@looprun-ai/eval` | **those consumer files cannot currently typecheck.** Any "no consumer uses X" claim drawn from `looprun-bench` is weakened accordingly: that repo is not in a compiling state against the current engine |
| 7 | `packages/vercel` is a 25-line reserved stub whose only two exports are unused; its `createLoopRunAgent` always throws and shadows the (also unused) mastra export of the same name | worth deciding whether the package ships at all |
| 8 | `packages/looprun` and `packages/looprun/src/core.ts` are pure `export *` facades over `@looprun-ai/core` | core's barrel shape propagates automatically — but see §3 blind spot 1: the facade is also how `validateSpec` escaped detection |

---

## 7. The table

Rows are grouped by package, in `index.ts` declaration order. `—` = no hits in that bucket.
Read the §3 column caveat before using the third column for anything.

### 7.1 `@looprun-ai/core` — 149 symbols (53 public · 30 internal · 66 delete)

| symbol | used by (consumers) | used by (sibling packages) | same-pkg cross-file imports | doc hits | verdict | note |
|---|---|---|---|---|---|---|
| `Dim` | — | — | core, core#test | 1 | ~~delete~~ | TASK 12: still referenced in published docs — packages/core/GUARDS.md |
| `AgentWorld` | bench, examples, yntelli | eval, eval#test, mastra, mastra#test, vercel | core, core#test | 9 | **public** |  |
| `ObservedCall` | bench | mastra, mastra#test | core, core#test | 1 | **public** |  |
| `GuardCtx` | bench | eval, mastra | core, core#test | 8 | **public** |  |
| `Guard` | bench, yntelli | mastra#test | core, core#test | 12 | **public** |  |
| `ReplyMutator` | — | — | core | 2 | ~~delete~~ | TASK 12: still referenced in published docs — packages/core/GUARDS.md |
| `SpatialEdge` | — | — | core | 0 | ~~delete~~ |  |
| `GuardExecutionError` | — | — | core, core#test | 0 | ~~delete~~ |  |
| `custom` | agentspec, bench, examples, yntelli | eval#test, mastra#test | core#test | 19 | **public** |  |
| `requiresBefore` | agentspec, bench, examples, yntelli | eval#test, mastra#test, server#test | core#test | 11 | **public** |  |
| `forbidThisTurn` | examples | mastra#test | core#test | 6 | **public** |  |
| `argRequired` | bench, yntelli | — | core#test | 11 | **public** |  |
| `argAbsent` | yntelli | — | core#test | 3 | **public** |  |
| `argFormat` | bench, examples, yntelli | mastra#test | core#test | 12 | **public** |  |
| `precondition` | agentspec, bench, yntelli | — | core#test | 8 | **public** |  |
| `maxCalls` | bench, examples, yntelli | — | core#test | 7 | **public** |  |
| `canonArgs` | yntelli | — | core | 3 | **public** |  |
| `noDuplicateCall` | — | mastra#test | core, core#test | 6 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `confirmFirst` | — | mastra#test | core, core#test | 12 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `noActAfterAskSameTurn` | bench, yntelli | — | core#test | 9 | **public** |  |
| `destructiveThrottle` | — | mastra#test | core, core#test | 12 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `resultInvariant` | — | mastra#test | core#test | 9 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `noFabricatedSuccess` | bench, examples, yntelli | mastra#test | core#test | 14 | **public** |  |
| `replyMustMention` | — | mastra#test | core#test | 4 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `replyMaxOccurrences` | — | mastra#test | core#test | 4 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `replySingleQuestion` | — | mastra#test | core#test | 4 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `replyConfirmsLabels` | — | eval#test | core#test | 4 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `emptyReply` | — | — | core, core#test | 10 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `degenerationGuard` | — | mastra#test | core, core#test | 7 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `pendingConfirmMustAsk` | bench, examples, yntelli | mastra#test | core#test | 13 | **public** |  |
| `destructiveClaimRequiresSuccess` | bench, examples, yntelli | mastra#test | core#test | 14 | **public** |  |
| `noFalseFailureClaim` | agentspec, bench | mastra#test | core, core#test | 17 | **public** |  |
| `minimalDisclosure` | — | mastra#test | core#test | 2 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `noInstructionFromData` | — | mastra#test | core#test | 2 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `noCompetitorClaim` | — | mastra#test | core#test | 2 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `noOutOfSurfaceActionClaim` | — | mastra#test | core#test | 2 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `noUngroundedRegulatedFigure` | — | mastra#test | core#test | 4 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `consentRequired` | — | mastra#test | core#test | 2 | **public** | guard-catalog.md (agentspec skill) documents it; auto-installed by AgentSpecBase — no direct consumer import |
| `jargonScrub` | agentspec, bench, examples, yntelli | mastra#test | core#test | 6 | **public** |  |
| `DENY_ONLY_PROSE_KINDS` | — | eval | — | 2 | internal |  |
| `CONFIRM_CLASS_KINDS` | — | eval | — | 2 | internal |  |
| `ARMED_SEAMS` | — | eval | — | 2 | internal |  |
| `AgentSpecBase` | agentspec, bench, examples, yntelli | eval#test, mastra#test, server#test | core, core#test | 13 | **public** |  |
| `resolveBindings` | — | — | core, core#test | 0 | ~~delete~~ |  |
| `resolveGuards` | bench | mastra | core, core#test | 0 | **public** |  |
| `resolveMutators` | — | — | core | 0 | ~~delete~~ |  |
| `AgentSpec` | bench, examples, yntelli | eval, eval#test, mastra, vercel | core | 17 | **public** |  |
| `AgentSpecConfig` | — | — | core | 8 | **public** | companion type of `AgentSpecBase` (public) — no standalone import |
| `AgentControls` | — | — | — | 3 | ~~delete~~ | TASK 12: still referenced in published docs — packages/core/GUARDS.md |
| `AgentScope` | — | — | — | 0 | ~~delete~~ |  |
| `ChainSpec` | — | — | core, core#test | 3 | ~~delete~~ | TASK 12: still referenced in published docs — packages/core/GUARDS.md |
| `GuardBinding` | — | eval | core | 0 | internal |  |
| `MutatorBinding` | — | — | — | 0 | ~~delete~~ |  |
| `StateDirective` | — | — | — | 2 | ~~delete~~ | TASK 12: still referenced in published docs — packages/core/GUARDS.md |
| `TerminalPolicy` | — | — | — | 0 | ~~delete~~ |  |
| `Hook` | — | — | core | 2 | ~~delete~~ | TASK 12: still referenced in published docs — packages/core/GUARDS.md |
| `ToolTarget` | — | — | core | 0 | ~~delete~~ |  |
| `Layer` | — | — | — | 0 | ~~delete~~ |  |
| `renderScopedSpecTrunk` | bench, yntelli | eval, mastra | core, core#test | 1 | **public** |  |
| `renderTrunkBlocks` | — | — | core#test | 0 | ~~delete~~ |  |
| `chainOrder` | — | — | — | 0 | ~~delete~~ |  |
| `DomainContract` | examples | eval, eval#test, mastra, mastra#test, vercel | core, core#test | 6 | **public** |  |
| `TrunkRenderOptions` | — | — | — | 0 | ~~delete~~ |  |
| `GUARD_KIND_SUBJECT` | — | — | core#test | 0 | ~~delete~~ |  |
| `derivePolarity` | — | — | core, core#test | 0 | ~~delete~~ |  |
| `deriveSubject` | — | — | core, core#test | 0 | ~~delete~~ |  |
| `foldRow` | — | — | — | 0 | ~~delete~~ |  |
| `foldTrunk` | — | — | core, core#test | 0 | ~~delete~~ |  |
| `trunkLines` | — | — | core#test | 0 | ~~delete~~ |  |
| `findContradictions` | — | — | core#test | 0 | ~~delete~~ |  |
| `findDuplications` | — | — | core#test | 0 | ~~delete~~ |  |
| `findMultiOwnerSubjects` | — | — | core#test | 0 | ~~delete~~ |  |
| `findSubjectlessLines` | — | — | core#test | 0 | ~~delete~~ |  |
| `findUnassessableLines` | — | — | — | 0 | ~~delete~~ |  |
| `isSingleClause` | — | — | — | 0 | ~~delete~~ |  |
| `DEFAULT_POLARITY_LEXICON` | — | — | — | 0 | ~~delete~~ |  |
| `withPolarityLexicon` | — | — | core#test | 0 | ~~delete~~ |  |
| `mutatorLines` | — | — | core#test | 0 | ~~delete~~ |  |
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
| `validateSpec` | — | eval, mastra | core#test | 0 | **public** | REACHED VIA THE MASTRA BARREL: yntelli `import { validateSpec } from 'looprun/mastra'` (criaty-api specs/index.test.ts:7, super-admin specs/index.test.ts:4) |
| `MAX_TOOL_SURFACE` | — | — | — | 0 | ~~delete~~ |  |
| `SpecWarning` | — | — | — | 0 | ~~delete~~ |  |
| `geminiThinkingOff` | yntelli | eval, models | core#test | 0 | **public** |  |
| `pinnedDecoding` | yntelli | eval | core#test | 1 | **public** |  |
| `normalizeModelParams` | — | mastra | core#test | 0 | internal |  |
| `resolveModelSettings` | — | mastra | core#test | 7 | internal | TASK 12: still referenced in published docs — packages/core/GUARDS.md |
| `SamplingSettings` | — | — | core | 0 | ~~delete~~ |  |
| `ToolDef` | bench, examples | eval, mastra, mastra#test, vercel | core | 3 | **public** |  |
| `TokenUsage` | — | mastra | — | 0 | internal |  |
| `TurnInput` | — | mastra | — | 0 | internal |  |
| `TurnRecord` | — | eval, mastra | — | 0 | internal |  |
| `RunResult` | — | mastra, mastra#test | — | 0 | internal |  |
| `RuntimeTurnInput` | — | — | — | 0 | ~~delete~~ |  |
| `RuntimeTurnRecord` | — | mastra | — | 0 | internal |  |
| `createLedger` | bench | mastra | core#test | 0 | **public** |  |
| `beginTurn` | bench | mastra | core#test | 2 | **public** |  |
| `resultOk` | — | mastra#test | core#test | 6 | internal |  |
| `recordVeto` | — | — | core, core#test | 0 | ~~delete~~ |  |
| `recordToolResult` | — | mastra | core#test | 1 | internal | TASK 12: still referenced in published docs — packages/vercel/README.md |
| `recordTerminal` | — | mastra | core#test | 0 | internal |  |
| `recordTerminalCall` | — | mastra | core#test | 0 | internal |  |
| `pruneSupersededTerminals` | — | mastra | — | 0 | internal |  |
| `vetoStormHit` | — | mastra | core#test | 0 | internal |  |
| `VETO_STORM_LIMIT` | — | — | core#test | 0 | ~~delete~~ |  |
| `TurnLedger` | — | mastra | core | 0 | internal |  |
| `PostToolViolation` | — | — | — | 0 | ~~delete~~ |  |
| `TERMINAL_TOOLS` | — | — | — | 1 | ~~delete~~ | TASK 12: still referenced in published docs — packages/core/GUARDS.md |
| `isTerminal` | — | mastra | core | 1 | internal | TASK 12: still referenced in published docs — packages/vercel/README.md |
| `terminalProtocol` | — | mastra | core | 1 | internal |  |
| `TERMINAL_PROTOCOL` | — | — | — | 0 | ~~delete~~ |  |
| `TERMINAL_PROTOCOL_REPLY_ONLY` | — | — | — | 0 | ~~delete~~ |  |
| `forcedTerminalPrompt` | — | mastra | — | 1 | internal | TASK 12: still referenced in published docs — packages/vercel/README.md |
| `terminalToolDefs` | — | mastra | — | 0 | internal |  |
| `normalizeTerminalToolDef` | — | mastra, mastra#test | — | 2 | internal |  |
| `prematureTerminalTools` | — | mastra, mastra#test | core#test | 0 | internal |  |
| `supersededTerminalCalls` | — | mastra | core#test | 0 | internal |  |
| `renderTurnPrompt` | — | mastra, mastra#test | — | 6 | **public** | FOUND IN RE-CHECK: agentspec skill/scripts/synth-fork.mjs:178,190 and extract-fork.mjs:210,222 via computed `importFromCwd('@looprun-ai/core')` → `core.renderTurnPrompt(...)` |
| `uploadDisplayLabels` | — | — | — | 2 | ~~delete~~ |  |
| `isReplyOnly` | — | — | — | 2 | ~~delete~~ |  |
| `TurnPrompt` | — | — | — | 0 | ~~delete~~ |  |
| `TurnPromptInput` | — | — | — | 0 | ~~delete~~ |  |
| `evaluatePreTool` | bench | mastra | core#test | 1 | **public** |  |
| `evaluateOnInput` | — | mastra | core#test | 0 | internal |  |
| `applyMutators` | — | — | — | 0 | ~~delete~~ |  |
| `checkReply` | — | — | — | 0 | ~~delete~~ |  |
| `enforcePostTool` | bench | mastra | core#test | 1 | **public** |  |
| `redriveMessage` | bench | — | core#test | 0 | **public** |  |
| `defaultExhaustionReply` | — | mastra#test | — | 1 | internal | TASK 12: still referenced in published docs — packages/core/GUARDS.md |
| `finalizeReply` | bench | mastra | core#test | 1 | **public** |  |
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

`mastra/src/index.ts` also ends with `export * from '@looprun-ai/core'`; those symbols are rows in §7.1. That line is exactly the blind spot described in §3.

| symbol | used by (consumers) | used by (sibling packages) | same-pkg cross-file imports | doc hits | verdict | note |
|---|---|---|---|---|---|---|
| `LoopRunAgent` | examples, yntelli | server, server#test | mastra#test | 15 | **public** |  |
| `createLoopRunAgent` | — | — | — | 0 | ~~delete~~ |  |
| `LoopRunAgentConfig` | — | — | — | 0 | **public** | companion type of `LoopRunAgent` (public) — no standalone import |
| `LoopRunOptions` | — | — | — | 0 | **public** | companion type of `LoopRunAgent` (public) — no standalone import |
| `LoopRunResultMeta` | — | server | — | 0 | internal |  |
| `runSpecConversation` | bench | eval | mastra, mastra#test | 1 | **public** |  |
| `DEFAULT_MAX_STEPS` | — | — | mastra | 0 | ~~delete~~ |  |
| `DEFAULT_REDRIVES` | — | — | mastra | 0 | ~~delete~~ |  |
| `RuntimeDeps` | — | — | — | 0 | ~~delete~~ |  |
| `compileSpec` | — | — | mastra#test | 3 | ~~delete~~ | TASK 12: still referenced in published docs — governance/MATRIX.md, governance/proofs/2026-07-28-compile-freeze-reply-only.md, README.md |
| `CompiledSpec` | — | — | — | 0 | ~~delete~~ |  |
| `SessionStore` | — | — | mastra | 0 | ~~delete~~ |  |
| `LoopRunSession` | — | — | mastra | 0 | ~~delete~~ |  |
| `WorldFactory` | — | — | mastra | 0 | ~~delete~~ |  |
| `worldFromTools` | yntelli | — | mastra | 1 | **public** |  |
| `StateView` | — | — | mastra | 0 | ~~delete~~ |  |
| `buildWorldTools` | — | — | mastra | 0 | ~~delete~~ |  |
| `buildTerminalTools` | — | — | mastra | 0 | ~~delete~~ |  |
| `makeGuardHooks` | — | — | mastra | 0 | ~~delete~~ |  |
| `makeInputProcessors` | — | — | mastra | 0 | ~~delete~~ |  |
| `repeatedToolCallStop` | — | — | mastra, mastra#test | 0 | ~~delete~~ |  |
| `GuardHooks` | — | — | mastra | 0 | ~~delete~~ |  |
| `jsonSchemaToZodObject` | — | — | mastra | 0 | ~~delete~~ |  |
| `jsonTypeToZod` | — | — | — | 0 | ~~delete~~ |  |
| `surfaceFingerprint` | — | — | mastra, mastra#test | 0 | ~~delete~~ |  |

### 7.3 `@looprun-ai/models` — 24 symbols (2 public · 6 internal · 16 delete)

| symbol | used by (consumers) | used by (sibling packages) | same-pkg cross-file imports | doc hits | verdict | note |
|---|---|---|---|---|---|---|
| `LocalModelSpec` | — | — | models | 0 | internal | companion type of `localModel` / `ModelRuntimePort` (internal) |
| `ModelRuntimePort` | — | — | models | 2 | internal | companion type of `localModel` (internal); the documented runtime seam in docs/guides/local-models.md:105. Also documented in README.md — Task 12 sweep |
| `RuntimeStatus` | — | — | models | 0 | ~~delete~~ |  |
| `EnsureServerResult` | — | — | models | 0 | ~~delete~~ |  |
| `MODEL_ALIASES` | — | — | — | 0 | ~~delete~~ |  |
| `QWEN35_4B` | — | — | models#test | 0 | ~~delete~~ |  |
| `QWEN35_RAM8` | — | — | models#test | 0 | ~~delete~~ |  |
| `QWEN36_RAM16` | — | — | models#test | 0 | ~~delete~~ |  |
| `QWEN36_RAM24` | — | — | models#test | 0 | ~~delete~~ |  |
| `QWEN36_RAM32` | — | — | models#test | 0 | ~~delete~~ |  |
| `resolveAlias` | — | — | models#test | 1 | internal | reached by `looprun` bin via dynamic `await import()` (namespace access) |
| `modelPath` | — | — | models, models#test | 0 | ~~delete~~ |  |
| `LlamaCppRuntime` | — | — | models#test | 0 | internal | reached by `looprun` bin via dynamic `await import()` (namespace access) |
| `launchFlags` | — | — | models#test | 0 | ~~delete~~ |  |
| `serverBaseURL` | — | — | — | 0 | ~~delete~~ |  |
| `slotStateDir` | — | — | — | 0 | ~~delete~~ |  |
| `downloadModel` | — | — | models | 0 | ~~delete~~ |  |
| `downloadUrl` | — | — | models#test | 0 | ~~delete~~ |  |
| `LocalModelOptions` | — | — | — | 0 | internal | companion type of `localModel` (internal) |
| `localModel` | — | mastra | — | 3 | internal | DOC-ONLY PROMOTION WITHDRAWN. Real code usage is `packages/mastra/canary/guard-canary.canary.ts` (sibling package) → internal. README:66, docs/illustrated-guide.md:485, docs/guides/local-models.md:71 document it as the headline API — Task 12 must reconcile. Also documented in README.md — Task 12 sweep |
| `localModelClient` | — | — | — | 0 | ~~delete~~ |  |
| `geminiFlashLiteThinkOff` | examples | — | — | 5 | **public** |  |
| `localModelStatus` | — | — | — | 0 | **public** | scripts/proofs/run-canary.mjs + `looprun` bin (dynamic import) |
| `LooprunLocalModelSpec` | — | — | — | 0 | ~~delete~~ |  |

### 7.4 `@looprun-ai/eval` — 52 symbols (13 public · 0 internal · 39 delete)

| symbol | used by (consumers) | used by (sibling packages) | same-pkg cross-file imports | doc hits | verdict | note |
|---|---|---|---|---|---|---|
| `loadSubject` | — | — | eval, eval#test | 2 | **public** | reached by `looprun-eval` bin via dynamic `await import()` (namespace access) |
| `validateSubject` | — | — | eval, eval#test | 0 | ~~delete~~ |  |
| `agentForCase` | — | — | eval | 1 | **public** | agentspec skill/scripts/synth-fork.mjs:113 via computed `importFromCwd('@looprun-ai/eval')` → `evalPkg.agentForCase(...)` |
| `checkTrunkStatic` | — | — | eval, eval#test | 0 | ~~delete~~ |  |
| `readDeclaredTarget` | — | — | eval, eval#test | 0 | ~~delete~~ |  |
| `Subject` | — | — | eval, eval#test | 3 | ~~delete~~ | TASK 12: still referenced in published docs — packages/eval/README.md |
| `SubjectCase` | — | — | eval | 2 | ~~delete~~ |  |
| `CaseTurn` | — | — | — | 0 | ~~delete~~ |  |
| `CaseInvariants` | — | — | eval | 0 | ~~delete~~ |  |
| `ReqCall` | — | — | — | 0 | ~~delete~~ |  |
| `RubricItem` | — | — | — | 0 | ~~delete~~ |  |
| `DeclaredTarget` | — | — | — | 0 | ~~delete~~ |  |
| `runCase` | — | — | eval, eval#test | 0 | ~~delete~~ |  |
| `toolCallMatches` | — | — | eval#test | 0 | ~~delete~~ |  |
| `evaluateInvariants` | — | — | eval#test | 0 | ~~delete~~ |  |
| `CaseDump` | — | — | eval, eval#test | 4 | ~~delete~~ | TASK 12: still referenced in published docs — packages/eval/README.md |
| `DumpTurn` | — | — | — | 0 | ~~delete~~ |  |
| `DumpToolCall` | — | — | — | 0 | ~~delete~~ |  |
| `InvariantVerdict` | — | — | — | 0 | ~~delete~~ |  |
| `RunCaseOptions` | — | — | — | 0 | ~~delete~~ |  |
| `stripGovernance` | — | — | eval, eval#test | 1 | **public** | agentspec skill/scripts/synth-fork.mjs:116 via computed `importFromCwd(...)` → `evalPkg.stripGovernance(...)` |
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
| `lintSpecQuality` | — | — | — | 1 | **public** | reached by `looprun-eval` bin via dynamic `await import()` (namespace access) |
| `lintSubject` | — | — | — | 1 | **public** | reached by `looprun-eval` bin via dynamic `await import()` (namespace access) |
| `computeArtifactHash` | — | — | — | 0 | ~~delete~~ |  |
| `mintSeal` | — | — | eval#test | 0 | **public** | reached by `looprun-eval` bin via dynamic `await import()` (namespace access) |
| `verifySeal` | — | — | eval#test | 0 | **public** | reached by `looprun-eval` bin via dynamic `await import()` (namespace access) |
| `sealedFiles` | — | — | eval#test | 1 | ~~delete~~ |  |

### 7.5 `@looprun-ai/server` — 13 symbols (4 public · 0 internal · 9 delete)

| symbol | used by (consumers) | used by (sibling packages) | same-pkg cross-file imports | doc hits | verdict | note |
|---|---|---|---|---|---|---|
| `createOpenAiHandler` | — | — | server, server#test | 1 | ~~delete~~ | TASK 12: still referenced in published docs — packages/server/README.md |
| `DEFAULT_CONTEXT_LENGTH` | — | — | server#test | 0 | ~~delete~~ |  |
| `createModelServer` | examples | — | server#test | 3 | **public** |  |
| `SESSION_HEADER` | — | — | — | 0 | ~~delete~~ |  |
| `fingerprintSession` | — | — | server#test | 0 | ~~delete~~ |  |
| `lastUserText` | — | — | server, server#test | 1 | ~~delete~~ |  |
| `resolveSessionId` | — | — | server, server#test | 0 | ~~delete~~ |  |
| `CompletionRequestBody` | — | — | server | 0 | ~~delete~~ |  |
| `LoopRunEnvelopeMeta` | — | — | server | 0 | ~~delete~~ |  |
| `ModelServer` | — | — | server, server#test | 0 | **public** | companion type of `createModelServer` (public) — no standalone import |
| `ModelServerConfig` | — | — | server | 0 | **public** | companion type of `createModelServer` (public) — no standalone import |
| `TurnEvent` | examples | — | server#test | 2 | **public** |  |
| `WireMessage` | — | — | server, server#test | 0 | ~~delete~~ |  |

### 7.6 `@looprun-ai/vercel` — 2 symbols (0 public · 0 internal · 2 delete)

| symbol | used by (consumers) | used by (sibling packages) | same-pkg cross-file imports | doc hits | verdict | note |
|---|---|---|---|---|---|---|
| `VercelBackendConfig` | — | — | — | 0 | ~~delete~~ |  |
| `createLoopRunAgent` | — | — | — | 0 | ~~delete~~ |  |

---

**Row count check:** 149 + 25 + 24 + 52 + 13 + 2 = **265** — every symbol exported by the six
`index.ts` **barrels** appears exactly once.

---

## 8. Enumeration scope — what this table does NOT cover

This is a **barrel-only** inventory. Two categories of exported symbol are outside it. They are listed
here so the document is not mistaken for a total enumeration of the packages' export surface.

### 8.1 The `./testing` subpaths (28 symbols)

`core` and `mastra` each publish a **second** entry point in `package.json`:

```
@looprun-ai/core     "."  "./testing"
@looprun-ai/mastra   "."  "./testing"
@looprun-ai/models   "."
@looprun-ai/eval     "."
@looprun-ai/server   "."
@looprun-ai/vercel   "."
looprun              "."  "./core"  "./mastra"  "./models"  "./vercel"   (pure `export *` facades)
```

| subpath | symbols | consumers found |
|---|---|---|
| `@looprun-ai/core/testing` (19) | `FixtureWorld` `FIXTURE_DOMAIN` `FIXTURE_LABEL_SCHEME` `FIXTURE_LEXICON` `FIXTURE_TOOL_DEFS` `FIXTURE_TOOL_NAMES` `FixturePreset` `runL1` `AUTO_LAYER_KINDS` `buildCollectiveSpec` `buildIsolatedSpec` `craftCtx` `requireMake` `GuardProof` `ProofCase` `ProofLoopCase` `PartialGuardCtx` `ProofExpect` `ProofPolarity` | `packages/core/test/**`, `packages/mastra/test/**`, and a **documentation string** in `skills/looprun-governance/scripts/scaffold-proof-cases.mjs` telling users to `import type { GuardProof } from '@looprun-ai/core/testing'` |
| `@looprun-ai/mastra/testing` (9) | `fakeLLM` `scriptedModel` `ScriptedModel` `ScriptPart` `ScriptStep` `assertSignal` `expectedSignal` `pickRecord` `runProofLoop` | `packages/mastra/test/**`, `packages/server/test/**` |

Deliberately test-only surfaces; the governance skill points users at `GuardProof`. A later
"delete unused exports" pass must not sweep them up without a separate decision.

### 8.2 Symbols exported from non-barrel `src/` files (20 symbols)

These are `export`ed from a module but **not** re-exported by the package barrel, so they are not
reachable through the package's public entry point and are not rows in §7. They are the natural
population for a "should this even be `export`?" pass.

| package | file | symbols |
|---|---|---|
| `server` (15) | `handler.ts` | `HandlerInternals` |
| | `openai.ts` | `estimateTokens` `CompletionUsage` `buildUsage` `completionId` `buildCompletion` `buildChunk` `buildModelList` `WireErrorCode` `errorBody` |
| | `session.ts` | `SessionLocks` `SessionTtl` |
| | `sse.ts` | `sseData` `StreamedTurn` `streamCompletion` |
| `eval` (4) | `provider.ts` | `PROVIDER_ENDPOINTS` |
| | `seal.ts` | `Seal` `SealTarget` `SealVerification` |
| `mastra` (1) | `tools.ts` | `SessionAccessor` |
| `core`, `models`, `vercel` | — | none |

> One review reported 21 here, including `booksAgent` in `mastra`. Re-checked: `booksAgent` occurs only
> inside a JSDoc `@example` block in `packages/mastra/src/agent.ts:6` (`  *   export const booksAgent = …`).
> It is not an export. The correct count is **20**.

---

## 9. Revision log

Revised 2026-07-29 after two independent reviews. Verdict-changing corrections:

| # | change | evidence |
|---|---|---|
| 1 | `core.validateSpec` — internal → **public** | reached through the mastra barrel from yntelli; pass-C closure check proves it is the only such case |
| 2 | `eval.agentForCase`, `eval.stripGovernance` — delete → **public** | computed `importFromCwd` in `agentspec/skill/scripts/synth-fork.mjs` |
| 3 | `core.renderTurnPrompt` — internal → **public** | same mechanism in `synth-fork.mjs` + `extract-fork.mjs`; **found during re-verification, missed by both reviews** |
| 4 | `models.localModel` + `LocalModelOptions` + `ModelRuntimePort` + `LocalModelSpec` — public → **internal** | the earlier promotion rested on README evidence; applying the usage-based policy consistently, the only code usage is `packages/mastra/canary/` |

Non-verdict corrections: §4 prose (three symbols wrongly called unreferenced); the third-column
caveat; the doc-hit sweep widened to READMEs / `GUARDS.md` / `governance/` / CHANGELOGs with
doc-reference notes for Task 12; §8.2 added; the stale vendored guard-catalog copies flagged; the
non-typechecking consumer imports recorded as finding 6.

Totals moved from 77 / 35 / 153 to **77 / 37 / 151**.
