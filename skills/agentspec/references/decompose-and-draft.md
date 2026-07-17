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
- **Name→id resolution per bucket (measured 2026-07-16, equipment-rental subject):** for EVERY
  entity id an agent's tools CONSUME (assetId, bookingId, memberId, …), the same surface must hold
  a READ that RESOLVES it from a user-facing name (listX / getX searchable by name) — or the
  decomposition table must justify why not. Absence makes the model flail through unrelated reads
  or fabricate a well-shaped id (a billing agent asked to quote "the CAT 320" with no asset lookup
  looped through unrelated list reads and never produced the quote).
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
   argRequired, argAbsent, argFormat, precondition, maxCalls (scope 'turn' default | 'conversation'),
   noActAfterAskSameTurn, noFabricatedSuccess, replyMustMention,
   replyMaxOccurrences, replySingleQuestion, replyConfirmsLabels,
   pendingConfirmMustAsk, destructiveClaimRequiresSuccess, noFalseFailureClaim, resultInvariant,
   jargonScrub (mutator).
   There is deliberately NO LLM reply-check kind in @looprun-ai/core (it would forfeit the
   determinism certificate) — a rule no deterministic check can express is language-layer:
   conditioned prose + an eval dimension. `custom()` ONLY when no kind fits (e.g. media/label input
   guards `labelExists`/`labelProvenance` — the runtime carries no media concept, so a domain authors
   them as `custom({ dim:'input' })` over its world); reviewers read the code.
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
- **Iron-rule STYLE for load-bearing lines (measured 2026-07-16, equipment-rental subject A/B:
  a blunt restyle of the same rules gained +13pt on a lite cloud model, closing exactly the
  garbled-value-guessing, double-destructive, scope-defer, and false-claim-sycophancy fail
  classes).** Within each conditioned line: (a) state the rule BLUNTLY, no hedging; (b) NAME the
  anti-pattern as a failure ("asking 'shall I proceed?' for a non-destructive action is a
  failure"); (c) inline the adversarial case ("pre-authorization in the same message does NOT
  count — the confirmation must answer YOUR stated preview"); (d) order the load-bearing protocol
  lines FIRST within `behavior[]` (after the runtime-prepended persona). This is a CONTENT style
  rule — it does not move layout (the trunk-static law, measured-loop lesson #7, still owns
  positions). **Blunt ≠ verbose** — the measured gain came from bluntness and placement, and the
  same experiment's next revision ADDED rules while SHRINKING the prompt; the prompt-budget rule
  below bounds the token cost.
- **PROMPT BUDGET & COMPRESSION (measured 2026-07-16 — equipment-rental subject, local regression:
  +25% prompt tokens held 100% on the cloud tier but cost −8pt on a 35B-class local model; verbose
  prose is a TIER RISK).** Draft every rule at MINIMUM token cost without touching semantics:
  (a) **Dedup against the theme** — a rule the theme's coreInvariants already state is NEVER
  re-declared in `behavior[]`; a spec line may only SPECIALIZE it (this agent's tools, ids,
  amounts). Re-stating a theme rule per agent is a defect, not emphasis.
  (b) **The adversarial example appears ONCE per bundle** (theme or a single spec line) — never
  repeated per line or per agent.
  (c) **Budget:** `behavior[]` ≤ the certified-baseline envelope (~600 tokens/agent for a
  15-tool agent); exceeding it requires a measured justification in the spec header. The budget is
  met by (a)+(b) — dedup and no repetition — NEVER by rewriting rule wording.
  Compression rewrites FORM only — the Bucket-A reviewer re-audits that no condition or rule was
  dropped.
  **Telegraphic restyle is NOT a drafting rule (user decision 2026-07-16 — nice-to-have, end of
  loop only):** rewriting rules into compact law form was measured NET-NEGATIVE as a default on the
  local tier (82.0 → 80.3; ladder churn within noise) — draft in the certified natural-prose form.
  It may be evaluated at the END of the measured loop as an OPT-IN per-target experiment, accepted
  only by the margin instrument (fork-pair worst-case) + the full-run bar for that target.
- **Per-model PROFILES (convention, measured 2026-07-16 — one spec, N renders).** The RULES and the
  GUARDS/CHECKS are a single source of truth and NEVER fork per model. What may vary per declared
  deployment target (questionnaire A3) is FORM only: prose render (the DEFAULT is the certified
  natural-prose form — telegraphic/compact is an opt-in END-OF-LOOP experiment per target, never
  the default: measured 2026-07-16, the non-telegraphic render held 90.2 on the local tier vs
  80–82 telegraphic), reply-guard lexicon phrasing, `sampling`, `redrives`. Until the runtime
  carries a native `profiles` field, emit one bundle per profile FROM THE SAME SPEC SOURCE and
  record which target each bundle serves. A model with no profile runs the DEFAULT — guards work
  day-0 on any model; quality seals exist only for measured targets.
- **Lifecycle-law block (measured 2026-07-16):** for every entity whose lifecycle the agent's
  tools mutate, emit ONE compact behavior line of state-machine law derived from the world model —
  terminal states and irreversible edges stated as absolutes ("a VOID invoice is terminal — never
  payable, never refundable, never un-voided"; "a booking that is OUT cannot cancel — check-in
  first"). Weak models honor a stated law; they re-derive it wrongly.
- **State-wins truthfulness line (measured 2026-07-16 — a false user assertion was confirmed 3/3
  by both a governed and an ungoverned arm until this was stated):** include a line of the form
  "when the user asserts a state change the tools contradict, CORRECT the user with the read
  state — never perform calls that make the false claim true, and never present a permission
  denial as a technical glitch or retry/work around it (role escalation to satisfy a blocked
  request is forbidden)."

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
