# CONTEXT — how this skill was built, what is proven, what is pending

> **Purpose of this file.** The single self-contained briefing on where the `agentspec` skill came
> from: lineage, design laws (with the measured evidence behind each), validation status, the
> experiment record, every known pendency, and what was portable vs. research-harness-specific.
> This is the ONLY file in the looprun repo allowed to name the research lineage (it is allowlisted
> in `tests/no-bench-drift.test.mjs`) — kept for honesty, not for use. Nothing here is speculative —
> every claim cites a measured run or a code artifact.

## §0 — looprun port (2026-07)

This skill descends from **`agentspec-generator` v1.1**, developed inside the `neurono-bench`
research repository — a controlled benchmark of ~28 agent-loop architectures measured against a
real business assistant (Criaty, 117 real eval cases). The authoring brain (pipeline, debate
primitive, guard vocabulary, fail taxonomy, measured lessons, DX contract) moved intact; every
research-harness surface was replaced with its looprun-native equivalent:

| old (neurono-bench) | new (looprun) |
|---|---|
| `bench/adapters/s15/agents-generated/<domain>/…` | `src/agents/<domain>/…` in the user project |
| `config/examples/<name>.ts` (ExamplePack) + `BENCH_EXAMPLE` | `looprun.eval.config.ts` (`EvalConfig`, one project = one domain) |
| `CASE-MAP.tsv` (duplicated per runtime) | `caseMap` in the config (single copy) |
| `pnpm -C bench test` (registry/purity suites) | `npx looprun-eval lint [--spec-laws]` + `npx looprun-eval check` |
| `scripts/{run-subject,screen,certify,judge-merge}.sh`, `s15-run-set.sh` | `npx looprun-eval run / certify / judge-merge / cert` (no shell scripts ship with the skill) |
| `ScenarioSpec` (`setup.brandPreset`, `conversationMode`, `clearConversation`) | `EvalCase` from `@looprun-ai/eval` (`setup.preset`; the other two fields are gone) |
| `@neurono-bench/agentspec-runtime` imports | `'looprun'` (@looprun-ai/core re-exported); backend `'looprun/mastra'` (`LoopRunAgent`) |
| three execution surfaces (bench s14 loop, s15/Mastra, `@neurono/engine` via `run-engine.sh`) | exactly ONE: `LoopRunAgent` on Mastra |
| guard source of truth: `bench/adapters/s14/GUARDS.md` + `guards.ts` | @looprun-ai/core guards (the package source) |
| `bench/results/…` | `eval-results/…` |
| BARRED paper PDF in `docs/analysis/` | canonical citation: arXiv:2604.25203v1 (https://arxiv.org/abs/2604.25203; https://github.com/plurai-ai/BARRED) |
| `NB_ROOT` / `NB_AGENT` env | `LOOPRUN_ROOT` / `--agent` CLI flag |
| decision labels D3 / D8 / D9-D10-D11 / 283b4ed | law names: magnet law / state-in-tail law / ruler discipline / persona-on-spec law |
| skill name `agentspec-generator`, version 1.1 | skill name `agentspec`, version 1.0 (looprun) |
| NEW in looprun (no old equivalent) | `AgentSpecConfig.theme` — each generated spec references its domain THEME object (`theme: THEME`), still ONE shared object per domain |

**Scores below are from the ORIGINAL harness.** The certified numbers in §5 were measured on the
research bench (its worlds, its judge pipeline, its subject endpoint). looprun examples are
re-certified fresh with `looprun-eval` — never quote §5 numbers as looprun results.

**Provenance in §8 is historical/private** — it points into the research repo, which is not part
of looprun.

**Legacy phase names** (older ledgers/analyses in the research repo use these):

| old | new | old | new |
|---|---|---|---|
| day-0 conversation / Q0 | A | Phase C (reviewers C1–C5) | N (N1–N5) |
| Phase T (tool genesis) | G1 | Phase D (eval generation) | G3 |
| new-subject / world gen | G2 | Phase E (measured loop) | T |
| Phase A (decompose) | E1 | Phase F (certify) | S |
| Phase B (draft) / B2 (theme) | E2 / E3 | | |

## 1. What the skill is

`agentspec` (né `agentspec-generator`) turns a business's tool surface + docs — **or literally one
purpose sentence** — into certified governed agents: `AgentSpec` TypeScript files (prose+check
paired guards, per-agent persona), a generated domain THEME (business-common voice/invariants/state
render), optionally a generated world+presets+tools+eval set, iterated by a measured loop until a
certification bar (default ≥90%, Claude judge, N=3). DX contract: ONE mandatory question, ≤2
send-or-skip asks, 2 human gates.

## 2. Lineage (why it exists, in order)

1. **neurono-bench** measured ~28 agent-loop architectures against a real business assistant
   (Criaty, 117 real eval cases). Winner-shape: free-form loop + declarative governance
   (guards), never intent-routing ("the magnet", decision D3).
2. **s14** distilled that into `AgentSpec`: one TypeScript class per agent = tools + guards
   (prose half + deterministic check half) + behavior prose + controls. Certified 92.3–94% on
   Criaty (vs the engine's classifier loop).
3. **F3 lane** asked: can a skill GENERATE the specs (near-zero DX)? First manual generation run
   (2026-07-03) validated the concept and produced the fail taxonomy + STOP rule.
4. **The skill was then hardened by generating 5 domains** (criaty, beauty, homeservices,
   accounting, lawfirm) — every recurring failure became either a pipeline stage (adversarial
   review, debate validation), a hard rule, or a numbered measured lesson.
5. **s15 / `packages/agentspec-runtime`** re-expressed the s14 runtime on Mastra as a standalone
   package (host injects model/world/tools/theme). The skill's artifacts ran on three surfaces:
   bench s14 loop, s15 runtime, and the real `@neurono/engine`.
6. **2026-07-08/09**: theme/persona refactor (skill owns 100% of business content; runtime = zero
   business strings), the trunk-static law was measured, the full input-scenario matrix was run on
   criaty, and the fully-generated path BEAT the hand-certified bundle (§5).
7. **2026-07 (this repo)**: the runtime became **looprun** (`@looprun-ai/core` + `looprun/mastra` +
   `@looprun-ai/eval`), and the skill was ported as `agentspec` (§0).

## 3. The AGENTS pipeline (v1.1 names; legacy map in §0)

**A**sk (one purpose question + send-or-skip) → **G**enerate what's missing (G1 tools via
debate-validated genesis · G2 world/presets/config · G3 evals via debate validation) →
**E**ngineer (E1 decompose ≤15 tools/agent by TOOL-NEED · E2 one drafter per spec · E3 theme) →
**N**itpick (5 independent adversarial reviewers + verifier, ≤2 rounds) → **T**est (measured
loop: N=1, Claude judge, closed fail taxonomy, fix-preference order, ≤3 iterations, STOP at bar)
→ **S**hip (N=3 cert + provenance).

**The debate primitive** (G1, G3, N): rigid Advocate vs 2 independent Judges, T=2 rounds,
consensus required, ≤2 refinements then drop. From the BARRED paper (arXiv:2604.25203v1):
raw generations −27% without verification; **self-refine is WORSE than no verification** — a
generator never validates its own output.

**Two-pass isolation (measured, settled):** G1 runs isolated and emits only
`tools.json`+`WORLD-MODEL.md`; two-pass mode then RESTARTS the pipeline fresh from the
tools-given branch (engineers never see the genesis debate's framing). Verdict in pendency #2:
NOT promoted — single-pass is the default and the G1 artifacts always flow to the engineers.

## 4. Design laws (each measured; violating any is a regression, not a preference)

| law | statement | evidence |
|---|---|---|
| **Magnet (D3)** | never scope tools by user intent; decompose by TOOL-NEED; deterministic gates key on STATE | tasks-as-router arm collapsed; s13 triage: 11/13 fails were out-of-scope tools |
| **S-1 firewall** | no deterministic check ever reads user text (prompt-injection surface) | GuardCtx has no user-text field by construction; lint-enforced |
| **Bucket-A** | always-rendered prose must state its CONDITION, never a state snapshot | unconditioned directive broke onboarding cases (2026-07-03) |
| **Trunk-static** | business-common content at trunk head, byte-identical across a domain's agents; per-agent divergence as late as possible (persona = first Behavior bullet); LAYOUT is a measured variable | moving the role line to the head: −4pt, 4 reps (2026-07-09); factorial 2×2 confirmed ~+2–3pt for the certified layout |
| **283b4ed (persona-on-spec)** | every agent has its OWN scoped prompt/persona (spec field, REQUIRED); the theme carries the shared `voice`, NEVER a persona | global-persona deletion cut trunk −83%; "Theo duplication" defect class |
| **Zero business strings in runtime** | every business string lives in a GENERATED artifact (spec or theme); the trunk renderer is neutral machinery | enforced by the runtime-registry business-token lint (CI) — in looprun, by the library's own CI |
| **Eval is the arbiter** | when spec-ideal and eval disagree, the eval wins (relax the gate); when the eval is defective, fix the EVAL with debate re-validation — never bend the spec to a broken rubric | lesson #6 + the 11-update-voice eval-defect class |
| **STOP rule** | the bar is a FLOOR: past it, iterate ≤3× while each pass is net-positive — but ONLY margin-validated / gated fixes, never blind prose (non-local: an unvalidated fix regressed 2 siblings, net −2, measured) | 2026-07-03 run; revised 2026-07-16 |
| **Ruler discipline** | subject `gemini-3.1-flash-lite-thinkoff` (D10); judge = Claude/Opus only (D9, gemini judge ~4pt lenient, sonnet ~3pt harsher); N≥3 to certify (D11); judged-only (live pass/fail lines = invariant gate, not quality); never compare across days without a same-day control | D9/D10/D11 + the drift finding (§5, lesson #11) |
| **Anti-contamination** | generation agents never read certified/gold specs, themes or evals; only interface artifacts (tools.json, docs) cross; provenance recorded per run | criaty-gen (a)/(b1)/(c) REVIEW.md protocol |

The 11 numbered **cross-domain measured lessons** live in `references/measured-loop.md` (confirm-
probe exemptions, negation-aware claim checks, act-directly, flow-in-one-agent, world bugs,
over-strict gates, trunk-static, claim-regex exoneration, redrive can't act, homonym-pair gates,
subject-endpoint drift/replication control).

## 5. Validation status (all judged, Claude/Opus ruler — ON THE ORIGINAL HARNESS, see §0)

**Five domains, first-shot generation (2026-07-09, N=1):** beauty 100% · homeservices 100% ·
accounting 95.5% · lawfirm 90.9% · criaty full-117 = the scenario matrix below.

**Criaty input-scenario matrix (117 real cases unless noted; same-day ruler):**

| scenario | input | result |
|---|---|---|
| (a) purpose-only, single-pass | 1 sentence | 90.0% (30 generated cases, 0 autofails, 1st shot) |
| (b1) two-pass (chained tools.json) | sentence + (a)'s tools | 93.3% (same 30-case ruler, 1st shot) |
| (b2) real tools, NO docs | sentence + real tools.json | **80.3% = the no-docs ceiling** (observational arm; product protocols are unguessable from schemas) |
| (c) real tools + real docs | full F3 inputs | 88.9% 1st shot → **93.2% after ONE measured-loop iteration — beats the bench** (92.3 nominal / 91.5 rebased / 92.6 certified mean) |

**Track A (the hand-certified bundle, same days):** post-refactor regression isolated by a 2×2
factorial + replication control + ISO-J re-judge → ~3pt was **unpinned subject-endpoint drift**
(not code), ~2–3pt was the layout violation; restored + deterministic fixes → **CERT N=3 = 92.6%
mean (92.3/93.2/92.3)**, +1.1 over the re-based bench.

Headline: docs are worth **+8.6pt** (b2→c); one measured-loop iteration **+4.3pt** (c→c-iter1);
the fully-generated path **exceeds months of hand-tuning** (93.2 > 92.6).

Experiment ledger: `bench/results/2026-07-09-criaty-A-EXPERIMENTS.md`. Bundles:
`bench/adapters/s15/agents-generated{,-exp}/…` + `bench/results/2026-07-09-*` (research repo).

## 6. What was PORTABLE vs research-harness-SPECIFIC (the migration checklist — executed by §0)

**Portable as-is (the skill folder):** SKILL.md, all `references/*.md` +
`spec-template.ts` (fictional domain), `scripts/lint-guards.mjs` (pure node). The pipeline,
debate primitive, guard catalog vocabulary, fail taxonomy, lessons, and DX contract are
harness-agnostic method. → All ported.

**Required a host equivalent (now = looprun):**
- **Runtime**: was `packages/agentspec-runtime` / the s14 in-bench runtime / `@neurono/engine`
  via an adapter → now `@looprun-ai/core` (guards, AgentSpec hierarchy, trunk renderer) +
  `looprun/mastra` (`LoopRunAgent`: preTool veto, onReply redrive-as-no-tools-regenerate,
  onInput tripwire, terminal force-tools).
- **Measurement harness**: was the bench scripts + CASE-MAP.tsv + ExamplePack worlds → now
  `@looprun-ai/eval` (`looprun-eval run/certify/judge-merge/cert`, the `EvalConfig` contract, the
  packaged generic Claude-judge prompt).
- **CI laws**: was `bench/test/s15-registry.test.ts` (zero-business-strings, theme-no-persona,
  persona-at-head-of-Behavior, ≤15 tools, case-map resolution) → now `looprun-eval lint
  --spec-laws` in the user project + the library's own CI; the portable `lint-guards.mjs` covers
  the file-local subset.
- **Env/keys**: `GOOGLE_GENERATIVE_AI_API_KEY` (subject), `LOOPRUN_ROOT` (was `NB_ROOT`).

**Known trap when migrating:** the subject-model alias drifts (§5); pin a versioned model id if
the provider offers one, and ALWAYS run a replication control before comparing to old numbers.

## 7. Pendencies (updated at the port, 2026-07-10)

1. **Phase-2 matrix (DONE 2026-07-09)**: 4 domains × (a, b1, c) all measured at the fixed rulers.
   (c) tools+docs: lawfirm 95.5 · homeservices 95.5 · accounting 95.5 (iter1) · beauty 90.0 (iter1).
   (a) purpose-only single-pass: beauty 100 · accounting 100 · lawfirm 95.5 · homeservices 90.9.
   (b1) two-pass: lawfirm 100 · beauty 95.5 · accounting 95.5 · homeservices 68.2 first shot
   (structural flow-split + myopic no-world checks; iter1 re-measured). Ledger:
   bench/results/2026-07-09-criaty-A-EXPERIMENTS.md (Phase 2 section, research repo).
2. **Two-pass VERDICT (SETTLED)**: NOT promoted. 5 paired runs split 3–2 for single-pass
   (means 95.3 vs 90.5 first-shot); the criaty +3.3 did not generalize. SKILL.md reflects it:
   single-pass is the default; the G1 artifacts (tools.json + WORLD-MODEL.md) always flow to
   the engineers. Mechanism documented in the ledger.
3. **Subject pinning**: `gemini-3.1-flash-lite` alias is unpinned → ~3pt silent drift measured
   between 07-08 and 07-09. Structural fix (pin a versioned id) blocked on provider exposing one;
   mitigations = lesson #11 protocol (replication control + ISO-J + re-base).
4. **COMMITTED (RESOLVED at the port)**: the 2026-07-09 warning ("nothing is committed") no longer
   applies — the theme/voice refactor, the multi-domain surface, the v1.1 rename, the bundles/
   ledgers and this file were committed in the research repo before this port; the looprun tree
   carries the v1.1 content forward as `agentspec` v1.0.
5. **Naming churn**: ledgers/analyses before 2026-07-09 use the legacy phase letters (T/A/B/B2/
   C/D/E/F) — the mapping table lives in §0; old bundle dirs keep old spellings.
6. **Known eval defect (open, research repo)**: criaty `11-update-voice` — rubric expects a
   learned voice profile the FakeWorld never returns (world-fidelity, class-7); needs a world fix
   + debate re-validation, parked because it is shared by ALL arms (doesn't distort comparisons).
7. **Residual fail classes at cert (accepted, documented)**: intent-keyed cases firewalled by
   S-1 (07-format-ask, 08-escape-valve, 10-set-approved), UNCHECKABLE lexically-valid-but-invented
   handle (04-invalid-handle), F4 prose coins (14-pushback-tone), drift-exposed date fabrication
   (02-commemoratives — candidate deterministic check: cited-dates ⊆ tool-results, deferred by
   STOP rule).
8. **A3/A4 deliberately not executed** (redrive-prompt A/B; prose pass) — cert was reached
   without them; they remain documented levers if a future bar is higher.
9. **b2 arm is observational by design** (no iterations — fixing would import doc knowledge and
   destroy the no-docs-ceiling measurement). Do not "improve" it.
10. **Engine surface**: was proven per-case on the real `@neurono/engine` loop (5 case classes) —
    that surface was NOT ported; looprun has exactly one execution surface (LoopRunAgent/Mastra).
11. **`llmReplyCheck`** existed in the old catalog but costs the determinism certificate;
    @looprun-ai/core deliberately omits it — reply-checks must use pre-baked trusted rubrics (never
    user text — prompt-injection law).
12. **CASE-MAP duplication (RESOLVED by the looprun design)**: the old s14/s15 twin CASE-MAP.tsv
    files are gone — `caseMap` lives once, in `looprun.eval.config.ts`, and `looprun-eval lint
    --spec-laws` checks it (every case exactly once).
13. **G2 world seam checklist (RESOLVED by the looprun design)**: `npx looprun-eval check`
    validates the config + world seams before any LLM run — the accounting-gen class of pre-turn
    seam error (a world missing a runtime accessor) is caught by `check`, not by a failed run.
14. **Skill self-testing methodology** (user law, 2026-07-09): validating the skill = running the
    FULL scenario matrix (a/b1/b2/c chained), generation executor pinned (Opus) for
    reproducibility while the skill itself stays model-agnostic; one variable per cell;
    replication control first. This file is its canonical home.

## 8. Provenance pointers (HISTORICAL — private research repo, not part of looprun)

- Experiment ledger: `bench/results/2026-07-09-criaty-A-EXPERIMENTS.md`
- Scenario bundles: `bench/adapters/s15/agents-generated-exp/{criaty-gen/{a,b1},criaty-b2,criaty-c}/`
- Certified 5-domain surface: `bench/adapters/s15/agents-generated/<domain>/`
- Original runtime: `packages/agentspec-runtime/` (trunk renderer, guards, Mastra backend)
- Engine adapter: `bench/adapters/s14-engine/adapter.ts`
- Analyses: `docs/analysis/skill-theme-dx-2026-07-09.md`, the BARRED paper (now cited as
  arXiv:2604.25203v1), roadmap s15 block
- Runbook: `docs/runbooks/agentspec-generator-cases.md`
- The 94% reproduction protocol (traps: thinkoff subject + Opus judge): research-repo memory
  `s14-reps1-vs-N3-94pct-is-majority.md`
