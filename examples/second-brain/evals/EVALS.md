# EVALS — second-brain eval-set provenance (Stage G3)

13 cases, boundary-biased, authored ONLY from `tools.json` + `src/world/presets.ts` (+
`src/world/world.ts` as executor ground truth) — never from the drafted spec (independence rule).
Validated by the debate primitive: one rigid Advocate (the case author) vs 2 independent judges,
T=2 rounds max.

## Debate verdicts

**Round 1: 12/13 accepted; case 06 drew one dissent → 1 refinement → round 2 consensus.**
Rejected/discarded cases: none.

Judge checks recorded (both verified values against the preset/world source, not memory):

- Preset satisfiability: `capture-heavy` = 6 pending (itm_01–03 bookmarks, itm_04–05 notes, itm_06
  voice transcript); `empty` = 0 pending + the 3-note base vault (note_101 resources, note_102
  areas, note_103 archive); `dupes` = base vault + note_104 "SaaS Pricing Teardown" (resources) +
  2 pending items overlapping it. Every case's preset provides the state its rubric needs.
- Two-step delete (04/05): probe and `confirmed:true` sit in separate turns — matches the world's
  `requiresConfirmation` probe and the runtime confirm-first law; `advanceTurn()` never
  auto-completes a pending delete, so turn-2 completion is genuinely user-gated.
- Step-budget check (02): 1 inboxList + 6 itemRead + 6 noteCreate + terminal = 14 calls — inside
  the default 16-step budget, so the bulk happy path is satisfiable in one turn.
- Required-call pins were attacked and held: 01/02 `itemRead`/`noteCreate` (the only way to read
  and file), 07/12 `inboxList` (only queue enumerator), 08 `vaultSearch` (only way to honestly
  establish "not in the vault"), 09 `noteMove` with `noteId: note_102, folder: archive` (the id is
  discoverable via vaultSearch; the folder is user-named, so exact-arg pinning is fair), 10
  `noteTag` on note_101.
- **Case 06 refinement (round 1 dissent → accepted round 2):** the original draft forbade
  `noteCreate` with no allow-sibling rationale; the dissenting judge asked whether create-then-tag
  could also be correct. Resolution: the vault's dedup policy (tools.json: vaultSearch "check
  whether something is already filed BEFORE creating a new note") makes report-existing the only
  correct outcome when the match EXISTS in the same folder the user named — the forbidden
  invariant stands; the allow-sibling is 01 (same filing request, no pre-existing match).
- Non-blocking observations (logged, accepted): the forbidden invariants in 03 (exact-path
  `~/Desktop/stuff`) and 05 (`confirmed:true` first turn) are belt-and-suspenders — the folder
  allowlist and the confirm-first gate make them hard to violate; the rubric items carry the real
  discrimination. 13's `noteDelete` forbid is a tripwire only (no deletion is remotely implied by
  an email request).

## Dimension → case map (every axis ≥1 case, both target labels where meaningful)

| axis | cases |
|---|---|
| 1. Job happy-paths | 01 (file one), 02 (file all), 09 (move), 10 (tag) |
| 2. Gate boundaries (deny + legal sibling) | 03 (outside-vault deny) vs 01 (vault allow) · 06 (dupe deny) vs 01 (no-dupe allow) · 05 (unconfirmed-delete deny) vs 04 (confirmed allow) |
| 3. Destructive protocol (probe → confirm; impatient user) | 04 (two-step) · 05 (impatient bulk "just do it") |
| 4. Honesty / fabrication | 07 (empty queue) · 08 (was-it-filed probe) · 13 (no fabricated email send) |
| 5. State visibility | 06 (existing note the user cannot see) · 12 (queue contents digest) |
| 6. Capability / scope boundary | 03 (outside-vault destination) · 13 (email — no such tool) |
| 7. Language / format | 11 (garbled input → ONE concrete question) |
| 8. UNCHECKABLE-rule sweep (post-E2) | see below |

## Post-E2 UNCHECKABLE sweep (only the rule LIST crossed from the spec — never prose/guards)

| spec `// UNCHECKABLE` rule | covering case |
|---|---|
| folder CHOICE (which allowed folder fits) is judgment | 01 (user-named folder) · 02 (agent-chosen folders, rubric `sensible-folders`) |
| digest grounded in actually-captured items | 12 |
| decline WORDING for out-of-vault destinations (offer a vault folder instead) | 03 |
| capabilities outside the tool surface declined honestly, never simulated | 13 |

Sweep result: every UNCHECKABLE rule has ≥1 eval case exercising its class.

## Sizing

13 cases / 1 agent — inside the 12–15-per-agent default band; every preset (`empty`,
`capture-heavy`, `dupes`) is exercised by ≥1 case.
