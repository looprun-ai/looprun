# homeservices-example

## 0.0.9

### Patch Changes

- Updated dependencies
  - looprun@0.6.2

## 0.0.8

### Patch Changes

- Updated dependencies
  - looprun@0.6.1

## 0.0.7

### Patch Changes

- Updated dependencies
  - looprun@0.6.0

## Unreleased

### Regenerated agents (2026-07-17)

- `src/agents/homeservices/` (theme, lexicon, `intake-quoting-spec`, `scheduling-spec`) re-authored
  **FROM SCRATCH** by the corrected `agentspec` skill on the current released looprun API — same tool
  surface + personas, fresh `behavior[]` + guards. Showcases the revised skill: iron-rule blunt
  conditioned prose (load-bearing lines first, anti-patterns named as failures, the same-message
  pre-authorization caveat inlined once), prompt-budget **dedup vs the theme** (shared invariants
  live once in `theme.coreInvariants`; specs only specialize), **name→id** resolution lines,
  per-entity **lifecycle-law** (quote lifecycle on intake, job/cancel lifecycle on scheduling), the
  **state-wins** truthfulness invariant, args+accessor RUN gates paired with prose, two-step
  destructive from `destructiveTools`, and the corrected **`falseFailureClaimRe` default template**
  (attempted-work-failure verbs only — dropped the broad `cannot/unable/could not process` that
  wipes out honest policy refusals). Behavior only — `WORLD-MODEL.md`, `tools.json`, `src/world/`
  and `evals/` (the ruler) are unchanged. `tsc --noEmit` + `looprun-eval lint --spec-laws` clean.

## 0.0.6

### Patch Changes

- Updated dependencies
  - looprun@0.5.0

## 0.0.5

### Patch Changes

- Updated dependencies [a9357d3]
  - looprun@0.4.0

## 0.0.4

### Patch Changes

- Updated dependencies
  - looprun@0.3.0

## 0.0.3

### Patch Changes

- Updated dependencies [1f46c90]
  - looprun@0.2.1

## 0.0.2

### Patch Changes

- Updated dependencies [01c45ee]
  - looprun@0.2.0

## 0.0.1

### Patch Changes

- Updated dependencies
  - looprun@0.1.2
