# @looprun-ai/core — the guard reference (source of truth)

This file is **verified against the code** in `packages/core/src/` (`guards.ts` + `spec.ts` +
`model-params.ts` + `runtime/`). It is the canonical description every doc/skill copy must match; the
portable skill copy (`skills/agentspec/references/guard-catalog.md`) is checked against it by a parity
test (`packages/core/test/guard-catalog-parity.test.ts`).

Each guard is a **prose+check pair**: a deterministic `check(ctx): string | null` (the machine gate — a
string is a deny + correction, `null` is allow) and an LLM-facing `prose(): string` (rendered into the
trunk, **never read by any check**). The pure set is deterministic by construction: no clock, no entropy,
no network, no LLM call inside a `check`.

## The GuardCtx firewall (the magnet law)

A `check` reads ONLY `GuardCtx` — and `GuardCtx` carries **no user text**:

```ts
interface GuardCtx {
  args: Record<string, unknown>;   // the candidate call's arguments
  tool?: string;                   // the candidate tool name
  world: AgentWorld;               // host-injected read/exec seam (opaque to the package)
  observed: ObservedCall[];        // every tool call this CONVERSATION (name, args, ok, turnIndex, resultFlags)
  turnIndex: number;
  reply?: string;                  // the candidate reply text (onReply / mutators only)
  producedThisTurn?: string[];     // labels the tools produced this turn
  attachmentsThisTurn?: string[];
  result?: unknown;                // the tool RESULT (postTool only)
  notes?: string[];
}
```

No `userText` / `messages` / `history` / `prompt` field exists. A rule that could only be expressed by
reading the user's words is **language-layer** — it becomes conditioned prose + an eval dimension, never a
guard. This firewall is what makes the guard layer model-independent.

## The hooks (and what a deny actually does)

| hook | fires | a deny does | prose in trunk? |
|---|---|---|---|
| `onInput` | before the first model call, on the raw turn | terminal refusal — the turn is aborted with **no LLM call** | no |
| `preTool` | before a tool executes | **veto**: the call does not run; the model sees the correction and retries within the SAME generation (no extra round-trip) | **yes** |
| `postTool` | after a tool RETURNS (the tool already executed) | **report/repair, NOT a rewrite**: a failing result-invariant is recorded and JOINS the onReply violation set, so the bounded no-tools redrive relays it. The framework awaits `afterToolCall` but **discards its return** — a guard cannot rewrite the model-visible result mid-generate | **yes** |
| `onReply` | on the terminal `replyToUser` / `askUser` candidate | re-drives the model with the correction (bounded NO-TOOLS re-generation); on exhaustion, a deterministic honest-abstain closure | **no** |
| `onReplyMutate` | on the terminal reply text | deterministic egress rewrite (not a gate) | no |

**Prose-rendering rule (verified in `trunk.ts` `ruleSections`):** only **preTool** and **postTool** guard
prose reaches the trunk — `target:'any'` guards render under `## Global tool rules`, per-tool guards under
`## Tool rules`. **`onInput` and `onReply` guard prose is never rendered** — a reply-check has no trunk
presence; its wording lives only in its deny/correction string. So a behavior-layer requirement is carried
into the prompt by the spec's `behavior[]` bullets, not by an onReply guard's `prose()`.

## The auto-install layer — one `AgentSpecBase` (no Minimal/Base/Full ladder)

There is exactly **one** spec class, `AgentSpecBase`. Its constructor auto-installs, layer-tagged and
addressable:

- **ALWAYS** (every agent): `noDuplicateCall()` on `preTool` (id `minimal:noDuplicateCall`) + `emptyReply()`
  on `onReply` (id `minimal:emptyReply`).
- **IFF `cfg.destructiveTools` is non-empty**: `confirmFirst()` + `destructiveThrottle(destructiveTools)` on
  `preTool`, scoped to exactly those tools (ids `base:confirmFirst`, `base:destructiveThrottle`; validated ⊆
  surface, else the constructor throws). Empty list ⇒ a no-op, so every non-destructive spec stays clean.

There is **no auto-schema layer** — per-tool `argRequired` / `argFormat` are AUTHORED explicitly by the
spec. The `minimal:` / `base:` id namespaces are retained: `resolveBindings` sorts each hook **agent → full
→ base → minimal**, so an agent correction always wins, and install order is byte-stable (trunk prose
order unchanged). Terminal tools (`replyToUser` / `askUser`) are runtime-owned and may not appear in
`tools` (the constructor throws). A non-empty per-agent `persona` is required (persona-on-spec law).

## The primitives

Signatures are the **exact current** ones. `auto` marks a kind the constructor installs; everything else is
agent-layer (you add it explicitly). `custom()` is the escape hatch — reach for it only when no kind fits.

### preTool — SPATIAL (dim `spatial`)

| signature | auto | mechanism / when to use |
|---|---|---|
| `requiresBefore(deps: string[]): Guard` | — | deny unless EVERY `deps` tool ran OK this conversation. One gate per downstream tool models an ordered flow (there is no single "chain" primitive). |
| `forbidThisTurn(reason: string): Guard` | — | unconditional deny for this turn (a hard "not now"). |

### preTool — INPUT (dim `input`)

| signature | auto | mechanism / when to use |
|---|---|---|
| `argRequired(field: string): Guard` | — | deny if `args[field]` is missing / empty-string. |
| `argAbsent(field: string): Guard` | — | deny if `args[field]` IS present (mutually-exclusive args). |
| `argFormat(field, pattern, flags?, reason?): Guard` | — | deny if a PRESENT non-empty string arg fails `new RegExp(pattern, flags)` (absent/empty deferred to `argRequired`). |
| `labelExists(field: string): Guard` | — | deny if the resolved media label isn't in `world.hasMediaLabel` (needs a `MediaWorld`). Prevents invented labels. |
| `labelProvenance(field, expect: 'uploaded' \| 'generated', scheme: { uploadRe: RegExp; labelNoun?: string; reason?: string }): Guard` | — | deny if a label's provenance class mismatches. The label SCHEME (`uploadRe`) is business-owned and injected (P8a). |

### preTool — RUN (dim `run`)

| signature | auto | mechanism / when to use |
|---|---|---|
| `precondition<W extends AgentWorld = AgentWorld>(ok: (world: W) => boolean, reason: string, prose?: string): Guard` | — | the general world-state gate: allow only while `ok(world)` holds. `prose` states the CONDITION (always rendered); `reason` is the deny (fires only when false). |
| `maxCallsPerTurn(tool: string, n: number, reason: string): Guard` | — | at most `n` of the model's OWN successful `tool` calls this turn. |
| `maxCallsPerConversation(tool: string, n: number, reason: string): Guard` | — | the same budget ACROSS turns (no turnIndex filter). |
| `noDuplicateCall(): Guard` | **minimal** | deny a call whose (tool, canonical args) already SUCCEEDED this turn (keyed on `canonArgs`). |
| `confirmFirst(argFlag = 'confirmed'): Guard` | **base** | `confirmed:true` is legal only when a `confirmed:false` PROBE of the same tool succeeded in an EARLIER turn — never confirm your own same-turn probe. |
| `noActAfterAskSameTurn(tools: string[]): Guard` | — | deny any of `tools` when an `askUser` already succeeded THIS turn — ask, wait, act only in a LATER turn (never confirm-and-execute in the same turn as the question). |
| `destructiveThrottle(destructiveTools: string[]): Guard` | **base** | at most ONE successful destructive action per turn. |

### postTool — OUTPUT (dim `output`)

| signature | auto | mechanism / when to use |
|---|---|---|
| `resultInvariant<W extends AgentWorld = AgentWorld>(pred: (result: unknown, world: W) => boolean, reason: string): Guard` | — | after the tool returns, if `pred(result, world)` is false the `reason` JOINS the redrive as a report/repair (the tool already ran — never a veto). `result === undefined` ⇒ skipped. |

### onReply — BEHAVIOR (dim `behavior`)

| signature | auto | mechanism / when to use |
|---|---|---|
| `emptyReply(): Guard` | **minimal** | the terminal reply may not be empty / whitespace. |
| `noFabricatedSuccess(tool: string, opts: { claimRe: RegExp; labelRe: RegExp; verbClaimRe: RegExp; reason: string }): Guard` | — | if `tool` did NOT succeed this turn, the reply may not claim/imply it did (existence-keyed on invented labels OR a verb-first claim with no label). Both the label scheme (`labelRe`) and the claim regexes are business-owned (P8a). |
| `noFalseFailureClaim(opts: { claimRe: RegExp }): Guard` | — | if every tool this turn SUCCEEDED (and ≥1 ran), the reply may not claim inability. `claimRe` is injected (P8a). |
| `destructiveClaimRequiresSuccess(destructiveTools: string[], opts: { claimRe: RegExp; askRe: RegExp; offerRe: RegExp; exemptRe?: RegExp }): Guard` | — | the reply may not DECLARE a deletion/removal unless a `confirmed:true` destructive call succeeded this turn. Sentence-scoped: a `claimRe` hit is ignored when its own sentence is a question or carries an `offerRe` (offered, not reported). Exempts the confirm-probe two-step (`probed + askRe`) and honest failure/negation (`exemptRe`). All patterns injected (P8a). |
| `pendingConfirmMustAsk(opts: { askRe: RegExp }): Guard` | — | if a tool returned `requiresConfirmation` this turn, the reply MUST relay the question (`askRe` matches "does this reply seek confirmation?"; injected, P8a). |
| `replyMustMention(keywords: string[], reason: string): Guard` | — | the reply must contain ≥1 of `keywords` (case-insensitive) — coverage. |
| `replyConfirmsLabels(labels: string[], reason: string): Guard` | — | the reply must be non-empty and name ALL `labels`. |
| `replyMaxOccurrences(ctas: string[], n: number, reason: string): Guard` | — | at most `n` distinct CTA lemmas from `ctas` may appear (anti-nag). |
| `replySingleQuestion(reason: string): Guard` | — | the reply must have exactly one `?` (recovery turns). |
| `replyNoProductionClaim(claimRe: RegExp, reason: string): Guard` | — | deny if the reply matches a production-claim regex. |

### any hook

| signature | mechanism / when to use |
|---|---|
| `custom(opts: { kind: string; dim: Dim; check: (ctx: GuardCtx) => string \| null \| Promise<string \| null>; prose: () => string }): Guard` | a hand-written check+prose; reviewers read the code. Use ONLY when no kind fits. `addGuard` throws if a `behavior`/`output`-dim guard is placed on `preTool`. |

### helper + mutator (not guards)

| signature | what it is |
|---|---|
| `canonArgs(v: unknown): string` | a pure, key-order-independent canonical fingerprint of a call's args (`undefined` keys dropped, keys sorted). Backs `noDuplicateCall`; exported for reuse. **Not a guard.** |
| `jargonScrub(map: Record<string, string>): ReplyMutator` | a deterministic egress transform on the final reply (word-boundary, case-insensitive `\bfrom\b → to`), applied on `onReplyMutate` BEFORE the onReply checks. **Not a gate.** In every shipping spec. |

## Controls — `spec.controls` (`AgentControls`)

Not guards; declarative knobs the backend consumes.

| field | type | semantics |
|---|---|---|
| `maxSteps?` | `number` | max generation steps this turn (backend default **16**). Termination bounds ≈ `maxSteps + 2 + redrives`. |
| `redrives?` | `number` | bounded onReply no-tools re-drives before the exhaustion terminal (backend default **1**). |
| `terminal?` | `(world: AgentWorld) => boolean` | **reply-only policy**: when it returns `true` for the turn, `askUser` is dropped from the active tools and the ABSOLUTE reply-only protocol is used (make the reasonable assumption and proceed — never stop to ask). Leave unset when `askUser` must stay legal. State-driven, per turn. |
| `directives?` | `StateDirective[]` | state-keyed positive guidance rendered statically as `IF <cond> → <directive>` (cache-stable) under `## Governance`. |
| `chains?` | `ChainSpec[]` | declarative follow-up completion — see below. Absent/empty ⇒ zero added code effect on the turn. |
| `escalate?` | `{ model: AgentModelRef; maxAttempts?: number }` | **typed but NOT consumed** by the current runtime (no code path reads it). Reserved for a future model-escalation policy; declaring it changes nothing today. |
| `sampling?` | `SamplingSettings` = `{ temperature?; topP?; maxOutputTokens?; seed? }` | per-agent AI-SDK call settings, merged OVER the conversation-level `modelParams` (agent wins) by `resolveModelSettings`, into EVERY generate() of the turn — so a creative agent runs at `temperature 0.7` beside a temp-0 admin agent in the same domain. Absent/empty ⇒ conversation params unchanged (zero-diff). |
| `exhaustionReply?` | `(world, okTools: string[], produced: string[], violations: string[]) => string` | committed when the reply still violates its checks after all redrives — MUST be a pure function of verified observations (structurally unable to fabricate). Omitted ⇒ the theme/default closure. |

### `chains` — the flowChain completion pass (`ChainSpec`)

A veto guard can only BLOCK a wrong call; it cannot CREATE a missing one. A `ChainSpec` deterministically
COMPLETES a required follow-up:

```ts
interface ChainSpec {
  after: string;   // fires only if this tool was observed OK THIS turn
  call: string;    // the follow-up tool forced when missing this turn
  when?: (world, observed) => boolean;   // PURE trigger — (world, observed) only, NEVER user text (firewall)
  mode: 'direct' | 'llm';
  args?: Record<string, unknown> | ((world, observed) => Record<string, unknown>);  // 'direct' only
}
```

- **`direct`** = `world.exec(call, args ?? {})` with NO LLM (zero-arg / spec-derived args), on the SAME
  guard-checked path a model call takes (preTool veto → exec → afterToolCall). A chain cannot bypass
  governance: a veto ⇒ `chain-vetoed:<call>` and the world is not called.
- **`llm`** = ONE forced micro-generate where the model fills args (it MAY read the user text — the firewall
  bars only deterministic guard/trigger code, not the model itself).
- On success, if a terminal reply already exists, a restate reply-accounting violation joins the redrive so
  the reply mentions the completed follow-up.

**Platform law for forcing a specific tool (verified in the mastra backend):** forcing = **single
`activeTools` + `toolChoice:'required'`**. The named `toolChoice: { type:'tool', toolName }` form is
**ignored by `llama-server`** (it degrades to free text), which is why the runtime narrows `activeTools` to
the one tool instead. Separately, the experimental micro-loop backend closes the terminal with
`generateObject` + `response_format: json_schema` (a NON-lazy whole-output grammar) because `llama-server`'s
TOOL grammar is LAZY even under `toolChoice:'required'`, so a plain tool-forced close let tiny models
free-write past the terminal.

## The P8a domain-neutrality law

`@looprun-ai/core` (and the mastra runtime `src`) carry **zero** language-specific content. No generic guard
hardcodes a linguistic regex (claim verbs, confirm-language) or a label scheme — those STRINGS/REGEXES live
in the business bundle's OWN lexicon (see `examples/*/src/agents/*/lexicon.ts`) and are passed back in as
**required** params: `labelProvenance(…, { uploadRe })`, `noFabricatedSuccess(tool, { claimRe, labelRe,
verbClaimRe, reason })`, `pendingConfirmMustAsk({ askRe })`, `destructiveClaimRequiresSuccess(tools, {
claimRe, askRe, offerRe, exemptRe? })`, `noFalseFailureClaim({ claimRe })`. The runtime holds only the
MECHANISM and the generic English prose. This is **enforced by
`packages/core/test/runtime-neutrality.test.ts`**, which scans both runtime packages for accented letters /
language stems and fails on a re-introduced default.

## Deliberately absent: any in-guard LLM reply-check

There is **no `llmReplyCheck` kind** in `@looprun-ai/core`. An impure in-guard judge forfeits the
determinism certificate, and a check that reads user text breaks the firewall (prompt-injection surface). A
rule no deterministic check can express is language-layer: pre-baked conditioned prose + an eval dimension —
never a reply-rubric derived from user text.
