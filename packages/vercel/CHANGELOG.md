# @looprun-ai/vercel

## 0.3.0

### Minor Changes

- Release (minor).

### Patch Changes

- Updated dependencies
  - @looprun-ai/core@0.3.0

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

### Patch Changes

- Updated dependencies [01c45ee]
  - @looprun-ai/core@0.2.0

## 0.1.2

### Patch Changes

- Release (patch).
- Updated dependencies
  - @looprun-ai/core@0.1.2
