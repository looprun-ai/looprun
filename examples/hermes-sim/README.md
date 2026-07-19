# hermes-sim — the REAL harness against governed agents-as-models

End-to-end integration sim for [`@looprun-ai/server`](../../packages/server): the real
**Hermes-Agent** harness (NousResearch, Python) talks to looprun agents exposed as
OpenAI-compatible models. No Hermes code is modified — the integration is config-only. No real
side effects happen — every tool call lands in a deterministic fake world whose end-state the sim
asserts.

```
Hermes-Agent (real harness, headless `hermes chat -q`)
   │  POST /v1/chat/completions   (provider: custom, base_url → this sim's server)
   ▼
@looprun-ai/server  →  LoopRunAgent (governed turn: guards → tools → redrive)
   │                        │
   ▼                        ▼
one assistant message   deterministic FakeWorld (asserted after each task)
```

Three governed domains, chosen from the researched task catalog ([TASKS.md](TASKS.md)):
[inbox-triage](../inbox-triage), [second-brain](../second-brain), [calendar](../calendar).

## Run

Requirements: the `hermes` CLI (or `HERMES_BIN=/abs/path`), a Python env able to run it, and a
backing-model key — either `OPENROUTER_API_KEY` (default chain: `nemotron-3-ultra:free` →
`qwen3-coder:free` → `llama-3.3-70b:free`, override with `SIM_MODEL=a,b,c`) or
`GOOGLE_GENERATIVE_AI_API_KEY` (`gemini-3.1-flash-lite`, thinking off).

```bash
OPENROUTER_API_KEY=... pnpm -C examples/hermes-sim sim
# or with an explicit CLI path and the gemini backing model:
HERMES_BIN=~/hermes-agent/.venv/bin/hermes GOOGLE_GENERATIVE_AI_API_KEY=... pnpm -C examples/hermes-sim sim
```

Free-tier reality (measured 2026-07-19, 3/4 tasks green on the free chain): OpenRouter free
models fail in three shapes — provider capacity 502s, 200s whose body is keep-alive whitespace
with no JSON, and `free-models-per-min` 429s. The sim mitigates all three (server-side model
fallback via OpenRouter's `models` array — hard limit 3 entries — plus client-side retry with a
65 s window for 429) and paces one task per minute. Expect residual model-quality variance:
weaker fallback models sometimes under-act (reply without calling tools), which fails progress
assertions but never breaches a guard.

The sim: starts the model server on an ephemeral port → writes a sandboxed `HERMES_HOME`
(`.hermes-home/`, gitignored) pointing at it → runs one real `hermes chat -q "<task>"` per task →
asserts the fake-world end-state (e.g. inbox-triage: drafts > 0, **sends = 0**) → prints a
pass/fail report with the observed guard corrections. Non-zero exit on any failure.

This lane is manual (not in CI): it needs the external CLI and an API key.

`SIM_BASELINE=1` runs the same tasks against ungoverned `-raw` twins (same worlds, tools, model,
harness path; neutral one-line prompt, no domain guards) — an A/B that isolates what governance
adds. Note the raw twins still carry the machinery-mandated minimal integrity guards
(noDuplicateCall/emptyReply); in the first measured baseline run those fired to suppress
duplicate eventCreate calls, so even "raw" looprun is not zero protection.

## Using this for real (production notes)

- **Per-task models in Hermes:** point only the tasks you want governed at the server —
  `model_aliases` in `config.yaml` map an alias to `(model, provider, base_url)`, and cron jobs
  pin `model` / `provider` / `base_url` per job. Everyday chat stays on the harness's normal model.
- **Cron uses the same loop:** Hermes cron jobs run through the same agent loop as `chat -q`, so
  what this sim exercises is exactly what a cron-fired task does.
- **What the facade ignores:** the harness's system prompt (the spec renders its own trunk) and
  the harness's tool list (the governed agent owns its tool surface). See the
  [server README](../../packages/server/README.md) mapping law.
- **Real tools instead of fake worlds:** register the agents with Mastra MCP tools
  (`tools: await mcp.getTools()`) instead of `world`+`toolDefs` — guards govern MCP tools with no
  extra wiring. The fake worlds here exist so the sim can assert exact end-states.
