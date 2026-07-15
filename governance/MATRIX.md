<!-- GENERATED — do not edit by hand; run `pnpm proofs:matrix`. -->
# Proof record matrix

One row per governance proof record (`governance/proofs/*.md`), sorted date DESC then slug ASC.
Regenerate with `pnpm proofs:matrix`; CI runs `--check` to keep it in sync.

| Date | Record | Change | Scope | Isolated | Collective | Coverage | SLM canary | Verdict |
|---|---|---|---|---|---|---|---|---|
| 2026-07-15 | [guard-catalog-cleanup](proofs/2026-07-15-guard-catalog-cleanup.md) | catalog 27→23: labels→domain-custom, maxCalls(scope), noFabricatedSuccess banRe+refExists, degenerationGuard lexicon-injected narration | guard:catalog | 154/154 | 42/42 | 23/23 | n/a | PASS |
| 2026-07-15 | [initial-guard-proof-baseline](proofs/2026-07-15-initial-guard-proof-baseline.md) | Baseline: every guard kind proven (positive/negative/neutral; isolated L1+L3 + collective non-interference; coverage ratchet active) | runtime | 165/165 | 47/47 | 27/27 | n/a | PASS |
| 2026-07-15 | [same-step-terminal-ledger-fix](proofs/2026-07-15-same-step-terminal-ledger-fix.md) | Runtime hardening: terminal calls recorded in the guard hook's synchronous segment (emission order) — closes the same-step ask-then-act concurrency bypass; the previously L1-only deny is L3-proven again | runtime | 166/166 | 48/48 | 27/27 | 46/46 (model ram8, advisory) | PASS |
