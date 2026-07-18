# The agentspec skill

The map generator: from **one purpose sentence** to governed agents with a certification.

```bash
npx skills add looprun-ai/looprun --skill agentspec
```

(Installs into `.claude/skills/agentspec/` for any agentskills-compatible coding agent. The
skill source lives in this repo at [`skills/agentspec/`](../../skills/agentspec/SKILL.md).)

## What it generates, in your project

```
src/agents/<domain>/         # one <agent>-spec.ts per agent (≤15 tools each) + theme.ts + index.ts
src/world/                   # world.ts (deterministic tool world + factory), tools.ts, presets.ts
evals/                       # cases.ts (the generated eval set + caseMap) + judge-prompt.md (rules)
looprun.eval.config.ts       # the eval contract wiring it all together
```

## The pipeline (AGENTS)

- **A — Ask**: ONE mandatory question ("What is the agent's purpose? one sentence is enough") + at
  most two send-or-skip asks (a tools file; docs/persona material).
- **G — Generate** what's missing: G1 tool genesis (no tools file? invent the surface — debate-
  validated), G2 the world (deterministic, in-memory, preset-seeded), G3 the eval set (authored from
  docs/answers/schemas — NEVER from the drafted specs; independence is the point).
- **E — Engineer**: E1 decompose the surface into ≤15-tool agents by TOOL-NEED (never by intent — the
  magnet law), human approval gate; E2 draft each AgentSpec; E3 generate the domain theme.
- **N — Nitpick**: five adversarial reviewers (magnet red-team, prose auditor, composition adversary,
  coverage critic, purity lint) + a verifier.
- **T — Test**: the [measured loop](measured-loop.md) — run, LLM-judge, classify fails, fix,
  ≤3 iterations.
- **S — Ship**: certify N=3 at the ≥90% bar → `CERT.md` + provenance (`REVIEW.md`, `EVALS.md`).

Every generative step is gated by the **debate primitive** (one rigid Advocate vs two independent
Judges, per [BARRED](https://arxiv.org/abs/2604.25203)) — never self-review.

## Requirements

- A project with `looprun` (dependency) and `@looprun-ai/eval` (devDependency) — the skill scaffolds both
  when missing (`npx looprun-eval init`).
- `GOOGLE_GENERATIVE_AI_API_KEY` for the validation subject model.
- The judge is the coding agent running the skill — no extra key.
