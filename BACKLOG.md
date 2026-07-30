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
| **Public skill-install path** | The LP's "How to Start" section promises `npx add skill looprun/agentspec`; no such command exists and the agentspec repo is private. **Launch gate** for the LP. | Ship a public install path (command, marketplace, or docs) before the LP launches. |
| **`StateDirective.when` never evaluated** | The conditional hook on `controls.directives` has no caller — directives render as static prose. | Implement the evaluation or remove the field. |
| **Agent-as-tool bridge (MCP server)** | Runtime consumes MCP tools but never serves agents as tools; governance verdict as structured result data. Decision 2026-07-29: OpenAI endpoint is the works-today path; this is roadmap. | Roadmap — design when prioritized. |
| **Skill's own lint battery split** | Artifact laws lint here, authoring conventions in the skill's `lint-authoring.mjs`. | If a rule moves, update both sides. |
| **`noUngroundedRegulatedFigure` prose carries domain wording** | Guard is generic but its rendered prose speaks one domain's vocabulary — a business-string leak in the neutral runtime. | Re-word the prose domain-neutral (check untouched). |
| **`custom()` guards cannot read tool-result text** | Hook sees calls (name + args) but not what the tool returned; "reply must cite the returned price" is unwritable. | Expose the result payload to the hook. |
| **Release script silently skips an existing version** | Publishing an already-registered version is a silent no-op — a ghost release (it happened). | Abort loudly when the target version exists. |
| **Fold verdict-sync is a hand step** | Byte-identical transcripts must get the same verdict; today synced by hand after judging. | Build into `looprun-eval fold` (mechanical, no judge). |
| **Cert has no native multi-rep** | `cert.json` states `reps: 1`; K-rep band/floor is a hand-written table beside it. | Fold multi-rep certs into band/floor/majority natively. |

Retired: *margin probe is ported, not validated* — 2026-07-29, validated in the field against a
served local model on a genuinely oscillating case (three probe rounds located a world reception
defect that the fix + re-certification confirmed).
