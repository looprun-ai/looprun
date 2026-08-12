# looprun — AS-IS Architecture Blueprint

High-level AS-IS blueprint of looprun, organized by package. It states what each package is,
how the seven packages depend on each other, how one governed turn crosses them end to end,
what each module inside a package does, and — in one consolidated section — the design debt
the current source carries, each item backed by a `file:line` citation and a verbatim quote.

---

## The system at a glance

```
                               ┌───────────────────────────┐
                               │   looprun  (umbrella)     │
                               │ 'looprun' + 4 subpaths    │
                               └──┬──────┬──────┬──────┬───┘
                                  │      │      │      │
              ┌───────────────────┘      │      │      └───────────────┐
              ▼                          ▼      ▼                      ▼
      ┌───────────────┐      ┌────────────────┐ ┌──────────────┐ ┌───────────────┐
      │ @looprun-ai/  │      │ @looprun-ai/   │ │ @looprun-ai/ │ │ @looprun-ai/  │
      │    mastra     │      │    models      │ │    vercel    │ │    server     │
      │ (backend)     │      │ (local models) │ │ (reserved)   │ │ (OpenAI wire) │
      └──────┬────────┘      └───────┬────────┘ └──────┬───────┘ └──┬─────────┬──┘
             │                       │                 │            │         │
             │   ┌───────────────────┼─────────────────┘            │         │
             │   │                   │      ┌───────────────────────┘         │
             ▼   ▼                   ▼      ▼                                 │
      ┌────────────────────────────────────────────┐                          │
      │            @looprun-ai/core                │◄─────────────────────────┘
      │  the framework-free governed-turn engine   │        (server → mastra too)
      │  (no dependencies)                         │
      └────────────────────▲───────────────────────┘
                           │
                  ┌────────┴─────────┐
                  │ @looprun-ai/eval │──► @ai-sdk/google, @ai-sdk/openai
                  │ (exam harness;   │    (models uses @ai-sdk/* as well)
                  │  core + mastra)  │
                  └──────────────────┘
```

| package | role | approx source size |
|---|---|---|
| `@looprun-ai/core` | The framework-free governed-turn engine: runtime, guard library, authoring surface, declarative world | ~8,200 lines |
| `@looprun-ai/mastra` | Adapter onto `@mastra/core`: turns an AgentSpec into a real Mastra Agent, wires the four governance seams | ~2,200 lines |
| `@looprun-ai/eval` | Exam harness: runs subjects through the real governed loop, validates, lints, folds verdicts, certifies | ~4,000 lines |
| `@looprun-ai/models` | Local-model supply chain: Qwen GGUF registry, llama.cpp runtime port, AI-SDK clients | ~590 lines |
| `@looprun-ai/server` | OpenAI-compatible protocol facade over governed LoopRunAgents | ~600 lines |
| `@looprun-ai/vercel` | Reserved backend slot: `createLoopRunAgent()` throws; the header doc is the backend seam contract | 45 lines |
| `looprun` | Umbrella: five one-line re-export barrels + a published bin that reaches into models | ~6 lines + bin |

Dependency facts: core has no dependencies; mastra → core; eval → core + mastra
(+ `@ai-sdk/google`, `@ai-sdk/openai`); models → core (+ `@ai-sdk/*`); server → core + mastra;
vercel → core; the looprun umbrella → core + mastra + models + vercel.

---

## One turn, end to end

A governed turn is driven by a mastra loop (either `LoopRunAgent.generate` for hosts/Studio or
`runSpecConversation` for scripted evals), crosses the core runtime seams, executes against the
world, and closes through delivery composition. The server package wraps exactly this turn behind
an OpenAI-compatible endpoint; the eval package drives it once per case.

```
 user text
    │
    ▼
┌─ mastra loop (LoopRunAgent.generate / runSpecConversation) ────────────────────┐
│                                                                                │
│ beginTurn ─ reset per-turn state; consume consent approvals whose typed-back   │
│    │        token literal appears in the user's text                           │
│    │        (runtime/action-history.ts + runtime/approval-request.ts)          │
│    ▼                                                                           │
│ evaluateOnInput ─ onInput guards may abort before any model call               │
│    │              (mastra inputProcessors → core turn.ts)                      │
│    ▼                                                                           │
│ renderTurnPrompt ─ assembled system prompt + terminal protocol as              │
│    │               instructions; state block + user text as the tail           │
│    ▼                                                                           │
│ model generates under toolChoice:'required' + stopWhen(terminal|vetoStorm|     │
│    │                                          stepCount)                       │
│    │  each candidate tool call:                                                │
│    │   beforeToolCall → evaluatePreTool → veto │ downgrade-to-simulation │     │
│    │                                       allow + sensitive-arg scrub         │
│    ▼                                                                           │
│ world.exec ─ BuiltWorld: reception coerces args → gates → act / simulate →     │
│    │         per-call tookEffect attestation into the world action history     │
│    ▼                                                                           │
│ filterToolResult (sensitive seam) → afterToolCall records the result and       │
│    │                                fires postTool guards                      │
│    ▼                                                                           │
│ respond ─ the single terminal tool (message + structured `did` intentions);    │
│    │      premature and superseded terminal emissions are pruned               │
│    ▼                                                                           │
│ completion passes ─ force missing chained calls and unread disclosure reads    │
│    ▼                                                                           │
│ finalizeReply ─ mutators → onReply/claims checks → lie question → bounded      │
│    │            no-tools redrives → salvage → engine-derived exhaustion        │
│    │            closure                                                        │
│    ▼                                                                           │
│ composeDeliveryText ─ agent's scrubbed prose + engine-rendered consent         │
│    │                  questions (with domain disclosures) + the action-        │
│    │                  history-grounded operation record                        │
│    ▼                                                                           │
│ recordTurnHistory ─ the turn seals as frozen read-only context for the         │
│                     next turn's guards                                         │
└────────────────────────────────────────────────────────────────────────────────┘
    │
    ▼
 delivered reply
```

---

## @looprun-ai/core — runtime

The runtime is the framework-free governed-turn engine: everything deterministic about one
conversation turn. Backends drive it through the `internal.ts` seam (a no-compatibility-promise
re-export of the whole machine); `index.ts` is the small taught public API that deliberately
excludes the turn machine. `turn.ts` is the hub where every runtime subsystem meets: guard
evaluation on three hooks, the governance-veto envelope, the whole reply pipeline, delivery
composition, and the chain/disclosure completion passes.

```
                    packages/core/src/runtime — the governed-turn engine
                    (driven by backends through src/internal.ts; index.ts exposes types only)

 user text                                                        model (backend supplies)
    │                                                                  ▲
    ▼                                                                  │ instructions+tail
 ┌────────────────┐  consumeApprovals  ┌──────────────────┐      ┌───────────┐   ┌──────────────┐
 │ action-history │◄──────────────────►│ approval-request │      │ prompt.ts │──►│ terminal.ts  │
 │ (observed,     │                    │ (token, licence) │      └─────┬─────┘   │ respond tool │
 │  history, did) │                    └──────────────────┘            │         │ + prune fns  │
 └───┬───────▲────┘                             ▲                assembled-prompt└──────┬───────┘
     │       │ recordToolResult/Veto/Terminal   │ issue/strip/close    (../)            │
     │       │                                  │                                       │
     ▼       │                        ┌─────────┴──────────────────────────────────┐    │
 guards ctx  └────────────────────────┤ turn.ts — evaluateOnInput / evaluatePreTool │◄───┘
 (next turn)                          │  chain+disclosure passes / finalizeReply    │
                                      │  (mutators→checks→redrive→salvage→closure)  │
                                      └──┬──────────┬─────────┬──────────┬──────────┘
                resolveGuards (../spec)  │          │         │          │
                                         ▼          ▼         ▼          ▼
                                   ┌──────────┐ ┌─────────┐ ┌─────────────┐ ┌──────────────────┐
                                   │ claims.ts│ │lie-check│ │ disclosure  │ │ sensitive-filter │
                                   │ did/     │ │ + judge-│ │ before/     │ │ scrubText        │
                                   │ record/  │ │ prompt  │ │ after/later │ └──────────────────┘
                                   │ derive   │ │ envelope│ └─────────────┘
                                   └────┬─────┘ └────┬────┘
                                        │            │ session-record (entity fold)
                                        ▼            ▼
                                   engine-text  judge callback (backend-supplied)
                                   (sentences)
```

| file | lines | responsibility |
|---|---|---|
| `runtime/turn.ts` | 1045 | The turn-engine hub: guard evaluation on all hooks, the reply pipeline (finalizeReply), delivery composition, and the completion passes. |
| `runtime/action-history.ts` | 394 | The per-conversation observation store guards read: observed calls, veto/downgrade/terminal recording, consent-approval issuance and consumption, sealed history. |
| `runtime/claims.ts` | 575 | The structured turn-claim spine: outcome vocabulary, Intention validation, the did-to-operation-record renderer, and derivation of true claims from the action history. |
| `runtime/terminal.ts` | 357 | The terminal protocol: the single `respond` tool and the step readers that detect premature and superseded terminals for pruning. |
| `runtime/judge-prompt.ts` | 216 | The judge envelope: composes every judging prompt and reads the NONE/VIOLATION verdict line back. |
| `runtime/disclosure.ts` | 212 | Domain-authored disclosure sentences in three tenses, filled from observed reads via `{tool.path}` slots, plus the unread-read list a consent question owes. |
| `runtime/lie-check.ts` | 193 | The lie question about free prose on an actionless turn, and the rewrite pass that corrects prose against the records. |
| `src/internal.ts` | 177 | The backend seam: re-exports the whole governed-turn machine for sibling packages and bring-your-own-loop authors. |
| `runtime/approval-request.ts` | 154 | The consent-approval object: the engine-issued question, the typed-back token literal, licence matching against a retried call, token consumption. |
| `runtime/sensitive-filter.ts` | 124 | Pure sensitive-data removal: declared-field omit/mask over result objects and a regex scrub (emails, cards, phone shapes) over free text. |
| `runtime/session-record.ts` | 117 | Folds completed turns into one line per changed entity — input to the lie check, never delivered to the user. |
| `runtime/prompt.ts` | 110 | The single producer of the bytes a turn sends to the model. |
| `src/index.ts` | 90 | The taught public API barrel: spec/world/guard vocabulary — deliberately excludes the turn machine. |
| `runtime/types.ts` | 57 | Shared framework-free types of the turn machine. |
| `runtime/engine-text.ts` | 48 | The engine's own user-facing sentences as an overridable pack. |

Notable edges:

- `turn.ts` imports 13 repo modules; `finalizeReply` orchestrates all of them.
- `turn.ts → src/guards/llm-check.ts`: imports `CLOSED_FAIL_DENY` so a judge outage prices exactly like an `llmCheck` fail-closed deny.
- `action-history.ts → src/guards/index.ts`: `canonArgs` is the call-identity fingerprint used for reconcile, world-history matching, approval identity, and terminal pruning.
- `approval-request.ts → src/guards/{matching,flow}.ts`: consent semantics live half in the guards package (`valueSpokenBy` decides token presence, `canonArgs` decides licence identity).
- `src/rules.ts → runtime/claims.ts`: a type-only back edge from the guard vocabulary into the runtime — the near-cycle is held off only by `import type`.

---

## @looprun-ai/core — guards

`src/guards/` is the typed guard-kind library: factory functions each returning a Guard
(`{ kind, dim, check(ctx), prose() }`) — a deterministic machine gate paired with an LLM-facing
rule sentence rendered into the assembled prompt. Guards install on four hooks
(onInput/preTool/postTool/onReply, plus onReplyMutate for mutators) chosen from the guard's `dim`
via `spec.ts#DIM_HOOKS`; bindings are priority-sorted per hook
(agent → changeAllowed → consent → honesty → always). Text matching is deliberately confined:
`matching.ts` holds the canonical whole-token/whole-value comparison every identity verdict routes
through, and the barrel header states the NO-REGEX law — no guard factory takes a RegExp-typed
parameter. `catalog.ts` restates the whole vocabulary as data for doc generation and lints.

```
                 spec.ts (addGuard: DIM_HOOKS matrix, priorities,        runtime/turn.ts (runs hooks,
                 auto-installs always/consent/honesty kinds)              redrive, lie-check pass)
                        │ imports factories                                  │ imports CLOSED_FAIL_DENY
                        ▼                                                    ▼
 ┌────────────────────────────────── guards/ ─────────────────────────────────────────────┐
 │  index.ts (barrel) ──── re-exports everything ────  catalog.ts (vocab as DATA, 0 deps) │
 │                                                                                        │
 │  args.ts ──┐                                                                           │
 │  reply.ts ─┼──► shared.ts ───────────────► runtime/claims.ts (outcome vocabulary)      │
 │  flow.ts ──┘        ▲                              ▲                                   │
 │    ▲                └── honesty.ts ────────────────┘                                   │
 │    │                       │                                                           │
 │  consent.ts             matching.ts ◄── structural.ts                                  │
 │    │                       ▲                                                           │
 │    ▼                       │ (CYCLE: the runtime imports back into guards)             │
 │  runtime/approval-request.ts ──► guards/matching.ts + guards/flow.ts                   │
 │                                                                                        │
 │  llm-check.ts ──► runtime/judge-prompt.ts + runtime/lie-check.ts                       │
 │  world.ts · custom.ts  (types only)                                                    │
 └────────────────────────────────────────────────────────────────────────────────────────┘
        every file type-imports ../rules.ts (Guard {kind,dim,check,prose}, GuardCtx, Dim)
   consumers outside: core/index.ts, internal.ts, runtime/{session-record,action-history}.ts
```

| file | lines | responsibility |
|---|---|---|
| `guards/honesty.ts` | 457 | The deterministic honesty core: derived act list plus the declaration cross-checks `claimIsGrounded`, `claimIsComplete`, `mustAccountFor`, and the read-emptiness heuristic. |
| `guards/catalog.ts` | 311 | The guard vocabulary restated as data, plus the kind-classification registries read by the spec-quality lints. |
| `guards/flow.ts` | 225 | Sequencing/budget/repetition guards (`requiresBefore`, `forbidThisTurn`, `maxCalls`, `noDuplicateCall`) plus `canonArgs` and the budget counter. |
| `guards/consent.ts` | 179 | The typed-confirmation gate: `confirmFirst` and `destructiveThrottle`. |
| `guards/llm-check.ts` | 166 | The one model-judged guard kind (`llmCheck`, with failMode pricing) plus the `llmCheckLie` marker guard. |
| `guards/matching.ts` | 114 | THE MATCHING LAW: canonical value form and the two comparisons every identity verdict routes through — never substring. |
| `guards/world.ts` | 96 | World-state guards: `precondition`, `resultInvariant`, `consentRequired`. |
| `guards/shared.ts` | 90 | Module-local helpers shared by the kinds: terminal filtering, flag-safe regex testing, literal escaping. |
| `guards/reply.ts` | 73 | Reply-artifact surface: `degenerationGuard` (leaked-markup scan) and `jargonScrub` (word-boundary rewrite mutator). |
| `guards/args.ts` | 52 | Argument guards: `argRequired`, `argAbsent`, `argFormat`. |
| `guards/structural.ts` | 45 | `valueFromUser`: a value recorded on the user's behalf must appear verbatim in something the user said. |
| `guards/index.ts` | 41 | The public barrel; carries the NO-REGEX law header. |
| `guards/custom.ts` | 11 | The escape hatch: wraps an author-written kind/dim/check/prose into a Guard verbatim. |

Notable edges:

- `spec.ts → guards/index.ts`: the constructor auto-installs the always/consent/honesty kinds and enforces DIM_HOOKS and priority order — this is where guards get their lifecycle.
- `consent.ts → runtime/approval-request.ts → guards/{matching,flow}.ts`: guards → runtime → guards is a cross-directory dependency cycle.
- `honesty.ts → runtime/claims.ts`: the honesty cross-checks depend on the runtime's outcome vocabulary.
- `runtime/session-record.ts → guards/honesty.ts`: `targetMatchesValue` is the one entity-identity predicate, so the matching law also governs session-level verdicts.
- `internal.ts → guards/catalog.ts`: `GUARD_CATALOG` and the classification registries ship to the doc generator and the eval lints.

---

## @looprun-ai/core — surface + world

The authoring surface is the framework-free vocabulary a generated agent bundle is written in and
the machinery that turns it into what the model reads. An author declares an `AgentSpec` (persona,
tool surface, flow edges, guard bindings, controls) plus a `DomainContract` (voice, core
invariants, write surface, disclosure sentences, outcome vocabulary); `AgentSpecBase`'s constructor
validates the declaration and auto-installs the universal invariants and the destructive-consent
protocol; `renderAssembledPrompt` folds spec + contract into a byte-stable, provenance-attributed
system prompt. The `world/` subdirectory is the other half: `defineWorld` interprets a purely
declarative `WorldSpec` into a deterministic `BuiltWorld` implementing the engine's `AgentWorld`
seam — reception coerces args at the boundary, gates evaluate a closed transition language,
formulas compile a closed arithmetic mini-language at load, and every call is recorded with a
`tookEffect` attestation the honesty guards later ground claims against.

```
                         AUTHORING SURFACE (packages/core/src)
                                                                outside area
 +------------------+   auto-installs catalog guards   +------------------------+
 |     spec.ts      |--------------------------------->| guards/index.ts        |
 | AgentSpec(Base)  |---- assertNoCoreOutcomeShadow -->| runtime/claims.ts      |
 | resolveBindings  |<--type cycle--+                  | runtime/approval-req.  |
 +---+----------+---+               |                  | runtime/engine-text    |
     ^          |            +------+-----------+      | runtime/sensitive-f.   |
     | uses     | types      | assembled-prompt |----->+------------------------+
     |          +----------->| DomainContract   |            (types on the
 +---+--------------+        | renderPromptBlks |             contract/ctx)
 | tool-description |        +--------+---------+
 | composeToolDesc  |                 | folds via
 +---+--------------+                 v
     |  proseKey/Text        +------------------+     +---------------+
     +---------------------->|  prompt-fold.ts  |     | validate.ts   |--> spec.ts
                             | table+fold+regex |     | model-params  | (standalone)
                             +------------------+     +---------------+

                          WORLD (packages/core/src/world)
 +-----------+   emits vocabulary   +-----------------+
 |  types.ts |<---------------------| define-world.ts |----> BuiltWorld
 +-----------+                      |  build/dispatch |   (implements rules.ts
       ^        +-------------+     +--+----+----+----+    AgentWorld seam;
       |        | reception.ts|<-------+    |    |         WorldCall shape read
       |        +-------------+  gates |    |    | load    by @looprun-ai/eval)
       |        +-------------+<-------+    |    v
       +--------|  gates.ts   |             | +------------+
                +-------------+             +>| formula.ts |
                                              +------------+
```

| file | lines | responsibility |
|---|---|---|
| `src/spec.ts` | 609 | The AgentSpec interface and AgentSpecBase, whose constructor validates the declaration and auto-installs the universal invariants and the consent protocol. |
| `src/assembled-prompt.ts` | 435 | The DomainContract interface and the renderer of the byte-stable assembled prompt as an attributed PromptBlock table. |
| `src/rules.ts` | 284 | The guard type system: the AgentWorld seam, GuardCtx, Guard/ReplyMutator shapes, conversation records, the Judge callback. |
| `world/define-world.ts` | 283 | Interprets a declarative WorldSpec into deterministic BuiltWorlds: reception, gates, two-step simulate/confirm, transitions, audit, tookEffect attestation. |
| `world/formula.ts` | 224 | A closed arithmetic mini-language with a hand-written tokenizer and parser; errors throw at load or loudly at evaluation. |
| `world/types.ts` | 182 | The declarative world vocabulary a generated subject emits, plus the BuiltWorld/WorldCall/AuditEntry shapes. |
| `src/prompt-fold.ts` | 178 | The prompt's provenance layer: regex-based polarity/subject derivation and `foldPrompt` — the only place the prompt's bytes are produced. |
| `src/model-params.ts` | 87 | Provider-safe model-parameter presets and merges (Gemini thinking-off, pinned decoding). |
| `src/validate.ts` | 56 | Soft spec validation returning warnings; the host decides strictness. |
| `world/gates.ts` | 56 | Evaluates the closed transition-gate language against received args and the record store. |
| `world/reception.ts` | 40 | Coerces and validates declared tool args at the world boundary. |
| `src/tool-description.ts` | 34 | Appends the de-duplicated prose of every tool-scoped guard binding to the tool's own description. |
| `world/index.ts` | 25 | Barrel re-exporting the world factory and vocabulary. |

Notable edges:

- `spec.ts ⇄ assembled-prompt.ts`: a module cycle — type-only in one direction (`ContractGuardBinding`, `DomainContract`), value the other (`resolveBindings`).
- `spec.ts → runtime/claims.ts`: `assertNoCoreOutcomeShadow` runs at spec construction — a load-time invariant sourced from the runtime.
- `world/types.ts → @looprun-ai/eval`: `WorldCall`'s own doc states it is the shape eval's `run.ts` reads (`callOk`, `tookEffect`) — a cross-package shape contract with no shared import.

---

## @looprun-ai/mastra

The mastra package is looprun's adapter onto `@mastra/core`: it turns a governed AgentSpec into a
genuine Mastra Agent. Core governance is wired in through four seams: (1) preTool guards and the
observed action history ride Mastra's `hooks.beforeToolCall`/`afterToolCall`; (2) onInput guards
become an `inputProcessors` entry that aborts before any LLM call; (3) the turn is forced to close
through the runtime-owned `respond` terminal tool under `toolChoice:'required'` +
`stopWhen(terminalCalled | vetoStorm | stepCount)` with a forced-terminal fallback; (4) onReply
guards run after generation via core's `finalizeReply`. The package ships two parallel turn
machines — `LoopRunAgent.governedTurn` for hosts/Studio and `runSpecConversation` for scripted
evals — a low-level `compileSpec` kit, native-tools/MCP mode with a synthesized world, surface
reconciliation and certification fingerprinting, a sensitive-data scrub on both crossings of every
tool call, and a testing kit (scripted LLM + L3 proof-loop runners). The default judge exists only
on the scripted-runner path: `runSpecConversation` falls back to `defaultJudge` on the run's own
model, while `LoopRunAgent` throws at construction when an `llmCheck` spec has no host judge.

```
                          index.ts (public barrel; re-exports ALL of @looprun-ai/core)
                          |             |                  |
            +-------------+       +-----+------+           +----------------+
            v                     v            |                            v
   +----------------+   +------------------+   |                  +-------------------+
   |    agent.ts    |   | run-conversation |   |                  | world-adapters.ts |
   | LoopRunAgent   |   | scripted runner  |---+----------------->| worldFromTools    |
   | governedTurn / |   | (evals/batch)    |                      | (native/MCP state)|
   |    stream      |   +---+----+----+----+                      +-------------------+
   +-+---+---+---+--+       |    |    |
     |   |   |   +--DEFAULT_*    |    +------------------+
     |   |   v                   v                       v
     |   | +------------------+  +-----------+   +-------------+
     |   | | agent-           |  | tools.ts  |   |  judge.ts   |
     |   | | construction.ts  |->| createTool|   | defaultJudge|
     |   | +--+------+-----+--+  | respond   |   | (scripted   |
     |   |    |      |     |     +--+----+---+   |  path only) |
     |   |    v      v     v        |    |       +------+------+
     |   | reconcile surface world- |    v              v
     |   | -surface  .ts   adapters |  json-schema-  testing/
     |   |    .ts  (sha256)         |  zod.ts        fake-llm.ts <- proof-loop.ts
     |   |                          |                 (JUDGE marker)   (L3 runner)
     |   v                          v
     | +----------+        +------------------+
     | | hooks.ts |------->| sensitive-seam.ts|
     | | before/  |        | scrubArgs /      |
     | | afterTool|        | filterResult     |
     | +----+-----+        +------------------+
     v      |
 session.ts |            compile.ts (low-level kit) --> tools, hooks, session
 SessionStore
     |      |
     v      v
 @looprun-ai/core/internal  (guard engine + turn machine primitives — the hub)
 @mastra/core               (Agent.generate/stream loop, createTool, hooks seam)
```

| file | lines | responsibility |
|---|---|---|
| `agent.ts` | 531 | LoopRunAgent — an `@mastra/core` Agent subclass whose overridden `generate()` runs the full governed turn and whose `stream()` gives tool-level governance plus turn sealing only. |
| `run-conversation.ts` | 365 | Scripted multi-turn runner for evals: drives the same governed-turn pipeline (plus the disclosure completion pass) recording TurnRecords. |
| `hooks.ts` | 173 | The core-guard-to-Mastra bridge: preTool veto/downgrade/allow, terminal payload rejection, result filtering + recording, postTool firing, onInput abort. |
| `agent-construction.ts` | 173 | One-shot config resolution: mode checks, native surface intersection (deny-by-default), tool build, the certification drift gate, and option passthrough. |
| `compile.ts` | 119 | `compileSpec` — the low-level kit for devs assembling their own Agent, leaving the generate loop to the host. |
| `testing/fake-llm.ts` | 114 | Script-driven LanguageModelV3 mock; engine judge calls are answered out-of-band without consuming a step. |
| `sensitive-seam.ts` | 109 | The two crossings of a tool call: in-place pattern scrub of declared free-text args, and omit/mask/scrub of declared result fields. |
| `tools.ts` | 91 | ToolDef → Mastra `createTool` wiring; the runtime-owned terminal tools capture the respond payload. |
| `testing/proof-loop.ts` | 91 | L3 proof runners over the fake LLM and core's FixtureWorld. |
| `session.ts` | 87 | Per-conversation state keyed by sessionId with a promise-chain mutex serializing turns. |
| `json-schema-zod.ts` | 78 | Shallow JSON Schema → Zod converter carrying only shape + descriptions so format judgments stay with the guard layer. |
| `reconcile-surface.ts` | 65 | Native-mode gate: throws at construction when `gen/tools.json` does not describe the live host. |
| `judge.ts` | 57 | The isolated judge call machinery; `defaultJudge` reuses the run's model. |
| `world-adapters.ts` | 46 | Native/MCP mode's synthesized AgentWorld over a host StateView. |
| `surface.ts` | 34 | Certification drift identity: sha256 over the sorted name+schema pairs of the tool surface. |
| `index.ts` | 23 | The public barrel; `export * from '@looprun-ai/core'` — the entire core contract flows through it. |
| `testing/index.ts` | 12 | Testing-kit barrel. |

Notable edges:

- `agent.ts` / `run-conversation.ts → @looprun-ai/core/internal`: ~20 names each — the turn machine is core primitives; the mastra loop is orchestration around them.
- `agent.ts → @mastra/core/agent`: `LoopRunAgent` extends Agent and calls `Agent.prototype.generate/stream` with per-call overrides — the actual loop is Mastra's.
- `agent.ts → run-conversation.ts`: shared `DEFAULT_MAX_STEPS`/`DEFAULT_REDRIVES` constants tie three entry points together.
- `packages/server/src/types.ts` mirrors `agent.ts`'s module-local `LoopRunResultMeta` by hand, pinned by a compile-time mutual-assignability check.

---

## @looprun-ai/eval

The eval package is looprun's exam harness: it loads a generated "subject" directory (specs,
contract, deterministic world, tool defs, case pack, declared model target), runs each case's
turns through the real governed loop (`runSpecConversation`) against the subject model — in a
governed variant and an enforcement-stripped ungoverned control — and captures per-turn tool
calls, guard events, and replies as CaseDump JSONL. Around that run the whole measurement
instrument is offline and model-free: config loaders that make regexes and free functions
structurally impossible, a five-layer `validate`, three lint batteries, a blind chunked
judge-input builder (the agent in the session writes `verdicts.jsonl` — no external model, ever),
verdict folding + byte-identical transcript sync, floor-law certification, a run monitor, an
artifact-hash SHIP seal, and a `campaign` verb orchestrating the full pipeline.

```
┌────────────────────────── index.ts — public API (the looprun-eval bin calls these) ──────────────────────────┐
│                                                                                                              │
│  campaign.ts ───────> commands.ts ──┬─> run.ts ─────────> @looprun-ai/mastra runSpecConversation             │
│   run/status/resume    CLI verbs    │     │ ├─> subject.ts ──> cases-config.ts / world-config.ts             │
│      │  │  │                        │     │ └─> ungoverned.ts ──> core/internal renderAssembledPrompt        │
│      │  │  │                        ├─> provider.ts ──> @ai-sdk/openai + @ai-sdk/google                      │
│      │  │  │                        ├─> judge-input.ts ──┐                                                   │
│      │  │  │                        ├─> cert.ts ─────────┼──> fold.ts  (foldVerdicts / syncVerdicts /        │
│      │  │  │                        └─> validate.ts ─────┘              readJsonl — shared by 5 modules)     │
│      │  │  └─> monitor.ts ──> fold.ts                                                                        │
│      │  └────> validate.ts ──> norms-config.ts ──> core guard catalog (AgentSpecBase, confirmFirst, …)       │
│      │                    └──> world-config.ts ──> core/internal defineWorld                                 │
│      └───────> subject.ts (loadSubject + preflight + prompt-static gate)                                     │
│                                                                                                              │
│  lint.ts ──> core validateSpec        lint-subject.ts (coverage/world/parity)      seal.ts (sha256 seal)     │
│  lint-spec-quality.ts ──> core/internal ARMED_SEAMS / CONFIRM_CLASS_KINDS                                    │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
pipeline: validate ─> run (governed + ungoverned) ─> monitor ─> judge-input ─> [agent judges] ─> fold/sync ─> cert ─> seal
```

| file | lines | responsibility |
|---|---|---|
| `validate.ts` | 627 | The five offline validation layers: SCHEMA, REFERENCES, PREMISE replay, WORLD-model laws (world.json subjects), DISCLOSURE slots. |
| `norms-config.ts` | 403 | The `norms/<agent>.json` schema + loader: a closed guard catalog as data, a closed precondition expression language, installation into AgentSpecBase. |
| `campaign.ts` | 383 | One verb for the whole measured campaign: preflight, K reps + control, monitor, blind judge inputs, PAUSE/resume, fold/sync, floor-band cert. |
| `lint-subject.ts` | 292 | Subject-level laws for symptomless defects: exam coverage, world honesty, write-gate parity per preset. |
| `commands.ts` | 282 | The CLI verbs as functions: run, validate, fold, judge-input, cert. |
| `subject.ts` | 269 | The subject-directory loader plus the structural preflight and the byte-identical assembled-prompt-static gate. |
| `lint.ts` | 228 | The guard-purity source lint, the subject spec laws, and the execution-based UNSAT-RISK / ORDER-CYCLE checks. |
| `fold.ts` | 198 | Folds judge verdicts into per-case finals (a missing verdict is a loud FAIL) plus the transcript sync and the shared `readJsonl`. |
| `run.ts` | 197 | Runs one case against one target through the governed loop and evaluates the deterministic invariants. |
| `lint-spec-quality.ts` | 197 | Spec-quality laws over the assembled spec objects, never source text. |
| `cert.ts` | 195 | Certification: `buildCert` for one rep and `buildCertRange` for K reps under the FLOOR law. |
| `world-config.ts` | 177 | The `gen/world.json` schema + loader (banned pattern/fn/predicate keys pre-scanned), handed to core's `defineWorld`. |
| `cases-config.ts` | 117 | The `evals/cases.json` schema + loader: the exam as strict data. |
| `judge-input.ts` | 108 | Projects a run dir into the blind, deterministically ordered, chunked judge input with no variant/rep/model label anywhere. |
| `monitor.ts` | 101 | The run-dir monitor: NETWORK incidents and HOLES; an unresolved incident blocks certification. |
| `seal.ts` | 80 | The SHIP seal: sha256 over governed artifacts; a post-certification change voids it on verify. |
| `ungoverned.ts` | 68 | The control variant: the byte-identical assembled prompt with every guard hook disarmed. |
| `provider.ts` | 54 | Selects the subject-model client — the only network-touching module; the subject model is the one model any run may reach. |
| `index.ts` | 47 | The public API surface for the `looprun-eval` bin. |

Notable edges:

- `run.ts → @looprun-ai/mastra`: the single point where the harness drives the real governed loop — the whole measurement rides on this call's turn records. `TurnRecord.toolCalls` is built from `world.toolCalls` itself, so the dump's alignment with the world action history is one-to-one by construction; guard-vetoed calls ride the separate `attemptedCalls` field.
- `campaign.ts → commands.ts`: a campaign rep is byte-equivalent to a hand-run verb.
- `lint-spec-quality.ts → core/internal`: the battery reads the runtime's own kind metadata (`ARMED_SEAMS`, `CONFIRM_CLASS_KINDS`) instead of re-encoding it — the anti-drift law.
- `fold.ts` is imported by five modules for `readJsonl` — the verdict-folding module doubles as the package's JSONL utility hub.

---

## @looprun-ai/models

The local-model supply chain: a hand-measured registry of five Qwen GGUF tiers, a llama.cpp
runtime port that resolves the binary, downloads the GGUF from HuggingFace with resume, spawns
`llama-server` with a measured flag recipe and health-waits it, plus the public `localModel()` /
`geminiFlashLiteThinkOff()` entry points that hand back AI-SDK LanguageModel clients.

```
┌── @looprun-ai/models (supply local models) ────────┐
│ index.ts  localModel / geminiFlashLiteThinkOff     │
│   │  └────────► @ai-sdk/openai · @ai-sdk/google    │
│   │  └────────► @looprun-ai/core (geminiThinkingOff)│
│   ├─► aliases.ts  registry (5 specs, port 8081)    │
│   └─► llamacpp.ts  spawn/health/flags              │
│         ├─► download.ts  HF pull (resume)          │
│         └─► port.ts  ModelRuntimePort seam         │
└────────────────────────────────────────────────────┘
```

| file | lines | responsibility |
|---|---|---|
| `llamacpp.ts` | 225 | The llama.cpp ModelRuntimePort: binary resolution, launch-flag recipe, spawn with macOS DYLD fallback, health polling, exit cleanup. |
| `aliases.ts` | 148 | The validated local-model registry: five measured Qwen specs plus ram8/16/24/32 spellings and env-overridable paths. |
| `index.ts` | 88 | The public API: `localModel(alias)`, `geminiFlashLiteThinkOff()`, `localModelStatus()`. |
| `port.ts` | 75 | The ModelRuntimePort seam so future runtimes (MLX, ollama, vllm) can replace llama.cpp unchanged. |
| `download.ts` | 51 | Downloads a spec's GGUF with HTTP-Range resume into a `.part` file and renames it into place. |

Notable edges: `index.ts → @looprun-ai/core` (`geminiThinkingOff`) is the only core import in the
package; the AI-SDK providers enter the system here and in eval's `provider.ts`.

---

## @looprun-ai/server

The inverse direction of models: it exposes governed LoopRunAgents behind an OpenAI-compatible
endpoint (`GET /v1/models`, `POST /v1/chat/completions`) as a deliberate protocol facade —
incoming system/tools/sampling are discarded, only the last user message enters the governed turn,
the agent's own session is canonical memory, and streaming is simulated (run-to-completion, then
one big content delta with keepalive comments in between).

```
┌── @looprun-ai/server (serve governed agents) ──────┐
│ index.ts  createModelServer (locked surface)       │
│   └─► server.ts  node:http adapter + TTL sweep     │
│         └─► handler.ts  routes + facade law        │
│               ├─► openai.ts  envelopes + usage     │
│               ├─► session.ts id + locks + ttl      │
│               └─► sse.ts  simulated-stream shim    │
│ types.ts ──► core (ObservedCall)                   │
│          ──► mastra (LoopRunAgent)                 │
│          ==MIRROR== mastra/agent.ts LoopRunResultMeta│
│ handler ··runtime··► agent.generate() (mastra)     │
└────────────────────────────────────────────────────┘
```

| file | lines | responsibility |
|---|---|---|
| `handler.ts` | 139 | The fetch-style protocol facade: routes, bearer check, last-user-message extraction, the governed turn under the session lock, OpenAI-shaped answers. |
| `session.ts` | 100 | Maps the stateless OpenAI protocol onto stateful sessions: id resolution chain, per-session mutex, idle tracker for TTL eviction. |
| `openai.ts` | 92 | OpenAI chat-completion envelopes plus a chars/4 token-usage estimate. |
| `types.ts` | 88 | The wire types, the server config/handle types, and the hand-maintained mirror of mastra's `LoopRunResultMeta`. |
| `server.ts` | 86 | `node:http` adapter around the fetch handler; TTL sweeper calling `agent.endSession()`. |
| `sse.ts` | 70 | Encodes a completed turn as a valid OpenAI SSE stream. |
| `index.ts` | 26 | The locked public surface: `createModelServer` and its type closure. |

Notable edges: every governed turn the server serves bottoms out in
`agent.generate(userText, { loopRun: { sessionId } })` — the whole request path runs inside mastra.

---

## @looprun-ai/vercel

A reserved v0 backend slot: `createLoopRunAgent()` unconditionally throws. The file's header doc
is the written five-point seam contract any future backend must implement (pre-call veto, terminal
protocol, bounded finalization, structured terminal shipped as authored, superseded-terminal
pruning) plus the world-side identity-key obligation for writes. The config is typed against
core's `AgentSpec` / `AgentWorld` / `ToolDef` / `DomainContract`.

| file | lines | responsibility |
|---|---|---|
| `index.ts` | 45 | The reserved slot: a throwing factory plus the written backend seam contract. |

---

## looprun (umbrella)

Five one-line re-export barrels mapping the published subpath exports onto the four scoped
packages. The root export is core only, so backends are opt-in subpaths. The published bin reaches
into models via dynamic import (`resolveAlias`, `LlamaCppRuntime`, `localModelStatus`) for its
`models pull/serve/status` commands.

| file | lines | responsibility |
|---|---|---|
| `src/index.ts` | 2 | `'looprun'` re-exports `@looprun-ai/core` wholesale. |
| `src/core.ts` | 1 | `'looprun/core'` → `@looprun-ai/core`. |
| `src/mastra.ts` | 1 | `'looprun/mastra'` → `@looprun-ai/mastra`. |
| `src/models.ts` | 1 | `'looprun/models'` → `@looprun-ai/models`. |
| `src/vercel.ts` | 1 | `'looprun/vercel'` → `@looprun-ai/vercel`. |

---

## Design debt, by symptom

Every item below is a fact of the current source, cited at `file:line` with a verbatim quote.
Paths are relative to `packages/` unless spelled in full.

### regex-validation

**1. The judge verdict is read by case-folded prefix matching on the first line, and the
NONE-prefix false positive is silent.** A judge answer beginning with a word that starts with
`NONE` reads as a clean verdict; an answer matching neither prefix becomes `violation: null` but
is logged (`turnCorrections` receives `JUDGE_UNREADABLE` at `core/src/runtime/turn.ts:611`).

```
core/src/runtime/judge-prompt.ts:212-213
if (line.toUpperCase().startsWith(NO_VIOLATION)) return { violation: null, readable: true };
if (!line.toUpperCase().startsWith(VIOLATION_PREFIX)) return { violation: null, readable: false };
```

Example: a judge answering `NONETHELESS, this is a lie` starts with `NONE` and is scored as no
violation, with nothing recorded.

**2. `stripToLicensed` deletes any unlicensed string argument that case-insensitively equals a
≥3-character fragment of the consent token — including the constant word `CONFIRM` and the tool
name.** A legitimate value colliding with those words is silently removed from the retried call.

```
core/src/runtime/approval-request.ts:110-114
const parts = c.token.split(/[\s-]+/).filter((w) => w.length >= 3);
...
if (parts.some((w) => w.toUpperCase() === v.toUpperCase())) delete args[k];
```

Every token contains `CONFIRM` and the uppercased tool name, so an args value `'confirm'` on any
other field is deleted.

**3. The opt-in prose scrub destroys any separator-joined digit run in delivered text.** The
scrub runs only for contracts that declare `scrubTextFields`
(`core/src/runtime/turn.ts:426-427` — `return contract?.scrubTextFields?.length ? scrubText(text) : text;`),
but once on, an order reference like `12-34-5678` or a serial number masks to `•••`; only ISO
dates are carved out.

```
core/src/runtime/sensitive-filter.ts:84
const PHONE = /\+\d{1,3}(?:[\s.-]?\d){6,14}|\b\d{2,4}[\s.-]\d{2,4}[\s.-]\d{2,9}\b/g;
```

**4. A disclosure slot's source tool name must be identifier-shaped, so hyphen/dot tool names
(common in MCP naming) can never ground a slot.** The brace pair is rendered verbatim, so the
consent question shows the raw template text `{search-invoices.total}` instead of a figure, and
`unreadDisclosureSources` never forces the read.

```
core/src/runtime/disclosure.ts:43
const SLOT = /\{([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z0-9_$]+)*)\}/g;
```

**5. `argFormat` compiles an author-supplied pattern string into a RegExp, sidestepping the
NO-REGEX law's own enforcement** (the law bans RegExp-*typed* factory parameters).

```
core/src/guards/args.ts:39
const re = new RegExp(pattern, flags ?? '');
```

versus `core/src/guards/index.ts:11` — "NO guard FACTORY takes a RegExp-typed parameter".

**6. `degenerationGuard` decides reply validity with a fixed ASCII token list and two magic
repetition thresholds.** A chat template not on the list passes; a two-word line spammed fifty
times passes because only lines of 12+ characters repeated 3+ times count.

```
core/src/guards/reply.ts:31
if (/<think|<\/think|<tool_call|<tool_response|<\|im_(?:start|end)\|>|\[end of turn\]|<\|assistant\|>|respond\s*\{/i.test(r))
core/src/guards/reply.ts:36-38
.filter((l) => l.length >= 12) ... if (n >= 3) return 'the reply repeats the same line over and over...'
```

**7. `jargonScrub` compiles `\b...\b` without the `u` flag, so non-ASCII jargon keys mis-match
and punctuation-edged keys are never scrubbed.** The file itself states the boundary never matches
as expected for keys like `'(beta)'` or `'C++'` (`reply.ts:58-61`).

```
core/src/guards/reply.ts:64
new RegExp(`\\b${escapeRe(from)}\\b`, 'gi')
```

**8. Prompt polarity and subject are derived by regex over rendered English prose.** A core
invariant phrased `avoid disclosing balances` matches neither the forbid nor the require marker
set and derives polarity `inform`, losing the forbid for every downstream contradiction query; the
subject lexicon is first-match-wins by source order.

```
core/src/prompt-fold.ts:77-79
const FORBID_SRC = "never|must not|may not|cannot|can'?t|do not|don'?t|forbidden";
core/src/prompt-fold.ts:113
for (const rule of opts?.lexicon ?? []) if (rule.re.test(text)) return rule.subject;
```

**9. The eval prose lints judge English by sentence-shape regexes.** PROSE-NAMES-ABSENT-TOOL
accuses any camelCase phrase starting with a verb prefix (`setUp`, `addOn` trip it);
PROSE-POSTHOC-ACCUSATION keys on `but ... did not` shapes, missing paraphrases and flagging
legitimate rule prose.

```
eval/src/lint-spec-quality.ts:126
} else if (executable.size && /^(list|get|create|update|delete|remove|send|fetch|read|write|open|close|set|add)[A-Z]/.test(tok)) {
eval/src/lint-spec-quality.ts:30
/\bbut\b[^.!?]{0,90}?\bdid(?:n['’]t|\s+not)\b/i
```

**10. The purity lint bans tokens by raw substring over source lines, so a comment or string
literal that merely mentions a banned API is a violation.** The line
`// never call Math.random( here` in a contract file is flagged.

```
eval/src/lint.ts:54
if (text.includes(token)) {
```

**11. The monitor's NETWORK regex matches non-transport errors.** `'invariant failed on record
503'` or `'guard timeout budget exceeded'` is scored NETWORK, reclassifying a quality failure as
a network incident.

```
eval/src/monitor.ts:25
/(fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up|network error|getaddrinfo|timed out|timeout|\b429\b|\b5\d\d\b)/i
```

**12. "Looks like a tool name" is defined twice, differently, across the two lint batteries.**
The rubric tokenizer is camelCase-only, so a snake_case tool name in a rubric is invisible to
RUBRIC-TOOL-OFF-SURFACE, while the sibling battery's `identifierShaped` accepts underscores.

```
eval/src/lint-subject.ts:93
for (const tok of new Set(text.match(/\b[a-z][A-Za-z0-9_]*[A-Z][A-Za-z0-9_]*\b/g) ?? []))
eval/src/lint-spec-quality.ts:20
const identifierShaped = (t: string): boolean => /[A-Z]/.test(t) || t.includes('_');
```

**13. The scripted runner extracts consent codes from the model's previous reply with a regex.**
A reply that phrases the code any other way (lowercase, reworded) feeds `'(no code was shown)'`
into the next user turn.

```
mastra/src/run-conversation.ts:159
const shown = (turnRecords[turnRecords.length - 1]?.assistantFinalText ?? '').match(/CONFIRM [A-Z0-9_-]+/g) ?? [];
```

**14. The fake LLM classifies a call as an engine judge call by substring-matching the judge
system sentence inside the serialized prompt.** Any agent turn whose prompt quotes that sentence
is misrouted to the judge answerer and never consumes a script step.

```
mastra/src/testing/fake-llm.ts:35
return JSON.stringify(options?.prompt ?? '').includes(JUDGE_SYSTEM_INSTRUCTIONS);
```

**15. llama.cpp build selection ranks builds by the first digit run in the directory name.**
`llamacpp-v2-b9780` ranks as build 2 and loses to `llamacpp-9700` even though it is the newer
binary.

```
models/src/llamacpp.ts:44-46
function buildNumber(dir: string): number { return Number(dir.match(/\d+/)?.[0] ?? 0); }
```

### custom-guard-abuse

**1. The Guard interface doubles as a message carrier.** Three synthetic guards in `turn.ts` and
the `llmCheckLie` factory have check functions that never check anything — they exist to smuggle a
kind string and reason into the violation pipeline — and classifying any new guard kind as
salvageable requires editing engine allow-lists.

```
core/src/runtime/turn.ts:528
const LIE_GUARD: Guard = { kind: 'llmCheckLie', dim: 'behavior', check: () => null, prose: () => '' };
core/src/guards/llm-check.ts:163
check: () => null,
core/src/runtime/turn.ts:663
"Opting a new kind in is a deliberate edit here."  // over FORM_GUARD_KINDS/TRUTH_GUARD_KINDS
```

**2. The `custom()` escape hatch carries whole domain classes with no enforced discipline.**
Media/label/provenance/input rules ride hand-written guards, and authors must manually copy the
shared kinds' exemptions (terminal filtering, simulate bypass) with no mechanism checking they do.

```
core/src/guards/catalog.ts:262
"Replicate the shared kinds' exemptions, since reviewers read this code."
core/src/guards/index.ts:15-16
"Media/label INPUT guards are a DOMAIN concern — `custom({ dim:'input' })` over the world's own accessors."
```

**3. Subject derivation knows only the catalog guard kinds, so every bespoke `custom()` guard
produces `subject:null` prompt lines the prompt-table lints cannot reason about.**

```
core/src/prompt-fold.ts:36-38
"`custom()` guards land there by construction — they declare a free-form kind."
```

**4. The norms JSON catalog cannot express `writeTools`, so the honesty cross-check is
unreachable from the config path.** Any subject that needs `claimIsGrounded`/`claimIsComplete`
must abandon the safe catalog for hand-written TypeScript, and nothing in the loaded spec
announces the gap.

```
eval/src/norms-config.ts:364-370
"THE HONESTY CROSS-CHECK IS NOT REACHABLE FROM THIS PATH. … Nothing about the loaded spec
announces that gap — the guard count simply comes up short."
```

**5. The two sanctioned escape hatches — named `{ref}` predicates and named `custom` executors —
are unusable through every CLI path, because no verb supplies the deps.** `validate`'s schema
layer re-runs `loadNormsConfig` with no deps (a legal ref predicate is reported as a schema error,
so the subject is permanently RED), and `runCommand`/`campaign` call `loadSubject` with no
`WorldConfigDeps` (a world.json naming a custom executor throws at load).

```
eval/src/validate.ts:69
loadNormsConfig(JSON.parse(readFileSync(join(subjectDir, 'norms', f), 'utf8')));  // no deps
eval/src/commands.ts:66  const subject = await loadSubject(opts.subject);          // no deps
eval/src/campaign.ts:198 subject = await loadSubject(subjectDir);                  // no deps
```

**6. The mastra option passthrough lets callers and configs override governance.** Per-call
options are spread last, after the guard hooks, the terminal protocol's toolChoice/stopWhen, and
the pinned instructions — so `agent.generate(msg, { hooks: {} })` strips preTool/postTool
enforcement for the turn and `{ toolChoice: 'auto' }` undoes the terminal protocol. The same hole
exists at construction: `hooks` and `instructions` are not in `LOOPRUN_KEYS`, so a config-level
`hooks` passes through and overrides `hooks: guardHooks` in the `super()` call. Separately, three
looprun-owned keys (`stopOnRepeatedToolCall`, `judge`, `judgeTimeoutMs`) are missing from
`LOOPRUN_KEYS` and are spread as unknown options into the `@mastra/core` Agent constructor.

```
mastra/src/agent.ts:316-324
const full: any = await (Agent.prototype.generate as any).call(this, msgs,
  { instructions, activeTools, ...protocolOpts, hooks: this.guardHooks, ... , ...passOpts });
mastra/src/agent.ts:197-198
hooks: guardHooks, ...built.passthrough
mastra/src/agent-construction.ts:32-35
const LOOPRUN_KEYS = new Set(['spec', 'contract', 'world', 'tools', 'stateView', 'toolDefs',
  'model', 'modelParams', 'terminalProtocol', 'maxSteps', 'redrives', 'strict', 'id', 'name',
  'expectedSurfaceHash']);
```

### perfect-world

**1. A `simulate:true` call on a schema-declared tool skips every preTool guard except the
always-kinds.** A tool whose simulate flag is buggy or side-effecting executes with governance
mostly off, trusting that the world fully validates the simulation.

```
core/src/runtime/turn.ts:157
const active = isSimulation ? guards.filter((g) => ALWAYS_GUARD_KINDS.has(g.kind)) : guards;
```

**2. The simulation licence is granted by schema shape alone, at both ends.** Any destructive
tool whose input schema declares a property named `simulate` gets the consent bypass; nothing
verifies the executor honors the flag, and `confirmFirst` has no `tookEffect` backstop for the
first such call — while the sibling guard's own doc names the executor that "mutates while
claiming `simulate: true`".

```
core/src/spec.ts:550-551
const props = byName.get(t)?.inputSchema?.properties; return !!props && 'simulate' in props;
core/src/guards/consent.ts:66
if (ctx.args.simulate === true && ctx.simulatableTools?.has(tool)) return null;
```

**3. A consent licence does not cover "the call plus nothing else".** `stripToLicensed` only
deletes *string* arguments equal to a token word, so an appended non-string argument that widens
the act still runs under the old approval: a retry of
`payInvoice {invoiceId, amount, cascade:true}` matches the licence (only the licensed entries are
compared, `approval-request.ts:77`) and `cascade:true` is never dropped — against
`turn.ts:154-155`'s own claim "Anything the model appended after the question was raised is
dropped before any guard sees it."

```
core/src/runtime/approval-request.ts:111-114
if (k in licensed) continue;
if (typeof v !== 'string') continue;
... delete args[k];
```

**4. On the self-executing (native/MCP) path, `tookEffect` is inferred from result shape.**
Success without `requiresConfirmation:true` counts as "changed something" — true of every
successful read as well — so the honesty law stands on an admittedly unreliable flag there.

```
core/src/rules.ts:64-66
"the runtime derives the flag from the RESULT (`ok && !requiresConfirmation`), which is really
\"the call succeeded\" — true of every successful READ as well."
mastra/src/hooks.ts:104-109
world.toolCalls.push({ ... tookEffect: ok && !pending, effectInferred: true });
```

**5. The exhaustion closure can deliver "nothing was changed" over a mutation that landed.**
`deriveClaimsFromActionHistory` yields a success claim only when `o.tookEffect === true`; a
declared write that executed ok with no world row (the native-tools path leaves `tookEffect`
unknown) contributes no claim, so the closure picks the nothing-changed sentence.

```
core/src/runtime/claims.ts:553  if (o.tookEffect === true) {
core/src/runtime/claims.ts:572  // a write that ran ok but took no effect (a simulate) changed nothing → no claim.
core/src/runtime/turn.ts:462-463
const landed = did.some((c) => c.outcome === 'success');
const sentence = landed ? EXHAUSTION_PARTIAL : EXHAUSTION_NOTHING;
```

**6. In native-tools/MCP mode, `destructiveThrottle` denies the documented same-turn
simulate-then-approved-execute tail.** Nothing writes `tookEffect` there, so an executed
schema-licensed simulation (`tookEffect` undefined, not false) fails `executedIsSimulate` and
counts as the turn's one destructive effect.

```
core/src/guards/consent.ts:139-143
"in native-tools/MCP mode NOTHING writes the world action history, so every call would read as
not-effected" ... const executedIsSimulate = (o) => o.tookEffect === false && flagsDeclareSimulation(o);
```

**7. `not_found` grounding assumes empty reads are envelopes with a data channel.** A scalar-only
honest empty result is undecidable and fails closed against an honest "no record found" reply.

```
core/src/guards/honesty.ts:88  "A domain whose empty read has no data channel must return one (`data: []`)."
core/src/guards/honesty.ts:96  if (typeof result !== 'object') return false; // a bare scalar names no data channel — undecidable
```

**8. `runTransition` reports success and `tookEffect:true` even when the target record does not
exist and nothing was patched.** A transition tool authored without the guaranteeing gate returns
ok on a no-op, and the honesty guards then ground a success claim against a mutation that never
happened.

```
core/src/world/define-world.ts:161-164
if (rec) rec.status = t.to; // patch in place — a preceding stateIs/exists gate guarantees the record
const result = { ok: true, status: t.to, ... }; return push(toolCalls, name, rawArgs, result, true);
```

**9. The custom-tool dispatch path bypasses the world's own laws three ways.** The executor
receives the LIVE record store while its type doc promises a read-only copy; dispatch returns
before `evaluateGates`, so gates authored on a read/custom tool never run and a simulatable custom
tool never simulates; and the executor gets the RAW args — reception's coerced view is computed
and then discarded.

```
core/src/world/types.ts:124
"seeded records by entity, id-keyed (read-only copy)."
core/src/world/define-world.ts:138-144
if (tool.kind === 'custom') return runCustom(name, tool, args);
if (tool.kind === 'read') return runRead(name, tool.read, args);
// write / transition — gates, then two-step, then create.
const denied = evaluateGates(tool.gates, received, store);
core/src/world/define-world.ts:136,191
const received = receive(name, tool.args, args);   // computed ...
executor({ args, records: store, mintId });         // ... then the raw object is forwarded
```

**10. The simulate flag is a strict `=== true` check, so a model passing the string `"true"` for
an undeclared simulate parameter ACTS instead of simulating.** Reception only coerces declared
args, so the string survives both comparisons and the mutation the caller asked to preview happens
for real.

```
core/src/world/define-world.ts:147
if (tool.simulatable && (received.simulate === true || args.simulate === true))
```

**11. A preset `patch` delta naming a missing record is a silent no-op** — the built world starts
in a state the preset author never wrote, one screen below the comment declaring the never-silent
law for presets (`define-world.ts:218` — `// #6 — never a silent half-state`, which guards only
the unknown-preset name).

```
core/src/world/define-world.ts:227-230
case 'patch': { const rec = store[delta.entity]?.[delta.id]; if (rec) Object.assign(rec, delta.set);
```

**12. Reception stringifies any non-string value for a declared string arg.** A model passing
`{id:'ast_1'}` mints a record whose field is the literal text `'[object Object]'`.

```
core/src/world/reception.ts:39
return typeof value === 'string' ? value : String(value);
```

**13. Parts of the declared world vocabulary are dead config.** `fieldAtLeast`'s `entity` variant
is declared and documented but the evaluator reads only `args[gate.field]`; entity field TYPES
(`'money'`, enums) and ToolDecl's transition self-description (`entity`/`from`/`to`) are never
validated or read — the builder consumes field names only.

```
core/src/world/types.ts:36        { kind: 'fieldAtLeast'; entity?: string; ... }
core/src/world/gates.ts:32-37     const raw = args[gate.field];        // gate.entity unread
core/src/world/types.ts:12        export type FieldType = ScalarType | 'money' | { enum: readonly string[] }
core/src/world/define-world.ts:59 for (const field of Object.keys(entity.fields ?? {})) fields.add(field);
```

**14. `worldFromTools` fires the StateView refresh without awaiting it**, so an async remote
re-fetch races the turn's state-block render and the prompt can carry last turn's state.

```
mastra/src/world-adapters.ts:33-35
advanceTurn: () => { void view.refresh?.(); },
```

**15. `callOk` assumes every world follows the `ok:false` convention.** A world returning
`{error: '...'}` with no `ok` field is scored as a successful call, so REQUIRED invariants pass on
refused calls.

```
eval/src/run.ts:69-71
'A call succeeded unless its result explicitly says `ok: false`.'
return !(r && typeof r === 'object' && r.ok === false);
```

**16. The entire world-model validation layer stands down for TypeScript worlds.** Preset
distinguishability, simulate≡act identity and determinism run only for world.json subjects; a TS
world with a clock leak validates clean.

```
eval/src/validate.ts:369
if (!existsSync(path)) return []; // TS worlds ship no `gen/world.json` — nothing to check here.
```

**17. The campaign preflight drops the WORLD layer from its blocking set.** A world.json subject
with a non-deterministic world sails through `campaign run` and gets certified, while the
standalone `validate` verb counts the same findings as blocking.

```
eval/src/campaign.ts:203
const blocking = [...report.schema, ...report.references, ...report.premise, ...report.disclosure];
eval/src/commands.ts:176
const blocking = report.schema.length + report.references.length + report.premise.length
  + report.world.length + report.disclosure.length;
```

**18. The refusal-as-result probe calls every name-matched write with empty args and skips on
throw.** Any world that validates its arguments (the realistic case) throws, and the
REFUSED-WRITE-READS-OK trap silently checks nothing.

```
eval/src/lint-subject.ts:156-159
result = world.exec(name, {}); } catch { continue; // A throw is an honest failure — exactly what the runtime expects.
```

**19. The simulate≡act identity and disclosure checks run with synthesized placeholder args**
(`'x'`, `1`, `false`, or one identity value copied into every required string arg), so gates keyed
on real entities refuse both sides identically and the checks pass vacuously.

```
eval/src/validate.ts:343
out[a.name] = a.type === 'number' ? 1 : a.type === 'boolean' ? false : 'x';
eval/src/validate.ts:586
args[key] = type === 'number' ? 1 : type === 'boolean' ? false : identity;
```

**20. A missing `monitor.json` reads as incident-free**, so certification proceeds for a dir that
was never scanned — the always-armed monitor is disarmed by an absent file.

```
eval/src/monitor.ts:78-79
} catch { return false; // never scanned = no recorded incident to block on }
```

**21. The SHIP seal does not hash `gen/world.json` — the world form `loadSubject` prefers.** A
JSON-world subject's entire world (gates, presets, seed records) can be rewritten after
certification without voiding the seal.

```
eval/src/seal.ts:36
for (const f of ['gen/tools.json', 'gen/world.ts', 'gen/world.js'])
eval/src/subject.ts:137-138
const jsonPath = join(dir, 'gen', 'world.json');
if (existsSync(jsonPath)) return loadWorldConfig(JSON.parse(readFileSync(jsonPath, 'utf8')), deps);
```

**22. Invariant `anyArgs` matching uses strict `===` on model-produced values.** A model emitting
`"5"` where the invariant pins `5` fails a REQUIRED invariant on type shape alone.

```
eval/src/run.ts:82-84
for (const [k, expected] of Object.entries(req.anyArgs)) { if (args[k] !== expected) return false; }
```

**23. `ensureServer` trusts a bare `/health` ok as proof the RIGHT model is up, and every
registry spec shares port 8081.** `localModel('ram24')` with the 4B already serving on 8081
returns `alreadyRunning` and the client talks to the wrong model.

```
models/src/llamacpp.ts:167
if (await healthy(spec)) { return { baseURL, alreadyRunning: true, stop: async () => {} };
```

`healthy()` (line 81) checks only `body.status === "ok"`; `aliases.ts` lines 49/65/82/99/116 all
read `port: 8081`.

**24. A downloaded GGUF is renamed into place with no size or checksum verification**, and the
resume path appends to whatever `.part` survives a crash — a corrupted partial becomes the
permanently installed model file.

```
models/src/download.ts:27  const startAt = existsSync(part) ? statSync(part).size : 0;
models/src/download.ts:49  renameSync(part, dest);
```

**25. The server fabricates token usage from character counts and presents it as real OpenAI
usage.** Tool round-trips inside the multi-step governed turn contribute zero.

```
server/src/openai.ts:4-6
/** Rough token estimate (ceil(chars/4), never zero) — harnesses expect nonzero usage. */
export function estimateTokens(text: string): number { return Math.max(1, Math.ceil(text.length / 4));
```

### id-naming-convention

**1. Tool-result semantics are decided by conventional field names at multiple sites.** Success,
confirmation-pending, produced label and the authored report are all detected by fixed spellings,
so a world using `'status'`, `'confirmationRequired'` or `'summary'` is misread as a plain success
with nothing to disclose; `noDuplicateCall` classifies a prior result the same way.

```
core/src/runtime/action-history.ts:180
if (o.success === false || o.PREREQ_NOT_MET === true || typeof o.error === 'string') return false;
core/src/runtime/action-history.ts:213
const requiresConfirmation = (output as { requiresConfirmation?: unknown } | null | undefined)?.requiresConfirmation === true;
core/src/guards/flow.ts:175
if (rec.success === false || rec.ok === false || typeof rec.error === 'string') return 'came back as a FAILURE';
```

**2. `isEmptyReadResult` keys on field names, with a stated carve-out from its own key-blindness
law.** Scalar values under `STATUS_LIKE_KEYS` (`'message'`, `'found'`, …) are skipped as status
noise — the skip inverts a verdict only when an empty data channel sits beside the scalar
(`{data:[], message:'BK-1 is active'}` reads as empty) — and a `false` under the exact keys
`'found'`/`'exists'` is POSITIVE evidence of emptiness, so `{exists:false}` answering a
duplicate-check ("safe to proceed") can ground a `not_found` declaration.

```
core/src/guards/honesty.ts:116
if (STATUS_LIKE_KEYS.has(key)) continue;  // a SCALAR status/error word is not content
core/src/guards/honesty.ts:72,113
const EXISTENCE_KEYS: ReadonlySet<string> = new Set(['found', 'exists']);
if (!val && EXISTENCE_KEYS.has(key)) dataChannels += 1; // `found:false` IS the empty data channel
```

**3. Disclosure subject-binding matches only exact whole-string values.** `approvalValues`
stringifies every scalar but `namesSubject` tests only string result values, so `270` (number) in
the result never matches `'270'` from the args and the consent question renders the NA marker
instead of the figures.

```
core/src/runtime/disclosure.ts:50
if (typeof v === 'string') return v === needle;
```

**4. Gate ref resolution requires the tool argument to be literally named `<entity>Id`, and a
lookup miss silently resolves the minimum to 0.** A `{ref:'booking.deposit'}` gate on a tool whose
arg is `booking_id` finds no record and the `fieldAtLeast` gate passes at min 0.

```
core/src/world/gates.ts:16-19
const targetId = args[`${entity}Id`]; ... return typeof val === 'number' ? val : 0;
```

**5. `isPureGuardSet` classifies a spec as LLM-free by a kind-string prefix convention.** Any
judge-calling guard whose kind does not start with `'llm:'` is counted as pure.

```
core/src/spec.ts:597
return !all.some((b) => b.guard.kind.startsWith('llm:'));
```

**6. `resolveBindings`' target-match exactness is held by the type system alone.** The match is
`.includes(tool)`, exact only because `ToolTarget` forbids a bare string; the file itself
documents that a string target would substring-match and attach a guard to an unbound tool — with
no runtime check.

```
core/src/spec.ts:485-486
"`resolveBindings`' `target.includes(tool)` on a string is a SUBSTRING match and would attach the
guard to a tool nobody bound it to."
```

**7. Terminal identity is tool-name-based end to end, and the runtime silently shadows any host
tool named `respond`.** In native mode the admitted host tools are spread first and the runtime
terminals last, so a surface-listed host `respond` is replaced without any error.

```
mastra/src/agent-construction.ts:126
tools = { ...admitted, ...buildTerminalTools(getSession) };
mastra/src/tools.ts:32-33
const byName = new Map(toolDefs.map((d) => [d.name, normalizeTerminalToolDef(d)]));
for (const def of terminalToolDefs()) if (!byName.has(def.name)) byName.set(def.name, def);
```

**8. Eval's write/destructive classification is name-prefix-based.** The refusal-as-result probe
filters tools by `WRITE_NAME_RE` with no override (a write named `archiveOrder` escapes; a read
named `createReport` is probed); the parity law consults `contract.writeTools` first and falls
back to the prefix only when none are declared. `DESTRUCTIVE-WITHOUT-CONFIRM` keys on five name
prefixes, so `wipeAccount` carries no finding.

```
eval/src/lint-subject.ts:21
const WRITE_NAME_RE = /^(create|update|delete|remove|set|add|send|issue|void|cancel|charge|release|pay|refund|resolve|place|transfer|retire|book|schedule|assign|close|open|apply|record)/;
eval/src/lint-spec-quality.ts:24
const DESTRUCTIVE_NAME_RE = /^(delete|remove|disconnect|purge|destroy)/;
```

**9. The world-config key ban rejects any field literally named `re`, `fn` or `predicate`
regardless of content — while `predicate` is the legal, load-bearing key one file over in
norms-config.**

```
eval/src/world-config.ts:133
const BANNED_KEY = /^(pattern|regex|re|fn|func|function|predicate)$/i;
eval/src/norms-config.ts:66
const predicateSchema = z.union([z.object({ ref: z.string() }).strict(), exprSchema]);
```

**10. Provider selection keys on name shape and hostname literals.** Ids starting with `gemini`
route to the native Google client unless `--base-url` is passed (`provider.ts:43` —
`/^gemini/i.test(t.modelId) && !t.explicitBaseUrl`), and the local runaway brakes (pinned capped
decoding + repeated-call stop) arm only for `localhost`/`127.0.0.1` — a llama.cpp box reached over
LAN IP runs uncapped, exactly the failure the header says the brakes exist for.

```
eval/src/provider.ts:44
const isLocal = !isGemini && /^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(t.baseUrl);
```

**11. The server joins model and session id with a single space at three sites — lock key, TTL
key, and the fingerprint seed itself — so space-containing names collide**, and the fallback
fingerprint hashes model + FIRST user message, so two unrelated conversations opening with the
same greeting merge into one governed session and share world state.

```
server/src/handler.ts:96   locks.run(`${body.model} ${sessionId}`, async () => {
server/src/session.ts:86   this.touched.set(`${model} ${sessionId}`, …)
server/src/session.ts:43-44
const seed = `${model} ${first ? contentText(first.content) : ""}`;
return `fp-${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;
```

### order-dependence

**1. Same-step sibling visibility for preTool guards is an assumption about the host scheduler,
not something the engine enforces.** A runtime that schedules concurrently-dispatched calls
differently silently reopens the same-step bypass the mechanism exists to close.

```
core/src/runtime/turn.ts:124-126
"The model runtime dispatches a step's calls concurrently but starts them in emission order up to
the first await, so this ordering is deterministic."
```

**2. A before-disclosure slot binds to the LATEST matching read call.** When several reads of the
same tool name the subject, which figures the user is shown in a consent question depends purely
on call order; a stale re-read issued after the relevant one changes the disclosed figures.

```
core/src/runtime/disclosure.ts:97
const bound = named.length ? named[named.length - 1] : ofTool.length === 1 ? ofTool[0] : undefined;
```

**3. `claimIsGrounded`/`claimIsComplete` spend acts greedily with first-fit `findIndex`, so an
honest report can be denied purely because of declaration order.** A declaration that could ground
on either of two acts spends the flexible act first and leaves a later declaration unmatchable
even though a valid assignment exists.

```
core/src/guards/honesty.ts:343
const at = acts.findIndex((a) => a.outcomes.has(resolved) && supportsClaim(a, claim));
if (at >= 0) { acts.splice(at, 1); ...
```

(the same greedy pattern at `honesty.ts:395` in `claimIsComplete`).

**4. `noDuplicateCall`'s deny describes whichever array-valued field enumerates FIRST in the prior
result object.** For `{meta: [], bookings: [b1, b2]}` it says "came back EMPTY (zero meta)" and
instructs the model that empty is the answer — about a result carrying two bookings.

```
core/src/guards/flow.ts:170
const arrayField = Object.entries(rec).find(([, v]) => Array.isArray(v));
```

**5. `chainOrder` assumes flows are simple chains.** A fork silently drops an edge (Map
overwrite) and a cycle renders a partial order from an arbitrary edge — the rendered `## Flow`
line quietly misstates the declared flow.

```
core/src/assembled-prompt.ts:191-194
succ.set(e.from, e.to);            // a second edge from the same producer overwrites the first
const start = ... ?? edges[0].from; // cycle fallback
```

**6. Prompt prose de-duplication shares one `emitted` set across three sections in fixed call
order.** Identical prose bound on both a tool hook and onReply renders only under Global tool
rules and vanishes from Reply rules — placement depends on emission order, not on where the rule
was bound.

```
core/src/assembled-prompt.ts:285-296
const emitted = new Set<string>();  // consumed by globals → input → reply in that order
if (!p?.trim() || emitted.has(proseKey(p))) continue;
```

**7. `repeatedToolCallStop` keys a call as name + `JSON.stringify(args)`.** The same arguments
serialized in a different property order count as a different call and the repeat is not stopped.

```
mastra/src/hooks.ts:146
const key = (tc.toolName ?? tc.name ?? '') + ':' + JSON.stringify(tc.input ?? tc.args ?? {});
```

**8. `surfaceFingerprint` hashes the raw `JSON.stringify` of each schema, and in native mode the
"schema" is the live zod validator object.** A semantically identical schema whose properties
serialize in a different order voids the certification seal with a false drift throw, and the
native-mode seal is bound to zod's internal `_def` representation — a zod version bump voids every
native-mode certification. `reconcile-surface` next door converts via `zodToJsonSchema` before
comparing; the fingerprint does not.

```
mastra/src/surface.ts:25-26
schemaJson = JSON.stringify(schema) ?? '';   // feeding createHash('sha256')
mastra/src/agent-construction.ts:135-138
nativeToolsMode ? config.tools![name]?.inputSchema : ...
mastra/src/reconcile-surface.ts:55
zodToJsonSchema(liveSchema as never, { $refStrategy: 'none' })
```

**9. `stream()` bypasses the per-session promise-chain mutex that `generate()` runs under.** A
concurrent `generate()` and `stream()` (or two streams) on the same session interleave
beginTurn/actionHistory/world mutations with no serialization.

```
mastra/src/agent.ts:248-251   return this.sessions.run(session, () => this.turnContext.run(...))   // generate
mastra/src/agent.ts:479-483   return this.turnContext.run(session, async () => { ...
                              beginTurn(actionHistory, session.turnIndex); session.turnIndex += 1;  // stream
```

**10. The eval sync fingerprint is `JSON.stringify` over model-produced args objects.** Two
semantically identical transcripts whose arg keys were emitted in different order land in
different equivalence classes and are never reconciled — against the adjacent comment asserting
stability.

```
eval/src/fold.ts:113-118
'Key-ordered → `JSON.stringify` is stable.'
calls: t.toolCalls.map((c) => ({ name: c.name, args: c.args, ... }))
```

**11. Premise replay executes a case's required writes and then its forbidden writes against ONE
shared world instance.** An earlier accepted replay mutates the state the later verdicts are read
from — a forbidden write can be "refused" only because a required replay already transitioned the
record.

```
eval/src/validate.ts:253  world = subject.makeWorld(preset);   // once per case
eval/src/validate.ts:170  const res = world.exec(call.name, (call.anyArgs ?? {}) as Record<string, unknown>);
```

**12. The assembled-prompt-static gate compares only the FIRST TWO presets in case-declaration
order, and stands down entirely below two.** A prompt leak that appears only under a third preset
is never checked.

```
eval/src/commands.ts:68-69
const presetPair = [...new Set(subject.cases.map((c) => c.setup?.preset ?? 'default'))].slice(0, 2);
if (presetPair.length === 2) {
```

**13. `foldVerdicts` builds its verdict map with last-wins semantics.** A judge that emits two
conflicting verdict lines for the same caseId has the earlier one silently discarded — no
divergence warning, unlike the sync path which reconciles loudly.

```
eval/src/fold.ts:32-34
const verdicts = new Map(verdictLines.map((v) => [v.caseId, { verdict: v.verdict ?? v.overall ?? 'unjudged', reasons: v.reasons }]));
```

**14. `lastUserText` stops at the LAST user message and returns null if its text is empty, even
when earlier user messages carry text.** Messages `[user:'do X', user:'']` get a 400 whose error
text ("No user message with text content found in `messages`") is literally false for that
request.

```
server/src/session.ts:33-35
if (messages[i]!.role === "user") {
  const text = contentText(messages[i]!.content);
  return text.length > 0 ? text : null;
```

### no-deterministic-return

**1. Read results have no deterministic channel to the user by default.** A READ contributes
nothing to the derived operation record, and its after-sentence renders only if the domain
authored a disclose template — lookup figures normally reach the user only through model prose.

```
core/src/runtime/claims.ts:519   "a READ (any non-write, incl. the runtime terminal) → contributes NOTHING"
core/src/runtime/disclosure.ts:192  if (!template || !fillsEverySlot(template, result)) return '';
```

**2. WHAT a pending destructive act would do reaches the user only through model prose.**
`confirmFirst`'s deny instructs the agent to describe the act in its reply, but no guard verifies
the reply does — only the confirmation code and the pre-declared meaning label render
deterministically.

```
core/src/guards/consent.ts:70-72
'... Reply to them now, and say in that reply what the call would do and to which record. A code
is shown under your reply; ...'
```

**3. A postTool violation cannot alter the result the model already read.** Mastra awaits
`afterToolCall` but discards its return, so an output-invariant violation only becomes a
correction note that reaches the user (or not) through later redrive prose.

```
mastra/src/hooks.ts:115-116
"Mastra AWAITS afterToolCall but DISCARDS its return, so the guard cannot rewrite the
model-visible result mid-generate."
```

**4. On the consent-downgrade path, whether the user learns a confirmation is pending depends on
the model's prose in the hosted agent.** The runtime executes the simulation and hands its result
back as the vetoed call's output; the deterministic disclosure pass that forces the owed read
exists only in the scripted runner, not in `LoopRunAgent.governedTurn`.

```
mastra/src/hooks.ts:74-77
const output = filterToolResult(...await session.world.exec(toolName, simulated)...);
return { proceed: false as const, output };
mastra/src/run-conversation.ts:275   runDisclosureCompletionPass(   // no counterpart in agent.ts
```

**5. A simulation's deterministic description is only an echo of the caller's own stored args.**
No derived values, no transition description; for a transition tool the simulation payload is
`{}` — what the act would actually do reaches the user only via model prose.

```
core/src/world/define-world.ts:264-267
const fields = create?.store ?? [];
return Object.fromEntries(fields.map((f) => [f, received[f]]));
```

**6. Native-mode deny-by-default exclusions reach the operator only as a `console.error` line.**
A host tool absent from `spec.surface.tools` is silently never registered; nothing structured (no
throw, no field, no meta) tells a host which of its registered tools are dead.

```
mastra/src/agent-construction.ts:103-110
const excluded = nativeToolNames.filter((t) => !surface.has(t));
if (excluded.length) { console.error(`[looprun] LoopRunAgent "${spec.id}": ${excluded.length}
host-registered tool(s) are NOT in spec.surface.tools and will never be active (deny-by-default): ...`);
```

**7. The judge input carries no user text, no guard events and no attempted calls, and tool
results are truncated at 800 characters.** `toJudgeCase` drops DumpTurn's `user`, `guardEvents`
and `attemptedCalls` fields, so the rubric alone must encode the entire ask; `resultSummary` is a
mechanical `JSON.stringify` of the raw tool result sliced to 800 chars, so only longer results are
partially invisible to the judge.

```
eval/src/judge-input.ts:37-47
caseId; rubric; actualReplyByTurn: string[]; actualTraceByTurn: JudgeTraceCall[][]
mastra/src/run-conversation.ts:336
resultSummary: JSON.stringify(tc.result ?? null).slice(0, 800)
```

**8. The wire envelope drops the observed tool-call history, and the whole looprun meta extension
is invisible to standard OpenAI SDKs.** `envelopeMeta()` copies five fields and omits `observed`;
the extension field itself is non-standard and typed SDKs strip it — for any typed-SDK harness the
only channel carrying guard activity is the model's prose reply.

```
server/src/handler.ts:29-37
return { sessionId: meta.sessionId, turnIndex: meta.turnIndex, corrections: meta.corrections,
  exhausted: meta.exhausted, violations: meta.violations };
server/src/openai.ts:48-49
// Non-standard extension (OpenAI SDKs ignore unknown fields): the governed-turn metadata.
looprun: args.looprun,
```

### confusing-names

**1. One structure travels under four names.** The field is `did`, the type is `Intention`, the
validator calls them claims, prose calls it the declaration — and `did` itself is a bare English
auxiliary that reads as a boolean at every use site.

```
core/src/runtime/claims.ts:224
export function validateClaims(did: unknown): { claims: Intention[]; errors: string[] }
mastra/src/agent.ts:405
const initial: RespondPayload = { message: initialText, did: actionHistory.did };
```

**2. The respond tool's own `did` description teaches the model a key the validator rejects.** It
names `target`, but the accepted key set is `targetName`/`targetValue`; a model that follows the
schema's prose passes zod (additionalProperties is dropped in the JSON-schema→zod conversion,
`terminal.ts:262-264`) and is then refused whole with an unknown-key error — burning a redrive on
advice the engine itself printed.

```
core/src/runtime/terminal.ts:332
description: 'AT LEAST ONE intention. Keys: `op`, `target`, `outcome` — any other key is rejected.'
core/src/runtime/claims.ts:175
const CLAIM_KEYS: ReadonlySet<string> = new Set(['op', 'targetName', 'targetValue', 'outcome', 'amount']);
```

**3. Two headers state a guard kind that does not exist anywhere in the codebase.**
`pendingConfirmMustAsk` has no factory, no catalog entry, and no runtime code — a phantom name
presented as law.

```
core/src/guards/index.ts:14
"`confirmFirst` / `pendingConfirmMustAsk` key on the ask INTENTION a delivered `respond` declares in its `did`"
core/src/runtime/action-history.ts:317
"this turn's `pendingConfirmMustAsk`"
```

**4. `forbidThisTurn` is misnamed by its own admission** — the check is an unconditional deny for
the binding's lifetime, not for one turn.

```
core/src/guards/flow.ts:77   check: () => reason,
core/src/guards/catalog.ts:53
"despite the name — the ban holds for as long as the binding is installed, not for one turn"
```

**5. The Dim taxonomy has five names but only three structural behaviors.** `'spatial'`,
`'input'` and `'run'` map to identical hook lists and identical misconfiguration reasons — the
distinction carries no enforceable meaning.

```
core/src/spec.ts:229-231
spatial: ['onInput', 'preTool', 'postTool'],
input:   ['onInput', 'preTool', 'postTool'],
run:     ['onInput', 'preTool', 'postTool'],
```

**6. `AgentSpec.mode` is an undocumented, unvalidated free string whose only consumer echoes it
back.** It is typed `mode: string` (`core/src/spec.ts:161`) with no doc comment and no constraint;
the mastra scripted runner records `finalMode: spec.mode` on every transcript turn regardless of
what the turn did (`mastra/src/run-conversation.ts:341, 354`).

**7. `contract.scrubTextFields` has dual semantics under one name.** The field paths ARE consumed
on the tool-result seam — the backend scrubs the free text inside exactly the named result fields
— but the authored-prose path degrades the list to a length check that switches on a global regex
scrub of the whole message.

```
mastra/src/sensitive-seam.ts:54,87   const declared = contract?.scrubTextFields;
core/src/runtime/turn.ts:427         return contract?.scrubTextFields?.length ? scrubText(text) : text;
```

**8. The prompt renderer's comment says de-duplication's "arbiter is byte-identity", but
`proseKey` is case-, whitespace- and trailing-punctuation-insensitive** — two differently-cased
rules are one rule to the dedup.

```
core/src/assembled-prompt.ts:274   "The arbiter is byte-identity"
core/src/prompt-fold.ts:119        return proseText(s).replace(/\s+/g, ' ').toLowerCase();
```

**9. Internal engine jargon ships verbatim in a model-facing prompt, with a broken article.** The
lie-rewrite instructions tell the model never to mention "a actionHistory" — a camelCase internal
identifier inside the instructions that produce user-delivered prose.

```
core/src/runtime/lie-check.ts:133-134
'- Speak as yourself, about what you did and did not do. Never mention or quote a record, a log, a',
'  actionHistory, a system, a check or a verification — the user is talking to you, not to a machine — and',
```

**10. Two unrelated concepts both answer to `chain` in the same functions.** `session.chain` is a
promise-chain mutex tail while `spec.controls.chains` are flowChain completion rules.

```
mastra/src/session.ts:22-23         /** Promise-chain mutex tail. */ chain: Promise<unknown>;
mastra/src/run-conversation.ts:246  if (spec.controls.chains?.length) { const chainPass = await runChainCompletionPass(...
```

**11. The `LocalModelSpec.kv` field doc contradicts the shipped registry.** The type declares f16
universal and q8_0 an env-var-only escape hatch, while two of the five registry specs bake
`kv:'q8_0'` as their default.

```
models/src/port.ts:25-27
'KV cache precision — f16 on every tier (measured: +23% decode vs q8_0 even on the 4B...).
 q8_0 is a RAM escape hatch only ($LLAMA_KV=q8_0).'
models/src/aliases.ts:79,113   kv: 'q8_0',
```

**12. The models package's flagship exports erase their types.** `localModel` returns
`Promise<any>`, so the public API everything downstream builds an agent on has no compile-time
shape.

```
models/src/index.ts:56-57
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function localModel(alias: string, opts: LocalModelOptions = {}): Promise<any> {
```

### entangled-dependencies

**1. `turn.ts` is a 1045-line hub importing 13 repo modules — over the repo's own 800-line file
rule — and the runtime and guards directories are mutually coupled.** The runtime imports guards
four ways (`canonArgs`, `valueSpokenBy`, `targetMatchesValue`, `CLOSED_FAIL_DENY`) while the guard
vocabulary type-imports `runtime/claims`; consent imports the runtime's approval matcher, which
imports back into guards — a cross-directory cycle held off at runtime only by `import type`
erasure.

```
core/src/runtime/claims.ts:13-14
"the single `ObservedCall` import below is `import type` (erased by the compiler), so no runtime
cycle forms even though `rules.ts` names `Intention` from here."
core/src/guards/consent.ts:7            import { approvalMatchesCall } from '../runtime/approval-request.js';
core/src/runtime/approval-request.ts:34-35
import { valueSpokenBy } from '../guards/matching.js';
import { canonArgs } from '../guards/flow.js';
```

**2. `spec.ts` and `assembled-prompt.ts` import each other, and the authoring surface reaches
into guards and runtime at construction time** — it cannot be understood or reused without three
other areas.

```
core/src/spec.ts:42             import type { ContractGuardBinding, DomainContract } from './assembled-prompt.js';
core/src/assembled-prompt.ts:25 import { resolveBindings } from './spec.js';
```

**3. The consent-critical terminal-pruning readers are typed `any` and duck-read four alternative
field spellings of a framework step shape.** A fifth spelling from a framework upgrade turns the
consent-evidence prune into a silent no-op; the file states the risk itself (`terminal.ts:46-48`).

```
core/src/runtime/terminal.ts:50      export function prematureTerminalTools(steps: any): string[]
core/src/runtime/terminal.ts:133-134 return String(tc?.toolName ?? tc?.name ?? tc?.payload?.toolName ?? tc?.payload?.name ?? '');
```

**4. The `AgentWorld` seam is typed `any` through an index signature**, so every domain accessor
a guard or contract reads is unchecked at compile time — `world.imageQuotaRemainig` compiles and
reads `undefined` at run.

```
core/src/rules.ts:32-33
// eslint-disable-next-line @typescript-eslint/no-explicit-any
[k: string]: any;
```

**5. The terminal-tool vocabulary is defined twice with no shared source.** `spec.ts` and
`define-world.ts` each hardcode `['respond']`; adding a terminal tool requires editing both or the
spec constructor and the world disagree about what is runtime-owned.

```
core/src/spec.ts:207              const TERMINAL_TOOLS = ['respond'];
core/src/world/define-world.ts:30 const TERMINAL_TOOLS = new Set(['respond']);
```

**6. The governed turn machine exists twice in mastra, and the copies diverge.**
`agent.ts#governedTurn` and `runSpecConversation` carry near-verbatim copies of the
terminal-pruning, forced-terminal, chain-pass and redrive blocks (identical comments included).
Divergences: the disclosure completion pass runs only in the scripted runner
(`run-conversation.ts:275`); judge behavior is asymmetric — the scripted runner silently
self-judges on the subject's own model (`run-conversation.ts:106-109` —
`deps.judge ?? defaultJudge(...)`) while `LoopRunAgent` throws at construction when an `llmCheck`
spec has no host judge (`agent.ts:176-178` — `assertJudgePresent(spec, config.judge)`); and
`agent.ts:53`'s `import { judgeOptions, judgeText } from './judge.js'` is dead code — neither name
appears anywhere else in the file.

```
mastra/src/agent.ts:331-347 and mastra/src/run-conversation.ts:212-227
"The closing step must be TERMINAL-ONLY..."   // the same block in both files
```

**7. `LoopRunResultMeta` is a module-local type consumed cross-package by hand-mirroring.** The
server package keeps a duplicate; the two are pinned by a compile-time mutual-assignability check
that fails typecheck on a rename, a type change, or a required field added on either side — the
one drift it cannot catch is an optional field added to one side only.

```
mastra/src/agent.ts:119-121
"MIRRORED by `LoopRunResultMeta` in `packages/server/src/types.ts` ... Change a field here and
change it there"
```

**8. `guards/shared.ts` carries five exported helpers with zero code consumers** — `lc`, `ran`,
`ranThisTurn`, `isTerminalCall`, and `askedInDeliveredTurn`, the last documented as "The ONE
cross-turn ask signal, shared by every kind that reads one" while nothing imports it (comments in
`runtime/claims.ts:534`, `runtime/turn.ts:785` and `mastra/src/agent.ts:500` reference it; the
only shared.ts symbols with real importers are `escapeRe`, `TERMINAL_TOOLS`,
`domainCallsThisTurn` and `matches`). Dead surface that reads as live law.

**9. `fold.ts` is the eval package's accidental utility hub.** The generic JSONL parser lives
inside the verdict-folding module and five other modules import it from there
(`campaign.ts:26`, `cert.ts:11`, `judge-input.ts:24`, `monitor.ts:20`, `commands.ts:12`).

```
eval/src/fold.ts:66
export function readJsonl<T>(text: string): T[]
```

### dubious-status-names

**1. The core outcome vocabulary mixes result states with conversational states and gives one act
several interchangeable encodings.** "Asking the user" splits across `tool_called_request_approval`
(an ACTION outcome), `any_other_question` (an outcome that is by design never checkable — "Speech
is not an operation: nothing the engine recorded can prove a question"), and the SPEECH op `ask`;
a single vetoed attempt honestly supports three interchangeable words with no distinguished
meaning.

```
core/src/runtime/claims.ts:28-31
| 'tool_called_request_approval'
/** The agent is asking the user something. No call is involved, so nothing recorded can prove it. */
| 'any_other_question'
core/src/runtime/claims.ts:59      SPEECH_OPS = ['inform','greet','refuse','ask']
core/src/guards/honesty.ts:208     outcomes: new Set(['tool_called_request_approval', 'blocked', 'refused'])
eval/src/norms-config.ts:35-36     'tool_called_request_approval', / 'any_other_question',   // in CORE_OUTCOME_VALUES
```

**2. The world audit outcome `custom` names the mechanism instead of the result.** A failing
custom executor audits identically to a succeeding one.

```
core/src/world/define-world.ts:192   audit.push({ tool: name, outcome: 'custom' });
core/src/world/types.ts:167          'ok' | 'denied' | 'simulated' | 'unknown-tool' | 'custom'
```

**3. Terminal calls are invisible to an audit trail whose type doc says it records every exec.**
`exec('respond', …)` returns before either audit push.

```
core/src/world/types.ts:160      "the audit action history — every exec, gate outcome, and mint, in order."
core/src/world/define-world.ts:125  if (TERMINAL_TOOLS.has(name)) return { success: true };
```

**4. TurnRecord metrics are fabricated constants.** `iters` and `llmCalls` are always the same
computed number; the error path hardcodes `llmCalls: 1` even when the failure preceded any call;
`assistantMsgCount` is hardcoded 1 no matter how many messages the fallback/chain/disclosure
passes pushed; every recorded tool call carries `latencyMs: 0`.

```
eval-side source: mastra/src/run-conversation.ts:343   iters: stepCount, llmCalls: stepCount,
mastra/src/run-conversation.ts:355                     iters: 0, llmCalls: 1, toolCalls: [],
mastra/src/run-conversation.ts:341                     assistantMsgCount: 1,
mastra/src/run-conversation.ts:335-336                 latencyMs: 0
```

**5. The `turnCorrections`/`recoveryEvents`/`corrections` tag grammar mixes three shapes across
packages.** Bare words, hyphenated phrases, and one-to-three-segment colon forms coexist
(`'terminal-rejected'`, `'forced-terminal'`, `'premature-terminal:X'`, `'redrive:kind'`,
`'output:kind:tool'`, `'lie-check:rewritten'`), and the server's `corrections` field documents the
mix as its own vocabulary — consumers must pattern-match per tag instead of parsing one shape.

```
mastra/src/run-conversation.ts:217/224/227   premature-terminal:… / premature-terminal-pruned:… / superseded-terminal:…
mastra/src/hooks.ts:44                       'terminal-rejected'
mastra/src/testing/proof-loop.ts:9-11        `${dim}:${kind}:${tool}`
server/src/types.ts:26
/** Guard activity this turn: veto kinds, 'forced-terminal', 'redrive:*', 'exhaustion-terminal'. */
```

**6. The fold's verdict registers overlap three ways.** The final vocabulary is the mixed-case
pair `'pass' | 'FAIL'`; the judge verdict is an unvalidated free string with a silent `overall`
alias; `'unjudged'` is both a placeholder and an effective FAIL — any judge typo (`'Pass'`,
`'passed'`) folds to FAIL with no warning.

```
eval/src/fold.ts:20     final: 'pass' | 'FAIL';
eval/src/fold.ts:9-12   verdict?: string; /** Accepted as a verdict alias. */ overall?: string;
```

**7. The ungoverned variant carries two names in the same pipeline.** CaseDump labels it
`'ungoverned'` while the campaign manifest labels the same dir `'control'` — a consumer joining
`judging.json` to `cases.jsonl` must know the alias.

```
eval/src/campaign.ts:172   variant: plan.ungoverned ? 'control' : 'governed'
eval/src/run.ts:36         variant: 'governed' | 'ungoverned';
```

**8. A failed governed turn under `stream:true` is reported as HTTP 200.** The Response returns
before the turn settles, the error arrives as an in-band SSE data event, and no `data: [DONE]`
follows it — a harness checking HTTP status records success. The non-stream path for the identical
failure returns 500.

```
server/src/handler.ts:116-117   return new Response(stream, {\n          status: 200,
server/src/sse.ts:61-63
} catch (error) {
  // Mid-stream failure: emit an OpenAI-style error event then terminate the stream.
  controller.enqueue(sseData(args.onError(error)));
```

### other

**1. Consent tokens hash the canonical call into only 4 hex characters (16 bits), and
`consumeApprovals` consumes every open approval whose token the message carries.** Two different
open acts on the same tool whose args collide in the hash share one literal, and one typed reply
licenses both.

```
core/src/runtime/action-history.ts:154
return h.toString(16).toUpperCase().padStart(8, '0').slice(0, 4);
core/src/runtime/action-history.ts:136   token "CONFIRM ${c.code}-${shortHash(canon)}"
core/src/runtime/approval-request.ts:130-136   // loops all open approvals, consumes each match
```

**2. postTool (result-invariant) violations are enforced exactly once.** They are prepended to
the violation set before the redrive loop, but each iteration recomputes `violations` from the
onReply checks alone — a model that ignores the correction on its first redrive gets a clean
delivery, with the failing invariant silently dropped rather than driving salvage/exhaustion.

```
core/src/runtime/turn.ts:777
if (actionHistory.postToolViolations.length) violations = [...actionHistory.postToolViolations, ...violations];
core/src/runtime/turn.ts:796-797   // inside the loop
checked = await checkPayload(spec, actionHistory, world, payload, contract);
violations = checked.violations;
```

**3. A read-only turn can declare `blocked`, `refused` or `no_op` on any record it addressed via
a read — with no veto, no world refusal and no rule firing — and `claimIsGrounded` passes it.**
The renderer then announces a verified refusal that never happened; after any empty read,
`not_found` joins the free set.

```
core/src/guards/honesty.ts:337-338
const ruleWords: CoreOutcome[] = readOnly && addressed
  ? (emptyRead ? ['blocked', 'refused', 'not_found', 'no_op'] : ['blocked', 'refused', 'no_op'])
  : [];
// followed by: if (byRule) continue;   (line 348)
```

**4. `claim.target` is optional and unenforced.** A targetless `success` declaration grounds on
any effected write, and `claimIsComplete` matches acts to declarations by outcome word alone —
`supportsClaim` is never called in that direction — so its own deny's demand to report each act
"naming the record it touched" is checked by nothing.

```
core/src/guards/honesty.ts:266      if (claim.target === undefined) return true;
core/src/guards/honesty.ts:395-397
declared.findIndex((c, i) => !spent.has(i)
  && act.outcomes.has(resolveOutcome(c.outcome ?? '', opts.outcomes) as CoreOutcome))
```

**5. A declared `amount` corroborates against any whole-value numeric string leaf in the act's
result, key-blind by design.** Only leaves whose entire trimmed value `Number()`-parses are
collected (a digit-only id like `'12345'` qualifies; a formatted phone string does not), and the
corroboration reads `act.result` only, never the args — so an id digit string in the result can
still license a fabricated monetary figure.

```
core/src/guards/honesty.ts:140-142
if (typeof v === 'string' && v.trim()) { const n = Number(v.trim()); if (Number.isFinite(n)) out.push(n); }
// under the comment "Key-blind on purpose" (honesty.ts:124)
```

**6. Server session security: any client can name any session, and authentication is optional by
default.** The `x-looprun-session` header wins the resolution chain unconditioned, so under a
shared key one caller can attach to another caller's governed session and continue its stateful
world; with no `config.apiKey` set (the field is `apiKey?`), the bearer check is skipped entirely
and the endpoint accepts unauthenticated requests — the only default mitigation is the loopback
bind, and the hostname is caller-overridable.

```
server/src/session.ts:48-49   const header = headers.get(SESSION_HEADER); if (header) return header;
server/src/handler.ts:55      if (config.apiKey) {          // the whole auth block is inside this guard
server/src/server.ts:56       const hostname = config.hostname ?? '127.0.0.1';
```

---

## The load-bearing mechanisms

The mechanisms the Atlas exam depends on, where each lives, and the invariant it enforces.

| mechanism | where it lives | invariant it enforces |
|---|---|---|
| Consent licence — the exact call + the typed literal `CONFIRM TOOL-HASH` | `core/src/runtime/approval-request.ts` (licence matching, token consumption) + `core/src/runtime/action-history.ts` (token minting: `CONFIRM ${c.code}-${shortHash(canon)}`, approval issuance/consumption) + `core/src/guards/consent.ts` (`confirmFirst`) | A destructive act runs only when the user has typed back the engine-issued token and the retried call fingerprint-matches (`canonArgs`) the licensed call. |
| Disclosure slots filled from target-linked reads | `core/src/runtime/disclosure.ts` (`{tool.path}` slots bound to observed reads that name the approval's subject) | The consent question shows the domain's authored sentences filled with figures from reads the world actually returned, not model prose. |
| Forced disclosure reads via `toolChoice: 'required'` | `mastra/src/run-conversation.ts` (`runDisclosureCompletionPass`) driven by `unreadDisclosureSources` in `core/src/runtime/disclosure.ts` | A consent question is not delivered while a disclose template's source read is still owed; the pass forces the read before delivery. Runs on the scripted-runner path. |
| Honest report — each declaration spends one act | `core/src/guards/honesty.ts` (`claimIsGrounded`, `claimIsComplete`) | Every declared outcome must be backed by a recorded act that honestly supports it (no lying), and every effected act must be declared (no hiding); acts are spent one-per-declaration. |
| Approval rendered in every delivery until consumed | `core/src/runtime/turn.ts` (`composeDeliveryText` renders engine-owned consent questions) + `core/src/runtime/approval-request.ts` (open/consumed/closed lifecycle) | The user cannot miss a pending confirmation: the engine, not the model, renders the question and the token under every reply while the approval is open. |
| Sensitive-field filtering at three seams | `core/src/runtime/sensitive-filter.ts` (the pure filter) + `mastra/src/sensitive-seam.ts` (args in via `scrubToolArgs`; results in `tools.ts` execute and again in `hooks.ts` afterToolCall) | Declared sensitive fields are omitted/masked and declared free-text fields scrubbed before the model, the record, or the user sees a tool crossing. |
| Guard priorities `agent > changeAllowed > consent > honesty > always` | `core/src/spec.ts:209-210` (binding sort at `addGuard` time) | Guard bindings evaluate in a fixed priority order per hook, so an agent-scoped rule speaks before the universal invariants and the always-kinds run last. |

The judge that scores a run is the agent in the session: the harness emits blind
`judge-input.part*.jsonl` chunks (`eval/src/judge-input.ts`) and the verdicts are written to
`verdicts.jsonl` by the agent reading them — no file in this repository calls a third-party model
API. The one model any run may reach is the SUBJECT under test, named in `ask/targets.json` and
built by `eval/src/provider.ts`.
