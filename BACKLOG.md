# Backlog

Open items. An entry leaves this table only when done or explicitly retired with a reason —
a pending item that quietly disappears is the failure this file exists to prevent.

| item | what remains | next step |
|---|---|---|
| **Every published figure is void** | Engine, guards and process were audited and repaired after the last measurement campaign; `docs/benchmarks.md` still carries the old table — a claim the tree cannot back. | Re-measure or withdraw the table. |
| **No current bundle to measure or lint against** | Examples became seeds; the only complete subject is the minimal toy-subject fixture. Lint non-vacuity proofs and discrimination runs have nothing realistic to run on. | Generate a current bundle when one is needed. |
| **Lint: tools.json drift vs served surface** | Not decidable offline — needs a live server. | Implement as a runtime check, not a lint. |
| **Lint: projection key / preset never exercised in world test** | The world TEST file has no fixed shape; a gate over an unconstrained file is a guess. | Define the convention first, then lint. |
| **Lint: probe parity for the two-step flow** | Requires executing the confirm flow, not reading it. | Decide lint vs test, then implement. |
| **New lint modules have no tests** | `lintSpecQuality` and `lintSubject` ship untested; nothing stops an edit from silently disarming a rule. | Plant-the-defect / watch-it-fire test per rule. |
| **Non-vacuity proved on a STALE bundle** | The proving run used a pre-rename bundle (`theme.ts`); rules fire, but not proven on today's shape. | Re-run once a current bundle exists. |
| **`@looprun-ai/vercel`** | Factory throws; seam contract documented, nothing implements it — runtime is Mastra-only in practice. Decision 2026-07-30: the landing page names Vercel AI as a supported framework with no roadmap caveat — implementing this seam is now a **launch gate** for the LP. | Implement before the LP launches. |
| **LangChain adapter** | No seam exists. Decision 2026-07-30: the landing page names LangChain as a supported framework with no roadmap caveat — an adapter is now a **launch gate** for the LP. | Design + implement before the LP launches. |
| **Public skill-install path** | The LP's "How to Start" section promises `npx add skill looprun/looprun` (renamed from looprun/agentspec, 2026-07-30 — **PENDING**: name and mechanism undecided); no such command exists and the agentspec repo is private. **Launch gate** for the LP. | Decide the public skill name + ship an install path (command, marketplace, or docs) before the LP launches. |
| **`StateDirective.when` never evaluated** | The conditional hook on `controls.directives` has no caller — directives render as static prose. | Implement the evaluation or remove the field. |
| **Agent-as-tool bridge (MCP server)** | Runtime consumes MCP tools but never serves agents as tools; governance verdict as structured result data. Decision 2026-07-29: OpenAI endpoint is the works-today path; this is roadmap. | Roadmap — design when prioritized. |
| **Skill's own lint battery split** | Artifact laws lint here, authoring conventions in the skill's `lint-authoring.mjs`. | If a rule moves, update both sides. |
| **`noUngroundedRegulatedFigure` prose carries domain wording** | Guard is generic but its rendered prose speaks one domain's vocabulary — a business-string leak in the neutral runtime. | Re-word the prose domain-neutral (check untouched). |
| **`custom()` guards cannot read tool-result text** | Hook sees calls (name + args) but not what the tool returned; "reply must cite the returned price" is unwritable. | Expose the result payload to the hook. |
| **Release script silently skips an existing version** | Publishing an already-registered version is a silent no-op — a ghost release (it happened). | Abort loudly when the target version exists. |
| **Attestation service (design approved, nothing built)** | Design at `docs/superpowers/specs/2026-07-31-attestation-service-design.md`: ed25519 layer-2 attestation over the seal, free-for-telemetry service, hashed client identifiers, transparency log. Zero code exists — no `attest` command, no service, no keys. | When prioritized: implementation plan for (1) `looprun-eval attest` + telemetry builder, (2) the service repo, (3) `verify` layer-2 extension. |
| **Certification has no held-out split** | The T3 fix loop iterates against the same exam that S1 certifies — training-on-the-test-set (Goodhart) risk, flagged independently by two round-2 LP reviewers (2026-07-31). Mitigations exist (blind exam authorship, worst-run floor, discrimination gate) but no case is held out of the fix loop. The LP deliberately makes NO held-out claim until this exists. | Design a held-out split (or equivalent) in the skill's T/S phases; then the LP may say "the certified score comes from cases the fix loop never saw". |
| **Abstain tool-name leak** | `buildHonestAbstain` (turn.ts) interpolates raw tool names into the reply; produced labels, not internal names, are what a user should see. | Map names → produced labels before wiring it into any `exhaustionReply` [gate on wiring]. |
| **Uncheckable ruleId dropped at load** | `norms-config.ts` discards the `ruleId` on `uncheckable` rules at load; the judge-rubric layer needs it to attribute a verdict to a rule. | Restore id plumbing before the judge-rubric layer consumes uncheckable rules [gate on judge layer]. |
| **E1 re-baseline** | Forbidden invariants now score over executed ∪ guard-vetoed attempts (E1); every pre-E1 measured number (coworking, atlas) was computed on the old executed-only basis and carries a NEW invalidation reason. | Re-measure or withdraw before citing any pre-E1 number. |
| **`pendingConfirmMustAsk` regex branch removal (spec §4)** | The replyToUser-regex branch of `pendingConfirmMustAsk` is slated for removal, but doing it now would void coworking's measured numbers mid-increment. | Deferred to bundle migration — remove alongside the coworking/atlas port. |
| **`retireAsset` confirm-parity sequence missing in world-atlas-parity** | The parity test exercises the confirm/execute two-step for other destructive tools but never for `retireAsset` — its confirm→execute sequence is unproven against the world. | Add the `retireAsset` confirm-parity sequence to `world-atlas-parity`. |
| **Atlas parity S1 "across turns" label is same-array adjacent calls** | The S1 case comment says the two calls land "across turns", but the fixture issues them as adjacent calls in one array (same turn) — cosmetic mislabel, the assertion still holds. | Re-word the label to "adjacent calls" (or split into real turns if the distinction is ever load-bearing). |
| **`MONITOR.resolved` marker is presence-only, not incident-bound** | The monitor gate clears on the mere existence of a `MONITOR.resolved` file — a marker dropped before the incident (or left stale from a prior run) bypasses the gate; it is not bound to the specific incident it claims to resolve. | Bind the marker to the incident (id/hash) so a pre-creation or stale marker cannot clear a fresh incident. |
| **Preset distinguishability keyed off projection only** | `checkWorldModel` compares `projection()` (today/status/counters); a preset patching a non-projected field of a seeded record is falsely flagged INDISTINGUISHABLE despite a real world change. | Either document projection as the canonical distinguishability surface, or widen the check to a full-state digest. |

Retired: *Fold verdict-sync is a hand step* — 2026-08-02, `looprun-eval fold --sync <dirA> <dirB> …`
now forces one verdict per byte-identical (trace+replies) transcript class across run dirs,
mechanically (majority; ties resolve to the strictest, so sync never inflates a pass-rate). Writes
`verdicts.synced.jsonl` per dir (drop-in for `cert`) + a `SYNC.md` provenance line per reconciled
class (spec §4).

Retired: *cert has no native multi-rep* — 2026-07-31, `looprun-eval cert <r0> <r1> …` now emits
`cert-band.json` + `CERT-BAND.md` (per-rep rates, band, per-case majority; certified only when
the FLOOR over reps clears the bar).

Retired: *margin probe is ported, not validated* — 2026-07-29, validated in the field against a
served local model on a genuinely oscillating case (three probe rounds located a world reception
defect that the fix + re-certification confirmed).
