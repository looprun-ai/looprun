# 03 · Agent anatomy

**What you get from this chapter:** what a spec declares, what a world provides, where the tool
surface comes from, and how a rule gets bound to a moment in the turn. Eleven symbols, all from
`looprun` (≡ `looprun/core`).

> **Code source.** Blocks come in two kinds, and each carries a caption saying which. **Excerpts**
> are verbatim from [`docs/tutorial/snippets/`](snippets/) — `scheduler/contract.ts`,
> `scheduler/spec.ts`, `scheduler/tools.ts`, `scheduler/world.ts`, `03-agent-anatomy.ts` — which CI
> typechecks against the published `looprun` package. **Signature blocks** are type declarations
> quoted from the library source so you can see a shape without a worked example; they are not
> compiled here.

Chapter 02 ran the scheduler with one read-only tool. This chapter builds the whole thing: three
tools, a scope, a domain contract, and the two obligations from the purpose sentence — *never
double-book, never delete without asking* — turned into mechanisms.

---

## 1. Four artifacts, four jobs

```
   docs/tutorial/snippets/scheduler/
   ├── contract.ts   the shared domain facts: scope, voice, invariants, the clock
   ├── spec.ts       THE MAP        — SchedulerSpec extends AgentSpecBase
   ├── tools.ts      THE SURFACE    — ToolDef[]: what the model may call, in JSON schema
   └── world.ts      THE MACHINE    — SchedulerWorld implements AgentWorld: state + execution
```

The split is deliberate and it is the reason a certified agent can be moved to production
unchanged: the **contract** of the tool surface (names, schemas) is fixed, while its **execution**
is swapped — an in-memory world for evals, your real APIs in production. Guards bind to the
contract, so they enforce identically on both sides.

### How the classes relate

```
                     ┌──────────────────────────────┐
                     │  interface AgentSpec         │  the structural type a spec satisfies:
                     │  id · mode · persona · scope │  what any consumer of a spec may rely on
                     │  surface · flow · guards     │
                     │  controls · behavior         │
                     │  contract                    │
                     └──────────────┬───────────────┘
                                    │ implements
                     ┌──────────────┴───────────────┐
                     │  class AgentSpecBase         │  ◄── new AgentSpecBase(cfg: AgentSpecConfig)
                     │  + addGuard(hook, target, …) │      auto-installs the universal invariants
                     │                              │      and, iff destructiveTools is set,
                     │                              │      the destructive-safety protocol
                     └──────────────┬───────────────┘
                                    │ extends
              ┌─────────────────────┴─────────────────────┐
              │                                           │
   ┌──────────┴────────────┐                  ┌───────────┴───────────┐
   │ class SchedulerSpec   │                  │ class                 │
   │ 3 tools · scope ·     │                  │ HelloSchedulerSpec    │
   │ contract · 4 guards   │                  │ 1 tool (chapter 02)   │
   └──────────┬────────────┘                  └───────────┬───────────┘
              │                                           │
              └─────────────────┐        ┌────────────────┘
                                ▼        ▼
                     ┌──────────────────────────────┐
                     │  class LoopRunAgent          │  (chapter 02)
                     │  new LoopRunAgent({          │  extends Mastra's Agent
                     │    spec, world, toolDefs,    │
                     │    model })                  │
                     └───────┬──────────────┬───────┘
                             │              │
             world seam ─────┘              └───── tool surface
                             │              │
   ┌─────────────────────────┴────┐  ┌──────┴──────────────────────┐
   │  interface AgentWorld        │  │  interface ToolDef          │
   │  exec · advanceTurn ·        │  │  name · description ·       │
   │  ingestAttachment ·          │  │  inputSchema (JSON schema)  │
   │  toolCalls · sseActions      │  └──────────────┬──────────────┘
   └─────────────┬────────────────┘                 │
                 │ implements                       │ authored as
   ┌─────────────┴────────────────┐  ┌──────────────┴──────────────┐
   │ class SchedulerWorld         │  │ listEventsTool · addEvent-  │
   │ hand-written — the default   │  │ Tool · cancelEventTool      │
   │ and certified path           │  │ (scheduler/tools.ts)        │
   └──────────────────────────────┘  └─────────────────────────────┘
```

`AgentSpecBase` also carries `addReplyCheck` and `addMutator`; both are conveniences over the same
binding machinery, and chapter 04 is where a reason to reach for them appears.

Read it top to bottom: **the spec is a type before it is a class**, the class is a convenience that
installs safety defaults, your agent subclasses it, and the agent object binds that spec to a world
and a tool surface.

---

## 2. `AgentSpec`, `AgentSpecBase`, `AgentSpecConfig`

Three names for what feels like one thing, so be precise about which is which:

| symbol | kind | you use it when |
|---|---|---|
| `AgentSpec` | **interface** — the structural type | you write a function that *accepts* a spec, or you build one without extending the class |
| `AgentSpecBase` | **class** — the certified implementation | you *author* an agent. Extend it. This is the normal path |
| `AgentSpecConfig` | **interface** — the constructor argument | you `super({...})`, or you build the config object separately and want it type-checked |

`AgentSpecBase`'s constructor is not a passive assignment. It installs, before your code runs:

```
   ALWAYS                            noDuplicateCall   (preTool)
                                     degenerationGuard (onReply)

   IFF destructiveTools is set       confirmFirst        ┐ on exactly those tools
                                     destructiveThrottle ┘

   IFF contract.writeTools is set    claimIsGrounded     ┐ the honesty cross-check (§5)
                                     claimIsComplete     ┘
```

Those six are what a spec like the scheduler's gets — chapter 04 rows, none of which you name here.
**Never re-add them by hand**: the same rule would render twice in the prompt, from two sources that
can drift. (The blank-reply floor is not among them: it lives in the runtime's own `finalizeReply`, so
no guard carries it — chapter 04 §3.)

The box is scoped to a spec with no confirm-mechanism override. `confirmMechanism` changes it, and this
tutorial does not teach it: it selects, per tool, between the default `'arg'` confirm (the `confirmed`
flag) and `'prior-ask'` (a flag-less action gated on an `ask` intention in an earlier turn). It is
domain plumbing no chapter claims — reach for the source when you need it. (The config carries no
pattern vocabulary for reply text: a reply-honesty judgment a domain needs is an `llmCheck` rubric you
bind on `onReply`, chapter 04.)

Here is the scheduler's whole declaration:

```ts
export class SchedulerSpec extends AgentSpecBase {
  constructor() {
    super({
      id: 'scheduler',
      mode: 'CALENDAR',
      persona: 'You are the scheduling agent: you keep this person’s calendar — checking it, adding to it, and cancelling from it.',
      scope: SCHEDULER_SCOPE,
      tools: ['listEvents', 'addEvent', 'cancelEvent'],
      destructiveTools: ['cancelEvent'], // ⇒ confirmFirst + destructiveThrottle, installed for you
      contract: SCHEDULER_CONTRACT,
      behavior: [
        // UNCHECKABLE residue only — every rule with a guard states itself from that guard's prose.
        'When more than one event could match a vague description, list the candidates and ask which one — never pick for the user.',
      ],
    });
```
<sub>excerpt · `snippets/scheduler/spec.ts`</sub>

Field by field, the ones that carry a rule:

| field | law it obeys |
|---|---|
| `id` / `mode` | both **required**. `id` names the agent; `mode` is a free-form label echoed into eval records and case routing. It is near-vestigial today — nothing in the runtime branches on it — but it is not optional, so pick something stable and move on |
| `persona` | lives on the **spec**, never on the shared domain contract — one line, per agent, rendered as late as possible so agents of the same domain share a maximal cacheable prompt prefix |
| `tools` | the surface, declared. ≤15, and the terminal tool (`respond`) is runtime-owned — naming it **throws** at construction |
| `destructiveTools` | a declaration, not a comment: it *installs* the confirm-first protocol — and with it, the obligation to ask. That is why this spec carries no `terminal` policy: the two are refused together (§4) |
| `behavior` | the **uncheckable residue only**. A line here that restates a rule some guard already enforces is two copies of one rule with only one wired to a check — guaranteed drift, and the spec lint flags it |

That last row is the discipline the whole design rests on. The behavior bullet above survives the
test because no `check()` can decide "more than one event *could* match a vague description" —
vagueness is language-layer.

---

## 3. `AgentScope` — the lane, and who owns the rest

```ts
export const SCHEDULER_SCOPE: AgentScope = {
  lane: 'the user’s own calendar: what is on it, adding to it, cancelling from it',
  others: [{ label: 'the travel desk', covers: 'flights, hotels and anything that costs money' }],
};
```
<sub>excerpt · `snippets/scheduler/contract.ts`</sub>

```ts
export interface AgentScope {
  lane: string;                                        // what THIS agent covers
  others: Array<{ label: string; covers: string }>;    // who owns the other lanes
}
```
<sub>signature, from `looprun`</sub>

`scope` renders a `## Scope precedence` block above the core rules — an out-of-lane request gets
redirected by name instead of attempted badly. Two constraints, both learned the hard way:

- **`others[].label` names the owning team, never this agent's own role.** First-person role text
  there collides with the self-narration checks and turns an honest redirect into an abstention stub.
- **Scope is declared on the spec, at design time.** It is not derived at run time from a guess
  about the message — see chapter 01 §5.

`scope` is optional, and it is all-or-nothing: omit it and no `## Scope precedence` block is
rendered — including the `lane` sentence. If you want the lane but have no other teams to name, pass
`others: []`; the block still renders.

---

## 4. `TerminalPolicy` — when asking is not an option

```ts
type TerminalPolicy = (world: AgentWorld) => boolean;   // true ⇒ force reply-only this turn
```
<sub>signature, from `looprun`</sub>

```ts
export const EMPTY_CALENDAR_IS_REPLY_ONLY: TerminalPolicy = (world) => (world as SchedulerWorld).snapshot().length === 0;
```
<sub>excerpt · `snippets/03-agent-anatomy.ts` — the `as SchedulerWorld` cast is explained in §7</sub>

It is evaluated per turn, from state — which is what makes it a *policy* and not a flag. Returning
`true` adds exactly one line to the turn protocol the model reads, and that line is the whole of
what reply-only means:

```
   - NEVER ask the user a question — never declare an `ask` intention. When something is
     ambiguous, make the MOST REASONABLE assumption and PROCEED.
```

Reach for it on a **read surface** — a status desk, a digest, a lookup agent — where a question is a
stall rather than a step, because nothing the answer unlocks is on the tool surface anyway.

### It cannot share a spec with a destructive tool

`AgentSpecBase`'s constructor refuses the combination outright. This class compiles; constructing it
throws:

```ts
class ReplyOnlyCanceller extends AgentSpecBase {
  constructor() {
    super({
      id: 'canceller',
      mode: 'CALENDAR',
      persona: 'You are the calendar canceller.',
      tools: ['listEvents', 'cancelEvent'],
      destructiveTools: ['cancelEvent'],
      terminal: EMPTY_CALENDAR_IS_REPLY_ONLY,
    });
  }
}
```
<sub>excerpt · `snippets/03-agent-anatomy.ts`</sub>

```
   AgentSpec "canceller": a reply-only terminal policy cannot be combined with destructive
   tools (cancelEvent). Reply-only forbids the model from asking, and the consent guards
   require an ask before a destructive act. Drop the policy, or move the destructive tools
   to a spec that may ask.
```
<sub>the message `new ReplyOnlyCanceller()` throws — asserted in `snippets/test/scheduler.test.ts`</sub>

The two fields give the same turn contradictory orders, and the contradiction is a property of the
**spec**, not of any world — so it is decided once, at load:

| the spec declares | what it demands of one turn |
|---|---|
| `terminal` returns `true` | never declare an `ask` |
| `destructiveTools` ⇒ `confirmFirst` (its ask arm) | an `ask` in an earlier turn licenses the destructive act |
| a probe that came back `requiresConfirmation` ⇒ `pendingConfirmMustAsk` | the delivered reply must declare an `ask` |

Neither runtime escape is survivable: suppress the guard and consent is dropped; suppress the policy
and the turn delivers the very question the policy exists to prevent. Refusing at construction is the
only outcome that loses nothing.

### The remedy is to split the agent

The scheduler owns `cancelEvent`, so it keeps its ask and carries no policy. The read surface becomes
its own agent, and *that* one holds the policy:

```ts
export class CalendarDigestSpec extends AgentSpecBase {
  constructor() {
    super({
      id: 'calendar-digest',
      mode: 'CALENDAR',
      persona: 'You are the calendar digest: you report what is on this person’s calendar and never change it.',
      tools: ['listEvents'],
      terminal: EMPTY_CALENDAR_IS_REPLY_ONLY,
      contract: SCHEDULER_CONTRACT,
      behavior: ['Report the calendar as it came back — an empty day is reported as free, never filled in.'],
    });
  }
}
```
<sub>excerpt · `snippets/03-agent-anatomy.ts`</sub>

```
   calendar-digest    listEvents                        terminal: reply-only    ── never asks
   scheduler          listEvents · addEvent ·           no terminal policy      ── asks, and must
                      cancelEvent (destructive)                                    for the cancel
```

Both share `SCHEDULER_CONTRACT`, so the two agents open with a byte-identical prompt prefix (§5) and
the split costs nothing at the seam. The rule generalises: **a spec that may not ask keeps only the
tools that never need consent.**

---

## 5. `DomainContract` — what every agent of the domain shares

```ts
export const SCHEDULER_CONTRACT: DomainContract = {
  voice: 'You keep one person’s calendar. Be brief, concrete, and name events by their label and time.',
  stateBlock: (world) => `Calendar: ${(world as SchedulerWorld).snapshot().length} event(s). Now: ${REFERENCE_NOW} (Monday).`,
  coreInvariants: [
    'Only report what the calendar tools actually returned — never an event, time or id you did not read.',
    'Times are written as `YYYY-MM-DDTHH:mm`; a day without a resolvable time is a question, not a booking.',
  ],
  languageClause: 'Always reply in the language the user wrote in.',
  // The honesty switch: naming the tools that MUTATE the calendar auto-installs the cross-check
  // pair (chapter 04 §3). `listEvents` is a read and is deliberately absent.
  writeTools: ['addEvent', 'cancelEvent'],
};
```
<sub>excerpt · `snippets/scheduler/contract.ts`</sub>

One contract, N agents. It opens every agent's prompt **byte-identically**, which is the point:

```
   ┌───────────────────────── SYSTEM PROMPT ──────────────────────────┐
   │  domain.voice                        ┐ from the DOMAIN CONTRACT  │
   │  ## Scope precedence                 │ (spec.scope)              │
   │  ## Core rules (NEVER violate)       ┘ domain.coreInvariants     │
   │  ## Flow                               spec.flow, if declared    │
   │  ## Tool rules / ## Reply rules …      every guard's prose()     │
   │  ## Governance                                                    │
   │  ## Behavior                           persona FIRST, then       │
   │                                        spec.behavior            │
   │  domain.languageClause                 the LAST line            │
   └───────────────────────────────────────────────────────────────────┘
        ▲                          ▲
        │ byte-identical across    │ where this agent starts to differ —
        │ every agent of the       │ as LATE as possible, so the shared
        │ domain                   │ prefix stays maximal and cacheable

   ┌───────────────────── USER MESSAGE (the tail) ─────────────────────┐
   │  stateBlock(world)   ← volatile. NEVER in the system prompt, or   │
   │                        the cacheable prefix changes every turn    │
   │                        and the cache never hits                   │
   └───────────────────────────────────────────────────────────────────┘
```

Two positions are load-bearing and easy to get backwards: **`## Scope precedence` renders *above*
`## Core rules`** (position is the measured lever — §3), and **`languageClause` is last**, after the
behavior list.

| field | note |
|---|---|
| `voice` | the domain's tone. Case-invariant — no world state, or the prefix stops being stable |
| `stateBlock(world)` | the volatile block, rendered onto the **user-message tail**. This is where the model learns what is currently true |
| `coreInvariants` | domain-wide rules rendered verbatim into every agent. Nothing agent-specific belongs here — that is what `scope` and the guards' own prose are for |
| `languageClause` | the absolute output-language rule |
| `exhaustionReply?` | optional: the deterministic closing SENTENCE committed when a reply still violates its checks after every correction. It must be a pure function of verified observations — structurally unable to fabricate. It supplies the sentence only: the engine always prepends the operation record it derived from the ledger |
| `writeTools?` | **the honesty switch.** The tools that MUTATE the world, as opposed to pure reads. Naming them auto-installs the cross-check pair `claimIsGrounded` + `claimIsComplete` (chapter 04 §3): a declared action the ledger cannot match is denied, and an effected write no intention covers is denied. Leave it out and there is no cross-check at all — and nothing tells you |
| `outcomes?` | optional: the domain's outcome vocabulary, mapping each non-core word an agent may declare onto one of the seven core outcomes (`{ settled: 'success' }`). The domain adds words; it never adds a way around the ledger |
| `renderClaim?` | optional: the domain's wording (and language) for ONE verified claim LINE in the engine-rendered operation record. It receives the VERIFIED fields only — never the agent-authored `op`. Absent ⇒ a neutral English default naming the claim's `target`. The record's closing sentence is engine-owned and has no seam |

`stateBlock` is also the first place you will meet the cast in §7. Note the seed: `REFERENCE_NOW` is
a fixed clock constant, because a tutorial world that reads `Date.now()` cannot be replayed.

---

## 6. `ToolDef` — the surface the model sees

```ts
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;   // JSON schema
}
```
<sub>signature, from `looprun`</sub>

```ts
/** Read-only — chapter 02's one-tool cut of the scheduler. */
export const listEventsTool: ToolDef = {
  name: 'listEvents',
  description: 'List the events on the calendar, soonest first.',
  inputSchema: { type: 'object', properties: {}, required: [] },
};
```
<sub>excerpt · `snippets/scheduler/tools.ts`</sub>

A `ToolDef` is *declaration only*. It never executes anything: the runtime hands these schemas to the
model and routes every accepted call to `world.exec(name, args)`. That separation is what lets the
identical spec run against a fake world in an eval and a real one in production.

The destructive one is worth reading closely:

```ts
/** Destructive: `confirmed` is the flag the auto-installed `confirmFirst` gate waits for. */
export const cancelEventTool: ToolDef = {
  name: 'cancelEvent',
  description: 'Cancel an event. Call it without `confirmed` first to ask the user; then again in a LATER turn, after the user answers, with `confirmed: true`.',
  inputSchema: {
    type: 'object',
    properties: { eventId: { type: 'string' }, confirmed: { type: 'boolean' } },
    required: ['eventId'],
  },
};
```
<sub>excerpt · `snippets/scheduler/tools.ts`</sub>

Declaring `destructiveTools: ['cancelEvent']` installs a protocol the tool must be able to honour:
"confirm first, act in a **later** turn, with `confirmed: true`". A tool with no `confirmed` in its
schema cannot — so the model asks forever.

**Where that is caught, precisely.** The spec exposes the cross-check as
`assertDestructiveConfirmable(toolDefs)`, and today exactly one caller runs it: chapter 05's scripted
runner, `runSpecConversation`, which throws at run start naming the tool and the three ways out.
`new LoopRunAgent({…})` does **not** call it — so a flag-less destructive tool constructs happily and
fails as an ask-forever loop at run time instead. Until that changes, treat "the eval runs" as the
gate for this particular mistake, and put the flag in the schema when you declare the tool.

Keep the schema and the rules in one source. The scheduler's date-time pattern lives once, in
`contract.ts`, and is read by three consumers: the tool schema the model sees, the argument guards,
and the world's own validation.

---

## 7. `AgentWorld` — state, plus the code that runs a tool

```ts
export interface AgentWorld {
  exec(name: string, args: Record<string, unknown>): Promise<unknown> | unknown;
  advanceTurn(): void;
  ingestAttachment(url: string): string;
  toolCalls: Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }>;
  sseActions: unknown[];
  [k: string]: any;
}
```
<sub>signature, from `looprun`</sub>

**Hand-writing one is the default and the certified path.** It is a plain class; there is no base to
extend and no framework to satisfy:

```ts
export class SchedulerWorld implements AgentWorld {
  toolCalls: Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }> = [];
  sseActions: unknown[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;

  private events: CalendarEvent[];
  private nextId = 103;
```
<sub>excerpt · `snippets/scheduler/world.ts`</sub>

| member | what it owes you |
|---|---|
| `exec(name, args)` | run the tool, return a result object. The scheduler's shape is `{ success, … }` — an honest failure is a returned `{ success: false, error }`, not a thrown exception. A guard's veto is a *different*, tagged envelope (chapter 01 §4) precisely so the model can tell your refusal from looprun's |
| `advanceTurn()` | roll any per-turn state at the turn boundary. The scheduler has none, so it is empty — and says so |
| `ingestAttachment(url)` | hand back whatever identifier the tools should see. No attachment store here, so the url passes through |
| `toolCalls` | the record the runtime reads. `tookEffect` distinguishes a write that landed from a pure read or a refused write |
| your own accessors | `snapshot()`, `hasEvent()`, `clashesWith()` — the state reads a stateful rule needs. Add them here rather than declaring a second world per chapter |

The world is also where determinism is bought: no clock, no randomness, no network, no I/O. The
same case against the same world gives the same tool results on every replay, forever — which is
what makes a failing eval case reproducible and a fix verifiable.

### ⚠ The `[k: string]: any` index signature — forced, and it costs you

That line is part of the `AgentWorld` **interface**, not a shortcut in the scheduler: the world is
*your* domain object, and the runtime cannot know accessor names it has never seen. The price is that
**a typo typechecks**, so read world state through a type, never off the bare `AgentWorld`:

```ts
/** The cost of `AgentWorld`'s `[k: string]: any`, demonstrated: BOTH of these typecheck. */
export function indexSignatureCost(world: AgentWorld): void {
  world.clashesWith('2026-03-02T10:00', '2026-03-02T11:00'); // CalendarEvent[]
  world.clashesWiht('2026-03-02T10:00', '2026-03-02T11:00'); // any — compiles, then crashes at run time
}

/** Nominal — you own the class, so name it. Strongest types, hardest coupling. */
export const clashesNominal = (world: AgentWorld, start: string, end: string): CalendarEvent[] =>
  (world as SchedulerWorld).clashesWith(start, end);
```
<sub>excerpt · `snippets/03-agent-anatomy.ts` — in the CI-typechecked file, typo and all</sub>

When the reader must work across several world implementations, name only the accessor instead — and
write it as an **intersection**, because a bare `{ clashesWith… }` is not a legal cast target from
`AgentWorld` (TS2352, the two types do not overlap enough):

```ts
type ClashReader = AgentWorld & { clashesWith(start: string, end: string): readonly CalendarEvent[] };

export const clashesStructural = (world: AgentWorld, start: string, end: string): readonly CalendarEvent[] =>
  (world as ClashReader).clashesWith(start, end);
```
<sub>excerpt · `snippets/03-agent-anatomy.ts`</sub>

Neither cast is *checked* — the index signature makes both compile. What they buy is that the
accessor name and its shape are written down once, somewhere a refactor will visit.

---

## 8. Binding a rule to a moment: `Hook`, `ToolTarget`, `addGuard`

Chapter 04 is the catalog of rules — every factory there returns a `Guard`, which chapter 04 also
teaches. This is the socket all of them plug into:

```ts
addGuard(hook: Hook, target: ToolTarget, guard: Guard, opts?: { id?: string }): string
```
<sub>signature — a method of `AgentSpecBase`. `Guard` is a chapter 04 symbol. `opts` also accepts a
`layer` field, elided here: it selects the framework's own install tiers, and authored guards always
want the default</sub>

```ts
type Hook       = 'onInput' | 'preTool' | 'postTool' | 'onReply';
type ToolTarget = 'any' | string[];
```
<sub>signatures, from `looprun`</sub>

**`Hook` — when it fires, and therefore what it can see:**

```
   onInput    before the model runs        deny ⇒ the turn is refused, no LLM call at all
              sees the real incoming user text
   preTool    a call has been proposed     deny ⇒ the correction returns AS the tool result, in
              and not yet executed               the governance envelope { success:false,
                                                 source:'governance', guard, correction, error };
                                                 the model retries in the SAME generation
   postTool   the call has executed        sees the result; feeds the verified ledger
   onReply    the reply exists             deny ⇒ bounded no-tools re-generation, then the
                                                  deterministic honest closure
```

The hook decides which fields a rule can read, so it also decides which rules are *legal* there.
`addGuard` enforces the matrix at construction and **throws** on a mismatch — a reply-honesty rule
installed on `preTool` would read an undefined reply and silently never fire, which is worse than
having no rule at all, because it still reads as coverage in the spec and in the prompt.

Every hook sees the WHOLE conversation. `GuardCtx` carries `userText` (the current turn's incoming
message, verbatim — `onInput` reads the real input, not an empty stub) and `history` (every prior turn,
read-only). A guard is deterministic code, so it may read the user's words freely — "talking your way
past it" is not a failure mode here. Two laws bound that: never scope tools by what the user said
(intent-based routing is banned), and never pattern-match text in a guard param (the no-regex law); a
rule that genuinely needs to judge conversation text is an `llmCheck` (chapter 04).

**`ToolTarget` — which tools it applies to:** an array of tool names, or `'any'`. It has a second
job most people meet by accident: it decides where the rule's prose is *printed*. Naming tools files
the prose under `## Tool rules`, grouped per tool; `'any'` files it under `## Global tool rules`,
`## Input rules` or `## Reply rules` depending on the hook. On `onInput`/`onReply` the target is
ignored by the check but not by the renderer — so use `'any'` there unless that section is genuinely
where you want the text.

Here is "never double-book", bound:

```ts
    // Shape first: the clash check below compares date-time STRINGS, so it is only meaningful on
    // well-formed input — "next Tuesday" would compare as garbage and slip straight past it.
    this.addGuard('preTool', ['addEvent'], argRequired('label'), { id: 'agent:labelRequired' });
    this.addGuard('preTool', ['addEvent'], argFormat('start', DATETIME_PATTERN), { id: 'agent:startFormat' });
    this.addGuard('preTool', ['addEvent'], argFormat('end', DATETIME_PATTERN), { id: 'agent:endFormat' });
```
<sub>excerpt · `snippets/scheduler/spec.ts` — `argRequired` and `argFormat` are chapter 04 rows</sub>

Then the state gate, written by hand because no catalog row knows what a calendar clash is:

```ts
    this.addGuard(
      'preTool',
      ['addEvent'],
      custom({
        kind: 'noDoubleBook',
        dim: 'run',
        check: (ctx) => {
          const clashes = (ctx.world as SchedulerWorld).clashesWith(String(ctx.args.start ?? ''), String(ctx.args.end ?? ''));
          return clashes.length
            ? `That window clashes with "${clashes[0]!.label}" (${clashes[0]!.id}) — do not book it. Name the clash and ask what to do.`
            : null;
        },
        prose: () => 'a window that clashes with an existing event is never booked — name the clashing event and ask how to proceed',
      }),
      { id: 'agent:noDoubleBook' },
    );
```
<sub>excerpt · `snippets/scheduler/spec.ts` — `custom` is chapter 04's escape hatch</sub>

Three things to take from that even before chapter 04 explains the API:

1. **Order matters.** The shape guards run first, because the clash check compares date-time
   *strings* lexicographically. Hand it `"next Tuesday"` and it compares garbage and admits the call.
2. **The `check()` returns the correction text**, or `null` to allow. That string reaches the model
   inside the **governance veto envelope**, which is deliberately *not* the same shape as a world
   refusal (chapter 01 §4) — so it is written as an instruction, not as a log line.
3. **`prose()` is the same rule for the prompt**, and it is what appears under `## Tool rules` for
   `addEvent`. Two renderings, one object (chapter 01 §3).

And the other obligation, *never delete without asking*, appears nowhere in the constructor:

```
   never double-book         → the three argument guards + the custom clash gate, above
   never delete without ask  → destructiveTools: ['cancelEvent']
                               ⇒ AgentSpecBase installs confirmFirst + destructiveThrottle
```

The scheduler's smoke test exercises the **world's** half of that protocol — the unconfirmed call is
a side-effect-free probe, the confirmed one deletes. It does **not** exercise the `confirmFirst`
guard: the guard's real requirement is that the probe landed in a strictly *earlier* turn, and that
lives in the runtime's ledger across turns. Proving the guard needs a run, which is chapter 05.

---

## 9. `validateSpec` — fail fast on an incoherent spec

```ts
function validateSpec(spec: AgentSpec): SpecWarning[]
```
<sub>signature, from `looprun`</sub>

Each warning is a `{ code, message }` pair; the codes are `tool-surface-over-15`, `empty-behavior`,
`duplicate-tools` and `flow-tool-missing`. It returns them rather than throwing, because a warning is advisory in a dev loop and fatal in a
deployment — and only you know which one you are in. Make it fatal where it should be:

```ts
/** Warnings are advisory by default — make them fatal wherever a broken spec must not start. */
export function assertSchedulerCoherent(): void {
  const warnings = validateSpec(schedulerSpec);
  if (warnings.length) {
    throw new Error(`spec "${schedulerSpec.id}" is incoherent:\n${warnings.map((w) => `  ${w.code}: ${w.message}`).join('\n')}`);
  }
}
```
<sub>excerpt · `snippets/03-agent-anatomy.ts`</sub>

The cheapest place to run it is a test — the scheduler's own asserts `validateSpec(schedulerSpec)` is
empty *and* that the `ToolDef[]` names match `spec.surface.tools` exactly, which catches the drift
where a tool is declared in one file and forgotten in the other. `LoopRunAgent` also runs it at
construction: it warns by default, and its `strict` option turns those warnings into a throw.

---

## 10. The other path, in one paragraph

Everything above is **Path A**: JSON-schema `toolDefs` executed through a world you hand-write — the
certified path, and the one to reach for. A second path exists for tools that execute *themselves*
(Mastra assigned tools, toolsets, MCP servers): there is no world to write, and
`worldFromTools({ stateView })` supplies the state reads instead. Guards enforce identically either
way. **[Chapter 06](06-advanced.md) teaches it**, because it is a deployment question — it presumes a
host that already owns its state.

---

## 11. Recap

```
   AgentSpec        the structural type            ─┐
   AgentSpecBase    the class you extend            ├─ the MAP
   AgentSpecConfig  its constructor argument       ─┘
   AgentScope       the lane, and who owns the rest
   TerminalPolicy   (world) => boolean — reply-only this turn; refused beside a
                    destructive tool, so it belongs on a read-surface spec
   DomainContract   voice · stateBlock · coreInvariants · languageClause
                    · writeTools (installs the honesty cross-check) · outcomes · renderClaim
   ToolDef          the JSON-schema surface the model sees
   AgentWorld       state + execution — hand-write it (mind the index signature)
   Hook             onInput | preTool | postTool | onReply    ─┐ addGuard's
   ToolTarget       'any' | string[]                          ─┘ first two arguments
   validateSpec     warnings, made fatal where they should be
```

You now have a spec, a world and a surface — and exactly one hand-written rule. Chapter 04 is the
catalog of the rest: every guard, what it prevents, one minimal example each.

→ **[04 · Guards](04-guards.md)**
