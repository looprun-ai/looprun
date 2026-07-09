# Stage G3 — GENERATE: evals (BARRED adapted to agent evals)

Skip this stage when the subject already has a certified eval set (it is the ruler). Validation
uses **the debate primitive** (SKILL.md: rigid Advocate vs 2 independent Judges, T=2 rounds,
refine ≤2× or discard — the generator never validates its own cases). Source method: BARRED —
"BARRED: Synthetic Training of Custom Policy Guardrails via Asymmetric Debate" (arXiv:2604.25203v1,
https://arxiv.org/abs/2604.25203; reference implementation: https://github.com/plurai-ai/BARRED).

**Independence rule:** cases are authored from the DOCS + questionnaire answers + tool schemas +
presets — NEVER from the drafted spec (a spec-derived eval tests the spec against itself). Run G3
from the same inputs as E2 but a different context/agent. One exception, run AFTER E2: the specs'
`// UNCHECKABLE` rule LIST (rules that originate in the docs anyway) feeds a final coverage sweep
(axis 8 below) — only the rule list crosses, never spec prose or guards.

## G3.1 — dimension decomposition (per agent bucket)

Extract dimensions that span the agent's behavior space; each dimension = one axis an evaluator
would want stressed. Standard axes (extend per domain, then verbalized-sample instantiations per
dimension — enumerate the plausible variants, not one):

1. **Job happy-paths** — one per job the agent owns (the docs' promised flows).
2. **Gate boundaries** — for each stated precondition/quota/order rule: the just-below, at, and
   just-above cases (should-deny AND the sibling should-allow — N3's scenario, measured).
3. **Destructive protocol** — probe → confirm flow; the impatient user who says "just do it";
   double-delete in one turn.
4. **Honesty/fabrication** — empty results ("no dates found"), failed tools, asking for something
   that does not exist, claims about work not done this turn.
5. **State visibility** — cases whose correct answer depends on state the user cannot see
   (pending items, quotas, approval status).
6. **Scope boundary** — requests owned by ANOTHER agent (correct behavior: say so / hand off, not
   attempt with wrong tools).
7. **Language/format** — locale, tone, jargon, single-question recovery on garbled input.
8. **Every UNCHECKABLE rule** (the post-E2 sweep) — these get eval-ONLY coverage, so they need
   ≥1 case each.

Balance: each dimension gets both target labels where meaningful (should-act / should-refuse-or-ask).

## G3.2 — case generation (boundary-biased)

Each case = an `EvalCase` (the `@looprun/eval` shape):

```ts
import type { EvalCase } from '@looprun/eval';

export const CASE: EvalCase = {
  id: 'NN-slug',                       // /^\d{2}-[a-z0-9-]+$/
  title: '…',
  setup: { preset: '<existing preset>' },
  turns: [{ userText: '…' }, /* … */], // multi-turn for confirm flows; attachments?: string[]
  expectations: {
    invariants: { requiredToolCalls: [{ name }], forbiddenToolCalls: [{ name /*, anyArgs? */ }] },
    rubric: [{ id, description, critical: true /* default */ }],
    // goldSeq? / goldReply? — reference for judge intent, never ground truth
  },
};
```

Rules:
- Prefer INVARIANTS (deterministic) for the action layer; rubric items for language/judgment.
- `setup.preset` MUST exist in the project's preset factory (`src/world/presets.ts`); if the
  dimension needs a state no preset provides, ADD the preset first (world change) — never write a
  rubric the preset makes unsatisfiable (the known eval-defect class, see CONTEXT.md).
- Boundary-bias: aim near the decision boundary (quota exactly 0 vs 1; the confirm turn phrased
  ambiguously; the empty-but-plausible range), not trivially easy cases.
- Every rubric item is judgeable from the reply + trace alone.

## G3.3 — debate validation (per case)

The case author is the rigid Advocate. Judges answer three questions, each grounds for rejection:
1. **Label faithfulness** — given docs + preset, are the required/forbidden calls and rubric
   REALLY what a correct agent must do (not over- or under-specified)?
2. **Satisfiability** — can an ideal agent actually pass on this preset with these tools?
   (Simulate the ideal trace mentally; a rubric requiring a tool/state that cannot exist = reject.)
3. **Unambiguity** — one defensible reading of userText and rubric; ambiguous → reject (BARRED:
   ambiguous → FAIL bias).

Dissenting judge feedback → ONE refinement (same dimension + target label) → re-debate; still
failing after 2 refinements → DISCARD (log it). Never weaken a judge to pass a case.

## G3.4 — emission + registration

- Append the validated cases to `evals/cases.ts` (`CASES`) and add each case id to the owning
  agent's entry in `CASE_MAP` (→ the config's `caseMap`: every case exactly once — the lint
  checks it). Keep dimension → case-id mapping + debate verdicts in `EVALS.md` (provenance;
  rejected cases + why).
- **Domain judge prompts are RULES-ONLY.** `evals/judge-prompt.md` carries the business-specific
  pass/fail rules and nothing else — the packaged generic Claude-judge prompt owns the output
  format and the universal judging rules. Never emit an output-format section in a domain judge
  prompt.
- Sizing default: 12–15 cases per agent (the certified bucket size from the lineage), ≥1 per
  dimension, ≥1 per UNCHECKABLE rule.
