# @looprun-ai/core

## 0.8.2

### Patch Changes

- Release (patch).

## 0.8.1

### Patch Changes

- Release (patch).

## 0.8.0

### Minor Changes

- 5cd50cc: `looprun-eval lint --spec-laws` gains the artifact-quality and subject laws.

  Nine checks over the assembled specs — a tool the model is offered and nothing executes, a guard
  bound where it can never fire, prose naming an absent or off-surface tool, an ordering the trunk
  asserts and no gate enforces, a flow edge rendered as "do not skip a step" with nothing behind it,
  an irreversible-looking tool nobody declared destructive, prose written as a post-hoc accusation,
  and a seam armed with no sentence to go with it.

  Two subject laws, both for defects with no symptom. A guard no case targets passes in BOTH arms of
  a discrimination run, so it is neither an alarm nor a failure — it reads as coverage and has never
  fired. A world that returns its refusals as successful-looking results leaves `ok` true, and every
  honesty kind short-circuits to null: guards installed, inventory green, suite passing, nothing able
  to fire. Plus a declared preset that throws, and a factory that accepts an unknown preset in
  silence.

  Every check reads the assembled objects — bindings, targets, `guard.meta`, the rendered `prose()`
  — rather than pattern-matching call sites. A source-text lint goes blind the moment a spec builds
  its surface through a constant, and stays green while the bundle rots.

  In core, `noFabricatedSuccess` now records `meta.armed` (which seams are armed, as booleans, never
  the patterns). This is what lets the armed-seam law be checked by reading the runtime instead of
  re-encoding it. `ARMED_SEAMS`, `DENY_ONLY_PROSE_KINDS` and `CONFIRM_CLASS_KINDS` — exported for
  lints that did not exist — now have consumers.

- 39b5436: **BREAKING.** Shipped as a minor: the packages are pre-1.0, where the minor slot is the
  breaking-change signal and 1.0.0 is a deliberate stability decision, not a milestone reached by
  accumulating removals. The version number will not warn anyone — this line has to.

  The legacy compatibility layer is removed.

  - `TrunkContract` (alias of `DomainContract`) and `FIXTURE_CONTRACT` (alias of `FIXTURE_DOMAIN`) no
    longer exist. Use the canonical names.
  - `AgentControls.escalate` and `AgentSpecConfig.toolSchemas` are removed, with the `AgentModelRef`
    and `ToolSchemaLike` types that supported them. Neither was ever read at runtime.
  - `EvalCase` and `EvalConfig` are removed. Subjects are directories consumed by
    `looprun-eval run --subject <dir>`; type cases as `SubjectCase`. The `goldSeq` / `goldReply`
    fields go with them — no code path read either.

- ed3513d: One owner for the bytes a turn sends: `renderTurnPrompt`.

  The assembly was duplicated across the two drivers — each folded `trunk + terminal protocol` into
  the instructions and `state block + uploads + user text` into the message tail. Two copies of one
  law is a drift hazard, and this one is worse than ordinary duplication because the drift is
  invisible: a wrong prompt does not crash, it answers.

  New in core: `renderTurnPrompt(input) => { instructions, userContent, replyOnly, uploadDisplay }`,
  plus `uploadDisplayLabels` and `isReplyOnly`. Pure — no clock, no entropy, no I/O, no model.
  Attachment ingestion stays in the caller because it mutates the world. `replyOnly` accepts an
  override for the two callers that are not governed turns: the static instructions a host shows in a
  studio (rendered against a stub world the terminal policy must never be asked about), and an offline
  replay pinning the decision a recorded run took.

  The backend now renders through it in all four places (`generate`, `stream`, the static constructor
  prompt, and the conversation driver). Byte-identical output — `prompt-identity.test.ts` runs a real
  governed turn and compares both halves against what the function returns, so a driver that
  reassembles the prompt again fails the suite.

  This exists for the offline instruments as much as for the drivers. The previous generation of the
  margin probe carried its own replica of this assembly; a refactor moved the runtime, the replica
  diverged silently, and the instrument kept reporting — about a prompt nothing ran. There is now
  nothing to replicate.

- Release (minor).
- c55d784: **BREAKING.** Shipped as a minor: the packages are pre-1.0, where the minor slot is the
  breaking-change signal and 1.0.0 is a deliberate stability decision, not a milestone reached by
  accumulating removals. The version number will not warn anyone — this line has to.

  The three residuals on the governed runtime are closed.

  - A terminal tool's definition is now the PROTOCOL's, never the host's: `normalizeTerminalToolDef`
    rewrites a host-supplied `replyToUser` / `askUser` to the runtime contract (single `text`
    argument, no brand-language pin, no unread required fields) and returns domain defs by identity.
  - The experimental micro-loop driver is REMOVED, with its exports
    (`runSpecConversationMicroLoop`, `renderStructuredReply`, `stripThinkBlocks`,
    `recordTerminalReply`, `assembleAnswerText`, `scrubSteeringEcho`, `ingestStructuredObject`,
    `commitFinalReply`, `digestTurnToolResults`, `buildForceCloseMessages`, `STEERING_SENTINEL`).
    It was never a default, never certified, and carried none of the turn-safety mechanics.
  - The proof runner counts its own coverage ratchet again (see the repo's governance tooling).

## 0.7.2

### Patch Changes

- Release (patch).

## 0.7.1

### Patch Changes

- Release (patch).

## 0.7.0

### Minor Changes

- Release (minor).

## 0.6.3

### Patch Changes

- Release (patch).

## 0.6.2

### Patch Changes

- Release (patch).

## 0.6.1

### Patch Changes

- Release (patch).

## 0.6.0

### Minor Changes

- Release (minor).

## 0.5.0

### Minor Changes

- Release (minor).

## 0.4.0

### Minor Changes

- a9357d3: Guard catalog trimmed 27 → 23 kinds — the runtime is now media-free and narration-free (the P8a
  domain-neutrality law, completed). Pre-1.0 breaking API.

  **Breaking API — migrate:**

  - **Media/label input guards left the runtime.** `labelExists` and `labelProvenance` are no longer
    runtime kinds — the neutral core carries no media concept. A media-ish domain now authors them as
    `custom({ dim:'input' })` guards over its own world accessors:

    ```ts
    custom({
      kind: "labelExists",
      dim: "input",
      check: (ctx) =>
        ctx.world.hasMediaLabel(String(ctx.args.label ?? ""))
          ? null
          : "Unknown label — use a real one.",
      prose: () => "the label must be a real one (do not invent it)",
    });
    ```

    `interface MediaWorld` is removed from `@looprun-ai/core`; a domain reads its own accessors through
    the world's index signature.

  - **`maxCallsPerTurn` + `maxCallsPerConversation` → `maxCalls(tool, n, reason, { scope })`.** Scope is
    `'turn'` (default — same as the old `maxCallsPerTurn`) or `'conversation'` (the old
    `maxCallsPerConversation`). One kind, one deny message + prose.
    - `maxCallsPerTurn('t', 2, r)` → `maxCalls('t', 2, r)`
    - `maxCallsPerConversation('t', 3, r)` → `maxCalls('t', 3, r, { scope: 'conversation' })`
  - **`replyNoProductionClaim(claimRe, reason)` → `noFabricatedSuccess(tool, { banRe: claimRe, reason })`.**
    The unconditional-ban mode of `noFabricatedSuccess` (a `banRe` checked before the ran-this-turn
    short-circuit, so it fires regardless of attempts) absorbs the former standalone kind.
  - **`noFabricatedSuccess` media lookup → injected `refExists`.** The former hardcoded
    `world.hasMediaLabel` coupling in the invented-label branch is now the injected predicate
    `refExists?: (world, label) => boolean` (absent ⇒ only labels produced this turn are known). All
    scheme params (`claimRe`/`labelRe`/`verbClaimRe`/`banRe`/`refExists`) are optional — pass only what
    the domain needs; `banRe`-only makes it a pure ban.
  - **`degenerationGuard` self-narration → `lexicon.selfNarrationRe`.** The always-on markup +
    line-repetition branches are unchanged. The third-person self-narration branch is now opt-in: it
    fires only when the bundle injects `cfg.lexicon.selfNarrationRe` (`degenerationGuard({ selfNarrationRe })`);
    absent ⇒ that branch is OFF and the runtime carries no narration language. The auto-installed
    `minimal:degenerationGuard` id and onReply order are unchanged, so a spec that ships no lexicon is
    byte-stable. To restore the pre-0.4.0 built-in behavior verbatim, pass the former regex back in:
    ```ts
    degenerationGuard({
      lexicon: {
        selfNarrationRe:
          /\b(?:I closed the turn|by calling replyToUser|The assistant (?:confirmed|called|then))\b/i,
      },
    });
    ```

## 0.3.0

### Minor Changes

- Release (minor).

## 0.2.1

### Patch Changes

- 1f46c90: Document the **choose-gate** composition pattern (GUARDS.md + agentspec skill guard-catalog): a
  `custom` preTool veto that, while an offer/pitch is OPEN in world state and unresolved this turn,
  denies unrelated work so the MODEL (which reads user text) must choose engage-vs-dismiss — the
  firewall-clean answer for intent-forked flows where an auto-dismiss `ChainSpec` is unshippable
  (identical world footprint across engage/dismiss/persist). Includes the terminal-path twin
  (state-gated `theme.stateBlock` OPEN block + anti-fabrication caveat) and the census obligation.
  Validated: bench target case 0/3 → 3/3 (N=3, zero regression) + live production eval 10/10.

  Also confirms v0.2.0 already shipped both prior-ask disjunct fixes (earlier-turn attempt +
  lexicon-matched replyToUser probe) — this release is docs/skill only, no runtime code change.

## 0.2.0

### Minor Changes

- 01c45ee: Domain-neutrality, a single spec class, and three new governed-turn mechanisms.

  **Breaking API**

  - **Domain-neutral guards (P8a).** Reply/label guards no longer carry any built-in linguistic or
    label-scheme default — every language-specific pattern is now a REQUIRED injected param, so the
    runtime is truly multi-language. Migrate:
    - `labelProvenance(field, expect)` → `labelProvenance(field, expect, { uploadRe, labelNoun?, reason? })` (the `isUploadLabel` helper is removed)
    - `noFabricatedSuccess(tool, { claimRe, reason })` → `noFabricatedSuccess(tool, { claimRe, labelRe, verbClaimRe, reason })`
    - `pendingConfirmMustAsk()` → `pendingConfirmMustAsk({ askRe })`
    - `destructiveClaimRequiresSuccess(tools, claimRe?, exemptRe?)` → `destructiveClaimRequiresSuccess(tools, { claimRe, askRe, offerRe, exemptRe? })` (now sentence-scoped + offer-aware)
    - `noFalseFailureClaim()` → `noFalseFailureClaim({ claimRe })`
  - **Single spec class.** `AgentSpecMinimal` and `AgentSpecFull` are removed; there is ONE
    `AgentSpecBase` (universal invariants + the destructive-safety pair iff `destructiveTools`).
    Extend `AgentSpecBase`. The schema-auto layer is gone — author `argRequired` / `argFormat`
    explicitly.

  **New**

  - `noActAfterAskSameTurn(tools)` guard — deny acting in the same turn as an `askUser` question.
  - `controls.sampling` — per-agent `temperature` / `topP` / `maxOutputTokens` / `seed`, merged
    OVER the conversation `modelParams` (the agent wins) via `resolveModelSettings`.
  - `controls.chains` — declarative flowChain completion (`direct` | `llm`) that deterministically
    fills a required follow-up call, on the same guard-checked path.
  - postTool (OUTPUT-dim) enforcement is now live: failing `resultInvariant` guards are relayed
    through the bounded no-tools redrive (a report/repair, never a veto).
  - Experimental micro-loop backend for tiny local models (`runSpecConversationMicroLoop`) — not a
    default anywhere. It decomposes a turn into forced single-tool micro-steps and closes it with a
    **grammar-guaranteed structured close**: the forced terminal and the onReply redrive call
    `generateObject` with the `replyStructured` schema as `response_format: json_schema` — a NON-lazy
    whole-output grammar llama-server enforces (its TOOL grammar is LAZY even under
    `toolChoice:'required'`, so the model free-wrote past it and no terminal ever landed). The system
    prompt is reconstructed for the bypass, and BOTH the tool execute and the object close route
    through one shared candidate path (`ingestStructuredObject` = scrub ∘ render). That close runs on a
    **minimal context** (`buildForceCloseMessages`) — the turn's user tail (incl. the account-state
    block) + a compact digest of THIS turn's fresh successful tool results (`digestTurnToolResults`,
    resultOk-filtered, terminals skipped, capped 600/2400 chars) + the steering line — not the whole
    transcript, the probe-proven short-context regime for a tiny model. New pure exports:
    `ingestStructuredObject`, `digestTurnToolResults`, `buildForceCloseMessages`.

  **Governed-turn hardening (guards-v2)** — four refinements to the reply/confirm guards; all
  non-breaking (signatures extended backward-compatibly, new cfg fields optional, a lexicon-less spec
  stays byte-stable):

  - `destructiveClaimRequiresSuccess` is now **attempt-keyed** — it fires only when a listed destructive
    tool was actually ATTEMPTED this turn (executed OR vetoed). With no attempt, a destructive verb in
    the reply is read-backed STATUS talk, not an action claim, and is left alone (kills the #1
    false-positive class). The offer/question sentence-scoping is unchanged.
  - `pendingConfirmMustAsk` is now **resolution-aware** and takes an optional `{ confirmArg }` (default
    `confirmed`) — a pending `requiresConfirmation` need not be re-asked when the SAME tool ran OK with
    the confirm flag set on the SAME record (canonical args minus that flag) later in the turn (the legal
    probe→approved-execute tail). Record identity is domain-neutral (canonical args, no id regex).
  - `confirmFirst` gains a per-tool **mechanism**: `confirmFirst(opts?: string | { argFlag?, mechanism? })`.
    `'arg'` (default) is today's confirm-flag gate; `'prior-ask'` gates a flag-less destructive tool on a
    prior-turn `askUser` (ask, wait, act only in a LATER turn). `AgentSpecConfig.confirmMechanism?:
Record<tool, 'arg' | 'prior-ask'>` selects it; `AgentSpecBase` partitions the destructive tools so
    arg-flag tools install `base:confirmFirst` and prior-ask tools `base:confirmFirstPriorAsk`, with
    `destructiveThrottle` over all.
  - `noFalseFailureClaim` gets an **auto-layer**: `AgentSpecConfig.lexicon?: { falseFailureClaimRe? }`.
    When provided, `AgentSpecBase` auto-installs it as `minimal:noFalseFailureClaim` (the always-on
    reply-honesty invariant, ordered before `minimal:emptyReply`). Auto-iff-provided keeps a lexicon-less
    spec byte-stable; a spec may still add its own tighter agent-layer instance. The example bundles now
    pass `cfg.lexicon` and drop their manual installs.

  Forcing note: the terminal close/redrive now use `generateObject` (`response_format: json_schema`);
  the remaining forced-tool sites (the micro-steps, flowChain completion) use single-`activeTools` +
  `toolChoice:'required'`, since `llama-server` ignores the named `{ type:'tool', toolName }` form and
  degrades to free text.

## 0.1.2

### Patch Changes

- Release (patch).
