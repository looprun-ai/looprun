# looprun — overview

looprun is a **governance layer** that composes with an agent framework (Mastra today; the Vercel AI
SDK seam is reserved). The framework runs the loop; looprun decides **what the loop is allowed to do**
and **proves it with a measured eval**.

## The four components

| component | metaphor | what it is |
|---|---|---|
| `AgentSpec` | the map | one agent's contract: tools (≤15), flow edges, guards per hook, controls, persona, behavior |
| Guards | the safety kit | typed deterministic rules — `check()` (machine gate) + `prose()` (the same rule, rendered into the prompt) |
| Redrive + honest-abstain | the GPS | reply violations trigger a bounded no-tools re-generation; if still violating, a deterministic closure built ONLY from verified observations goes out |
| The `agentspec` skill | the map generator | generates specs + theme + tool world + eval set from one purpose sentence, debate-validated (BARRED) |

## How governance maps onto the framework

| AgentSpec hook | Mastra primitive |
|---|---|
| `onInput` guards | an input processor — abort ⇒ the turn is refused with no LLM call |
| `preTool` guards | `beforeToolCall` hook — `{ proceed:false, output }` veto; the model sees the correction and retries in the SAME generation |
| `postTool` | `afterToolCall` — feeds the observed ledger |
| `onReply` guards | runtime finalization — mutators → checks → bounded no-tools redrive → honest-abstain |
| `controls` | `maxSteps` (stop condition) · terminal policy (reply-only) · directives · exhaustion reply |

Two properties fall out of this wiring:

- **The veto costs no extra round-trip.** A denied tool call returns the correction as the tool
  result — the model recovers inside the same generation loop.
- **The redrive never re-runs tools.** Reply correction is a pure text re-generation
  (`toolChoice:'none'`). A framework-level retry would re-execute side-effecting tools (measured:
  ~100× slower) — looprun never does that.

## The design laws (each one is measured, and most are CI-enforced)

1. **The magnet law** — never scope tools by user intent. Routing-by-intent silently drags the agent
   toward the router's guess. Scope by TOOL-NEED; the user picks the agent.
2. **The S-1 firewall** — no guard reads user text. `GuardCtx` structurally exposes only tool args,
   world state and the observed ledger. Prompt injection cannot flip a guard. (CI: firewall lint.)
3. **Prose+check pairing** — every rule exists twice: the prose teaches the model, the check enforces.
   The checker never reads the prose.
4. **Guard purity** — no clock, no entropy, no network, no LLM call inside a `check()`. Deterministic
   by construction. (CI: purity lint + a self-test that proves the lint fires.)
5. **Trunk-static law** — one domain theme opens every agent's prompt byte-identically; per-agent
   divergence renders as late as possible → maximal shared, cacheable prefix. (CI: byte-stability test.)
6. **State-in-tail** — volatile account state rides the user-message tail, never the system prompt.
7. **Persona-on-spec** — the per-agent role line lives on the spec; the theme carries none. (CI: lint.)
8. **Zero business strings in the library** — every domain string lives in a generated artifact owned
   by the user project. (CI: scan.)
9. **The eval is the arbiter** — a change ships when the measured pass-rate says so, at the ≥90%
   LLM-judged bar, N=3 to certify. Once at the bar, STOP (prose edits are non-local; chasing single
   cases regresses siblings).

## What `.looprun` tells you per turn

`LoopRunAgent.generate()` returns the framework result with `.text` replaced by the governed reply and
`.looprun` attached: `corrections` (guard vetoes as `dim:kind:tool`, `forced-terminal`, `redrive:*`,
`exhaustion-terminal`), `violations`, `exhausted`, and this turn's `observed` calls — your audit trail.
