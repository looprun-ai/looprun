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

## 1. The GuardCtx contract — full context (firewall retired 2026-08-02)

A `check()` reads ONLY `GuardCtx`, but that ctx now carries the WHOLE conversation — `args`, `tool`,
`world` (host-injected read/exec seam), `observed` (the conversation's `ObservedCall[]`, each carrying
`turnIndex`/`ok`/`resultFlags`), `turnIndex`, `reply`, `producedThisTurn`, `attachmentsThisTurn`,
`result` (postTool only), `notes`, **`userText`** (the current turn's incoming message, verbatim) and
**`history`** (every prior turn, turn-structured and read-only: `userText`/`reply`/`toolCalls`/
`attemptedCalls`/`guardEvents`). The **"magnet firewall" (guards blind to user text) is RETIRED**: a guard
is deterministic code, so "influence" does not apply, and what the firewall protected decomposes into laws
with better owners — **intent-based tool routing** stays banned as a LOOP-shaping law (never scope tools
by what the user said), and **text pattern-matching** stays banned by the **no-regex law** (no guard
FACTORY takes a `RegExp`-typed param; a grep-gate in `guards-purity.test.ts` fails CI on any). A rule that
genuinely needs to reason over conversation TEXT is an **`llmCheck`** (§ below): a trusted rubric answered
by a host-registered adjudicator, whose verdict — not a closure-held pattern — becomes the deny. The
deterministic kinds still key on args / world / observed by CHOICE (a structural signal is model-
independent and cheap); that is a design preference now, not a wall.

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
> path). The only remaining caller is `argFormat`, which compiles an author-supplied string pattern —
> the no-regex law bars a RegExp GUARD PARAM, not `argFormat`'s structural string check.
> **Author rule for the runtime's own regexes stands:** a kind that ever tests a regex it did not build
> itself must call `matches()`, never `re.test()`.

### `observed` contains RUNTIME-OWNED TERMINAL calls (the reader-of-record trap)

`ctx.observed` is not a log of domain work. The Mastra backend pushes the runtime-owned terminal `respond`
into it with **`ok:true`**, from `beforeToolCall`'s synchronous segment (so a same-step ask — `respond` with
`asked:true` — is visible to a sibling destructive call's preTool checks). Two consequences a guard author must internalise:

1. **`observed` is never empty on a turn that produced a reply**, and
2. **it never carries an `ok:false` entry merely because the domain work failed.**

A guard that reasons about "did the model DO anything / did everything succeed" must filter terminals
first — `src/guards/shared.ts` provides `TERMINAL_TOOLS` / `domainCallsThisTurn(ctx)` for exactly this. Getting it
wrong is not a subtle bug: it makes the precondition **vacuously true**, and the guard then fires on the
turn where the model legitimately could not act and said so — vetoing the honest reply into a redrive and
out as an exhaustion stub. That is the highest-severity failure class this trap produces (it bit hardest
on the deleted regex-param honesty kinds, and any `llmCheck` rubric or `custom` guard that reasons about
"did everything succeed" inherits the same obligation). Kinds keyed on a NAMED tool are unaffected;
the consent kinds read the ask EVENT (`respond` with `asked:true`, via `isAskEvent`) deliberately.

**A guard MAY use an LLM to decide — that is `llmCheck`.** LLM adjudication is now a first-class guard
kind (§ the `llm-check` catalog entry). An `llmCheck` binds a trusted, pre-baked `rubric`; the runtime
delegates the verdict to a **host-registered adjudicator** (`Adjudicator` on the runtime options, like
`defineWorld`'s custom executors — NEVER named in config), which reads the rubric plus the relevant
`history` slice (user text included) and returns `{ violation: string | null }`. Its output is a deny
reason for the guard layer, never free text delivered to the operator; `failMode` (`'open'`/`'closed'`)
prices an unreachable adjudicator. Deterministic guards stay sync; an `llmCheck`'s `check` awaits, so the
hooks are async-capable. An `llmCheck` installed with no adjudicator registered fails LOUD at conversation
start (`assertAdjudicatorPresent`), never mid-turn. Prompt-injection is acknowledged and priced by evals,
not by blindness: the rubric is fixed, the channel is a verdict.

## 2. The five hooks — and the CORRECT enforcement semantics

| Hook | Fires (backend primitive) | What a deny/violation does |
|---|---|---|
| `onInput` | before ANY model call, each turn (`inputProcessors` → `processInput`) | `a.abort(reason)` ⇒ the turn is REFUSED, no LLM call. Sees the REAL incoming `ctx.userText` (it replaced the hard-coded `args:{}`) plus `history`. Empty by default. |
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
shown.** `renderScopedSpecTrunk` → `ruleSections` reads **all four guard hooks** (`onInput`, `preTool`,
`postTool`, `onReply`):

| binding | rendered section |
|---|---|
| `target` names TOOLS — **any hook** | `## Tool rules`, grouped by tool (a reply guard bound to a tool belongs with that tool) |
| `target:'any'`, `preTool`/`postTool` | `## Global tool rules` |
| `target:'any'`, `onInput`/`onReply` | **`## Reply rules`** (after `## Tool rules`, before `## Governance`, so the shared trunk HEAD is unchanged and per-agent divergence still enters late, trunk-static law) |

Prose is **de-duplicated globally and in order**: a string already emitted by an earlier section, or by an
earlier hook for the SAME tool, is not repeated (keys normalize whitespace/case/terminal punctuation). Each
rendered line strips the prose's own terminal `.`/`;` so the renderer's separators never double up.

**WHY every hook renders.** A doctrine under which `onInput`/`onReply` prose is never rendered creates an
implicit assumption — anyone reading a spec assumes the model knows the rule written there — which is a
source of inexplicable failure later. It also carries a real cost: an invisible onReply rule can only be
corrected by **redrive**, and redrive on a weak model degenerates into an exhaustion stub. Rendering all
hooks is cheap where it matters: the new section lands after per-agent divergence, so the pairwise common
prefix — the cacheable trunk head — is untouched.

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

**Three kinds derive their prose mechanically** — `forbidThisTurn`, `maxCalls`, `claimCoversRubric`
(the runtime's `DENY_ONLY_PROSE_KINDS`; the reply-text `replyMentions` / `replyMaxOccurrences` /
`replySingleQuestion` were deleted with tier-③, SCG-T5). Each builds the
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

**The one knowingly-retained residue is the 2-arg `precondition`.** `ok` is an opaque closure and, unlike
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
still denied, learns nothing from the correction, and burns a redrive. Three canonical
narrower-than-check divergences and their resolutions:

| kind | narrower sentence | the sentence as shipped | why |
|---|---|---|---|
| `argRequired` | `always pass "<field>"` | `always pass a real, non-empty "<field>"` | the check also denies a present-but-blank value, so `title:"   "` obeyed the narrow sentence and was denied anyway. |
| `argFormat` | `pass a "<field>"` | `pass a "<field>" of the form <pattern>` | the check also denies a present-but-malformed value, so a value that obeys "pass a field" but violates the shape is still denied. |

(The former `noFabricatedSuccess` / `noInstructionFromData` rows are gone with those kinds — the no-regex
law deleted them; the text judgment they encoded is an `llmCheck` rubric, whose whole rubric IS the prose.)

The lint that runs beside the proof (accusation-in-the-past marks + raw terminal names in model-facing
prose) backs two more prose facts: `noActAfterAskSameTurn` does not name the runtime-owned
terminal ("in the same turn **in which you ask the user a question**" — the rule is about the ACT,
which survives any channel naming; the ask itself is now `respond` with `asked:true`), and `noDuplicateCall`'s DENY text does not assert a bare
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
| **always** | `noDuplicateCall` (preTool `any`, `minimal:noDuplicateCall`) · `degenerationGuard()` (onReply, `minimal:degenerationGuard` — the SOLE minimal onReply guard; markup + run-away-repetition branches only, no parameters. The former language-specific self-narration branch was dropped with the no-regex law) |
| `cfg.contract.writeTools` **non-empty** | `claimIsGrounded` + `claimIsComplete` (onReply, `minimal:*`) — the SCG honesty cross-check over the world ledger, fed `contract.writeTools` + `contract.outcomes` |
| `cfg.destructiveTools` **non-empty** | `destructiveThrottle(destructiveTools)` (preTool, `base:destructiveThrottle`) + `confirmFirst` on exactly those tools — the per-tool `cfg.confirmMechanism[tool]` (default `'arg'`) picks the id AND the `via`: arg-flag tools → `confirmFirst()` (`via:'either'`) under `base:confirmFirst`, prior-ask tools → `confirmFirst({ via:'ask' })` under `base:confirmFirstPriorAsk`. **⊆-validated** (each destructive tool must be in `cfg.tools` or the constructor throws) |

So **2 kinds always install** (`noDuplicateCall` + `degenerationGuard`), the SCG honesty cross-check pair
when the contract declares `writeTools`, and **+2 more when the agent holds a destructive tool.** The former
always-on `emptyReply` GUARD is DELETED (tier-③, SCG-T5) — but the guarantee it carried is not a schema
claim: the `respond` terminal's `message` `minLength` 1 is ADVISORY only (mastra's json-schema-zod
conversion drops `minLength` at runtime, so it is never enforced there). The real, backend-independent
guarantee is the ENGINE FLOOR in `finalizeReply` (`runtime/turn.ts`): the composed delivery is stripped of
zero-width/format characters and, if still blank — including after a mutator rewrite — routed to the
non-empty engine-derived exhaustion closure instead. No runtime guard is needed for this.
The former lexicon-fed reply-honesty invariant (the auto-installed
`noFalseFailureClaim`) is RETIRED with the no-regex law — the `AgentSpecConfig.lexicon` seam is gone;
reply-honesty text judgment ("did the reply claim an inability the tools do not support?") is now an
`llmCheck` rubric an author binds on onReply where the domain needs it. There is **NO auto-schema layer** —
`argRequired`/`argFormat`/every other kind is authored explicitly by the spec at the agent layer.
The runtime-owned terminal `respond` may never appear in `cfg.tools`
(constructor throws) and are never guarded. A non-empty per-agent `persona` is required (persona-on-spec law: persona is per-agent, on the spec's `persona` field; a contract owns only invariants/language/stateBlock/exhaustion). The `minimal:`/`base:` id namespaces + install order are
byte-stable so the layer-sorted trunk prose is unchanged.

## 4. The kinds — where the vocabulary of record lives

**There is no kind list in this file.** One existed, drifted, and was removed: a per-kind signature
table here is a second author of the same facts, and the copy with no test behind it is the one that
goes stale (it was still headed "29 kinds" after the split shipped 30).

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

**The risk-family taxonomy is gone too — and so are the six kinds that carried it.** Six regex-param
honesty kinds used to be presented as the shipped proxies for six numbered "risk families"; the numbering
was a generator-side sweep artifact that read as a runtime taxonomy, and it was removed from the catalog
summaries in
[`governance/proofs/2026-07-29-guard-catalog-summaries-detaxonomized.md`](../../governance/proofs/2026-07-29-guard-catalog-summaries-detaxonomized.md).
With the no-regex law (2026-08-02) the kinds THEMSELVES are DELETED — text judgment is `llmCheck`'s job.
The family sweep belongs to the generator skill's own reference, which owns it. The proof file
[`test/proofs/catalog-risk-families.ts`](./test/proofs/catalog-risk-families.ts) is kept as a byte-stable
proof key; the scenarios it once drove through those kinds now run through an `llmCheck` with a scripted
adjudicator.

**The honesty core is the cross-check TRIO (SCG).** Honesty stopped being a reply-prose scan — the red-team
broke every literal check structurally (a mention scan for a record id passes on a reply that says the
record was NOT found; polarity is unreadable by a pattern). The agent now DECLARES what it did as STRUCTURE
(`respond`'s `did: TurnClaim[]`) and three deterministic guards GROUND that declaration against the world
ledger, which the agent does not control:

- **`claimIsGrounded`** — every ACTION intention matches the ledger: a `success` needs an effected write, `not_found`
  an empty read, `blocked`/`refused` a veto/refusal, `no_op` no effected write; an undeclared outcome word is
  always a violation. Auto-installed when the contract declares `writeTools`.
- **`claimIsComplete`** — every write that took effect this turn is covered by a DISTINCT `success` action
  intention that NAMES the entity (no silent action, and none hidden behind a vague or duplicated claim).
  Auto-installed alongside.
- **`claimCoversRubric`** — a per-case coverage rule: each configured target appears in `did` with the required
  outcome polarity. It REPLACES the deleted `replyMentions`/`replyConfirmsLabels` — polarity is a FIELD, so
  "no record of BK-1 was found" can never satisfy a `success` requirement. Config-bound, never auto-installed.

All three are TRUTH guards (never salvaged, never delivered over) and key on `target` + `outcome` vs the
ledger, never on op-name semantics or reply text — so they carry no pattern and cannot be broken by polarity.

**Two matching laws the red-team wrote (MI-T3).**

- *Provenance*: a `target` is compared only against the IDENTITY values the WORLD issued for a call (its
  result). A call's ARGS are agent-authored, and scanning them made grounding circular (one permitted write
  plus the fabricated id in a free-text arg used to ground a success on an entity never touched). "Identity"
  means what the world NAMED, not what it counted: string leaves are names; a number or boolean counts only
  under an identity key (`id`, `label`, `<entity>Id`, `<entity>_id`). So `{ id: 5 }` grounds a claim on `5`
  while `{ refunded: 500 }`, `{ count: 5 }` and `{ code: 200 }` name no entity — otherwise a claim on the
  AMOUNT of a write would both ground and COVER it, hiding the entity from the user.
  **The one remaining args path is deliberate and conservative**: a guard-VETOED attempt never reached the
  world and has no result, so `blocked`/`refused` ground against the attempt's args (same identity filter).
  Those polarities are self-incriminating — the worst an agent buys is reporting a refusal on something it
  never touched.
- *Boundary*: the comparison is whole-VALUE or whole-TOKEN equality, never a substring — `BK-1`, `BK-10`,
  `BK-12345` and `BK-1-EXTRA` are different entities. A token is a whitespace-delimited WORD with its edge
  punctuation stripped. **Limit**: the comparison is case-FOLDED, so ids that differ only by case (`ab-1` vs
  `AB-1`) collide — a domain whose ids are case-sensitive must not rely on case alone to distinguish them.

**What a domain must do for this to work.** Write results must NAME what they touched — a `label`/id value,
and it must stand as its own whitespace-delimited word (`"BK-1"` or `"Booking BK-1"`, not `"ref:BK-1"`). A
domain whose write results carry no identifying value gives the cross-check nothing to match, so its effected
writes cannot be covered: the guard fires, the turn redrives, and the engine closure delivers. That is
fail-closed by design.

Speech intentions (`inform`/`greet`/`refuse`/`ask`) are never grounded and never cover a write (MI-D5), so an
action can never hide behind an `inform`. And a domain `outcomes` map may not key a core outcome word in ANY
casing — that is refused at spec load, not at check time.
The four reply-TEXT guards they and the schema subsume — `replyMentions`, `replySingleQuestion`,
`replyMaxOccurrences`, `emptyReply` — are DELETED (tier-③, SCG-T5): `replyMentions` → `claimCoversRubric`,
`replySingleQuestion`/`replyMaxOccurrences` → `llmCheck` (punctuation/CTA literalism, no sound structural
fix), `emptyReply` → the ENGINE FLOOR in `finalizeReply` (`runtime/turn.ts`), NOT the `respond` schema's
`message` `minLength` 1 — that constraint is advisory only (mastra's json-schema-zod conversion drops it
at runtime). The floor strips zero-width/format characters from the composed delivery and, when still
blank, routes to the non-empty engine-derived exhaustion closure — catching both a schema-bypassed blank
`message` and a post-mutator blank rewrite.

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
  an `llmCheck` rubric that reads the result. **If your world reports refusals as results, account for it.**
- **`ObservedCall` carries no result payload.** A guard that needs to reason over a tool RESULT (an empty
  read, a partial write) reads it through `postTool`'s `ctx.result` (the just-returned value) or through
  the world's own `toolCalls` ledger — never through `observed`, which holds only name/args/ok/turnIndex.
  A reply-side judgment over results ("did the reply overstate an empty search?") is an `llmCheck` rubric.
- **THE RECENCY LAW (2026-08-02).** A LICENSING signal — a past event that UNLOCKS a new act — is
  turn-bounded by a `within` param (`1 ≤ currentTurnIndex − eventTurnIndex ≤ within`), so a probe/ask 20
  turns ago never licenses today's act. LICENSING guards default `within: 1` (the immediately-preceding
  turn, the natural two-step shape): `confirmFirst`'s probe/ask licenses, and `askedEarlier`. An EVIDENCE
  guard — a past call that is PROOF work was done, not a license — defaults `within` **UNBOUNDED**:
  `requiresBefore` (a read from turn 1 legitimately grounds a turn-3 write); pass `within` to bound it.
- **`confirmFirst`'s `via:'ask'` arm is SUCCESS-KEYED.** If its same-tool disjunct accepted ANY earlier
  attempt, `ok:false` included, then — because a vetoed call lands in `observed` with `ok:false` — **a
  turn-1 call denied BY THIS VERY GUARD would unlock the identical turn-2 call**: the destructive action
  runs with the user never asked, and the gate defeats itself in exactly two turns. Every disjunct
  requires `ok:true`. The same success-keying protects `askedEarlier` and `confirmFirst`'s `via:'probe'`
  record-bound arm.
- **Misconfiguration that would make a safety kind INERT throws at CONSTRUCTION, never at check
  time.** `consentRequired` on empty `tools` (or a blank `reason`, whose falsy deny value would read as
  "allowed"); `confirmFirst('probe'|'ask'|'either')` passed a `via` NAME to the string overload. An inert safety
  guard still reads as coverage in a spec header, which is worse than an absent one — so it breaks the
  build. An `llmCheck` with an empty `rubric` fails the same way (nothing for the adjudicator to answer).

### The consent story — three checkpoints, installed as a SET

Ask-before-you-act is not one guard. It is three, each gating a different thing on a different hook, and
a governed destructive flow installs all three TOGETHER — never two of them saying the same thing twice.

```
 ①  confirmFirst          gates the CALL   (preTool)  — the confirmed act runs only when an EARLIER
                                                        turn licensed it (a same-record probe or a prior ask)
 ②  askedEarlier          gates the ARG    (preTool)  — a value is RECORDED only after the operator was
                                                        asked for it and answered in a LATER turn
 ③  pendingConfirmMustAsk gates the REPLY  (onReply)  — when a probe returned requiresConfirmation and
                                                        nothing resolved it, the turn MUST pose an ask
                                                        (the delivered respond with asked:true), not
                                                        report the act as done
```

The ASK SIGNAL is now a FIELD, not a tool name (SCG): the single `respond` terminal carries `asked:true`
when the turn poses a question (`replyToUser`/`askUser` are retired). The consent kinds key on it via
`isAskEvent` over `observed` and, on the reply side, `ctx.asked`:
- **①** `confirmFirst`'s `via:'ask'`/`'either'` arm and **②** `askedEarlier` read an EARLIER-turn ask —
  `askedEarlier`'s PRIMARY signal is a sealed `HistoryTurn.asked === true`, with `isAskEvent` over `observed`
  as the pre-history fallback.
- **③** `pendingConfirmMustAsk` runs at onReply, where the delivered payload's `asked` is already seated, so
  its PRIMARY relay signal is `ctx.asked === true`; the observed-scan (`isAskEvent` this turn) is the FALLBACK
  for chain/mid-turn contexts.

They compose because they cover DISJOINT moments — the call, the argument, the message — and each keys on
its own structural signal (observed probe / earlier-turn ask · the gated arg + an earlier ask · an unresolved
requiresConfirmation probe + `ctx.asked`). The redundancy to avoid is stacking a SECOND call-gate next to `confirmFirst`:
it already carries the cross-turn requirement (`via` + the recency-law `within`), so a second consent kind
on the same moment is duplicate prose in the trunk, not extra safety. Reach for the checkpoint that matches
WHAT you are gating. This section is mirrored in the generated chapter 04 preamble and in the agentspec
`guard-catalog.md`, which stay in lockstep with it.

## 5. Controls (`spec.controls: AgentControls`) — knobs OUTSIDE the hooks

Populated from `AgentSpecConfig`; wired by the Mastra backend unless noted.

| control | type | default | wired |
|---|---|---|---|
| `maxSteps` | `number` | 16 | tool-loop bound per turn (`stopWhen(stepCountIs)`). |
| `redrives` | `number` | 1 | bounded no-tools onReply re-generate count before the exhaustion terminal. |
| `terminal` | `(world: AgentWorld) => boolean` | — | **reply-only policy**: `true` ⇒ force `respond` with `asked` false/absent this turn (reply-only protocol — no clarifying question). This is a per-turn terminal-surface policy, DISTINCT from `exhaustionReply` (the honest-closure text). |
| `directives` | `StateDirective[]` `{id, cond, directive, when?}` | — | rendered statically into the trunk `## Governance` section as `IF <cond> → <directive>`. Render-only: the `when` runtime predicate is **reserved, not consumed** by the backend. |
| `chains` | `ChainSpec[]` | — | declared follow-up completions (see below). Absent/empty ⇒ zero added effect. |
| `sampling` | `{ temperature?, topP?, maxOutputTokens?, seed? }` | — | per-agent AI-SDK call settings, merged OVER the conversation-level `modelParams` (agent wins) by `resolveModelSettings` — a creative agent at temp 0.7 beside a temp-0 admin agent in the same domain. |
| `exhaustionReply` | `(world, okTools: string[], produced: string[], violations: string[]) => string` | contract/`defaultExhaustionReply` | committed when the reply STILL violates a check after all redrives — a PURE function of verified observations (structurally unable to fabricate, never empty). Precedence: spec → contract → default. |

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
   tool is scoped by intent, so the intent-routing ban holds. (A guard MAY read the user text now; this one
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
over the same accessors, or — where the judgment is genuinely linguistic — an `llmCheck` rubric.

## 6. P8a — the domain-neutrality law

The runtime carries **NO linguistic pattern of its own — and (P8b) no MEDIA concept and no
natural-language narration pattern either.** The no-regex law (2026-08-02) made this ABSOLUTE: there is no
longer a lexicon seam to inject claim/confirm/offer regexes through — the guards that once took them
(`pendingConfirmMustAsk`/`confirmFirst`'s `askRe`, the deleted `noFabricatedSuccess`/`noFalseFailureClaim`/
`destructiveClaimRequiresSuccess`/`noCompetitorClaim`/`noOutOfSurfaceActionClaim`/`noUngroundedRegulatedFigure`,
`degenerationGuard`'s `selfNarrationRe`) either dropped the param (keying on a structural signal) or were
deleted. Text judgment a domain needs is an **`llmCheck` rubric**: the rubric is prose (English, or the
domain's language — still not a runtime default), and the host adjudicator, not the runtime, reads it.
**Label guards are the DOMAIN's job**: the runtime exports no `labelExists`/`labelProvenance` kinds (they
would couple the runtime to a media label scheme) — a media domain authors them as `custom()` input guards
over its world (see "Domain label guards via custom()" above). A new-language domain writes its OWN
`llmCheck` rubrics and `custom` guards; the runtime never assumes a language. **CI-enforced** by the accent/pt-stem lint
(`packages/core/test/runtime-neutrality.test.ts`): it scans every `packages/core/src/*.ts` for accented
Latin letters and pt-BR word stems and fails if any linguistic content leaks back into the runtime.

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
