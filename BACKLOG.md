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
| **`controls.escalate`** | Typed on `AgentControls`, read by no backend. Setting it changes nothing. Either wire it or drop the field — a typed option that does nothing reads as a feature. |

## Cross-repo

Tracked here because the engine is the half that has to move first.

| item | state |
|---|---|
| **The margin probe is ported, not validated** | Lives in the skill repo (`skill/scripts/margin-probe.mjs`) and renders through this engine's `renderTurnPrompt`. It has never been run against a served model on a case known to oscillate. Until that round happens it is code nobody has confronted with reality — and the skill's STOP rule cites it as one of three conditions for leaving the improve loop. |
| **The skill's own lint battery** | `lint-authoring.mjs` covers the skill's authoring conventions. The split is recorded in the skill's T-phase recipe: artifact laws here, authoring conventions there. If a rule moves, both sides need updating. |
