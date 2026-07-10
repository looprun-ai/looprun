# Stage G2 — GENERATE: a NEW domain (world + presets + config wiring)

When the project has no world/eval wiring yet (a fresh `looprun-eval init` scaffold, or a business
that was never measured), the skill GENERATES the subject BEFORE the measured loop — the world, the
presets, the tools (via G1 when none exist), the theme, and the config wiring are all generated
artifacts; nothing in the looprun library/runtime is hand-edited with business content.

## The generated subject (default shape — everything in the user project, no docker)

1. **Tool surface** — `src/world/tools.ts` exporting `TOOL_DEFS` (JSON-schema
   `{name, description, inputSchema}[]`): from the business's `tools.json` — or, when none exists,
   from **G1 tool genesis** (`references/tool-genesis.md`), which also emits the world-model brief.
2. **World** — `src/world/world.ts`: a deterministic in-memory world class (constructor
   `(preset, seed)`, an `exec(name, args)` dispatch, a `projection()` of the state a check may
   read, `advanceTurn()` if state flips between turns) + the exported
   `worldFactory(preset, seed)`. No I/O, no clock, no randomness (the purity lints apply to worlds
   the same as guards). A probe call (`confirmed=false`) must be side-effect-free, and
   `advanceTurn()` must not auto-finish a user-gated two-turn action (measured world-bug class).
3. **Presets** — `src/world/presets.ts`: a preset factory covering every state the evals need
   (onboarded/not, quota-exhausted, pending-confirmation, …). G3 is BLOCKED on presets existing —
   a rubric that needs a state no preset provides is the known eval-defect class.
4. **Theme** — `src/agents/<domain>/theme.ts` per `references/theme-generation.md` (E3) — the
   business-common skin (invariants / language / stateBlock over projection() / exhaustion).
   NO persona in the theme (persona is per-agent, on each spec — the persona-on-spec law).
5. **Config wiring** — `looprun.eval.config.ts` (the `EvalConfig` contract from `@looprun-ai/eval`):
   `domain`, `specs` (the generated `SPECS` map from `src/agents/<domain>/index.ts`), optional
   top-level `theme` (each spec already carries `theme: THEME`), `worldFactory`, `toolDefs`,
   `cases` + `caseMap` (from `evals/cases.ts` once G3 runs), `judgePromptPath`, `bar`. The runner
   is looprun's ONE execution surface (`LoopRunAgent` on Mastra) — the CLI drives it; there is no
   adapter to write. Guards read the world through closures — keep the new world's accessor names
   domain-honest. Never edit the looprun trunk renderer with business content (the library's CI
   lint fails the build).
6. **Judge rules** — `evals/judge-prompt.md`: the domain's business-specific pass/fail RULES
   ONLY. The packaged generic Claude-judge prompt (`npx looprun-eval judge-prompt` prints its
   path) already owns the output format and the universal rules (meaning not language,
   ambiguous → FAIL, critical items gate) — never restate or override them here.

## Business with an existing eval set

If the domain already maintains its own cases, they are the ruler: convert them into `EvalCase`
records in `evals/cases.ts` (id `NN-slug`, `setup.preset`, `turns`, `expectations`) and skip G3.
Do not "improve" inherited cases outside the debate-validated eval-defect flow (class 7).

## Checklist before E1 starts

- [ ] `npx looprun-eval check` green — validates the config + the world seams the runtime reads
      every turn, with NO LLM call; a seam error here is a G2 bug, fix it before any run
- [ ] every tool in `TOOL_DEFS` has a deterministic executor in the world (`exec` dispatch)
- [ ] presets cover the dimension plan's states
- [ ] `cases.length` matches the generated set size, and `caseMap` covers every case exactly
      once (ruler integrity — `npx looprun-eval lint --spec-laws` checks it)
- [ ] the theme carries NO persona; every spec carries its OWN persona
