# Tutorial outline — the public API contract (Phase 1)

**Date:** 2026-07-29 · **Revised:** 2026-07-29 after two independent reviews (see §8) · **Branch:** `worktree-simplification`
**Consumes:** `docs/superpowers/specs/2026-07-28-symbol-inventory.md` (Task 1 — the usage authority)
**Binds:** Tasks 3–7 converge every `src/index.ts` onto the union below; Tasks 8–11 write the chapters.

---

## 0. What this document is

The design's contract principle:

> **A concept that does not appear in the tutorial either becomes internal (not exported) or is deleted.**

So this outline is not a table of contents — it is **the target public API**, expressed as
"who teaches what". The union of the six per-chapter symbol lists **is** the public surface of
looprun after Phase 2. Nothing else stays on a barrel.

```
inventory (Task 1)            this outline (Task 2)          tasks 3-7
usage-based verdicts    ──►   teaching-based placement  ──►  index.ts files
79 public (round-2 base)      89 taught in a chapter         export exactly these 89
```

**Terms.** A chapter **teaches** a symbol when it explains that symbol's API — signature, when to
reach for it, one example. A chapter may **mention** names it does not teach (chapter 01 mentions all
three headline nouns and teaches none). Placement is about *teaching*: each of the 89 symbols is
taught in exactly one chapter.

### The two rules that decide types

The round-2 baseline of 79 was a **value**-centric list; three chapters turned out to be unwritable
from it, because the types the reader must author were not exported (§8). Two rules close that, and
Tasks 3–7 apply them as stated:

> **1 · The annotation rule.** A type is public **iff the tutorial shows the reader writing a value of
> it in a position TypeScript will not infer** — an authored case pack, a named `deps` object, the
> parameter of a helper the reader writes. A type that only ever appears as the *inferred* result of a
> taught call stays off the barrel: `const r = await runSpecConversation(…)` needs no name.
>
> **2 · The taught-field rule.** For a config object, a field the tutorial **teaches** has its
> authored type public; a field it does not teach keeps its type off the barrel. Chapter 03 teaches
> `scope` and `terminal`, so `AgentScope` and `TerminalPolicy` are public; it does not teach `flow`,
> `directives`, `chains` or `sampling`, so `SpatialEdge`, `StateDirective`, `ChainSpec` and
> `SamplingSettings` stay off it.

Rule 1 is what stops the regress: `runCommand({ subject: './x' })` passes an **object literal**, which
needs no annotation, so `RunCommandOptions` is not promoted; but `evals/cases.ts` exports an array
that is only type-checked against the contract if it is annotated, so `SubjectCase` is.

---

## 1. The contract at a glance

```
chapter                    symbols taught
------------------------   --------------
01-concepts                 0   (concept-only)
02-hello-world              3   ███
03-agent-anatomy           11   ███████████
04-guards                  35   ███████████████████████████████████
05-running-and-eval        27   ███████████████████████████
06-advanced                13   █████████████
------------------------   --------------
TOTAL                      89
```

| package | round-2 baseline | taught here | delta |
|---|---|---|---|
| `core` | 53 | 51 | −10 demoted, +8 promoted |
| `mastra` | 5 | 7 | +2 promoted |
| `models` | 4 | 8 | +4 promoted |
| `eval` | 13 | 19 | +6 promoted |
| `server` | 4 | 4 | — |
| `vercel` | 0 | 0 | — |
| **total** | **79** | **89** | **+20 / −10** |

Inventory totals move round-2 79 / 35 / 151 → round-3 83 / 31 / 151 → **round-4 89 / 38 / 138**,
recorded in the inventory's §9 rounds 3 and 4. Every delta is a §9 row.

---

## 2. The running example — and where it lives

One domain carries all six chapters: the **calendar assistant** (`scheduler`), whose purpose sentence
comes from the `examples/calendar` seed:

> Messaging-driven calendar management: add events from relative dates with reminders, check the
> schedule, reschedule and cancel — never double-book, never delete without asking.

Chosen because that sentence already contains two hard governance obligations ("never double-book",
"never delete without asking"), so guards are motivated by the domain instead of invented for the doc.

> ### The scheduler artifacts do not exist yet — Tasks 8–9 author them
>
> `examples/calendar/` is a **seed**: a README and an `.env.example`, no TypeScript, and (uniquely
> among the seeds) not even a `tools.json`. Nothing in it can be imported. **`examples/` stays
> seeds-only** — that is what the agentspec skill consumes.
>
> The snippet package `docs/tutorial/snippets/` is the home of the tutorial's code. Tasks 8–9 author,
> as shared modules there:
>
> | module | what it is | first used by |
> |---|---|---|
> | the scheduler **spec** | an `AgentSpecBase` subclass: scope, the three tools, terminal, contract | 02 (one-tool cut), 03 (full) |
> | the scheduler **world** | a hand-written `AgentWorld` with `listEvents` / `addEvent` / `cancelEvent` and in-memory state | 03 |
> | the scheduler **tool defs** | `ToolDef[]` for that surface | 03 |
> | a small **eval subject** | a subject directory (`norms/` · `gen/` · `evals/`) with three cases | 05 |
>
> Chapters import from these shared modules rather than re-declaring the domain, so a chapter's code
> block stays the size of its idea. Every snippet compiles against the monorepo packages via the
> Task 8 harness.

Each chapter uses a cut of the same domain:

```
01  the scheduler drawn as a diagram, no code
02  scheduler with ONE tool (listEvents)          ~20 lines
03  the full scheduler spec + hand-written world
04  the full scheduler world + one guard per row of GUARD_CATALOG
05  the scheduler subject (3 cases) run end to end, governed and ungoverned
06  the same scheduler served over HTTP, and run on a local model
```

---

## 3. Chapters

Each chapter states the specifier its snippets import from, because the `looprun` npm facade only
publishes `.`, `./core`, `./mastra`, `./models`, `./vercel` — there is **no** `looprun/eval` or
`looprun/server`, so 05 and 06 must use the scoped package names (§6, decision 5).

### 01-concepts.md

**Goal.** Give the reader the mental model — spec = the map, guards = the safety kit, agent = the
GPS that drives it — so every later chapter has a place to hang.

**Imports.** None.

**Symbols taught.** *None.* Deliberately code-free: it names `AgentSpec`, `Guard` and `LoopRunAgent`
and points at the chapter that teaches each. Placing a symbol here would mean teaching an API before
the reader can run anything.

**Example used.** The scheduler as an annotated diagram: user turn → spec-derived system prompt →
model proposes `cancelEvent` → pre-tool gate → tool result → reply check → reply.

---

### 02-hello-world.md

**Goal.** From `npm i` to a governed agent answering a real turn in about twenty lines.

**Imports.** `looprun/mastra` (its barrel re-exports core, so hello world needs one specifier).

**Symbols taught (3).**

| symbol | package | why here |
|---|---|---|
| `LoopRunAgent` | mastra | the one class the reader constructs |
| `LoopRunAgentConfig` | mastra | companion — the constructor argument |
| `LoopRunOptions` | mastra | companion — the per-call options |

**Used here, taught in 03.** The config cannot be built from three symbols alone. The chapter uses,
without explaining, and each mention links forward:

`AgentSpecBase` (the two-line spec subclass) · `AgentWorld` (the one-tool world) · `ToolDef` (the
`listEvents` declaration) · the model (any AI-SDK model; 05 pins one, 06 runs one locally).

Task 9 must not expand this list. If hello world needs a fourth concept, that is a signal the chapter
is too big, not that the contract should grow.

**Example used.** The scheduler reduced to a single read-only tool (`listEvents`), imported from the
shared snippet module, plus one `await agent.generate(...)`.

---

### 03-agent-anatomy.md

**Goal.** Show how the pieces relate — what a spec declares, what a world provides, where the tool
surface comes from, and how a guard gets bound to a hook.

**Imports.** `looprun` (≡ `looprun/core`) — the two `looprun/mastra` adapters moved to 06 (§7 amendment).

**Symbols taught (11).** *(was 13 — see the §7 amendment: `worldFromTools` and `StateView` moved to 06.)*

| symbol | package | role |
|---|---|---|
| `AgentSpecBase` | core | the class you extend |
| `AgentSpec` | core | the structural type a spec satisfies |
| `AgentSpecConfig` | core | companion — the `AgentSpecBase` constructor argument |
| `AgentScope` | core | the authored `{ lane, others }` scope declaration |
| `TerminalPolicy` | core | the authored `(world) => boolean` terminal test |
| `DomainContract` | core | the domain-level obligations a spec is written against |
| `ToolDef` | core | how a tool is declared to the model |
| `AgentWorld` | core | state + tool execution — **the certified path is to hand-write one** |
| `Hook` | core | `'onInput' \| 'preTool' \| 'postTool' \| 'onReply'` — `addGuard`'s first argument |
| `ToolTarget` | core | `'any' \| string[]` — `addGuard`'s second argument |
| `validateSpec` | core | fail fast on an incoherent spec |

**`addGuard` is named here, and it is not a new row.** `AgentSpecBase#addGuard(hook, target, guard,
opts?)` is the mechanism that binds any factory from chapter 04 to a spec, and it *throws* on an
illegal dim×hook pairing (`spec.ts:494`) — so the reader meets it with the anatomy, and chapter 04
cross-references it instead of re-teaching it. It is a method of an already-taught class, which is
why `Hook` and `ToolTarget` are rows and `addGuard` is not.

**`worldFromTools` moved to chapter 06** (§7 amendment). Chapter 03 teaches hand-writing
`AgentWorld` as the default and certified path, and leaves a three-line forward reference that a
second path exists. The native-tools story — and `docs/guides/mcp-tools.md`, which it absorbs — now
belongs to 06.

**Example used.** The full scheduler spec — three tools, scope, terminal, `DomainContract` — plus its
hand-written world, with a `validateSpec` assertion in a test.

---

### 04-guards.md

**Goal.** A complete, browsable catalog: every guard, what it prevents, one minimal example — plus
how to write your own when nothing fits.

**Imports.** `looprun` (≡ `looprun/core`).

**Generated, not hand-written.** Task 4 turns `guards.ts` into per-category files with a
`GUARD_CATALOG` data structure; Task 10's generator renders this chapter from it. That is also what
keeps it in sync with `agentspec/skill/references/guard-catalog.md`, which `lint-guard-catalog.mjs`
enforces in CI against the built `guards.d.ts`. **All 30 public guard factories therefore belong
here** — including the ones `AgentSpecBase` auto-installs, which no consumer imports by name but which
the lint requires to exist.

**30, not 31 — `canonArgs` is a helper, not a factory** (Task 4 finding, adjudicated). It returns a
`string` fingerprint, not a `Guard`, and every existing gate already says so: the parity extractor
asserts `canonArgs` is not a factory, `GUARDS.md` calls it "the `canonArgs` helper", and the agentspec
reference gives it no catalog row. So `GUARD_CATALOG` carries **30 entries** — 29 guard kinds + the
`jargonScrub` mutator — and the chapter teaches `canonArgs` **in prose** (see the Task 10 amendment
below for where it landed), as the fingerprint `noDuplicateCall` is built on. Chapter 04's taught
count is unchanged at 35 (§4): 4 vocabulary types + 30 catalog rows + `canonArgs`.

**`GUARD_CATALOG` and `GuardCatalogEntry` are NOT in this contract.** They ship on
`@looprun-ai/core/internal` and the generator imports them from there (§6, decision 4). They are
build input for the chapter, not API the chapter teaches.

**Symbols taught (35).**

*The vocabulary a guard is written in (4):*

| symbol | package | role |
|---|---|---|
| `Guard` | core | what every factory returns |
| `GuardCtx` | core | what a guard sees when it fires |
| `ObservedCall` | core | one recorded tool call inside that context |
| `Dim` | core | `'spatial' \| 'input' \| 'run' \| 'output' \| 'behavior'` — required by `custom`, and what `addGuard` validates the hook against |

*The catalog — 30 factories, referenced collectively by `GUARD_CATALOG`, grouped as the generated
chapter groups them (plus `canonArgs`, taught in prose — see above):*

**Grouped by `hook`, the enforcement PHASE** (controller ruling, Task 10) — the axis the authoritative
agentspec reference organizes by, and the one that decides what a rule can see and therefore enforce.
`custom` is listed apart because its hook follows the `dim` its author passes, so it belongs to no
single phase; `category` (the FILE a factory lives in) is shown per row inside the chapter but is not
the grouping axis.

| group (hook) | factories |
|---|---|
| `preTool` (13) | `requiresBefore` `forbidThisTurn` `maxCalls` `noDuplicateCall` · `argRequired` `argAbsent` `argFormat` (+ `canonArgs` in prose) · `precondition` `consentRequired` · `confirmFirst` `noActAfterAskSameTurn` `destructiveThrottle` · `noInstructionFromData` |
| `postTool` (1) | `resultInvariant` |
| `onReply` (14) | `pendingConfirmMustAsk` `noFabricatedSuccess` `destructiveClaimRequiresSuccess` `noFalseFailureClaim` `noOutOfSurfaceActionClaim` `noUngroundedRegulatedFigure` `noCompetitorClaim` `replyMustMention` `replyMaxOccurrences` `replySingleQuestion` `replyConfirmsLabels` `emptyReply` `degenerationGuard` `minimalDisclosure` |
| `onReplyMutate` (1) | `jargonScrub` |
| escape hatch (1) | `custom` |

**Example used.** Each catalog row renders its own minimal call site, and the chapter closes with a
`custom` guard written against `GuardCtx` and `Dim` (see the amendment below).

#### Amendment (Task 10): three corrections this section could not have foreseen

Writing the chapter against the real catalog moved three things. Recorded here so nobody reads the
chapter as having drifted from its contract — the **taught set is unchanged** (35 symbols; §4 is
untouched), and all three are placement or accuracy, not surface.

| # | this section said | what shipped, and why |
|---|---|---|
| 1 | `canonArgs` is taught "inside the argument-shape section" | there is no argument-shape section: the ruled grouping is by `hook`, and `argRequired`/`argAbsent`/`argFormat` are three rows inside `preTool`. `canonArgs` is taught in **§4**, the last hand-written page before the catalog, next to the confusable-pairs guidance it belongs with |
| 2 | each row renders a snippet "**against the scheduler world**" | catalog examples are **domain-neutral by construction** (P8a) and self-contained — `requiresBefore(['findBooking'])`, not a calendar call. Rewriting 30 of them into scheduler vocabulary would have made the catalog a second, drifting copy of the domain. The scheduler carries the hand-written half instead: §4's `canonArgs` block and §6's `custom` guard, both from `snippets/04-guards.ts` |
| 3 | the chapter "opens with `confirmFirst` on `cancelEvent`, `precondition` for never double-book" | the scheduler as Task 9 actually authored it uses `destructiveTools` (which *installs* `confirmFirst` — naming it again would render the rule twice) and a `custom` clash gate, because `precondition`'s predicate never sees the acting call's arguments and therefore cannot express a clash. The chapter opens by restating what chapter 03 really built |

---

### 05-running-and-eval.md

**Goal.** Run a spec over a scripted conversation, then measure it — the loop that turns "it seemed
fine" into a number you can re-run.

**Imports.** `looprun/mastra` (the runner) · `looprun` (the turn/result types and the decoding
helpers) · `looprun/models` (`geminiFlashLiteThinkOff`) · **`@looprun-ai/eval`** — the facade has no
`looprun/eval` subpath (§6, decision 5).

**Symbols taught (27), in four sections.**

*5.1 Run a conversation (5)*

| symbol | package | role |
|---|---|---|
| `runSpecConversation` | mastra | `(spec, turns, deps) => Promise<RunResult>` |
| `TurnInput` | core | the authored turns array |
| `RuntimeDeps` | mastra | the authored deps: `model`, `world`, `toolDefs`, `modelParams`, … |
| `RunResult` | core | what comes back |
| `TurnRecord` | core | one element of `RunResult.turnRecords` — what you assert on |

*5.2 Pin the decoding, so a re-run means something (3)*

| symbol | package | role |
|---|---|---|
| `pinnedDecoding` | core | deterministic decoding for reproducible evals |
| `geminiThinkingOff` | core | the model-params shape that actually disables thinking |
| `geminiFlashLiteThinkOff` | models | the cloud validation model, thinking off |

Placed here, not in 06: their purpose is a measurement you can repeat, which is this chapter's whole
subject.

*5.3 The subject directory contract (7)* — an eval subject is a **directory with a fixed layout**,
and the chapter teaches the layout before any command:

```
<subject>/
├── norms/index.ts     exports SPECS (id → AgentSpec), CONTRACT, optional CASE_AGENT routing
├── gen/world.ts       the deterministic world factory  (preset → AgentWorld)
├── gen/tools.json     the agent-facing ToolDef[]
├── evals/cases.ts     export default cases: SubjectCase[]
└── ask/targets.json   the declared model target (flags/env override it)
```

| symbol | package | role |
|---|---|---|
| `loadSubject` | eval | directory → `Subject` |
| `Subject` | eval | the loaded bundle; parameter of `agentForCase` and `lintSubject` |
| `SubjectCase` | eval | **authored** — one case: setup, turns, expectations, targets |
| `CaseTurn` | eval | authored — `SubjectCase.turns` |
| `CaseInvariants` | eval | authored — required / forbidden tool calls |
| `ReqCall` | eval | authored — one entry of those, with `anyArgs` subset matching |
| `RubricItem` | eval | authored — `SubjectCase.expectations.rubric` |

*5.4 Measure it — the `looprun-eval` CLI (12)*

Taught **CLI-first**: the shipped `packages/eval/bin/looprun-eval.mjs` reaches these by dynamic
namespace import, and that bin is the user-facing contract. Each exported function is named as the
programmatic equivalent, called with an **object literal** — which is why their option and result
types are not in this contract (annotation rule, §0).

| symbol | package | role |
|---|---|---|
| `runCommand` | eval | `looprun-eval run` |
| `foldCommand` | eval | `looprun-eval fold` |
| `certCommand` | eval | `looprun-eval cert` |
| `lintPaths` | eval | lint a set of spec files |
| `lintSpecLaws` | eval | law-level spec lint |
| `lintSpecExecution` | eval | execution-level spec lint |
| `lintSpecQuality` | eval | quality-level spec lint |
| `lintSubject` | eval | lint a subject bundle for coverage + world gaps |
| `mintSeal` | eval | seal a result set |
| `verifySeal` | eval | verify a seal |
| `agentForCase` | eval | which spec a case routes to |
| `stripGovernance` | eval | the ungoverned control arm of an A/B |

**Example used.** The scheduler subject with three cases (happy path, cancel-without-confirm, double
booking): author `evals/cases.ts`, then `looprun-eval run` → `fold` → `cert` → `mintSeal` /
`verifySeal`, then the same three cases governed and ungoverned via `stripGovernance`. Absorbs
`docs/guides/eval-config.md` and `docs/guides/measured-loop.md`.

---

### 06-advanced.md

**Goal.** Take the same spec somewhere else: serve it over an OpenAI-compatible endpoint, or run it
on a local model with no cloud key.

**Imports.** **`@looprun-ai/server`** (no `looprun/server` subpath — §6, decision 5) · `looprun/models`
· `looprun/mastra` (the native-tools world seam).

**Symbols taught (13), in three sections.** *(was 11 — see the §7 amendment.)*

*6.1 Serve it — an OpenAI-compatible endpoint (4)*

| symbol | package | role |
|---|---|---|
| `createModelServer` | server | the server factory |
| `ModelServer` | server | companion — the returned handle |
| `ModelServerConfig` | server | companion — the factory argument |
| `TurnEvent` | server | the streamed per-turn event |

*6.2 Run it locally (7)*

| symbol | package | role |
|---|---|---|
| `localModel` | models | one call → a governed agent on a local llama.cpp model (§7) |
| `LocalModelOptions` | models | companion — `autoStart` / `autoDownload` / `runtime` |
| `LocalModelSpec` | models | companion — what `resolveAlias` returns and the runtime consumes |
| `ModelRuntimePort` | models | the runtime seam (llama.cpp today; MLX/ollama later) |
| `resolveAlias` | models | alias → validated model spec |
| `LlamaCppRuntime` | models | the shipped runtime: model file, server spawn, health-wait |
| `localModelStatus` | models | is the binary / file / server actually there |

Taught in the order the CLI does it: `npx looprun models pull` → `status` → then the library path.
Absorbs `docs/guides/local-models.md`.

*6.3 Native tools and MCP — the other execution model (2)*

| symbol | package | role |
|---|---|---|
| `worldFromTools` | mastra | **native-tools mode only** — see below |
| `StateView` | mastra | the state reads `worldFromTools` is given |

**`worldFromTools` is not "an AgentWorld from plain functions".** It synthesizes a world for
**native-tools mode**, where Mastra assigned tools / toolsets / MCP tools execute *themselves*; the
returned world's `exec` **throws** if anything calls it, and its only job is to supply state reads
(from the `StateView`) for stateful guards and `contract.stateBlock`. Two facts the section must
carry, because together they are the likeliest first-run failure: Mastra v1's `MCPClient.listTools()`
namespaces every tool as `serverName_toolName`, and the spec surface is **deny-by-default**
(`agent-construction.ts:80-97` throws on a surface tool the host does not provide, and logs a loud
`console.error` for a host tool the surface does not list). So the spec must declare the namespaced
name. Absorbs `docs/guides/mcp-tools.md`.

**Not here: "bring your own loop."** The round-3 outline had a fourth section teaching the governance
primitives (`createLedger`, `evaluatePreTool`, `finalizeReply`, …) for enforcing a spec inside a
foreign runtime. It was **dropped as unteachable** — see §8. Those ten symbols are demoted to
`@looprun-ai/core/internal`, where the bench shim and the agentspec fork scripts keep using them.

**Not here: `@looprun-ai/vercel`.** `packages/vercel/src/index.ts` is a 25-line reserved stub whose
`createLoopRunAgent` always throws, and whose two exports have no consumer. There is nothing to teach
that would be true. Its fate is a Task 12 decision — see §5.

**Example used.** The same scheduler twice: behind `createModelServer` and called with a stock OpenAI
client; then on `qwen3.5-4b` via `localModel`, with `localModelStatus` shown as the "why isn't it
working" step.

---

## 4. Completeness check — inventory → outline

All 89 symbols, and the chapter that claims each. `↑` = promoted into public by this outline.

| package | chapter | symbols |
|---|---|---|
| mastra | **02** (3) | `LoopRunAgent` `LoopRunAgentConfig` `LoopRunOptions` |
| core | **03** (11) | `AgentSpecBase` `AgentSpec` `AgentSpecConfig` `AgentScope`↑ `TerminalPolicy`↑ `DomainContract` `ToolDef` `AgentWorld` `Hook`↑ `ToolTarget`↑ `validateSpec` |
| core | **04** (35) | `Guard` `GuardCtx` `ObservedCall` `Dim`↑ · `custom` `requiresBefore` `forbidThisTurn` `argRequired` `argAbsent` `argFormat` `precondition` `maxCalls` `canonArgs` `noDuplicateCall` `confirmFirst` `noActAfterAskSameTurn` `destructiveThrottle` `resultInvariant` `noFabricatedSuccess` `replyMustMention` `replyMaxOccurrences` `replySingleQuestion` `replyConfirmsLabels` `emptyReply` `degenerationGuard` `pendingConfirmMustAsk` `destructiveClaimRequiresSuccess` `noFalseFailureClaim` `minimalDisclosure` `noInstructionFromData` `noCompetitorClaim` `noOutOfSurfaceActionClaim` `noUngroundedRegulatedFigure` `consentRequired` `jargonScrub` |
| core | **05** (5) | `TurnInput`↑ `RunResult`↑ `TurnRecord`↑ `geminiThinkingOff` `pinnedDecoding` |
| mastra | **05** (2) | `runSpecConversation` `RuntimeDeps`↑ |
| models | **05** (1) | `geminiFlashLiteThinkOff` |
| eval | **05** (19) | `loadSubject` `Subject`↑ `SubjectCase`↑ `CaseTurn`↑ `CaseInvariants`↑ `ReqCall`↑ `RubricItem`↑ `agentForCase` `stripGovernance` `runCommand` `foldCommand` `certCommand` `lintPaths` `lintSpecLaws` `lintSpecExecution` `lintSpecQuality` `lintSubject` `mintSeal` `verifySeal` |
| server | **06** (4) | `createModelServer` `ModelServer` `ModelServerConfig` `TurnEvent` |
| models | **06** (7) | `localModel`↑ `LocalModelOptions`↑ `LocalModelSpec`↑ `ModelRuntimePort`↑ `resolveAlias` `LlamaCppRuntime` `localModelStatus` |
| mastra | **06** (2) | `worldFromTools` `StateView`↑ |

**Per-chapter:** 0 + 3 + 11 + 35 + 27 + 13 = **89**.
**Per-package:** core 51 · mastra 7 · models 8 · eval 19 · server 4 · vercel 0 = **89**, matching the
inventory's round-4 §1 chart exactly. No symbol appears twice; no inventory-public symbol is missing.

---

## 5. What the tutorial deliberately does NOT teach

Stated so Tasks 3–7 do not have to re-derive it, and so nobody reads a gap as an oversight.

| left out | count | why |
|---|---|---|
| inventory `internal` symbols | 38 | sibling-only or seam-only. They move behind `/internal` — including the **ten bring-your-own-loop symbols demoted by this revision** (§8, defect 2) |
| inventory `delete` symbols | 138 | no consumer outside the defining package and no tutorial home; they leave the barrel (the implementation is a separate decision — inventory §2) |
| option / result types of the `looprun-eval` entry points | 9 | `RunCommandOptions` `FoldCommandOptions` `CertCommandOptions` `CertSummary` `LintViolation` `FoldResult` `FoldRow` `UngovernedBundle` `VerdictLine` — every one is either an object-literal argument or an inferred result, so the annotation rule (§0) leaves them off |
| authored types of **fields and options the tutorial does not teach** | 6 | `AgentSpecConfig` fields: `SpatialEdge` (`flow`) `StateDirective` (`directives`) `ChainSpec` (`chains`) `SamplingSettings` (`sampling`) `MutatorBinding` (reply mutators). Plus one **`addGuard` opts** field: `Layer` — `'minimal' | 'base' | 'full' | 'agent'` (`spec.ts:36`), the framework's own auto-install tiers, not something a reader sets. All by the taught-field rule (§0) |
| `@looprun-ai/core/testing` (19) and `@looprun-ai/mastra/testing` (9) | 28 | a separate, deliberately test-only entry point. `GuardProof` is pointed at by the governance skill; that stays true and stays out of the six chapters |
| `GUARD_CATALOG`, `GuardCatalogEntry` | 2 | build input for chapter 04, not API it teaches — `@looprun-ai/core/internal` (§6, decision 4) |
| **`@looprun-ai/vercel`** | 2 | **excluded from the tutorial: a non-functional stub.** `createLoopRunAgent` always throws; both exports are unused. No chapter can teach it honestly. **Whether the package ships at all is a Task 12 decision that must be surfaced to the user** — this outline does not decide it |

---

## 6. Decisions resolved here, for Tasks 4–12

| # | decision | owner |
|---|---|---|
| 1 | **The scheduler artifacts are authored in `docs/tutorial/snippets/`** as shared modules (spec, world, tool defs, eval subject). `examples/` stays seeds-only — it is the agentspec skill's input, not the tutorial's | Tasks 8–9 |
| 2 | **Chapter 04 is generated** from `GUARD_CATALOG`; the generator and the agentspec `guard-catalog.md` lint must agree on the same **30 rows** (Task 4 adjudication: `canonArgs` returns a `string`, so it is a helper taught in prose, not a catalog row — see §3's chapter-04 note) | Tasks 4 + 10 |
| 3 | **Section 6.4 is dropped**; its ten symbols move to `@looprun-ai/core/internal`. Task 7 must keep the bench shim and the agentspec fork scripts working against that subpath | Task 7 |
| 4 | **`GUARD_CATALOG` + `GuardCatalogEntry` export from `@looprun-ai/core/internal`, not the public barrel**; Task 10's generator imports from `/internal`. This **amends the plan's Task 4 wording** ("exported publicly") to match the contract principle. Note both names have **no inventory rows** — they do not exist until Task 4 creates them — so this decision is their only record, and Task 4's reviewer must check the resulting exports against it. **Amended (controller ruling, Task 4):** `GuardCatalogEntry` gained a `hook` field (`'preTool' \| 'postTool' \| 'onReply' \| 'onReplyMutate'`) so the generated chapter can group by enforcement phase the way the agentspec reference does — `category` stays file-derived; both names remain `/internal`-only | Task 4 |
| 5 | **Import specifiers:** 02 `looprun/mastra` · 03 `looprun` · 04 `looprun` · 05 `looprun/mastra` + `looprun` + `looprun/models` + **`@looprun-ai/eval`** · 06 **`@looprun-ai/server`** + `looprun/models` + `looprun/mastra`. The facade publishes only `.` `./core` `./mastra` `./models` `./vercel`. **Open: add `looprun/eval` + `looprun/server` facades** so the tutorial uses one package name throughout? | Task 12 |
| 6 | **`@looprun-ai/vercel` is excluded from the tutorial** (non-functional stub). Package fate — ship, fix or drop — is a Task 12 decision to surface to the user | Task 12 |
| 7 | The nine superseded docs are deleted only after their absorbing chapter exists (local-models → 06, eval-config + measured-loop → 05, **mcp-tools → 06** — moved from 03 by the §7 amendment) | Task 12 |
| 8 | **`GuardExecutionError` ships on `@looprun-ai/core/internal`** (Task 3, controller ruling). It is a class the runtime *throws at the consumer* when a guard's `check()`/`prose()` throws, so it must be reachable from some entry point or `catch (e) { if (e instanceof GuardExecutionError) … }` is unwritable outside this package. **Resolved (Task 10): it stays on `/internal`.** Chapter 04 §6 **mentions** it — "a guard that throws is an author bug; the runtime re-throws a `GuardExecutionError` naming the hook, the binding id, the kind and the tool" — but does not teach its API, because the intended reaction is to *fix the guard*, not to catch the error by class. Under §0's teach-vs-mention terms a mention is not teaching, so it is not one of the 89 and does not move. Counts unchanged: 04 teaches 35, core 51 | Task 10 |

---

## 7. Resolution: `localModel` is public

The inventory's §9 revision #4 demoted `localModel` (and `LocalModelOptions`, `ModelRuntimePort`,
`LocalModelSpec`) from public to internal. That was correct **under the inventory's own rule** —
verdicts there are usage-based, and `localModel`'s only code consumer is
`packages/mastra/canary/guard-canary.canary.ts`, a sibling package. The inventory flagged the
conflict loudly (finding 4: "the models docs and the models exports disagree") and left it to be
resolved. This outline resolves it.

**Decision: chapter 06 teaches `localModel`, so it flips back to public** — on tutorial-contract
grounds, which the design makes a stronger authority than the usage scan.

```
inventory rule   usage decides    →  localModel internal (one canary uses it)
contract rule    tutorial decides →  localModel PUBLIC   (06 teaches it)
```

| | |
|---|---|
| **What it is** | `localModel('qwen3.5-4b')` → an AI-SDK model ready for `new LoopRunAgent({ model })`. It resolves the alias, ensures the GGUF, spawns and health-waits llama-server, and returns the client |
| **The alternative 06 would have to teach** | `resolveAlias` → `new LlamaCppRuntime()` → `ensureModel` → `ensureServer` → `createOpenAI({ baseURL }).chat(spec.servedId)` — five steps that reimplement, badly, the function that already exists |
| **What the docs already promise** | `README.md:66`, `docs/illustrated-guide.md:485` and `docs/guides/local-models.md:71` headline it. Chapter 06 absorbs `local-models.md` |
| **The cost of the other branch** | the reader hand-assembles a client on every local run, and Task 12 *retracts* the local-models story from three published docs rather than moving it |

The three companion types ride along under the annotation rule (§0).

**On the brief's wording.** Task 2's brief describes only one correction direction — downgrade a
public symbol that fits no chapter. Promotion is the same principle read the other way, and it is a
**sanctioned amendment**: the design's contract principle defines the public API as what the tutorial
teaches, which cannot be satisfied if a taught symbol may not be promoted. The controller ruled on
each promotion in this revision; every one is recorded in the inventory's §9 rounds 3–4 with the
signature or authored shape that forces it.

### Amendment (Task 9): `worldFromTools` + `StateView` move 03 → 06

Writing chapter 03 showed the native-tools path is a **deployment** topic, not an anatomy one. It
presupposes a second execution model (tools that execute themselves, including MCP), a host that
owns the state, and the deny-by-default surface intersection in `agent-construction.ts:80-97` —
none of which a reader meeting `AgentWorld` for the first time can evaluate. Teaching it inside 03
also forced the chapter to describe an `AgentWorld` whose `exec` throws two sections after teaching
that `exec` is the world's whole job.

```
   before   03 (13) = 11 core + worldFromTools + StateView      06 (11)
   after    03 (11) = 11 core                                   06 (13) = 11 + the two
```

**Counts:** per-chapter 0 + 3 + 11 + 35 + 27 + 13 = **89**, unchanged. Per-package unchanged
(`mastra` still 7). No verdict changed — this is placement only, and it is recorded as the
inventory's §9 round 7. Chapter 03 keeps a three-line forward reference so a reader who needs the
path knows it exists and where it lives; `docs/guides/mcp-tools.md` is now absorbed by 06, which
moves its Task 12 deletion behind Task 11 instead of Task 9.

### The type-closure rider (added by Task 3)

A contract of exactly the taught symbols is not compilable on its own. A downstream library that
builds with `declaration: true` — as `@looprun-ai/mastra` does — must be able to **name** every type
its emitted `.d.ts` mentions, and a taught signature drags untaught types behind it: `validateSpec`
returns `SpecWarning[]`, `AgentSpec.controls` is an `AgentControls` reaching `ChainSpec` /
`StateDirective` / `SamplingSettings`, `AgentSpec.guards` is `GuardBinding` / `MutatorBinding`
reaching `Layer`, `jargonScrub` returns a `ReplyMutator`. With those off the barrel the consumer
gets `TS4023`/`TS2742` ("cannot be named without a reference to …") — a break no `pnpm -r build` in
this repo can see, because each package emits declarations only for its own sources.

**The rider:** each barrel additionally exports, as `export type` and nothing more, the transitive
type closure of its own value signatures. These are **not taught**, get no chapter, and are **not
counted in the 89** — they are a compilation obligation, listed separately so nobody mistakes them
for surface anybody chose. The closure is derived mechanically, never hand-picked, and it shrinks
automatically as Tasks 5–6 shrink what the signatures touch. Two tests hold the line:
`packages/core/test/proofs/declaration-emit.test.ts` proves the list is **sufficient** (it compiles a
real consumer against the published `exports` map), and `surface-lock.test.ts` proves it has not
quietly **grown**.

For `core` the rider is 11 types: `SpecWarning` `AgentControls` `ChainSpec` `StateDirective`
`GuardBinding` `MutatorBinding` `Layer` `SpatialEdge` `ReplyMutator` `SamplingSettings` `TokenUsage`.
Tasks 4–7 derive their own package's rider the same way; a symbol appearing there is not a promotion
and must not be read as one.

**The per-package rider lists** (`mastra` needs none — it re-exports core's whole barrel, and its
own three taught types are already public). Each is derived from that package's own value
signatures and locked by its `surface-lock.test.ts`:

| package | rider | forced by |
|---|---|---|
| `models` (2) | `RuntimeStatus` `EnsureServerResult` | `localModelStatus` returns `Promise<RuntimeStatus>`; `ModelRuntimePort.ensureServer` / `LlamaCppRuntime#ensureServer` return `EnsureServerResult` |
| `eval` (9) | `RunCommandOptions` `FoldCommandOptions` `CertCommandOptions` `CertSummary` `LintViolation` `UngovernedBundle` `Seal` `SealTarget` `SealVerification` | the parameter/return types of the taught `looprun-eval` verbs — §5 keeps all of them out of the *taught* contract by the annotation rule, which is a statement about teaching, not about nameability |
| `server` (3) | `LoopRunResultMeta` `CompletionRequestBody` `WireMessage` | `TurnEvent.meta` is a `LoopRunResultMeta`; `ModelServerConfig.resolveSession` is `(body: CompletionRequestBody, headers: Headers) => string`, and `CompletionRequestBody.messages` is `WireMessage[]` |

#### `TurnEvent.meta` — decided by Task 7b: the mirror keeps its name

Task 7's review left one question open: `TurnEvent` is public, and its `meta` field's type is
`LoopRunResultMeta` — a copy the server declares because the original is internal to
`@looprun-ai/mastra`, which has no `/internal` subpath. Either export the copy as a rider, or type
the field with an inline structural type.

**Decision: export it as a rider** (the row above), for three reasons — an inline structural type
would (a) give the shape a *second*, anonymous definition in the same package, so
`packages/server/test/meta-mirror.test.ts`, which pins the mirror against mastra's declaration at
compile time, would no longer be pinning the thing `TurnEvent` actually uses; (b) hand the reader an
unnameable 6-field object every time they write `function onTurn(e: TurnEvent) { … e.meta … }` and
hoist it; and (c) invent a mechanism where the rider mechanism already covers exactly this case.
Being a rider, `LoopRunResultMeta` is **not** taught, gets no chapter, and does not change server's
count of 4.

---

## 8. What the two reviews found, and what changed

Round 3 placed all 83 symbols and passed a mechanical 83-vs-83 check — while three chapters were
unwritable from the surface they claimed. Recorded so the failure mode is not repeated: **a
completeness diff proves the contract is closed, not that it is sufficient.** Every fix below was
verified against the source file and line named.

| # | defect | fix |
|---|---|---|
| 1 | **The running example did not exist.** `examples/calendar/` is a README and an `.env.example` — no `.ts`, and alone among the seeds, no `tools.json`. The outline asserted "three tools", "the full scheduler world", "the scheduler eval subject (3 cases)" as if importable | §2 now states the artifacts are **authored by Tasks 8–9 in `docs/tutorial/snippets/`**, with a module table. `examples/` stays seeds-only. Recorded as decision 1 |
| 2 | **§6.4 "bring your own loop" was unteachable.** It taught `createLedger` / `beginTurn`, but closing that loop needs `recordToolResult`, `resultOk`, `isTerminal`, `terminalProtocol`, `TurnLedger` — all internal. Without `recordToolResult` the ledger's `observed` stays empty and every history-keyed guard (`confirmFirst`, `noDuplicateCall`, `requiresBefore`, `destructiveThrottle`) **silently never fires**: a chapter shipping a governance hole | **Section dropped.** All ten symbols demoted public → internal, reason "no tutorial home" (inventory §9 #7). The seam stays whole on `@looprun-ai/core/internal` for the bench shim and fork scripts |
| 3 | **Chapter 04's vocabulary was incomplete.** `custom({ kind, dim, check, prose })` requires `dim: Dim` (`guards.ts:24`) and `Dim` was `delete`; and no chapter named `addGuard`, the mechanism that binds a factory to a spec and throws on an illegal dim×hook pairing (`spec.ts:494`) | `Dim` promoted → 04's vocabulary is `Guard` `GuardCtx` `ObservedCall` `Dim`. 03 names `addGuard` as the binding surface (a method of the taught `AgentSpecBase`, not a new row) and 04 cross-references it. `Hook` + `ToolTarget` promoted as its parameter types; **`Layer` deliberately not** — it is only an opts field for the framework's own install tiers |
| 4 | **`worldFromTools` was misdescribed** as "build an `AgentWorld` from plain tool functions". It synthesizes a **native-tools-mode** world whose `exec` **throws** (`world-adapters.ts:24`) and supplies state only | Role line corrected; 03 now teaches **hand-writing `AgentWorld`** as the certified path and `worldFromTools` as the native-tools adapter. `StateView` promoted (the reader authors it) |
| 5 | **Chapter 02 could not be built from its 3 symbols** — the config needs a spec and a world | An explicit "used here, taught in 03" list, with a note that Task 9 must not expand it |
| 6 | **Chapter 05's headline signature was unnameable.** `runSpecConversation(spec, turns: TurnInput[], deps: RuntimeDeps): Promise<RunResult>` — all three unexported; the authored cases were `SubjectCase[]`, verdict `delete` | `TurnInput` `RuntimeDeps` `RunResult` `TurnRecord` promoted; the authored case types (`SubjectCase` `CaseTurn` `CaseInvariants` `ReqCall` `RubricItem`) and `Subject` promoted; **the subject directory contract** added as explicit 05 content |
| 7 | **Chapter 06 was a 24-symbol grab-bag** | Rescoped to 11: server + local models. The decoding trio moved to 05 (reproducible evals is its subject); 6.4 dropped; vercel excluded with its fate recorded for Task 12 |
| 8 | **No chapter said what to import from.** The `looprun` facade has no `/eval` or `/server` subpath | Per-chapter import specifier stated; adding the two facades recorded as decision 5 for Task 12 |
| 9 | `GUARD_CATALOG` — the plan's Task 4 said "exported publicly", contradicting a contract of exactly the taught symbols | Resolved as decision 4: `@looprun-ai/core/internal`, generator imports from there. Plan amendment |
