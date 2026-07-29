# Tutorial outline — the public API contract (Phase 1)

**Date:** 2026-07-29 · **Branch:** `worktree-simplification`
**Consumes:** `docs/superpowers/specs/2026-07-28-symbol-inventory.md` (Task 1 — the usage authority)
**Binds:** Tasks 3–7 converge every `src/index.ts` onto the union below; Tasks 9–11 write the chapters.

---

## 0. What this document is

The design's contract principle:

> **A concept that does not appear in the tutorial either becomes internal (not exported) or is deleted.**

So this outline is not a table of contents — it is **the target public API**, expressed as
"who teaches what". The union of the six per-chapter symbol lists **is** the public surface of
looprun after Phase 2. Nothing else stays on a barrel.

```
inventory (Task 1)          this outline (Task 2)           tasks 3-7
usage-based verdicts   ──►  teaching-based placement   ──►  index.ts files
79 public                   83 taught in a chapter          export exactly these 83
```

**Terms.** A chapter **teaches** a symbol when it explains that symbol's API — signature, when to
reach for it, one example. A chapter may **mention** names it does not teach (chapter 01 mentions
all three headline nouns and teaches none). Placement is about *teaching*: each of the 83 symbols is
taught in exactly one chapter.

**Companion types ride along.** A pure type that exists only as a parameter or return of a taught
value (`AgentSpecConfig`, `LoopRunOptions`, `ModelServerConfig`, `LocalModelSpec`, …) is listed with
its owning symbol and counted once. No chapter is padded with bare type names.

---

## 1. The contract at a glance

```
chapter                    symbols taught
------------------------   --------------
01-concepts                 0   (concept-only)
02-hello-world              3   ███
03-agent-anatomy            8   ████████
04-guards                  34   ██████████████████████████████████
05-running-and-eval        14   ██████████████
06-advanced                24   ████████████████████████
------------------------   --------------
TOTAL                      83
```

| package | inventory public | taught here | delta |
|---|---|---|---|
| `core` | 53 | 53 | — |
| `mastra` | 5 | 5 | — |
| `models` | 4 | **8** | +4 (§7: `localModel` promoted) |
| `eval` | 13 | 13 | — |
| `server` | 4 | 4 | — |
| `vercel` | 0 | 0 | — |
| **total** | **79** | **83** | **+4 / −0** |

**Zero downgrades.** Every one of the 79 inventory-public symbols found a chapter. Four symbols were
**promoted** from internal (§7). No symbol was orphaned, so the inventory's §9 records a promotion,
never a "no tutorial home" downgrade.

---

## 2. The running example

One domain carries all six chapters: the **calendar assistant** (`scheduler`) from
`examples/calendar`.

> Messaging-driven calendar management: add events from relative dates with reminders, check the
> schedule, reschedule and cancel — never double-book, never delete without asking.

It is chosen because its purpose sentence already contains two hard governance obligations
("never double-book", "never delete without asking"), so guards are motivated by the domain rather
than invented for the doc. Each chapter uses a cut of the same spec:

```
01  the scheduler drawn as a diagram, no code
02  scheduler with ONE tool (listEvents)          ~20 lines
03  the full scheduler spec                       tools, scope, terminal, contract
04  the full scheduler world + one guard per row of GUARD_CATALOG
05  the scheduler eval subject (3 cases) run end to end
06  the same scheduler served, run locally, and embedded in a foreign loop
```

Snippets compile against the monorepo packages via the Task 8 harness.

---

## 3. Chapters

### 01-concepts.md

**Goal.** Give the reader the mental model — spec = the map, guards = the safety kit, agent = the
GPS that drives it — so every later chapter has a place to hang.

**Symbols taught.** *None.* This chapter is deliberately code-free: it names `AgentSpec`,
`Guard` and `LoopRunAgent` and points at the chapter that teaches each. Placing a symbol here would
mean teaching an API before the reader can run anything.

**Example used.** The scheduler as an annotated diagram: user turn → spec-derived system prompt →
model proposes `cancelEvent` → pre-tool gate → tool result → reply check → reply. No compiling code.

---

### 02-hello-world.md

**Goal.** From `npm i` to a governed agent answering a real turn in about twenty lines.

**Symbols taught (3).**

| symbol | package | why here |
|---|---|---|
| `LoopRunAgent` | mastra | the one class the reader constructs |
| `LoopRunAgentConfig` | mastra | companion — the constructor argument |
| `LoopRunOptions` | mastra | companion — the per-call options |

**Example used.** The scheduler reduced to a single read-only tool (`listEvents`), a two-line spec
subclass and one `await agent.run(...)`. The spec class is *used* here and *explained* in 03.

---

### 03-agent-anatomy.md

**Goal.** Show how the pieces relate — what a spec declares, what a world provides, and where the
tool surface comes from.

**Symbols taught (8).**

| symbol | package | role |
|---|---|---|
| `AgentSpecBase` | core | the class you extend; scope, tools, terminal, guard bindings |
| `AgentSpec` | core | the structural type a spec satisfies |
| `AgentSpecConfig` | core | companion — the `AgentSpecBase` constructor argument |
| `DomainContract` | core | the domain-level obligations a spec is written against |
| `ToolDef` | core | how a tool is declared to the model |
| `AgentWorld` | core | the state + tool implementations a run executes against |
| `worldFromTools` | mastra | build an `AgentWorld` from plain tool functions |
| `validateSpec` | core | fail fast on an incoherent spec (the check consumers already run in tests) |

**Example used.** The full scheduler spec: three tools (`listEvents`, `addEvent`, `cancelEvent`), the
scope sentence, the terminal declaration, its `DomainContract`, and a `validateSpec` assertion in a
test. Absorbs today's `docs/guides/mcp-tools.md` for the "tools come from MCP" variant.

---

### 04-guards.md

**Goal.** A complete, browsable catalog: every guard, what it prevents, one minimal example — plus
how to write your own when nothing fits.

**Generated, not hand-written.** Task 4 turns `guards.ts` into per-category files with a
`GUARD_CATALOG` data structure; this chapter is generated from it. That is also what keeps it in sync
with `agentspec/skill/references/guard-catalog.md`, which `lint-guard-catalog.mjs` enforces in CI
against the built `guards.d.ts`. **All 31 public guard factories therefore belong here** — including
the ones `AgentSpecBase` auto-installs, which no consumer imports by name but which the lint requires
to exist.

**Symbols taught (34).**

*The vocabulary a guard is written in (3):*

| symbol | package | role |
|---|---|---|
| `Guard` | core | what every factory returns |
| `GuardCtx` | core | what a guard sees when it fires |
| `ObservedCall` | core | one recorded tool call inside that context |

*The catalog — 31 factories, referenced collectively by `GUARD_CATALOG`, grouped as the generated
chapter groups them:*

| group | factories |
|---|---|
| argument shape (4) | `argRequired` `argAbsent` `argFormat` `canonArgs` |
| sequencing & pre-tool (8) | `requiresBefore` `forbidThisTurn` `precondition` `maxCalls` `noDuplicateCall` `confirmFirst` `noActAfterAskSameTurn` `destructiveThrottle` |
| tool result (1) | `resultInvariant` |
| reply honesty (6) | `noFabricatedSuccess` `destructiveClaimRequiresSuccess` `noFalseFailureClaim` `pendingConfirmMustAsk` `noOutOfSurfaceActionClaim` `noUngroundedRegulatedFigure` |
| reply shape & content (8) | `replyMustMention` `replyMaxOccurrences` `replySingleQuestion` `replyConfirmsLabels` `emptyReply` `degenerationGuard` `jargonScrub` `minimalDisclosure` |
| policy & safety (3) | `noInstructionFromData` `noCompetitorClaim` `consentRequired` |
| escape hatch (1) | `custom` |

**Example used.** Each catalog row renders a two-to-six-line snippet against the scheduler world.
The chapter opens with the two guards the purpose sentence demands (`confirmFirst` on `cancelEvent`,
`precondition` for "never double-book") and closes with `custom` written against `GuardCtx`.

---

### 05-running-and-eval.md

**Goal.** Run a spec over a scripted conversation, then measure it — the loop that turns "it seemed
fine" into a number you can re-run.

**Symbols taught (14).**

| symbol | package | role |
|---|---|---|
| `runSpecConversation` | mastra | drive a spec through a multi-turn conversation |
| `loadSubject` | eval | load an eval subject (spec + world + cases) |
| `agentForCase` | eval | build the agent one case runs against |
| `stripGovernance` | eval | the ungoverned control arm of an A/B |
| `runCommand` | eval | `looprun-eval run` |
| `foldCommand` | eval | `looprun-eval fold` |
| `certCommand` | eval | `looprun-eval cert` |
| `lintPaths` | eval | lint a set of spec files |
| `lintSpecLaws` | eval | law-level spec lint |
| `lintSpecExecution` | eval | execution-level spec lint |
| `lintSpecQuality` | eval | quality-level spec lint |
| `lintSubject` | eval | lint a subject bundle |
| `mintSeal` | eval | seal a result set |
| `verifySeal` | eval | verify a seal |

The eleven `looprun-eval` entry points are taught **as the CLI first** — that is how the shipped bin
reaches them — with the programmatic call shown alongside for readers embedding eval in their own
scripts. `agentForCase` / `stripGovernance` are taught as the A/B seam the agentspec fork scripts use.

**Example used.** A scheduler subject with three cases (happy path, cancel-without-confirm, double
booking): `looprun-eval run` → `fold` → `cert` → `mintSeal`/`verifySeal`, then the same run governed
and ungoverned via `stripGovernance`. Absorbs `docs/guides/eval-config.md` and
`docs/guides/measured-loop.md`.

---

### 06-advanced.md

**Goal.** The three ways to take a spec somewhere else: serve it over an OpenAI-compatible endpoint,
run it on a local model, or enforce it inside a loop looprun does not own.

**Symbols taught (24), in four sections.**

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
| `localModel` | models | one call → a governed agent on a local llama.cpp model **(promoted, §7)** |
| `LocalModelOptions` | models | companion — `autoStart` / `autoDownload` / `runtime` |
| `LocalModelSpec` | models | companion — what `resolveAlias` returns and the runtime consumes |
| `ModelRuntimePort` | models | the runtime seam (llama.cpp today; MLX/ollama later) |
| `resolveAlias` | models | alias → validated model spec |
| `LlamaCppRuntime` | models | the shipped runtime: model file, server spawn, health-wait |
| `localModelStatus` | models | is the binary / file / server actually there |

Taught in the order the CLI does it: `npx looprun models pull` → `status` → then the library path.
Absorbs `docs/guides/local-models.md`.

*6.3 Pin the decoding (3)*

| symbol | package | role |
|---|---|---|
| `geminiFlashLiteThinkOff` | models | the cloud validation model, thinking off |
| `geminiThinkingOff` | core | the model-params shape that actually disables thinking |
| `pinnedDecoding` | core | deterministic decoding for reproducible evals |

*6.4 Bring your own loop (10)* — enforce a spec inside a runtime looprun does not control. This is
the surface `looprun-bench`'s τ²-bench shim and the agentspec fork scripts already build against.

| symbol | package | role |
|---|---|---|
| `renderScopedSpecTrunk` | core | the spec as a system-prompt block |
| `renderTurnPrompt` | core | the per-turn prompt |
| `createLedger` | core | per-conversation governance state |
| `beginTurn` | core | open a turn on the ledger |
| `resolveGuards` | core | which guards apply to this tool |
| `evaluatePreTool` | core | gate a proposed tool call |
| `enforcePostTool` | core | check a tool result |
| `redriveMessage` | core | the corrective message sent back to the model |
| `finalizeReply` | core | reply check → bounded redrive → honest abstain |
| `ReplyViolation` | core | companion — what those checks report |

**Example used.** The same scheduler, three times: behind `createModelServer` and called with an
OpenAI client; on `qwen3.5-4b` via `localModel`; and hand-wired into a minimal custom step handler
built from 6.4 — a condensed version of the real bench shim.

---

## 4. Completeness check — inventory → outline

Every inventory-public symbol, and the chapter that claims it. Sorted by package, inventory order.

| # | package | symbol | chapter |
|---|---|---|---|
| 1 | core | `AgentWorld` | 03 |
| 2 | core | `ObservedCall` | 04 |
| 3 | core | `GuardCtx` | 04 |
| 4 | core | `Guard` | 04 |
| 5 | core | `custom` | 04 |
| 6 | core | `requiresBefore` | 04 |
| 7 | core | `forbidThisTurn` | 04 |
| 8 | core | `argRequired` | 04 |
| 9 | core | `argAbsent` | 04 |
| 10 | core | `argFormat` | 04 |
| 11 | core | `precondition` | 04 |
| 12 | core | `maxCalls` | 04 |
| 13 | core | `canonArgs` | 04 |
| 14 | core | `noDuplicateCall` | 04 |
| 15 | core | `confirmFirst` | 04 |
| 16 | core | `noActAfterAskSameTurn` | 04 |
| 17 | core | `destructiveThrottle` | 04 |
| 18 | core | `resultInvariant` | 04 |
| 19 | core | `noFabricatedSuccess` | 04 |
| 20 | core | `replyMustMention` | 04 |
| 21 | core | `replyMaxOccurrences` | 04 |
| 22 | core | `replySingleQuestion` | 04 |
| 23 | core | `replyConfirmsLabels` | 04 |
| 24 | core | `emptyReply` | 04 |
| 25 | core | `degenerationGuard` | 04 |
| 26 | core | `pendingConfirmMustAsk` | 04 |
| 27 | core | `destructiveClaimRequiresSuccess` | 04 |
| 28 | core | `noFalseFailureClaim` | 04 |
| 29 | core | `minimalDisclosure` | 04 |
| 30 | core | `noInstructionFromData` | 04 |
| 31 | core | `noCompetitorClaim` | 04 |
| 32 | core | `noOutOfSurfaceActionClaim` | 04 |
| 33 | core | `noUngroundedRegulatedFigure` | 04 |
| 34 | core | `consentRequired` | 04 |
| 35 | core | `jargonScrub` | 04 |
| 36 | core | `AgentSpecBase` | 03 |
| 37 | core | `resolveGuards` | 06 |
| 38 | core | `AgentSpec` | 03 |
| 39 | core | `AgentSpecConfig` | 03 |
| 40 | core | `renderScopedSpecTrunk` | 06 |
| 41 | core | `DomainContract` | 03 |
| 42 | core | `validateSpec` | 03 |
| 43 | core | `geminiThinkingOff` | 06 |
| 44 | core | `pinnedDecoding` | 06 |
| 45 | core | `ToolDef` | 03 |
| 46 | core | `createLedger` | 06 |
| 47 | core | `beginTurn` | 06 |
| 48 | core | `renderTurnPrompt` | 06 |
| 49 | core | `evaluatePreTool` | 06 |
| 50 | core | `enforcePostTool` | 06 |
| 51 | core | `redriveMessage` | 06 |
| 52 | core | `finalizeReply` | 06 |
| 53 | core | `ReplyViolation` | 06 |
| 54 | mastra | `LoopRunAgent` | 02 |
| 55 | mastra | `LoopRunAgentConfig` | 02 |
| 56 | mastra | `LoopRunOptions` | 02 |
| 57 | mastra | `runSpecConversation` | 05 |
| 58 | mastra | `worldFromTools` | 03 |
| 59 | models | `resolveAlias` | 06 |
| 60 | models | `LlamaCppRuntime` | 06 |
| 61 | models | `geminiFlashLiteThinkOff` | 06 |
| 62 | models | `localModelStatus` | 06 |
| 63 | eval | `loadSubject` | 05 |
| 64 | eval | `agentForCase` | 05 |
| 65 | eval | `stripGovernance` | 05 |
| 66 | eval | `runCommand` | 05 |
| 67 | eval | `foldCommand` | 05 |
| 68 | eval | `certCommand` | 05 |
| 69 | eval | `lintPaths` | 05 |
| 70 | eval | `lintSpecLaws` | 05 |
| 71 | eval | `lintSpecExecution` | 05 |
| 72 | eval | `lintSpecQuality` | 05 |
| 73 | eval | `lintSubject` | 05 |
| 74 | eval | `mintSeal` | 05 |
| 75 | eval | `verifySeal` | 05 |
| 76 | server | `createModelServer` | 06 |
| 77 | server | `ModelServer` | 06 |
| 78 | server | `ModelServerConfig` | 06 |
| 79 | server | `TurnEvent` | 06 |
| +1 | models | `localModel` | 06 · **promoted** |
| +2 | models | `LocalModelOptions` | 06 · **promoted** |
| +3 | models | `LocalModelSpec` | 06 · **promoted** |
| +4 | models | `ModelRuntimePort` | 06 · **promoted** |

**Reverse check (outline → inventory).** 0 + 3 + 8 + 34 + 14 + 24 = **83** placements, all distinct,
79 of which carry an inventory `public` verdict and 4 of which are recorded promotions. No symbol
appears twice; no inventory-public symbol is missing.

---

## 5. What the tutorial deliberately does NOT teach

Stated so Tasks 3–7 do not have to re-derive it, and so nobody reads a gap as an oversight.

| left out | count | why |
|---|---|---|
| inventory `internal` symbols | 31 | consumed only by sibling packages — they move behind `/internal`, they are not user API |
| inventory `delete` symbols | 151 | no consumer outside the defining package; they leave the barrel (the implementation is a separate decision — see the inventory's §2 box) |
| `@looprun-ai/core/testing` (19) and `@looprun-ai/mastra/testing` (9) | 28 | a separate, deliberately test-only entry point. `GuardProof` is pointed at by the governance skill; that stays true and stays out of the tutorial's six chapters |
| `@looprun-ai/vercel` (2) | 2 | both exports unused and `createLoopRunAgent` always throws. No chapter can honestly teach it — the design's finding 7 (does this package ship at all?) is a Task 12 decision, not a tutorial one |

---

## 6. Open decisions handed to later tasks

| # | item | owner |
|---|---|---|
| 1 | **Chapter 06 carries 24 of the 83 symbols in four unrelated sections.** It is the grab-bag by construction (server + local models + decoding + custom loop). If it reads badly when written, split 6.4 "bring your own loop" into `07-embedding.md`; the contract is unaffected because no symbol moves chapter *set* | Task 11 |
| 2 | Chapter 04 is generated from `GUARD_CATALOG`; the generator and the agentspec `guard-catalog.md` lint must agree on the same 31 rows | Task 4 / Task 10 |
| 3 | `@looprun-ai/vercel` ships or does not ship | Task 12 |
| 4 | The nine superseded docs are deleted only after their absorbing chapter exists (local-models → 06, eval-config + measured-loop → 05, mcp-tools → 03) | Task 12 |

---

## 7. Resolution: `localModel` is public

The inventory's §9 revision #4 demoted `localModel` (and `LocalModelOptions`, `ModelRuntimePort`,
`LocalModelSpec`) from public to internal. That was correct **under the inventory's own rule** —
verdicts there are usage-based, and `localModel`'s only code consumer is
`packages/mastra/canary/guard-canary.canary.ts`, a sibling package. The inventory flagged the
conflict loudly (finding 4: "the models docs and the models exports disagree") and left it to be
resolved. This outline resolves it.

**Decision: chapter 06 teaches `localModel`, so it flips back to public** — now on
tutorial-contract grounds, which is a different and, per the design, stronger authority than the
usage scan.

```
inventory rule   usage decides    →  localModel internal (one canary uses it)
contract rule    tutorial decides →  localModel PUBLIC   (06 teaches it)
```

Why teaching it is the right call and not the comfortable one:

| | |
|---|---|
| **What it is** | `localModel('qwen3.5-4b')` → an AI-SDK model ready for `new LoopRunAgent({ model })`. It resolves the alias, ensures the GGUF, spawns and health-waits llama-server, and returns the client |
| **The alternative 06 would have to teach** | `resolveAlias` → `new LlamaCppRuntime()` → `ensureModel` → `ensureServer` → `createOpenAI({ baseURL }).chat(spec.servedId)` — five steps that reimplement, badly, the function that already exists |
| **What the docs already promise** | `README.md:66`, `docs/illustrated-guide.md:485` and `docs/guides/local-models.md:71` headline it. Chapter 06 absorbs `local-models.md` |
| **The cost of the other branch** | Deleting `localModel` from the barrel would make the reader hand-assemble a client on every local run, and would force Task 12 to *retract* the local-models story from three published docs rather than move it |

The three companion types ride along because they are structurally reachable from the taught
signatures — `localModel(alias, opts: LocalModelOptions)`, `LocalModelOptions.runtime:
ModelRuntimePort`, `resolveAlias(): LocalModelSpec` (also `LlamaCppRuntime`'s parameter). Exporting
the function while hiding the type of its own options object is not a smaller API, only a less
usable one.

Recorded in the inventory as revision **Round 3, #6**, citing this outline. Totals move
79 / 35 / 151 → **83 / 31 / 151**.

**And the converse.** No inventory-public symbol was orphaned, so nothing is downgraded here. Had
one been, the rule cuts both ways: it would leave the barrel with an inventory §9 entry reading
"no tutorial home".
