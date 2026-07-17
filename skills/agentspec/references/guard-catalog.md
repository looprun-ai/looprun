# Guard catalog — the AgentSpec kind vocabulary (bundled, self-contained)

The vocabulary a drafter picks from in **Stage E2 (ENGINEER: draft)**. Every rule is authored as a **prose+check pair**:
one LLM-facing conditioned sentence (rendered into the prompt, **never read by any check**) and one
deterministic `check(ctx): string | null` (a string = deny + correction; `null` = allow). Pick a
**kind** below; reach for `custom()` only when no kind fits.

> This file is the portable copy that ships with the skill. **The authoritative source of truth is
> [`packages/core/GUARDS.md`](../../../packages/core/GUARDS.md)** (verified against the package source:
> the guard factory implementations in `packages/core/src/guards.ts` + the `Guard`/`GuardCtx` types in
> `rules.ts` + `AgentSpecBase`/`AgentControls` in `spec.ts`). A parity test in the looprun repo
> (`packages/core/test/guard-catalog-parity.test.ts`) fails if this list diverges from the exported
> factories.

## The five hooks

| hook | fires | a deny does |
|---|---|---|
| `onInput` | before the first model call, on the raw turn | terminal refusal (no LLM call) |
| `preTool` | before a tool executes | vetoes the call, feeds the correction back (same generation) |
| `postTool` | after a tool returns (the tool has already executed) | records the result; a failing result-invariant JOINS the reply redrive as a report/repair — it does NOT rewrite or block the result |
| `onReply` | on a terminal `replyToUser`/`askUser` | re-drives the model with the correction (bounded no-tools re-generate) |
| `onReplyMutate` | on the terminal reply text | deterministic egress rewrite (not a gate) |

**Prose reaches the trunk from `preTool` + `postTool` only.** `onInput` and `onReply` guard `prose()` is
never rendered (a reply-check has no trunk presence) — carry a behavior-layer requirement into the prompt
with a `behavior[]` bullet, not an onReply guard's prose.

**The S-1 firewall (non-negotiable):** `GuardCtx` carries **no user text** — args, tool, world
projection, observed calls, turn index, reply text, produced/attachment labels, result, notes. A
check may read ONLY these. This is what makes the guard layer model-independent.

## What auto-installs — one `AgentSpecBase` (zero app knowledge)

There is **one** spec class, `AgentSpecBase` (the former Minimal/Base/Full ladder is collapsed — a spec
is a spec). Its constructor auto-installs, layer-tagged:

| always / conditional | auto-installs | from |
|---|---|---|
| **ALWAYS** (every agent) | `noDuplicateCall` (preTool), `degenerationGuard`, `emptyReply` (onReply, `minimal:*`) | nothing (universal invariants). `degenerationGuard`'s markup+repetition branches are always-on; its third-person self-narration branch fires only when the lexicon injects `cfg.lexicon.selfNarrationRe` (else that branch is OFF — the runtime holds no narration language) |
| **IFF `cfg.lexicon.falseFailureClaimRe` provided** | `noFalseFailureClaim({ claimRe })` (onReply, `minimal:noFalseFailureClaim`, before `emptyReply`) | `cfg.lexicon` (auto-iff-provided — a lexicon-less spec is byte-stable) |
| **IFF `cfg.destructiveTools` non-empty** | `destructiveThrottle` + `confirmFirst` (preTool, scoped to those tools); `cfg.confirmMechanism[tool]` picks the confirmFirst id — arg-flag → `base:confirmFirst`, `'prior-ask'` → `base:confirmFirstPriorAsk` | `cfg.destructiveTools` (no-op when empty) |

So **2 kinds install for free always, +1 iff the bundle injects `cfg.lexicon.falseFailureClaimRe`, +2 more
when the agent holds a destructive tool**. There is **no auto-schema layer** — per-tool `argRequired` /
`argFormat` are AUTHORED explicitly. Every other kind is **agent-layer** (you add it). Resolution order per
hook: **agent → full → base → minimal** (first deny wins), and the `minimal:` / `base:` id namespaces keep
the trunk prose order byte-stable.

## The 23 guard kinds

`auto` marks a kind the constructor installs (`minimal` = always, `base` = iff `destructiveTools`,
`minimal*` = iff `cfg.lexicon.falseFailureClaimRe` is provided); everything else is agent-layer.

### preTool — ordering / preconditions / call-shape (dims: spatial · run · input)

| kind | dim | auto | one-line semantics |
|---|---|---|---|
| `requiresBefore(deps)` | spatial | agent | this tool may run only after every `deps` tool ran OK this conversation |
| `forbidThisTurn(reason)` | spatial | agent | this tool may not run this turn (unconditional deny) |
| `precondition(ok, reason, prose?)` | run | agent | deny unless `ok(world)` holds (the general world-state gate) |
| `maxCalls(tool, n, reason, {scope?})` | run | agent | at most `n` OK calls of `tool` in the budget window — `scope:'turn'` (default) = per-turn bulk cap, `scope:'conversation'` = across the whole conversation |
| `noDuplicateCall()` | run | **minimal** | block a byte-identical repeat call that already succeeded this turn (canonicalized args) |
| `confirmFirst(opts?: string \| { argFlag?, mechanism? })` | run | **base** | destructive-confirm gate keyed by MECHANISM. `'arg'` (default; a bare string sets `argFlag`): `confirmed:true` needs a prior-turn `confirmed:false` PROBE. `'prior-ask'` (flag-less tools): legal only after an `askUser` in an EARLIER turn (compose with `noActAfterAskSameTurn` for the same-turn edge). Auto-installed per `cfg.confirmMechanism` |
| `noActAfterAskSameTurn(tools)` | run | agent | deny any of `tools` when `askUser` already succeeded this turn — ask, wait, act in a LATER turn |
| `destructiveThrottle(destructiveTools)` | run | **base** | at most one successful destructive action per turn |
| `argRequired(field)` | input | agent | deny if `field` is missing/empty in args |
| `argAbsent(field)` | input | agent | deny if `field` IS present (mutually-exclusive args) |
| `argFormat(field, pattern, flags?, reason?)` | input | agent | deny if a present non-empty `args[field]` fails the regex (absent/empty deferred to `argRequired`) |

**Worked example — tool sequencing (spatial).** To enforce an ordered flow
`createPost → saveContent → generateImage`, add one `requiresBefore` gate per downstream tool naming
its predecessors (there is no single "chain" primitive — that's the one-gate-per-tool model;
`requiresBefore` takes a `string[]`):

```ts
spec.addGuard('preTool', ['saveContent'],   requiresBefore(['createPost']));
spec.addGuard('preTool', ['generateImage'], requiresBefore(['createPost', 'saveContent']));
// out-of-order call → deny: "Do createPost then saveContent FIRST — it must run before this tool."
// prompt prose (rendered):  "only after createPost → saveContent has run"
```

`replyToUser`/`askUser` are terminal (runner-owned, the turn ends there) — you never gate them; the
sequence is enforced on the tools **before** the reply. (To deterministically COMPLETE a missing
follow-up call rather than merely block a wrong one, use `controls.chains` — see Controls below.)

### postTool — on the tool result (dim: output)

| kind | dim | auto | one-line semantics |
|---|---|---|---|
| `resultInvariant(pred, reason)` | output | agent | after the tool returns, if `pred(result, world)` is false the `reason` joins the reply redrive (report/repair — the tool already ran, so never a veto) |

### onReply — reply honesty / shape / coverage (dim: behavior)

Every wording-keyed reply guard takes its language-specific regex as a **required injected param** — the
runtime carries no linguistic pattern of its own (the P8a lexicon doctrine below).

| kind | dim | auto | one-line semantics |
|---|---|---|---|
| `degenerationGuard({selfNarrationRe?})` | behavior | **minimal** | output-channel degeneration lint (first in the onReply tail). Built-in always-on: leaked think/tool-call/template markup + run-away line repetition (>=3x). The third-person self-narration branch is OPT-IN — fires only when `selfNarrationRe` is injected (from `cfg.lexicon.selfNarrationRe`); absent ⇒ OFF. Routes into the redrive battery; zero firings on clean subjects |
| `emptyReply()` | behavior | **minimal** | a terminal reply may not be empty/whitespace |
| `noFabricatedSuccess(tool, { reason, claimRe?, labelRe?, verbClaimRe?, banRe?, refExists? })` | behavior | agent | reply may not claim `tool` succeeded unless it ran+succeeded this turn. Three injected seams: invented LABELS (`labelRe` + `refExists(world,label)` existence predicate — attempt-independent); claim LANGUAGE (`claimRe`/`verbClaimRe` — attempt-keyed); and `banRe`, an UNCONDITIONAL ban phrase (absorbs the former `replyNoProductionClaim` kind). All **business-owned** (from the domain lexicon); `refExists` reads the domain world's accessors |
| `noFalseFailureClaim({ claimRe })` | behavior | **minimal\*** | reply may not claim inability when every tool this turn succeeded. **minimal\*** = auto-installed as `minimal:noFalseFailureClaim` when the bundle passes `cfg.lexicon.falseFailureClaimRe`; a spec may still add a tighter agent-layer instance. **Start from the default lexicon template (P8a section below) — a broad `cannot/unable` regex destroys honest policy refusals (measured 2026-07-16)** |
| `destructiveClaimRequiresSuccess(destructiveTools, { claimRe, askRe, offerRe, exemptRe? })` | behavior | agent | **attempt-keyed**: fires only when a listed destructive tool was ATTEMPTED this turn (executed or vetoed) — with no attempt a destructive verb is read-backed STATUS talk, left alone. Given an attempt, the reply may not DECLARE the action happened unless a confirmed call succeeded — sentence-scoped, offer-aware; exempts confirm-probes (`askRe`) and honest failures (`exemptRe`) |
| `pendingConfirmMustAsk({ askRe, confirmArg? })` | behavior | agent | if a tool returned `requiresConfirmation` this turn, the reply MUST relay the confirmation question — UNLESS the probe was RESOLVED this turn (same tool ran OK with the confirm flag `confirmArg` (default `confirmed`) set on the SAME record) |
| `replyMustMention(keywords, reason)` | behavior | agent | reply must mention ≥1 keyword (coverage) |
| `replyConfirmsLabels(labels, reason)` | behavior | agent | reply must be non-empty and name every acted-on label |
| `replyMaxOccurrences(ctas, n, reason)` | behavior | agent | at most `n` distinct CTA lemmas (anti-nag) |
| `replySingleQuestion(reason)` | behavior | agent | exactly one `?` per reply (recovery turns) |

> There is deliberately **NO LLM reply-check kind** in @looprun-ai/core — an impure in-guard judge
> forfeits the determinism certificate. A rule no deterministic check can express is
> language-layer: conditioned prose + an eval dimension. Any future reply-rubric must be
> pre-baked and trusted, never derived from user text (prompt-injection law).

### any hook

| kind | dim | auto | one-line semantics |
|---|---|---|---|
| `custom({...})` | any | agent | escape hatch — a hand-written `check`+`prose`; reviewers read the code. Use ONLY when no kind fits (`addGuard` throws if a behavior/output-dim guard is put on preTool) |

### The mutator (not a gate)

| factory | hook | semantics |
|---|---|---|
| `jargonScrub(map)` | `onReplyMutate` | deterministic egress rewrite of internal jargon → user words (`\bfrom\b → to`, applied before the onReply checks). In every shipping spec |

`canonArgs(v)` is also exported — the pure canonical-args fingerprint that backs `noDuplicateCall` — but it
is a **helper**, not a guard kind.

## The P8a lexicon doctrine — language lives in the business bundle, injected as params

`@looprun-ai/core` is **language- and label-scheme-neutral — and carries no MEDIA concept and no narration
language either**: no generic guard carries a claim-verb regex, a confirm-language pattern, or a label
scheme. Every such STRING/REGEX lives in the **business bundle's own lexicon** (`src/agents/<domain>/
lexicon.ts`, en-US or any language) and is passed back into the factory as a **required** param —
`noFabricatedSuccess(tool, { claimRe, labelRe, verbClaimRe, banRe, refExists, reason })`,
`degenerationGuard({ selfNarrationRe })`, `pendingConfirmMustAsk({ askRe })`,
`destructiveClaimRequiresSuccess(tools, { claimRe, askRe, offerRe, exemptRe? })`,
`noFalseFailureClaim({ claimRe })`. Media LABEL input guards are the domain's job — authored as
`custom({ dim:'input' })` over the world's accessors (see "Domain guards via custom()"), never runtime
kinds. A single-file lexicon typically exports:

```ts
export const CONFIRM_ASK_RE = /\?|\b(confirm|are you sure|do you want|shall i|proceed|go ahead)\b/i;
export const OFFER_OR_CONDITIONAL_RE = /\b(if you(?:'d| would)? (?:want|like)|would you like me to|i can|shall i|let me know)\b/i;
// attempt-context failure verbs ONLY — see the default template rule below this block
export const FALSE_FAILURE_CLAIM_RE =
  /\b(failed to|error(?:ed)? (?:out|occurred)|ran into (?:an )?error|something went wrong|tried (?:to|but) [^.!?\n]{0,32}(?:failed|didn'?t work))\b/i;
```

> **Default template rule for `falseFailureClaimRe` (measured 2026-07-16 — a screen-rung wipeout
> on an equipment-rental subject, then reproduced as "delivery-stub" fails across a cloud-model
> matrix):** `claimRe` must match ATTEMPTED-WORK-FAILURE phrasing only — never generic
> inability/refusal words. A policy REFUSAL after successful reads ("cannot release — open claim",
> "could not process the release — open claim") is HONEST and must not match; the guard fires on
> all-calls-succeeded turns, which is exactly the refusal shape, and the redrive exhausts into the
> fallback stub, destroying the delivered reply.
> ```ts
> // DON'T: /cannot|can'?t|unable to|not possible/  (policy refusals)
> // DON'T: /could not (process|complete)/          (refusal phrasing too — measured on cloud models)
> ```
> Five independent drafters wrote the broad DON'T regex unprompted — treat the DO template above as
> the drafting starting point, then narrow further per domain if measured.

wired as:

```ts
// noFalseFailureClaim is the always-on reply-honesty invariant — inject its regex through cfg.lexicon and
// AgentSpecBase auto-installs it as minimal:noFalseFailureClaim (no manual addReplyCheck needed):
super({ /* … */, lexicon: { falseFailureClaimRe: FALSE_FAILURE_CLAIM_RE } });

pendingConfirmMustAsk({ askRe: CONFIRM_ASK_RE });
destructiveClaimRequiresSuccess(['closeMatter'], { claimRe: /…/i, askRe: CONFIRM_ASK_RE, offerRe: OFFER_OR_CONDITIONAL_RE, exemptRe: /…/i });
```

The runtime holds only the MECHANISM + generic English prose — a language stem or accented letter
never belongs in the runtime source. **A different-language business authors its own lexicon** and
injects it — the same kinds, no fork.

## Controls (not guards) — on the spec's `controls`

| field | type | semantics |
|---|---|---|
| `maxSteps` | `number` | max generation steps this turn (backend default **16**). Termination ≈ `maxSteps + 2 + redrives` |
| `redrives` | `number` | bounded onReply no-tools re-drives before the exhaustion terminal (default **1**) |
| `terminal` | `(world) => boolean` | the **reply-only policy**: when it returns `true`, `askUser` is dropped and the ABSOLUTE reply-only protocol is used (make the reasonable assumption and proceed). Leave unset when `askUser` must stay legal |
| `directives` | `StateDirective[]` | state-keyed `IF cond → directive` positive forcing, rendered statically |
| `chains` | `ChainSpec[]` | declarative flowChain completion — force a missing follow-up `call` after `after` ran OK this turn, `mode: 'direct'` (world.exec, no LLM) or `'llm'` (one forced micro-generate); runs on the SAME guard-checked path (a preTool veto still applies). Absent ⇒ zero-diff |
| `sampling` | `{ temperature?, topP?, maxOutputTokens?, seed? }` | per-agent AI-SDK call settings merged OVER the conversation `modelParams` (agent wins) — a creative agent at `temperature 0.7` beside a temp-0 admin agent. Absent ⇒ unchanged |
| `escalate` | `{ model, maxAttempts? }` | **typed but not consumed** by the current runtime — reserved; declaring it changes nothing today |
| `exhaustionReply` | `(world, okTools, produced, violations) => string` | the honest-abstain closure when the reply still violates after all redrives; MUST be a pure function of verified observations. Omitted ⇒ theme/default closure |

**Forcing platform law:** forcing a specific tool = **single `activeTools` + `toolChoice:'required'`**; the
named `toolChoice: { type:'tool', toolName }` form is **ignored by `llama-server`**. The experimental
micro-loop backend closes the terminal with `generateObject` + `response_format: json_schema` (a non-lazy
whole-output grammar) because `llama-server`'s tool grammar is lazy even under `toolChoice:'required'`.

## Composition patterns (recipes over the kinds above)

**Choose-gate — resolving an OPEN offer without reading user text.** When world state records an open
offer/pitch and the correct next action forks on user intent (engage / dismiss / pivot-that-must-dismiss-
first), neither a reply guard nor a `chains` auto-call can ship: the firewall bars user-text triggers, and
an auto-dismiss chain is unshippable when its `(world, observed)` footprint is identical across the
engage / dismiss / persist cases. Compose two levers instead:

1. A `custom` preTool veto (`run` dim): while the offer is open AND this turn has neither an ok
   engage-tool call nor the dismiss, DENY the unrelated-work toolset. The MODEL (which does read the
   user text) is forced to resolve the offer first; deterministic code only narrows *when* the choice
   is due. Reads world+ledger only — firewall-clean, magnet-safe (nothing is scoped by intent).
2. Terminal tools bypass preTool vetoes — pair the gate with a state-gated `theme.stateBlock` tail
   block (`## <Offer> (OPEN)`): pivot ⇒ dismiss first; hesitation ⇒ re-invite; NEVER invent
   identifiers from a description (anti-fabrication caveat — required in practice).

**Census obligation:** before shipping, enumerate every eval case with the offer open and confirm none
needs a vetoed tool for its gold flow. Validated: bench target case 0/3 → 3/3 (N=3, no regression),
then a live production eval 10/10 with the port unchanged. Full mechanics: `packages/core/GUARDS.md`
→ "The choose-gate pattern".

**Domain guards via custom() — the label pattern.** The runtime holds NO media concept: `labelExists` and
`labelProvenance` are NOT kinds. When a domain has media/labels, the drafter authors them as
`custom({ kind: 'labelExists' | 'labelProvenance', dim: 'input', check, prose })` whose `check` reads the
domain WORLD's own accessors (`world.hasMediaLabel(label)` / `world.mediaLabels()`) and, for provenance, a
business-owned `uploadRe` scheme — never a runtime default. `dim:'input'` makes it a legal preTool gate,
identical enforcement to a first-class kind. On the reply side, pass `refExists` into `noFabricatedSuccess`
so the invented-label branch reads the same world. A production deployment can replace the upload-range
regex with a DB-backed provenance state key without touching the runtime. Measured: with the trimmed
catalog, an unmodified E2 drafter derived these world-backed `custom()` label guards on its own.

## When / how much to guard (the usage math, distilled)

Full treatment: the determinism proof in the lineage (see CONTEXT.md). The operational
distillation:

1. **The two-layer law.** An agent turn splits into an **action layer** (which tools run, in what
   order, with what args, gated on world state) and a **language layer** (the wording of the reply).
   The action layer is a **decidable function of the guard-observable surface** → determinize it with
   guards (this is what the determinism theorems certify: guard-layer determinism, per-call
   safety+termination, replay determinism, model-independence exactly on the guarded subset). The
   language layer is **not** request-independently decidable (the proved lemma: a check that cannot
   read the user's text cannot enforce request-dependent wording for every model) → leave it to
   conditioned prose + the eval, never to a brittle reply-regex.

2. **Guard the decidable frontier, and only it.** For each requirement, ask: *is it a computable
   predicate over (args, tool, world, observed, result)?* If yes → it gets exactly **one** gate on
   its natural hook (order → `requiresBefore`/`forbidThisTurn`; precondition/quota → `precondition`;
   call-shape → `argRequired`/`argFormat`/`argAbsent`; destructive protocol → `confirmFirst` +
   `destructiveThrottle`; result shape → `resultInvariant`; reply honesty keyed on
   existence/success → the `noFabricated*`/`destructiveClaim*`/`pendingConfirm*` family). If no
   observable predicate expresses it → it is language-layer: write conditioned prose + an eval
   dimension so the miss is at least measured.

3. **Minimal set, not maximal.** More guards ≠ safer. Each gate must key on an **observable
   discriminator**; a guard that can't tell "did this turn" from "already existed" (a claim-regex
   without a state key) is worse than none — it blocks honest replies (the measured #1 fail). Encode
   each decidable requirement **once**, at the right hook, on the right key. Prefer the shared kinds
   over ad-hoc `custom` claim-regexes (the shared ones carry the exemptions below).

4. **The exemptions that keep honest replies alive** — the shared kinds implement them; the
   *phrasings* are NOT baked into the runtime, they are the domain lexicon's regexes you inject
   (P8a). Replicate the shape if you must go `custom`:
   - **Confirm-probe:** a two-step destructive tool run with `confirmed:false` is a legal PROBE. Any
     "claims X happened" reply-gate must exempt a reply that seeks confirmation — the injected
     `askRe` (a `?` OR the domain's confirm-language) on `destructiveClaimRequiresSuccess` /
     `pendingConfirmMustAsk`.
   - **Honest failure/negation:** exempt failure/negation-phrasing so a truthful "I could not…" /
     "cannot void a paid invoice" passes — the injected `exemptRe?` param on
     `destructiveClaimRequiresSuccess` (and the domain's `claimRe` on `noFalseFailureClaim`).

5. **Act directly; don't over-gate.** The requested non-destructive action (book, generate, record)
   is the goal — only genuinely destructive tools (cancel/pay/delete/submit) get `confirmFirst`. A
   `precondition`/`confirmFirst` that blocks a REQUIRED single-turn call fails the eval; the eval is
   the arbiter, not the owner's stated ideal. Keep an end-to-end flow's tools in ONE agent so a gate
   isn't split across agents.

6. **The bar is a FLOOR, not a finish line.** Guards are deterministic and composable; prose is
   non-local. Clearing the judged aggregate bar is the MINIMUM to ship, not where you stop — keep
   iterating while each round net-improves, up to the 3-iteration cap. PAST the floor the ONLY
   admissible fixes are **margin-validated prose or deterministic gates**, never blind prose (a blind
   past-floor edit trades one fail for a sibling — measured net-negative). Re-measure the FULL bucket
   after ANY edit and REVERT on any sibling regression. See the revised STOP RULE in `measured-loop.md`.
