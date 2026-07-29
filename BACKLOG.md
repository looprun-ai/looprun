# Backlog

Open items, with the reason each one is still open. An entry stays here until it is done or
explicitly retired with a reason — a pending item that quietly disappears is the failure this file
exists to prevent.

Not a roadmap. Everything here is something a reader could otherwise mistake for finished.

---

## Measurement

| item | state |
|---|---|
| **Every published figure is void** | The engine, the guards and the process were audited and repaired after the last measurement campaign. The provenance rule already says it: no number measured before the state-block fix is comparable. `docs/benchmarks.md` still carries the old table. Either re-measure or withdraw the numbers — leaving them is a claim the tree cannot back. |
| **No current bundle to measure or lint against** | The examples became seeds, so the tree holds no full generated bundle. The only complete subject is `packages/eval/test/fixtures/toy-subject`, which is minimal by design. Anything that needs a realistic bundle — a lint's non-vacuity proof, a discrimination run — has nothing to run on inside this repo. |

## The lint battery

Shipped in `looprun-eval lint --spec-laws`. What is NOT in it, and why:

| rule | why not |
|---|---|
| **tools.json drift vs the served surface** | Needs a live server to compare the served snapshot against the artifact. Not decidable offline; belongs to a runtime check, not a lint. |
| **projection key never exercised** · **preset never constructed in the world test** | Both inspect the world's TEST file, which has no fixed shape. A gate over an unconstrained file is a guess. Needs the convention first. |
| **probe parity for the two-step flow** | Requires executing the confirm flow, not reading it. Sits on the boundary between lint and test — decide which, then implement. |

| item | state |
|---|---|
| **The new lint modules have no tests** | `lintSpecQuality` and `lintSubject` ship untested. They were proved non-vacuous by hand against a bundle, which is evidence, not a regression net: nothing stops the next edit from silently disarming a rule. Each rule wants a plant-the-defect / watch-it-fire test. |
| **Non-vacuity was proved on a STALE bundle** | The run that produced findings used a pre-rename bundle (`theme.ts`, before `spec.theme -> spec.contract`). It shows the rules fire; it does not show they fire on a bundle shaped the way this engine ships today. Re-run once a current bundle exists. |

## Reserved / inert surface

| item | state |
|---|---|
| **`@looprun-ai/vercel`** | The factory throws. The seam contract is documented in its source; nothing implements it. Until it does, the runtime is Mastra-only in practice, whatever the package list suggests. |
| **`StateDirective.when` never evaluated** | The conditional hook on `controls.directives` (`when?: (world) => boolean`) has no caller anywhere in core/mastra/eval — directives render as static prose and even their conditional gate is inert. Implement the evaluation or remove the field from the type. Found 2026-07-29 during the agent-vs-workflow verification. |
| **Agent-as-tool bridge (MCP server)** | Does not exist — the runtime consumes MCP tools but never serves agents as tools. It is the natural bridge for free-agent orchestrators: specialists exposed as MCP tools, the governance verdict (`violations`/`corrections`/`exhausted`) as structured result data instead of the OpenAI extension field standard SDKs drop, and the free agent's own tool selection acting as the router. Decision 2026-07-29: the OpenAI endpoint is documented as the works-today composition path; this bridge is roadmap. |

## Cross-repo

Tracked here because the engine is the half that has to move first.

| item | state |
|---|---|
| **The margin probe is ported, not validated** | RETIRED 2026-07-29: validated in the field — run against a served local model on a genuinely oscillating case across three probe rounds (continuation forks + anchor), where it located the root cause (a world reception defect) that the subsequent fix and re-certification confirmed. |
| **The skill's own lint battery** | `lint-authoring.mjs` covers the skill's authoring conventions. The split is recorded in the skill's T-phase recipe: artifact laws here, authoring conventions there. If a rule moves, both sides need updating. |

## Validation-campaign findings (engine/tooling)

Defects found while validating generated bundles against served models; each is an engine or
tooling fix, recorded here because the fix lands in this repo.

| item | state |
|---|---|
| **`noUngroundedRegulatedFigure` prose carries domain wording** | The guard is generic (blocks unsourced regulated figures) but its rendered prose speaks the vocabulary of one domain — a business-string leak in the neutral runtime. Re-word the prose domain-neutral (the check is untouched). |
| **`custom()` guards cannot read tool-result text** | The custom-guard hook sees the calls made (name + args) but not what the tool RETURNED, so a check like "the reply must cite the price the tool returned" is unwritable. Expose the result payload to the hook. |
| **Release script silently skips an existing version** | Publishing a version that already exists on the registry is a silent no-op: the tag lands, npm does not change — a ghost release (it happened). The script must abort loudly when the target version already exists. |
| **Fold verdict-sync is a hand step** | Byte-identical transcripts must receive the same verdict; today that sync is a recipe step done by hand after judging. Belongs inside `looprun-eval fold` (mechanical, no judge). |
| **Cert has no native multi-rep** | `cert.json` honestly states `reps: 1`; the K-rep band and its FLOOR are a hand-written table beside it. `looprun-eval cert` should fold multiple rep certs into the band/floor/majority verdict natively. |
