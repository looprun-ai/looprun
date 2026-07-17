# second-brain-example

## 0.0.1

### Patch Changes

- Initial generation by the agentspec skill (Stages A→N): the `vault-filing` agent (8 tools, one
  destructive) on the deterministic second-brain world (3 presets: `empty`, `capture-heavy`,
  `dupes`; fixed reference timestamps, monotonic note ids, offline page cache — no clock, no RNG,
  no network). Safety lines shipped as prose+check pairs: vault folder allowlist (`argFormat` on
  noteCreate/noteMove), read-before-filing (custom spatial gate: itemRead OR vaultSearch must have
  run), two-step delete (auto confirmFirst + destructiveThrottle via `destructiveTools`), and
  reply honesty (`noFabricatedSuccess` label+claim seams, `destructiveClaimRequiresSuccess`,
  `pendingConfirmMustAsk`, auto `noFalseFailureClaim` with the attempt-context lexicon template).
  13 debate-validated eval cases (`evals/EVALS.md`). Lints clean (guard purity, spec quality
  Q1–Q7, spec laws); typechecks. The measured loop (T/S certification) has not been run yet.
