# @looprun-ai/eval

## 0.12.0

### Minor Changes

- Release (minor).

### Patch Changes

- Updated dependencies
  - @looprun-ai/core@0.12.0
  - @looprun-ai/mastra@0.12.0

## 0.11.0

### Minor Changes

- 5635d4c: Consent to a destructive act is a token the engine issues and the user types back.

  A call that answers `requiresConfirmation` names its record and the engine opens a question bound to it;
  a destructive tool with no simulate form is denied, and the denial opens a question from the label the
  spec declared. The engine renders the question into the delivered text, the runtime reads the next
  incoming message once and marks the question consumed if the user's own words carry its token, and
  `confirmFirst` allows the act only when a consumed question is about that call. No model participates in
  a consent decision, and nothing the agent emits is admitted as evidence of one.

  **Breaking changes**

  - `confirmFirst` takes one option, `flag`, and it says which call ACTS — the simulation runs freely because
    it is how the world raises the question. `flag: false` is the one-step shape. `via` and `within` are
    gone.
  - `noActAfterAskSameTurn` and `pendingConfirmMustAsk` are removed. A token can only arrive in a user
    message, so no turn can ask and act on the answer at once; and the engine renders the question itself,
    so there is no relay to force.
  - `askedEarlier` is now `valueFromUser({ arg })`: the value recorded on the user's behalf must be one the
    user actually said, compared as a contiguous run of whole tokens over everything they have said. An
    invented value is denied and so is a paraphrase.
  - `AgentSpecConfig.destructiveLabels` is required for a destructive tool that acts on no identifiable
    record — without one it can raise no question, so it never runs. Two labels whose first two words agree
    derive the same token and throw at construction.
  - `DomainContract.engineText` carries the engine's own user-facing sentences (the record closures and the
    consent question). A conversation held in another language must declare it: the user has to be able to
    read the instruction whose token they type back.
  - `RECORD_CLOSURE_SOME` / `RECORD_CLOSURE_NONE` are replaced by `DEFAULT_ENGINE_TEXT` on
    `@looprun-ai/core/internal`.
  - A reply-only `controls.terminal` policy and destructive tools may now share a spec: reply-only bounds
    the agent, not the engine.
  - A two-step world result must name its record under an identity key alongside `requiresConfirmation`,
    or the engine has nothing to bind the question to.

- Release (minor).

### Patch Changes

- Updated dependencies [5635d4c]
- Updated dependencies
  - @looprun-ai/core@0.11.0
  - @looprun-ai/mastra@0.11.0

## 0.10.0

### Minor Changes

- Release (minor).

### Patch Changes

- Updated dependencies
  - @looprun-ai/core@0.10.0
  - @looprun-ai/mastra@0.10.0

## 0.9.1

### Patch Changes

- Release (patch).
- Updated dependencies
  - @looprun-ai/core@0.9.1
  - @looprun-ai/mastra@0.9.1

## 0.9.0

### Minor Changes

- Release (minor).
- 917340f: **Breaking: the public API is now exactly what the tutorial teaches.**

  Every package barrel was converged onto a single contract — the symbols taught by
  `docs/tutorial/01`–`06`. Names that no package documented and no consumer imported were deleted;
  names that only the runtime needs moved behind `@looprun-ai/core/internal`. Each barrel is now
  pinned by a surface-lock test, so it cannot drift back — with one gap: the published `./testing`
  subpaths of `@looprun-ai/core` and `@looprun-ai/mastra` re-export by wildcard (~27 symbols) and
  carry no lock yet, so those two are the one surface that can still drift. Locking them is a
  follow-up.

  | package              | public exports                      | before                            |
  | -------------------- | ----------------------------------- | --------------------------------- |
  | `@looprun-ai/core`   | 51 taught (+11 type-closure riders) | 107 named + 2 wildcard re-exports |
  | `@looprun-ai/mastra` | 7 + core flow-through               | 25 named + 1 wildcard             |
  | `@looprun-ai/models` | 8 (+2 riders)                       | 24                                |
  | `@looprun-ai/eval`   | 19 (+9 riders)                      | 52                                |
  | `@looprun-ai/server` | 4 (+3 riders)                       | 13                                |

  **Why `looprun` and `@looprun-ai/vercel` are also major.** The `looprun` umbrella re-exports core, so
  its root and `./core` barrels narrow exactly as core does — the break reaches consumers through the
  facade, not only through the scoped package. `@looprun-ai/vercel` has no API change at all (its
  factory still throws); it is major because the changeset config links `looprun` and `@looprun-ai/*`
  into one version group, so the whole set moves together.

  **What moved rather than vanished.** `@looprun-ai/core/internal` is a new, explicitly unstable
  subpath carrying the runtime primitives (ledger, turn machine, trunk internals, `GUARD_CATALOG`,
  `GuardExecutionError`). It exists so in-repo tooling and forks keep working; it carries no
  compatibility promise across releases.

  **What was cut outright.** The `coherence` guard family and its trunk section were removed
  (-396 LOC); the trunk fold was proven byte-identical across the change. Runtime helpers that had
  been exported from `@looprun-ai/core` without ever being documented or imported — including
  `uploadDisplayLabels` and `isReplyOnly` — are now module-local to `renderTurnPrompt`. Package
  `CHANGELOG.md` entries that announced them stay unedited: they are an accurate record of what those
  versions shipped.

  **Also in this release.** `packages/core/src/guards.ts` was split into `guards/` (30 catalogued
  factories, all files ≤500 lines); `@looprun-ai/mastra`'s `agent.ts` was split; and the nine
  superseded documents under `docs/` were replaced by the six-chapter tutorial, every code block of
  which is compiled in CI against the published packages.

  Migration table for external consumers: `docs/superpowers/specs/2026-07-28-migration-notes.md`.

### Patch Changes

- Updated dependencies
- Updated dependencies [917340f]
  - @looprun-ai/core@0.9.0
  - @looprun-ai/mastra@0.9.0

## 0.8.2

### Patch Changes

- Release (patch).
- Updated dependencies
  - @looprun-ai/core@0.8.2
  - @looprun-ai/mastra@0.8.2

## 0.8.1

### Patch Changes

- Release (patch).
- 0cb5a93: `looprun-eval seal` works. The command referenced an undeclared variable on its first line, so both
  minting and `--verify` failed with `ReferenceError: args is not defined` — the seal, which is what
  voids a certification when an artifact changes, could never be stamped from the CLI.

  The library functions were covered; the argv plumbing around them was not. The CLI is now exercised
  as a process, so a command that cannot resolve its own arguments fails the suite.

- Updated dependencies
  - @looprun-ai/core@0.8.1
  - @looprun-ai/mastra@0.8.1

## 0.8.0

### Minor Changes

- 5cd50cc: `looprun-eval lint --spec-laws` gains the artifact-quality and subject laws.

  Nine checks over the assembled specs — a tool the model is offered and nothing executes, a guard
  bound where it can never fire, prose naming an absent or off-surface tool, an ordering the trunk
  asserts and no gate enforces, a flow edge rendered as "do not skip a step" with nothing behind it,
  an irreversible-looking tool nobody declared destructive, prose written as a post-hoc accusation,
  and a seam armed with no sentence to go with it.

  Two subject laws, both for defects with no symptom. A guard no case targets passes in BOTH variants of
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

- Release (minor).
- dfc0b5d: **BREAKING.** Shipped as a minor: the packages are pre-1.0, where the minor slot is the
  breaking-change signal and 1.0.0 is a deliberate stability decision, not a milestone reached by
  accumulating removals. The version number will not warn anyone — this line has to.

  The seal covers the subject's judge prompt, and the generic ruler leaves the package.

  `sealedFiles` now includes `evals/judge-prompt.md`. A certification is a claim about a score, and
  rewriting the judge's domain rules changes that score without touching a single case — so the ruler
  is under seal with the cases.

  Removed: the `judgePromptPath()` export, the `looprun-eval judge-prompt` command, and the packaged
  `assets/judge-prompt.md`. No code read that file; the CLI only printed its path. Authoring the judge
  prompt belongs to whatever generates a subject bundle, not to the library that runs it.

### Patch Changes

- Updated dependencies [5cd50cc]
- Updated dependencies [39b5436]
- Updated dependencies [ed3513d]
- Updated dependencies
- Updated dependencies [c55d784]
  - @looprun-ai/core@0.8.0
  - @looprun-ai/mastra@0.8.0

## 0.7.2

### Patch Changes

- Release (patch).
- Updated dependencies
  - @looprun-ai/core@0.7.2
  - @looprun-ai/mastra@0.7.2

## 0.7.1

### Patch Changes

- Release (patch).
- Updated dependencies
  - @looprun-ai/core@0.7.1
  - @looprun-ai/mastra@0.7.1

## 0.7.0

### Minor Changes

- Release (minor).

### Patch Changes

- Updated dependencies
  - @looprun-ai/core@0.7.0
  - @looprun-ai/mastra@0.7.0

## 0.6.3

### Patch Changes

- Release (patch).
- Updated dependencies
  - @looprun-ai/core@0.6.3
  - @looprun-ai/mastra@0.6.3
  - @looprun-ai/models@0.6.3

## 0.6.2

### Patch Changes

- Release (patch).
- Updated dependencies
  - @looprun-ai/core@0.6.2
  - @looprun-ai/mastra@0.6.2
  - @looprun-ai/models@0.6.2

## 0.6.1

### Patch Changes

- Release (patch).
- Updated dependencies
  - @looprun-ai/core@0.6.1
  - @looprun-ai/mastra@0.6.1
  - @looprun-ai/models@0.6.1

## 0.6.0

### Minor Changes

- Release (minor).

### Patch Changes

- Updated dependencies
  - @looprun-ai/core@0.6.0
  - @looprun-ai/mastra@0.6.0
  - @looprun-ai/models@0.6.0

## 0.5.0

### Minor Changes

- Release (minor).

### Patch Changes

- Updated dependencies
  - @looprun-ai/core@0.5.0
  - @looprun-ai/mastra@0.5.0
  - @looprun-ai/models@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [a9357d3]
  - @looprun-ai/core@0.4.0
  - @looprun-ai/mastra@0.4.0
  - @looprun-ai/models@0.4.0

## 0.3.0

### Minor Changes

- Release (minor).

### Patch Changes

- Updated dependencies
  - @looprun-ai/core@0.3.0
  - @looprun-ai/mastra@0.3.0
  - @looprun-ai/models@0.3.0

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
    transcript, the simulate-proven short-context regime for a tiny model. New pure exports:
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
    simulate→approved-execute tail). Record identity is domain-neutral (canonical args, no id regex).
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
  - @looprun-ai/mastra@0.2.0
  - @looprun-ai/models@0.2.0

## 0.1.2

### Patch Changes

- Release (patch).
- Updated dependencies
  - @looprun-ai/core@0.1.2
  - @looprun-ai/mastra@0.1.2
  - @looprun-ai/models@0.1.2
