# Config-only generation architecture — umbrella design

Date: 2026-08-02 · Status: approved (direction) · Repos: looprun (engine), agentspec (skill)

## Root cause this answers

The Atlas generation run (agentspec-bench, 2026-08-01/02) surfaced ~17 defect classes. Every one
maps to the same origin: **the skill authored executable TypeScript** (a 2,000-line world, specs
with free `custom()` guards and hand regexes, a TS case file) **where it should have authored
DATA**, and then minted per-subject lints/tests to police its own output. Executable semantics
belong in the engine; the skill's output is configs (zod-validated JSON) and docs (.md).

Measured evidence per class (from the run):
- 9 defective text regexes (none right first try; several destroyed correct work)
- 15 cases corrupted by a global bulk edit; premise incoherence needed a subject-minted test
- world defects: missing clock, wrong presets, operator-text echo — found only by an independent
  test agent (415 tests) and a forensics read
- deny messages interpolating world facts the model then repeated unread (5 cases)
- exhaustion stub announcing a no-effect simulate as "succeeded"
- duplicated observed-ledger predicates drifting across specs
- guard prose displaced into `behavior[]` when a check was rejected
- ad-hoc judge input (flattened trace, 64k output blowup, dispatch contamination)
- hand-computed certification numbers diverging from `looprun-eval cert`

## Target split

```
skill generates ONLY   norms/<agent>.json · world.json · cases.json · campaign.json · docs (.md)
engine executes        validate (zod + coherence) · interpret the world · install guards from
                       the catalog · render trunk/deny/abstain by policy · run campaigns ·
                       build judge inputs · fold/range/cert/seal
rule w/o primitive     "uncheckable": true → prose + judge (N4 law). NEVER generated code.
judge                  remains a SUBAGENT of the host, following the engine-built input and a
                       step-by-step protocol (skill-side spec) — no JudgeExecutor in the engine.
```

## The five executors (each has its own spec)

| executor | spec | increment |
|---|---|---|
| GuardCatalog — guards installed from config; NO regex-on-text by schema | `2026-08-02-guard-catalog-data-only-design.md` | 1 |
| TrunkRenderer policies — deny "name the read, never the figures"; ledger-derived abstain | same spec as GuardCatalog (they ship together) | 1 |
| Validate + exam-as-data — `cases.json` schema, premise/coherence checker, `judge-input` | `2026-08-02-exam-data-only-design.md` | 2 |
| EvalExecutor — `looprun-eval campaign` end-to-end | `2026-08-02-eval-executor-design.md` | 2 |
| WorldEngine — declarative world interpreted by the engine | `2026-08-02-world-engine-design.md` | 3 |

Skill-side counterpart (agentspec repo): `2026-08-02-judge-protocol-and-authoring-laws-design.md`
— the judge subagent's step-by-step protocol and the surviving process laws (judge-before-classify,
verdict-attached exam edits, active watch, rubric↔prose diff).

## Standing decisions

- Pre-1.0: no compatibility commitment; TS-authored bundles (coworking, atlas) remain runnable
  until each increment lands, then are regenerated/ported per subject — never dual-maintained.
- E1 (invariants must see guard-vetoed ATTEMPTS, not only executed calls) ships inside increment 1;
  it corrects the fabricated deterministic premium.
- Order 1 → 2 → 3. Increment 3 (WorldEngine) is the largest and may stage builder-API-first.
- The engine refuses what the schema forbids: bans are structural, not disciplinary.
