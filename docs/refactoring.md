# looprun Refactoring — TO-BE

GOAL: Define looprun's high-level TO-BE model

> **THE GOLDEN RULE.** Creating an agent MUST BE so easy a 6-year-old could do it, and the
> engine code underneath MUST BE so plain a 6-year-old could read it.

The Atlas baseline the refactoring is measured against (85/100, the fifteen documented one by
one, case 72 as the tripwire) lives at:

    docs/analysis/2026-08-12-atlas-baseline-v020-summary.md

=====
TASKS:
Note: for tasks 1 and 2 below use adversarial workflows

0. Analyze
- ./docs/lessons-learned.md
- Git logs since 2026-08-01, pulling the code down to investigate further when you judge it clarifies things.

1. Generate a blueprint with high-level AS-IS diagrams of looprun, organized by the main packages (core, mastra, etc)
   [STATUS: DONE — delivered at docs/analysis/2026-08-12-blueprint-as-is.md]

2. Generate a TO-BE blueprint with an implementation based on classes and strong TypeScript typing (interface, enum, etc), including a class diagram, with clear and simple responsibilities, no complex dependencies, focused on simplicity and maintainability. Show ALL methods and attributes of each class.
2.1 IMPORTANT: use the RESPONSIBILITY INVERSION technique when the problem lies in a complex design — it often solves it more simply.
	Example:
		How it was:
		cancelBooking({ bookingId: 'bk_1001' })    → DENIED (tool without simulation)
		cancelBooking({ bookingId: 'bk_1001', confirmed: true })   → DENIED (tool with simulation)

		Now:
		cancelBooking({ bookingId: 'bk_1001', simulate: true })
		cancelBooking({ bookingId: 'bk_1001' })   → DENIED

		Gain:
		How it was: confirmed was used both to invoke the simulation (confirmed: false) and to signal execution approval (confirmed: true). A confusing name for 2 things. Besides that, the tools were artificially altered to accept a new parameter.
		Now: without the parameter it executes directly. Approval is checked internally by the engine, with no artificial change to the tools. If a tool supports simulation it already carries the parameter itself, under whatever name (simulate, dryRun, etc)

2.2 CRITICAL:
	- Use the lessons-learned.md AS THE BASE OF WHAT NOT TO DO
	- Backward compatibility is not required, but YOU MUST FOLLOW docs/requirements.md
  - We will use the Atlas in the agentspec-bench repo to validate the refactoring -> IT MUST SCORE >= 85/100 OR SHOW THAT SOME CASE THAT PASSED WAS FORMULATED INCORRECTLY.
  - DO NOT DO ANY IMPLEMENTATION NOW, ONLY THE TO-BE BLUEPRINT

=====
EXECUTION SHAPE — fresh build, progressive gates

The TO-BE is NOT a progressive mutation of the current code (cross-cutting charter properties
make step-wise mutation cost more than the ~small rebuilt engine, and a long migration keeps
two truths alive). It is a fresh build validated progressively — the old engine stays intact
and serving until the final gate, then dies in ONE move (and R11's skill+tutorial update is
paid once, at the swap).

phase  builds                                        gate (per-phase instrument)
─────────────────────────────────────────────────────────────────────────────────────────
1      contract leaf + ports + THE one turn machine  scripted-model proofs (no network)
2      consent · honesty · disclosure · masking      MVP cases on a hostile fixture world
3      LoopRunAgent facade (drop-in, R9.5) + server  hermes-sim / new Mastra({agents})
4      eval harness pointed at the new engine +      validate + lints green on the PORTED
       the atlas SUBJECT ported to the new           atlas subject
       authoring surface (mechanical translation)
4→5    progress signal                               FULL Atlas, informal runs
5      the arbiter                                   FULL Atlas, K reps: >= 85/100 or the moved
                                                     case argued ill-formed; case 72 intact
                                                     → THEN the old engine is deleted, one move

Two different things wear the name "Atlas", and only one of them may change:

  the EXAM      cases.jsonl, rubrics, the documented fifteen, the 85/100 baseline,
                case 72 — FROZEN. It runs whole or not at all; an exam adjusted per
                phase proves nothing against the baseline number. The only lawful exam
                change is the one R10.1 already prices: arguing a case ILL-FORMED
                against the baseline layer table, in writing, at the final gate.

  the SUBJECT   the atlas bundle (AgentSpec + DomainContract + world + norms) is
                written in the OLD engine's vocabulary and MUST be ported to the new
                authoring surface (phase 4 — that is what its gate validates). The
                port is a MECHANICAL TRANSLATION, never a redesign: same persona,
                same rules, same world, same data — the rename register is the
                dictionary. A port error has a detector: a case whose verdict moves
                because of the PORT (not the engine) surfaces in the fifteen-table
                comparison — a world/rubric-layer move is the declared SURPRISE.

Per-phase gates before the port are separate, cheap, mostly offline instruments.

=====
ADDENDUM (2026-08-12) — REQUIREMENTS CHARTER

Task 1 (AS-IS blueprint) is DONE: docs/analysis/2026-08-12-blueprint-as-is.md
(global package diagram, per-package module tables, 114 evidence-backed design-debt
items by symptom, load-bearing mechanisms table).

Task 2 (TO-BE blueprint) is governed by the REQUIREMENTS CHARTER:

    docs/requirements.md

The charter is the contract every TO-BE design is judged against. It consolidates:
the agentspec skill's pipeline inputs and process (ASK -> GEN -> EVALS -> NORMS ->
TEST -> SHIP, including the immutable company tools.json/MCP intake with proxies and
wire), the s15 design record in neurono-bench (the measured WHYs behind the AgentSpec
shape: prose+check pairing, no user-text in guards, parity, purity, persona law,
shared-prefix law), the AS-IS capability record, and the maintainer's laws (double
golden rule: child-simple authoring AND child-simple engine code; Atlas >= 85/100 or
the moved case argued ill-formed; case 72 as tripwire; no external model, ever).
A design missing any charter item is rejected mechanically (see the charter's
rejection checklist). Rejected drafts:
docs/superpowers/specs/2026-08-12-to-be-blueprint-v1-rejected.md (v1, rejected) and
docs/superpowers/specs/2026-08-12-to-be-blueprint-v2-rejected.md (v2, rejected — a
new from-scratch design round runs against the charter).
