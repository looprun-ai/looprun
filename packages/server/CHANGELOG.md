# @looprun-ai/server

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
