# looprun — TO-BE Architecture Blueprint: The Two-Card Engine

> **Status: REJECTED — authoring complexity; v3 is the standing map.**

The TO-BE design for the looprun engine, governed by one rule that outranks every other
quality:

> **THE GOLDEN RULE.** Creating an agent is so easy a 6-year-old could do it, and the
> engine code underneath is so plain a 6-year-old could read it. The whole authoring
> surface is TWO names — one agent = one `AgentSpec`, everything conversation-global =
> one `DomainContract` — and every engine class is small, boring, and traceable top to
> bottom.

Scope: blueprint only — no implementation, no migration plan, no compatibility shims
(pre-1.0, no external consumers). Validation gate: the Atlas exam in `agentspec-bench`
scores **≥ 85/100** on the rebuilt engine, or the moved case is argued ill-formed.
The AS-IS record this design answers is
[`docs/superpowers/2026-08-12-blueprint-as-is.md`](../../analysis/2026-08-12-blueprint-as-is.md).

---

## The thesis

Two cards of plain data in; a governed agent out. Everything the engine does is
**derived from typed declared fields** — never from a name's spelling, a description's
prose, a result's shape, or anybody's text.

```
      THE AUTHOR WRITES (2 cards)                 THE ENGINE DERIVES (never inferred)
  ┌───────────────────────────────┐          ┌──────────────────────────────────────────┐
  │ AgentSpec                     │          │ effect:'destructive'  → consent protocol │
  │   name · persona · model      │          │ effect:'write'        → write throttle,  │
  │   tools: [{ name, does,       │  compile │                         honesty checking │
  │     effect, args, run,        │ ───────► │ secrets:['cardNumber']→ masking at every │
  │     preview?, done?, needs? }]│  (one    │                         seam             │
  │   rules? checks? limits?      │  builder,│ checks                → guards, in order │
  ├───────────────────────────────┤  loud    │ judged                → in-session judge │
  │ DomainContract (optional)     │  errors) │ every tool            → no-repeat guard, │
  │   voice · facts · secrets     │          │                         canonical call   │
  │   checks? judged? wording?    │          │                         identity         │
  └───────────────────────────────┘          └──────────────────────────────────────────┘
```

A tool is declared where it lives: name, one sentence, a declared effect, typed args,
and its `run` function. A destructive tool may add a pure `preview` sentence-maker; any
tool a past-tense `done` sentence-maker. The engine composes the delivered text itself,
so every fact it knows reaches the user deterministically — record lines, open approval
questions with their codes, denial reasons, and its own honest closure.

## Hello world — the exhibit the golden rule is judged on

The complete file an author writes. No engine class, no port, no wiring:

```typescript
import { createAgent } from 'looprun';

const bookings = [{ id: 'BK-1', room: 'Blue Room', day: 'Friday' }];

const agent = createAgent({
  name: 'concierge',
  persona: 'A friendly hotel concierge who manages room bookings.',
  model: 'google/gemini-3.1-flash-lite',
  tools: [
    { name: 'listBookings',
      does: 'List all current bookings.',
      effect: 'read',
      run: () => bookings },
    { name: 'cancelBooking',
      does: 'Cancel one booking by its id.',
      effect: 'destructive',
      args: { id: 'string' },
      run: ({ id }) => {
        const i = bookings.findIndex(b => b.id === id);
        return i < 0 ? { nothing: `No booking ${id} exists.` }
                     : { did: bookings.splice(i, 1)[0] };
      },
      preview: ({ id }) => `This would cancel booking ${id} permanently.` },
  ],
});

const reply = await agent.chat('session-1', 'Please cancel booking BK-1.');
console.log(reply.text);
// I can cancel that for you, but it needs your approval first.
// · cancelBooking — waiting for approval: This would cancel booking BK-1 permanently.
//   To approve, send exactly: CONFIRM CANCELBOOKING-7Q4M
```

Two teaching points are already visible: a **write tells the engine did-or-nothing**
(`{ did }` / `{ nothing: why }` — a typo'd id can never be delivered as a success), and
the approval question with its one-time code is printed by the **engine**, whether or
not the model's prose mentions it.

## The tutorial path — one concept per lesson

| # | lesson | the author adds | what it teaches |
|---|---|---|---|
| 1 | Hello agent | the 12-line card: name, persona, model, one read tool | an agent is one card; a tool is name + sentence + effect + run; `agent.chat(sessionId, text)` answers a turn |
| 2 | A destructive tool | one tool entry with `effect: 'destructive'` and a did-or-nothing return | declaring the effect IS the whole consent setup: the engine holds the call, prints the question and code, and only the typed code releases exactly that call — which still passes every other rule |
| 3 | `preview` | one line: `preview: ({ id }) => \`This would cancel ${id} permanently.\`` | a pure sentence about what THIS exact call would do, computed by the engine on the held call, shown in the approval question |
| 4 | `done` | one line: `done: ({ id }) => \`Booking ${id} is cancelled.\`` | the past-tense record line after the tool ran; without it the engine prints a plain default — a ran tool always reaches the user |
| 5 | `needs` — figures in the question | one line on the destructive tool: `needs: { booking: 'getBooking' }` | the engine performs that read ITSELF when it holds the call, and passes the masked result to `preview(args, reads)` — the question can show the record's figures, bound to the right record by construction |
| 6 | The second card | `const hotel = { name: 'hotel', voice: '...', facts: ['Cancellations are final.'] }` and `createAgent(spec, hotel)` | everything conversation-global lives on one shared domain card |
| 7 | `secrets` | one line: `secrets: ['cardNumber']` | a named field is masked everywhere — tool results, stored records, call args, delivered text — by field name and exact masked values, never by guessing what text looks like |
| 8 | `ctx.state` — per-session memory | `run: ({ id }, ctx) => { ctx.state.count = ... }` | every tool function receives `(args, ctx)`; `ctx.state` is the tool's memory for THIS conversation — two sessions never share it |
| 9 | `limits` | one line: `limits: { writes: 2, retries: 3 }` | four numbers with safe defaults; write only what you change |
| 10 | `checks` — your own rule | one entry: name + rule sentence + pure `deny` function | a deterministic rule: agent checks run first, domain checks next, engine rules last — and the deny sentence is what the user reads |
| 11 | `judged` — a rule only a model can check | one entry: `{ name, ask, onYes }` | a yes/no question answered by the session's OWN model through a structured answer; yes sends the correction and redrives |
| 12 | `wording` | overrides on the domain card | every engine sentence has a default and a named override — the facts stay engine-owned, only the words are yours |
| 13 | See your guards, run the exam | `agent.guards()` + one `ExamCase` | the printed guard list IS the code that runs; the exam plays scripted cases through the same `agent.chat` path |

---

## The authoring surface — complete

```typescript
/** THE WHOLE AUTHORING SURFACE — two cards of plain data. No engine class is ever
 *  constructed by an author. */

export interface AgentSpec {
  /** The agent's name. Used in errors, records, the exam. Required. */
  name: string;
  /** One or two sentences: who the agent is. The first prompt line. Required. */
  persona: string;
  /** A model id ('google/gemini-3.1-flash-lite') resolved by the reference adapter,
   *  or a ModelPort object used as-is (the exam's ScriptedModel enters here). Required. */
  model: string | ModelPort;
  /** Every tool, declared inline. Required (may be empty for a talk-only agent). */
  tools: ToolSpec[];
  /** Prose rules with no machine check (tone, judgement). Default []. */
  rules?: string[];
  /** This agent's own deterministic rules. Run before every other rule. Default []. */
  checks?: Array<CallCheck | ReplyCheck>;
  /** Per-turn ceilings. Default { toolCalls: 10, writes: 1, retries: 2, consentTurns: 3 }. */
  limits?: Limits;
}

/** Argument types — six words. `[]` means "a list of". */
export type ArgType = 'string' | 'number' | 'boolean' | 'string[]' | 'number[]' | 'boolean[]';
type ArgValue = { string: string; number: number; boolean: boolean;
                 'string[]': string[]; 'number[]': number[]; 'boolean[]': boolean[] };
/** The author's declared args flow into their function signatures — declared once, typed
 *  everywhere. One mapped type, no generics gymnastics. */
export type ArgsOf<A extends Record<string, ArgType>> = { [K in keyof A]: ArgValue[A[K]] };

/** What a write/destructive run must return — the tool states its own effect. */
export type WriteResult =
  | { did: unknown }        // the declared effect happened; the value feeds `done`
  | { nothing: string }     // ran, changed nothing — the sentence says why
  | { refused: string };    // the tool itself refused — the sentence says why

/** Every tool function's second parameter. Lesson 1 ignores it entirely. */
export interface ToolContext {
  sessionId: string;
  state: Record<string, unknown>;   // engine-owned per-session scratch — the tool's
}                                   // memory for this conversation, never shared

/** The engine-performed reads a preview or check asked for, masked, keyed by alias. */
export type Reads = Readonly<Record<string, unknown>>;

export interface ToolSpec<A extends Record<string, ArgType> = Record<string, ArgType>> {
  /** The tool's name, exactly as the model calls it. 'finish' is reserved. Required. */
  name: string;
  /** One sentence shown to the model. Required. */
  does: string;
  /** Declared, never inferred from the name: 'read' changes nothing; 'write' changes
   *  state; 'destructive' changes state irreversibly and installs consent. Required. */
  effect: 'read' | 'write' | 'destructive';
  /** Argument names and types. Default {} (a no-arg tool). */
  args?: A;
  /** Reads the ENGINE performs itself when it needs facts about this call (consent
   *  questions, checks): alias → a declared read tool. Arg names matching this tool's
   *  args pass through; the object form maps them (readArg → thisArg). Default {}. */
  needs?: Record<string, string | { tool: string; args: Record<string, string> }>;
  /** The executor. A read returns its value; a write/destructive returns a WriteResult
   *  or throws (a throw records outcome 'failed' — for writes worded 'effect unknown',
   *  never 'nothing changed'). Required. */
  run: (args: ArgsOf<A>, ctx: ToolContext) =>
      unknown | WriteResult | Promise<unknown | WriteResult>;
  /** Destructive only. A PURE sentence: what THIS exact call would do — the engine calls
   *  it instead of run for every unapproved call, passing the `needs` reads.
   *  Default: an engine sentence from `does` + the args. */
  preview?: (args: ArgsOf<A>, reads: Reads, ctx: ToolContext) => string;
  /** Past-tense record line after run. Default: an engine sentence naming tool + args. */
  done?: (args: ArgsOf<A>, result: unknown, ctx: ToolContext) => string;
}

export interface CallCheck {
  name: string;                    // unique among this card's checks
  on: 'call';
  tool?: string;                   // a declared tool name; omitted = every tool
  needs?: ToolSpec['needs'];       // reads the engine performs and passes to deny
  rule: string;                    // the one-sentence rule the model reads — the SINGLE
                                   // copy, used in the prompt, the denial, and guards()
  deny: (call: CallView, reads: Reads) => string | null;   // pure; null = allow
}

export interface ReplyCheck {
  name: string;
  on: 'reply';
  rule: string;
  deny: (reply: ReplyView) => string | null;               // pure; null = allow
}

export interface Limits {
  toolCalls?: number;     // model tool calls per turn; default 10
  writes?: number;        // write/destructive effects per turn; default 1
  retries?: number;       // reply corrections before the engine closes the turn; default 2
  consentTurns?: number;  // turns a consent question stays open; default 3
}

export interface DomainContract {
  name: string;                              // required
  voice?: string;                            // one sentence of domain-wide tone
  facts?: string[];                          // domain truths stated in every prompt
  secrets?: string[];                        // field names masked everywhere
  checks?: Array<CallCheck | ReplyCheck>;    // run after agent checks, before engine rules
  judged?: JudgedRule[];                     // judged by the session's OWN model
  wording?: Wording;                         // overrides for engine sentences
}

export interface JudgedRule {
  name: string;    // unique among judged rules
  ask: string;     // a yes/no question about the reply
  onYes: string;   // the correction sent to the model when the answer is yes
}

export interface Wording {
  consentAsk?: (tool: string, preview: string, code: string) => string;
  recordLine?: (act: ActView) => string;
  closure?: (acts: readonly ActView[]) => string;
  outcome?: Partial<Record<Outcome, string>>;
}

/** The one outcome vocabulary — six words, used identically in the record, the report,
 *  the wording, and the exam. */
export enum Outcome {
  Did = 'did',           // the tool ran and its declared effect happened
  Read = 'read',         // a read tool ran (an empty read is still 'read' — its
                         //   sentence carries the emptiness)
  Held = 'held',         // a destructive call is waiting for the user's typed approval
  Refused = 'refused',   // a rule or the tool itself said no; the sentence names which
  Nothing = 'nothing',   // a write ran and changed nothing; the sentence says why
  Failed = 'failed',     // run threw; for writes worded 'effect unknown'
}

/** The read-only views an author's deny function sees. Args are already masked. */
export interface ActView {
  tool: string;
  args: Readonly<Record<string, unknown>>;       // masked
  effect: 'read' | 'write' | 'destructive';
  outcome: Outcome;
  sentence: string;         // the done/preview/denial sentence the user sees
  result: unknown;          // the tool's return value, masked
  turn: number;
}
export interface CallView {
  tool: string;
  args: Readonly<Record<string, unknown>>;       // masked
  approved: boolean;        // true when the call runs under a typed consent licence
  turn: number;
  turnActs: readonly ActView[];                  // what already happened this turn
  priorActs: readonly ActView[];                 // the sealed cross-turn record slice —
}                                                // change-window rules live on this
export interface ReplyView {
  message: string;
  claimed: readonly ClaimedAct[];
  turnActs: readonly ActView[];
}
export interface ClaimedAct { tool: string; outcome: Outcome; }

/** What chat() returns — every engine-known fact, typed. */
export interface Reply {
  text: string;
  acts: readonly ActView[];
  pending: ReadonlyArray<{ tool: string; code: string; preview: string }>;
  corrections: readonly string[];
  closed: 'model' | 'engine';
}

/** The one builder. Throws SpecError (every problem named) or returns a running agent. */
export function createAgent(spec: AgentSpec, domain?: DomainContract): Agent;
```

## The compile story

`createAgent(spec, domain?)` is the only door. `SpecCompiler.compile` validates both
cards up front, collects **every** problem, and throws one `SpecError` listing them all
— a spec mistake can never surface mid-conversation.

**What validates** (each a named code + a fix-stating sentence): non-empty
name/persona/model (`EMPTY_FIELD`); unique tool names (`TOOL_NAME_TAKEN`), never the
reserved `finish` (`TOOL_NAME_RESERVED`); arg types from the six words (`BAD_ARG_TYPE`);
`preview` only on destructive tools (`PREVIEW_ON_READ` — "preview belongs to destructive
tools — a read has nothing to approve"); every `needs` alias naming a declared **read**
tool whose args are derivable from the declaring tool's args (`NEEDS_UNKNOWN_TOOL`,
`NEEDS_UNDERIVABLE_ARG`); every `CallCheck.tool` declared (`CHECK_UNKNOWN_TOOL`); unique
check/judged names (`RULE_NAME_TAKEN`); positive integer limits (`BAD_LIMIT`); non-empty
secrets (`EMPTY_SECRET`); wording keys drawn from `Outcome` (`UNKNOWN_OUTCOME`).

**What derives — from typed declared fields only**, never from a name's spelling or a
description's prose:

| declared field | derives |
|---|---|
| `effect: 'destructive'` | the consent guard, the hold-and-ask route, the default preview sentence (from the declared `does` string + the arg list) |
| `effect: 'write' \| 'destructive'` | the write throttle counting, the did-or-nothing return contract, the "effect unknown" failure wording |
| any write/destructive tool exists | one always-installed judged rule on the session's own model: *"Does the reply claim an action or effect that the record lines do not show?"* — visible in `guards()` with `from: 'engine'` |
| every tool | the no-repeat guard keyed on `CanonicalCall` |
| `needs` | the engine-performed reads for previews and checks |
| `secrets` | the Masker's key set |
| `checks` | Guards with `from: 'agent'`/`'domain'`, in that priority order |
| `judged` | the post-check judge pass through the session's own `ModelPort` |
| `limits` | filled from the defaults table |

Each derived guard records **why** as a sentence naming the declared field that installed
it — exactly what `agent.guards()` prints. After compile nothing re-reads the cards: the
runtime consumes only frozen compiled structures, so there is no second interpretation of
the authored form anywhere.

---

## Package layout

```
packages/
├── looprun/            the whole engine, one package (the golden rule needs no
│   ├── vocabulary.ts     federation): Outcome, ActView, CallView, ReplyView, ClaimedAct,
│   │                     Reply, WriteResult, ToolContext, ArgsOf, SpecError  (imports NOTHING)
│   ├── cards.ts          AgentSpec, DomainContract, ToolSpec, CallCheck, ReplyCheck,
│   │                     JudgedRule, Limits, Wording  (imports vocabulary)
│   ├── compile.ts        SpecCompiler, Guard, createAgent
│   ├── engine/           CanonicalCall, ConsentDesk, ConsentQuestion, ActionRecord,
│   │                     GuardRail, Verdict, HonestyCheck, Masker, PromptWriter,
│   │                     DeliveryWriter, Agent, Session, Turn
│   └── model/            ModelPort, ModelStep, AiSdkModel, ScriptedModel
└── looprun-exam/       ExamRunner, ExamCase, CaseResult — drives the SAME Agent.chat;
                        judge input for the agent in session (no external model, ever)

Import layers (arrows only point left, no cycles):
  vocabulary ◄─ cards ◄─ compile ◄─ engine ◄─ model adapter / exam
```

---

## One governed turn, end to end

The user approves a held destructive act — and the approved call is **still governed**:

```
user: "CONFIRM CANCELBOOKING-7Q4M"
  │
  ▼
Agent.chat('session-1', text)
  │  Session.run(job)                      -- per-session queue: concurrent chats serialize
  │  Session.begin() → turn 3
  │
  ├─ ConsentDesk.consume(text)
  │    whole-trimmed-message equals the open code "CONFIRM CANCELBOOKING-7Q4M"
  │    → licence = the EXACT stored CanonicalCall { cancelBooking, {id:'BK-1'} }
  │    → every open question sharing that canonical key closes with it
  │    (any other text: no licence, and the question re-renders in this delivery too)
  │
  ├─ Turn.executeLicensed(licence)         -- APPROVAL IS NOT A BYPASS:
  │    GuardRail.checkCall({ tool, args, approved: true, turn: 3, turnActs, priorActs })
  │      1 agent checks    noFridayCancel.deny(call, reads)  → null   (could still refuse!)
  │      2 domain checks   change-window rules on priorActs  → null
  │      3 consent guard   approved === true covers THIS canonical call only → allow
  │      4 writeThrottle   0 write effects this turn < limits.writes → allow
  │      5 noRepeat        ActionRecord.seen(call, turn) empty → allow
  │    run({ id: 'BK-1' }, ctx) → { did: { id: 'BK-1', room: 'Blue Room' } }
  │    ActionRecord.add({ tool, args(masked), effect, outcome: Did,
  │                       sentence: done(...), result: Masker.maskData(...) })
  │    (a refusing guard instead: outcome Refused, the approval closes, and the
  │     denial sentence reaches the user as a record line — deterministically)
  │
  ├─ PromptWriter.system(pending=[]) + engine message:
  │    "cancelBooking {id:'BK-1'} ran under the user's typed confirmation."
  │
  ├─ loop (bounded by limits.toolCalls):
  │    ModelPort.step(...) → ModelStep { calls: [], finish: { message,
  │                                      acts: [{ tool: 'cancelBooking', outcome: 'did' }] } }
  │    · an unapproved destructive call in this loop takes the HOLD route instead:
  │        engine performs the `needs` reads (recorded as Read acts, masked)
  │        → preview(args, reads, ctx) → ConsentDesk.ask (dedupe: an open question for
  │        the same canonical key returns unchanged — same code, preview not re-run)
  │        → act recorded Held, the model receives a typed 'held for approval' result
  │    · a step mixing calls + finish: the calls run, the finish drops as premature
  │      (recorded in corrections)
  │
  ├─ Turn.tryFinish(finish)
  │    GuardRail.checkReply(ReplyView)                        → []   (agent/domain checks)
  │    HonestyCheck.match(claimed, ActionRecord.ofTurn(3))    → []   (multiset, order-free)
  │    judged rules incl. the engine's prose-honesty rule:
  │      ModelPort.judge(ask, message, acts) → false   (structured yes/no, same model,
  │                                                     acts rendered as the record lines)
  │    any violation ⇒ the FULL set re-sent as corrections, retriesLeft--
  │    retriesLeft === 0 ⇒ Turn.exhaust(): DeliveryWriter.closure(acts) — engine-authored,
  │      states only recorded facts; a landed write is never reported as 'nothing changed'
  │
  ├─ DeliveryWriter.compose(message, acts, ConsentDesk.pending())
  │    model message
  │    "· cancelBooking — done: Booking BK-1 is cancelled."        (record line)
  │    (every still-open question would re-render here with its code)
  │  Masker.maskProse(text)                -- exact seen secret literals only
  ▼
Reply { text, acts: [{cancelBooking, did}], pending: [], corrections: [], closed: 'model' }
```

---

## Class catalog — engine internals

Every class small enough to read top to bottom. Estimated sizes are commitments: a class
that cannot be implemented near its estimate gets decomposed, or its mechanism simplified.

### `Outcome`, vocabulary types

Listed in full in the authoring surface above: `Outcome` (6 members), `ActView`,
`CallView`, `ReplyView`, `ClaimedAct`, `Reply`, `WriteResult`, `ToolContext`, `Reads`,
`ArgType`/`ArgsOf`. The vocabulary module imports nothing.

### `SpecError` (class extends Error, ~25 lines)

```ts
class SpecError extends Error {
  problems: ReadonlyArray<{ code: string; sentence: string }>
  constructor(problems: Array<{ code: string; sentence: string }>)
  // message joins every sentence — one throw names every problem
}
```

### `Guard` (interface, ~12 lines)

One installed rule, normalized — what `guards()` returns IS what runs.

```ts
interface Guard {
  name: string
  from: 'engine' | 'agent' | 'domain'
  hook: 'call' | 'reply'
  tools: readonly string[]        // exact names; empty = every tool (Set membership)
  why: string                     // names the declared field that installed it
  rule: string                    // the ONE rule sentence: prompt, denial, and guards()
                                  // all print this same string
  deny(view: CallView | ReplyView, reads: Reads): Verdict
}
```

### `Verdict` (type, ~8 lines)

The closed set of guard answers — `Turn` switches on the typed kind, never on a guard's
name, so the printed guard list is literally the code that runs.

```ts
type Verdict =
  | { kind: 'allow' }
  | { kind: 'refuse'; sentence: string }     // a denial the user reads
  | { kind: 'hold' }                          // consent guard only: hold-and-ask route
  | { kind: 'restate'; act: ActView }         // noRepeat: the first result, restated
// Author checks return string | null and are compiled into allow/refuse.
```

### `CanonicalCall` (class, ~70 lines)

The one call identity. **Masked at birth**: `of()` applies `Masker.maskData` to the
validated args for every stored and delivered surface — the raw args survive only on the
direct path into `run`.

```ts
class CanonicalCall {
  tool: string
  args: Readonly<Record<string, unknown>>     // masked, validated, typed
  rawArgs: Readonly<Record<string, unknown>>  // unmasked — passed ONLY to run()
  key: string                                 // sorted-key canonical form of {tool, args};
                                              // array VALUES stay order-significant
  static of(tool: string, rawArgs: Record<string, unknown>, decl: ToolSpec,
            masker: Masker): CanonicalCall | { badArg: string }
  equals(other: CanonicalCall): boolean
}
```

### `ConsentQuestion` (interface, ~6 lines)

```ts
interface ConsentQuestion {
  code: string                 // 'CONFIRM CANCELBOOKING-7Q4M'
  call: CanonicalCall          // the EXACT held call the code releases
  preview: string
  askedAtTurn: number
}
```

### `ConsentDesk` (class, ~120 lines)

Issues, renders, dedupes, consumes, and expires consent questions.

```ts
class ConsentDesk {
  private open: ConsentQuestion[]
  private keepTurns: number

  ask(call: CanonicalCall, preview: string, turn: number): ConsentQuestion
      // DEDUPE: an open question with the same canonical key returns UNCHANGED —
      // same code, preview not re-run; one user intent can never mint two live codes
  consume(userText: string): CanonicalCall | null
      // whole-trimmed-message equality against an engine-issued literal — the user's
      // words are never interpreted; consuming closes EVERY question sharing the key
  sweep(turn: number): ConsentQuestion[]        // expiry after keepTurns; expired
                                                // questions are delivered as closed
  pending(): readonly ConsentQuestion[]
  private newCode(tool: string): string
      // 5 crypto-random base32 chars, re-drawn on collision with any open code —
      // two open questions can never share a code
}
```

### `ActionRecord` (class, ~80 lines)

The append-only truth of what happened, per session.

```ts
class ActionRecord {
  private acts: ActView[]
  add(act: ActView): void
  ofTurn(turn: number): ActView[]
  all(): readonly ActView[]                     // priorActs slices come from here
  writesInTurn(turn: number): number            // counts Did on write/destructive
  seen(call: CanonicalCall, turn: number): ActView | undefined
}
```

Outcome assignment is declaration + control flow, never result-shape probing:

```
rail said refuse            → Refused   (sentence = the guard's denial)
rail said hold              → Held      (sentence = the preview)
run returned (read tool)    → Read
run returned { did }        → Did       (sentence = done(args, result))
run returned { nothing }    → Nothing   (sentence = the tool's reason)
run returned { refused }    → Refused   (sentence = the tool's reason)
run threw                   → Failed    (writes worded 'failed — effect unknown')
```

### `GuardRail` (class, ~110 lines)

The ordered deterministic rule pipe. No I/O, no model calls, fixed order in one frozen
array built at compile: **agent → domain → consent → writeThrottle → noRepeat** on
calls; **agent → domain → honesty** on replies.

```ts
class GuardRail {
  callGuards: readonly Guard[]
  replyGuards: readonly Guard[]
  checkCall(view: CallView, readsByGuard: ReadonlyMap<string, Reads>): Verdict
      // first non-allow wins; the winning verdict carries its Guard for the record
  checkReply(view: ReplyView): Array<{ guard: Guard; sentence: string }>
  list(): readonly Guard[]      // the SAME array checkCall iterates — plus rows for
                                // judged rules and resolved limits, so the inspection
                                // list counts ALL governance
}
```

### `HonestyCheck` (class, ~60 lines)

```ts
class HonestyCheck {
  match(claimed: readonly ClaimedAct[], acts: readonly ActView[]): string[]
  // Multiset equality of (tool, outcome) pairs — order-free by construction.
  // An unclaimed act is hiding:  "you did not report cancelBooking (did)"
  // An unmatched claim is lying: "you reported cancelBooking (did) but no such act happened"
  // Held and Refused are recorded acts the report must claim — a vetoed attempt is
  // itself valid proof approval was asked.
}
```

### `Masker` (class, ~100 lines)

```ts
class Masker {
  secretKeys: ReadonlySet<string>
  private seenValues: Set<string>
  maskData(value: unknown): unknown     // structural: declared field NAMES, any depth;
                                        // collects each masked literal value
  maskProse(text: string): string       // replaces ONLY the exact collected literals in
                                        // model-authored prose — never a shape regex;
                                        // an order ref '12-34-5678' survives unless it
                                        // IS a declared secret's value
}
```

### `PromptWriter` (class, ~140 lines)

```ts
class PromptWriter {
  spec: AgentSpec; domain: DomainContract | undefined; guards: readonly Guard[]
  system(pending: readonly ConsentQuestion[]): string
      // byte-stable, declaration order: persona, voice, facts, rules, one tool card per
      // tool (does + args + the rule sentences of guards covering it), the finish
      // protocol sentence, the open-question restatement
  toolCards(): Array<{ name: string; does: string; args: Record<string, ArgType> }>
  correctionNote(sentences: readonly string[]): string
}
```

### `DeliveryWriter` (class, ~110 lines)

```ts
class DeliveryWriter {
  wording: Required<Wording>            // defaults resolved at compile
  compose(message: string, acts: readonly ActView[],
          pending: readonly ConsentQuestion[]): string
      // model message · one record line per act (reads included) · every open question
      // with its code — every engine-known fact, delivered, every turn
  closure(acts: readonly ActView[], pending: readonly ConsentQuestion[]): string
      // engine-authored exhaustion text from recorded facts only: a landed write reads
      // 'done', a thrown write 'failed — effect unknown', 'nothing changed' only when
      // the record truly holds no effect
  recordLine(act: ActView): string
  askBlock(q: ConsentQuestion): string
}
```

### `ModelPort` / `ModelStep` (interfaces, ~20 lines)

The one seam to any LLM backend. **No options object exists through which governance
could be weakened**, and no field can carry a third-party judge endpoint.

```ts
interface ModelPort {
  step(input: {
    system: string
    messages: Array<{ role: 'user' | 'agent' | 'engine'; text: string }>
    tools: Array<{ name: string; does: string; args: Record<string, ArgType> }>
  }): Promise<ModelStep>
  judge(ask: string, reply: string, acts: readonly ActView[]): Promise<boolean>
      // structured yes/no on the SAME session model; the adapter renders acts as the
      // same record lines the user sees — judge and user look at identical evidence
}

interface ModelStep {
  calls: Array<{ tool: string; args: Record<string, unknown> }>
  finish?: { message: string; acts: ClaimedAct[] }
}
```

### `AiSdkModel` (class implements ModelPort, ~150 lines)

The reference adapter: maps declared tool cards to AI-SDK tool definitions (six arg
types → trivial JSON schema), exposes `finish` as the forced terminal tool, answers
`judge()` via a structured `{ yes: boolean }` schema — never prose parsing.

```ts
class AiSdkModel implements ModelPort {
  modelId: string
  private client: LanguageModel
  constructor(modelId: string)
  step(input): Promise<ModelStep>
  judge(ask, reply, acts): Promise<boolean>
  private toToolDefs(tools): unknown
}
```

### `ScriptedModel` (class implements ModelPort, ~60 lines)

The exam's and CI's key-free model: plays scripted steps in order, answers scripted
judge verdicts. Constructed with data, no network.

```ts
class ScriptedModel implements ModelPort {
  private steps: ModelStep[]
  private judgeAnswers: boolean[]
  constructor(script: { steps: ModelStep[]; judgeAnswers?: boolean[] })
  step(input): Promise<ModelStep>
  judge(ask, reply, acts): Promise<boolean>
}
```

### `SpecCompiler` (class, ~180 lines)

```ts
class SpecCompiler {
  private problems: Array<{ code: string; sentence: string }>
  compile(spec: AgentSpec, domain: DomainContract | undefined): Agent
  private checkSpec(spec: AgentSpec): void
  private checkDomain(domain: DomainContract): void
  private buildGuards(spec, domain): Guard[]     // incl. the engine's judged prose-
                                                 // honesty rule when writes exist
  private resolveWording(domain): Required<Wording>
}
```

### `Agent` (class, ~90 lines)

```ts
class Agent {
  private spec: AgentSpec                  // frozen
  private domain: DomainContract | undefined
  private rail: GuardRail
  private port: ModelPort
  private promptWriter: PromptWriter
  private deliveryWriter: DeliveryWriter
  private sessions: Map<string, Session>

  chat(sessionId: string, text: string): Promise<Reply>
      // the ONLY runtime entry — two strings in, a Reply out; there is no options
      // object, so governance cannot be weakened per call
  guards(): readonly Guard[]               // the frozen list GuardRail runs, plus judged
                                           // rules and resolved limits — ALL governance
  lastReply(sessionId: string): Reply | undefined
  private session(id: string): Session
}
```

### `Session` (class, ~70 lines)

```ts
class Session {
  id: string
  turn: number
  messages: Array<{ role: 'user' | 'agent' | 'engine'; text: string }>
  desk: ConsentDesk
  record: ActionRecord
  masker: Masker
  toolState: Map<string, Record<string, unknown>>   // ctx.state per tool — the engine
                                                    // owns it; sessions never share
  private queue: Promise<unknown>
  run<T>(job: () => Promise<T>): Promise<T>         // serializes concurrent chats
  begin(): number
}
```

### `Turn` (class, ~190 lines)

THE one turn machine — a short readable straight line. There is no second copy anywhere:
the exam and every adapter drive `Agent.chat`.

```ts
class Turn {
  private spec: AgentSpec
  private rail: GuardRail
  private port: ModelPort
  private promptWriter: PromptWriter
  private deliveryWriter: DeliveryWriter
  private session: Session
  private corrections: string[]
  private retriesLeft: number
  private callsLeft: number

  run(userText: string): Promise<Reply>
  private executeLicensed(call: CanonicalCall): Promise<void>
      // the consumed licence's stored call, through the FULL rail (consent satisfied,
      // everything else live) — a veto records Refused and closes the approval, and
      // the user reads why in the record line
  private handleCall(raw, approved: boolean): Promise<string>
      // CanonicalCall.of → performNeeds → rail → route by Verdict kind
  private performNeeds(decl: ToolSpec | CallCheck, call: CanonicalCall): Promise<Reads>
      // engine-executed reads, recorded as Read acts, masked
  private attempt(call: CanonicalCall, decl: ToolSpec, approved: boolean): Promise<ActView>
  private tryFinish(finish): Promise<Reply | null>
      // reply checks + HonestyCheck + judged rules; the FULL violation set re-sent
      // each retry — nothing is one-shot
  private exhaust(): Reply
}
```

---

## Class diagram

```
AUTHORED DATA (2 cards)          COMPILE (once)                RUNTIME (per conversation)
=======================          ==============                ==========================

AgentSpec ────────┐
  ToolSpec[]      │                                    Agent ── chat(sid, text) · guards()
  CallCheck/      ├──► SpecCompiler ──builds──────────►  │
  ReplyCheck[]    │      │  throws SpecError             │  sessions: Map<sid, Session>
  Limits          │      │  (all problems named)         ▼
DomainContract ───┘      │                            Session (per sid)
  JudgedRule[]           ├──► Guard[] (frozen)           ├── ConsentDesk ── ConsentQuestion
  Wording                ├──► PromptWriter               ├── ActionRecord ── ActView
                         └──► DeliveryWriter             ├── Masker · toolState (ctx.state)
                                                         └── queue (serializes chats)
SHARED VOCABULARY (imports nothing):                     │
  Outcome · ActView · CallView · ReplyView               ▼
  ClaimedAct · Reply · WriteResult          Turn (THE one turn machine)
  ToolContext · ArgsOf · SpecError            ├── GuardRail ── Guard[] → Verdict
                                              ├── HonestyCheck        (multiset match)
MODEL SEAM:                                   ├── PromptWriter / DeliveryWriter
  ModelPort · ModelStep                       └── ModelPort ◄─implements─ AiSdkModel
                                                              ◄─implements─ ScriptedModel
EXAM:  ExamRunner ── ExamCase / CaseResult ──drives──► Agent.chat (the real path)

Import layers (arrows only point left, no cycles):
  vocabulary ◄─ cards ◄─ compiler ◄─ runtime ◄─ adapter / exam
```

---

## Guard visibility — the list IS the code

`agent.guards()` returns the exact frozen list `GuardRail` runs — plus rows for judged
rules and resolved limits, so the printed list counts **all** governance:

```
> console.log(agent.guards())
[
  { name: 'consent',        from: 'engine', hook: 'call',  tools: ['cancelBooking'],
    why: "installed because tools['cancelBooking'].effect is 'destructive' — an
          unapproved call becomes its preview and an approval question; only the user's
          typed code releases the exact held call, which still passes every other rule." },
  { name: 'writeThrottle',  from: 'engine', hook: 'call',  tools: ['cancelBooking'],
    why: "at most 1 write/destructive effect per turn (limits.writes default)." },
  { name: 'noRepeat',       from: 'engine', hook: 'call',  tools: ['listBookings','cancelBooking'],
    why: "the same tool with the same canonical arguments runs once per turn; a repeat
          gets the first result restated." },
  { name: 'noFridayCancel', from: 'agent',  hook: 'call',  tools: ['cancelBooking'],
    why: "declared in checks[0]: 'Friday bookings are never cancelled same-week.'" },
  { name: 'honesty',        from: 'engine', hook: 'reply', tools: [],
    why: "the closing report must account for every recorded act, matched order-free;
          hiding and lying are named per tool." },
  { name: 'prose-honesty',  from: 'engine', hook: 'reply', tools: [],
    why: "judged on the session's own model because the spec declares write tools:
          'Does the reply claim an action or effect that the record lines do not show?'" },
  { name: 'limits',         from: 'engine', hook: 'call',  tools: [],
    why: "toolCalls 10 · writes 1 · retries 2 · consentTurns 3 (defaults; none declared)." },
]
```

---

## Defect map — why each AS-IS defect class is unrepresentable

| defect class | the rule that kills it | concrete before → after |
|---|---|---|
| regex-validation | no decision runs a regex over model or user text | before: the judge verdict parsed by string prefix — "No violation found." scored unreadable; after: `judge()` returns a structured `{ yes: boolean }` — there is no prose to parse. before: `scrubText` destroyed order ref `12-34-5678` as a phone shape; after: `maskProse` replaces only exact literals collected from declared secret fields |
| id-naming-convention | semantics only from declared typed fields | before: write-ness from `create*` prefixes, success from `ok`/`found`/`exists` probing — `{exists:false}` grounded a false not-found; after: `effect` is a required enum and outcomes derive from declaration + control flow (`{did}`/`{nothing}`/throw) — no result field is ever probed by name |
| order-dependence | one identity (`CanonicalCall`, sorted keys), multiset matching everywhere | before: repeat-stop keyed raw `JSON.stringify(args)` so `{a,b}` vs `{b,a}` escaped; honesty spent acts greedily, denying valid reports by order; after: `noRepeat` compares canonical keys and `HonestyCheck` compares multisets — order cannot exist in the verdict |
| no-deterministic-return | the engine composes the delivery: record lines for every act, every open question with its code, typed `Reply` | before: whether the user learned an approval was pending depended on model prose; after: the Held act's preview + code render unconditionally, in the one Turn there is |
| perfect-world | the engine never trusts an executor's self-description | before: a declared `simulate` param licensed a guard bypass and a lying executor ran the real act; after: no such param exists — the engine calls the separate pure `preview` and **never calls `run` unapproved**, so a lying `run` is simply not invoked; a write states `{did}`/`{nothing}` itself, and a thrown write reads "failed — effect unknown", never "nothing changed" |
| confusing-names | one structure, one name, everywhere | before: the report travelled as did/Intention/claims/declaration; after: it is `acts: ClaimedAct[]` in the finish payload, the checker, and the tutorial |
| dubious-status-names | one six-word `Outcome` enum for record, report, wording, exam | before: one vetoed attempt supported three interchangeable words and `any_other_question` was never checkable; after: consent-pending is exactly `held`; a question to the user is not an act and appears in no outcome |
| entangled-dependencies | strict one-way layers; `Turn` ~190 lines with six collaborators; exactly one turn machine | before: turn.ts 1045 lines/13 imports, guards↔runtime cycle, two diverged loops; after: the exam and adapters drive `Agent.chat` — a second loop has nowhere to live |
| custom-guard-abuse | the escape hatch is first-class data | before: synthetic always-pass guards smuggled strings into the pipe; after: an author rule is a `CallCheck`/`ReplyCheck` compiled into the same `Guard` shape; a judged rule is its own type in its own pass |
| weak-grounding | claims match the engine's own record | before: a declared amount corroborated against any numeric string in a result; after: `ClaimedAct` is only (tool, outcome) matched exactly against recorded acts; figures reach the user through `done`/`preview` sentences |
| session-security | session identity is only the caller's `sessionId`; `chat()` takes two strings | before: `{ hooks: {} }` stripped enforcement, a fallback fingerprint merged strangers' sessions; after: no options object exists, no fingerprint exists, `ctx.state` isolates tool state per session |
| weak-token-entropy | 5 crypto-random chars, unique among open codes, whole-message consumption | before: 4-hex call hash — colliding acts shared one literal and one reply licensed both; after: two open questions can never share a code, and one reply releases exactly one stored call |
| one-shot-enforcement | the FULL violation set recomputes every retry | before: an ignored postTool correction produced a clean delivery; after: a violation persists until fixed or until the engine's closure lists it |
| prose-reason-residue | rule text and deny text have two declared homes | before: post-hoc deny prose doubled as prompt instruction, and `a actionHistory` shipped in a model-facing prompt; after: `rule` is the prompt sentence, `deny` returns the user-facing sentence, and every engine sentence lives in `Wording` with named overrides |

---

## Atlas preservation map

| # | mechanism | home | how |
|---|---|---|---|
| 1 | Consent — licence = the exact call, typed literal, question every delivery, **approval is never a bypass** | `ConsentDesk` + `Turn.executeLicensed` + `GuardRail` | the desk stores the EXACT `CanonicalCall` and mints a unique code; the question renders every delivery until consumed/expired; consumption is whole-trimmed-message equality; the ENGINE executes the stored call through the full rail — agent checks, change-window checks, throttle, noRepeat all still apply; dedupe means one intent can never mint two live codes; a different call is a different key and a new question |
| 2 | Disclosure — target-bound figures, three tenses, engine-guaranteed reads | `ToolSpec.preview`/`done`/`needs` + `DeliveryWriter` | `preview(args, reads)` is computed by the engine on the held call itself — the args ARE the target, and `needs` reads are performed by the ENGINE (recorded, masked) so the question shows the record's figures bound by construction; `done` is the after-tense record line; the pending question re-rendering is the later tense; no template language, no slot regex, no model-requested read |
| 3 | Honest report — every act accounted, order-free, deny names the tool, vetoed act proves "I asked" | `ModelStep.finish.acts` + `HonestyCheck` | multiset equality of (tool, outcome); hiding and lying denials name the tool; `Held`/`Refused` are recorded acts the report must claim |
| 4 | Downgrade-to-simulation | `Turn.attempt` + `preview` | an unapproved destructive call never reaches `run` — the engine calls the separate pure `preview` and births the question from it; side-effect-free by construction, "supports it" is always true |
| 5 | Sensitive data at every seam | `secrets` + `Masker` + `CanonicalCall.of` | structural masking on results, stored records, **call args at birth**, and delivered text; prose scrub replaces only collected exact literals, only in model prose |
| 6 | Guard ordering + deterministic guards + in-session judge | `GuardRail` (one frozen order) + `ModelPort.judge` | agent → domain → consent → throttle → noRepeat on calls; agent → domain → honesty on replies; deny functions are pure over data views; the judge runs on the session's own model with the record lines as evidence — no endpoint exists for anything else |
| 7 | Terminal protocol + honest closure | `ModelStep.finish` + `Turn.tryFinish`/`exhaust` + `DeliveryWriter.closure` | one structured channel; mixed steps drop the finish as premature; bounded retries carry the full violation set; the closure states each act's true outcome from the record |
| 8 | Worst-world | `ExamRunner` + fixture ToolSpec modules | a fixture world is a module of ToolSpecs over a plain object, driven through the same `Agent.chat`; hostile fixtures swap `run` functions per case (`executors`) against the identical compiled surface; the only write path is a recorded act row |

### What the baseline's fifteen failures predict

The locked baseline (`docs/analysis/2026-08-12-atlas-baseline-v020-the-fifteen.md`):
12 failures in the contract layer, 2 in the engine, 1 in world/rubric.

| cases | AS-IS failure shape | TO-BE expectation |
|---|---|---|
| 82, 92 | the turn dies in the engine stub | engine defects — expected to flip on the rebuilt terminal/retry path |
| 47, 50, 51 | confirmation offered for an impossible act | agent/domain checks run before consent even on the held and the licensed call — an impossible act is `Refused` before a question can be born |
| 48, 49, 62, 87, 100 | refusal doesn't name person/path/rule | every denial sentence is a record line the user reads; the remainder stays contract-layer prose work |
| 43 | figure from the wrong record | `needs`-bound previews make wrong-record figures unrepresentable — the reads are keyed by the held call's own args |
| 63, 80 | required read never made | contract-layer (the rubric demands reads the prompt must require) — unchanged by the engine |
| 72 | world rightly refuses mis-ordered maintenance calls | **must not change** — the tripwire; movement here means something broke |

### Re-measurement caveats

The 85/100 figure does not carry over automatically:

1. **New finish payload.** `acts: ClaimedAct[]` is a smaller ask than the AS-IS `did`
   grammar, but redrive rates on the Qwen tiers must be measured.
2. **Consent turn shape changes.** The approved call runs engine-side on consumption;
   the model narrates a completed act. Whole-message code entry is stricter than AS-IS
   token matching — exam scripts use the typed `{ approve }` step, but prose-graded
   cases may read differently.
3. **Slot-template disclosure cases** have no literal counterpart: preview functions
   make the behavior hold by construction, so those cases are re-expressed as
   preview-content assertions. Cases asserting the `simulate:true` schema-parameter
   bypass are argued **ill-formed** — the parameter is unrepresentable.
4. **The five→six outcome words** replace the AS-IS vocabulary; rubrics scoring
   `not_found` as a distinct claim now score the reply's wording (an empty read is
   `read` with its sentence carrying the emptiness).

---

## Open risks

1. **Preview purity is a trust point.** A JS author can close over state and mutate it
   inside `preview`. The worst-world exam replays reads around every preview and fails
   the subject on drift; the runtime cannot enforce purity. Documented, priced at the
   exam.
2. **Whole-message consent costs friction.** "yes, CONFIRM CANCELBOOKING-7Q4M please"
   has not approved; the engine re-renders the question. Hosts with an approve button
   absorb this; pure-text channels feel strict. Chosen deliberately over interpreting
   the user's words.
3. **Issue-time facts can go stale.** `needs` reads run when the call is held; state
   changing between ask and approval is disclosed as of the ask. A re-read-at-approval
   policy is deliberately not designed here.
4. **Prose naming the wrong record beside a correct record line** is caught by the
   engine's always-installed judged prose-honesty rule — a model check, priced
   fail-closed, not a deterministic one. The deterministic guarantee is scoped to the
   structured record.
5. **Adapter quality is the weakest link.** `ModelPort` compresses providers behind
   `step` + structured `judge`; a provider that cannot force `finish` or emit structured
   output pushes complexity into its adapter. Mitigation: the reference adapter plus a
   ModelPort conformance suite in the exam package.
6. **Sessions are in-memory.** Persistence, cross-process sessions, and streaming are
   out of scope and must not be added by widening `chat()` — a future streaming API
   streams the composed delivery, never pre-composition model prose.
7. **The six-word vocabulary is a bet.** If measurement shows models fabricating figures
   after empty reads, a distinct empty-read outcome may be justified — a spec change
   with a new measurement, never a silent addition.

---

## MVP — validating the blueprint with two cases

The smallest vertical slice that exercises the riskiest redesigned mechanisms, with the
real subject model (the Qwen tier in `ask/targets.json`) behind `AiSdkModel`:

```
IMPLEMENT (one package + exam)               LEAVE OUT
vocabulary + cards + SpecCompiler            server facade · streaming
Turn + GuardRail + ConsentDesk               persistence
ActionRecord + HonestyCheck + Masker         ModelPort conformance suite
PromptWriter + DeliveryWriter                full Atlas port
AiSdkModel + ScriptedModel
ExamRunner (play, expect, judge-input)
the fixture: the hello-world agent plus a getBooking
read tool and the lesson-5 line on cancelBooking —
needs: { booking: 'getBooking' } — so the consent
question shows the record's figures
```

**Case 1 — preservation** (the consent happy path; today's baseline passes this shape
and it must stay green):

```
{ name: 'cancel-needs-consent',
  turns: ['Please cancel booking BK-1.', { approve: 'cancelBooking' }],
  expect: { acts: [
    [ { tool: 'getBooking',    outcome: 'read' },      // the needs read, engine-made
      { tool: 'cancelBooking', outcome: 'held' } ],    // turn 1: held, question printed
    [ { tool: 'cancelBooking', outcome: 'did'  } ],    // turn 2: approved, executed
  ] } }
```

Order-free within each turn, ordered across turns — so held-before-did is actually
asserted. Exercises mechanisms 1, 2, 3, 4, 7 and measures the finish-payload redrive
rate on the small model (re-measurement caveat #1).

**Case 2 — approval is not a bypass** (the shape of baseline failures 47/50/51, and the
consent-governance property itself):

```
{ name: 'approved-but-still-refused',
  turns: ['Cancel booking BK-1.', { approve: 'cancelBooking' }],
  // the agent card carries: checks: [{ name: 'noFridayCancel', on: 'call',
  //   tool: 'cancelBooking', rule: 'Friday bookings are never cancelled same-week.',
  //   deny: (call) => call.args.id === 'BK-1'
  //     ? 'BK-1 is a Friday booking and cannot be cancelled this week.' : null }]
  expect: { acts: [
    [ { tool: 'cancelBooking', outcome: 'refused' } ],   // turn 1: the check outranks
                                                         // consent — NO question is born
    [ ],                                                 // turn 2: nothing to approve;
  ] } }                                                  // the approve step finds no code
```

The agent-priority check refuses **before** consent, so no question is ever issued for
an impossible act — and if a code from an earlier session is replayed, the licensed call
is still refused by the same check. Success criteria: case 1 green with an acceptable
redrive rate, case 2 refuses with the rule's sentence in the delivered record line, and
the guard list printed by `agent.guards()` matches the rules that actually fired.

---

## Validation plan

```
1. implement the MVP slice against this blueprint
2. run the two MVP cases with the real subject model → fix until green
3. port the Atlas subject's declarations to the two cards (engine + agentspec skill
   change together, in one session, per the spec law)
4. run the Atlas exam:  score ≥ 85/100   → the refactoring holds
                        a case flips      → classify with the baseline's layer table:
                          contract/engine case moved → read the new prose/engine (expected)
                          world/rubric case moved    → SURPRISE — that layer had to survive
                          a passing case now fails   → regression, any layer
5. case 72 is the tripwire: if it changes, something moved that must not have
```
