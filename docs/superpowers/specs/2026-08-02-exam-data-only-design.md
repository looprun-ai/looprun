# Increment 2a — exam as data (`cases.json`) + validate + judge-input

Date: 2026-08-02 · Status: approved · Repo: looprun · Depends on: increment 1 (guard ids for
`targets`)

## Problem

The exam was a free TS file. Consequences measured in the Atlas run: a global bulk edit corrupted
15 cases; premise incoherence (cases naming records their preset never put in the required state)
cost full measured rounds and had to be policed by a subject-minted test with hand-written
exclusions that swallowed the class; judge input was built ad hoc (flattened trace → ruler
guessing turn boundaries; monolithic output → 64k blowup; dispatcher-added interpretive rules →
cross-round contamination).

## Deliverables

### 1. `cases.json` schema (zod)

```jsonc
{ "cases": [ {
    "id": "72-maintenance-lifecycle",
    "agent": "fleet",
    "setup": { "preset": "assetMaintenance" },
    "turns": [ { "userText": "…" }, … ],
    "invariants": {
      "required":  [ { "tool": "completeMaintenance", "anyArgs": { "assetId": "ast_genr01" } } ],
      "forbidden": [ { "tool": "cancelBooking" } ]
    },
    "rubric": [ { "id": "r1", "description": "…", "critical": true } ],
    "targets": ["agent:onlyWorkshopAssetsAreCompleted"],
    "predict": "…"                    // the E1 per-case prediction line
} ] }
```

Structured data makes anchored edits trivial (edit ONE object) and bulk regex edits pointless —
the corruption class dies with the format.

### 2. `looprun-eval validate`

One verb, three layers, replacing subject-minted lints/tests:
- **schema**: all three configs (norms/world/cases) parse under zod;
- **references**: every `targets` id exists in the installed guard inventory; every preset exists;
  every agent id routes; reverse-coverage (a guard no case targets) reported with justification
  ledger support;
- **premise coherence** (engine-owned, generalizing the run's `premise.test.ts` WITHOUT its
  hand exclusions): replay required writes in declaration order against the world; a
  state-forbidden write the world accepts ⇒ the case forbids nothing; a required write the world
  refuses ⇒ the case can never pass; consent-timing entries (`confirmed:true`) are the two-step's
  business and are skipped; multi-turn chains the replayer cannot construct are SKIPPED LOUDLY
  with a floor on reached verdicts (pass-by-inability is how the defects survived).

### 3. `looprun-eval judge-input`

Builds the judge's input file from a run dir — the ONLY sanctioned path to the judge:
- per-case JSONL: `caseId`, `rubric`, `actualReplyByTurn[]`, `actualTraceByTurn[][]` (turn
  boundaries preserved — never flattened), `goldSeq`, `goldReply`;
- **blind**: no variant label, no rep label, no file paths hinting at variant;
- deterministic order (case id), so two judges of the same run see identical bytes;
- `--chunk N` splits into `judge-input.partK.jsonl` files sized for incremental verdict writing.

The sealed `judge-prompt.md` remains the subject's ruler. The judge itself stays a HOST SUBAGENT
following the step-by-step protocol in the agentspec spec
(`2026-08-02-judge-protocol-and-authoring-laws-design.md`) — the dispatcher passes paths only,
never interpretive rules.

### 4. Fold: byte-identical verdict sync (E2, promoted from BACKLOG)

`looprun-eval fold` detects byte-identical (trace+replies) case transcripts across run dirs of
the same campaign and forces one verdict per equivalence class (mechanical, no judge). The Atlas
run showed a weaker ruler fabricating 4 ALARMs on identical transcripts; sync dissolves them.

## Testing

- Schema fixtures incl. every invariant/rubric shape used by coworking + atlas.
- Premise checker: reproduce cases 19/56/59 (accept-when-should-forbid), 20/36 (multi-turn), 53
  (read-side) as fixtures — checker FIRES on each, and on none after correction.
- judge-input: golden-file test proving per-turn structure, blindness (grep for variant strings),
  chunk boundaries.
- fold sync: two dirs with one identical transcript and divergent verdicts → one final verdict,
  provenance line emitted.

## Out of scope

Campaign orchestration (2b), world DSL (increment 3), rubric↔prose semantic diff (skill-side law).
