# accounting-example

## 0.0.7

### Patch Changes

- Agents regenerated FROM SCRATCH (2026-07-17) with the corrected agentspec skill. The
  three specs (client-books, billing, tax-filing) and the domain theme were re-authored fresh:
  iron-rule blunt conditioned prose with the anti-pattern named as a failure; prompt-budget dedup
  (every business-common rule stated once on the theme, specs only specialize); one per-entity
  lifecycle-law line each (entry reverse-once, invoice draft/sent/paid/void, filing
  not-started/prepared/submitted, deadline cancellable-only-while-not-started); the state-wins
  truthfulness rule and the act-directly rule added as theme invariants; name→id resolution reads
  on every surface. Guards re-authored on the current shared kinds
  (`destructiveClaimRequiresSuccess` / `pendingConfirmMustAsk` with injected lexicon + the auto
  `noFalseFailureClaim` via `cfg.lexicon`); the legacy local `guards.ts` was dropped in favor of
  `lexicon.ts`. The `falseFailureClaimRe` lexicon was corrected to the attempt-context template
  (drops the `cannot`/`unable`/`could not` policy-refusal words that were destroying honest
  refusals). Lints clean (guard-purity, spec-quality Q1–Q7, spec-laws); typechecks against
  looprun@0.5.0. Re-certification (N=3) is a separate step.

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
