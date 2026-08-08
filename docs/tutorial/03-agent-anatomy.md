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

The box needs no per-tool configuration: the consent route is read off each destructive tool's
declared schema at run start — a schema that carries `simulate` gets the simulation flow, one that
does not is gated on every call and asked about by its own veto. (The config carries no pattern
vocabulary for reply text: a reply-honesty judgment a domain needs is an `llmCheck` rubric you bind
on `onReply`, chapter 04.)

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
| `destructiveTools` | a declaration, not a comment: it *installs* the confirm-first protocol on exactly those tools. A tool here that acts on no identifiable record also needs a `destructiveLabels` entry — the words its confirmation question is built from — or it can raise no question and never runs |
| `destructiveWhen?` | per listed tool whose destructiveness lives in its ARGUMENTS, the predicate that says which calls the protocol applies to (`{ placeHold: (args) => args.scope === 'workspace' }`). The tool stays on the list — that is what installs the protocol and what makes its label legal — and the protective branch runs untouched. A listed tool with no predicate is destructive on every call. A predicate for a tool that is not on the list **throws** at construction |
| `destructiveLabels` | per destructive tool with no record of its own, the human-facing words the engine's confirmation question is built from (`{ emptyBin: 'empty the compost bin' }` → the user replies `CONFIRM EMPTY-THE`). Two labels whose first two words agree derive one token for two acts and **throw** at construction |
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

### It composes with a destructive tool, because the question is not the agent's

Reply-only forbids the AGENT from asking. It does not forbid consent, because the confirmation question
is written and rendered by the ENGINE:

```
   turn 1   agent:   cancelEvent({ id: 'EV-2', simulate: true })   ← reply-only: it asks nothing
            world:   { requiresConfirmation: true, id: 'EV-2' }
            screen:  The 10:00 meeting is on your calendar.

                     To confirm EV-2, reply: CONFIRM EV-2   ← the ENGINE wrote this line

   turn 2   user:    "CONFIRM EV-2"
            agent:   cancelEvent({ id: 'EV-2' })   → the bare acting call, now licensed
```

So a reply-only agent may hold a destructive tool and still take consent for it. What it may not do is
ask a *clarifying* question — which is the thing the policy is actually for.

### Splitting the agent is still usually right

Nothing forces the split, but a read surface and a write surface answer different questions and carry
different risk. The scheduler owns `cancelEvent` and carries no policy; the read surface becomes its own
agent, and *that* one holds it:

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
the split costs nothing at the seam. The guidance generalises: **put the policy where a question would
be a stall, and keep the tools that change things on a surface that can talk about them.**

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
   │  ## Global tool rules / ## Reply …     target:'any' guard prose  │
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
| `exhaustionReply?` | optional: the deterministic closing SENTENCE committed when a reply still violates its checks after every correction. It must be a pure function of verified observations — structurally unable to fabricate. It supplies the sentence only: the engine always prepends the operation record it derived from the action history. Being domain-authored text, it crosses the free-text net below on its way out, exactly as the agent's own prose does |
| `writeTools?` | **the honesty switch.** The tools that MUTATE the world, as opposed to pure reads. Naming them auto-installs the cross-check pair `claimIsGrounded` + `claimIsComplete` (chapter 04 §3): a declared action the action history cannot match is denied, and an effected write no intention covers is denied. Leave it out and there is no cross-check at all — and nothing tells you |
| `guards?` | the contract's TOOL-GUARD declarations, each stated once and installed by every agent whose surface carries its resolved target. A binding names a hook, a target (literal tools or a named set: `'writeTools'` = `contract.writeTools ∩ lane.tools − exempt`, `'destructiveTools'` = `lane.destructiveTools − exempt`), a guard, an id and an optional priority. The domain-wide write gate is the canonical one — a `precondition` on `'writeTools'` at priority `changeAllowed` (id `changeAllowed:precondition`), so no lane can key on a third of the condition while the others key on the rest. `exempt` withdraws names from a named set only — a compliance hold is that shape — and an entry outside the set **throws** at construction. A lane whose resolution comes out empty installs nothing |
| `outcomes?` | optional: the domain's outcome vocabulary, mapping each non-core word an agent may declare onto one of the seven core outcomes (`{ settled: 'success' }`). The domain adds words; it never adds a way around the action history |
| `renderClaim?` | optional: the domain's wording (and language) for ONE verified claim LINE in the engine-rendered operation record. It receives the VERIFIED fields only — never the agent-authored `op`. Absent ⇒ a neutral English default naming the claim's `target` |
| `engineText?` | optional: the ENGINE's own sentences — the record's closing lines and the confirmation question. A conversation held in another language declares them, per key, because the user has to READ the instruction whose token they type back. The token itself is engine-issued and is the same literal in every language |
| `disclose?` | optional: one sentence per destructive tool, printed by the engine directly ABOVE that tool's own consent question — what agreeing to the act would do. `{readTool.path}` slots are filled from the turn's own reads, and the agent writes no part of it. See below |
| `discloseMissing?` | optional: what an unresolved `disclose` slot renders. Default `NA`. The sentence is never dropped and never renders an empty gap, so it has to read correctly with the marker standing in any slot: `settlement: NA`, never `settles at NA` |
| `sensitiveFields?` | optional: the result fields a call may not carry, each mapped to `'omit'` (delete it) or `'mask'` (keep a recognizable stub, `o•••@northside.example`). The keys are dot-suffix paths over result keys: `'customer.phone'` reaches that `phone` at any depth, a bare `'phone'` reaches every one. How far the removal reaches is decided by the seam the tool executes on, not by this declaration — see below |
| `scrubTextFields?` | optional: the free-text fields — dot-suffix over tool ARGUMENT and result keys — whose content is pattern-scrubbed to `•••`. A field that legitimately carries contact data is simply left undeclared, so every acceptance is authored and visible in the contract |

`stateBlock` is also the first place you will meet the cast in §7. Note the seed: `REFERENCE_NOW` is
a fixed clock constant, because a tutorial world that reads `Date.now()` cannot be replayed.

### The three seams that put domain words on the screen

They are told apart by WHEN, not by what they say:

```
disclose      before the act    what agreeing to this would do
renderClaim   after the act     what one verified claim did
engineText    around both       the engine's own sentences, and their language
```

`disclose` is one string per tool, and the engine fills its slots from the records the turn read:

```ts
  disclose: {
    cancelBooking: 'Cancelling {getBooking.booking.id} releases the room and forfeits the '
                 + '{getBooking.booking.deposit} deposit.',
  },
```

```
getBooking({id:'BK-1'}) → { booking: { id: 'BK-1', deposit: '80.00' } }

  Cancelling BK-1 releases the room and forfeits the 80.00 deposit.
  To confirm BK-1, reply: CONFIRM BK-1
```

A slot binds to the read whose RESULT names the record the question is about — never simply to the
latest call of that read, because one read tool commonly answers about two records in a turn:

```
the act is updateMemberRole(mem_1004 → owner)

  getMember({memberId:'mem_1004'})  → Sam Whitfield      the person being promoted
  getMember({})                     → Dana Okafor        the acting user

  subject-bound   "Promoting Sam Whitfield to owner…"    what the user is being asked
```

A slot that resolves to nothing renders `discloseMissing`. A slot naming a field no result ever
carries is a different thing — an authoring typo — and `looprun-eval validate` fails on it offline
(chapter 05 §5.1).

### The two filters — the executor is never trusted

`sensitiveFields` and `scrubTextFields` are enforced on **looprun's** side of the tool boundary, not
inside your tool. A tool that promises to hide a field is a promise nothing checks; the filter runs
where the value crosses into the runtime, so one declaration binds a world you wrote, a native tool
that executed itself and an MCP server you do not own (chapter 06 §3).

**What that buys is not the same on both seams, and the difference is worth knowing before you rely
on it.** Arguments are identical either way: the scrub rewrites the object the executor is about to
receive, so the raw value never leaves the process. Results split:

```
   the WORLD seam            the filter runs inside the tool's own execute — the value that
   (toolDefs + world.exec)   reaches the MODEL is already filtered, and so is the record

   a SELF-EXECUTING tool     its execute returns straight to the model runtime, and no engine
   (native, MCP)             code sits in that path. The filter reaches the ACTION HISTORY and
                             therefore everything built from it — the operation record, the
                             closure, the judge envelope, the sealed turn. That one result, as
                             the model reads it, is the tool's own
```

So on a self-executing surface the declaration governs what is **recorded, delivered and judged**,
not what the model momentarily saw. A field that must never reach the model at all belongs behind a
tool you own — Path A of chapter 06 §3 — which is the certified path for exactly this reason.

They answer two different questions:

```
   sensitiveFields    a field you NAMED on purpose        phone, ssn, cardNumber
                      omitted or masked whole, whatever value it holds

   scrubTextFields    a field whose purpose is PROSE      notes, description
                      the field stays; contact data INSIDE it is replaced
```

```
   contract   sensitiveFields: { 'customer.phone': 'omit' }
              scrubTextFields: ['getClaim.notes']

   getClaim returns   { customer: { phone: '555-0199', name: 'Ana' },
                        notes: 'call ops@x.example about +1 415 555 0199' }

   the model reads    { customer: { name: 'Ana' },
                        notes: 'call ••• about •••' }
```

**They do not share a path grammar, and nothing tells you when you mix them up.** A
`scrubTextFields` entry may open with the TOOL's name — `'getClaim.notes'` — because that walk starts
at the call. A `sensitiveFields` key may not: its walk starts at the result itself, so
`'getCustomer.phone': 'omit'` matches nothing and the phone ships in full; the key that removes it is
`'customer.phone'`, or the bare `'phone'`.

The scrub catches **well-formed classes only**: email addresses, Luhn-valid card numbers, and
conservative phone shapes (a leading country code, or three or more separator-joined digit groups —
so an invoice total or an ISO date is never mistaken for one). **Names and street addresses are the
stated residue.** No pattern here claims to catch them; a domain that must not disclose a name names
the field in `sensitiveFields` instead.

On the way out, the free-text net runs over the **model-authored prose and nothing else** — an email
the user typed and the reply repeated back, a number the model carried out of a result it read.
Declaring `scrubTextFields` at all is what switches it on: the delivery net is not per-field, because
the reply is one string and the drift it catches has no field name. The
engine's own blocks are already composed from the filtered record and go out verbatim, which is not a
nicety: a record id can be shaped exactly like a phone number, and the confirmation token is matched
against the literal the question stored.

```
   whole delivery scrubbed   To confirm •••, reply: CONFIRM •••     ← the act can never be confirmed
   engine blocks verbatim    To confirm 2026-0801-77, reply: CONFIRM 2026-0801-77
```

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
/** Destructive: `simulate: true` asks; the bare call acts, gated on the user's typed code. */
export const cancelEventTool: ToolDef = {
  name: 'cancelEvent',
  description: 'Cancel an event. Call it with `simulate: true` first to see what it does and ask the user; run the bare call only in a LATER turn, after their message carries the confirmation code.',
  inputSchema: {
    type: 'object',
    properties: { eventId: { type: 'string' }, simulate: { type: 'boolean' } },
    required: ['eventId'],
  },
};
```
<sub>excerpt · `snippets/scheduler/tools.ts`</sub>

Declaring `destructiveTools: ['cancelEvent']` installs the protocol: a destructive call that is not a
schema-licensed simulation runs only on the code the user typed. The `simulate` parameter is the
upgrade, not the requirement — a tool whose schema has none is simply gated on every call, and its
denial is what raises the question. What the schema buys is validation before consent: the user
confirms knowing what the act does, and is never asked to authorise something that would fail.

**The protocol binds the destructive BRANCH, not the tool name.** Some tools are destructive only on
some of their calls — a hold over one asset protects it, the same hold over a whole workspace freezes
everyone's work. That tool stays on `destructiveTools` (which is what installs the protocol and what
makes its `destructiveLabels` entry legal) and declares which calls it applies to:

```ts
destructiveTools: ['placeHold'],
destructiveWhen: { placeHold: (args) => args.scope === 'workspace' },
destructiveLabels: { placeHold: 'freeze the entire workspace' },
```

`placeHold({scope:'asset'})` now runs with nothing asked; `placeHold({scope:'workspace'})` is gated on
the code the user types back, and counts against the one-destructive-act-per-turn cap. The predicate
reads the acting call's own arguments and nothing else — it says what the call IS, never who licensed
it.

**Where the route is decided, precisely.** The spec exposes the detector as
`simulatableToolNames(toolDefs)`, and the backends run it where schemas first exist — run start —
seating the result on the runtime.
`new LoopRunAgent({…})` does **not** call it — so a flag-less destructive tool constructs happily and
fails as a simulation-forever loop at run time instead. Until that changes, treat "the eval runs" as the
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
   postTool   the call has executed        sees the result; feeds the verified action history
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
job most people meet by accident: it decides where the rule's prose is *printed*. Naming tools puts
the prose in each named tool's **own description**, as a bullet under
`RULES YOU MUST FOLLOW TO CALL THIS TOOL`; `'any'` files it in the assembled prompt under
`## Global tool rules`, `## Input rules` or `## Reply rules` depending on the hook. On
`onInput`/`onReply` the target is ignored by the check but not by the renderer — so use `'any'`
there unless the tool description is genuinely where you want the text.

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
3. **`prose()` is the same rule for the model to read**, and because the binding targets `addEvent`
   it lands in `addEvent`'s **own tool description**, as a bullet under the fixed heading
   `RULES YOU MUST FOLLOW TO CALL THIS TOOL` — beside the schema, at the moment of choosing the
   call. (`target: 'any'` prose renders in the assembled prompt instead: `## Global tool rules`,
   `## Input rules`, `## Reply rules`.) Two renderings, one object (chapter 01 §3).

And the other obligation, *never delete without asking*, appears nowhere in the constructor:

```
   never double-book         → the three argument guards + the custom clash gate, above
   never delete without ask  → destructiveTools: ['cancelEvent']
                               ⇒ AgentSpecBase installs confirmFirst + destructiveThrottle
```

The scheduler's smoke test exercises the **world's** half of that protocol — the `simulate: true`
call is a side-effect-free simulation, the bare one deletes. It does **not** exercise the
`confirmFirst` guard: the guard's real requirement is that the question landed in a strictly *earlier*
turn, and that lives in the runtime's action history across turns. Proving the guard needs a run,
which is chapter 05.

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
