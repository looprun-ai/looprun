# Adversarial agent review — accuse, defend, judge

The standing process for running an adversarial agent fleet over the current
agent: the atlas-next subject, the next-engine laws, and the exam projection
rules, all at once. The fleet exists to answer one question about every rule,
sentence and mechanism in the target: **is this correct, or was it made to
pass a test?** Correctness outranks passing.

This spec changes no engine code by itself; its verdicts may. Any verdict
that lands as an engine change carries the engine spec's own four-section
duty at application time.

## Phase 0 — the self-accusation

Before any agent runs, the operator of this process (the session agent)
writes its own shame list: every candidate violation it already knows, with
`file:line` and the exact quote that convicts. The list splits two ways:

- **Mechanical, incontrovertible defects** — fixed, gated and committed
  BEFORE the fleet runs. A fleet that spends ammunition on known dirt
  measures nothing.
- **Everything else** — declared as ammunition in the dossier the accusers
  receive. The declaration is a claim of self-awareness: if the fleet finds
  only what was declared, the fleet bought little; if it finds a NEW
  mechanical shame, Phase 0 failed and the failure is recorded in the run's
  report.

Phase 0's output is one dossier file under `docs/analysis/`, committed.

## The law book — the accusation dimensions

Every accuser carries all ten laws. An accusation names exactly one.

| # | law | the accusation it licenses |
|---|---|---|
| L1 | **No test-chasing.** A rule lives only if it has an old-subject equivalent, or is a domain truth, or cites the user ruling that created it. | a rule born from one exam case with none of the three |
| L2 | **The six-year-old reads every card.** Card sentences are child-readable; personas stay short; a card computes nothing — the one exception is a precondition's single-look predicate. | a sentence a child cannot follow; a fat persona; card-side computation |
| L3 | **Clean cards, one home per fact.** Nothing is declared twice across card, world and world-kit. | a role list, a limit, or a rule text living in two places |
| L4 | **A run only counts judged; every rep is a superset of the baseline's passes.** | a scoreboard claimed from an unjudged run; a mechanism that tolerates losing a baseline pass |
| L5 | **Determinism over sampling.** A required behavior rides a mechanism, never sampling luck. | a pass that depends on the model's mood at temperature 0 |
| L6 | **AS-IS voice.** Comments and docs state what the system is; no history, no evidence citations, no test names; text that lies about the code convicts hardest. | "used to", "kept for", a comment describing behavior the code no longer has |
| L7 | **English in every byte written to a file.** | any other language in code, comments, prompts or docs |
| L8 | **The session agent is the judge.** No file calls a third-party model; the subject model under test is the one exception. | any script or path that would send a transcript to an outside model |
| L9 | **Reservations are shouted before acting.** | a caveat embedded in an implementation instead of raised first |
| L10 | **The grounding floor.** An id or date the reply speaks must come from the operator, the records, or the state note. | a mechanism or sentence that lets an unread value through |

## The target inventory — six artifacts

| id | artifact | what the accuser reads |
|---|---|---|
| A1 | `agentspec-bench/subjects/atlas-next/cards.ts` | personas, prose guards, gates (money/fleet/plan/sole-owner), preconditions, disclosure tenses, caps |
| A2 | `atlas-next/world.ts` + `world-kit.ts` + the note | fidelity to the old world (`subjects/atlas/gen/world.ts`), the note against the old stateBlock law, TARGET_ENTITY, served views |
| A3 | `tools/atlas-next-port/emit.ts` + `MAPPING.md` rules 29–33 | every projection adjustment: the crane-token ruling, the FLOOR_OWNED read rows, the 66 rubric rewrite |
| A4 | the campaign's core laws in `looprun/packages/next/core/src/**` | note plumbing, groundedDates, the one-word report merge, cap, `{result.*}` two-phase render, after-on-every-done-call, cross-turn read freshness, finish legends, the teaching corrections |
| A5 | the judging protocol | `build-judge-input.js`, the verdicts files, and the standing accusation: the session agent judges dumps it produced |
| A6 | `docs/superpowers/specs/2026-08-18-skill-requirements.md` | every recorded lesson against what actually shipped |

Accusers get the OLD subject (`agentspec-bench/subjects/atlas/norms/**`,
`subjects/atlas/gen/world.ts`) as the fidelity reference, and the Phase 0
dossier as declared ammunition.

## The fleet — accuse, defend, judge

A Workflow of at most 15 agents, temperature and models as the session
provides. Structure:

1. **Six accusers**, one per artifact, in parallel. Typed output, one row
   per accusation: `{ artifact, fileLine, quote, law, accusation,
   severity }`. An accusation without its convicting quote is dropped at
   dedupe. Severity: `mechanical` (objectively broken) or `judgment`
   (requires weighing).
2. **Dedupe in plain code** — never an agent.
3. **Per accusation, a defense pair**: one DEFENDER whose only admissible
   evidence is a citation — the old-subject sentence, the domain truth, or
   the user ruling that covers the accused text; then one JUDGE sealing
   `KEEP | REVERT | RESHAPE | SHOUT` with one sentence of grounds. The hard
   rule: an accusation touching a USER ruling (the projection rules, the
   absolute bar, the one-word merge, the tail option) or touching
   declarative vocabulary NEVER seals — it becomes SHOUT regardless of the
   judge's lean, with the judge's lean recorded.
4. **Synthesis**: one agent merges to a final verdict table with grounds
   and the exact files/lines to touch, plus the SHOUT list. A verdict
   without a quote does not survive synthesis.

## Verdict application — the mixed rule

- **Mechanical verdicts**: applied directly, gates green, committed.
- **SHOUT list**: presented to the user one table, arbitrated before any
  edit.
- After application: the re-run set is the FULL 70 whenever a card, world
  or core edit landed (any of those shifts every prompt); a projection-only
  edit re-runs just the cases it names. Every re-run is judged (L4) under
  the absolute superset bar, before cases 71–100 run.

## Sequencing

This review runs NOW — after the accepted final-r4 judgment of cases 01–70
and before cases 71–100 — so the last thirty cases run over a cleaned base.

## Success criteria

- The fleet finds no NEW mechanical shame beyond the Phase 0 dossier; if it
  does, the run report records Phase 0 as failed alongside the finding.
- Every surviving verdict carries its quote and its grounds.
- After application and re-judging: zero baseline passes lost across the
  re-run set.
