# 04 · Guards

**What you get from this chapter:** the complete rule vocabulary — 21 factories, what each one
prevents, one minimal example each — plus the four types they are written in and how to write your
own when nothing fits. Everything here is from `looprun` (≡ `looprun/core`).

> **Code source.** §5 is **generated** from `GUARD_CATALOG` (`packages/core/src/guards/catalog.ts`)
> by `scripts/gen-guards-chapter.mjs`; a parity test keeps that array in bijection with the factories
> `src/guards/` actually exports, and `pnpm docs:guards --check` runs in CI, so a row here cannot
> describe a kind that does not ship. Every §5 example is **compiled**: the same generator emits
> [`snippets/04-guards-examples.generated.ts`](snippets/04-guards-examples.generated.ts), which the
> snippets package typechecks against the published `looprun` facade. The hand-written sections quote
> [`snippets/04-guards.ts`](snippets/04-guards.ts) and `snippets/scheduler/`, typechecked the same
> way. **Signature blocks** are quoted from the library source and are not compiled here.

Chapter 03 left the scheduler with one hand-written rule and two obligations already met:

```
   never double-book         → argRequired + argFormat×2 + a custom clash gate   (§8 of chapter 03)
   never delete without ask  → destructiveTools: ['cancelEvent']
                               ⇒ AgentSpecBase installs confirmFirst + destructiveThrottle
```

This chapter is the rest of the vocabulary:

```
   §1  the four types a guard is written in     Guard · GuardCtx · ObservedCall · Dim
   §2  binding one to a moment                  addGuard — the chapter 03 socket, in one line
   §3  the ones you already have                what AgentSpecBase installs before your code runs
   §4  finding the right one                    symptom → kind, the confusable pairs, canonArgs
   §5  THE CATALOG                              21 factories, grouped by hook — generated
   §5b what ships with every reply              the operation record and the lie check — no guard
   §6  writing your own                         custom, and the five rules a reviewer looks for
```

Read §1–§4 once; §5 is a reference you come back to.

---

## 1. What a guard is — the four types

Every factory in §5 returns one object of the same shape: a deterministic **check** and an
LLM-facing **prose** (chapter 01 §3).

```ts
interface Guard {
  kind: string;                                             // the runtime name, e.g. 'confirmFirst'
  dim: Dim;                                                 // which hooks it is legal on
  check(ctx: GuardCtx): string | null | Promise<string | null>;   // deny text, or null to allow
  prose(): string;                                          // the same rule, for the system prompt
  meta?: { before?: string[]; requiredStrings?: string[] } & Record<string, unknown>;
}
```
<sub>signature, from `looprun`</sub>

**Three names, one rule, and they line up.** The **factory** is what you call (`confirmFirst(…)`);
it returns a **`Guard`** object; that object's **`kind`** is the runtime name (`'confirmFirst'`), and
it is what you read back in a guard id (`base:confirmFirst`) and in a `recoveryEvents` entry
(`run:noDoubleBook:addEvent`). The catalog below is indexed by factory name, so the name you call is
the name you will see in the audit trail — with one deliberate exception, `custom`, whose `kind` you
choose yourself (§6).

Two renderings of one rule, and **the checker never reads the prose**. A guard whose prose says
something its check does not enforce is a rule the model is told about and nothing verifies — the
failure this whole design exists to make impossible.

`check` returns the **correction**, not a log line: that string is what the model reads, so write it
as an instruction ("do not book it — name the clash and ask what to do"). Returning `null` allows.

### `GuardCtx` — everything a check may read

```ts
interface GuardCtx {
  args: Record<string, unknown>;      // the proposed call's arguments      (tool hooks)
  tool?: string;                      // the proposed call's name           (tool hooks)
  world: AgentWorld;                  // your world — read it through a type, never bare
  observed: ObservedCall[];           // every call THIS CONVERSATION, oldest first
  turnIndex: number;                  // which turn is being adjudicated
  userText: string;                   // the current turn's incoming message, verbatim ('' if none)
  history: readonly HistoryTurn[];    // every PRIOR turn, read-only (userText/reply/toolCalls/…)
  reply?: string;                     // the reply text                     (onReply only)
  result?: unknown;                   // the tool's result                  (postTool only)
  producedThisTurn?: string[];
  attachmentsThisTurn?: string[];
  notes?: string[];
  siblingCallsThisStep?: ObservedCall[];   // same-step calls still in flight — destructiveThrottle only
  adjudicator?: Adjudicator;          // host-registered LLM judge — only llmCheck reads it
}
```
<sub>signature, from `looprun` — abridged; the JSDoc on each field is worth reading</sub>

**A guard sees the WHOLE conversation** — `userText` (this turn's incoming message) and `history` (every
prior turn) are right there, and a check may read both: a guard is deterministic code, so "the user can
talk their way past it" does not apply. Two laws bound that freedom. **Never scope tools by intent** — a
guard that turns tools on or off according to what the user asked for is the banned intent-based routing
(a loop law, not a guard law). **Never pattern-match text in a guard parameter** — the no-regex law: no
guard factory takes a `RegExp`. A rule that genuinely needs to JUDGE conversation text is an `llmCheck`
(a trusted rubric answered by a host adjudicator — § below); everything else keys on arguments, world
state and observed calls, because a structural signal is model-independent and cheap.

`world` is typed as `AgentWorld`, whose index signature makes a typo compile (chapter 03 §7), so read
your accessors through a named type — §6 shows the pattern.

### `ObservedCall` — one recorded call

```ts
interface ObservedCall {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;                                          // did the call succeed
  turnIndex: number;                                    // which turn it happened on
  resultFlags?: { requiresConfirmation?: boolean };     // the two-step protocol's probe
  tookEffect?: boolean;                                 // did it MUTATE the world (vs a read)
}
```
<sub>signature, from `looprun`</sub>

Three fields do the heavy lifting across the catalog. `turnIndex` is what makes "in an **earlier**
turn" expressible, which is the whole of `confirmFirst`. `ok` separates a call that happened from one
that succeeded. `tookEffect` separates a write that landed from a pure read or a refused write — it is
what lets `destructiveThrottle` count only actions that MUTATED the world, and what an `llmCheck` reply
rubric keys on so it never faults an honest "I could not find it" on a read-only turn.

One name in `observed` is runtime-owned rather than yours: the terminal `respond` is pushed in with
`ok: true` (its `did` is what makes a turn's `ask` intention visible to a sibling call's checks), so
a check that means "did the model do any work" must filter it out.

### `Dim` — the five enforcement dims, and why they exist

```ts
type Dim = 'spatial' | 'input' | 'run' | 'output' | 'behavior';
```
<sub>signature, from `looprun`</sub>

A dim is a claim about **which `GuardCtx` fields the check reads**, and it is the only thing that
decides which hooks the guard may be installed on:

```
   dim        reads                          legal hooks
   ────────   ────────────────────────────   ──────────────────────────────
   spatial    ctx.tool / ctx.args            onInput · preTool · postTool
   input      ctx.tool / ctx.args            onInput · preTool · postTool
   run        ctx.tool / ctx.args + world    onInput · preTool · postTool
   output     ctx.result                     postTool                        ← only hook that has it
   behavior   ctx.reply                      onReply                         ← only hook that has it
```

You never pass a `dim` for a catalog factory — each one carries its own. You pass one exactly once:
to `custom` (§6). Get it wrong and `addGuard` **throws at construction**, which is the point: a
`behavior` guard installed on `preTool` would read `ctx.reply === undefined`, never fire, and still
print its prose into the prompt — coverage that does not exist.

---

## 2. Binding one: `addGuard`

Chapter 03 §8 teaches the socket; this is the one-line reminder.

```ts
spec.addGuard(hook, target, guard, opts?)      // hook: Hook, target: ToolTarget, guard: Guard
spec.addReplyCheck(guard, opts?)               // ≡ addGuard('onReply', 'any', guard)
spec.addMutator(mutator, opts?)                // for a ReplyMutator — §5's onReplyMutate row
```
<sub>signatures — methods of `AgentSpecBase`</sub>

Every example in §5 is the third argument, and the section it is listed under is the hook it is
**normally** installed on — a convention, not the rule. The rule is §1's dim×hook matrix, which
`addGuard` enforces at construction.

Reach for `addReplyCheck` when you are binding a reply kind and `'any'` is what you want anyway: it
is the same call with the two constant arguments removed, and it keeps a spec's reply block from
being a column of repeated `'onReply', 'any'`.

Give every binding an `id`. It is what a `GuardExecutionError` names when a check throws, what the
eval output attributes a veto to, and what makes a spec diff readable.

---

## 3. Six you never install by hand

`AgentSpecBase`'s constructor installs the universal invariants before your code runs, plus two
CONDITIONAL pairs — each keyed on one field of your spec (chapter 03 §2 and §5):

```
   ALWAYS (2)                       noDuplicateCall   (preTool)
                                    degenerationGuard (onReply)
   IFF destructiveTools (2)         confirmFirst + destructiveThrottle, on exactly those tools
   IFF contract.writeTools (2)      claimIsGrounded + claimIsComplete — the HONESTY CORE
   ─────────────────────────────   all six for the scheduler: it declares `cancelEvent` destructive
                                    and its contract names `addEvent` + `cancelEvent` as writes
```

**The honesty pair is the one people miss.** `claimIsGrounded` and `claimIsComplete` cross-check the
`did` the model declares against what the world ledger actually recorded — a claimed action that never
happened is denied, and an action that happened but was never claimed is denied. They auto-install the
moment `contract.writeTools` is non-empty, and **not at all** if it is missing: a domain that never names
its write tools gets no cross-check, and nothing warns you. Naming them is the switch (chapter 03 §5).

### What a `did` entry may carry

The declaration those two guards read is a closed shape. The `respond` call carries the user-facing
`message` plus `did`, an array of at least one intention, and an intention has **exactly four legal
keys**:

```
   op        what this intention IS — a domain operation, or one of the four speech
             words `inform` · `greet` · `refuse` · `ask`
   target    the record the operation acted on
   outcome   what really happened, on ACTION entries only
   amount    an optional magnitude
```

A fifth key is a validation error, not an ignored extra: the runtime refuses the whole reply and
tells the model which key it could not read. Three rules decide what goes in the four:

| rule | the payload |
|---|---|
| **`target` is required on a completed action**, named the way the tool result named it | `{ op: 'cancelEvent', target: 'evt_102', outcome: 'success' }` — `claimIsComplete` passes over a claim with no `target`, so an action without one covers nothing and the write reads as silent |
| **`success` means a write that took effect.** Every other outcome names what really happened | `{ op: 'addEvent', target: 'Design review', outcome: 'blocked' }` — the clash gate vetoed the call, so `blocked` is the honest word and `claimIsGrounded` matches it against the vetoed attempt |
| **A lookup is not an action.** It changes nothing, so it produces no entry — the answer lives in `message` | *"You have Standup at 10:00 and Dentist on Wednesday at 15:00."* declared as `[{ op: 'inform' }]`. Declaring that read as `outcome: 'success'` is vetoed: no write took effect |

The one exception to the third rule is a search **the user asked for** that came back empty. That is
an answer the user must see, so it is an entry with `outcome: 'not_found'` — and it grounds only when
the read tool took the entity under an identity-key argument, because an absent record issues no
value of its own to match:

```
   user     "Is booking BK-1 still on file?"
   call     getBooking({ bookingId: 'BK-1' })  →  { data: [] }      ← empty, and it names BK-1
   did      [{ op: 'lookup', target: 'BK-1', outcome: 'not_found' }]
```

A read the agent ran for its own benefit — the `listEvents` it needed before booking — is not that
case: nobody asked for it, so it stays out of `did` entirely.

**The blank-reply floor is the runtime's — not a guard's, and not the schema's.** The `respond`
terminal's non-empty `message` is only enforced where the backend validates it, a zero-width message
satisfies `minLength` anyway, and a reply mutator can blank an otherwise-fine delivery AFTER every check
has passed — so no schema constraint can carry this. `finalizeReply` tests every composed delivery for
blankness on its way out and swaps in the engine-derived closure when it is blank. Backend-independent,
and no guard kind involved.

There is also no unconditional reply-honesty kind. A reply-honesty invariant a domain needs beyond the
cross-check is an `llmCheck` you bind yourself (§5's `llmCheck` row), never something the base spec
installs on your behalf.

They have catalog rows in §5 because they are real kinds you must be able to read — **not** because
you should call them. Re-adding one by hand renders the same rule twice in the prompt, from two
sources that will drift.

---

## 4. Finding the right one

### Start from the symptom

You almost never shop the catalog top to bottom. You have a trace where the model did something, and
you want the kind that makes that impossible. Read this column as "the model …":

| the model … | reach for | which is on |
|---|---|---|
| acts destructively without the user having confirmed | [`confirmFirst`](#10-confirmfirst) (auto-installed by `destructiveTools`) | preTool |
| chains two destructive calls in one turn | [`destructiveThrottle`](#11-destructivethrottle) | preTool |
| makes the same call again, hoping for a different answer | [`noDuplicateCall`](#4-noduplicatecall) | preTool |
| calls a legitimate tool too many times — sweeps, repeat contact | [`maxCalls`](#3-maxcalls) | preTool |
| runs a step before the one it depends on | [`requiresBefore`](#1-requiresbefore) | preTool |
| acts while the world says it must not (closed account, no consent on record) | [`precondition`](#8-precondition) · [`consentRequired`](#9-consentrequired) | preTool |
| fills a field in on the user's behalf with a value they never said | [`valueFromUser`](#12-valuefromuser) | preTool |
| summarises an empty or partial result as if it satisfied the request | [`resultInvariant`](#14-resultinvariant) | postTool |
| claims a tool's work is done when it is not · apologises for a failure on a turn where the work went through · promises an off-surface handoff · discloses a personal/regulated field the tools do not ground · obeys an instruction that came back INSIDE a tool result | [`llmCheck`](#20-llmcheck) — text judgment is one single kind: a trusted rubric answered by a host adjudicator | onReply / preTool |
| reports an operation the ledger does not show, or leaves a real action unreported, or names the wrong outcome polarity for a record | [`claimIsGrounded`](#16-claimisgrounded) · [`claimIsComplete`](#17-claimiscomplete) · [`claimCoversRubric`](#18-claimcoversrubric) | onReply |
| leaks think-blocks or repeats the same line five times | [`degenerationGuard`](#19-degenerationguard) (auto-installed) | onReply |
| writes internal status codes and field names at the user | [`jargonScrub`](#21-jargonscrub) — rewrites, never vetoes | onReplyMutate |
| breaks a rule that is about YOUR domain and nothing in this table fits | [`custom`](#22-custom) (§6) | you choose |

### The four confusable clusters

Every row's *when to reach for it* is written against its neighbours. These are the four groups where
reading only one row will pick the wrong kind:

| cluster | the axis that separates them |
|---|---|
| `requiresBefore` · `precondition` | which call came first, vs what state the world is in |
| `forbidThisTurn` · `noDuplicateCall` | the first call is illegitimate, vs only the repeat is |
| `confirmFirst` · `consentRequired` | the user typed the engine's confirmation token · a standing flag in the WORLD |
| `claimIsGrounded` · `claimIsComplete` · `claimCoversRubric` | every claim matches the ledger · every effected write is claimed · a per-case target appears with the required outcome polarity |

**Text judgment is one kind, not a cluster.** There is no family of reply-text kinds to pick between:
every rule of the form "the reply lied" — invented success, a false failure, an off-surface claim, an
ungrounded regulated figure — is ONE `llmCheck` rubric ("does the reply claim an action the tools did
not actually complete this turn?"), answered by a host adjudicator over the full context. No guard
factory takes a `RegExp`, so a reply-honesty rule is never a pattern you tune. The structural honesty
signals are their own kinds (`resultInvariant` on the tool result, `destructiveThrottle`/`confirmFirst`
on the call), and the ledger cross-check is `claimIsGrounded`/`claimIsComplete`.

### `canonArgs` — the fingerprint `noDuplicateCall` compares

It is exported and public, but it is a helper, not a factory: it returns a `string`, not a `Guard`,
so it has no catalog row.

```ts
function canonArgs(v: unknown): string      // key-order-independent canonical fingerprint
```
<sub>signature, from `looprun`</sub>

`noDuplicateCall` does not compare argument objects — it compares `canonArgs(args)`, so key order is
not identity and a re-ordered retry is still the same call:

```ts
/** Key order is not identity: to `noDuplicateCall`, both of these are the SAME call. */
export const sameCallFingerprint =
  canonArgs({ start: '2026-03-02T10:00', label: 'Standup' }) === canonArgs({ label: 'Standup', start: '2026-03-02T10:00' });

/** …and a different VALUE is a different call, so a corrected retry is never denied as a repeat. */
export const differentCallFingerprint =
  canonArgs({ label: 'Standup' }) !== canonArgs({ label: 'Stand-up' });
```
<sub>excerpt · `snippets/04-guards.ts`</sub>

**`maxCalls` deliberately does not use it.** It counts successful calls by TOOL NAME within its
scope, arguments ignored — which is what you want from a budget:

```
   noDuplicateCall   keyed on (tool, canonArgs(args))   a rephrased retry is a DIFFERENT call → allowed
   maxCalls          keyed on (tool)                    a rephrased retry is the same tool    → still burns budget
```

So the two are complementary rather than redundant: the escape hatch out of one is closed by the
other. Reach for `canonArgs` directly when a `custom` guard of yours needs to decide whether two
calls are "the same" — using the same fingerprint means your rule and `noDuplicateCall` cannot
disagree about it.

---

<!-- BEGIN GENERATED: guard catalog — `node scripts/gen-guards-chapter.mjs` -->

<!-- Rendered from `packages/core/src/guards/catalog.ts`. Do NOT edit between the markers: run
     `pnpm docs:guards` (it needs a built core), and fix wording in the catalog itself. -->

## 5. The catalog — 21 factories

Grouped by the hook each one is installed on, because the hook decides what a rule can see and
therefore what it can enforce (chapter 03 §8). 12 preTool · 1 postTool · 6 onReply · 1 onReplyMutate · 1 escape hatch.

A fourth hook exists and has no section here: `onInput` fires before the model runs, and §1's
matrix makes it legal for every `spatial`/`input`/`run` guard — but no shipped kind is installed
there, because a rule that can refuse the whole turn before a call is even proposed is a domain
decision, not a default. `custom` is how you reach it.

### The consent story — a token the engine issues and the user types back

Ask-before-you-act is not a thing your agent declares. It is a literal the ENGINE writes onto the user's
screen and the USER writes back:

```
   ①  the world raises it   your tool answers requiresConfirmation and NAMES its record
   ②  or the denial does    a tool with no preview form is denied, and the denial raises the question
                            from the label your spec declared
   ③  the engine renders    the question lands in the delivered text, between the agent prose and the
                            operation record
   ④  the user answers      their next message either carries the token or does not
   ⑤  confirmFirst allows   the act runs iff a consumed question is about THIS call
```

The whole turn:

```
turn 1   agent:   cancelBooking({ id: 'BK-1' })
         world:   { requiresConfirmation: true, id: 'BK-1' }
         screen:  Your booking BK-1 carries an 80.00 fee.

                  To confirm BK-1, reply: CONFIRM BK-1

                  No operation was carried out on this turn.

turn 2   user:    "yes, CONFIRM BK-1"
         agent:   cancelBooking({ id: 'BK-1', confirmed: true })   → allowed
```

`"go ahead"` is a human yes and is **denied** — the question is simply asked again. That is deliberate:
consent fails closed, because the alternative is a model deciding what a person meant.

**What you owe the engine.** A two-step tool returns `requiresConfirmation` and names its record under
an identity key. A tool that acts on no identifiable record declares `destructiveLabels` — the words the
question is built from — and without one it can raise no question, so it never runs. A conversation in
another language declares `engineText`, because the user has to be able to READ the instruction they are
being asked to type back.

**`valueFromUser` is the sibling, one moment earlier.** Consent is about an ACT; `valueFromUser` is about
a VALUE your agent fills in on the user's behalf. It allows only what the person actually said, compared
as whole words — so an invented value is denied, and so is a paraphrase of a real one.

### `preTool` — before the call runs

A call has been proposed and not yet executed. A deny returns to the model AS the tool result, in the governance envelope, and the model retries inside the same generation — so the correction text is written as an instruction. Nothing has happened to the world yet, which is why every gate that must PREVENT something lives here.

| factory | file | what it enforces |
|---|---|---|
| [`requiresBefore`](#1-requiresbefore) | `flow.ts` | A tool may run only after every named dependency has already run successfully this conversation. |
| [`forbidThisTurn`](#2-forbidthisturn) | `flow.ts` | An unconditional deny of the bound tool while the binding is installed — the first call is denied too. |
| [`maxCalls`](#3-maxcalls) | `flow.ts` | A tool may succeed at most n times per turn (default) or per conversation. |
| [`noDuplicateCall`](#4-noduplicatecall) | `flow.ts` | Denies a call whose tool and canonical arguments already succeeded earlier in the same turn. |
| [`argRequired`](#5-argrequired) | `args.ts` | The named argument must be present and non-empty (a blank string counts as missing). |
| [`argAbsent`](#6-argabsent) | `args.ts` | The named argument must not be passed at all. |
| [`argFormat`](#7-argformat) | `args.ts` | A present, non-empty string argument must match the given pattern; absent or empty is left to `argRequired`. |
| [`precondition`](#8-precondition) | `world.ts` | The call is allowed only while a predicate over the host world holds. |
| [`consentRequired`](#9-consentrequired) | `world.ts` | A set of writes may run only while the world says this person's consent is on record. |
| [`confirmFirst`](#10-confirmfirst) | `confirmation.ts` | A destructive tool runs only on a turn whose incoming message carried the engine-issued confirmation token for THIS record. Takes no options. |
| [`destructiveThrottle`](#11-destructivethrottle) | `confirmation.ts` | At most one destructive action that TOOK EFFECT per turn (a probe does not count; a call that RAN with no world record of its effect does). |
| [`valueFromUser`](#12-valuefromuser) | `structural.ts` | A field the agent fills in on the user's behalf must carry the value the user actually said. |

#### 1. `requiresBefore`

A tool may run only after every named dependency has already run successfully this conversation.

**When to reach for it.** An ordered flow where a step is meaningless without its predecessors — bind one gate per downstream tool naming all of them. Use this for "which call came first", not for "what state is the world in" (that is `precondition`).

```ts
requiresBefore(['findBooking'])
```

#### 2. `forbidThisTurn`

An unconditional deny of the bound tool while the binding is installed — the first call is denied too.

**When to reach for it.** A tool must be off, no matter what. Its scope is the BINDING'S LIFETIME — the check is `() => reason`, with no turn logic in it at all, so — despite the name — the ban holds for as long as the binding is installed, not for one turn. It is not a repeat detector: reach for `noDuplicateCall` when the FIRST call is legitimate and only the repeat is not.

```ts
forbidThisTurn('Do not reschedule while a cancellation is pending — resolve that first.')
```

#### 3. `maxCalls`

A tool may succeed at most n times per turn (default) or per conversation.

**When to reach for it.** A bulk cap on a tool that is legitimate but expensive or nagging — sweeps, notifications, repeat contact. Pick `scope: 'conversation'` for retention-style limits, `scope: 'turn'` for per-answer budgets.

```ts
maxCalls('sendEmail', 1, 'You already emailed this person.', { scope: 'conversation' })
```

#### 4. `noDuplicateCall`

Denies a call whose tool and canonical arguments already succeeded earlier in the same turn.

**When to reach for it.** Always on (the spec class auto-installs it): it stops the same-turn retry loop where a model re-reads an identical query hoping for a different answer. Cross-turn repeats stay legal — a later turn is a genuine refresh.

```ts
noDuplicateCall()
```

#### 5. `argRequired`

The named argument must be present and non-empty (a blank string counts as missing).

**When to reach for it.** A field the tool cannot do its job without, and the model tends to omit or fill with whitespace. For a field that must be well-FORMED rather than merely present, add `argFormat`.

```ts
argRequired('bookingId')
```

#### 6. `argAbsent`

The named argument must not be passed at all.

**When to reach for it.** A parameter the model keeps inventing for this tool, or the excluded half of a mutually exclusive pair — bind `argAbsent` on each side of the pair.

```ts
argAbsent('customerEmail')
```

#### 7. `argFormat`

A present, non-empty string argument must match the given pattern; absent or empty is left to `argRequired`.

**When to reach for it.** The value has a shape the model can plausibly fabricate — an id, a date, a code. Compose it with `argRequired` when the field is also mandatory; alone it only polices the values that are actually sent.

```ts
argFormat('bookingId', '^BK-\\d{6}$')
```

#### 8. `precondition`

The call is allowed only while a predicate over the host world holds.

**When to reach for it.** A gate whose discriminator lives in WORLD state, not in this call — the predicate never sees the acting call's arguments. If the discriminator is in the args, use `custom` instead.

```ts
precondition((world) => world.accountActive === true, 'This account is closed — you cannot act on it.', 'act on an account only while it is open')
```

#### 9. `consentRequired`

A set of writes may run only while the world says this person's consent is on record.

**When to reach for it.** Storing, sharing or transmitting personal data. It is `precondition` specialised to a TOOL SET, which is what makes the consent posture auditable in a spec header; pair it with a conversation-scoped `maxCalls` for repeat contact.

```ts
consentRequired({ tools: ['storeProfile'], consentOk: (world) => world.consentOnRecord === true, reason: 'No consent on record — ask for it before storing anything.' })
```

#### 10. `confirmFirst`

A destructive tool runs only on a turn whose incoming message carried the engine-issued confirmation token for THIS record. Takes no options.

**When to reach for it.** The user must have agreed before this call runs, and the agreement has to be THEIRS: the engine issues a confirmation token naming the record, renders it into the delivered text, and this gate allows the act only on a turn whose incoming message carried that token back. There is nothing to configure, because there is no declaration to trust — the agent has no channel through which to produce a consent. Its neighbours answer different questions: `destructiveThrottle` caps the blast radius of a turn that IS confirmed, and `consentRequired` reads a standing world flag rather than the conversation. A denial is also what RAISES the question for a tool the world has no preview form for, so attempting the act is what asks permission for it — and such a tool needs a declared label on the spec, or it can issue no question and never runs.

```ts
confirmFirst()
```

#### 11. `destructiveThrottle`

At most one destructive action that TOOK EFFECT per turn (a probe does not count; a call that RAN with no world record of its effect does).

**When to reach for it.** Auto-installed alongside `confirmFirst`. It is the blast-radius cap, not a consent gate: it stops chained destructive calls in one turn even when each one is individually confirmed. A same-step call that is NOT confirmed reads as a preview and does not count (so a legitimate multi-preview is not vetoed) — which means a tool with NO confirm flag needs `flagless`, or its same-step cap never engages. `AgentSpecBase` passes its `prior-ask` tools automatically; pass them yourself when you install this by hand.

```ts
destructiveThrottle(['cancelBooking', 'purgeAccount'], { flagless: ['purgeAccount'] })
```

#### 12. `valueFromUser`

A field the agent fills in on the user's behalf must carry the value the user actually said.

**When to reach for it.** The world is meant to receive what the PERSON said, not the agent's version of it. The recorded value is compared against everything the user has said in the conversation, as a contiguous run of whole tokens — so a value they never said is denied, and so is a paraphrase of one they did. Fires only when the gated argument is present on the call.

```ts
valueFromUser({ arg: 'email' })
```

### `postTool` — the call has run

The only hook that sees `ctx.result`. It cannot veto anything — the effect already happened — so its job is to stop the RESULT from being reported as something it was not: a violation here joins the reply redrive set.

| factory | file | what it enforces |
|---|---|---|
| [`resultInvariant`](#13-resultinvariant) | `world.ts` | A post-execution check on the tool RESULT: when the predicate fails, the violation joins the reply redrive set. |

#### 13. `resultInvariant`

A post-execution check on the tool RESULT: when the predicate fails, the violation joins the reply redrive set.

**When to reach for it.** The call already ran and cannot be undone, but its result must not be reported as if it satisfied the request — an empty report, a partial write. It never vetoes the call; it corrects the reply.

```ts
resultInvariant((result) => Array.isArray(result) && result.length > 0, 'The search returned nothing — say so instead of summarising it.', 'report an empty result as empty')
```

### `onReply` — the reply exists, and has not been sent

The reply text is in `ctx.reply` and no tool can run any more. A deny costs a bounded no-tools re-generation and, if that still violates, the deterministic honest closure — so these kinds are written to fire on what was ASSERTED, never on what was merely mentioned.

| factory | file | what it enforces |
|---|---|---|
| [`claimIsGrounded`](#14-claimisgrounded) | `honesty.ts` | Every operation the agent declares in `did` must match the world ledger: a `success` needs a write that took effect, `not_found` an empty read, `blocked`/`refused` a veto or world refusal, `no_op` a call that addressed the entity and no effected write on it — an undeclared outcome word is always a violation. |
| [`claimIsComplete`](#15-claimiscomplete) | `honesty.ts` | Every write that TOOK EFFECT this turn must be covered by a DISTINCT `success` ACTION intention in `did` that NAMES the entity — no silent action hidden from the user. |
| [`claimCoversRubric`](#16-claimcoversrubric) | `honesty.ts` | Each configured target must appear in `did` with the required outcome polarity (or any polarity when `outcome: 'any'`). |
| [`degenerationGuard`](#17-degenerationguard) | `reply.ts` | Catches leaked reasoning or tool markup, chat-template tokens and run-away line repetition in the reply. |
| [`llmCheck`](#18-llmcheck) | `llm-check.ts` | An LLM-adjudicated guard: a host-registered adjudicator answers a trusted rubric over the full context (history + user text) and its verdict becomes the deny. |
| [`didMessageConsistency`](#19-didmessageconsistency) | `llm-check.ts` | The `did` × `message` backstop: an adjudicator answers a pre-baked rubric asking whether the message asserts an operation the declaration does not carry, or contradicts a declared intention. |

#### 14. `claimIsGrounded`

Every operation the agent declares in `did` must match the world ledger: a `success` needs a write that took effect, `not_found` an empty read, `blocked`/`refused` a veto or world refusal, `no_op` a call that addressed the entity and no effected write on it — an undeclared outcome word is always a violation.

**When to reach for it.** Always on when the domain declares its `writeTools` (the spec class auto-installs it, fed by `contract.writeTools` + `contract.outcomes`). It is the ledger cross-check: it keys on `target` + `outcome` against verified calls, never on op-name semantics or reply text, so a fabricated success cannot ground. It checks ACTION intentions only — a speech intention (`inform`/`greet`/`refuse`/`ask`) names no ledger fact. A `target` matches an IDENTITY the ledger carries — a scalar under `id`/`label`/`<entity>Id`, never a status word, a note or a sentence — by WHOLE-VALUE equality, so `BK-1` never grounds against `BK-10` and `12` never stands for `Order 12`. A `success` matches only what the WORLD issued for the write (its own entity, not the ones its result references); a claim of absence or non-effect (`not_found`/`failure`/`blocked`/`refused`/`pending_confirmation`/`no_op`) matches the world's negative answer plus the identity-key ARGS that name the entity asked about, because an absent record issues no value of its own. An `amount`, when declared, must appear among the magnitudes of that same ledger fact. A domain outcome word must map to a core outcome via the contract's outcome map or it reads as undeclared.

```ts
claimIsGrounded({ writeTools: ['createBooking', 'cancelBooking'], outcomes: { settled: 'success' } })
```

#### 15. `claimIsComplete`

Every write that TOOK EFFECT this turn must be covered by a DISTINCT `success` ACTION intention in `did` that NAMES the entity — no silent action hidden from the user.

**When to reach for it.** Auto-installed alongside `claimIsGrounded` (same `writeTools` + `outcomes`). Its mirror is `claimIsGrounded`: that one stops a claim with no matching effect, this one stops an effect with no matching claim — both resolve a domain outcome word through the same `OutcomeMap`, so a mapped word (e.g. `settled` → `success`) covers a write exactly like the literal word does. Coverage is per-entity and INJECTIVE — assigned as a maximum matching, so claim order never starves an honest turn: a claim with no `target` covers nothing, a speech intention covers nothing, and two writes on the same entity need two claims. A write is covered only through the identity the world issued for IT (`{id:'ORD-1', parentId:'ORD-2'}` is ORD-1). It names the unreported action by the world-issued produced label, never by the tool name.

```ts
claimIsComplete({ writeTools: ['createBooking', 'cancelBooking'], outcomes: { settled: 'success' } })
```

#### 16. `claimCoversRubric`

Each configured target must appear in `did` with the required outcome polarity (or any polarity when `outcome: 'any'`).

**When to reach for it.** The per-case coverage rule: because polarity is a FIELD, a reply that says "no record of BK-1 was found" can never satisfy a `success` requirement again. The target must BE the claim's `target` by whole-value equality, so neither a claim about `BK-10` nor a sentence-shaped target answers a rubric about `BK-1`. Config-bound only (a per-case norm) — never auto-installed. Pass `'any'` when only the mention matters, a specific outcome when the polarity is the point.

```ts
claimCoversRubric({ targets: ['BK-100234'], outcome: 'success' }, 'Account for the booking you were asked about.')
```

#### 17. `degenerationGuard`

Catches leaked reasoning or tool markup, chat-template tokens and run-away line repetition in the reply.

**When to reach for it.** The reply is broken as an ARTIFACT rather than wrong as a claim — think blocks, tool-call markup or the same line five times over. No honesty kind fires on that, because nothing was asserted; this one catches the weak-model failure class every domain shares. Always on (auto-installed); it takes no parameters — language-specific judgments such as self-narration are text judgment, so an author who wants one binds an `llmCheck` rubric.

```ts
degenerationGuard()
```

#### 18. `llmCheck`

An LLM-adjudicated guard: a host-registered adjudicator answers a trusted rubric over the full context (history + user text) and its verdict becomes the deny.

**When to reach for it.** The judgement genuinely needs a model — "did the operator's yes license THIS act?", a promise no arg/observed pattern captures. Use it where structure alone cannot decide; a decidable structural signal always prefers its own kind. The adjudicator is host-registered on the runtime options, never in config. `runSpecConversation` resolves one from the turn's own model when the host supplies none; `LoopRunAgent` and `compileSpec` resolve nothing, so a spec bound for either registers one or fails loud at construction. `failMode` prices a REJECTED adjudicator, which the resolved default never produces: it answers every failure with no violation and records the non-run, so while an endpoint is down a bound rubric passes. A host that needs an outage to deny registers its own.

```ts
llmCheck({ rubric: 'Did the user, in an earlier turn, explicitly authorise THIS exact action?', failMode: 'closed' })
```

#### 19. `didMessageConsistency`

The `did` × `message` backstop: an adjudicator answers a pre-baked rubric asking whether the message asserts an operation the declaration does not carry, or contradicts a declared intention.

**When to reach for it.** The deterministic cross-check grounds the DECLARATION against the ledger, but the message beside it is free prose — an agent can declare an honest `inform` and still write that it completed something. Install this where the stakes justify a model call per reply (money, health). It is NOT auto-installed and it is never the primary guarantee: the structured cross-check grounds the declaration, and the operation record ships under every delivery so a claim the turn cannot back arrives contradicted. This is a third layer over both. It carries `failMode: 'closed'`, unlike a bare `llmCheck`. That denies on a REJECTED adjudicator, so it is the host-supplied adjudicator this guard is written for; under the resolved default, which never rejects, an outage passes and is recorded as an `adjudicator-unreachable` correction.

```ts
didMessageConsistency()
```

### `onReplyMutate` — rewrite the reply, never veto it

A `ReplyMutator`, not a `Guard`: it is applied to the reply before the `onReply` checks run and it has no pass/fail. Bind it with `spec.addMutator(...)`, not `addGuard`.

| factory | file | what it enforces |
|---|---|---|
| [`jargonScrub`](#20-jargonscrub) | `reply.ts` | A deterministic egress rewrite of internal vocabulary into user words (word-boundary, case-insensitive). |

#### 20. `jargonScrub`

A deterministic egress rewrite of internal vocabulary into user words (word-boundary, case-insensitive).

**When to reach for it.** Internal status codes and field names leak into replies and no gate can sensibly deny them. It is a MUTATOR, not a guard: it rewrites and never vetoes, so it has no pass/fail behaviour to prove.

```ts
jargonScrub({ CANC_PEND: 'waiting to be cancelled' })
```

### The escape hatch — when no kind fits

One factory, and it is the only one whose hook you choose: `custom` follows the `dim` you pass it (`spatial`/`input`/`run` → the tool hooks, `output` → `postTool`, `behavior` → `onReply`), which is why it is listed apart from the phase sections rather than under one of them. Section 6 walks through writing one.

| factory | file | what it enforces |
|---|---|---|
| [`custom`](#21-custom) | `custom.ts` | The escape hatch: a guard whose kind, dim, check and prose the spec author writes by hand. |

#### 21. `custom`

The escape hatch: a guard whose kind, dim, check and prose the spec author writes by hand.

**When to reach for it.** Only when no kind fits — typically a domain concept the runtime carries no vocabulary for (media, labels, provenance) read through the world's own accessors. It is the one factory whose hook YOU choose, by the `dim` you pass: it is classified under `preTool` here only because this example is a `run` guard. Replicate the shared kinds' exemptions, since reviewers read this code.

```ts
custom({ kind: 'imageQuotaLeft', dim: 'run', check: (ctx) => (ctx.world.imageQuotaRemaining > 0 ? null : 'No image quota left this month — say so instead of generating.'), prose: () => 'generate an image only while quota remains' })
```

<!-- END GENERATED: guard catalog -->

---

## 5b. What ships with every reply, without a guard

No guard reads prose. Two engine-owned things do, on every turn, and you install neither.

### The operation record — deterministic

Built from the verified `did`, never from the message. It closes with one of two sentences:

```
≥ 1 action line   →  Design review: not permitted
                     Nothing else was changed on this turn.
  0 action lines  →  No operation was carried out on this turn.
```

So a claim the turn cannot back never arrives alone:

```
message   Done — I cancelled your dentist appointment on 2026-03-03 at 09:00.
record    No operation was carried out on this turn.
```

Two sentences and not one, because over an empty list "nothing else was changed" would presuppose that
something was — and confirm the lie.

### The lie check — a judgement

```
no action was carried out this turn  →  ask: would the reader believe it was?
     yes  →  rewrite the prose, then deliver
     no   →  deliver the message as it stands
any action was carried out           →  deliver the message as it stands   (0 model calls)
```

The question is shown two lists — this turn's record, and one line per entity the session already
changed — so a true "your lunch with Marina was cancelled" from turn 1 is not read as a lie on turn 2.
The second list never reaches the user.

Your backend supplies the one callback both calls run on (`judge`). Without it, the prose ships as it
stands, under the record that contradicts it. `new LoopRunAgent({ …, lieCheck: true })` is what asks
for the pass; it is off until you do, because how well the check reads the question is a property of
your model, not of the algorithm.

```
PREVENTED?      no — the engine does not stop the sentence
CONTRADICTED?   always
```

`didMessageConsistency` (§5, #21) is a third layer over these two, for domains where they are not enough.

---

## 6. When nothing fits: `custom`

```ts
function custom(opts: {
  kind: string;
  dim: Dim;
  check: (ctx: GuardCtx) => string | null | Promise<string | null>;
  prose: () => string;
}): Guard
```
<sub>signature, from `looprun`</sub>

`custom` is not a lesser path — chapter 03's "never double-book" gate is one, because no runtime kind
knows what a calendar clash is. Reach for it when the discriminator is a **domain concept the runtime
carries no vocabulary for**, read through your world's own accessors.

Here is the second one the scheduler wants: *an event that has already started is not cancelled*. No
catalog kind covers it — the discriminator is in the args (**which** event) *and* in the world (its
start time), which is exactly what rules out `precondition`, whose predicate never sees the args.

```ts
/**
 * The accessor this guard needs, named once. `AgentWorld`'s index signature would let the typo
 * `snapshto()` compile (chapter 03 §7), so the read goes through a type either way.
 */
type CalendarReader = AgentWorld & { snapshot(): CalendarEvent[] };

/** The event `ctx.args.eventId` names, or `undefined`. Total: a guard's `check()` must never throw —
 *  the runtime does not swallow it, it attributes it and rethrows at the caller. */
function targetEvent(ctx: GuardCtx): CalendarEvent | undefined {
  const eventId = typeof ctx.args.eventId === 'string' ? ctx.args.eventId : '';
  return (ctx.world as CalendarReader).snapshot().find((e) => e.id === eventId);
}

export function noCancelAfterStart(now: string): Guard {
  return custom({
    kind: 'noCancelAfterStart',
    dim: 'run',
    check: (ctx) => {
      const event = targetEvent(ctx);
      if (!event || event.start > now) return null;
      return `"${event.label}" (${event.id}) started at ${event.start} — it is too late to cancel it. Say so and offer to remove the remaining time instead.`;
    },
    prose: () => 'an event that has already started is never cancelled — say it is too late and offer what can still be done',
  });
}
```
<sub>excerpt · `snippets/04-guards.ts`</sub>

```ts
/** Binding it: a subclass, so the shared `schedulerSpec` of chapters 02–03 keeps its own surface. */
export class LateCancelSchedulerSpec extends SchedulerSpec {
  constructor() {
    super();
    this.addGuard('preTool', ['cancelEvent'], noCancelAfterStart(REFERENCE_NOW), { id: 'agent:noCancelAfterStart' });
  }
}
```
<sub>excerpt · `snippets/04-guards.ts`</sub>

Five rules, learned from the shipped kinds, that a reviewer will look for:

| rule | why |
|---|---|
| **`dim` must match what `check` reads** | it is a claim, and `addGuard` holds you to it. This one reads `ctx.args` + `ctx.world` ⇒ `run` |
| **`check` must be pure and total** | no clock, no randomness, no network, no LLM call — and no throw. Same inputs, same verdict, forever, or a failing eval case is not reproducible |
| **`check` must not ROUTE tools by intent, nor pattern-match text** | it MAY read `ctx.userText`/`ctx.history`, but scoping tools by what the user asked is the banned intent-routing, and a `RegExp` over the text is the no-regex law's job for `llmCheck`, not a hand-rolled guard |
| **`prose()` states the RULE, not the incident** | present tense, no accusation: it renders into every prompt, including turns where nothing went wrong |
| **replicate the exemptions the shared kinds have** | e.g. a reply-side rule that fires on questions and offers as if they were claims is a rule that punishes good behaviour |

**A guard that throws is an author bug, and the runtime treats it as one.** It is neither a deny nor
an allow, so nothing is guessed: `AgentSpecBase` wraps every binding, and a `check()`/`prose()` that
throws is re-thrown as a `GuardExecutionError` naming the hook, the binding `id`, the kind and the
tool — out of `runSpecConversation`, loud and addressed, instead of being buried as a model failure.
You are not expected to catch it; you are expected to fix the guard, which is why the class ships on
`@looprun-ai/core/internal` rather than the public barrel. Write the total function instead: the
`typeof … === 'string' ? … : ''` read above is what "total" costs.

---

## 7. Recap

```
   Guard         kind · dim · check(ctx) → deny string | null · prose() → the prompt line
   GuardCtx      args · tool · world · observed · turnIndex · userText · consent · history · reply · result · adjudicator
   ObservedCall  name · args · ok · turnIndex · resultFlags · tookEffect
   Dim           spatial | input | run | output | behavior  → which hooks are legal
   canonArgs     the key-order-independent call fingerprint — `noDuplicateCall` keys on it

   21 factories, grouped by the hook they run on:
     preTool       13   prevent it — the deny returns as the tool result, the model retries
     postTool       1   the result is in; correct the REPLY, not the call
     onReply        6   the reply exists; a deny costs a re-generation, then the honest closure
     onReplyMutate  1   rewrite, never veto
```

You now have the map, the machine and the rules. Chapter 05 runs all three over a scripted
conversation and turns "it seemed fine" into a number you can re-run.

→ **[05 · Running and eval](05-running-and-eval.md)**
