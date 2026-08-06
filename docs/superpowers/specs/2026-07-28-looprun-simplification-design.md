# Looprun Simplification & Tutorial — Design

**Date:** 2026-07-28
**Status:** Approved (design); implementation plan to follow
**Breaking:** Yes — no backward compatibility. Known consumers (agentspec skill, looprun-bench, yntelli webapps) migrate together.

## Goal

Make looprun understandable to an external developer who installs it from npm:

- a) fewer concepts, smaller files, a drastically smaller public API;
- b) a single numbered tutorial that replaces the current 11 scattered docs — concepts, Hello World, class relationships (LoopRunAgent, AgentSpec, guards), a full guard catalog with "when to use" examples.

**Contract principle: a concept that does not appear in the tutorial either becomes internal (not exported) or is deleted.**

## Decisions already made

| Question | Decision |
|---|---|
| Audience | External devs installing via npm |
| Package scope | All 7 packages stay (core, mastra, vercel, server, models, eval, looprun) + governance skill |
| Pain points | Large files, heavy ontology, misaligned docs (public API size was *not* flagged, but shrinks as a consequence of the contract principle) |
| Cut appetite | Aggressive, evidence-based (usage inventory decides) |
| Tutorial format | Numbered markdown series under `docs/tutorial/` (no site build) |
| Sequencing | Hybrid per-concept approach: inventory → tutorial outline as API contract → refactor concept-by-concept, each step shipping code + its tutorial chapter → final docs sweep |

## Phases

```
Phase 0  INVENTORY       Usage scan of every exported symbol of core/mastra/models/eval/server
                         across real consumers: examples/, skills/, looprun-bench, yntelli
                         webapps, tests. Output: table symbol → used by → verdict
                         (keep public / make internal / delete).

Phase 1  OUTLINE         One-page tutorial outline defines the target API:
                         01-concepts / 02-hello-world / 03-agent-anatomy /
                         04-guards / 05-running-and-eval / 06-advanced

Phase 2  REFACTOR        Per concept, one step at a time, tests green at every step:
  2a  core/spec          Merge/simplify AgentSpec surface; fewer exported types
  2b  core/guards        Split guards.ts (~1.4k lines) into per-category files; the guard
                         catalog becomes data that generates tutorial chapter 04
  2c  core/assembled prompt +       Cut coherence queries without proven usage (candidates:
      coherence          findContradictions, polarity lexicon, foldRow/foldPrompt as public
                         API); survivors become internal
  2d  core/runtime       ActionHistory / terminal protocol become internal; public API = what
                         LoopRunAgent needs
  2e  mastra + backends  LoopRunAgent as the single teachable facade; server/vercel/
                         models/eval get follow-up adjustments only
  Each 2x step closes by writing the matching tutorial chapter.

Phase 3  SWEEP           Delete superseded docs, rewrite README to point at the tutorial,
                         update agentspec + governance skills to the new API, major release.
```

## Target docs structure

```
docs/
├── tutorial/
│   ├── 01-concepts.md         The problem, the mental model (spec = map, guards = safety
│   │                          kit, agent = GPS)
│   ├── 02-hello-world.md      npm i → first LoopRunAgent running in ~20 lines
│   ├── 03-agent-anatomy.md    AgentSpec, scope, tools, terminal — how the classes relate
│   ├── 04-guards.md           Full catalog: every guard, when to use it, minimal example
│   ├── 05-running-and-eval.md runSpecConversation, looprun-eval, the measured loop
│   └── 06-advanced.md         OpenAI-compatible server, Vercel adapter, local models
├── benchmarks.md              Kept as-is (already reviewed; official numbers only)
└── superpowers/               Specs + plans for this effort
```

Absorbed or deleted (nothing duplicated survives): `overview.md`, `getting-started.md`,
`illustrated-guide.md`, `examples.md`, `references.md`, `guides/local-models.md`,
`guides/eval-config.md`, `guides/measured-loop.md`, `guides/mcp-tools.md`.
Content worth keeping is folded into the matching tutorial chapter
(local-models → 06, eval-config + measured-loop → 05, mcp-tools → 03 or 06).

## Execution & verification rules

1. **Repo never broken mid-flight.** Every Phase 2 step is an independent commit with
   `npm test` green and all `examples/` compiling.
2. **Evidence before deletion.** A symbol is only deleted with Phase 0 evidence of zero
   usage. When in doubt, it becomes internal instead, and the decision is recorded in the
   inventory table.
3. **Executable tutorial snippets.** Tutorial code samples must compile against the
   monorepo packages; the exact validation mechanism (extracted snippet tests or a
   `docs/tutorial/snippets/` package) is chosen in the implementation plan.
4. **Size targets.** No src file above ~500 lines; `packages/core/src/index.ts` exports a
   fraction of today's ~60 symbols.
5. **Everything in English** — code, docs, commits.

## Known consumers to migrate in Phase 3

- `skills/looprun-governance` (this repo) and the agentspec skill (sibling repo)
- `looprun-bench`
- yntelli webapps (Criaty, Beauty, Agent87) — mid-migration from neurono; they adopt the
  new API directly
- `examples/*` in this repo (updated during Phase 2 as their concepts land)

## Out of scope

- VitePress or any docs site build
- New features or new guards
- Renaming packages or changing the npm package layout
- `docs/benchmarks.md` content changes
