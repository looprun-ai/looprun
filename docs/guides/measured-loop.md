# The measured loop

The certification protocol of a looprun project. **Quality has exactly one ruler: the LLM judge — the frontier coding agent running the loop (any vendor).**
The runner's streamed `pass/fail` lines are the deterministic *invariant gate* — auto-fails, never the
quality verdict.

## Run (Stage T — screen)

```bash
npx looprun-eval check                 # config + world seams, no LLM
npx looprun-eval run                   # full set, N=1, subject = gemini-3.1-flash-lite-thinkoff
npx looprun-eval run --agent ac-books --cases 01-onboard-client,05-late-fee
```

Outputs per agent bucket in `eval-results/<date>-<domain>/`:
`<agent>.dump.json` (full transcripts) · `<agent>.autofail.json` (invariant auto-fails) ·
`<agent>.tasks.jsonl` (the judge's work items).

## Judge (the coding agent running the loop — never the subject model's family)

1. `npx looprun-eval judge-prompt` prints the packaged generic prompt. Apply it (plus the domain
   rules in `evals/judge-prompt.md` — RULES only, the generic prompt owns the output format) to each
   `<agent>.tasks.jsonl`, one verdict JSONL line per case, into `<agent>.verdicts.jsonl`.
   If your coding agent supports subagents: dispatch one judge subagent per tasks file.
2. `npx looprun-eval judge-merge eval-results/<dir>/<agent>.dump.json eval-results/<dir>/<agent>.verdicts.jsonl`
   → `<agent>.judged.json` + `pass=n/total`. Autofail wins; a missing verdict counts as FAIL, loudly.

## Fix (the closed 7-class taxonomy — cheapest, most-deterministic first)

Classify EVERY fail, fix ONE class per iteration, re-screen only the failed cases, ≤3 iterations:

1. **State-visibility gap** → render the missing state (theme `stateBlock` / a directive).
2. **Missing hard gate** → add a guard from the catalog at the right hook.
3. **Scope gap** → add the missing tool to the agent, or remap the case to the right agent
   (historically the highest-yield single fix).
4. **Unconditioned prose** → add the state condition to the behavior line.
5. **Fabrication pattern** → an existence-keyed anti-fabrication reply-gate.
6. **Language coin** → ACCEPT as residual (human gate) — do not chase with prose.
7. **Eval defect** → fix the EVAL (+ re-debate it), never bend the spec to a broken case.

After ANY spec/theme edit: `npx looprun-eval lint src evals --spec-laws` must stay clean.

## Certify (Stage S)

```bash
npx looprun-eval certify               # = run --reps 3 → eval-results/<date>-<domain>-cert/
# judge all reps, judge-merge each, then:
npx looprun-eval cert eval-results/<date>-<domain>-cert
```

`CERT.md` + `cert.json`: per-agent, per-rep, overall vs the bar (default ≥90%). Commit
`*.judged.json`, `cert.json`, `CERT.md`; the dumps/tasks stay gitignored.

## Discipline (non-negotiable)

- **The STOP rule** — once the aggregate is at/above the bar, STOP. Prose is non-local: a targeted
  prose edit that fixes one case regresses siblings (measured net −2). If an edit doesn't net-improve
  the bucket, REVERT it.
- **N=1 screens, N=3 certifies.** Certify only when every bucket screens ≥ bar−5pt (cost guard).
- **Never mix rulers.** Cross-day comparisons need a same-day replication control (unpinned model
  aliases drift).
- **Local models come AFTER certification** — `npx looprun-eval run --model qwen3.5-4b` is an
  informational smoke, not a gate.
