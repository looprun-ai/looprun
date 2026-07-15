---
name: looprun-governance
description: 'Use when a change touches a looprun guard, the guard runtime, or the agentspec skill and needs its deterministic proof record before merge. Triggers — "I added/changed a guard", "prepare the proof record for my PR", "why did the proof gate fail", "add a proof for <kind>", a red `check-record-required` gate, a stale MATRIX.md.'
license: Apache-2.0
metadata:
  author: looprun
  version: "1.0"
  homepage: "https://github.com/looprun-ai/looprun"
---

# Governance — deterministic proof records for guard changes

## When to invoke

- "I added a guard / changed a guard's behavior" → author its proof, run, record.
- "Prepare the proof record for my PR" → run the loop below and produce the record + matrix row.
- "Why did the proof gate fail?" → the PR touched a governed surface with no passing record; scaffold →
  run → record (or, if it truly cannot change behavior, ask a maintainer for the `no-proof-needed` label).
- "The matrix is stale" → `pnpm proofs:matrix` and commit.

**Governed surfaces** (a change here needs a record): `packages/core/src/**`,
`packages/core/GUARDS.md`, `packages/mastra/src/**`, `skills/agentspec/**`. Everything else — docs,
examples, tests-only, the governance tooling, CI — does not. The full policy is
[`governance/GOVERNANCE.md`](../../governance/GOVERNANCE.md).

## The 4-step loop

### 1. SCAFFOLD

Emit a `GuardProof` stub for the kind you are adding or changing:

```bash
node skills/looprun-governance/scripts/scaffold-proof-cases.mjs <guardKind>          # print to stdout
node skills/looprun-governance/scripts/scaffold-proof-cases.mjs <guardKind> --write   # append into the core catalog if present
```

The stub carries **positive / negative / neutral** L1 slots + an **L3 loop** slot + a **collective**
expectation, each with authoring hints. Fill it against the real guard — see
[`references/proof-case-authoring.md`](references/proof-case-authoring.md).

### 2. RUN

```bash
pnpm proofs:run     # deterministic — scripted fake LLM + fixture world, no keys, no network
```

Writes `governance/.artifacts/proofs.json` (gitignored) and fails if any proof is red or the coverage
ratchet dropped.

### 3. RECORD

```bash
pnpm proofs:record -- --slug <kebab> --change "<one-liner>" --scope <guard:<kind>|runtime|skill|docs>
```

Writes `governance/proofs/YYYY-MM-DD-<slug>.md` (`verdict: PASS` iff every proof passed) and regenerates
`governance/MATRIX.md`. Contract: [`references/record-format.md`](references/record-format.md).

### 4. GATE (pre-PR checklist)

- Parity docs updated if a kind changed: `packages/core/GUARDS.md` **and**
  `skills/agentspec/references/guard-catalog.md` (a parity test enforces it).
- `pnpm test:proofs` green.
- Drift lint clean: `node tests/no-bench-drift.test.mjs`.
- `governance/MATRIX.md` regenerated and committed with the record.
- **Optional (maintainers, real model on hand):** `pnpm proofs:canary` — the report-only real-small-
  model lane. It NEVER gates; it just prefills the record's advisory `slm_canary` field, and skips
  cleanly (exit 0) when the model weights are not present. See
  [`governance/GOVERNANCE.md`](../../governance/GOVERNANCE.md).

## Hard rules

- **Records are in English.** Code, comments, records — all English.
- **Never lower the ratchet.** Every guard kind keeps all three polarities + both L1 verdicts + ≥1 loop
  case. Removing coverage to make a run green is a regression, not a fix. See
  [`references/ratchet.md`](references/ratchet.md).
- **Proofs are deterministic.** No API keys, no network, no clock/entropy in a case. A proof that needs
  a live model is not a proof (that is the report-only SLM canary lane — advisory, never a gate).
- **One record file per change.** Never edit an old record to cover a new change — add a new dated file
  (this is why records never merge-conflict).
- **The S-1 firewall holds in proofs too.** A `check()` reads only `GuardCtx` (args, tool, world,
  observed, reply, result) — never user text. Do not craft a proof that smuggles user text into a check.
