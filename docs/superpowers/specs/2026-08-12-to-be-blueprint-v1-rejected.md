# looprun — TO-BE Architecture Blueprint (v1)

**Status: REJECTED — not a base for anything.** The authoring surface fails the golden
rule: creating an agent must stay as simple as 1 agent = 1 `AgentSpec` plus one global
`DomainContract`, teachable in a tutorial. This version split the contract three ways and
pushed per-tool authoring burden onto the domain. The successor is designed from scratch;
this document is kept only as the record of the rejected direction.

High-level TO-BE design for the looprun engine: a class-based, strongly typed TypeScript
architecture with clear single responsibilities, shallow dependencies, and no inference —
built so the defect classes documented in
[`docs/superpowers/2026-08-12-blueprint-as-is.md`](../../analysis/2026-08-12-blueprint-as-is.md)
are **unrepresentable in the types**, not merely reviewed away.

Scope: blueprint only. No implementation, no migration plan, no compatibility shims
(pre-1.0, no external consumers). Validation criterion: the Atlas exam in `agentspec-bench`
must score **≥ 85/100** on the rebuilt engine, or the divergence must be traced to a case
that was only passing through a defect.

---

## The thesis

```
              THE PARTY THAT OWNS A FACT AUTHORS IT — THE ENGINE NEVER INFERS

   the tool DECLARES          the executor ATTESTS           the engine ENFORCES + RENDERS
   ┌─────────────────┐        ┌──────────────────┐          ┌───────────────────────────┐
   │ ToolContract    │        │ Attestation      │          │ assigns every ActOutcome  │
   │  effect class   │        │  effected        │          │ mints every actId         │
   │  own simulation │        │  no_effect       │          │ stores the approved call  │
   │  parameter      │        │  simulated       │          │ runs the ONLY turn loop   │
   │  target arg     │        │  refused         │          │ renders every known fact  │
   │  sensitive      │        │  not_found       │          │ into the Delivery         │
   │  fields         │        │  failed          │          │                           │
   └─────────────────┘        │  unattested ◄────┼── honest │ the model only REFERENCES │
                              └──────────────────┘  absence │ engine facts, by actId    │
                                                            └───────────────────────────┘
```

Every boundary is a typed port; every fact crossing a boundary is a typed envelope.
Because the engine assigns outcomes and mints act ids, honesty checking collapses from
heuristic cross-checks into exact bipartite matching. Because the engine stores the
approved call and feeds it through its own pipeline, the consent licence covers exactly
that call by construction. Because adapters implement only single-step ports, no adapter
can duplicate the turn machine or weaken governance — the knobs do not exist.

## The laws

1. **Typed envelopes only.** Nothing is inferred from field names, result shapes, name
   prefixes, or call/serialization order. If a fact is not declared or attested, it does
   not exist.
2. **One turn machine.** `Engine.runTurn` is the only loop. `ModelPort.step` is one
   generation step; `ToolPort.execute` is one call. An adapter structurally cannot loop,
   override hooks, or reorder the terminal protocol.
3. **Absence of proof is a value.** `Attestation` has an `unattested` member, priced
   fail-closed in both directions: an unverified destructive act counts as dangerous
   (throttle, consent) and never grounds a success sentence. The closure never says
   "nothing was changed" over a write it cannot see.
4. **Deterministic channel for every known fact.** The `Delivery` envelope carries the
   operation record, disclosures, approval questions, denial reasons, and closure beside
   the model's scrubbed prose. The whole `TurnRecord` flows through `DeliveryPort` — no
   wire facade mirrors or drops fields.
5. **Canonical identity.** `ToolCall.canonical()` (sorted-key deep form) is the only call
   identity; engine-minted `actId`s are the only act identity. No `JSON.stringify`
   fingerprints, no greedy first-fit matching.
6. **Guards are pure.** `Guard.check` is synchronous over a frozen `TurnView` — I/O and
   text-regex verdicts are inexpressible. Model judgment goes only through `JudgePort`,
   which carries no endpoint: its lawful implementations wrap the session's own model or
   the agent in session.
7. **One home per type.** Every crossing shape lives in `@looprun/contract` and is
   imported everywhere it is consumed. Hand-mirrored types cannot exist.
8. **The guard priority law holds for everything** — `agent > changeAllowed > consent >
   honesty > always` — including a consented call: consuming a licence satisfies only the
   consent gate; every other guard still runs on the stored call.

---

## Package layout

```
packages/
├── contract/          @looprun/contract — every crossing type: enums, envelopes, ports,
│                      the ToolCall value class. ZERO dependencies, zero logic beyond
│                      ToolCall canonicalization. The single home that kills mirrors.
├── engine/            @looprun/engine — the ONE turn machine and its collaborators:
│                      Engine, CallPipeline, ReplyPipeline, ActionLedger, ConsentProtocol,
│                      TerminalProtocol, HonestyCheck, DisclosureRenderer, SensitiveFilter,
│                      PromptRenderer, AgentDefinition, guard factories.
│                      Depends only on contract.
├── worlds/            @looprun/worlds — DeclarativeWorld: a WorldSpec interpreted into a
│                      deterministic ToolPort + WorldPort that attests every call.
│                      Depends only on contract.
├── adapter-mastra/    @looprun/adapter-mastra — MastraModelPort: one @mastra/core
│                      generation step behind ModelPort. No turn logic, no hooks,
│                      no tool registration.
├── adapter-native/    @looprun/adapter-native — NativeToolPort: host/MCP tools behind
│                      ToolPort. Attests from protocol facts only; returns 'unattested'
│                      when the host cannot attest (the type forces the choice).
├── exam/              @looprun/exam — drives the SAME Engine through a scripted ModelPort
│                      and DeclarativeWorld; judge-input builder, verdict fold,
│                      certification. No second loop. (Own follow-up blueprint.)
└── server/            @looprun/server — OpenAI-compatible facade; implements
                       DeliveryPort; ships the whole TurnRecord on the wire.
```

Dependency graph — every arrow points at `contract`, and only there:

```
        worlds ──┐            ┌── adapter-mastra
                 ▼            ▼
   engine ──► contract ◄── adapter-native
                 ▲            ▲
        exam ────┘            └── server

   engine reaches worlds/adapters ONLY through the port interfaces.
   No cycles. No package imports engine except as a composition root.
```

---

## One governed turn, end to end

```
User        Engine                ConsentProtocol       CallPipeline         ToolPort      ModelPort
 │            │
 │──text────► │
 │            │── world.beginTurn()  [awaited — stale-state race unrepresentable]
 │            │── runStage(OnInput)          priority: Agent > ChangeAllowed > Consent > Honesty > Always
 │            │      denied? ─► Delivery.denials gets {guardId, reason}; approvals stay OPEN; turn ends
 │            │── consumeFrom(text) ──────► │   exact standalone token literal → approvals become ARMED
 │            │◄─ armed approvals ───────── │   (arming is NOT execution)
 │            │
 │            │── for each armed approval:                                ┌────────────────────────────┐
 │            │      run(approval.storedCall, origin:'licence') ────────► │ BeforeCall stage runs FULLY│
 │            │                                                           │ consent gate: pre-satisfied│
 │            │                                                           │ agent/changeAllowed: can   │
 │            │                                                           │ still VETO (approval closed│
 │            │                                                           │ 'vetoed', delivered)       │
 │            │                                                           └──────────┬─────────────────┘
 │            │                                                    execute(call) ──► │
 │            │                                     snapshot-diff check ◄─ report ── │
 │            │                                     filter → ledger.record(actId, outcome)
 │            │
 │            │── MODEL LOOP (until terminal accepted or maxSteps → forced terminal-only step):
 │            │      renderSystem + state block + user tail ────────────────────────────────► step()
 │            │      ◄──────────────────────────────────────────── {toolCalls, text} ────────┘
 │            │      TerminalProtocol.acceptStep: respond beside domain calls = deferred + Correction
 │            │      per domain call, SERIAL (engine-sequenced, never host-scheduled):
 │            │         CallPipeline.run(call, origin:'model'):
 │            │            BeforeCall verdicts:
 │            │              deny             → ledger.record(Vetoed) + Delivery.denials
 │            │              simulate_instead → call.withArg(contract.simulation.name, enable)
 │            │              require_approval → ENGINE performs owed reads per declared recipes
 │            │                                 (origin:'engine', bound to approvalId) → disclosure
 │            │                                 slots filled → consent.issue(storedCall) →
 │            │                                 ledger.record(AwaitingApproval)
 │            │            execute → attest → snapshot-diff check → filter → record → actId
 │            │            echoed to the model inside the tool-result envelope
 │            │            AfterCall stage
 │            │
 │            │── ReplyPipeline.finalize(declaration):
 │            │      parseDeclaration → OnReply guards (HonestyCheck: exact bipartite, both
 │            │      directions) → judged rules via JudgePort (typed verdict) → redrive
 │            │      ≤ maxRedrives carrying ALL open violations each iteration →
 │            │      exhausted? closure := exhaustionClosure(acts)  [attestation-derived]
 │            │
 │            │── composeDelivery: scrubProse(prose) + operationRecord(EVERY act) +
 │            │      disclosures(after/later) + approvalQuestions(EVERY open approval) +
 │            │      denials + closure
 │            │── sealTurn(TurnRecord) → DeliveryPort.deliver(TurnRecord)
 │ ◄─ Delivery┘
```

The consent path in one picture — the licence is the call, and the pipeline is never
bypassed:

```
turn N                                        turn N+1
agent: transferAsset({asset:'ast_1',          user: "CONFIRM TRANSFERASSET-3F09A4C1"
       to:'ws_denver'})                              │
  │ consent guard: no licence,                       ▼
  │ simulation declared                        consumeFrom: token matches → approval ARMED
  ▼                                                  │
simulate_instead: the SAME call runs                 ▼
with its OWN declared parameter                CallPipeline.run(storedCall, origin:'licence')
  │                                                  │ BeforeCall: agent guards still run,
  ▼                                                  │ throttle still counts, consent
attests {kind:'simulated', preview}                  │ pre-satisfied by the armed licence
  │                                                  ▼
  ▼                                            execute → attests {kind:'effected', changes}
engine performs owed reads (recipes) →               │
disclosure slots filled → issue():                   ▼
  storedCall = the pre-rewrite call            outcome := Effected; delivered in the
  token = CONFIRM TRANSFERASSET-3F09A4C1       operation record; approval CONSUMED
  (8 hex from sha256(canonical + nonce))
  │
  ▼
Delivery.approvalQuestions renders the
question + disclosure in EVERY delivery
until consumed or closed
```

---

## Class catalog — @looprun/contract

Zero-dependency types. Everything below is imported by engine, worlds, adapters, exam,
and server alike.

### Enums

**`ActOutcome`** (enum) — the one closed outcome vocabulary for an attempted act.
Assigned only by the engine from guard verdicts plus the attestation; the model never
declares an outcome.

| member | meaning |
|---|---|
| `Observed = 'observed'` | a read completed and attested its result |
| `Effected = 'effected'` | the world attested a state change |
| `NoEffect = 'no_effect'` | a write ran and attested that nothing changed (honest no-op) |
| `Simulated = 'simulated'` | a side-effect-free preview ran and attested so |
| `Refused = 'refused'` | the world refused the act (gate/precondition), attested |
| `Failed = 'failed'` | the executor errored, attested |
| `NotFound = 'not_found'` | the target record does not exist, attested by the world |
| `Vetoed = 'vetoed'` | an engine guard denied the call before execution |
| `AwaitingApproval = 'awaiting_approval'` | the engine converted the call into an approval question |
| `Unverified = 'unverified'` | the call executed but the executor returned `unattested` |

Asking the user is **not** an outcome: a pending `ApprovalRequest` is an engine fact,
rendered deterministically. The `tool_called_request_approval` / `any_other_question`
split does not exist here.

**`ToolEffect`** (enum) — the declared effect class of a tool; destructiveness is stated
on the contract, never inferred from the tool's name.

```
Read = 'read' · Write = 'write' · Destructive = 'destructive'
```

**`GuardPriority`** (enum) — numeric, so sorting is the ordering, ascending.

```
Agent = 0 · ChangeAllowed = 1 · Consent = 2 · Honesty = 3 · Always = 4
```

**`GuardStage`** (enum) — the four points in a turn where a guard can run.

```
OnInput = 'on_input' · BeforeCall = 'before_call' · AfterCall = 'after_call' · OnReply = 'on_reply'
```

### Envelope types

**`JsonValue`** (type) — the usual JSON union: `string | number | boolean | null |
JsonValue[] | { [k: string]: JsonValue }`.

**`WorldSnapshot`** (type) — the fully typed world state shape; there is no untyped
index-signature seam.

```ts
Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, JsonValue>>>>>>
//                entity                    id                    field → value
```

**`RecordChange`** (type)

```ts
{ entity: string; id: string; field: string | null; from: JsonValue | null; to: JsonValue | null }
```

**`Attestation`** (type) — the executor's own typed statement of what a call did.
`unattested` is an explicit member, not an undefined flag.

```ts
| { kind: 'effected';  changes: readonly RecordChange[] }
| { kind: 'no_effect'; reason: string }
| { kind: 'simulated'; preview: readonly RecordChange[] }
| { kind: 'observed' }                                       // a read's honest answer
| { kind: 'refused';   reason: string }
| { kind: 'not_found'; entity: string; id: string }
| { kind: 'failed';    error: string }
| { kind: 'unattested' }
```

**`ExecutionReport`** (type) — what every `ToolPort.execute` returns; result and
attestation are never conflated.

```ts
{ readonly result: JsonValue; readonly attestation: Attestation }
```

**`GuardVerdict`** (type) — the closed set of guard answers. `require_approval` and
`simulate_instead` are emitted only by the consent guard.

```ts
| { kind: 'allow' }
| { kind: 'deny';             guardId: string; reason: string }
| { kind: 'require_approval'; guardId: string }
| { kind: 'simulate_instead'; guardId: string }
```

**`ApprovalRequest`** (type) — the consent licence: an engine-issued question bound to
the exact stored call.

```ts
{
  readonly approvalId: string
  readonly storedCall: ToolCall        // the exact call the licence covers — always the
                                       // PRE-rewrite candidate, its declared simulation
                                       // parameter stripped if the model supplied one
  readonly token: string               // 'CONFIRM TRANSFERASSET-3F09A4C1' — tool name +
                                       // 8 hex of sha256(canonical + ':' + nonce)
  readonly nonce: string               // per-issuance entropy: a re-issued question for
                                       // the same call mints a FRESH literal; a stale
                                       // quoted token can never consume a new ticket
  readonly disclosure: readonly string[]        // before-tense sentences, slot-filled
  readonly boundReads: readonly { alias: string; actId: string }[]
                                       // the engine-performed reads that filled the slots
  readonly status: 'open' | 'armed' | 'consumed'
                 | { closed: 'declined' | 'superseded' | 'expired' | 'vetoed' }
  readonly issuedAtTurn: number
  readonly bornFromActId: string | null // the simulation act this question was born from;
                                        // null when the contract declares simulation 'none'
}
```

**`Declaration`** (type) — the model's terminal payload. The model **references**
engine facts by id and **claims** outcomes the ledger must ground; it never authors a
fact. There is no free-text note field — prose belongs only in `message`.

```ts
{
  readonly message: string
  readonly acknowledges: readonly { actId: string }[]
  readonly claims: readonly { tool: string; targetValue: JsonValue | null; outcome: ActOutcome }[]
}
```

**`ActRecord`** (type) — one ledger row. The filtered forms are the ONLY stored forms:
raw sensitive data never enters the ledger.

```ts
{
  readonly actId: string               // engine-minted; echoed to the model in the
                                       // tool-result envelope
  readonly turn: number
  readonly origin: 'model' | 'engine' | 'licence'
                                       // model-proposed, engine-performed owed read,
                                       // or licensed execution of a stored call
  readonly call: ToolCall              // args post SensitiveFilter.filterArgs
  readonly effect: ToolEffect          // stamped from the contract at record time
  readonly outcome: ActOutcome         // engine-assigned, never model-declared
  readonly attestation: Attestation    // post SensitiveFilter.filterAttestation
  readonly filteredResult: JsonValue   // post SensitiveFilter.filterResult
  readonly verdicts: readonly GuardVerdict[]
  readonly approvalId: string | null   // set on owed reads and licensed executions
}
```

**`Correction`** (type) — one discriminated grammar for everything the engine had to do
about the model's behavior. No string-prefix tag families.

```ts
| { kind: 'redrive';                stage: GuardStage; guardId: string; reason: string }
| { kind: 'premature_terminal' }     // respond shared a step with domain calls; deferred
| { kind: 'superseded_terminal' }    // an earlier respond lost the delivery contest
| { kind: 'forced_terminal' }        // model never closed; engine forced the respond step
| { kind: 'executor_contradiction';  actId: string; claimed: Attestation['kind'];
    observed: 'state_changed' | 'no_state_change' }   // snapshot diff disagreed
| { kind: 'simulation_revoked';      tool: string }   // this session no longer trusts the
                                                      // tool's simulation path
| { kind: 'judge_unreadable';        ruleId: string }
```

**`TurnRecord`** (type) — the sealed record of one governed turn; the single shape that
flows whole through `DeliveryPort` to hosts, the exam, and the server.

```ts
{
  readonly turn: number
  readonly userText: string
  readonly acts: readonly ActRecord[]
  readonly approvalsIssued: readonly ApprovalRequest[]
  readonly approvalsConsumed: readonly string[]     // approvalIds consumed from this text
  readonly approvalsClosed: readonly { approvalId: string;
      reason: 'declined' | 'superseded' | 'expired' | 'vetoed' }[]
  readonly declaration: Declaration | null
  readonly delivery: Delivery
  readonly corrections: readonly Correction[]
  readonly exhausted: boolean
}
```

**`TurnView`** (type) — the frozen, fully typed read surface a guard receives. No world
handle, no I/O, no untyped index signature.

```ts
{
  readonly userText: string
  readonly candidate: ToolCall | null              // set at BeforeCall
  readonly candidateContract: ToolContract | null
  readonly candidateOrigin: 'model' | 'engine' | 'licence' | null
  readonly armedApproval: ApprovalRequest | null   // the ARMED approval whose storedCall
                                                   // canonically equals the candidate —
                                                   // set only on the engine-fed licensed
                                                   // call; an OPEN approval is never a
                                                   // licence
  readonly report: ExecutionReport | null          // set at AfterCall
  readonly declaration: Declaration | null         // set at OnReply
  readonly actsThisTurn: readonly ActRecord[]
  readonly history: readonly TurnRecord[]          // sealed prior turns
  readonly pendingApprovals: readonly ApprovalRequest[]
  readonly worldRecord: (entity: string, id: string) =>
      Readonly<Record<string, JsonValue>> | null   // typed accessor — a missed lookup is
                                                   // a visible null, never a silent pass
}
```

**`Delivery`** (type) — the deterministic channel to the user. Engine-rendered sections
travel beside the model's scrubbed prose, so every engine-known fact reaches the user
even if the prose omits it.

```ts
{
  readonly prose: string                            // model-authored, scrubbed
  readonly operationRecord: readonly { actId: string; sentence: string }[]
                                                    // EVERY act, reads included
  readonly disclosures: readonly string[]           // after/later-tense domain sentences
  readonly approvalQuestions: readonly { approvalId: string; token: string;
      question: string; disclosure: readonly string[] }[]
                                                    // rendered in EVERY delivery until
                                                    // consumed or closed
  readonly denials: readonly { guardId: string; reason: string }[]
                                                    // an input-denied turn and every
                                                    // vetoed call's public reason reach
                                                    // the user deterministically
  readonly closure: { kind: 'normal' }
                  | { kind: 'exhausted'; sentence: string }
}
```

**`DisclosureTemplate`** (type) — a domain-authored sentence with declared read recipes.
Slots reference recipe aliases, so a question about a transfer can bind two records read
by the same tool.

```ts
{
  readonly tool: string                             // matched against declared contract
                                                    // names — any spelling, hyphens and
                                                    // dots included
  readonly tense: 'before' | 'after' | 'later'
  readonly sentence: string                         // '{source.balance}' — {alias.path}
  readonly readsFrom: readonly {                    // before-tense only; the ENGINE
    as: string                                      // performs these reads itself
    tool: string
    argsFromApproval: Readonly<Record<string, string>>
                                                    // read-arg name → storedCall arg name
  }[]
}
```

**`WorldSpec`** (type) — the declarative fixture-world vocabulary a generated subject
emits. Closed data: no functions, no regexes.

```ts
{
  readonly entities: Readonly<Record<string, { fields: readonly string[] }>>
  readonly presets: Readonly<Record<string,
      readonly { entity: string; id: string; values: Record<string, JsonValue> }[]>>
  readonly defaultPreset: string
  readonly tools: readonly {
    name: string
    description: string
    effect: ToolEffect
    targetArg: string | null
    simulation: { kind: 'none' } | { kind: 'parameter'; name: string; enable: JsonValue }
    args: readonly { name: string; type: 'string' | 'number' | 'boolean'; required: boolean }[]
    gates: readonly Gate[]              // evaluated against the record named by targetArg,
                                        // on EVERY tool kind — reads and custom included
    action: { kind: 'read'; select: string }
          | { kind: 'create'; entity: string; store: readonly string[] }
          | { kind: 'transition'; entity: string; field: string; to: JsonValue }
          | { kind: 'custom'; executor: string }
    sensitiveFields: readonly { path: string; mode: 'omit' | 'mask' }[]
  }[]
}

// Gate = { kind: 'exists' }
//      | { kind: 'stateIs';      field: string; value: JsonValue }
//      | { kind: 'fieldAtLeast'; field: string; min: number }
```

### Interfaces

**`ToolContract`** (interface) — what a tool declares about itself: the facts the engine
consumes instead of inferring.

```ts
{
  readonly name: string
  readonly description: string
  readonly inputSchema: JsonSchema
  readonly effect: ToolEffect
  readonly simulation: { kind: 'none' }
                     | { kind: 'parameter'; name: string; enable: JsonValue }
                                        // the tool's OWN parameter, any name; the engine
                                        // never injects or renames one
  readonly targetArg: string | null     // the argument that identifies the subject
                                        // record; declared, never derived from an
                                        // '<entity>Id' spelling
  readonly licenceExemptParams: readonly string[]
                                        // declared volatile args (idempotency keys,
                                        // request ids) excluded from licence equality;
                                        // anything undeclared still voids the licence
  readonly sensitiveFields: readonly { path: string; mode: 'omit' | 'mask' }[]
}
```

**`ToolPort`** (interface) — the execution boundary. An adapter that cannot attest must
say so in the type; it cannot stay silent.

```ts
contracts(): readonly ToolContract[]
execute(call: ToolCall): Promise<ExecutionReport>
```

**`WorldPort`** (interface) — the state boundary for guards and the prompt state block.
`beginTurn` is awaited by the engine, so a stale-state race is unrepresentable.

```ts
beginTurn(): Promise<void>
snapshot(): WorldSnapshot        // entity → id → field → JsonValue, fully typed
```

**`ModelPort`** (interface) — one generation step. The adapter never loops.

```ts
step(input: ModelStepInput): Promise<ModelStepResult>

// ModelStepInput  = { system: string; messages: readonly ChatMessage[];
//                     tools: readonly ToolContract[]; forceTool: string | null }
//                   forceTool's ONLY use is the forced terminal step
// ModelStepResult = { toolCalls: readonly ToolCall[]; text: string }
// ChatMessage     = { role: 'user' | 'assistant' | 'tool'; content: string;
//                     toolCallId: string | null }
```

**`JudgePort`** (interface) — the one model-judged escape. Verdicts arrive as typed
values produced by a schema-validated payload; never parsed from a prose first line.
The interface carries no endpoint: the only lawful implementations wrap the session's
own `ModelPort` or the agent in session.

```ts
judge(question: { rule: string; evidence: readonly string[] }):
    Promise<{ verdict: 'violation' | 'none' | 'unreadable'; detail: string }>
```

**`DeliveryPort`** (interface) — where a sealed turn goes: the host receives the whole
`TurnRecord`, so no wire facade has to mirror or drop fields.

```ts
deliver(turn: TurnRecord): Promise<void>
```

**`Guard`** (interface) — a deterministic rule. Pure and synchronous over the frozen
view: no async, no I/O, no regex over user or model text. Prompt semantics are declared
metadata, never re-derived from rendered prose.

```ts
{
  readonly id: string
  readonly stage: GuardStage
  readonly priority: GuardPriority
  readonly targets: readonly string[]   // exact tool names; empty = global
                                        // (Set membership, never substring)
  readonly prose: { text: string; polarity: 'require' | 'forbid' | 'inform';
                    subject: string | null }
                                        // what the prompt renders, with its polarity and
                                        // subject as data — lints read declarations
  check(view: TurnView): GuardVerdict
}
```

### The one value class

**`ToolCall`** (class) — a tool invocation with the one canonical identity.

```ts
class ToolCall {
  readonly tool: string
  readonly args: Readonly<Record<string, JsonValue>>
  readonly callId: string     // adapter-assigned wire id, message threading ONLY,
                              // never identity

  constructor(tool: string, args: Record<string, JsonValue>, callId: string)
  canonical(): string         // deterministic sorted-key deep JSON of { tool, args }
  canonicalExcept(params: readonly string[]): string
                              // canonical form with the named (licence-exempt) args
                              // removed — the form licence equality compares
  equals(other: ToolCall): boolean
  fingerprint(): string       // 8 hex chars of sha256(canonical())
  withArg(name: string, value: JsonValue): ToolCall    // returns a NEW call
  withoutArg(name: string): ToolCall                   // returns a NEW call
}
```

---

## Class catalog — @looprun/engine

### `Engine` (class)

The one governed turn machine. It **sequences**; every decision lives in a named
collaborator. `CallPipeline` owns everything between a proposed call and a ledger row;
`ReplyPipeline` owns everything between a terminal payload and a finalized declaration.

```ts
class Engine {
  readonly definition: AgentDefinition
  readonly tools: ToolPort
  readonly world: WorldPort
  readonly model: ModelPort
  readonly judge: JudgePort | null
  readonly delivery: DeliveryPort | null
  readonly maxSteps: number
  readonly maxRedrives: number
  readonly approvalTtlTurns: number      // an approval not consumed within this many
                                         // turns is closed 'expired', and the closure
                                         // is delivered
  readonly excludedTools: readonly string[]
                                         // host tools denied by the surface intersection
                                         // — reported structurally at construction,
                                         // never only on stderr
  private readonly ledger: ActionLedger
  private readonly consent: ConsentProtocol
  private readonly calls: CallPipeline
  private readonly reply: ReplyPipeline
  private readonly terminal: TerminalProtocol
  private readonly disclosure: DisclosureRenderer
  private readonly filter: SensitiveFilter
  private readonly prompt: PromptRenderer
  private readonly guards: readonly Guard[]   // definition guards + auto-installed
                                              // consent, throttle, honesty, duplicate-
                                              // call guards, priority-sorted once
  private messages: ChatMessage[]
  private turnIndex: number
  private turnQueue: Promise<unknown>         // internal mutex; EVERY runTurn serializes
                                              // through it — no bypassable session lock

  constructor(cfg: { definition: AgentDefinition; tools: ToolPort; world: WorldPort;
      model: ModelPort; judge?: JudgePort; delivery?: DeliveryPort; maxSteps?: number;
      maxRedrives?: number; approvalTtlTurns?: number })
  runTurn(userText: string): Promise<TurnRecord>
  endConversation(): void
  private view(candidate: ToolCall | null, origin: ActRecord['origin'] | null,
      report: ExecutionReport | null, declaration: Declaration | null): TurnView
  private runStage(stage: GuardStage, view: TurnView): GuardVerdict
                                              // priority-ascending; first non-allow wins
  private composeDelivery(declaration: Declaration | null, exhausted: boolean): Delivery
}
```

### `CallPipeline` (class)

Everything between a proposed call and a ledger row — one input, one output, no phase
knowledge. The licensed call and the model's call run through the **same** method.

```ts
class CallPipeline {
  private readonly tools: ToolPort
  private readonly world: WorldPort
  private readonly consent: ConsentProtocol
  private readonly disclosure: DisclosureRenderer
  private readonly filter: SensitiveFilter
  private readonly ledger: ActionLedger
  private readonly contractsByName: ReadonlyMap<string, ToolContract>

  constructor(deps: { tools: ToolPort; world: WorldPort; consent: ConsentProtocol;
      disclosure: DisclosureRenderer; filter: SensitiveFilter; ledger: ActionLedger })
  run(call: ToolCall, origin: 'model' | 'engine' | 'licence',
      runStage: (stage: GuardStage, view: TurnView) => GuardVerdict): Promise<ActRecord>
      // BeforeCall stage → verdict routing (deny / simulate_instead / require_approval /
      // allow) → execute → verifyAttestation → filter → record → AfterCall stage
  private assignOutcome(verdicts: readonly GuardVerdict[],
      attestation: Attestation | null, effect: ToolEffect): ActOutcome
  private verifyAttestation(contract: ToolContract, before: WorldSnapshot,
      after: WorldSnapshot, attestation: Attestation):
      { attestation: Attestation; corrections: readonly Correction[] }
      // Write/Destructive contracts: a state diff under a non-effected attestation
      // upgrades the outcome to Effected and mints an executor_contradiction
      // Correction; a lying simulation additionally revokes the tool's simulation
      // path for the session (simulation_revoked)
  private issueApproval(call: ToolCall, contract: ToolContract): Promise<ActRecord>
      // engine performs the owed reads per the declared recipes (origin 'engine',
      // bound to the approvalId), fills the disclosure slots, stores the approval,
      // records the AwaitingApproval act
}
```

### `ReplyPipeline` (class)

Everything between a terminal payload and a finalized declaration.

```ts
class ReplyPipeline {
  private readonly terminal: TerminalProtocol
  private readonly judge: JudgePort | null
  private readonly judgedRules: readonly { id: string; rule: string;
      failMode: 'open' | 'closed' }[]
  private readonly maxRedrives: number

  constructor(deps: { terminal: TerminalProtocol; judge: JudgePort | null;
      judgedRules: ReplyPipeline['judgedRules']; maxRedrives: number })
  finalize(declaration: Declaration,
      runStage: (stage: GuardStage, view: TurnView) => GuardVerdict,
      redrive: (violations: readonly string[]) => Promise<Declaration | null>):
      Promise<{ declaration: Declaration | null; corrections: readonly Correction[];
                exhausted: boolean }>
      // OnReply guards + judged rules; redrives ≤ maxRedrives carrying ALL open
      // violations forward each iteration — a violation from any stage stays in the
      // set until fixed or exhaustion; nothing is silently dropped after one pass
}
```

### `ActionLedger` (class)

The per-conversation observation store: mints act ids, records acts with engine-assigned
outcomes, answers identity queries through canonical forms, seals turns.

```ts
class ActionLedger {
  private acts: ActRecord[]
  private turns: TurnRecord[]
  private nextActId: number
  private currentTurn: number

  beginTurn(turn: number): void
  record(row: Omit<ActRecord, 'actId'>): ActRecord          // mints the actId
  actsThisTurn(): readonly ActRecord[]
  effectedActsThisTurn(): readonly ActRecord[]              // Effected, plus Unverified
                                                            // on a Destructive contract
                                                            // (fail-closed)
  findByActId(actId: string): ActRecord | null
  duplicateOf(call: ToolCall): ActRecord | null             // canonical identity, this turn
  readsThisTurn(): readonly ActRecord[]
  history(): readonly TurnRecord[]
  sealTurn(record: TurnRecord): void                        // freezes and appends
}
```

### `ConsentProtocol` (class)

The whole consent mechanism in one home. Consuming a token **arms** the licence — it
never executes. The armed call is fed by the engine through the normal `CallPipeline`,
where the consent gate is pre-satisfied and **every other guard still runs**. An OPEN
approval is never a licence: a model re-emission of a call matching an open approval is
denied with "that question is already pending".

```ts
class ConsentProtocol {
  private approvals: Map<string, ApprovalRequest>
  private revokedSimulations: Set<string>       // tools whose executor attested a
                                                // mutation on a simulation path; they
                                                // fall back to plain require_approval
  private readonly contractsByName: ReadonlyMap<string, ToolContract>
  private readonly engineText: EngineText

  constructor(contracts: readonly ToolContract[], engineText: EngineText)
  guard(): Guard
      // priority Consent, stage BeforeCall:
      //   candidate is the engine-fed armed call (view.armedApproval set) → allow
      //   Destructive candidate matching an OPEN approval → deny 'already pending'
      //   Destructive candidate, no approval, simulation declared and not revoked
      //     → simulate_instead
      //   Destructive candidate otherwise → require_approval
  throttleGuard(): Guard
      // priority Consent, stage BeforeCall: denies a second destructive effect in one
      // turn, counting ATTESTED effects plus Unverified destructive acts — never
      // simulation flags
  issue(call: ToolCall, disclosure: readonly string[],
      boundReads: readonly { alias: string; actId: string }[],
      bornFromActId: string | null, turn: number): ApprovalRequest
      // storedCall := the pre-rewrite candidate with its declared simulation parameter
      // stripped; construction asserts storedCall and the simulated call differ ONLY
      // in that parameter. token := 'CONFIRM ' + tool.toUpperCase() + '-' +
      // 8 hex of sha256(canonical + ':' + nonce) — fresh nonce per issuance
  updateDisclosure(approvalId: string, sentences: readonly string[]): void
  consumeFrom(userText: string): readonly ApprovalRequest[]
      // exact standalone token-literal match (an engine-minted literal is searched for;
      // the user's words are never interpreted); matches flip status open → armed
  armedApprovals(): readonly ApprovalRequest[]
  markConsumed(approvalId: string): void        // after the licensed act is recorded
  pending(): readonly ApprovalRequest[]         // status 'open'
  close(approvalId: string,
      reason: 'declined' | 'superseded' | 'expired' | 'vetoed'): void
      // superseded: a new approval for the same canonical call replaces the old one;
      // expired: issuedAtTurn + approvalTtlTurns passed; every closure is delivered
  expireStale(currentTurn: number, ttl: number): readonly ApprovalRequest[]
}
```

### `HonestyCheck` (class, implements `Guard`)

The honest-report rule: exact bipartite matching in **both directions**, order-free,
convention-free. The deny names the tool.

```ts
class HonestyCheck implements Guard {
  readonly id: 'honesty'
  readonly stage: GuardStage.OnReply
  readonly priority: GuardPriority.Honesty
  readonly targets: readonly string[]           // always empty (global)
  readonly prose: Guard['prose']

  check(view: TurnView): GuardVerdict
      // HIDING direction (acknowledges): every act whose outcome mustAcknowledge()
      //   must be acknowledged by actId exactly once; a leftover act denies, naming
      //   act.call.tool and the outcome. An unknown or double-spent actId denies.
      // LYING direction (claims): every claimed Effected/Refused/NotFound/NoEffect
      //   must map one-to-one onto a distinct ledger act with that engine-assigned
      //   outcome (exact bipartite, any order) — 'Done, I transferred it' over an
      //   empty ledger is a deterministic deny, not a judge question.
  static mustAcknowledge(outcome: ActOutcome): boolean
      // true: Effected, Refused, Failed, Vetoed, NotFound, Unverified
      // false: Observed, Simulated, AwaitingApproval — the engine renders those
      //   deterministically (operation record / approval question)
}
```

### `TerminalProtocol` (class)

The single terminal channel.

```ts
class TerminalProtocol {
  readonly engineText: EngineText
  readonly outcomeWords: Readonly<Partial<Record<ActOutcome, string>>>

  constructor(engineText: EngineText,
      outcomeWords: Readonly<Partial<Record<ActOutcome, string>>>)
  respondContract(): ToolContract
      // ONE terminal tool: { message, acknowledges, claims }; its description text is
      // rendered from the same schema object the validator checks — a taught key the
      // validator rejects cannot exist
  acceptStep(calls: readonly ToolCall[]):
      { domainCalls: readonly ToolCall[]; terminal: ToolCall | null; deferred: boolean }
      // a respond sharing a step with domain calls is deferred (Correction
      // premature_terminal) — decided on typed ToolCalls the engine itself parsed,
      // never duck-read from framework step shapes
  parseDeclaration(args: Readonly<Record<string, JsonValue>>):
      { ok: true; declaration: Declaration } | { ok: false; error: string }
  renderOperationRecord(acts: readonly ActRecord[]):
      readonly { actId: string; sentence: string }[]
      // EVERY act, reads included, using outcomeWords or the engine default naming
      // tool, target, outcome
  exhaustionClosure(acts: readonly ActRecord[]): string
      // Effected present → exhaustedPartial naming what landed
      // only Unverified   → exhaustedUnverified ('I could not verify what happened')
      // neither           → exhaustedNothing
      // a landed write is NEVER reported as 'nothing was changed'
}
```

### `DisclosureRenderer` (class)

Domain-authored sentences in three tenses. Before-tense slots are filled from
engine-performed reads bound to the question by **alias**, never last-read-wins; a
transfer question reading `getAccount` twice binds `{source.balance}` and
`{destination.balance}` to the right records by construction.

```ts
class DisclosureRenderer {
  readonly templates: readonly DisclosureTemplate[]
  readonly contractsByName: ReadonlyMap<string, ToolContract>
  readonly missingValueMarker: string

  constructor(templates: readonly DisclosureTemplate[],
      contracts: readonly ToolContract[], missingValueMarker: string)
      // throws on: a template whose slot names no recipe alias; a recipe naming an
      // undeclared tool; a recipe whose argsFromApproval names an argument the target
      // tool's schema does not declare — derivability is validated at construction,
      // not discovered at runtime
  owedReads(template: DisclosureTemplate, storedCall: ToolCall):
      readonly { alias: string; call: ToolCall }[]
      // concrete calls built from the recipes' argsFromApproval mapping over the
      // stored call's own args — the ENGINE executes these; no model step is involved
  before(template: DisclosureTemplate,
      reads: readonly { alias: string; act: ActRecord }[]): string
      // fills {alias.path} from each aliased read's filteredResult; an unresolvable
      // path renders missingValueMarker — and a marker in a rendered sentence is a
      // validation failure upstream, not a shipped question
  after(act: ActRecord): string | null
  later(act: ActRecord, currentTurn: number): string | null
}
```

### `SensitiveFilter` (class)

Sensitive-data removal at every seam, driven by declared field paths only. The filtered
form is the only stored form — for results, args, **and attestations**.

```ts
class SensitiveFilter {
  readonly contractsByName: ReadonlyMap<string, ToolContract>
  readonly proseScrubEnabled: boolean

  constructor(contracts: readonly ToolContract[], proseScrubEnabled: boolean)
  filterResult(contract: ToolContract, result: JsonValue): JsonValue
  filterArgs(contract: ToolContract, call: ToolCall): ToolCall
  filterAttestation(contract: ToolContract, attestation: Attestation): Attestation
      // declared paths applied to RecordChange.from/to and preview values — the
      // attestation stored on the ActRecord and shipped in the TurnRecord is filtered
  scrubProse(text: string): string
      // engine-owned literal pattern set over MODEL PROSE ONLY; never runs on tool
      // results, args, or user text — an order reference '12-34-5678' inside a result
      // can never be destroyed by a phone-shape pattern
}
```

### `PromptRenderer` (class)

The single producer of prompt bytes; byte-stable output. Guard prose is routed into its
target tools' descriptions via `Guard.targets` (exact names). Provenance, polarity and
subject come from `Guard.prose` metadata — nothing re-derives semantics from rendered
text.

```ts
class PromptRenderer {
  readonly definition: AgentDefinition

  constructor(definition: AgentDefinition)
  renderSystem(contracts: readonly ToolContract[]): string
  renderToolDescription(contract: ToolContract, guards: readonly Guard[]): string
      // appends exact-target guard prose under a fixed heading, deduplicated by byte
      // identity
  renderUserTail(userText: string, state: WorldSnapshot): string
}
```

### `AgentDefinition` (class)

The authoring surface: everything a domain declares about one agent, validated at
construction against the declared tool surface.

```ts
class AgentDefinition {
  readonly id: string
  readonly persona: string
  readonly behaviorRules: readonly string[]
  readonly declaredTools: readonly string[]     // surface allow-list; engine intersects
                                                // with ToolPort.contracts()
                                                // deny-by-default
  readonly guards: readonly Guard[]             // domain guard instances; consent,
                                                // throttle, honesty and duplicate-call
                                                // guards are auto-installed by Engine,
                                                // never listed here
  readonly judgedRules: readonly { id: string; rule: string;
      failMode: 'open' | 'closed' }[]
  readonly disclosures: readonly DisclosureTemplate[]
  readonly outcomeWords: Readonly<Partial<Record<ActOutcome, string>>>
  readonly engineText: EngineText               // overridable engine sentences (host-
                                                // localizable; source stays English)
  readonly scrubProse: boolean

  constructor(init: { id: string; persona: string; behaviorRules?: readonly string[];
      declaredTools: readonly string[]; guards?: readonly Guard[];
      judgedRules?: AgentDefinition['judgedRules'];
      disclosures?: readonly DisclosureTemplate[];
      outcomeWords?: AgentDefinition['outcomeWords'];
      engineText?: Partial<EngineText>; scrubProse?: boolean })
  validate(contracts: readonly ToolContract[]): readonly string[]
      // warnings: guard targets off surface; disclosure recipes naming undeclared
      // tools or underivable arguments; declared tools absent from the port; a
      // destructive contract with no before-tense disclosure template
}

// EngineText = { approvalInstruction: string; exhaustedPartial: string;
//                exhaustedNothing: string; exhaustedUnverified: string;
//                missingValueMarker: string }
```

### Guard factories (functions)

Plain functions returning `Guard` instances configured by data — kinds are id strings,
not types. The authored vocabulary:

```
requiresBefore(tool, prerequisite)        argRequired(tool, arg)
maxCallsPerTurn(tool, n)                  precondition(tool, gate, prose)
valueFromUser(tool, arg)                  resultInvariant(tool, invariant, prose)
replyArtifactLint()                       custom(id, stage, priority, targets, prose, check)
```

Auto-installed by `Engine` (never authored): the consent guard, the destructive
throttle, `HonestyCheck`, and the duplicate-call guard
(`duplicateOf` on canonical identity).

---

## Class catalog — @looprun/worlds

### `DeclarativeWorld` (class, implements `ToolPort` + `WorldPort`)

The fixture world: interprets a `WorldSpec` where **every path attests**. Custom
executors return **patches as data** — they never touch live state.

```ts
class DeclarativeWorld implements ToolPort, WorldPort {
  readonly spec: WorldSpec
  private store: WorldSnapshot            // entity → id → field → JsonValue
  private audit: { call: ToolCall; attestation: Attestation }[]
  private readonly executors: Readonly<Record<string, CustomExecutor>>

  constructor(spec: WorldSpec, preset?: string,
      deps?: { executors?: Readonly<Record<string, CustomExecutor>> })
      // throws on: unknown preset; a preset patch naming a missing record; a custom
      // action with no supplied executor — never a silent no-op
  contracts(): readonly ToolContract[]    // derived one-to-one from spec.tools
  execute(call: ToolCall): Promise<ExecutionReport>
      // receive/coerce declared args (a non-coercible value is rejected — never
      // String() an object into '[object Object]'); evaluate gates against the
      // targetArg record on EVERY tool kind; the simulation branch evaluates the SAME
      // gates and reads the same store without mutation (simulate ≡ act by shared code
      // path); a transition on a missing record attests not_found, never ok
  beginTurn(): Promise<void>
  snapshot(): WorldSnapshot
  auditTrail(): readonly { call: ToolCall; attestation: Attestation }[]
      // EVERY execute, terminals included
}

// CustomExecutor = (ctx: {
//   args: Readonly<Record<string, JsonValue>>      // the COERCED view
//   records: WorldSnapshot                          // a frozen deep copy
//   mintId: (entity: string) => string
// }) => { result: JsonValue; patches: readonly RecordChange[] }
// The world applies the patches itself — gated, audited, attested by the shared code
// path — so a custom tool's attestation is true by construction.
```

---

## Adapters

**`MastraModelPort`** (class, implements `ModelPort`) — one `@mastra/core` generation
step. No turn logic, no hooks parameter, no `toolChoice` knob, no tool registration:
the class has nothing a caller could spread options into.

**`NativeToolPort`** (class, implements `ToolPort`) — host/MCP tools behind the port.
Its attestation law is **protocol facts only**: a thrown error or MCP `isError` attests
`failed`; everything else attests `unattested`. A host tool can never produce
`refused`/`not_found`/`effected` from this adapter — a host that can attest wraps its
executor with an attesting adapter explicitly. The surface intersection is
deny-by-default, and the excluded list is a structural field on the `Engine`
(`excludedTools`), not a stderr line.

---

## The responsibility inversions

The pattern throughout: move the decision to the party that owns the facts.

### 1 · Simulation belongs to the tool; gating belongs to the engine

```
BEFORE  the engine keys on a schema property literally named `simulate`
        (spec.ts:550), skips guards when args.simulate === true (turn.ts:157),
        and nothing checks the executor honors the flag

AFTER   ToolContract.simulation: { kind: 'parameter'; name: string; enable: JsonValue }
        — the tool that supports simulation HAS its own parameter, any name;
        the engine gates internally (simulate_instead) and rewrites via
        call.withArg(contract.simulation.name, enable);
        trust rests ONLY on the returned Attestation

GAIN    no artificial tool mutation, no magic parameter name; a lying executor is
        detected (snapshot diff), reported (Correction), and loses its simulation
        privilege (revokedSimulations) instead of being silently trusted
```

### 2 · Outcomes belong to the engine; the model only references them

```
BEFORE  the model declares outcome words (did), the engine verifies with heuristics:
        greedy act-spending (honesty.ts:343), a read-only turn can declare
        blocked/refused ungrounded, 'asking' is encoded three ways

AFTER   the ENGINE assigns every ActOutcome and mints actIds; the model's
        Declaration acknowledges acts by id and claims outcomes the ledger must
        ground one-to-one; asking is not an outcome — a pending ApprovalRequest is
        an engine fact rendered deterministically

GAIN    honesty verification becomes exact and order-free; a fabricated 'refused'
        is unrepresentable — there is no act id for it
```

### 3 · Effect truth belongs to the executor

```
BEFORE  the engine infers tookEffect from result shapes: ok && !requiresConfirmation
        (hooks.ts:104-109), success/error field probes (action-history.ts:180);
        a world spelling its status differently is misread as plain success

AFTER   ToolPort.execute returns ExecutionReport { result, attestation }; the engine
        only maps attestations to outcomes; 'unattested' is an explicit member with
        defined fail-closed pricing

GAIN    shape-probing code ceases to exist; the honest-but-unattested case has
        defined, non-lying behavior instead of an undefined flag
```

### 4 · The loop belongs to the engine; adapters get single steps

```
BEFORE  backends drive the turn machine through internal.ts; the machine exists
        twice (agent.ts governedTurn + run-conversation.ts) and has diverged;
        agent.generate(msg, { hooks: {} }) strips enforcement for a turn

AFTER   Engine owns the only loop; adapters implement ModelPort.step and
        ToolPort.execute — there is no hooks parameter, no toolChoice knob, no
        second copy to diverge

GAIN    one machine, and an adapter API on which weakening governance is not
        writable
```

### 5 · The licence is the stored call; the engine executes it

```
BEFORE  the model must re-emit the approved call; the engine strips 'unlicensed'
        arguments by token-fragment string matching (approval-request.ts:110-114) —
        deleting legitimate values while an appended cascade:true rides the old
        approval untouched

AFTER   ApprovalRequest.storedCall holds the exact approved call; the typed token
        ARMS the licence; the ENGINE feeds the stored call through the normal
        CallPipeline (consent pre-satisfied, every other guard live); a model retry
        matches only by whole-canonical equality (minus declared
        licenceExemptParams) — different in any way means no licence

GAIN    'the call and nothing else' becomes a construction property; both stripping
        bugs become unwritable; and the priority law survives consent — an
        agent-priority guard can still veto a consented act
```

### 6 · The target record is declared, not spelled

```
BEFORE  gates read args[`${entity}Id`] and silently resolve a missed lookup to 0
        (gates.ts:16-19); disclosure binds only string-typed exact matches, so a
        numeric 270 never binds to '270'

AFTER   ToolContract.targetArg names the subject argument explicitly; gates and
        disclosure resolve the target through the declaration, comparing scalars in
        canonical form

GAIN    binding follows the author's declaration, not a spelling accident; a missed
        target is a loud not_found attestation, never a silent min-0 pass
```

### 7 · Owed reads belong to the engine

```
BEFORE  the engine forces the model to make the reads a consent question owes
        (toolChoice required pins only the tool NAME) — a small model reads the
        WRONG record and the question renders the missing-value marker

AFTER   DisclosureTemplate.readsFrom declares recipes (argsFromApproval mapping over
        the stored call's own args, one alias per read); the ENGINE builds and
        executes each owed read directly through ToolPort (origin 'engine', bound to
        the approvalId); derivability is validated at AgentDefinition construction

GAIN    the reads a question owes cannot target the wrong record, and the
        multi-record question ({source.balance} vs {destination.balance}) binds by
        alias, by construction
```

---

## Defect map — why each AS-IS defect class is unrepresentable

| defect class | the rule that kills it | the concrete before → after |
|---|---|---|
| regex-validation | `Guard.check: (view: TurnView) => GuardVerdict` is pure over typed data — a text-regex verdict has nothing to run on; judge verdicts are schema-validated typed payloads | before: `readJudgeVerdict` does `line.startsWith('NONE')`, so "NONETHELESS, this is a lie" reads as clean; after: free text validates against no schema → `{verdict:'unreadable'}`, priced by the rule's declared `failMode`. The one literal search left — `consumeFrom` looking for `CONFIRM TRANSFERASSET-3F09A4C1` — searches for an **engine-minted** literal and never interprets the user's words |
| id-naming-convention | semantics are declared: `effect` replaces write-name prefixes, `targetArg` replaces `<entity>Id` spelling, `Attestation` replaces `ok`/`found`/`exists` probing | before: `{exists:false}` (a duplicate-check answer meaning "safe to proceed") grounds `not_found`; after: emptiness is only the world's own `{kind:'not_found', entity, id}` — a result body is data the engine never reads for a verdict |
| order-dependence | one identity form (`canonical()`), engine-minted actIds, bipartite matching, alias-bound disclosure, engine-sequenced serial calls | before: `claimIsGrounded` spends acts greedily so an honest report is denied by declaration order; disclosure takes `named[named.length-1]`; after: acknowledges/claims map one-to-one in any order; a slot binds by alias to its own engine-performed read |
| no-deterministic-return | the `Delivery` envelope: operation record for EVERY act, approval questions in every delivery, typed denials, closure; the whole `TurnRecord` on the wire | before: a downgrade simulation's `requiresConfirmation` reaches the user only if the prose mentions it; after: `Delivery.approvalQuestions` renders the question + token + disclosure whether or not the prose does |
| perfect-world | only attestations are trusted; `unattested` is fail-closed both ways; snapshot-diff catches the safe-direction lie; simulation privilege is revocable | before: a landed native write (tookEffect undefined) delivers "nothing was changed"; after: `Unverified` → "I ran transferAsset but could not verify its effect"; a "simulation" that mutates is recorded `Effected` + `executor_contradiction` + `simulation_revoked` |
| confusing-names | every name states its purpose (`ActionLedger`, `ApprovalRequest`, `CallPipeline`, `armedApproval`); `did` is gone — the terminal payload has `acknowledges` and `claims`; `prose`/`polarity`/`subject` are declared metadata | before: one structure travels as did/Intention/claims/declaration; after: one name per concept, and the prompt lints read `Guard.prose.polarity` instead of regexing rendered text |
| dubious-status-names | one `ActOutcome` enum with ten disjoint members; `Correction` is one discriminated union; approval lifecycle is one status field | before: `tool_called_request_approval` + `any_other_question` + `ask` encode one act three ways; corrections mix three tag grammars; after: asking is an engine fact, and every correction has a `kind` |
| entangled-dependencies | `contract` is a zero-dependency leaf; engine classes import contract only; no class knows `Engine`; `CallPipeline`/`ReplyPipeline` cap the orchestrator | before: guards/ ↔ runtime/ import cycle, turn.ts imports 13 modules; after: the dependency graph has no cycle by layout, and the engine-may-import-only-collaborators rule is lintable |
| custom-guard-abuse | the authored surface is data-configured factories plus `custom()` with the same typed `check`; engine messages are `Correction`s, not synthetic always-pass guards | before: three synthetic guards exist to smuggle strings into the violation pipeline; after: engine facts travel as typed corrections, and a custom guard is just a `Guard` |
| hand-mirrored-types | every crossing shape lives in `@looprun/contract` | before: server hand-copies `LoopRunResultMeta` under a "keep identical" comment; after: `import { TurnRecord } from '@looprun/contract'` — no second declaration to drift |

---

## Atlas preservation map

Every load-bearing mechanism of the 85/100 baseline, its new home, and how the behavior
is carried:

| # | mechanism | new home | how |
|---|---|---|---|
| 1 | Consent licence = the exact call; typed literal; question in every delivery | `ConsentProtocol` + `ApprovalRequest` | `issue()` stores the exact call; token = tool + 8 hex of sha256(canonical + nonce) — fresh per issuance, collision-free by re-salt; `consumeFrom` arms; the engine runs the stored call through `CallPipeline`; `Delivery.approvalQuestions` renders every open approval every delivery |
| 2 | Disclosure: slots, target-bound reads, three tenses, forced reads | `DisclosureRenderer` + recipes; execution in `CallPipeline.issueApproval` | recipes build concrete reads from the stored call's own args; the ENGINE executes them (origin `engine`, bound to `approvalId`); slots bind by alias — multi-record questions bind both records; `after`/`later` render into `Delivery.disclosures` |
| 3 | Honest report: each declaration spends one act, any order; deny names the tool; vetoed act proves "I asked" | `HonestyCheck` over `ActionLedger` | exact bipartite in both directions (acknowledges by actId; claims by engine-assigned outcome); an `AwaitingApproval` act plus the engine-rendered question means "I asked" needs no model proof at all |
| 4 | Downgrade-to-simulation; approval born from it | consent guard verdict `simulate_instead` + `bornFromActId` | the same call runs with the tool's OWN declared parameter; the attested preview feeds `before()`; `issue()` records the birth act; simulation `none` → plain `require_approval` |
| 5 | Sensitive filtering at every seam | `SensitiveFilter` | `filterResult` + `filterArgs` + `filterAttestation` run before `ledger.record` — the filtered form is the only stored form, so history, honesty, disclosure, delivery and the wire all read filtered data by construction; `scrubProse` touches model prose only |
| 6 | Guard priority order; deterministic guards; agent-in-session judge | `GuardPriority` + `Engine.runStage`; `JudgePort` | the order is the enum; purity is structural; `JudgePort` carries no endpoint — a third-party judge call has no seam to enter through; **the order now also binds the consented call** (consent arms, pipeline runs) |
| 7 | Single terminal protocol; honest exhaustion closure | `TerminalProtocol` + `ReplyPipeline` | one respond contract whose description and validator share one schema source; deferred/superseded handling on typed calls; redrives carry ALL open violations; the closure's three branches derive from attestations |
| 8 | Worst-world laws | `DeclarativeWorld` + `SensitiveFilter` + `TerminalProtocol` | contracts derive one-to-one from the spec; gates run on every tool kind; simulate ≡ act by shared code path; presets never silently no-op; custom executors return patches the world applies gated and attested; the user receives rendered truth only |

### What the baseline's fifteen failures predict

The locked baseline (`docs/analysis/2026-08-12-atlas-baseline-v020-the-fifteen.md`)
places 12 of 15 failures in the contract layer, 2 in the engine, 1 in world/rubric:

| cases | AS-IS failure shape | TO-BE expectation |
|---|---|---|
| 82, 92 | the turn dies in the engine stub | engine defects — the redesigned terminal/redrive path must not reproduce them; these two are expected to flip |
| 47, 50, 51 | confirmation offered for an impossible act | the consent guard runs AFTER agent/changeAllowed guards even on the licensed call — an impossible act is vetoed before a question can be born |
| 48, 49, 62, 87, 100 | refusal doesn't name person/path/rule | `Delivery.denials` carries every guard's public reason deterministically; the remainder stays contract-layer prose work |
| 43 | figure from the wrong record | alias-bound disclosure recipes make wrong-record binding unrepresentable |
| 63, 80 | required read never made | contract-layer (rubric requires reads the prompt must demand) — unchanged by the engine |
| 72 | world rightly refuses mis-ordered maintenance calls | **must not change** — the world and invariant are correct; movement here after the refactoring means something broke |

### Re-measurement caveats — honest, not optional

The 85/100 figure does not carry over automatically. Before re-claiming it:

1. **New terminal payload surface.** `acknowledges` + `claims` by actId is new protocol
   for the small local subjects (Qwen tiers); redrive rates must be measured.
2. **The approval turn's shape changes.** The licensed act runs engine-side before the
   model speaks; the model narrates a completed act from the prompt state. Cases
   authored around the model re-emitting the call see a different transcript.
3. **Engine sentences change.** Cases grading exact approval-question or closure
   wording see the new `EngineText` pack.
4. Any case that only passes through one of these differences is a candidate
   **ill-formed case** and must be argued case-by-case against the baseline table —
   the layer comparison table in the baseline doc is the instrument for this.

---

## Open risks

1. **Prose truth is still the judge's.** ActId acknowledgment + outcome claims verify
   the structured record; free prose misstating a figure is caught only by the judged
   lie question. The honesty guarantee's wording is "the structured record cannot lie
   or hide" — the prose guarantee stays priced fail-closed through `JudgePort`.
2. **Attestation-poor hosts degrade honestly but noisily.** Native/MCP tools without
   attestation run `Unverified` everywhere: throttles bite early, deliveries hedge.
   The pressure to fake attestations is real and the engine cannot detect a fabricated
   attestation on self-executing tools (the snapshot-diff check needs a `WorldPort`).
3. **Token quoting.** `consumeFrom` searches for the engine-minted literal; a user
   quoting a token while *asking about it* would arm the licence. The standalone-match
   rule narrows this; a decline phrase or a confirmation-only turn mode may still be
   needed. (The armed call still passes every non-consent guard — the blast radius is
   smaller than AS-IS, not zero.)
4. **Engine growth pressure.** `turn.ts` became a 1045-line hub from the same
   "orchestrate only" intent. The blueprint's answer is structural (`CallPipeline`,
   `ReplyPipeline`) plus a lint: `Engine` may import only its named collaborators.
5. **Byte-stable prompt / prefix-cache law.** `PromptRenderer` output must be
   re-verified against the llama.cpp prefix-cache measurements; lints that consumed the
   regex-derived polarity table now read `Guard.prose` metadata.
6. **RecordChange expressiveness.** entity/id/field/from/to covers the Atlas fixtures;
   richer domains (multi-record cascades, derived values) may need an extension that
   must not reopen shape inference.
7. **The exam package needs its own blueprint.** Its judge input must carry user text
   and guard events; its verdict fold must consume the typed `Correction` grammar; its
   own AS-IS defects (name-prefix write detection, `JSON.stringify` fingerprints,
   vacuous probes) are killed by the typed surfaces but the harness redesign is real
   follow-up work.

---

## Validation plan

```
1. implement @looprun/contract + @looprun/engine + @looprun/worlds against this blueprint
2. port the Atlas subject's declarations (contracts, guards, disclosures) — the
   agentspec skill's authoring surface changes with it (engine + skill in one session,
   per the spec law)
3. run the Atlas exam:  score ≥ 85/100  → the refactoring holds
                        a case flips     → classify with the baseline's layer table:
                          contract/engine case moved  → read the new prose/engine (expected)
                          world/rubric case moved     → SURPRISE — that layer had to survive
                          a passing case now fails    → regression, any layer
4. case 72 is the tripwire: if it changes, something moved that must not have
```
