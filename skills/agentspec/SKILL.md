---
name: agentspec
description: 'Use when a business wants governed agents generated from its tool surface and docs (near-zero DX) — producing AgentSpec TypeScript files plus an auto-generated eval set, iterated against a measured bar. Triggers — "generate agents for my business", "day-0 AgentSpec", "auto-author guards/evals", a new tools.json/MCP surface with no hand-written agents.'
license: Apache-2.0
compatibility: 'Designed for Claude Code (or any agentskills.io-compatible agent). Authoring is portable; running the measured loop requires a looprun project (`looprun` dependency + `@looprun-ai/eval` devDependency) and a GOOGLE_GENERATIVE_AI_API_KEY for the gemini-flash-lite subject model. Set LOOPRUN_ROOT if the project root is not discoverable from cwd.'
metadata:
  author: looprun
  version: "1.0"
  homepage: "https://github.com/looprun-ai/looprun"
---

# AgentSpec — day-0 governed agents from tools + docs

## Install

One line (agentskills.io / `npx skills` — installs into `.claude/skills/`, scripts and references
included):

```bash
npx skills add looprun-ai/looprun --skill agentspec
# list what the repo offers first:  npx skills add looprun-ai/looprun --list
```

Already in the `looprun` repo? It's live at `skills/agentspec/` — nothing to install.
(Manual fallback: `cp -R <repo>/skills/agentspec ~/.claude/skills/`.)

## Project detection / scaffold (preflight — run before Stage A)

A project is **looprun-enabled** iff walking up from cwd finds `looprun.eval.config.{ts,js}` AND its
`package.json` carries `looprun` (dependency) + `@looprun-ai/eval` (devDependency). Env override:
`LOOPRUN_ROOT=/path/to/project`. If the sentinel is absent, scaffold first:

```bash
pnpm add looprun @mastra/core ai zod
pnpm add -D @looprun-ai/eval
npx looprun-eval init --domain <d>   # looprun.eval.config.ts + evals/judge-prompt.md + gitignore lines
```

Prereqs for the measured loop: `GOOGLE_GENERATIVE_AI_API_KEY` (cloud subject; no docker, no local
model required). **Full walkthrough:** `docs/guides/measured-loop.md` in the looprun repo.

## Overview

Turn a business's tool surface + product docs — **or just one purpose sentence** — into
**certified, governed agents**: each agent is an `AgentSpec` (TypeScript, prose+check paired
guards) with its own scoped prompt and its OWN persona, plus a generated domain **THEME** (the
business-common invariants / language / state-render mapping), plus (for a new domain) a generated
world + presets + tool surface, plus an auto-generated eval set validated by asymmetric debate,
plus a measured improvement loop that stops only at the certification bar (default: **≥90% pass,
Claude judge, N=3**).

**The skill is the single source of truth for business content**: every business string lives in a
GENERATED artifact — an AgentSpec (per-agent) or the domain theme (business-common); the looprun
trunk renderer is domain-neutral assembly machinery that holds ZERO business strings. **The skill
VERIFIES this itself**: `npx looprun-eval lint --spec-laws` (or the portable
`scripts/lint-guards.mjs`) runs over every emitted spec/theme at authoring time (Stage N5) and MUST
pass before anything is offered or measured. The `@looprun-ai/core` package you install is already
domain-neutral — you never edit it, so there is nothing to re-check there.

Core principle: **author both halves of every rule from the same source** — once as LLM-facing
conditioned prose, once as a deterministic check — then **measure, never trust**. Generated rulesets
historically fail on RECALL (missed rules), so every phase is biased toward finding what is missing,
not polishing what exists.

## The AGENTS pipeline

Six stages, run in order; the acronym is the order. Full recipes live in `references/`.

| stage | name | what it does | when | recipe |
|---|---|---|---|---|
| **A** | **ASK** | ONE mandatory question (the purpose) + send-or-skip asks for missing inputs, one batch | always | `questionnaire.md` |
| **G** | **GENERATE** | generate whatever input is MISSING: **G1** tools (tool genesis) → **G2** world/presets/config wiring → **G3** evals | only what's absent | `tool-genesis.md`, `new-subject.md`, `eval-generation.md` |
| **E** | **ENGINEER** | **E1** decompose tools into ≤15-tool agents (human gate #1: ONE approval table) → **E2** one drafter per spec ∥ **E3** the domain theme | always | `decompose-and-draft.md`, `theme-generation.md` |
| **N** | **NITPICK** | 5 independent adversarial reviewers (N1 magnet, N2 Bucket-A, N3 composition, N4 coverage, N5 purity lint) + verifier; ≤2 rounds | always | `adversarial-review.md` |
| **T** | **TEST** | the measured loop: run N=1 vs the subject model, Claude-judge, classify fails, fix in preference order, ≤3 iterations, STOP at the bar | always | `measured-loop.md` |
| **S** | **SHIP** | certify N=3 at the bar; human gate #2 (residual acceptance); emit provenance (`REVIEW.md`, `EVALS.md`, cert bundle pointer) | always | `measured-loop.md` |

Ordering notes:
- G runs strictly in G1→G2→G3 order (tools feed the world; presets feed the evals), skipping
  whatever the business already has. G3 MAY run in parallel with E, but its cases are authored
  ONLY from docs + answers + schemas + presets — never from drafted specs (independence rule);
  the one exception: after E2, the specs' `// UNCHECKABLE` rule LIST (rules that originate in the
  docs anyway) feeds a final G3 coverage sweep.
- New domain with no world/eval wiring? G2 generates the whole subject (world + presets + config
  wiring): `references/new-subject.md`.

**The debate primitive** (used by G1, G3, and N — defined once here): one **rigid Advocate**
defends the artifact as written and never changes position; **2 independent Judges** attack it,
T=2 rounds; the artifact is VALID only when both judges agree with the Advocate at some round.
Dissenting feedback → ≤2 refinements (same dimension, same target) → re-debate; still failing →
DROP and log. Never weaken a judge to pass an artifact. Why mandatory (measured, per BARRED —
"BARRED: Synthetic Training of Custom Policy Guardrails via Asymmetric Debate", arXiv:2604.25203v1,
https://arxiv.org/abs/2604.25203; reference implementation: https://github.com/plurai-ai/BARRED):
raw generations carry heavy noise (−27% without verification) and SELF-refine is WORSE than no
verification — a generator never validates its own output.

**Two-pass isolation (G1) — MEASURED, not promoted.** G1 always runs in an ISOLATED context and
hands back its artifacts (`tools.json` + `WORLD-MODEL.md`). *Single-pass* (THE DEFAULT): the same
run continues into E with both artifacts. *Two-pass* (restart fresh from tools.json only) was
measured across 5 paired domains (2026-07-09): split 3–2 for single-pass, means 95.3 vs 90.5 —
the one-domain +3.3 signal did not generalize. Mechanism: engineers without the world model (i) can
re-split a flow the eval needs whole (the flow-split lesson from the lineage reproduced — see
CONTEXT.md) and (ii) write reply-checks that misfire on world-grounded replies. Rule: the G1
artifacts ALWAYS flow to the engineers; never withhold WORLD-MODEL.md.

## Inputs (discover first; ask only via send-or-skip — `references/questionnaire.md`)

| input | where | role |
|---|---|---|
| The PURPOSE sentence | the user's opening message, or Q0 (the ONE mandatory question) | seeds tool genesis, decomposition, theme, evals |
| Tool surface (names + JSON schemas + descriptions) | `tools.json` / MCP listing / `src/world/tools.ts` — or ask A1 (send-or-skip); **absent ⇒ G1 generates it** (`references/tool-genesis.md`) | the hard vocabulary — specs may reference ONLY these |
| Product docs / persona / policies | runbooks, help center, README — or ask A2 (send a doc, or a few words, or 'default') | source of behavior prose, protocol rules, theme invariants, persona register |
| World/state accessors | the project's world class (`src/world/world.ts`: `projection()`, quota getters, …) — generated for a new domain (G2) | the ONLY keys a deterministic check may read |
| The guard-kind catalog | `references/guard-catalog.md` (bundled — ships with the skill) | preferred vocabulary + when/how-much-to-guard math; `custom()` only when no kind fits. Source of truth: the @looprun-ai/core guards (the package source) |
| Format template | `references/spec-template.ts` (fictional domain) | the output shape — never read real/gold specs |
| Existing eval set (optional) | `evals/cases.ts` | if present, it is the ruler; if absent, G3 generates one |

## Running the cases (T/S execution)

The project's `looprun.eval.config.ts` carries the **`caseMap`** (agent-id → case ids — every case
exactly once); the eval CLI reads it and runs each agent bucket. There is exactly **ONE execution
surface**: `LoopRunAgent` on Mastra (`import { LoopRunAgent } from 'looprun/mastra'`) — the CLI
drives it, no adapter to pick.

```bash
# whole domain (every agent bucket per the caseMap), N=1:
npx looprun-eval run
# one bucket / an explicit set:
npx looprun-eval run --agent <id> --cases <csv|full>
# N=3 certification (= run --reps 3 into a '-cert' results dir):
npx looprun-eval certify
# after Claude-judging <agent>.tasks.jsonl → <agent>.verdicts.jsonl, fold verdicts back:
npx looprun-eval judge-merge eval-results/<date>-<domain>/<agent>.dump.json <agent>.verdicts.jsonl
# fold all *.judged.json into the certificate (bar default ≥90%):
npx looprun-eval cert eval-results/<date>-<domain>-cert
```

`run` writes `eval-results/<date>-<domain>/<agent>.dump.json` + `.autofail.json` + `.tasks.jsonl`.
The streamed `→ pass/fail` lines are the **invariant gate, NOT quality** — only the Claude judge
gives the verdict (`npx looprun-eval judge-prompt` prints the packaged generic judge prompt path;
`evals/judge-prompt.md` adds the domain RULES only). Subject model default:
`gemini-3.1-flash-lite-thinkoff` (the numeric thinking-off trap is already encoded in looprun).
Local smoke AFTER certification: `npx looprun-eval run --model qwen3.5-4b`. Full walkthrough:
`docs/guides/measured-loop.md`.

## DX contract (do not degrade it)

- **ONE mandatory question** — the purpose ("What is the agent's purpose? — one sentence is
  enough"). Skip it if the opening message already states the purpose.
- **≤2 send-or-skip asks** for missing inputs (tools file, docs/persona) — each answerable with a
  path, a paste, ≤10 words, or a skip word ("send doc X — or describe it in a few words — or say
  'none'/'default'"). Never ask what a schema, doc, or file can answer; never ask the user to
  reason about architecture (that goes on the gate-#1 table as a correction, not a question).
- **2 human gates only**: (1) ONE approval table — decomposition + tool surface (when generated) +
  destructive list + theme summary; (2) residual acceptance at the end (fail classes the taxonomy
  says to accept). Everything between runs unattended.
- The user's total day-0 effort: one sentence, up to two send-or-skips, approve twice. With tool
  genesis the minimum input is literally the purpose sentence.

## Hard rules (measured dead ends — NEVER emit)

- **No tool-scoping by intent** (the magnet law). Decompose by TOOL-NEED; the USER picks the agent.
- **No check reads user text** (S-1 firewall). `GuardCtx` has no user-text field; do not smuggle it.
- **No fixed-state assertions in always-rendered prose** (Bucket-A): every rule states its CONDITION.
- **No tool-enabled redrives off reply claims** — claim-regexes cannot tell did-this-turn from
  already-existed; EXISTENCE (world/observed) is the discriminator.
- **No label/claim regex as primary discriminator where a state key exists.**
- Every generated spec must pass `npx looprun-eval lint --spec-laws` (purity, stateful-regex, S-1
  firewall, theme-persona + the config-level spec laws: persona present, ≤15 tools, no own
  systemPrompt, caseMap sane) BEFORE it is offered or measured. No looprun project yet? Run the
  portable `node scripts/lint-guards.mjs <spec-or-theme>` (same banned-token + firewall +
  theme-persona rules, pure node).
- Own scoped prompt per agent, never a shared/global persona (the persona-on-spec law). The
  per-agent role line is the spec's REQUIRED `persona` field, rendered as the FIRST Behavior
  bullet; the shared business VOICE is the theme's `voice`, opening the trunk — **a theme NEVER
  carries a per-agent persona**.
- **Trunk-static law (measured: −4pt when violated).** Business-common content (voice, invariants)
  at the trunk head, byte-identical across the domain's agents; per-agent divergence as LATE as
  possible. Prompt layout is a measured variable — any layout change needs a factorial A/B with a
  replication control.
- **The runtime trunk holds ZERO business strings.** Never edit looprun's trunk renderer
  (`renderScopedSpecTrunk` in @looprun-ai/core, or any host equivalent) with domain content — every
  business string belongs to a generated artifact (spec or theme). You install `@looprun-ai/core`
  as-is; it stays domain-neutral precisely because domain content never goes into it.

## Common mistakes

- Polishing precision while recall rots: the coverage critic (N4) and the eval are the recall
  instruments — believe them over your sense of completeness.
- Bending the SPEC to pass a defective EVAL: when a fail traces to an unsatisfiable rubric/preset,
  fix the eval (with debate re-validation) and log it — never contort the spec.
- Reading live `→ pass/fail` run lines as quality: they are the invariant gate only; the Claude
  judge is the only verdict.
- Asking the user things the inputs already answer (kills the DX contract).
- **A catch-all/triage agent that lumps cases needing other agents' tools** (the triage lesson from
  the lineage — see CONTEXT.md): the decomposer must map by tool-NEED, and the measured loop's
  highest-yield fix is re-mapping such a case to the agent whose tools its job needs — do this
  before writing prose.
- **A standing "IF cond → do X" directive when a precondition already carries the rule**: directives
  render statically and the model over-applies them even when cond is false. Prefer the precondition
  (rendered only with its condition). Reach for a directive only for positive forcing with no gate.
- **Over-specifying the owner's ideal past what the product/eval does**: a confirm-first or
  precondition that blocks a REQUIRED single-turn call fails the eval. The measured eval is the
  arbiter, not the questionnaire answer.
- **Tuning prose past the bar**: once the aggregate clears the bar, STOP — prose is non-local and
  fixing one language-layer case regresses siblings (measured net-negative). See the measured-loop
  STOP RULE.
