# Governance — the proof process for looprun's guard runtime

looprun ships a **deterministic guard layer**: every rule is a `check()` (the machine gate) paired
with a `prose()` (the same rule, rendered into the prompt). The value of that layer is only as good as
our confidence that a guard **still does exactly what it claims** after every change. This document is
the process that manufactures that confidence: a **proof** for each guard, re-run on every push, plus a
computed coverage floor that cannot silently drop.

The one-line rule: **a change to a governed surface ships with a passing proof record, or it does not
ship.**

## Why proofs (not just tests)

Ordinary tests answer "did this pass on my machine?" A guard runtime needs a stronger, standing answer:
"for guard *X*, here is the compliant flow it MUST allow, the violation it MUST catch, and the
look-alike it must leave alone — and all three are green, in isolation and when *X* runs beside every other guard." Because the guards
are pure by construction (no clock, no entropy, no network, no model call inside a `check()`), that
answer is fully deterministic — the same inputs always produce the same verdict, so a proof is a
durable statement about behavior, not a flaky snapshot.

## The proof model

A **GuardProof** describes one guard as a small, deterministic bundle of cases run over a scripted fake
LLM and a fixture world (no API keys, no network). Every guard carries all three polarities:

| polarity | meaning |
|---|---|
| **positive** | a compliant scenario the guard MUST allow (`check()` returns `null`; the loop passes clean) |
| **negative** | a violation the guard MUST catch (`check()` returns a correction; the loop vetoes/redrives) |
| **neutral** | a look-alike the guard must LEAVE ALONE (attempt-keyed / status talk / unrelated tool) |

Proofs run at two levels, plus a collective level:

- **L1 — pure-check** (`packages/core/test/proofs/`): the guard's `check(ctx)` is exercised directly
  over crafted `GuardCtx` values. Both verdicts are proven: `null` on the positive/neutral cases, a
  deny/correction string on the negative case. Test ids read `L1 · <guard> · …`.
- **L3 — full loop** (`packages/mastra/test/proofs/`): the guard is installed on a real governed turn
  driven by a scripted fake LLM, and the observable effect is asserted — a `preTool` veto, an `onReply`
  redrive, a `postTool` report, an `onInput` refusal. Test ids read `L3 · <guard> · …`.
- **Collective non-interference**: the guard is proven to still fire (and to NOT fire spuriously) when
  it runs inside a super-agent carrying the full guard set — a guard must not be neutralized or
  triggered by its neighbors. Test ids read `collective · <guard> · …`.

### The coverage ratchet

A per-kind ratchet (`proof completeness · <kind>` describes) asserts that **every** exported guard kind
has a complete proof: all three polarities, both L1 verdicts, and at least one L3 loop case. Coverage is
**computed from the proofs themselves** — the number of kinds whose `proof completeness · <kind>`
describe fully passes — so there is no stored counter to forge and no way to add a guard without adding
its proof. Mutators (e.g. the egress reply mutator) are covered through the proven-mutators list. The
floor never goes down: `pnpm proofs:run` fails if any completeness describe is red.

## What requires a proof record

A **proof record** (`governance/proofs/YYYY-MM-DD-<slug>.md`) is the human-readable receipt that the
proof suite was run and passed for a change. It is **required** when a change touches a governed
surface:

| governed surface | why |
|---|---|
| `packages/core/src/**` | the guard factories, spec assembly, trunk renderer, turn machine |
| `packages/core/GUARDS.md` | the canonical guard reference (behavior contract) |
| `packages/mastra/src/**` | the loop that enforces guards live |
| `skills/agentspec/**` | the generator that authors guards into user projects |

It is **not** required for changes that cannot alter guard behavior:

- docs (`docs/**`, `README.md`, any `README.md`), examples (`examples/**`)
- tests only (any path under a `/test/` directory)
- the governance tooling itself (`governance/**`, `scripts/**`, `skills/looprun-governance/**`), CI (`.github/**`)
- changeset entries (`.changeset/**`), lockfiles, `package.json` manifests

The gate (`scripts/proofs/check-record-required.mjs`) encodes exactly these rules — exclusions are
evaluated first, so a test file or a doc under a governed package never trips it.

## The record workflow (3 commands)

```bash
pnpm proofs:run                       # run the suite → governance/.artifacts/proofs.json
pnpm proofs:record -- \               # write the record + regenerate MATRIX.md
  --slug add-arg-format --change "argFormat: reject malformed handles" --scope guard:argFormat
pnpm proofs:matrix                    # (implied by :record) regenerate the index
```

Then commit the new `governance/proofs/*.md` **and** the regenerated `governance/MATRIX.md`. The verdict
in the record is `PASS` iff every proof passed; a `FAIL` record does not satisfy the gate.

The record frontmatter is a flat `key: value` contract (documented in `governance/proofs/README.md` and
`skills/looprun-governance/references/record-format.md`) so it parses without a YAML library and never merge-
conflicts (one file per change).

## The `no-proof-needed` escape hatch

Some governed-path diffs genuinely cannot change guard behavior (a comment fix in `guards.ts`, a
docstring in a `src` file). A **maintainer** may apply the `no-proof-needed` label to the PR; the CI gate
step is skipped when the label is present. The label is restricted to maintainers (see Branch
protection) precisely so it is a deliberate, auditable act — never the default path.

## SLM canary lane (IMPLEMENTED — report-only, never gates)

The proofs run against a **scripted fake LLM** for determinism. The canary is the additive lane that
replays the SAME governed scenarios against a **real small local model** — no script, the model decides
— to catch cases where a guard's prose reads cleanly to a deterministic check but confuses a live small
model. It answers: *with a real small model behaving naturally, do governed turns still end compliant?*

It is **NON-DETERMINISTIC by nature and NEVER gates a PR** — a red canary is a signal, not a failure.

### How to run

```bash
pnpm proofs:canary                 # default model: ram24 (35B default tier, 24 GB machines)
pnpm proofs:canary --model ram8    # Qwen3.5-4B, ~2.5 GB, 8 GB machines
pnpm proofs:canary --model ram16   # 35B tuned for 16 GB machines
pnpm proofs:canary --model ram32   # 35B quality-max, 32 GB machines
# tier names re-keyed to RAM class 2026-07-15 (old micro/minimal/normal/pro still accepted)
```

The wrapper checks **model availability first**. On a machine WITHOUT the weights (e.g. a contributor's
laptop, or CI) it prints `canary skipped (model <alias> not available locally)`, writes a
`{ skipped: true }` artifact, and **exits 0** — a skipped canary is never a failure. When the model IS
available it builds one collective spec, replays every governed scenario through the real
`runSpecConversation` loop (single-threaded, sequential — one shared server), and writes
`governance/.artifacts/canary.json` (gitignored). The scenarios live in the isolated
`packages/mastra/canary/*.canary.ts` lane behind its own `vitest.canary.config.ts`, so they never run in
`pnpm test` or `pnpm test:proofs`.

### Outcome taxonomy & pass rate

Each scenario lands in exactly one bucket:

| outcome | meaning |
|---|---|
| **caught** | the runtime intervened (a guard veto/redrive/refusal/report, a forced-terminal, or a reply mutator) and the governed turn still closed |
| **clean** | zero recovery events — the model behaved on its own |
| **exhausted** | the guards caught it but the model never produced a compliant reply, so honest-abstain fired (`exhaustion-terminal` / `exhaustion-salvage`) |
| **error** | the run threw / set `errorMsg` |

**Pass rate = `(caught + clean + exhausted) / total`.** All three are COMPLIANT outcomes — the governed
turn ended safely — so only **`error`** counts as a failure. Each scenario is a vitest `it` that asserts
only `outcome !== 'error'`; everything else is data.

### Recorded in the proof record

When a `governance/.artifacts/canary.json` exists and was not skipped, `pnpm proofs:record` prefills the
record's `slm_canary` field with `"<passRate> (model <alias>, advisory)"` (an explicit `--slm` flag
overrides it); otherwise the field stays `n/a`.

### Hardware & scheduling

The canary runs **only where the model weights exist** — typically a maintainer's machine, not a hosted
CI runner (local models do not fit hosted runners, which is why there is deliberately **no GitHub
workflow** for it). Scheduled canary runs are a future option via a **self-hosted runner** with the
weights present; until then it is a manual, maintainer-run command.

## Branch protection (repo settings — not committable here)

These live in GitHub repo settings (Settings → Branches → `main`) and cannot be set from the tree.
A maintainer applies them with ONE command (idempotent, needs `gh` auth with repo admin):

```bash
bash scripts/proofs/setup-branch-protection.sh
```

What it configures (documented here so the process is complete and auditable):

- **Require the `ci` status check** to pass before merge (it runs the proof suite, the matrix `--check`,
  and the proof-record gate).
- **Require ≥1 approving review**.
- **Require review from Code Owners** (`.github/CODEOWNERS` routes the governed surfaces —
  `packages/core/src/`, `packages/core/GUARDS.md`, `packages/mastra/src/`, `skills/agentspec/` —
  AND the law-making machinery — `governance/`, `scripts/proofs/`, `skills/looprun-governance/`,
  the drift lint, `.github/` — to `@marcosluizfp`, so neither a guard change nor a change to the
  gate itself merges on a single non-owner approval).
- **Restrict the `no-proof-needed` label** to maintainers (Settings → labels / repository roles) so the
  escape hatch cannot be self-applied by a contributor.
- **No force-push to `main`** and no branch deletion.
- `enforce_admins` stays **false** on purpose: admins keep direct-push for day-to-day maintainer work;
  the law binds contributors. Flip it in the script when the maintainer team grows.

## Reference

- The matrix of every record: [`MATRIX.md`](MATRIX.md) (generated)
- The record format: [`proofs/README.md`](proofs/README.md)
- How to author a proof + run the loop: the `looprun-governance` skill (`skills/looprun-governance/SKILL.md`)
- The guard contract every proof is written against: [`../packages/core/GUARDS.md`](../packages/core/GUARDS.md)
- Contributor workflow: [`../CONTRIBUTING.md`](../CONTRIBUTING.md)
