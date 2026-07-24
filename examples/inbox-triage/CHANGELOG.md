# inbox-triage-example

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

- Initial generated bundle (2026-07-18), authored with the agentspec skill against looprun@0.6.0
  (version aligned with the sibling example packages). One governed agent (`inbox-triage`,
  6 tools) on a deterministic inbox world (4 presets: empty, mixed, urgent-heavy, noise-flood).
  The safety line this example demonstrates: `emailSend` stays on the tool surface but is
  hard-vetoed (`forbidThisTurn`) — triage is draft-only; the eval's end state asserts
  `sentCount() === 0`. Plus: 10-per-turn archive cap (`maxCalls`), list-before-acting and
  read-before-drafting ordering gates (`requiresBefore`), a world-backed archive id gate
  (`custom`), unconditional sent-claim ban + attempt-keyed archive-claim guard
  (`noFabricatedSuccess` with injected lexicon), and the auto `noFalseFailureClaim` via
  `cfg.lexicon` (attempt-context template — the draft-only policy refusal stays legal).
  14 review-validated eval cases. Lints clean (guard-purity, spec-quality Q1–Q7); typechecks.
  Certification (N=3) is a separate step.
- Updated dependencies
  - looprun@0.6.0
