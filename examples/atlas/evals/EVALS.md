# atlas — eval set provenance (G3, merged)

61 cases across 5 buckets (12+12+12+12+13), authored per `references/eval-generation.md` under the
INDEPENDENCE rule (world/tools/presets/judge-prompt only — no atlas spec read), each debate-validated
(rigid Advocate × 2 Judges). Per-bucket dimension maps + verdicts + discards:

| bucket | ids | provenance |
|---|---|---|
| at-rentals | 01–12 | [EVALS-at-rentals.md](EVALS-at-rentals.md) — added the `reschedule-conflict` preset (world change, sanctioned) |
| at-billing | 21–32 | [EVALS-at-billing.md](EVALS-at-billing.md) — ideal traces executed against AtlasWorld (3070/3850/2000 anchors) |
| at-claims | 41–52 | [EVALS-at-claims.md](EVALS-at-claims.md) |
| at-inventory | 61–72 | [EVALS-at-inventory.md](EVALS-at-inventory.md) |
| at-admin | 81–93 | [EVALS-at-admin.md](EVALS-at-admin.md) + case 93 (post-E2 sweep, below) |

Case→agent map (the "user picks the agent" bucketing): `CASE_MAP` in [`cases.ts`](cases.ts) —
every case exactly once. The merged set (`CASES`) derives 61 from the five bucket files.

## Post-E2 UNCHECKABLE sweep (the one sanctioned spec→eval crossover: rule LISTS only)

| spec UNCHECKABLE rule | coverage |
|---|---|
| rentals: check-in-before-close / dispatch-needs-active-booking / per-booking checkout gates | world-enforced; replies exercised by 10, 11 |
| billing: numeric fidelity · generate-before-pay · refund cap · shortfall honesty | 21 · 22/28 · 25 · 27 |
| claims: claim-ref provenance · PII minimization · policy grounding · hold↔claim precision | 41/49 · 51 · 42/43 · 44/45 |
| inventory: condition/history honesty · out/reserved retire blocks · act-directly | 71 · 65 · 61/63 |
| admin: tenant isolation · member-id provenance · sole-owner protection · quota anti-fabrication | 91 · 82 · **93 (added by this sweep** — world probe: removeMember(mem_0001, confirmed) → SOLE_OWNER, tookEffect:false; rubric-only per the case-84 precedent**)** |
| admin: audit-log grounding | **ACCEPTED GAP** (12-case budget; honest-empty-data exercised indirectly by 84/91/92; natural 14th case if the bucket grows) |
| admin: plan downgrade below usage (N4-A2) | **ACCEPTED GAP** — world-enforced (DOWNGRADE_BELOW_USAGE), prose + UNCHECKABLE added in N round 1; no eval case yet |
| inventory: scheduleMaintenance on an OUT asset (N4-B2) | **ACCEPTED GAP** — world-enforced (ASSET_OUT), prose + UNCHECKABLE added in N round 1; natural 13th case |

## Difficulty stance
Boundary-biased by design (bar target 85–90% vs flash-lite-thinkoff, deliberately non-saturated):
exact cap edges, deny+sibling-allow pairs, impatient-user pressure on every destructive family,
figure-assertion honesty, cross-bucket scope traps. Never ambiguous (debate ground #3).
