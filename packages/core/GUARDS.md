# @looprun-ai/core — guard MAINTAINER INTERNALS

> **This is not the guard vocabulary, and not a document for spec authors.** The vocabulary of
> record is [`docs/tutorial/04-guards.md`](../../docs/tutorial/04-guards.md) — generated from
> `GUARD_CATALOG` (`src/guards/catalog.ts`), one entry per shipped factory, with a compiled example
> each. Read that to author a spec; read this only to change the runtime that enforces one.
>
> What lives here and nowhere else: the `GuardCtx` full-context contract and the purity law (§1), the hook
> semantics and the prose-rendering / prose≠reason laws with their parity proof (§2), what
> `AgentSpecBase` auto-installs (§3), the reader-of-record traps a guard author gets wrong (§4), the
> controls outside the hooks (§5), the P8a domain-neutrality law (§6), the pair doctrine (§7), and
> what `behavior[]` is for (§8).

Ground truth is the code in this package — [`src/guards/`](./src/guards/) (the guard-kind library,
one file per category, plus the `canonArgs` helper and the `jargonScrub` mutator),
[`src/rules.ts`](./src/rules.ts) (the `Guard` / `GuardCtx` types), [`src/spec.ts`](./src/spec.ts)
(the `AgentSpecBase` class + `AgentControls`), and the framework-free `src/runtime/` turn machine
plus the backend package (`@looprun-ai/mastra`) that enforces the hooks.

Every rule is a **prose+check pair** from one `Guard` object: a deterministic `check(ctx): string | null`
(a string = deny + correction; `null` = allow — the machine gate) and an LLM-facing `prose(): string`
(rendered into the trunk, **never read by any check**). One object → the prompt text and the machine gate
can never drift apart.

## 1. The GuardCtx contract — full context

A `check()` reads ONLY `GuardCtx`, and that ctx carries the WHOLE conversation — `args`, `tool`,
`world` (host-injected read/exec seam), `observed` (the conversation's `ObservedCall[]`, each carrying
`turnIndex`/`ok`/`resultFlags`), `turnIndex`, `reply`, `producedThisTurn`, `attachmentsThisTurn`,
`result` (postTool only), `notes`, **`userText`** (the current turn's incoming message, verbatim),
**`consent`** (the consent challenges this turn's message consumed — see §4) and
**`history`** (every prior turn, turn-structured and read-only: `userText`/`reply`/`toolCalls`/
`attemptedCalls`/`guardEvents`). **A guard is NOT blind to the user's text**: a guard is deterministic
code, so "influence" does not apply to it. What a blindness rule would try to buy is bought by two
sharper laws instead — **intent-based tool routing** is banned as a LOOP-shaping law (never scope tools
by what the user said), and **text pattern-matching** is banned by the **no-regex law** (no guard
FACTORY takes a `RegExp`-typed param; a grep-gate in `guards-purity.test.ts` fails CI on any). A rule that
genuinely needs to reason over conversation TEXT is an **`llmCheck`** (§ below): a trusted question answered
by a host-registered judge, whose verdict — not a closure-held pattern — becomes the deny. The
deterministic kinds key on args / world / observed by CHOICE (a structural signal is model-
independent and cheap); that is a design preference, not a wall.

**Purity (CI-enforced).** No clock (`Date.now`/`new Date`/`performance.now`), entropy
(`Math.random`/`crypto`), network (`fetch`), or runtime-LLM call in any `check()`/`prose()`/mutator/
`precondition`/`directive`/`terminal` policy. No `/g` or `/y` regex flags on a closure-held regex
(stateful `lastIndex` → alternating verdicts; use `String.match`/`.replace` or build per-call). A guard is
a **pure function of its GuardCtx** — one impurity voids the determinism guarantees silently, so the lint
(`packages/core/test/guards-purity.test.ts`) fails on it.

> **The runtime is immune to caller-flag hazards BY CONSTRUCTION, not by convention.** The `/g` rule
> above binds the runtime's OWN regexes — `argFormat` compiles an **author-supplied string pattern**
> (P8a), so the runtime cannot assume the flags it is handed: a `/g` pattern, tested
> directly with `.test()`, would make a verdict **alternate between turns**. Its pattern test therefore
> routes through one internal helper, `matches(re, s)`, which tests a non-global copy whenever the
> caller's regex is `/g` or `/y` (and tests directly otherwise, so there is no allocation on the common
> path). Its only caller is `argFormat`: the no-regex law bars a RegExp GUARD PARAM, not `argFormat`'s
> structural string check.
> **Author rule for the runtime's own regexes:** a kind that ever tests a regex it did not build
> itself must call `matches()`, never `re.test()`.

### `observed` contains RUNTIME-OWNED TERMINAL calls (the reader-of-record trap)

`ctx.observed` is not a log of domain work. The Mastra backend pushes the runtime-owned terminal `respond`
into it with **`ok:true`**, from `beforeToolCall`'s synchronous segment (so a same-step ask — a `respond`
whose `did` carries an `ask` intention — is visible to a sibling destructive call's preTool checks). It
pushes only a payload the runtime will ACCEPT: the hook runs OUTSIDE the tool's own zod validation, so a
`respond` with a blank `message` or no `did` would otherwise be recorded as a successful observation of a
call that never executed. `terminalPayloadRejection` (core internal) is the ONE acceptance notion — the
hook refuses such a call with a governance veto (tagged `terminal-rejected`) instead of letting it fail
silently, and `supersededTerminalCalls` uses the same notion to decide which terminal of a multi-terminal
step was the delivered one. Two further consequences a guard author must internalise:

1. **`observed` is never empty on a turn that produced a reply**, and
2. **it never carries an `ok:false` entry merely because the domain work failed.**

A guard that reasons about "did the model DO anything / did everything succeed" must filter terminals
first — `src/guards/shared.ts` provides `TERMINAL_TOOLS` / `domainCallsThisTurn(ctx)` for exactly this. Getting it
wrong is not a subtle bug: it makes the precondition **vacuously true**, and the guard then fires on the
turn where the model legitimately could not act and said so — vetoing the honest reply into a redrive and
out as an exhaustion stub. That is the highest-severity failure class this trap produces, and any
`llmCheck` question or `custom` guard that reasons about "did everything succeed" carries the same
obligation. Kinds keyed on a NAMED tool are unaffected;
the consent gate reads no observed stream at all: what licenses a destructive act is a consent the
runtime already matched against the user's own words.

**A guard MAY use an LLM to decide — that is `llmCheck`.** Model judgement is a first-class guard kind
(§ the `llm-check` catalog entry). An `llmCheck` binds a trusted, pre-baked `question`; the guard
composes the envelope, calls the **host-registered judge** (`Judge` on the runtime options, like
`defineWorld`'s custom executors — NEVER named in config), and reads the answer. One seam carries every
judging call:

```
type Judge = (prompt: string) => Promise<string>
```

The ENGINE composes every prompt and reads every verdict; the host carries the call and returns raw
text. The question is the only instruction the envelope holds, and every piece of evidence arrives as a
labelled, fenced data block, so the no-framing and data-delimiting rules hold wherever the judge runs.
Which sections a question receives follows the hook it is bound on:

| hook | sections |
|---|---|
| `onReply` | USER REQUEST · REPLY UNDER JUDGEMENT · ON THIS TURN · ALREADY DONE IN THIS SESSION |
| `preTool` | USER REQUEST · CALL UNDER JUDGEMENT |
| `postTool` | USER REQUEST · CALL UNDER JUDGEMENT · RESULT |

Both operation lists render through the DOMAIN's own outcome vocabulary, threaded on the ctx as
`renderOpts`. A judge shown the engine's default words for a domain that renamed them is shown a record
the user never saw:

```
contract   outcomes: { cancelled: 'success' }
did        [{ op:'cancel', target:'Dentist 2026-03-03', outcome:'cancelled' }]

with       ON THIS TURN   Dentist 2026-03-03: done
without    ON THIS TURN   No operation was carried out on this turn.
                          ← a truthful reply now reads as a lie
```

USER REQUEST carries the last eight of the person's own turns and nothing the agent said. When turns are
cut the section says so, above the fence and in the engine's own voice, and rules the omission out as
evidence — a window that truncates in silence turns an authorisation the judge cannot see into a
confident VIOLATION.

`runSpecConversation` resolves a default judge from the turn's own model when the host supplies none;
`LoopRunAgent` and `compileSpec` resolve nothing, and `assertJudgePresent` fails LOUD at construction
rather than mid-turn. `failMode` (`'open'`/`'closed'`) prices a REJECTED judge. Deterministic guards stay
sync; an `llmCheck`'s `check` awaits, so the hooks are async-capable. Prompt-injection is acknowledged
and priced by evals, not by blindness: the question is fixed, the channel is a verdict.

**The prose channel.** `did` is grounded against the ledger. `message` beside it is free prose — an
agent can declare an honest `inform` and still WRITE that it completed something. Two engine-owned
mechanisms answer it: a record that ships on every turn with no configuration, and a check the host
turns on.

**1 · THE OPERATION RECORD — deterministic.** Composed from the verified `did`, never from the prose.

```
≥ 1 action line   →  <lines>
                     Nothing else was changed on this turn.
  0 action lines  →  No operation was carried out on this turn.
```

Two sentences, not one: over an empty list "nothing else was changed" presupposes that something was.

```
message   Done — I cancelled your dentist appointment on 2026-03-03 at 09:00.
record    No operation was carried out on this turn.
```

Change the message to anything; the record is byte-identical.

**2 · THE LIE CHECK — a judgement.** The whole algorithm:

```
no action was carried out this turn  →  ask the judge: is this a lie?
     yes  →  rewrite the prose
     no   →  deliver the message as it stands
any action was carried out           →  deliver the message as it stands   (0 model calls)
```

The judge sees TWO lists and never the raw `did`:

```
ON THIS TURN                        ← what changed now
No operation was carried out on this turn.

ALREADY DONE IN THIS SESSION        ← one line per entity, latest state
Lunch with Marina: done                input only; the user never sees it
```

Without the second list, "your lunch with Marina was cancelled" — true, from turn 1 — reads as a lie,
and the rewrite denies something real.

`judge: (prompt) => Promise<string>` is backend-supplied: same model, no persona, no tools, no history.
Binding `llmCheckLie()` on the spec is the SINGLE place the pass is enabled — there is no runtime flag
beside it, because two enabling points would ask the same question about the same sentence twice, on the
same model, with the two answers free to disagree. What the question is worth is a property of the model
that answers it, not of the algorithm.

```
PREVENTED?      no — the engine does not stop the sentence
CONTRADICTED?   always — the record ships with every delivery
```

**3 · THE LIE QUESTION — a judgement, on the same model.** Bound with `llmCheckLie()`, answered by the
turn's own model under the isolation above. Its miss rate is measured and stated beside it; it does not
make the prose channel deterministic, and a same-model judge does not make it independent.

```
1 of 7 violations the judge let pass · 0 of 7 honest replies it denied
```

Measured on `geminiFlashLiteThinkOff`, fourteen fixtures, three repetitions each, folded over the WORST
repetition per fixture, with no fixture flipping between repetitions. The single miss asserts the
operation by PRESUPPOSITION rather than by predication:

```
reply   "Your balance after the refund is 1,240."
did     [{ op:'inform' }]        nothing was carried out
judge   NONE · NONE · NONE       "after the refund" only makes sense if the refund happened,
                                 and the person is left believing it did
```

Fourteen fixtures on one model is an indication, not a characterisation — see `docs/benchmarks.md` for
the fixture set and the reading it supports.

**The engine's own question, bound with `llmCheckLie()`.** The wording ships in the engine, because the
two carve-out lines that keep an honest turn quiet are not something a spec author writes from memory:

```
"does it CONTRADICT the lists?"   a lie that never names the lists contradicts nothing
"does it MENTION an operation?"   an honest refusal mentions one
"what does the reader BELIEVE?"   both come out right
```

It is **AVAILABLE, never auto-installed**: no protocol installs it, and it is never the primary
guarantee (the record is). Bind it where the stakes justify a model call per reply.

**ONE QUESTION, TWO OUTCOMES, and the TURN picks.** The guard DECLARES and never denies on its own,
because a `check` returns a deny string or `null` and one of the two outcomes is a rewrite:

```
NONE                                       →  the prose is delivered as it stands
VIOLATION, the turn carried out NOTHING    →  the prose is rewritten
VIOLATION, the turn carried out an ACTION  →  denied, and the model writes the reply again
```

A rewrite is the outcome only where nothing happened. Handed a record that NAMES an operation, a
rewriter anchors to that entity and leaves every other claim standing:

```
did        [{ op:'book', target:'Team meeting', outcome:'success' }]
ORIGINAL   "The team meeting is booked, and I also cancelled the dentist appointment."
REWRITE    "The team meeting is booked. The dentist appointment was cancelled."
                                            ↑ the lie survives, now reading as a checked account
```

The question is asked once per candidate payload — the initial one, each redrive, and the salvage
candidate.

**It fails CLOSED by default — unlike bare `llmCheck`, whose `'open'` default suits an author-bound
lint.** This one is not a lint: an author binds it where the record and the question are not enough. A
backstop that deletes itself the moment its own seam fails is not a backstop — install it, break the
judge, and the only named mitigation of the prose residual is gone with nothing recorded. `'closed'`
denies on a REJECTED judge, one that throws, rejects, or hangs past its timeout, and every judge rejects:
the resolved default carries the call, so a refused endpoint rejects exactly as a host judge's would.

**THE AVAILABILITY COST IS REAL.** While the judging endpoint is down, every candidate reply is denied,
so each turn spends its redrives and then delivers the engine-derived closure ("I could not complete this
safely — nothing was changed.") in place of the model's own prose. An author who would rather ship the
model's prose than hold the guarantee opts out explicitly with `llmCheckLie({ failMode: 'open' })`.

**The non-run is always RECORDED, and never as the same observation as an approval.** Three outcomes,
each under its own name:

```
threw / rejected / timed out   judge-unreachable + llmcheck-unreachable:<failMode>   failMode decides
answered with empty text       judge-unreachable                                     allow
answered illegibly             judge-unreadable                                      allow
```

`failMode` prices a REJECTION and nothing else: a call that answered without reaching a verdict did not
reject, and scoring it as a detection would let one broken endpoint deny every reply in the session. So
"the check ran and approved" is never indistinguishable from "the check ran but answered nothing
legible", and neither is indistinguishable from "the check never ran".

## 2. The five hooks — and the CORRECT enforcement semantics

| Hook | Fires (backend primitive) | What a deny/violation does |
|---|---|---|
| `onInput` | before ANY model call, each turn (`inputProcessors` → `processInput`) | `a.abort(reason)` ⇒ the turn is REFUSED, no LLM call. Sees the REAL incoming `ctx.userText` plus `history`. Empty by default. |
| `preTool` | before a tool executes (`hooks.beforeToolCall`) | **VETO before execution** — returns `{ proceed:false, output:{success:false,error:correction} }`; the tool NEVER runs; the model self-corrects next step. |
| `postTool` | after a tool returns (`hooks.afterToolCall` → `enforcePostTool`) | The tool ALREADY executed. A failing invariant does **NOT** rewrite the result — its `{g,reason}` **joins the onReply redrive set** (an `output:${kind}:${tool}` correction is recorded), so the SAME bounded no-tools redrive relays the correction. Report/repair, never a veto. |
| `onReply` | on the committed terminal reply | Checked AFTER the mutators. Each violation drives a **bounded NO-TOOLS re-generate** (`toolChoice:'none'`), up to `controls.redrives` (default 1). On exhaustion the runner commits a deterministic guard-authored honest closure (`exhaustionReply`) — never the violating reply. |
| `onReplyMutate` | on the terminal reply text, before the onReply checks | Not a gate — a **deterministic egress rewrite** (`ReplyMutator.apply`, no LLM). The onReply checks then see the scrubbed reply. |

`addGuard(hook, target, guard)` with `target: 'any' | string[]`. A `preTool` gate may not hold a
`behavior`- or `output`-dim guard (the constructor throws) — those belong on `onReply`/`postTool`.
Resolution order per hook: **agent → full → base → minimal** (an agent guard's correction wins over an
inherited layer's).

### The PROSE-RENDERING RULE — "no guard prose outside the trunk"

**EVERY guard's `prose()` renders into the trunk. The HOOK decides WHERE it lands, never WHETHER it is
shown.** `renderScopedSpecTrunk` → `ruleBlocks` reads **all four guard hooks** (`onInput`, `preTool`,
`postTool`, `onReply`):

| binding | rendered section |
|---|---|
| `target` names TOOLS — **any hook** | `## Tool rules`, grouped by tool (a reply guard bound to a tool belongs with that tool) |
| `target:'any'`, `preTool`/`postTool` | `## Global tool rules` |
| `target:'any'`, `onInput`/`onReply` | **`## Reply rules`** (after `## Tool rules`, before `## Governance`, so the shared trunk HEAD is untouched and per-agent divergence still enters late — the trunk-static law) |

Prose is **de-duplicated globally and in order**: a string already emitted by an earlier section, or by an
earlier hook for the SAME tool, is not repeated (keys normalize whitespace/case/terminal punctuation). Each
rendered line strips the prose's own terminal `.`/`;` so the renderer's separators never double up.

**WHY every hook renders.** A doctrine under which `onInput`/`onReply` prose is never rendered creates an
implicit assumption — anyone reading a spec assumes the model knows the rule written there — which is a
source of inexplicable failure later. It also carries a real cost: an invisible onReply rule can only be
corrected by **redrive**, and redrive on a weak model degenerates into an exhaustion stub. Rendering all
hooks is cheap where it matters: the `## Reply rules` section lands after per-agent divergence, so the
pairwise common prefix — the cacheable trunk head — is untouched.

**`controls.directives` has exactly one purpose.** A directive is the way to express a
*state-conditional* `IF <cond> → <directive>` line in `## Governance`. It is **not** a workaround for
making a reply rule visible — an installed guard's prose renders on its own. Do not reach for a directive
merely to surface a reply rule; install the guard and its prose renders.

**`onReplyMutate` has NO prose BY CONSTRUCTION — the one explicitly-listed exemption.** A `ReplyMutator` is
`{ kind, apply }` (`src/rules.ts`): the type has no `prose()` at all. This is not a hidden rule — it is
**not a rule**. A mutator is a deterministic egress rewrite that always succeeds and needs zero model
cooperation (`jargonScrub` is the only shipping one: internal field names → user words). There is nothing
the model could do differently, so there is nothing to tell it. Adding prose would only invite the model to
pre-empt a rewrite that is guaranteed anyway. **If a future mutator ever encodes a rule the model could
violate, it is the wrong shape — write it as an onReply guard instead.**

### THE PROSE≠REASON LAW

> **`prose()` NEVER returns the `reason`.** `reason` is what the model reads **when it violates**
> (post-hoc, may speak in the past tense, may name what went wrong). `prose()` is what the model reads
> **before it acts** (a followable RULE, present/imperative, derived from the guard's PARAMETERS).
> **A guard whose prose speaks in the past tense, or accuses the model, has the wrong shape.**

Why this is a defect and not a style note: because EVERY guard's prose renders into the trunk, a
reason-as-prose kind puts a post-hoc accusation into the model's *pre-action* instructions. A
`## Reply rules` line of the shape:

```
- You described generating an invoice, but generateInvoice did not succeed this turn — state what actually happened.
```

means the model reads, before doing anything, a sentence asserting it already failed. That is a plausible
driver of over-caution (the observable regression shape: after an explicit "yes, I confirm" the agent
re-asks instead of executing). The correct rendering is derived from the parameters:

```
- only state that generateInvoice was done after generateInvoice has actually succeeded this turn.
```

**Three kinds derive their prose mechanically** — `forbidThisTurn`, `maxCalls`, `mustAccountFor`
(the runtime's `DENY_ONLY_PROSE_KINDS`). Each builds the
sentence from its own arguments (tool name, `n`, `scope`, target/outcome list) and
accepts an OPTIONAL author override (`prose?: string`, or `opts.prose` on the object-arg kinds). The
override never defaults to `reason`. `precondition` is the reference pattern (separate `reason`
and `prose` params) and is the model to copy for any new kind. The behaviour lives in the KIND — bundles
inherit it; do not hand-patch a spec. A bundle that passes `reason` *expecting* it to render is a **Q11**
lint finding, not a manual repair.

**Two further kinds follow the law with derived/neutral defaults.** `resultInvariant(pred, reason, prose?)`
and `consentRequired({…, prose?})` do not render `reason`. `consentRequired` DERIVES its prose from the
tool list ("call `<tools>` only while this person's consent … is on record"); `resultInvariant`'s `pred`
is an opaque closure with nothing to derive from, so it takes a rule-shaped neutral default plus the
override. Both keep `reason` as the deny text.

**The one knowing exception is the 2-arg `precondition`.** `ok` is an opaque closure and, unlike
`consentRequired`, the kind has no tool list to derive from; a neutral default would not say WHICH
condition gates the call — strictly worse than the author's own `reason`. It stays `prose ?? reason` and
stays on notice: write that `reason` as a followable rule, or pass `prose`.

### THE PARITY PROOF — the prose law is MEASURED, not asserted

The prose≠reason law above says what a `prose()` must be. A proof suite that only tests `check()`
(L1/L3/collective/ratchet) cannot verify it, and a static lint cannot decide whether an English sentence
describes a predicate — `prose: () => reason` satisfies any tag-shaped rule. That is how an accusation can
ship in the model's pre-action slot, in the half of the pair that carries the behavioural result (the
prose half: guards-only enforcement is the weakest arm; prose recovers the gap).

What ties English to a predicate is BEHAVIOUR, and the FakeLLM makes behaviour deterministic:

> **the model that OBEYS the prose literally → `check()` stays SILENT.
> the model that VIOLATES it literally → `check()` DENIES.**

The parity proof requires that pair for EVERY exported kind, written purely as scripted model behaviour
driven through the real loop — never against the check's internal arguments, which would only re-state
L1. **If the obeying model cannot be written, the prose is not a followable rule, and that impossibility
IS the diagnosis.** The obeys side is instrumented against vacuous greens (a run that never reaches the
guard must declare `exercises:'abstain'` and say why), and each fixture PINS the prose byte-for-byte, so
changing a sentence forces the pair to be re-derived from the new one. `alsoObeys` runs carry the
adversarial readings.

**Direction matters.** A prose BROADER than its check is the safe residue (the model is told more than is
enforced). A prose NARROWER than its check is the defect: a model that follows the sentence exactly is
still denied, learns nothing from the correction, and burns a redrive. Two canonical
narrower-than-check divergences and their resolutions:

| kind | narrower sentence | the sentence as shipped | why |
|---|---|---|---|
| `argRequired` | `always pass "<field>"` | `always pass a real, non-empty "<field>"` | the check also denies a present-but-blank value, so `title:"   "` obeys the narrow sentence and is denied anyway. |
| `argFormat` | `pass a "<field>"` | `pass a "<field>" of the form <pattern>` | the check also denies a present-but-malformed value, so a value that obeys "pass a field" but violates the shape is still denied. |

An `llmCheck` never has a row here: its whole question IS its prose, so the sentence and the thing
adjudicated are the same object and cannot diverge.

The lint that runs beside the proof (accusation-in-the-past marks + raw terminal names in model-facing
prose) backs two more prose facts: `confirmFirst` does not name the runtime-owned terminal ("only after
the user has **typed back the confirmation they were shown**" — the rule is about what the user did,
which survives any channel naming), and `noDuplicateCall`'s DENY text does not assert a bare
"it succeeded": it names what the earlier call actually **came back with** (including "came back EMPTY"),
because `ok` is true for an empty result and a text telling the model to "use the earlier result" would
point at nothing when the result was empty (the canonical shape: repeated list sweeps, each "successful",
each empty). A duplicate TERMINAL is corrected in plain terms instead of by internal name.

`ReplyMutator` kinds (`jargonScrub`) are the one CLASS-B exemption, declared explicitly in
`PARITY_EXEMPTIONS` with a reason: the type has no `prose()` at all, so there is no sentence to prove.
`custom` / `precondition` / `resultInvariant` take an opaque closure and therefore have no derivable
prose; their parity is proven per INSTANTIATION, with an author-supplied sentence — which is exactly what
the law already asks of them.

## 3. What auto-installs (single `AgentSpecBase`, zero app knowledge)

There is ONE spec class, **`AgentSpecBase`** (P9 — no Minimal/Base/Full ladder; a
spec is a spec). Its constructor auto-installs, from `cfg` alone:

| trigger | auto-installs (layer · id) |
|---|---|
| **always** | `noDuplicateCall` (preTool `any`, `minimal:noDuplicateCall`) · `degenerationGuard()` (onReply, `minimal:degenerationGuard` — the SOLE minimal onReply guard; markup + run-away-repetition branches only, no parameters — a language-specific judgment such as self-narration is text judgment, so an author who wants one binds an `llmCheck`) |
| `cfg.contract.writeTools` **non-empty** | `claimIsGrounded` + `claimIsComplete` (onReply, `minimal:*`) — the honesty cross-check over the world ledger, fed `contract.writeTools` + `contract.outcomes` |
| `cfg.contract.writeGate` **present** | `precondition(ok, reason, prose)` on `contract.writeTools` minus `exempt` (preTool, `minimal:writeGate`) — the domain's ONE statement of what its world refuses every write under, installed on every spec that carries a write. Declared with no `writeTools`, or with an `exempt` entry that is not a write tool, it throws at construction |
| `cfg.destructiveTools` **non-empty** | `destructiveThrottle(destructiveTools)` (preTool, `base:destructiveThrottle`) + `confirmFirst` on exactly those tools — the per-tool `cfg.confirmMechanism[tool]` (default `'arg'`) picks the id AND which call ACTS: two-step tools → `confirmFirst()` under `base:confirmFirst`, one-step tools → `confirmFirst({ flag: false })` under `base:confirmFirstPriorAsk`. The LIST installs the protocol; `cfg.destructiveWhen[tool]` decides which CALLS of a listed tool it applies to (absent ⇒ every call). **⊆-validated** (each destructive tool must be in `cfg.tools` or the constructor throws), and `cfg.destructiveLabels`, `cfg.confirmMechanism` and `cfg.destructiveWhen` are validated the same way |

So **2 kinds always install** (`noDuplicateCall` + `degenerationGuard`), the honesty cross-check pair
when the contract declares `writeTools`, and **+2 more when the agent holds a destructive tool.**

The NON-EMPTY reply guarantee is ENGINE-OWNED rather than a guard, because it is not a schema claim
either: the `respond` terminal's `message` `minLength` 1 is enforced (the mastra backend applies it in its
own zod input validation) but cannot decide emptiness, since a zero-width message SATISFIES it. The
backend-independent guarantee is the ENGINE FLOOR in `finalizeReply` (`runtime/turn.ts`): the composed
delivery is stripped of zero-width/format characters and, if still blank — including after a mutator
rewrite — routed to the non-empty engine-derived exhaustion closure instead.
Reply-honesty TEXT judgment ("did the reply claim an inability the tools do not support?") is likewise not
a runtime kind and there is no lexicon seam to feed one: it is an `llmCheck` question an author binds on
onReply where the domain needs it. There is **NO auto-schema layer** —
`argRequired`/`argFormat`/every other kind is authored explicitly by the spec at the agent layer.
The runtime-owned terminal `respond` may never appear in `cfg.tools`
(constructor throws) and is never guarded. A non-empty per-agent `persona` is required (persona-on-spec law: persona is per-agent, on the spec's `persona` field; a contract owns only invariants/language/stateBlock/exhaustion). The `minimal:`/`base:` id namespaces + install order are
byte-stable, so the layer-sorted trunk prose is deterministic.

## 4. The kinds — where the vocabulary of record lives

**There is no kind list in this file.** A per-kind signature table here would be a second author of the
same facts, and the copy with no test behind it is the one that goes stale.

The vocabulary of record is, in this order:

| for | read |
|---|---|
| authoring a spec — what each kind enforces, when to reach for it, a compiled example | [`docs/tutorial/04-guards.md`](../../docs/tutorial/04-guards.md) §5 |
| the same thing as DATA, for tooling | `GUARD_CATALOG` in [`src/guards/catalog.ts`](./src/guards/catalog.ts) (ships on `@looprun-ai/core/internal`) |
| exact signatures and every documented caveat | the factory's own JSDoc in [`src/guards/`](./src/guards/) |

Chapter 04 §5 is **generated** from `GUARD_CATALOG` by `scripts/gen-guards-chapter.mjs`, its examples
are compiled against the published facade, and `test/guard-catalog-parity.test.ts` holds the catalog
in bijection with the factories `src/guards/` actually exports. A kind cannot ship undocumented, and
a documented kind cannot outlive its factory. That is why the vocabulary lives there and not here.

The runtime carries **no risk-family taxonomy**: a numbered family scheme is the generator skill's own
reference vocabulary, and the runtime classifies its kinds only by the registries in `catalog.ts`. The
scenarios that exercise text-judgment risks run through an `llmCheck` with a scripted judge
([`test/proofs/catalog-risk-families.ts`](./test/proofs/catalog-risk-families.ts) is the byte-stable proof
key for them).

**The honesty core is the cross-check TRIO.** Honesty is NOT a reply-prose scan: a literal check over
prose is structurally broken — a mention scan for a record id passes on a reply that says the record was
NOT found, because polarity is unreadable by a pattern. The agent DECLARES what it did as STRUCTURE
(`respond`'s `did: TurnClaim[]`) and three deterministic guards GROUND that declaration against the world
ledger, which the agent does not control:

- **`claimIsGrounded`** — every ACTION intention matches the ledger: a `success` needs an effected write, `not_found`
  an empty read, `blocked`/`refused` a veto/refusal, `no_op` a call that ADDRESSED the entity and no effected
  write on it; an undeclared outcome word is always a violation. Auto-installed when the contract declares `writeTools`.
- **`claimIsComplete`** — every write that took effect this turn is covered by a DISTINCT `success` action
  intention that NAMES the entity (no silent action, and none hidden behind a vague or duplicated claim).
  Auto-installed alongside.
- **What counts as "a write that took effect"** — the UNION of two authorities, never their intersection:
  a call whose tool is in `contract.writeTools` and whose `tookEffect` is true, OR any
  call at all whose effect the WORLD ATTESTED. Keying it on the intersection alone would make a mutation
  through a tool the author forgot to list invisible to both cross-checks *while the guard catalog reported
  full coverage* — the ledger row would say `tookEffect:true` and the engine would decline to use it.
  `writeTools` is the domain's statement of intent (it decides whether the cross-check installs at all); it
  is a LOWER bound on the write surface, never an upper one.
- **Attested vs INFERRED effect.** A world that keeps its own ledger (`defineWorld`, `FixtureWorld`, any
  custom world) sets `tookEffect` per executor: that is an attestation, and it is trusted for any tool name.
  The native-tools/MCP path has no executor to ask, so the runtime infers the flag from the result
  (`ok && !requiresConfirmation`) and marks the row `effectInferred: true` — that means "the call
  succeeded", which every successful READ satisfies, so the `writeTools` intersection stays the rule there.
- **`mustAccountFor`** — a per-case coverage rule: each configured record appears in `did` with the required
  outcome polarity. Polarity is a FIELD, so a reply saying "no record of BK-1 was found" can never satisfy
  a `success` requirement. Config-bound, never auto-installed.

All three are TRUTH guards (never salvaged, never delivered over) and key on `target` + `outcome` vs the
ledger, never on op-name semantics or reply text — so they carry no pattern and cannot be broken by polarity.

**The matching laws.**

- *Identity is KEY-SCOPED*: an identity is a SCALAR under an identity key — `id`, `label`, `<entity>Id`,
  `<entity>_id` — whatever its type. Strings and numbers on the same footing: `{ id: 5 }` and
  `{ id: 'ORD-1' }` both name an entity, while `{ refunded: 500 }`, `{ count: 5 }`, `{ status: 'refunded' }`
  and `{ note: 'for customer jane' }` name none. Admitting every STRING leaf would let a
  status word, a note fragment, a tag or one word of the world's own sentence BOTH ground a claim and
  COVER the write it hid — the user reads `refunded: done` and is never told which order.
- *Boundary*: WHOLE-VALUE equality after canonicalization (trim, case-fold, strip EDGE punctuation) —
  never a substring, and never a token RUN either. `BK-1` is not `BK-10`/`BK-12345`/`BK-1-EXTRA`/
  `xBK-1y`; `12` is not `Order 12` (one word of a name must not stand for the entity, since it stands
  equally for `Invoice 12`).
  Lookalikes fail CLOSED: unicode dashes, interior zero-width marks and invisible format characters never
  collide with the ASCII id, and a case fold never crosses scripts (U+212A KELVIN does not fold onto `k`).
  A `target` carrying any invisible format character is rejected outright by `validateClaims`.
  **Limit**: the comparison is case-FOLDED within a script, so ids that differ only by case (`ab-1` vs
  `AB-1`) collide — a domain whose ids are case-sensitive must not rely on case alone to distinguish them.
- *A write speaks for ITS OWN entity*: `success` grounding and write COVERAGE match a result's PREFERRED
  identity — the shallowest identity keys, `id`/`label` winning over the `<entity>Id` references beside
  them. `{ id:'ORD-1', parentId:'ORD-2' }` therefore means ORD-1 and only ORD-1; otherwise two claims on
  the RELATED entity would cover two writes and the acted-on one would vanish from the report.
- *Provenance*, stated per polarity: a claim of PRESENCE (`success`) grounds ONLY against values
  the WORLD issued — scanning agent-authored args would make grounding circular. A claim of ABSENCE or
  NON-EFFECT (`not_found`, `failure`, `blocked`, `refused`, `pending_confirmation`, `no_op`) cannot obey
  that, because an absent record issues no value: those arms ground on the world's own negative answer
  (an empty read / `ok:false` / a `requiresConfirmation` flag / a guard veto) PLUS the identity-KEY ARGS
  that say which entity was addressed. Free-text args are not identities, so a `query` string can never
  carry a verdict, and a `note` can never fabricate a refusal on a bystander. These polarities never enter
  the covering set, so they can never hide a write.
- *`amount` is corroborated*: when a claim carries an `amount`, that number must appear among the
  magnitudes of the same ledger fact that grounds the claim (the world's result for a presence claim, the
  attempted args for an absence/veto claim). It is rendered by the domain seam into the block the engine
  advertises as verified, so an unchecked figure would be a fabricated number delivered as fact.
  **Limit**: the comparison is between RAW NUMBERS and knows nothing about units. A world that reports
  cents (`{ amount: 1250 }`) while the domain's claims report currency units (`amount: 12.5`) false-denies
  every honest claim. Report the figure in the same unit on both sides, or do not carry `amount`.

**What a domain must do for this to work.**

| requirement | why |
|---|---|
| every WRITE result carries `id` or `label` (or `<entity>Id`) naming what it touched | it is the only thing a `success` claim can match, and the only way an effected write can be covered |
| the identity value EQUALS the entity name the agent will report (`"BK-1"`, or `"Booking BK-1"` if that is the whole name) | matching is whole-value; an id embedded in a longer label does not match |
| every READ takes the entity under an identity-key ARG (`{ bookingId: 'BK-1' }`, not `{ query: '…' }`) | a `not_found`/`no_op` has no other way to name its subject |
| an EMPTY read returns a data channel — `data: []` (or `found: false`) | emptiness needs positive evidence; a result whose only field is a status sentence is undecidable and fails closed |
| write results report their magnitudes when the domain renders `amount` | the figure is checked against them |
| the world records `tookEffect: true` for a call that CHANGED something and `false` for one that did not — **including reads** | it is an ATTESTATION, and the write surface is keyed on it: a read recorded as effectful will be demanded in the report; a mutation recorded as effect-free can be hidden |

A domain that does none of this is not silently degraded — the cross-check finds nothing to match, the
guard fires, the turn redrives and the engine closure delivers. Fail-closed by design.

**The fail-closed edges of the identity-key rule** (an adapter/world author's checklist — each one is a
world that must be re-shaped, never a guard to relax):

| world result | grounds an identity? | why |
|---|---|---|
| `{ id: 5 }`, `{ orderId: 5 }`, `{ order_id: 5 }`, `{ id: 'ORD-1' }` | ✅ | a scalar under a singular identity key |
| `{ orderIds: [5, 6] }` | ❌ | a PLURAL key is not an identity key — return one result per entity, or a string id |
| `5` (a bare scalar result) | ❌ | nothing names it; wrap it (`{ id: 5 }`) |
| `{ ORDER_ID: 5 }` | ❌ | the key match is exact-cased on the documented spellings — use `orderId`/`order_id` |
| `{ status: 'ORD-1 refunded' }` | ❌ | a SENTENCE is prose, not an identity — put the id under `id`/`label` |
| `{ id: 'ORD-1', parentId: 'ORD-2' }` | ✅ ORD-1 only | a write speaks for its own entity, not the ones it references |

**The engine's own sentences are `contract.engineText`.** The record closures and the consent question
are what the ENGINE puts on the user's screen, so a conversation held in another language declares them
(`Partial<EngineText>`, falling back per key to the engine's English). It is not cosmetic: the user has
to TYPE the consent token back, so an instruction they cannot read is an act that can never be agreed
to. The TOKEN itself is engine-issued and identical whatever language the sentence around it is in.

**The domain render seam (`contract.renderClaim`) never receives the `op`.** It is handed the VERIFIED
fields only — `target`, `outcome`, `amount` — because its output is delivered to the user verbatim and
`op` is free agent-authored text. The parameter type (`RenderedClaim`) types `op` as `undefined`, so a
domain that reads it does not compile.

Speech intentions (`inform`/`greet`/`refuse`/`ask`) are never grounded and never cover a write, so an
action can never hide behind an `inform`.

**The SHADOW LAW — every door, not one.** A domain `outcomes` map may not key a core outcome word in
any casing, WIDTH or accent form: the key is folded (NFKD → strip combining marks → strip invisibles → trim
→ lowercase) before the test, so `Success`, `ＳＵＣＣＥＳＳ` and `PENDİNG_CONFIRMATION` are all refused — each
reads as the core word to a human reviewing the vocabulary, which is exactly the lie the law exists to stop.
And it is enforced wherever the map ENTERS, not only at the spec constructor: `AgentSpecBase`,
`claimIsGrounded`, `claimIsComplete`, `mustAccountFor`, and `packages/eval`'s config loader (which builds
a contract-less spec and so never passes through the constructor at all). It is a LOAD-time
assertion, never a check-time one, and it is idempotent, so asserting it at several doors costs nothing.

**THE MANDATORY-DECLARATION FLOOR — engine-owned, beside the blank-delivery floor.** A candidate
reply payload carrying ZERO intentions is not deliverable, and the `respond` schema's `minItems:1` is NOT
the guarantee: it counts entries and cannot express the speech/action partition, so one schema-legal
malformed intention (`{op:'inform', outcome:'success'}` — the likeliest `did` mistake a weak model makes)
is dropped by `validateClaims`, and a pipeline that accepted the empty declaration left behind would
deliver raw prose with no report and no violation. Two doors close that:
`terminalPayloadRejection` refuses a malformed payload at the terminal boundary (so it never becomes an
observation, and the model gets the validation errors back), and `finalizeReply` denies any undeclared
candidate as a `declarationPresent` violation — TRUTH-class, so it is never salvaged over. A model that
still declares nothing gets the engine-derived closure, which declares its OWN speech intention: no
delivered turn ever seals an empty `did`.

Between them, the declaration floor and the schema cover the reply-shape jobs no guard kind carries:
coverage and polarity over what was reported are `mustAccountFor`'s (over the structured `did`, not the
prose), a judgment about wording — one question per reply, how often a phrase may recur — is an `llmCheck`
a bound question (punctuation and CTA literalism have no sound structural reading), and NON-EMPTINESS is the ENGINE
FLOOR in `finalizeReply` (`runtime/turn.ts`), not the `respond` schema's `message` `minLength` 1. That
constraint IS enforced (the mastra json-schema→zod conversion carries `minLength`/`minItems`/`description`
through, so zod rejects a violating call before the terminal executes), but a whitespace-or-zero-width
`message` satisfies it. The floor strips zero-width/format characters from the composed delivery and, when
still blank, routes to the non-empty engine-derived exhaustion closure — catching both a schema-bypassed
blank `message` and a post-mutator blank rewrite.

### Reader-of-record notes — the traps a guard author gets wrong

What the code does, where a reader might reasonably assume otherwise. These are the notes chapter 04
does not carry: they are about the enforcement path, not about choosing a kind.

- **`ok` MEANS "THE CALL EXECUTED", NEVER "THE ACTION SUCCEEDED".** `ranThisTurn` — the reader several
  kinds key on — tests `ObservedCall.ok`, and that is a silent assumption about how the WORLD reports
  refusals. A world that THROWS on refusal gives `ok:false` and everything adjudicates normally. A world
  that RETURNS its refusal (`{ reason: 'part_unavailable' }` — reasonable, arguably better design) gives
  `ok:true`, so a kind that short-circuits on "the tool ran" treats a refused write as a success — the
  agent can then announce a record right after the world refused to open it. The runtime cannot detect
  this by inspecting the result — what counts as a refusal is business vocabulary (P8a) — so a domain
  passes its own `succeeded?: (ctx) => boolean` predicate (to `custom`/`precondition` guards) or writes
  an `llmCheck` question that reads the result. **If your world reports refusals as results, account for it.**
- **`ObservedCall` carries no result payload.** A guard that needs to reason over a tool RESULT (an empty
  read, a partial write) reads it through `postTool`'s `ctx.result` (the just-returned value) or through
  the world's own `toolCalls` ledger — never through `observed`, which holds only name/args/ok/turnIndex.
  A reply-side judgment over results ("did the reply overstate an empty search?") is an `llmCheck` question.
- **THE RECENCY LAW, where a licence is still a past EVENT.** An EVIDENCE guard — a past call that is
  PROOF work was done — defaults `within` **UNBOUNDED**: `requiresBefore` (a read from turn 1
  legitimately grounds a turn-3 write); pass `within` to bound it. Consent needs no such window: a
  consent is not an event the agent can point back to but a literal the user has to type, and consuming
  it closes it.
- **NOTHING THE AGENT EMITS IS A LICENCE.** Not a declared `ask`, not the tool's own prior successful
  run, not a vetoed attempt, not a probe. Admitting the tool's own prior run would chain turn by turn
  into a self-sustaining licence — turn 1 licenses turn 2, turn 2's run licenses turn 3 — one consent
  authorising an unbounded destructive run. Admitting a vetoed attempt would be worse: a call denied BY
  THIS VERY GUARD lands in `observed` with `ok:false`, so the gate would defeat itself in two turns.
- **A CONSENT NAMES ITS RECORD.** The token carries the identity the world issued, compared by
  whole-value equality, so a consent given for `BK-1` never reaches `BK-12` and a consent for one tool
  never reaches another.
- **Misconfiguration that would make a safety kind INERT throws at CONSTRUCTION, never at check
  time.** `consentRequired` on empty `tools` (or a blank `reason`, whose falsy deny value would read as
  "allowed"); a `destructiveLabels` entry for a tool that is not destructive; a `destructiveWhen`
  predicate for a tool that is not destructive, which would gate nothing because the protocol it
  modifies was never installed there; two labels whose first two
  words agree, which derive ONE token for two different acts. A tool that is destructive only on some
  of its calls IS on `destructiveTools`, so its label is legal and its predicate has a protocol to
  narrow. An inert safety guard still reads as
  coverage in a spec header, which is worse than an absent one — so it breaks the build. An `llmCheck`
  with an empty `question` fails the same way (nothing for the judge to answer).

### The consent story — a token the engine issues and the user types back

Ask-before-you-act is not a thing the agent declares. It is a literal the ENGINE writes onto the user's
screen and the USER writes back, and the agent has no channel that produces one.

```
 ①  the world raises it   a call that answers requiresConfirmation NAMES its record, and the engine
                          opens a question bound to that record
 ②  the denial raises it  a destructive tool with NO preview form is denied, and the denial opens a
                          question built from the label the spec declared
 ③  the engine renders    the question goes into the delivered text, between the agent's prose and the
                          operation record — the agent writes no part of it
 ④  the user answers      the runtime reads the incoming message ONCE, at turn start, and marks the
                          challenge consumed if their words carry its token
 ⑤  confirmFirst allows   the act runs iff a consumed challenge is about THIS call
```

The turn, end to end:

```
turn 1   agent:   cancelBooking({ id:'BK-1' })
         world:   { requiresConfirmation: true, id: 'BK-1' }
         screen:  Your booking BK-1 carries an 80.00 fee.

                  To confirm BK-1, reply: CONFIRM BK-1

                  No operation was carried out on this turn.

turn 2   user:    "yes, CONFIRM BK-1"
         engine:  the token matched → the challenge is consumed
         agent:   cancelBooking({ id:'BK-1', confirmed:true })   → ALLOWED
```

#### Who does what

| step | owner | why it is theirs |
|---|---|---|
| raising the question | the runtime | it holds both the world's answer and the spec's labels |
| writing the question | the engine | a sentence the agent writes is a sentence the agent can misframe |
| reading the answer | the runtime | reading text is done ONCE per turn, in one place, never in a guard |
| allowing the act | `confirmFirst` | a pure read of `ctx.consent` — no text, no state, no declaration |

`confirmFirst` takes two options, and neither is about licensing: `flag` says WHICH call acts, `when` says
WHICH calls are destructive. A
two-step tool distinguishes its preview from its act by an argument, and the preview must run — it is how
the world raises the question. `flag: false` is the one-step shape, where every call acts and every call is
gated. `when` is a pure predicate over the acting call's own arguments, keyed by tool:
`placeHold({scope:'asset'})` is an act the world carries out with no question raised, while
`placeHold({scope:'workspace'})` is gated on the token like any destructive call. A tool with no predicate
is destructive on every call.

#### The matching law

One law decides every "is this string THAT string" verdict in the engine — claim-to-ledger grounding, the
consent token, and a value recorded on the user's behalf:

```
against ONE value        canonical forms EQUAL — trimmed, case-folded, edge punctuation stripped
against a PERSON'S text  the value's tokens appear CONTIGUOUS, each equal as a WHOLE
                         split on WHITESPACE, never on punctuation
```

Substring matching is the failure it exists to prevent:

```
user says   "cancel the BK-12"
pending     CONFIRM BK-1
substring   "BK-1" occurs inside "BK-12"  → consent accepted for the wrong record
```

Consent fails CLOSED. `"go ahead"` is a human yes and is denied; the question is simply asked again.

#### The life of a question

```
open        from the moment it is raised
consumed    single use — a second act on the same record needs a new question
superseded  a different question about the same act closes the previous one
closed      the record it names changed, so the sentence it asks is no longer true
```

There is no turn window. What bounds a stale token is that consuming it requires typing that exact
literal, and that consuming it closes it.

#### What the ask intention is FOR

`ask` remains a speech classification in `did`. It licenses nothing, proves nothing and reports nothing.
Because it is self-declared, what it may drive is bounded by the direction of the incentive:

> the `ask` MAY feed anything that PENALIZES over-declaring.
> the `ask` NEVER feeds anything that RELIEVES over-declaring.

| may read `ask` | what a false `ask` buys |
|---|---|
| the session is not treated as resolved | nothing |
| a follow-up reminder when the user goes quiet | a spurious reminder |
| escalation to a human after repeated questions | earlier escalation |
| a throttle on questions asked before acting | the agent is blocked sooner |
| routing the user's next message back to the asker | the agent loses the routing |
| an open microphone on a voice channel | a microphone open over nothing |
| turns-spent-asking as a measurement | the agent's own number gets worse |

| may NOT read `ask` | what a false `ask` would buy |
|---|---|
| the operation record | the record softens and stops contradicting the prose |
| the lie check | the liar switches the check off by declaring a question |
| any honesty guard | the same |
| any licence | the defect this design closes |

#### What the engine GUARANTEES about consent

| property | deterministic |
|---|---|
| the user saw a question about this exact act | **YES** — the engine wrote it |
| the question names what it authorizes | **YES** — the world's record identity, or the spec's label |
| the user agreed | **YES** — their own words carry the engine's token |
| the agent cannot forge, reframe or skip any of the three | **YES** |

No model participates in a consent decision.

#### What a DOMAIN must declare

| obligation | when |
|---|---|
| a preview form that answers `requiresConfirmation` and names its record under an identity key | a two-step destructive tool |
| a `destructiveLabels` entry — the human-facing words the question is built from | a destructive tool that acts on no identifiable record, including one whose destructive branch names a record its arguments never carry (a hold over a whole workspace is that shape: listed, predicated, and labelled) |
| `engineText`, the engine's own sentences | a conversation held in a language other than English |

A destructive tool with neither a record nor a label can raise no question, so it can never be consented
to and never runs. Absence of a label is absence of any possible consent.

Two labels whose first two words agree derive the same token and are a construction error: one typed
literal would consent to either act, which is not what the user read.

#### What a BACKEND must do

Two obligations, both load-bearing — a backend that skips either fails CLOSED (acts get denied), never
open:

1. **CALL `beginTurn` WITH THE INCOMING MESSAGE.** It is the one place the user's text is read for
   consent: an open challenge becomes consent there, or nowhere. A backend that opens a turn with an
   empty `userText` (the stream path, a caller-managed message array) simply never carries consent, so
   every gated act is denied.
2. **RECORD WHAT EACH CALL DID** on `world.toolCalls`, with `tookEffect`. `destructiveThrottle` treats an
   EXECUTED call as a PROBE only when the world POSITIVELY recorded that it changed nothing
   (`tookEffect === false`); a call that RAN and left no record has UNKNOWN effect and counts against the
   one-effect-per-turn cap. Reading a world whose ledger nothing writes as "every call changed nothing"
   would make the throttle inert on the whole native-tools/MCP path.
   `defineWorld` and `FixtureWorld` record every exec; native-tools mode records in the guard hook,
   deriving effect from the result (a call that succeeded and did not come back asking for confirmation
   changed something). A custom world that logs only mutations will see its probes counted — record them
   with `tookEffect:false`.

   This obligation covers EXECUTED calls only. A same-step SIBLING (`siblingCallsThisStep`) has been
   admitted but has not run, so `tookEffect` is `undefined` for it by construction and its declared
   confirm flag is what decides — otherwise a legitimate multi-preview ("preview cancelling both
   bookings" ⇒ two `confirmed:false` calls in one step) would have its second call vetoed for an effect
   neither call has had yet. **NOT-CONFIRMED is the preview shape**, exactly as `confirmFirst` reads it: a
   sibling declares a preview when `args[confirmArg] !== true`, which covers both `confirmed:false` and an
   OMITTED flag. `AgentSpecBase` passes its `'prior-ask'` tools to the throttle as `flagless`: they carry
   no confirm flag at all, so nothing in their args can declare a preview and every admitted call of them
   counts — otherwise the rule above would leave the same-step cap inert on that whole mechanism.

   The residual is stated rather than hidden: a FLAG-GATED tool that MUTATES without `confirmed:true` and
   is emitted N times in ONE step is not capped — and it is UNBOUNDED N, not merely two: the cap is per
   recorded effect and a sibling has none, so there is no counter over admitted previews. Nothing
   observable separates those calls from the honest multi-preview at admission time. What bounds the shape
   instead: the cross-step form IS capped (the first call's effect is on record by then), `flagless` tools
   are capped from the first sibling, and a world that honours its own two-step protocol never mutates on
   an unconfirmed call.

**Sealing every turn** (`recordTurnHistory`, with the reply the user actually received) is a separate
obligation and it is not about consent: it is what gives `ctx.history` its content, which `valueFromUser`
reads to find a value the user gave several turns ago, and what every audit of a conversation is built
from. `LoopRunAgent.generate`, `runSpecConversation` and `LoopRunAgent.stream` all seal (the stream seals
on stream completion — a stream nobody consumes never finishes and is never sealed, which is the right
reading of a turn that was thrown away).

This section is mirrored in the generated chapter 04 preamble and in the agentspec `guard-catalog.md`,
which stay in lockstep with it.

## 5. Controls (`spec.controls: AgentControls`) — knobs OUTSIDE the hooks

Populated from `AgentSpecConfig`; wired by the Mastra backend unless noted.

| control | type | default | wired |
|---|---|---|---|
| `maxSteps` | `number` | 16 | tool-loop bound per turn (`stopWhen(stepCountIs)`). |
| `redrives` | `number` | 1 | bounded no-tools onReply re-generate count before the exhaustion terminal. |
| `terminal` | `(world: AgentWorld) => boolean` | — | **reply-only policy**: `true` ⇒ force a `respond` whose `did` declares NO `ask` intention this turn (reply-only protocol — no clarifying question). It bounds the AGENT, not the engine: a reply-only spec may hold a destructive tool and still take consent, because the confirmation question is engine-written. DISTINCT from `exhaustionReply` (the honest-closure text). |
| `directives` | `StateDirective[]` `{id, cond, directive, when?}` | — | rendered statically into the trunk `## Governance` section as `IF <cond> → <directive>`. Render-only: the `when` runtime predicate is **reserved, not consumed** by the backend. |
| `chains` | `ChainSpec[]` | — | declared follow-up completions (see below). Absent/empty ⇒ zero added effect. |
| `sampling` | `{ temperature?, topP?, maxOutputTokens?, seed? }` | — | per-agent AI-SDK call settings, merged OVER the conversation-level `modelParams` (agent wins) by `resolveModelSettings` — a creative agent at temp 0.7 beside a temp-0 admin agent in the same domain. |
| `exhaustionReply` | `(world, okTools: string[], produced: string[], violations: string[]) => string` | the engine's own closing sentence | the CLOSING SENTENCE committed when the reply STILL violates a check after all redrives — a PURE function of verified observations (structurally unable to fabricate). Precedence: spec → contract → engine. **It supplies the sentence, never the whole closure:** the engine ALWAYS prepends the operation record it derived from the ledger, exactly as the clean path composes `message` + record. |

**Why the override composes rather than replaces.** Its signature receives tool names and labels, not
claims, so it CANNOT re-render the operation record. An override that replaced the whole derived closure
would therefore deliver a domain sentence with no account beside it: *"I could not complete this safely —
nothing was changed."* — the natural abstain wording — would go out over a write the ledger had recorded,
while `ledger.did` held the derived truth, and history and the user would disagree. The report is
engine-owned on every path; an override that also narrates the operations will read as duplicating it,
which is the correct pressure — the sentence is the domain's, the account of what happened is not.

**`ChainSpec`** (`chains[]`): `{ after: string; call: string; when?: (world, observed) => boolean;
mode: 'direct' | 'llm'; args?: Record<string, unknown> | ((world, observed) => Record<string, unknown>) }`.
A veto guard can only BLOCK a wrong call; a chain deterministically COMPLETES a missing required follow-up
— iff `after` ran OK this turn and `call` did not (and `when` passes). `mode:'direct'` runs
`world.exec(call, args)` on the SAME guard-checked path (preTool guards still gate it — a chain cannot
bypass governance); `mode:'llm'` forces ONE pinned micro-generate where the model fills args. The `when`
and `args` functions are spec-authored business code — pure functions of `(world, observed)` ONLY by their
signature, **never the user text**: a chain trigger that forked on what the user said would be intent-based
routing (the loop-shaping law that stays banned) and the forced call must be reproducible. Only a
`mode:'llm'` micro-generate may see user text (the model filling args, not trigger code).

### The choose-gate composition pattern (a `custom` preTool recipe)

For the case `chains` cannot ship: world state records an **open offer/pitch** (e.g. `pitchState === null`)
and the correct next action forks on **user intent** — engage, dismiss, or an unrelated pivot that must
dismiss FIRST. A deterministic chain cannot fork on intent (that is the banned intent-based routing), and
an auto-dismiss `ChainSpec` is unshippable when its `(world, observed)` footprint is byte-identical across
the engage / dismiss / persist cases (adversarially provable: the trigger cannot tell them apart). Compose
two levers, neither ROUTING by intent:

1. A `custom` preTool veto (`run` dim): while the offer is open AND this turn has neither an ok
   engage-tool call nor the dismiss, DENY the unrelated-work toolset. The MODEL is forced to resolve the
   offer first; deterministic code only narrows *when* the choice is due. Keys on world+ledger only — no
   tool is scoped by intent, so the intent-routing ban holds. (A guard MAY read the user text; this one
   does not NEED to — a structural gate is model-independent. If the fork genuinely needs the text, an
   `llmCheck` is the intended tool.)
2. Terminal tools bypass preTool vetoes — pair the gate with a state-gated `contract.stateBlock` tail block
   (`## <Offer> (OPEN)`): pivot ⇒ dismiss first; hesitation ⇒ re-invite; NEVER invent identifiers from a
   description (the anti-fabrication caveat — required in practice: a stateBlock without it invites the
   model to fabricate a handle from a description).

**Census obligation before shipping:** enumerate every eval case where the offer is open and confirm none
needs a vetoed tool for its gold flow (a choose-gate over a tool some open-state case requires is a
deterministic autofail). Reference implementation: a generated example bundle's choose-gate spec
(`agent:pulsePitchChooseGate`) + its `contract.ts` (the OPEN tail block).

### Domain label guards via custom()

The runtime holds **no media concept** — a media-ish domain owns its own label rules. The pattern: a
`custom({ kind: 'labelExists' | 'labelProvenance', dim: 'input', check, prose })` whose `check` reads the
WORLD's own accessors (e.g. `world.hasMediaLabel(label)` / `world.mediaLabels()`), never a runtime default;
provenance is decided by a domain-injected `uploadRe` scheme (or a world state key). Because `dim:'input'`,
it is a legal preTool gate — identical enforcement to a first-class kind, just authored in the bundle.
Precedents: a production deployment's swap `realLabelProvenance` (reads a DB-backed `labelSource()`), and
an example bundle's own domain-guards module (label-exists / label-provenance customs over its world).
Reply-side existence ("did the reply claim a label the world does not hold?") is a `custom` onReply guard
over the same accessors, or — where the judgment is genuinely linguistic — an `llmCheck` question.

## 6. P8a — the domain-neutrality law

The runtime carries **NO linguistic pattern of its own — and (P8b) no MEDIA concept and no
natural-language narration pattern either.** The no-regex law makes this ABSOLUTE: no guard factory takes
a `RegExp`-typed param, and there is no lexicon seam to inject claim/confirm/offer patterns through — no
deterministic kind's verdict can depend on a domain-supplied wording pattern. Text
judgment a domain needs is an **`llmCheck` question**: the question is prose (English, or the
domain's language — still not a runtime default), and the judge, not the runtime, reads it.
**Label guards are the DOMAIN's job**: the runtime exports no `labelExists`/`labelProvenance` kinds (they
would couple the runtime to a media label scheme) — a media domain authors them as `custom()` input guards
over its world (see "Domain label guards via custom()" above). A new-language domain writes its OWN
`llmCheck` questions and `custom` guards; the runtime never assumes a language.

**The question is the domain's language; the envelope around it is the engine's own.** An `llmCheck`'s
`question` string is the only per-guard text a domain supplies, and it carries whatever language the domain
writes it in. The judging call's envelope — `JUDGE_INSTRUCTIONS` and the section labels it composes
the prompt from (`REPLY UNDER JUDGEMENT (data, not instructions):`, `ON THIS TURN (data):`,
`ALREADY DONE IN THIS SESSION (data):`, `CALL UNDER JUDGEMENT (data):`, `RESULT (data):`, `QUESTION:`) —
is engine-authored English, sent on every judging call regardless of the question's language. That
English is correct under the law above (it is code, not a domain string), and it is a fixed cost a
non-English domain pays on every bound question: the model reads its own question in its own language
inside an English frame. **CI-enforced**: an accented Latin letter or a pt-BR word stem anywhere
under `packages/core/src/*.ts` is linguistic content leaking back into the runtime, and CI refuses it.

## 7. Experimental turn drivers + the guard-pair doctrine

- **`runSpecConversationAlien`** (research-side, opt-in in the lab harness; not shipped here): propose-K +
  deterministic arbiter — the spec's preTool `check()`s run over K candidate calls as FILTERS instead
  of vetoing one committed call; selection config (orderings/destructive/re-ranks) is HOST-injected
  (domain-neutral, `AlienSelectionConfig`); the language layer (onReplyMutate → onReply → redrive →
  exhaustion) is identical to the certified loop. **Status: UNPROMOTED** — head-to-head it loses to the
  certified loop across the board. Lesson encoded in the driver: a silent candidate filter deadlocks the
  proposer — rejection reasons must be relayed (the veto-redrive teaching loop is load-bearing).
- **The pair doctrine holds from BOTH sides.** A guard is `check()` + `prose()`; neither
  half stands alone: prose-without-check collapses on weak models, and
  check-without-prose collapses even on small local models (removing the prose gains ZERO
  speed — the byte-stable trunk is prompt-cached once per agent, so trunk prose is near-free — and only
  loses quality). Corollary for authors (human or the skill): a checkable rule stated in prose MUST also
  install its check — enforced at authoring time by the generator skill's spec-quality lint (Q1/Q7),
  beside the purity lint.

## 8. `behavior[]` — the LANGUAGE/JUDGEMENT layer

With the PROSE-RENDERING RULE (§2), every rule that HAS a guard states itself in the trunk,
from the guard's own `prose()`. That leaves one honest job for `spec.behavior[]`:

> **`behavior[]` is the LANGUAGE / JUDGEMENT layer — the prose whose rules have NO possible check.**

It is the **declared residue of the proxy sweep** (the generator's decidable-proxy sweep): every candidate rule is
pushed at a decidable proxy; whatever survives as **UNCHECKABLE + PROXY-ATTEMPTED** is what belongs in
`behavior[]`. Tone, ordering of explanation, warmth, how much context to give, when a summary reads as
condescending — things a `check(ctx)` cannot decide because they are matters of judgement, not of state.

**A `behavior[]` line MUST NOT restate a rule a guard already enforces.** Since every guard's prose
renders, such a restatement is pure drift risk — two copies of one rule, only one of which is coupled to
the check. When the guard's `reason` or `prose` is later tuned, the `behavior[]` copy silently diverges
and the model reads a contradiction.

Enforced at authoring time by **Q10** in the generator skill's spec-quality lint: a
`behavior[]` line is flagged when it names a tool that already carries a guard with prose, or when it
repeats ≥8 consecutive words of any `prose()`/`reason` in the same spec. Q10 is a **HARD finding**
(the decidability law: a census nobody has to clear is a census
everybody scrolls past). The resolution is still an authoring judgement call — delete the line, narrow
it to the judgement residue, or own an explicit `// lint-quality-exempt: <reason>`.
