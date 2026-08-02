# 04 · Guards

**What you get from this chapter:** the complete rule vocabulary — 25 factories, what each one
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
   §5  THE CATALOG                              25 factories, grouped by hook — generated
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
prior turn) are right there. The old *magnet firewall* (guards blind to the user's words) is retired: a
guard is deterministic code, so "the user can talk their way past it" does not apply. Two laws still
hold, and they are what the firewall was really protecting. **Never scope tools by intent** — a guard
that turned tools on or off according to what the user asked for is the banned intent-based routing (a
loop law, not a guard law). **Never pattern-match text in a guard parameter** — the no-regex law: no
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

Two names in `observed` are runtime-owned rather than yours: `replyToUser` and `askUser` are pushed
in with `ok: true`, so a check that means "did the model do any work" must filter them out.

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

## 3. Five are already installed

`AgentSpecBase`'s constructor installs the universal invariants before your code runs, and the
destructive-safety protocol iff you declared `destructiveTools` (chapter 03 §2):

```
   ALWAYS (2)                    noDuplicateCall   (preTool)
                                 degenerationGuard (onReply)
   IFF destructiveTools (2)      confirmFirst + destructiveThrottle, on exactly those tools
   ───────────────────────────   the four a spec like the scheduler's gets
```

The old always-on `emptyReply` floor is gone (tier-③ deletion, SCG-T5): an empty final reply is now
structurally impossible — the `respond` terminal requires a non-empty `message` and the forced-terminal
fallback always closes with a non-empty engine-derived line, so no runtime guard is needed. And there is no
conditional sixth: the old regex-fed `noFalseFailureClaim` was retired with the no-regex law (2026-08-02).
A reply-honesty invariant a domain needs is now an `llmCheck` you bind yourself (§5's `llmCheck` row), not
an auto-install fed by a lexicon.

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
| acts destructively without ever having asked | [`confirmFirst`](#10-confirmfirst) (auto-installed by `destructiveTools`) | preTool |
| asks and acts in the same breath, or chains two destructive calls in one turn | [`noActAfterAskSameTurn`](#11-noactafterasksameturn) · [`destructiveThrottle`](#12-destructivethrottle) | preTool |
| makes the same call again, hoping for a different answer | [`noDuplicateCall`](#4-noduplicatecall) | preTool |
| calls a legitimate tool too many times — sweeps, repeat contact | [`maxCalls`](#3-maxcalls) | preTool |
| runs a step before the one it depends on | [`requiresBefore`](#1-requiresbefore) | preTool |
| acts while the world says it must not (closed account, no consent on record) | [`precondition`](#8-precondition) · [`consentRequired`](#9-consentrequired) | preTool |
| a value must not be recorded until the operator was asked for it in an earlier turn · a confirmed act needs its own earlier-turn preview | [`askedEarlier`](#13-askedearlier) · [`confirmFirst`](#10-confirmfirst) (`via:'probe'`) | preTool |
| summarises an empty or partial result as if it satisfied the request | [`resultInvariant`](#14-resultinvariant) | postTool |
| claims a tool's work is done when it is not · apologises for a failure on a turn where the work went through · promises an off-surface handoff · discloses a personal/regulated field the tools do not ground · obeys an instruction that came back INSIDE a tool result | [`llmCheck`](#20-llmcheck) — text judgment is one kind now: a trusted rubric answered by a host adjudicator (the 8 regex-param honesty/reply kinds were deleted by the no-regex law) | onReply / preTool |
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
| `confirmFirst` · `consentRequired` · `pendingConfirmMustAsk` | evidence in the CONVERSATION (an earlier turn) · a standing flag in the WORLD · gating the REPLY rather than the call |
| `claimIsGrounded` · `claimIsComplete` · `claimCoversRubric` | every claim matches the ledger · every effected write is claimed · a per-case target appears with the required outcome polarity |

**Where the honesty cluster went.** Six kinds used to sit here — a family that all meant "the reply
lied" (invented success, false failure, an off-surface claim, an ungrounded regulated figure). The
no-regex law (2026-08-02) deleted every one: each was a `RegExp` over the reply, and text judgment is
now a single kind, `llmCheck`. Instead of choosing between six regex guards you write ONE rubric —
"does the reply claim an action the tools did not actually complete this turn?" — and a host adjudicator
answers it over the full context. The structural honesty signals survive as their own kinds
(`resultInvariant` on the tool result, `destructiveThrottle`/`confirmFirst` on the call).

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
  canonArgs({ start: '2026-03-02T10:00', title: 'Standup' }) === canonArgs({ title: 'Standup', start: '2026-03-02T10:00' });

/** …and a different VALUE is a different call, so a corrected retry is never denied as a repeat. */
export const differentCallFingerprint =
  canonArgs({ title: 'Standup' }) !== canonArgs({ title: 'Stand-up' });
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

## 5. The catalog — 22 factories

Grouped by the hook each one is installed on, because the hook decides what a rule can see and
therefore what it can enforce (chapter 03 §8). 13 preTool · 1 postTool · 6 onReply · 1 onReplyMutate · 1 escape hatch.

A fourth hook exists and has no section here: `onInput` fires before the model runs, and §1's
matrix makes it legal for every `spatial`/`input`/`run` guard — but no shipped kind is installed
there, because a rule that can refuse the whole turn before a call is even proposed is a domain
decision, not a default. `custom` is how you reach it.

### The consent story — three checkpoints, installed as a set

Ask-before-you-act is not one guard. It is three, each gating a different thing on a different hook,
and a governed destructive flow installs all three together — never two that say the same thing twice.

```
   ①  confirmFirst          gates the CALL    (preTool)  — the confirmed act may run only when an
                                                           EARLIER turn licensed it (a probe or an ask)
   ②  askedEarlier          gates the ARG     (preTool)  — a value may be RECORDED only after the
                                                           operator was asked for it and answered later
   ③  pendingConfirmMustAsk  gates the REPLY   (onReply)  — when a probe returned "needs confirmation"
                                                           and nothing resolved it, the reply MUST relay
                                                           the question instead of reporting the act done
```

They compose because they cover disjoint moments: ① stops the unlicensed call, ② stops the unasked-for
value from being written, ③ stops the reply from summarising a still-pending action as finished. Reach
for the one that matches WHAT you are gating — the call, the argument, or the message — and do not stack
a second consent kind on the same moment: `confirmFirst` already carries the cross-turn requirement, so
pairing it with another call-gate is the redundancy this section exists to prevent.

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
| [`confirmFirst`](#10-confirmfirst) | `confirmation.ts` | A destructive tool needs the user's go-ahead from an EARLIER turn — licensed `via` a same-record probe, a prior ask, or either. The licensing event is turn-bounded by `within` (default 1). Passing a `via` NAME to the string overload throws at construction. |
| [`noActAfterAskSameTurn`](#11-noactafterasksameturn) | `confirmation.ts` | Denies the listed tools on a turn in which the model already asked the user a question. |
| [`destructiveThrottle`](#12-destructivethrottle) | `confirmation.ts` | At most one destructive action that TOOK EFFECT per turn (a confirmation probe does not count). |
| [`askedEarlier`](#13-askedearlier) | `structural.ts` | A gated argument may be recorded only when the agent asked the user in an EARLIER turn; a same-turn ask does not count. |

#### 1. `requiresBefore`

A tool may run only after every named dependency has already run successfully this conversation.

**When to reach for it.** An ordered flow where a step is meaningless without its predecessors — bind one gate per downstream tool naming all of them. Use this for "which call came first", not for "what state is the world in" (that is `precondition`).

```ts
requiresBefore(['findBooking'])
```

#### 2. `forbidThisTurn`

An unconditional deny of the bound tool while the binding is installed — the first call is denied too.

**When to reach for it.** A tool must be off, no matter what. Its scope is the BINDING'S LIFETIME — the check is `() => reason`, with no turn logic in it at all, so the ban holds for as long as the binding is installed (the name is historical). It is not a repeat detector: reach for `noDuplicateCall` when the FIRST call is legitimate and only the repeat is not.

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

A destructive tool needs the user's go-ahead from an EARLIER turn — licensed `via` a same-record probe, a prior ask, or either. The licensing event is turn-bounded by `within` (default 1). Passing a `via` NAME to the string overload throws at construction.

**When to reach for it.** The user must have agreed before this call runs, and the evidence has to be cross-turn — this is the ONE consent gate (it absorbed `confirmedNeedsEarlierProbe`). Its neighbours answer different questions: `destructiveThrottle` caps the blast radius of a turn that IS approved, `consentRequired` reads a standing world flag rather than the conversation, and `pendingConfirmMustAsk` gates the REPLY rather than the call. `via`: `'probe'` = a same-record `flag:false` preview of the SAME tool in an earlier turn (the strict, record-bound license); `'ask'` = a flag-LESS action gated on the agent having asked the user in a prior turn; `'either'` (default) = the flag-gated form licensed by a matching probe OR a prior-turn question to the user. RECENCY LAW: the licensing event must fall `within` turns of now (default 1, the two-step shape) — widen deliberately for genuinely multi-turn flows. The string overload sets the FLAG NAME, so `confirmFirst('probe')` throws rather than silently building a guard that can never fire.

```ts
confirmFirst('confirmed')
```

#### 11. `noActAfterAskSameTurn`

Denies the listed tools on a turn in which the model already asked the user a question.

**When to reach for it.** The mirror image of `confirmFirst`'s cross-turn requirement: it closes the multi-tool step that asks and executes back to back, which reads as "asked" but never gave the user a chance to answer.

```ts
noActAfterAskSameTurn(['cancelBooking'])
```

#### 12. `destructiveThrottle`

At most one destructive action that TOOK EFFECT per turn (a confirmation probe does not count).

**When to reach for it.** Auto-installed alongside `confirmFirst`. It is the blast-radius cap, not a consent gate: it stops chained destructive calls in one turn even when each one is individually confirmed.

```ts
destructiveThrottle(['cancelBooking', 'refundOrder'])
```

#### 13. `askedEarlier`

A gated argument may be recorded only when the agent asked the user in an EARLIER turn; a same-turn ask does not count.

**When to reach for it.** A value the agent must not write until it has asked the operator for it and they answered in a later message — the structural replacement for a hand-written regex over "did we ask?". It keys on the presence of the gated arg plus an earlier-turn question to the user, never on any text.

```ts
askedEarlier({ tool: 'completeMaintenance', arg: 'condition' })
```

### `postTool` — the call has run

The only hook that sees `ctx.result`. It cannot veto anything — the effect already happened — so its job is to stop the RESULT from being reported as something it was not: a violation here joins the reply redrive set.

| factory | file | what it enforces |
|---|---|---|
| [`resultInvariant`](#14-resultinvariant) | `world.ts` | A post-execution check on the tool RESULT: when the predicate fails, the violation joins the reply redrive set. |

#### 14. `resultInvariant`

A post-execution check on the tool RESULT: when the predicate fails, the violation joins the reply redrive set.

**When to reach for it.** The call already ran and cannot be undone, but its result must not be reported as if it satisfied the request — an empty report, a partial write. It never vetoes the call; it corrects the reply.

```ts
resultInvariant((result) => Array.isArray(result) && result.length > 0, 'The search returned nothing — say so instead of summarising it.', 'report an empty result as empty')
```

### `onReply` — the reply exists, and has not been sent

The reply text is in `ctx.reply` and no tool can run any more. A deny costs a bounded no-tools re-generation and, if that still violates, the deterministic honest closure — so these kinds are written to fire on what was ASSERTED, never on what was merely mentioned.

| factory | file | what it enforces |
|---|---|---|
| [`pendingConfirmMustAsk`](#15-pendingconfirmmustask) | `confirmation.ts` | When a probe returned `requiresConfirmation` this turn and nothing resolved it, the reply must relay that question. |
| [`claimIsGrounded`](#16-claimisgrounded) | `honesty.ts` | Every operation the agent declares in `did` must match the world ledger: a `success` needs a write that took effect, `not_found` an empty read, `blocked`/`refused` a veto or world refusal, `no_op` no effected write — an undeclared outcome word is always a violation. |
| [`claimIsComplete`](#17-claimiscomplete) | `honesty.ts` | Every write that TOOK EFFECT this turn must be covered by a `success` claim in `did` — no silent action hidden from the user. |
| [`claimCoversRubric`](#18-claimcoversrubric) | `honesty.ts` | Each configured target must appear in `did` with the required outcome polarity (or any polarity when `outcome: 'any'`). |
| [`degenerationGuard`](#19-degenerationguard) | `reply.ts` | Catches leaked reasoning or tool markup, chat-template tokens and run-away line repetition in the reply. |
| [`llmCheck`](#20-llmcheck) | `llm-check.ts` | An LLM-adjudicated guard: a host-registered adjudicator answers a trusted rubric over the full context (history + user text) and its verdict becomes the deny. |

#### 15. `pendingConfirmMustAsk`

When a probe returned `requiresConfirmation` this turn and nothing resolved it, the reply must relay that question.

**When to reach for it.** The world runs the two-step protocol itself: the tool answers "I need confirmation" and the risk is a reply that summarises the action as done. It gates the REPLY; `confirmFirst` gates the call.

```ts
pendingConfirmMustAsk()
```

#### 16. `claimIsGrounded`

Every operation the agent declares in `did` must match the world ledger: a `success` needs a write that took effect, `not_found` an empty read, `blocked`/`refused` a veto or world refusal, `no_op` no effected write — an undeclared outcome word is always a violation.

**When to reach for it.** Always on when the domain declares its `writeTools` (the spec class auto-installs it, fed by `contract.writeTools` + `contract.outcomes`). It is the ledger cross-check that replaced the deleted prose honesty guards: it keys on `target` + `outcome` against verified calls, never on op-name semantics or reply text, so a fabricated success cannot ground. A domain outcome word must map to a core outcome via the contract's outcome map or it reads as undeclared.

```ts
claimIsGrounded({ writeTools: ['createBooking', 'cancelBooking'], outcomes: { settled: 'success' } })
```

#### 17. `claimIsComplete`

Every write that TOOK EFFECT this turn must be covered by a `success` claim in `did` — no silent action hidden from the user.

**When to reach for it.** Auto-installed alongside `claimIsGrounded` (same `writeTools` + `outcomes`). Its mirror is `claimIsGrounded`: that one stops a claim with no matching effect, this one stops an effect with no matching claim — both resolve a domain outcome word through the same `OutcomeMap`, so a mapped word (e.g. `settled` → `success`) covers a write exactly like the literal word does. It names the unreported action by the world-issued produced label, never by the tool name.

```ts
claimIsComplete({ writeTools: ['createBooking', 'cancelBooking'], outcomes: { settled: 'success' } })
```

#### 18. `claimCoversRubric`

Each configured target must appear in `did` with the required outcome polarity (or any polarity when `outcome: 'any'`).

**When to reach for it.** The per-case coverage rule that replaces `replyMentions`/`replyConfirmsLabels`: because polarity is a FIELD, a reply that says "no record of BK-1 was found" can never satisfy a `success` requirement again. Config-bound only (a per-case norm) — never auto-installed. Pass `'any'` when only the mention matters, a specific outcome when the polarity is the point.

```ts
claimCoversRubric({ targets: ['BK-100234'], outcome: 'success' }, 'Account for the booking you were asked about.')
```

#### 19. `degenerationGuard`

Catches leaked reasoning or tool markup, chat-template tokens and run-away line repetition in the reply.

**When to reach for it.** The reply is broken as an ARTIFACT rather than wrong as a claim — think blocks, tool-call markup or the same line five times over. No honesty kind fires on that, because nothing was asserted; this one catches the weak-model failure class every domain shares. Always on (auto-installed); it takes no parameters (the former language-specific self-narration branch is now an `llmCheck` job).

```ts
degenerationGuard()
```

#### 20. `llmCheck`

An LLM-adjudicated guard: a host-registered adjudicator answers a trusted rubric over the full context (history + user text) and its verdict becomes the deny.

**When to reach for it.** The judgement genuinely needs a model — "did the operator's yes license THIS act?", a promise no arg/observed pattern captures. Use it where structure alone cannot decide; a decidable structural signal always prefers its own kind. The adjudicator is host-registered on the runtime options (never in config), and `failMode` prices an unreachable adjudicator: `'open'` allows, `'closed'` denies.

```ts
llmCheck({ rubric: 'Did the user, in an earlier turn, explicitly authorise THIS exact action?', failMode: 'closed' })
```

### `onReplyMutate` — rewrite the reply, never veto it

A `ReplyMutator`, not a `Guard`: it is applied to the reply before the `onReply` checks run and it has no pass/fail. Bind it with `spec.addMutator(...)`, not `addGuard`.

| factory | file | what it enforces |
|---|---|---|
| [`jargonScrub`](#21-jargonscrub) | `reply.ts` | A deterministic egress rewrite of internal vocabulary into user words (word-boundary, case-insensitive). |

#### 21. `jargonScrub`

A deterministic egress rewrite of internal vocabulary into user words (word-boundary, case-insensitive).

**When to reach for it.** Internal status codes and field names leak into replies and no gate can sensibly deny them. It is a MUTATOR, not a guard: it rewrites and never vetoes, so it has no pass/fail behaviour to prove.

```ts
jargonScrub({ CANC_PEND: 'waiting to be cancelled' })
```

### The escape hatch — when no kind fits

One factory, and it is the only one whose hook you choose: `custom` follows the `dim` you pass it (`spatial`/`input`/`run` → the tool hooks, `output` → `postTool`, `behavior` → `onReply`), which is why it is listed apart from the phase sections rather than under one of them. Section 6 walks through writing one.

| factory | file | what it enforces |
|---|---|---|
| [`custom`](#22-custom) | `custom.ts` | The escape hatch: a guard whose kind, dim, check and prose the spec author writes by hand. |

#### 22. `custom`

The escape hatch: a guard whose kind, dim, check and prose the spec author writes by hand.

**When to reach for it.** Only when no kind fits — typically a domain concept the runtime carries no vocabulary for (media, labels, provenance) read through the world's own accessors. It is the one factory whose hook YOU choose, by the `dim` you pass: it is classified under `preTool` here only because this example is a `run` guard. Replicate the shared kinds' exemptions, since reviewers read this code.

```ts
custom({ kind: 'imageQuotaLeft', dim: 'run', check: (ctx) => (ctx.world.imageQuotaRemaining > 0 ? null : 'No image quota left this month — say so instead of generating.'), prose: () => 'generate an image only while quota remains' })
```

<!-- END GENERATED: guard catalog -->

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
      return `"${event.title}" (${event.id}) started at ${event.start} — it is too late to cancel it. Say so and offer to remove the remaining time instead.`;
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
| **`check` must not ROUTE tools by intent, nor pattern-match text** | it MAY read `ctx.userText`/`ctx.history` (the firewall is retired), but scoping tools by what the user asked is the banned intent-routing, and a `RegExp` over the text is the no-regex law's job for `llmCheck`, not a hand-rolled guard |
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
   GuardCtx      args · tool · world · observed · turnIndex · userText · history · reply · result · adjudicator
   ObservedCall  name · args · ok · turnIndex · resultFlags · tookEffect
   Dim           spatial | input | run | output | behavior  → which hooks are legal
   canonArgs     the key-order-independent call fingerprint — `noDuplicateCall` keys on it, and
                 `pendingConfirmMustAsk` keys on it with the confirm flag stripped

   25 factories, grouped by the hook they run on:
     preTool        14   prevent it — the deny returns as the tool result, the model retries
     postTool        1   the result is in; correct the REPLY, not the call
     onReply         8   the reply exists; a deny costs a re-generation, then the honest closure
     onReplyMutate   1   rewrite, never veto
     custom          1   the escape hatch — you pass the dim
```

You now have the map, the machine and the rules. Chapter 05 runs all three over a scripted
conversation and turns "it seemed fine" into a number you can re-run.

→ **[05 · Running and eval](05-running-and-eval.md)**
