<!-- Thanks for contributing to looprun. See CONTRIBUTING.md and governance/GOVERNANCE.md. -->

## Summary

<!-- What does this change do, and why? -->

## Type of change

- [ ] **Guard** — a new/changed guard kind or its behavior (`packages/core/src`, `GUARDS.md`)
- [ ] **Runtime** — the loop / turn machine / trunk renderer (`packages/core/src`, `packages/mastra/src`)
- [ ] **Skill** — the `agentspec` generator (`skills/agentspec`)
- [ ] **Docs / tooling only** — docs, examples, tests, governance tooling, CI (no guard behavior change)

## Governance checklist

<!-- Required for Guard / Runtime / Skill changes. Docs-tooling-only PRs check the last box and skip the rest. -->

- [ ] Proof cases added — **positive + negative + neutral** for each affected guard (or **N/A**, explain)
- [ ] `pnpm test:proofs` is green
- [ ] The coverage ratchet was **not lowered** (`proof completeness · <kind>` still complete)
- [ ] Proof record committed via `pnpm proofs:record` (`governance/proofs/*.md`, `verdict: PASS`)
- [ ] `governance/MATRIX.md` regenerated (`pnpm proofs:matrix`) and committed
- [ ] If a guard kind changed: `packages/core/GUARDS.md` **and** `skills/agentspec/references/guard-catalog.md` updated (the parity test enforces it)
- [ ] Drift lint clean (`node tests/no-bench-drift.test.mjs`)
- [ ] Docs-tooling-only change — no proof record needed

## Paste the generated matrix row

<!-- Copy the row for this record from governance/MATRIX.md (or write N/A for docs-tooling-only). -->

```
| Date | Record | Change | Scope | Isolated | Collective | Coverage | SLM canary | Verdict |
```
