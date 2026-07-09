# References & lineage

## The conceptual basis

**BARRED: Synthetic Training of Custom Policy Guardrails via Asymmetric Debate** —
arXiv:2604.25203v1 (https://arxiv.org/abs/2604.25203); reference implementation:
https://github.com/plurai-ai/BARRED.

The agentspec skill's generation pipeline applies BARRED's core findings to agent governance: raw
generations lose ~27% quality without verification, and self-refinement is WORSE than no verification
(a generator never validates its own output). Hence the skill's debate primitive — one rigid Advocate
vs two independent Judges, two rounds — gating tool genesis, eval generation and the adversarial
review of drafted specs.

## Lineage

looprun distills a research benchmark that measured ~28 agent-loop architectures against a 117-case
production eval, asking: can a free-form loop + declarative governance match a hand-built classifier
loop? The winning architecture (free-form loop + typed deterministic guards + scoped per-agent
prompts, certified at 92–94% on the reference subject and ≥90% across five generated domains) is what
`@looprun/core` + `@looprun/mastra` package. The design laws in [overview.md](overview.md) are that
benchmark's measured conclusions, and the skill's `CONTEXT.md` carries the full honesty record.
