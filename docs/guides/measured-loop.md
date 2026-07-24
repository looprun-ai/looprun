# The measured loop

The certification protocol of a looprun project. **Quality has exactly one ruler: the LLM judge — the frontier coding agent running the loop (any vendor).**
The runner's streamed `pass/fail` lines are the deterministic *invariant gate* — auto-fails, never the
quality verdict.

## Run (Stage T — screen)

```bash
npx looprun-eval run --subject <dir>                 # target from ask/targets.json
npx looprun-eval run --subject <dir> --model <id> --base-url <url> --api-key-env <ENV>
npx looprun-eval run --subject <dir> --ungoverned    # same bundle, governance surface emptied
```

Outputs land in `<subject>/test/<date>-<model>-<arm>/` (override `--out`): `cases.jsonl` (one
CaseDump per line — the judge's input) + `SUMMARY.md`. Invariants (`requiredToolCalls` must
succeed; `forbiddenToolCalls` fail on the ATTEMPT, even when the world refuses) are the
deterministic gate only — never the quality verdict.

## Judge (the coding agent running the loop — never the subject model's family)

1. `npx looprun-eval judge-prompt` prints the packaged generic prompt. Apply it (plus the domain
   rules in `evals/judge-prompt.md` — RULES only, the generic prompt owns the output format) to
   `cases.jsonl`, one verdict JSONL line per case (`{caseId, verdict: "pass"|"fail", reasons: []}`),
   into `verdicts.jsonl`.
2. `npx looprun-eval fold --dump <run>/cases.jsonl --verdicts <run>/verdicts.jsonl`
   → `RESULTS.md`. Final pass = invariants AND judge; a missing verdict counts as FAIL, loudly.

## Fix (the closed 7-class taxonomy — cheapest, most-deterministic first)

Classify EVERY fail, fix ONE class per iteration, re-screen only the failed cases, ≤3 iterations:

1. **State-visibility gap** → render the missing state (contract `stateBlock` / a directive).
2. **Missing hard gate** → add a guard from the catalog at the right hook.
3. **Scope gap** → add the missing tool to the agent, or remap the case to the right agent
   (historically the highest-yield single fix).
4. **Unconditioned prose** → add the state condition to the behavior line.
5. **Fabrication pattern** → an existence-keyed anti-fabrication reply-gate.
6. **Language coin** → ACCEPT as residual (human gate) — do not chase with prose.
7. **Eval defect** → fix the EVAL (+ re-debate it), never bend the spec to a broken case.

After ANY spec/contract edit: `npx looprun-eval lint src evals --spec-laws` must stay clean.

## Certify (Stage S)

```bash
npx looprun-eval cert <run> [--bar 0.9] [--date <iso>] [--note <text>]
```

`cert.json` + `CERT.md`: overall vs the bar (default ≥90%). The cert is N=1-honest — it states
`reps: 1` explicitly; multi-rep aggregation is a later, separate artifact (run/judge/fold each
rep, then aggregate). `--date` supplies `generatedAt` (no wall-clock default). Commit
`verdicts.jsonl`, `RESULTS.md`, `cert.json`, `CERT.md`; the dumps stay gitignored.

## Discipline (non-negotiable)

- **The STOP rule** — once the aggregate is at/above the bar, STOP. Prose is non-local: a targeted
  prose edit that fixes one case regresses siblings (measured net −2). If an edit doesn't net-improve
  the bucket, REVERT it.
- **N=1 screens; multi-rep confidence is a separate, honest artifact.** Cut a cert only when the
  screen sits ≥ bar−5pt (cost guard); each cert states its own rep count.
- **Never mix rulers.** Cross-day comparisons need a same-day replication control (unpinned model
  aliases drift).
- **Local models come AFTER certification** — a run against a localhost `--base-url` is an
  informational smoke, not a gate.
