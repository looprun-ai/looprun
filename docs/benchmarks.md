# Benchmarks — measuring looprun on τ²-bench

How we measure looprun against the market, and how to read the result against the official
published numbers for the 2026 frontier.

**The decision is made.** looprun's benchmark is **τ²-bench (telecom)** — the one public
agentic benchmark that is (a) exactly the deployment shape looprun governs, (b) reported for
the 2026 frontier on a single independent ruler, and (c) runnable today from an official,
public harness. Everything below is scoped to running it and reading it; secondary axes are
listed as later work, not surveyed.

---

## 1. What we measure — and why τ²-bench

looprun is a **governance layer that wraps a subject model** (see [README](../README.md),
[overview](./overview.md), [the measured loop](./guides/measured-loop.md)). It does not reason
for the model. It enforces deterministic guards on tool calls, forces **honest abstention**
instead of fabrication, resists prompt injection (guards read tool args, world state and the
agent's own verified actions — **never the user's text**), and certifies agents with a
LLM-judged pass-rate.

Two consequences fix the whole method:

1. **The unit of comparison is a pair.** A fair run is **raw model** vs **the same model +
   looprun**. The *delta* is looprun's contribution — never looprun's number in isolation.
2. **looprun lifts agentic / policy behaviour** — correct tool calls under a written policy,
   refusing to act when the policy forbids it, injection resistance, honest "I can't do that".

**Why τ²-bench is the match.** τ²-bench (Sierra) is a policy-bound tool agent talking to an
LLM-simulated user over a stateful domain (telecom), scored by a **programmatic DB-state
reward** with a `pass^k` reliability metric. A written domain policy + tools + a reward for
*doing the right thing deterministically* **is** looprun's target. It is also the only agentic
benchmark the 2026 frontier reports on one independent, same-harness ruler
([Artificial Analysis](https://artificialanalysis.ai/evaluations/tau2-bench)), so raw-model
reference numbers actually exist to compare against.

> AA has since moved τ²-Telecom to *legacy* and tracks **τ³-Banking** in its current
> Intelligence Index (Agents weighted 34%). τ²-Telecom stays our **first target** because its
> harness is public and mature (§3); τ³-Banking is deferred to a later pass (§4).

---

## 2. The comparison — τ²-bench Telecom

**Source: [Artificial Analysis](https://artificialanalysis.ai/evaluations/tau2-bench)** —
independent, same-harness τ²-Bench Telecom scores, read off the leaderboard configured for our
23 models of interest on 2026-07-11. One independent ruler avoids the vendor-card
cross-contamination that produced earlier bogus figures. All 2026 figures are
post-training-cutoff — verify at source.

**We benchmark three subjects, all in `non-thinking` config** — the configs looprun runs in
production: `qwen3.5-4b` and `qwen3.6-35b-a3b`
([aliases.ts](../packages/models/src/aliases.ts)) and `gemini-3.1-flash-lite`
([index.ts](../packages/models/src/index.ts), `geminiFlashLiteThinkOff`). Each is on the board,
so the AA number is the *raw* baseline; looprun's job is the **+looprun** delta we produce (§3),
on the identical tasks.

Full exported roster — score, output tokens, cost and time per task from the same AA export.
💡 = **reasoning** config (lightbulb on the board); everything else runs **non-thinking**.
**★ = the config we benchmark** (rows 11, 12, 22). After the run we append **new rows** with the
`+looprun` numbers for those three.

| # | Model | Config | Score % ↑ | Token/Task | Cost/Task | Time/Task (min) ↓ |
|---:|---|---|---:|---:|---:|---:|
| 1 | Claude Fable 5 | 💡 with fallback | 98.5 | 4k | $2.97 | 0.7 |
| 2 | Grok 4.3 | 💡 high | 97.7 | 4k | $0.28 | 0.6 |
| 3 | Gemini 3.1 Pro Preview | 💡 | 95.6 | 6k | $0.40 | 0.7 |
| 4 | DeepSeek V4 Flash | 💡 high | 95.6 | 4k | $0.04 | — |
| 5 | Gemini 3.5 Flash | 💡 | 95.3 | 7k | $0.47 | 0.8 |
| 6 | Qwen3.6-35B-A3B | 💡 thinking-on | 95.3 | 6k | $0.12 | 0.6 |
| 7 | Claude Opus 4.8 | 💡 max | 94.4 | 11k | $2.03 | 1.9 |
| 8 | DeepSeek V4 Pro | 💡 high | 94.2 | 4k | $0.11 | 1.1 |
| 9 | Qwen3.5-4B | 💡 thinking-on | 92.1 | 5k | $0.01 | 2.0 |
| 10 | Grok 4.3 | 💡 low | 88.9 | 3k | $0.32 | 0.5 |
| 11 | **★ Qwen3.5-4B** | **non-thinking** | **87.7** | **3k** | **$0.01** | **1.4** |
| 12 | **★ Qwen3.6-35B-A3B** | **non-thinking** | **85.1** | **2k** | **$0.07** | **0.2** |
| 13 | GPT-5.4 mini | 💡 xhigh | 83.3 | 26k | $0.25 | 2.7 |
| 14 | GPT-5.6 Sol | 💡 high | 83.3 | — | — | — |
| 15 | Claude Sonnet 4.6 | non-reasoning low | 78.9 | 2k | $0.79 | 0.6 |
| 16 | GPT-5.6 Terra | 💡 high | 78.4 | — | — | — |
| 17 | GPT-5.4 nano | 💡 xhigh | 76.0 | 23k | $0.07 | 2.2 |
| 18 | Gemini 3.5 Flash | minimal | 58.8 | 2k | $0.32 | 0.2 |
| 19 | Claude 4.5 Haiku | 💡 | 54.7 | 8k | $0.29 | 0.9 |
| 20 | GPT-5.4 nano | non-reasoning | 34.8 | 2k | $0.05 | 0.2 |
| 21 | Claude 4.5 Haiku | non-reasoning | 32.5 | 3k | $0.23 | 0.4 |
| 22 | **★ Gemini 3.1 Flash-Lite** | **💡 (board is reasoning-on)** | **31.3** | **5k** | **$0.05** | **0.3** |
| 23 | GPT-5.4 mini | non-reasoning | 23.4 | 836 | $0.10 | <0.1 |

*Token/Task* = output tokens per task (AA rounds to ~1k). *Cost/Task* = total USD/task (input +
cache + reasoning + answer). *Time/Task* = weighted decode minutes, excluding TTFT/overhead;
lower is better. **—** = model absent from AA's token/cost/speed panels (GPT-5.6 Sol/Terra;
DeepSeek V4 Flash has no speed bar).

**Two caveats.** (1) Cost & time are AA's **cloud-provider** figures — our Qwen subjects run
**locally on llama.cpp**, so real cost ≈ local compute (not the dollars shown) and wall-clock
depends on our hardware; only the score column is apples-to-apples with what we measure.
(2) The board only lists Flash-Lite **reasoning-on** (row 22); our subject runs thinking-off, so
its raw score/tokens/cost/time land **at or below** that row.

**The three we benchmark.** Qwen3.5-4B (87.7) actually *out-scores* the larger Qwen3.6-35B-A3B
(85.1) in the same non-thinking config — and both are cheap and fast (2–3k tokens, ≤$0.07,
≤1.4 min on AA's providers). Their thinking-on configs (rows 6, 9) reach 95.3 / 92.1 as
reference. Flash-Lite (≤31.3) has the widest headroom. For each, we reproduce the raw AA number,
then run `+looprun` on the identical tasks and add the governed row.

---

## 3. How we run it

Harness + results live in the sibling repo **`looprun-bench`**, separate from this library so
the `no-bench-drift` firewall never touches bench code.

**Official harness:**
[`github.com/sierra-research/tau2-bench`](https://github.com/sierra-research/tau2-bench) — now
the unified τ³-bench repo, backward-compatible, domains
`airline · retail · telecom · banking_knowledge · mock`. It ships the stateful env, the LLM
**user-simulator**, and the **programmatic DB-state reward** (`pass^k`). Stack: `uv sync`
(uv, Python 3.12–3.13); model keys via LiteLLM in `.env`.

**Paired protocol — raw vs governed on the same tasks:**

1. **Generate the governed agent with the `agentspec` skill.** Feed the telecom domain's
   **policy + tool schemas** (from τ²-bench) into the skill so it produces the AgentSpec — the
   deterministic guards that encode the telecom policy, per hook, over the telecom tool names.
   Use the skill for the **spec / guards / theme only**; the **tasks and scoring come from
   τ²-bench**, not the skill's own generated eval set. (If telecom exceeds the ≤15-tool budget
   the skill decomposes into >1 agent — route them behind one endpoint.)
2. **Wrap & serve.** `LoopRunAgent({ spec, tools: <telecom tools>, model: <subject> })`,
   exposed as an **OpenAI-compatible `/chat/completions` endpoint** (with tool-calling).
3. **Run both arms:**
   - raw: `tau2 run --domain telecom --agent-llm <subject> --user-llm <strong> --num-trials K`
   - governed: `tau2 run --domain telecom --agent-llm openai/looprun --agent-base-url <url> …`

   The **delta between the two arms is looprun's contribution.**
4. Subject models via **LiteLLM**, all in **non-thinking** config (§2): `qwen3.5-4b` and
   `qwen3.6-35b-a3b` on our local `llama.cpp` OpenAI endpoints, and `gemini-3.1-flash-lite`
   thinking-off (`geminiFlashLiteThinkOff`). These three — and only these — are what we run;
   the thinking-on Qwen rows (6, 9) stay on the board as reference. Save every run under
   `looprun-bench`.

---

## 4. Later work (deferred)

Not being run now — recorded so the scope stays honest.

- **τ³-Banking** — the current Artificial Analysis flagship agent benchmark (τ² is now AA
  *legacy*); same repo, `uv sync --extra knowledge` (`banking_knowledge` domain).
- **IFBench** — instruction-following constraint checkers (pure JS, no sandbox).
- **Other looprun-relevant axes with no frontier market number.** These measure exactly what
  looprun governs, but no 2026 frontier card publishes them, so there's no reference band —
  we'd produce subject `raw → +looprun` numbers ourselves: **BFCL** irrelevance (refuse to
  fabricate a call), **SimpleQA** not-attempted rate (honest "I don't know"), **IFEval** strict
  (deterministic constraint adherence), **AgentDojo** attack-success-rate (the S-1 firewall,
  measured both ways).
- **GPQA-Diamond** — optional **no-harm** capability check: looprun wraps the same model, so
  `+looprun ≈ raw` is the *desired* result (guards don't tax raw capability). AA independent
  band ~91–94% across the 2026 frontier.

**Reference-only AA agentic benchmarks** (read frontier scores by filtering models; no public
code, subjects not on AA — a band, not a looprun number): **AutomationBench-AA** (zero credit
when a guardrail is violated — looprun's thesis, precisely), **EnterpriseOps-Gym-AA** (multi-turn
MCP tool use, SQL state verifiers), **AA-Omniscience** (accuracy + 1−hallucination — the
honest-abstention axis), **Harvey LAB-AA** (agentic legal deliverables).

---

## 5. Sources

- **τ²-bench harness & paper** —
  [`github.com/sierra-research/tau2-bench`](https://github.com/sierra-research/tau2-bench) ·
  τ-bench [`github.com/sierra-research/tau-bench`](https://github.com/sierra-research/tau-bench)
- **§2 τ²-Bench Telecom scores — Artificial Analysis, 23-model export read 2026-07-11** —
  <https://artificialanalysis.ai/evaluations/tau2-bench>. Subjects on the board: Qwen3.6-35B-A3B
  95.3 / 85.1, Qwen3.5-4B 92.1 / 87.7, Gemini 3.1 Flash-Lite 31.3 (reasoning-on). Top of band:
  Fable 5 98.5, Grok 4.3 97.7, Gemini 3.1 Pro 95.6, Opus 4.8 94.4, GPT-5.6 Sol 83.3, Haiku 4.5
  54.7. See §2 for the full roster.
- **GPQA-Diamond band** (deferred no-harm baseline) —
  <https://artificialanalysis.ai/evaluations/gpqa-diamond>

---

## 6. Atlas — the governance-vs-traditional benchmark (measured, 2026-07-18)

Complementing τ² (looprun vs the market), **Atlas** answers the second question: *what does the
governance layer add over a traditional hand-built agent on the same framework?* Atlas Equipment
Rentals & Field Ops — 5 agents / 61 cases / 54 tools — was generated end-to-end by the
[`agentspec` skill](../skills/agentspec/SKILL.md) from one purpose sentence; the control arm is a
plain Mastra agent blind-authored by a frontier coding agent (no looprun exposure, ≤3 measured
iterations of parity budget). Both arms, same evals, same LLM judge, N=3.

| tier | looprun-governed | traditional (vanilla) | Δ |
|---|---|---|---|
| reference model (gemini flash-lite) | **100%** (61/61 ×3) | 98.4% | +1.6 |
| cloud aggregate (13 models, OpenRouter) | **96.5** | 92.6 | **+3.9** (11 wins / 1 tie / 1 loss) |
| local 24 GB (Qwen3.6-35B quant) | **91.8** (honest band) | 86.9 | +4.9 |

Every fabrication, unconfirmed destructive execution, empty-reply delivery stub, privilege and
tenant-isolation incident in the matrix occurred in the **ungoverned** arm; the governed arm was
also rep-stable (ungoverned replicates swing up to ±6.6 pt) and ~30–37% cheaper per case.

Data, specs, both arms' bundles and the full reports:
[`looprun-bench`](https://github.com/looprun-ai/looprun-bench) → `atlas/`. Version measured:
**looprun 0.6.0**.
