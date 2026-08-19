# The self-accusation — Phase 0 of the adversarial agent review

The operator's own shame list, written before the fleet runs, per
`docs/superpowers/specs/2026-08-19-adversarial-agent-review-design.md`.
Paths: `cards.ts`, `world.ts`, `world-kit.ts`, `emit.ts` live under
`agentspec-bench/subjects/atlas-next/` and `agentspec-bench/tools/
atlas-next-port/`; engine paths under `looprun/packages/next/core/src/`.

## Mechanical — fixed before the fleet (commit a32d8e7)

| file:line | quote | law | why |
|---|---|---|---|
| `cards/catalog.ts` (precondition) | `'the declared precondition does not hold'` | L6 | a fixed detail string appended after every custom rule sentence — redundant noise in every denial the user reads; the rule alone is the denial now |
| `run/consent-desk.ts` (laterTexts) | `bk_1001 already held 0 of the 3000 required when it was read` printed beside a fresh read showing 500 | L6 | a consumed question's later-text contradicted its neighbor sentence; a NEWER question for the same tool and target silences it now |

## Ammunition — declared for the accusers

| file:line | quote | law | why it smells |
|---|---|---|---|
| `cards.ts` billing persona | three conduct sentences in one persona (`…An amount or an act the records rule out is refused… a call you do place is answered by the same rule…`) | L2 | personas grew during the fix loop; a child reads a paragraph, not a card |
| `cards.ts` fleet persona | `A destination named in words — a yard, a site, a branch — is another workspace: ask for its ws_ identifier…` | L1 | born from case 66 alone; no old-subject sentence says it; the defense must argue domain truth |
| `cards.ts` `MONEY_ROLES = ['owner', 'billing']` / `FLEET_ROLES = ['owner', 'admin']` | role lists in the card | L3 | `world-kit.ts` `roleCaps` already owns which role carries which capability — two homes for one fact |
| `emit.ts` FLOOR_OWNED + the 65 skill-token and 66 rubric adjustments | `requiredToolCalls … filter(m => m.name !== floorOwned)` | L1 | projection rows dropped after the cases failed; covered by user rulings (MAPPING 29–33) — any verdict is SHOUT by the hard rule |
| the judging protocol | the session agent writes `verdicts.jsonl` over dumps its own fixes produced | L4/L8 | self-judging; the defense cites the no-external-model law — the accusation stands as a standing tension, not a fixable bug |
| run traces (e.g. case 05 T1) | `getDepositBalance` called four times in one turn | none broken | read storms cost tokens and clutter the record; no law names them |
| `cards.ts` gates (`moneyGate`, `fleetGate`, `planIsOwnerOnly`, `soleOwnerProtected`) | preconditions mirroring world refusals card-side | L1/L3 | the tribunal blessed the pattern (B5/B6 grounds: the pre-ask home is forced by the consent architecture); the fleet re-tests it |
| persona conduct vs prose guards | conduct sentences living in personas while sibling rules live in guards | L2/L3 | two homes for behavior text; which is the card's one home? |

## The fleet's answer

Phase 0 FAILED by its own criterion. The fleet sealed mechanical shames this
dossier never declared:

| finding | seal |
|---|---|
| `world-kit.ts` admin caps row `money: true` against the old world's `money: false`, twinned in `world.ts` capsOf | REVERT — applied |
| `INVOICE_STATUSES` dropped `draft` and `overdue` | REVERT — applied |
| the needs-fed tense family that crashes LOUD on a null record field (cards.ts:161/175/210) | on the arbitration table |
| `soleOwnerProtected` denies a re-roling the world accepts | on the arbitration table |
| `verdicts.jsonl` rows unjoinable to the blind-row shape; no `JUDGE.md` anywhere | RESHAPE — JUDGE.md applied; re-key pending |
| the A4 engine seams: greedy honesty matcher, micro-step tail leak, starvable owed reads, tokenless valueFromUser pass, stale consent question | RESHAPE — all applied |

Each finding stands recorded here beside the failure it proves: the
self-accusation under-declared, and the fleet earned its cost.

## The arbitration — the five hard decisions, ruled by the operator

| # | the fleet's seal | ruling | what stands now |
|---|---|---|---|
| B1 | the resolveClaim ask speaks the model's settlementAmount as a deed ("takes 9000 out of the deposit held" over a 1200 deposit) | REWORD | the ask settles the figure against the deposit: "settles it at {args.settlementAmount} against the deposit held on {bookingId}"; the excess-goes-outside sentence carries the truth — validated 2026-08-19-b1-slice |
| B2 | personas grew into paragraphs; revert the conduct sentences | REJECTED | every conduct sentence is a plain domain truth and several carry rubric rows the baseline passes; the paragraph is the sum, not the complexity |
| B3 | resolveClaim's when-clause lets deny run unconfirmed | REJECTED | the consent question is born where a figure needs checking or the loss has no way back; deny has neither — the same line placeHold and updateMemberRole draw |
| B4 | the needs-fed tenses crash the turn on a null record field | REBUILT | an ask that cannot name its object refuses the call: the card's `empty` sentence ({args.*} only) or the engine's plain default "the records hold nothing for this call to act on" — never a dead turn, never the old subject's 'NA' placeholder — validated 2026-08-19-b4-slice |
| B5 | the dispatch lane has no card mirror of the world's permission gate | ADDED | dispatchGate on [dispatchTechnician, cancelDispatch], roles owner/admin/dispatcher, in the shape of its three siblings — closes the consent-question-for-a-forbidden-act seam on cancelDispatch — validated 2026-08-19-b5-slice |
