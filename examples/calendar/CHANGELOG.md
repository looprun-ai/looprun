# calendar-example

## 0.0.3

### Patch Changes

- Updated dependencies
  - looprun@0.6.2

## 0.0.2

### Patch Changes

- Updated dependencies
  - looprun@0.6.1

## 0.0.1

### Patch Changes

- Initial generation (2026-07-18) by the agentspec skill: a single governed `scheduler` agent
  (7 tools, one destructive) over a deterministic calendar world driven by a fixed reference
  clock (Monday 2026-03-02 09:00 — all relative dates resolve against it; no wall clock, no
  randomness, monotonic ids). Safety lines: two-step confirm + throttle on `eventDelete`
  (destructiveTools), availability-before-booking (`requiresBefore` + a world-backed
  no-double-book veto on create AND move), one-concrete-question recovery on unresolvable
  requests, and reply honesty (`noFabricatedSuccess` with the evt*/rem* label seams,
  `destructiveClaimRequiresSuccess`, `pendingConfirmMustAsk`, auto `noFalseFailureClaim` via the
  lexicon). Three presets (`empty-week`, `busy-week` with a seeded Tuesday-15:00 conflict window,
  `reminder-pending`) and a 13-case eval set. Lints clean (guard-purity, spec-quality Q1–Q7);
  typechecks against looprun@0.6.0. Screening/certification against the measured bar is a
  separate step.
