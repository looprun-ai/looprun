# skill-requirements — the phase-6b regeneration charter

The input of phase 6b: what the regenerated agentspec skill must teach, where its
material already exists, and how its quality is measured. Phase 5 produces this
file; phase 6b consumes it in the same working session that starts with the swap's
freeze stamp already in place.

## What the skill teaches (the authoring contract)

| surface | the whole of what an author writes |
|---|---|
| `AgentSpec` | name · persona · tools (the lane) · teammates · guards (sentences; a deny/judgeQuery only when hand-written) · llmParams · limits |
| `DomainContract` | name · voice · facts · guards (catalog declarations + prose) · disclosure (needs + three tenses, `{alias.path}` slots over engine reads) · rewrites (patterns as the factories' arguments) · secrets (omit/mask) · wording · limits |
| the world card | records · presets as `Patch[]` (make/set/remove) · reads/writes/destructive entries (label · does · schema · target · `when` for conditional consent · gates · simulation) · custom executors (`{result, patches} | {refuse}` over a frozen clone) |
| cases | `ExamCase`: id · split · agent · preset · covers · invariants (required/noEffect matchers) · turns (text · typed approve/decline — never a code in prose) · rubric |

## The material, already produced

| input | where it lives | becomes |
|---|---|---|
| the old→new mapping (21 rules) | `agentspec-bench/subjects/atlas-next/MAPPING.md` | the skeleton of `references/**` |
| the worked example | `subjects/atlas-next/` — certified in phase 5 | the skill's exemplar, real and measured |
| the engine's own gates | `@looprun-ai/next-eval` (Validator · purity · nameGate · census) | the skill's lints DELEGATE to them — a reimplemented lint is a second truth |
| the bin decisions of the measurement | the phase-5 plan's Results section + MAPPING rows added during triage | the "authoring mistakes the skill prevents" section |
| the case-writing methodology | the AS-IS skill's process pages | KEPT — only the artifact vocabulary changes |

## The strategy (ruled in the phases 3–6 design)

REWRITE `references/**` from scratch around the two-cards surface; REUSE the
certified atlas-next as the worked example; DELEGATE lints to the eval package;
KEEP the exam methodology.

## The measure (the 6b gate)

The skill AUTHORS the Atlas from scratch, following only what it teaches. Level 1
(free): validate + lints green and a structural diff against the frozen phase-5
reference showing only wording variation, never a governance fact. Level 2 (the
run): `gemini-3.1-flash-lite`, the same K protocol, score ≥ 85 within the noise
margin of the phase-5 result, case 72 intact. Divergence is a SKILL defect: fix
the skill, re-author, repeat — the reference never moves.

## Open rows (filled during the phase-5 fix loop)

_(every PORT/APPEAL bin decision lands here as a lesson the skill must teach)_

| # | lesson the skill must teach | born from |
|---|---|---|
| 1 | The ask names its concrete object: a consent `before` sentence carries the amount, target id, destination or scope the call moves — `{args.*}` slots exist for exactly this. An ask that says "the settlement" where the record says "200" fails the operator. | slice 2-3 fix loop |
| 2 | `{result.*}` slots in `after`: rendered at execution and on every restate of the executed act — the sentence states what the call RETURNED (new caps, new balance), never what the author hoped. | case 25 |
| 3 | `cap: { arg, at, refusal }` on a disclosure entry: when the call's named arg exceeds what an owed read answered, the engine refuses with the declared sentence and never asks — the desk never asks about an act the records rule out. | case 39 |
| 4 | The finish report's word vocabulary is taught by legend, including `no_tool_called` — the agent's own word for a decision to act in words only, legal only when NO act of that tool and target exists in the turn. | cases 34/37/38/40 |
| 5 | Desk personas carry the desk's conduct on illegal figures and lane naming: refuse an amount the records rule out in words, and name the owning desk (Billing, Field Operations) by its label. | slice 4 fix loop |
| 6 | A read from an earlier turn runs fresh — never author around a cached read; the record may have moved (a deposit charged between turns invalidates the balance read). | case 36 |
