# Contributing to looprun

Thanks for helping build looprun. This guide covers dev setup, the governance model, and the exact
order to add or change a guard.

## Dev setup

Requirements: **Node ≥ 22** and **pnpm** (see `packageManager` in `package.json`).

```bash
pnpm install
pnpm -r --if-present build
pnpm -r --if-present typecheck
pnpm test            # all package tests + the law tests
pnpm test:proofs     # the deterministic guard-proof suite
```

Everything in this repo is written in **English** — code, docs, records, comments.

## The governance model (TL;DR)

looprun's guards are deterministic (`check()` = machine gate, `prose()` = the same rule in the prompt).
To keep them trustworthy, **a change to a governed surface ships with a passing proof record**:

- **Governed** (needs a record): `packages/core/src/**`, `packages/core/GUARDS.md`,
  `packages/mastra/src/**`.
- **Not governed** (no record): docs, examples, tests-only (any `/test/` path), the governance tooling
  (`governance/**`, `scripts/**`, `skills/looprun-governance/**`), CI (`.github/**`), changesets, lockfiles,
  manifests.

A record is one file at `governance/proofs/YYYY-MM-DD-<slug>.md`, indexed in `governance/MATRIX.md`.
Full policy: [`governance/GOVERNANCE.md`](governance/GOVERNANCE.md). The `governance` skill automates the
scaffold → run → record loop (`skills/looprun-governance/SKILL.md`).

## Add a guard (TDD order)

Author the proof **before** the implementation — the proof cases are the spec.

1. **Author proof cases FIRST** in `packages/core/test/proofs/` — a `GuardProof` catalog entry for the
   new kind with **positive / negative / neutral** L1 cases plus at least one **L3 loop** case (and the
   collective non-interference expectation). See
   [`skills/looprun-governance/references/proof-case-authoring.md`](skills/looprun-governance/references/proof-case-authoring.md).
2. **Implement** the guard in `packages/core/src/guards.ts` until the cases pass.
3. **Update the catalog doc**: `packages/core/GUARDS.md`.
4. **Run the suite**: `pnpm test:proofs` (green, ratchet not lowered).
5. **Generate the record**:
   ```bash
   pnpm proofs:run
   pnpm proofs:record -- --slug <kebab> --change "<one-liner>" --scope guard:<kind>
   ```
6. **Commit the record + `governance/MATRIX.md`** together with your code.

Changing an existing guard, the runtime, or the `agentspec` skill? Same loop — update/extend the proof
cases for the affected kind(s), then run + record with the matching `--scope`
(`guard:<kind>` · `runtime` · `skill`).

## Running proofs

Proofs run against a **deterministic scripted fake LLM** and a **fixture world** — **no API keys, no
network**. That is what makes a proof a durable statement about behavior rather than a flaky snapshot.
`pnpm proofs:run` writes a summary to `governance/.artifacts/proofs.json` (gitignored) and fails if any
proof is red or the coverage ratchet dropped.

## The SLM canary (optional, maintainers)

`pnpm proofs:canary` is an **optional, report-only** lane that replays the same scenarios against a
**real small local model** — it NEVER gates a PR. **Contributors do not need it**: it requires local
model weights, so on a machine without them it prints `canary skipped …` and exits 0. Maintainers with
the weights run it to sanity-check that guard prose holds up in front of a live small model; the result
lands in the proof record's advisory `slm_canary` field. See
[`governance/GOVERNANCE.md`](governance/GOVERNANCE.md#slm-canary-lane-implemented--report-only-never-gates).

## The `no-proof-needed` escape hatch

A governed-path diff that genuinely cannot change guard behavior (a comment, a docstring in a `src`
file) can be exempted: a **maintainer** applies the `no-proof-needed` label to the PR and CI skips the
gate. It is maintainer-restricted on purpose — use it deliberately, not to route around a real change.

## Before you open a PR

- `pnpm test:proofs` green; `node tests/no-bench-drift.test.mjs` clean; `pnpm proofs:matrix` committed.
- Fill in `.github/pull_request_template.md` (Summary / Type of change / Governance checklist / matrix row).
- Links: [`governance/GOVERNANCE.md`](governance/GOVERNANCE.md) · [`governance/MATRIX.md`](governance/MATRIX.md).
