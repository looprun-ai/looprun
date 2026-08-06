# @looprun-ai/server

## 0.14.0

### Minor Changes

- Release (minor).

### Patch Changes

- Updated dependencies
  - @looprun-ai/core@0.14.0
  - @looprun-ai/mastra@0.14.0

## 0.13.0

### Minor Changes

- Release (minor).

### Patch Changes

- Updated dependencies [767cc2f]
- Updated dependencies
  - @looprun-ai/core@0.13.0
  - @looprun-ai/mastra@0.13.0

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
  a destructive tool with no preview form is denied, and the denial opens a question from the label the
  spec declared. The engine renders the question into the delivered text, the runtime reads the next
  incoming message once and marks the question consumed if the user's own words carry its token, and
  `confirmFirst` allows the act only when a consumed question is about that call. No model participates in
  a consent decision, and nothing the agent emits is admitted as evidence of one.

  **Breaking changes**

  - `confirmFirst` takes one option, `flag`, and it says which call ACTS — the preview runs freely because
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
- Updated dependencies
  - @looprun-ai/core@0.8.1
  - @looprun-ai/mastra@0.8.1

## 0.8.0

### Minor Changes

- Release (minor).

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

## 0.6.2

### Patch Changes

- Release (patch).
- Updated dependencies
  - @looprun-ai/core@0.6.2
  - @looprun-ai/mastra@0.6.2

## 0.6.1

### Patch Changes

- Release (patch).
- Updated dependencies
  - @looprun-ai/core@0.6.1
  - @looprun-ai/mastra@0.6.1
