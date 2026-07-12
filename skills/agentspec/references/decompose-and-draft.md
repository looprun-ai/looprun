# Stages E1 + E2 — ENGINEER: decompose the surface, draft the specs

## E1 — DECOMPOSE (one agent)

Input: tool surface + docs. Output: the agent map — `agent → {tools, jobs, destructive⊆tools,
case-bucket (if evals exist)}`.

Rules (all measured):
- Cluster by **TOOL-NEED** (which tools does completing this job require), never by user intent or
  conversation topic. The triage lesson from the lineage (see CONTEXT.md): 11 of a triage agent's
  13 fails were tools outside its scope — the mode label lies, the tool-need does not.
- **≤15 tools per agent** (weak-model action wall; `looprun-eval lint --spec-laws` enforces it);
  shared read-only tools (`getActiveAccount`-like) may repeat across agents; drop monolith
  always-on bundles.
- Terminal tools (`replyToUser`/`askUser`-like) are NEVER in `tools` (constructor throws).
- Destructive tools stay WITH the job that owns them (deletion lives with the lifecycle owner).
- Name agents by job (`scheduling`, `billing`), not by audience or mood.
- If evals exist, also emit the case→agent map — the config's `caseMap` entries (tool-need
  decides; document reassignments — the remap precedent from the lineage, see CONTEXT.md).

Present as a table for human gate #1 (see `questionnaire.md`).

## E2 — DRAFT (one drafter per agent, parallel)

Each drafter emits `src/agents/<domain>/<agent>-spec.ts` in the format of
`references/spec-template.ts` (a FICTIONAL domain on purpose). **Drafters never read real/gold
specs** — gold specs contaminate recall benchmarks and tempt content-copying; every rule must be
DERIVED from this business's docs, schemas, and questionnaire answers. The template + the bundled
guard catalog (`references/guard-catalog.md`) are the only style inputs.

### Layer choice
- Extend the ONE `AgentSpecBase` class (the former Minimal/Base/Full ladder is collapsed — a spec is a
  spec). List the agent's confirmed-flag destructive tools in `destructiveTools` (the
  gate-#1-approved subset): the constructor installs the confirm-first + throttle protocol on exactly
  those; an empty/omitted list is a no-op (a clean non-destructive agent).
- Never hand-add what the constructor installs — always `noDuplicateCall` + `emptyReply`, and iff
  `destructiveTools` is non-empty `confirmFirst` + `destructiveThrottle`. There is NO auto-schema
  layer: author `argRequired` / `argFormat` explicitly per tool.

### Guard selection recipe (per rule found in docs/answers)
1. State the rule as: WHEN <observable condition> THE AGENT MUST/MUST-NOT <action/claim>.
2. Pick the observable surface: call order/history → spatial · args → input · world state → run ·
   tool result → output · reply text → behavior. (User text is NOT a surface — firewalled.)
3. Pick the catalog kind (`references/guard-catalog.md` — the reference-of-record, with signatures,
   hooks, auto-layers, and the when/how-much-to-guard math): requiresBefore, forbidThisTurn,
   argRequired, argAbsent, argFormat, labelExists, labelProvenance, precondition, maxCallsPerTurn,
   maxCallsPerConversation, noActAfterAskSameTurn, noFabricatedSuccess, replyMustMention,
   replyMaxOccurrences, replySingleQuestion, replyNoProductionClaim, replyConfirmsLabels,
   pendingConfirmMustAsk, destructiveClaimRequiresSuccess, noFalseFailureClaim, resultInvariant,
   jargonScrub (mutator).
   There is deliberately NO LLM reply-check kind in @looprun-ai/core (it would forfeit the
   determinism certificate) — a rule no deterministic check can express is language-layer:
   conditioned prose + an eval dimension. `custom()` ONLY when no kind fits; reviewers read the
   code.
   For an ordered flow (call order → spatial), one `requiresBefore` gate per downstream tool names
   its predecessors — e.g. `createPost → saveContent → generateImage`:
   `addGuard('preTool',['saveContent'],requiresBefore(['createPost']))` +
   `addGuard('preTool',['generateImage'],requiresBefore(['createPost','saveContent']))`.
4. Write BOTH halves: the check AND its prose. For `precondition`, split REASON (fires on deny)
   from PROSE (always rendered — must state the CONDITION, not assert current state: "generation
   needs a visual style — when none exists, ask first", never "there is no style").
5. A rule with NO observable key becomes: a conditioned behavior line + a note in the spec header
   (`// UNCHECKABLE: <rule> — eval dimension only`) so N4 and G3 can see it.

### Persona (the REQUIRED `persona` config field — the persona-on-spec law)
- Every spec carries its OWN role line in `persona:` — ONE line: what THIS agent is/owns. The
  runtime renders it as the FIRST `## Behavior` bullet (trunk-static law, SKILL.md hard rules:
  per-agent divergence as late as possible; moving it to the head cost ~4pt). Do NOT also put it
  in `behavior[]` (the runtime prepends it).
- The shared business VOICE is NOT here — it is the theme's `voice` (`theme-generation.md`).
- Case-invariant (no volatile world state — the state-in-tail law).

### Prose rules (behavior[])
- Every line CONDITIONED (Bucket-A): "when X, do Y" — never a bare imperative that is wrong in
  some state.
- Encode the docs' protocols (confirmation flows, honesty on empty results, error reporting,
  recovery with ONE concrete question, reply language, brevity).
- NO persona line here — persona lives in the `persona` field (above).

### Controls
- `terminal`: reply()-only when the state says the turn is an action turn (example shape:
  `(w) => w.hasVisualStyle()`); leave unset when askUser must stay legal.
- `directives`: state-keyed "IF cond → directive" for positive forcing.
- `chains`: declarative flowChain completion — force a missing follow-up `call` after `after` ran OK
  this turn (`mode:'direct'` = world.exec, no LLM; `'llm'` = one forced micro-generate), on the same
  guard-checked path. Use when a required follow-up must EXIST, not merely be blocked-when-wrong.
- `sampling`: per-agent `{ temperature?, topP?, maxOutputTokens?, seed? }`, merged OVER the
  conversation modelParams (agent wins) — e.g. a creative agent at temperature 0.7 beside a temp-0
  admin agent in the same domain.
- `maxSteps`/`redrives`: keep defaults unless a measured fail says otherwise.

### Anticipate the recurring measured fails (draft them out up front)
See `references/measured-loop.md` "Cross-domain measured lessons". At draft time: (a) use the shared
`destructiveClaimRequiresSuccess` + `pendingConfirmMustAsk` (confirm-probe/failure aware) rather than
ad-hoc `custom` claim-regex reply guards; (b) write "act directly, don't ask permission for the
primary non-destructive action" into behavior prose; (c) keep a full end-to-end flow's tools in ONE
agent (register-on-interest + book together).

### Wiring
- Imports come from `'looprun'` (the umbrella re-export of @looprun-ai/core); set `theme: THEME`
  (imported from `./theme.js`) in the `super()` config so a host can construct the agent from the
  spec alone — still ONE shared theme object per domain.
- `export default new AgentSpecX()`; register in the domain bundle —
  `src/agents/<domain>/index.ts` exporting the `SPECS` map (agent-id → spec) + `THEME`; the
  project's `looprun.eval.config.ts` imports `SPECS` into `specs` and lists each agent's case ids
  in `caseMap`.
- Do not set `systemPrompt` — the runtime renders the scoped trunk (`renderScopedSpecTrunk`) with
  the theme.
- Run `npx looprun-eval lint --spec-laws` — purity + firewall + theme-persona + the config-level
  spec laws (persona present, ≤15 tools, no own systemPrompt, caseMap sane) must pass before
  review.
