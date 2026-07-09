# Stage G1 — GENERATE: tools (tool genesis, when no tools.json exists)

Run this stage ONLY when ask A1 came back "no tools yet" (a business with no API/tool surface).
Output: a `tools.json` the rest of the pipeline consumes exactly as if the business had shipped it,
plus the world-state model brief that G2 needs. Validation uses **the debate primitive** (SKILL.md:
rigid Advocate vs 2 independent Judges, T=2 rounds, refine ≤2× or drop — the Toolsmith NEVER
validates its own tools). Source method: BARRED — "BARRED: Synthetic Training of Custom Policy
Guardrails via Asymmetric Debate" (arXiv:2604.25203v1, https://arxiv.org/abs/2604.25203; reference
implementation: https://github.com/plurai-ai/BARRED).

**Isolation.** G1 runs in an ISOLATED context (subagent/worktree) and hands back ONLY
`tools.json` + `WORLD-MODEL.md` — the genesis debate dies with the context. Both artifacts then
flow to the engineers (single-pass, the measured default — see SKILL.md: withholding
WORLD-MODEL.md was measured WORSE across 5 paired domains).

## G1.1 — dimension decomposition (from the ONE purpose sentence + any docs)

Decompose the domain along these axes; for each, verbalized-sample the plausible instantiations
(enumerate variants, never one):

1. **Entities & lifecycles** — the domain's nouns and their states (lead → client; draft →
   scheduled → published; booked → completed → rated). Every lifecycle edge is a tool candidate.
2. **Jobs-to-be-done** — the concrete user jobs the purpose implies (book X, quote Y, pay Z).
3. **Honesty reads** — state the assistant must be able to READ to avoid fabricating (lists,
   details, availability, balances, quotas, statuses). The state-visibility dimension: if a rule
   will say "never claim X without reading it", a read tool for X must exist.
4. **Writes & destructive candidates** — cancel/pay/delete/submit/void verbs; each gets the
   two-step `confirmed` flag in its schema.
5. **Money / quotas / limits** — anything counted, billed, or capped (reads AND the spend ops).

Terminal tools (`replyToUser`/`askUser`-like) are RUNTIME-owned — never generate them.

## G1.2 — the Toolsmith draft (the Advocate)

One agent drafts, per job, the minimal tool set:

- `{ name, description, inputSchema }` — camelCase verb names; ONE capability per tool; the
  description is behavior-bearing (states protocol: "two-step: call with confirmed=false first…");
  `inputSchema.required[]` correct; regexable formats (`pattern`) where ids/codes have shape;
  destructive tools carry the `confirmed` boolean.
- produces/consumes pairs (the future flow edges).
- The implied **world-state model**: entities, the `projection()` keys a deterministic check may
  read, the presets the evals will need (onboarded/not, quota-exhausted, pending-confirmation, …),
  and `advanceTurn()` semantics (what flips between turns; a probe must stay side-effect-free).
- IDs are human-echoable labels (`pro_ana`, `inv_1002`) — the model must be able to repeat them.

## G1.3 — debate validation (per tool AND for the surface as a whole)

The Toolsmith is the rigid Advocate. Each judge answers ALL of:

1. **Implementability / determinism** — can a pure in-memory world execute it deterministically
   (no I/O, no clock, no randomness — the purity lints apply to worlds)? Reject fantasy tools.
2. **Completeness (RECALL — the bias)** — missing CRUD pair, lifecycle hole, a job with no tool,
   or an honesty rule with no read tool (a measured lesson: a missing read tool makes the model
   fabricate). When unsure whether a gap is real, CONFIRM it.
3. **Redundancy / overlap** — two tools for one capability ⇒ merge or drop.
4. **Schema quality** — required[] complete, destructive `confirmed` present, patterns where a
   format exists, descriptions carry the protocol.
5. **Magnet risk (the magnet law)** — a tool whose only meaning is intent routing
   ("handleSupportRequest") must die; tools are capabilities, never intent buckets.
6. **Cluster viability** — dry-run E1: the surface must cluster into ≤15-tool agents by
   TOOL-NEED with every documented end-to-end flow inside ONE agent.

Dissenting-judge feedback is structured (which ground, which tool, what would fix it) → the
Toolsmith refines (same dimension, same job) → re-debate. Still failing after 2 refinements →
DROP the tool and log it. Never weaken a judge to pass a tool.

## G1.4 — emission

- `tools.json` — the validated surface (the pipeline's hard vocabulary from here on).
- `WORLD-MODEL.md` — entities, projection() keys, preset list, advanceTurn semantics, and the
  produces/consumes edges (feeds G2 step 1 and E1).
- Provenance: keep the debate verdicts (accepted / refined / dropped + why) in the run's
  `REVIEW.md`.

The generated tool table rides the human gate #1 approval table (see `questionnaire.md`) — the
user approves tools + decomposition + destructive list in ONE gate; total gates stay at 2.

## DX note

With tool genesis, the user's total day-0 input can be literally ONE sentence (the purpose). The
skill generates tools → world → evals → theme → specs, then measures. Everything else the user
does is approve (gate #1) and accept residuals (gate #2).
