# 06 · Advanced

**What you get from this chapter:** the same governed scheduler, taken somewhere else — served
behind an OpenAI-compatible endpoint, run on a local model with no cloud key, and driven by a host
whose tools execute themselves. Thirteen symbols, from three specifiers.

> **Code source.** Blocks are captioned. **Excerpts** are verbatim from
> [`snippets/06-advanced.ts`](snippets/06-advanced.ts), which CI typechecks and partly runs.
> **Signature blocks** are type declarations quoted from the library source. **Terminal blocks** say
> whether they are a *real* transcript or an *illustrative shape*. One block is marked
> **illustrative** because it needs `@mastra/mcp` and a live MCP server, so it is not compiled here.

**Imports.** **`@looprun-ai/server`** · `looprun/models` · `looprun/mastra`.

> Like `@looprun-ai/eval` in chapter 05, the server package is named directly: the `looprun` facade
> publishes `.`, `./core`, `./mastra`, `./models` and `./vercel`, and there is **no `looprun/server`
> subpath**. Whether a `looprun/server` subpath lands is not decided; if it does, only the specifier
> changes, nothing else.
>
> ```bash
> npm i @looprun-ai/server
> ```
>
> `@looprun-ai/vercel` is not covered here, and there is nothing to omit: it is a reserved stub whose
> only exported factory throws. The Vercel AI SDK backend does not exist yet.

---

## 1. Serve it — the agent as an OpenAI-compatible model

```
   any harness that can point a "custom provider" at a base_url
        │  POST /v1/chat/completions  { model: "scheduler", messages: [...] }
        ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  createModelServer({ agents: { scheduler } })                │
   │     the WHOLE governed turn runs inside the request:         │
   │     guards → tools → redrive → one final assistant message   │
   └──────────────────────────────────────────────────────────────┘
        │  { choices: [{ message }], looprun: { sessionId, corrections, … } }
        ▼
   the harness believes it talked to a model
```

That is the whole idea: an agent that is governed *by construction* is more useful when anything
that speaks OpenAI can call it — Open WebUI, an IDE assistant, a personal-agent framework, a plain
OpenAI SDK.

```ts
export async function serveScheduler(model: unknown): Promise<ModelServer> {
  const server = await createModelServer(
    schedulerServerConfig(model, (event) => {
      console.log(`${event.model} · turn ${event.meta.turnIndex} · corrections`, event.meta.corrections);
    }),
  );
  return server; // { url, port, handler, close() } — url is `http://127.0.0.1:8099/v1`
}
```
<sub>excerpt · `snippets/06-advanced.ts`</sub>

```ts
export function schedulerServerConfig(model: unknown, onTurn: (event: TurnEvent) => void): ModelServerConfig {
  return {
    agents: { scheduler: schedulerAgent(model) },
    port: 8099,
    // Observability: fires after every governed turn, with the corrections and violations of it.
    onTurn,
    // Optional: evict idle sessions (calls agent.endSession()). Default: never.
    sessionTtlMs: 30 * 60_000,
  };
}
```
<sub>excerpt · `snippets/06-advanced.ts` — `schedulerAgent` is chapter 02's `LoopRunAgent`, built with
a world **factory**, because a server is multi-session by definition</sub>

Call it with anything that speaks the protocol — here, `curl`:

```
$ curl -s http://127.0.0.1:8099/v1/chat/completions \
    -H 'content-type: application/json' -H 'x-looprun-session: demo' \
    -d '{"model":"scheduler","messages":[{"role":"user","content":"What is on my calendar this week?"}]}'
{"id":"chatcmpl-looprun-ms6njwsf1","object":"chat.completion","created":1785363872,"model":"scheduler",
 "choices":[{"index":0,"message":{"role":"assistant","content":"Standup on Monday 10:00 and the dentist on Wednesday 15:00."},
 "finish_reason":"stop","logprobs":null}],
 "usage":{"prompt_tokens":9,"completion_tokens":15,"total_tokens":24},
 "looprun":{"sessionId":"demo","turnIndex":0,"corrections":[],"exhausted":false,"violations":[]}}
```
<sub>**real** — `serveScheduler` was started with a **scripted** model (`@looprun-ai/mastra/testing`),
so no live model was called and the reply text is the scripted one; the request, the routing, the
governed turn and the envelope are real, and the JSON is unedited apart from line wrapping. The
server also answers `GET /v1/models` with `{"object":"list","data":[…]}` — a list whose single entry
is `{"id":"scheduler","object":"model","owned_by":"looprun","context_length":128000}`</sub>

Three things in that response are the whole pattern: the reply came out of a **governed turn** (the
model called `listEvents` and closed with `respond`, both gated); the `model` field routed to the
agent registered under that key; and the non-standard `looprun` field reports what governance did —
here, nothing to correct.

### `ModelServerConfig` — the factory argument

| field | what it does |
|---|---|
| `agents` | the registry: the request's `model` field selects the agent by this key. One server, N agents as N "models" |
| `port` / `hostname` | defaults: an ephemeral port on `127.0.0.1` |
| `contextLength` | what `/v1/models` reports. It is deliberately high — see the session fingerprint below |
| `apiKey` | when set, requests must carry `Authorization: Bearer <key>` |
| `resolveSession` | override the session-id chain: `(body: CompletionRequestBody, headers: Headers) => string` |
| `sessionTtlMs` | evict idle sessions via `agent.endSession()`. Default: no eviction |
| `onTurn` | fires after every governed turn with a `TurnEvent` |

### `ModelServer` — the returned handle

```ts
interface ModelServer {
  url: string;                                    // http://127.0.0.1:<port>/v1
  port: number;
  handler: (req: Request) => Promise<Response>;   // the bare fetch-style handler
  close(): Promise<void>;
}
```
<sub>signature, from `@looprun-ai/server`</sub>

`handler` is the escape hatch: it is a plain `Request → Response` function, so the same governed
endpoint embeds in any web framework that speaks WHATWG fetch, with no node:http server at all.

### `TurnEvent` — what happened, per turn

```ts
interface TurnEvent {
  model: string;        // the registry key that was called
  sessionId: string;
  meta: {               // the governed-turn metadata
    sessionId: string;
    turnIndex: number;
    corrections: string[];   // veto kinds, 'forced-terminal', 'redrive:*', 'exhaustion-terminal'
    exhausted: boolean;
    violations: string[];
    observed: ObservedCall[];
  };
}
```
<sub>signature, from `@looprun-ai/server`</sub>

**Most** of that metadata also rides on every response, as a non-standard `looprun` field that OpenAI
SDKs ignore and an integration test can assert on — but not all of it:

```
   onTurn(event)          sessionId · turnIndex · corrections · exhausted · violations · observed
   response.looprun       sessionId · turnIndex · corrections · exhausted · violations
                          └─ `observed`, the turn's slice of the call ledger, is NOT on the wire
```

The ledger stays server-side on purpose: it carries every tool call with its arguments, which is
domain data the caller of a *model* endpoint has no business receiving. If you need it, take it in
`onTurn`. `corrections` is the same vocabulary as chapter 05's `TurnRecord.recoveryEvents`: this is
how you see, in production, that a rule fired.

### The mapping law — what the facade does *not* honor

The harness thinks it is talking to a model. Parts of its request would fight the spec, so they are
dropped, by design:

| incoming | treatment | why |
|---|---|---|
| `model` | routes to the registered agent | one server, N agents |
| last `user` message | the governed turn's input | |
| earlier history | **ignored** — transport only | harnesses compress and rewrite it; replaying it would desync the governed state, which is the agent's own |
| `system` message | **discarded** | the spec renders its own assembled prompt, byte-stable and cacheable |
| `tools`, `tool_choice` | **ignored** | the spec owns the surface, and guards govern every call |
| `temperature`, … | **ignored** | `spec.controls.sampling` governs |
| `stream: true` | honored — see below | |

Read that table as the price of the pattern: **a governed agent cannot also be a general-purpose
model endpoint.** If the caller could inject a system prompt or its own tools, the certification
would describe a bundle that is no longer the one running.

**Sessions.** The protocol is stateless and the agent is not. Session id resolution, first hit wins:
the `x-looprun-session` header (explicit, always safe — OpenAI SDKs support `default_headers`), then
the OpenAI-standard `user` field, then a fingerprint of `model` + the **first** user message. The
fingerprint is a fallback, not a design: a harness that compresses that first message away starts a
fresh session — degraded, never unsafe — which is why `contextLength` is reported high. Requests on
one session serialize; different sessions run concurrently.

**Streaming.** `stream: true` still runs the whole governed turn to completion — reply-level
governance cannot be applied to a token stream — and then emits a valid SSE stream: a role delta,
`: keepalive` comments while the turn runs, one content delta with the full governed text, a finish
chunk, `[DONE]`. The client sees a stream; the reply was checked before the first content byte left.

A worked end-to-end example of exactly this path lives in
[`examples/hermes-sim`](../../examples/hermes-sim): the real Hermes-Agent CLI, unmodified and
config-only, driving three governed agents served as OpenAI-compatible models over deterministic
fake worlds whose end-state the sim asserts.

---

## 2. Run it locally — no cloud key at all

Teach it in the order the CLI does it, because the library path fails fast on purpose and the CLI is
what fixes it.

```
$ npx looprun --help
looprun <command>

  init [--local <alias>] [--yes]   Check the environment; optionally pull a local model.
  models status [alias]            Binary / model file / server health per alias.
  models pull <alias> [--yes]      Download the model GGUF (asks consent — sizes are 2.5–17 GB).
  models serve <alias>             Start llama-server with the validated flags (Ctrl-C stops).

Local model tiers: ram24 (default, ~11.8 GB) · ram16 (16 GB machines) ·
ram32 (~17.2 GB) · ram8 (8 GB machines, ~2.5 GB) · qwen3.5-4b (plain fallback, ~2.9 GB)
```
<sub>**real** — `node packages/looprun/bin/looprun.mjs --help`, pasted unedited</sub>

### 2.1 What is shipped, and what it costs

One validated model family in three RAM tiers (Qwen3.6-35B-A3B with a baked multi-token-prediction
head), plus small-RAM fallbacks. The size column is the **weights file**, not the machine's budget:
the real footprint is weights + KV cache + the assembled prompt cache.

| alias | quant · weights | tier | KV · ctx | measured |
|---|---|---|---|---|
| **`ram24`** (default) | UD-IQ2_XXS+MTP · 11.8 GB | 24 GB machines | `f16` · 64k | 88.9% certified eval · ~56 tok/s · peak RSS ~20.7 GB |
| `ram16` | UD-IQ2_XXS+MTP · 11.8 GB | 16 GB machines | `q8_0` · 24k | 13.4–13.5 GB RSS · ~44 tok/s |
| `ram32` | UD-Q3_K_XL+MTP · 17.2 GB | quality-max, 32 GB | `f16` · 64k | ~58 tok/s |
| `ram8` | Qwen3.5-**4B** UD-Q3_K_XL+MTP · 2.5 GB | 8 GB machines, simple agents | `q8_0` · 24k | 4.62 GB RSS · ~43 tok/s — eval quality far below the 35B tiers |
| `qwen3.5-4b` | UD-Q4_K_XL · 2.9 GB | plain-4B fallback (no MTP) | `f16` · 32k | — |

The launch profile is measured, not defaulted: `--jinja -fa on -ngl 99 --mlock --no-mmap -np 1
-c <ctx> -ctk/-ctv <kv> -ctxcp 64 --cache-ram <MiB> --slot-save-path <dir> [--spec-type draft-mtp]`.
Three of those are load-bearing and easy to switch off by accident:

- **`-np 1`** keeps the shared prompt prefix permanently resident — the long-running-agent law.
- **`-ctxcp` + `--cache-ram`** keep N distinct agent assembled prompts warm across agent switches: measured warm
  TTFT 0.5–0.6 s vs 11–22 s cold. Never disable either on this model family.
- **`--spec-type draft-mtp`** uses the trained MTP head baked into the checkpoint and exact-verifies
  every draft, so output is **byte-identical at temperature 0** at ~1.4× decode. The dense 4B has no
  usable head and stays non-MTP.

**Requirements.** `llama-server` from llama.cpp, build **≥ b9780** — older builds cannot load this
family. Binary resolution order: `$LLAMA_BIN` → a `llamacpp-*` build directory in your home (highest
build number first) → `llama-server` on `PATH`. A from-source build often links its dylibs by an
`@rpath` into the build directory, so `looprun models serve` sets `DYLD_FALLBACK_LIBRARY_PATH` to the
binary's own directory on macOS; if you launch the server yourself, do the same — and never through
`nohup`, which strips `DYLD_*`. The measured numbers in the table above assume a GPU the build can
offload to (`-ngl 99`) — Metal on Apple Silicon, CUDA elsewhere. llama.cpp will run CPU-only, and
these tiers will be far slower than anything quoted here.

**Overrides, when a machine disagrees with the profile:** `$LLAMA_BIN` (the binary), `$LLAMA_PORT`,
`$LLAMA_KV`, `$LLAMA_CTX`, `$LLAMA_CACHE_RAM`, `$LLAMA_SLOT_SAVE_PATH` (empty disables the per-agent
assembled prompt state files — with them, a restore after a server restart takes ≈20–30 ms instead of a cold
prefill), `$LLAMA_SPEC_TYPE` (`''` disables MTP), and one file-path variable per alias
(`$QWEN35_4B_GGUF`, `$QWEN36_35B_GGUF`, …). Windows and Linux take the identical flags; on a 16 GB-VRAM
box that wants a 35B tier, add `-ncmoe N` to offload the first N layers' MoE experts to CPU. And note
`ram16`'s 24k context fits agent assembled prompts up to ~21k tokens — a bigger assembled prompt needs `ram24`, or a raised
`$LLAMA_CTX` and the extra KV RAM that costs.

### 2.2 Get the weights — consent first

```bash
npx looprun init                  # env check + interactive pull
npx looprun models pull ram24     # 2.5–17 GB, so it asks
npx looprun models status         # binary / file / server health
npx looprun models serve ram16    # the validated flags, in the foreground
```

`localModel()` **fails fast when the GGUF is missing.** It will not start a multi-gigabyte download
on an agent's first turn: surprise bandwidth, a first-latency measured in minutes, and a CI job that
downloads 12 GB because someone ran the tests.

### 2.3 `localModel` — one call

```ts
/** `localModel` resolves the alias, ensures the GGUF and a healthy server, then returns a client. */
export async function localSchedulerAgent(): Promise<LoopRunAgent> {
  const model = await localModel('qwen3.5-4b');
  return schedulerAgent(model);
}
```
<sub>excerpt · `snippets/06-advanced.ts`</sub>

```ts
function localModel(alias: string, opts?: LocalModelOptions): Promise<LanguageModel>

interface LocalModelOptions {
  runtime?: ModelRuntimePort;   // default: llama.cpp
  autoStart?: boolean;          // spawn the server when it is down. Default TRUE
  autoDownload?: boolean;       // fetch the GGUF when missing. Default FALSE — see above
  timeoutMs?: number;           // health-wait budget for a fresh spawn
  onProgress?: (pct: number) => void;
}
```
<sub>signatures, from `looprun/models`</sub>

Four steps behind that one call: resolve the alias → ensure the model file → ensure a healthy server
(spawn with the measured flags, then health-wait) → return an AI-SDK client pointed at it. The result
goes straight into the `model` field of chapter 02's `LoopRunAgentConfig` or chapter 05's
`RuntimeDeps` — it is the same field, and nothing else in the agent changes.

For a local run, two settings from chapter 05 stop being optional: `pinnedDecoding({ maxOutputTokens })`
(an uncapped local generation measured 8.7k tokens over 302 s) and `stopOnRepeatedToolCall: true`
(a small model that repeats a call is stuck, not thinking).

```ts
/** The options, authored. `autoDownload` defaults to FALSE — a multi-GB download is consent-first. */
export const DEV_LOCAL_OPTIONS: LocalModelOptions = {
  autoStart: true,
  autoDownload: true, // dev convenience, sensible for the 4B only
  timeoutMs: 120_000,
};
```
<sub>excerpt · `snippets/06-advanced.ts`</sub>

### 2.4 `localModelStatus` — the "why isn't it working" step

```
$ npx looprun models status
qwen3.5-4b — Small-RAM tier (8–16 GB): ~2.9 GB weights. Best for simple/few-tool agents and local smokes.
  binary : ~/llamacpp-b9967/bin/llama-server
  model  : ~/models/qwen35-gguf/Qwen3.5-4B-UD-Q4_K_XL.gguf
  server : down (looprun models serve qwen3.5-4b)

qwen3.6-35b-ram24 — 24 GB-machine tier (DEFAULT): UD-IQ2_XXS + baked MTP head (11.8 GB), peak RSS ~20.7 GB. 88.9% certified eval — ties the 21 GB Q4 record — at ~56 tok/s decode.
  binary : ~/llamacpp-b9967/bin/llama-server
  model  : ~/models/qwen36-mtp-gguf/Qwen3.6-35B-A3B-UD-IQ2_XXS.gguf
  server : down (looprun models serve qwen3.6-35b-ram24)
```
<sub>**real** — `node packages/looprun/bin/looprun.mjs models status` on the machine this chapter was
written on; absolute home paths shortened to `~`. A machine without the weights prints the missing
line plus the exact command that fixes it</sub>

The library form answers the same three questions in code:

```ts
/** "Why isn't it working": binary found? file on disk? server up? Three answers, no model call. */
export async function whyIsLocalNotWorking(alias = 'qwen3.5-4b'): Promise<string[]> {
  const status = await localModelStatus(alias);
  return [
    `runtime  ${status.runtime}`,
    `binary   ${status.binary.ok ? status.binary.path : `MISSING — ${status.binary.note ?? 'install llama.cpp (≥ b9780) and/or set $LLAMA_BIN'}`}`,
    `weights  ${status.modelFile.exists ? status.modelFile.path : `MISSING — npx looprun models pull ${alias}`}`,
    `server   ${status.server.up ? `up at ${status.server.baseURL}` : 'down'}`,
  ];
}
```
<sub>excerpt · `snippets/06-advanced.ts`</sub>

### 2.5 The seam: `resolveAlias`, `LocalModelSpec`, `LlamaCppRuntime`, `ModelRuntimePort`

```ts
export const RAM24: LocalModelSpec = resolveAlias('ram24');
export const llamaCpp: ModelRuntimePort = new LlamaCppRuntime();
```
<sub>excerpt · `snippets/06-advanced.ts` — the two declarations, with their doc comments elided</sub>

```ts
function resolveAlias(alias: string): LocalModelSpec        // throws, naming the known aliases

interface LocalModelSpec {
  alias: string; note: string;
  file: string; defaultDir: string; envVar: string;   // where the GGUF lives (env var overrides)
  hfRepo: string; approxSizeGB: number;               // where it comes from, and how big
  kv: 'q8_0' | 'f16'; ctx: number; cacheRamMiB: number; port: number;   // the measured profile
  servedId: string;                                   // the id the OpenAI-compatible client sends
  specType?: string;                                  // 'draft-mtp' where a trained head is baked in
}

interface ModelRuntimePort {
  readonly id: string;
  status(spec: LocalModelSpec): Promise<RuntimeStatus>;
  ensureModel(spec, opts?): Promise<string>;          // download when allowed; else an actionable throw
  ensureServer(spec, opts?): Promise<EnsureServerResult>;   // { baseURL, alreadyRunning, stop() }
}
```
<sub>signatures, from `looprun/models`</sub>

`LlamaCppRuntime` is the shipped implementation of that port: it finds the binary, ensures the model
file, spawns `llama-server` with the flags of §2.1, health-waits, and hands back the base URL. A
second runtime — an MLX server, ollama, vllm, or a process someone else already owns — implements the
same three methods and plugs in unchanged:

```ts
export const alreadyServedRuntime: ModelRuntimePort = {
  id: 'already-running',
  status: async (spec: LocalModelSpec) => ({
    runtime: 'already-running',
    binary: { path: null, ok: true, note: 'someone else owns the process' },
    modelFile: { path: spec.file, exists: true },
    server: { up: true, baseURL: `http://127.0.0.1:${spec.port}/v1` },
  }),
  ensureModel: async (spec: LocalModelSpec) => spec.file,
  ensureServer: async (spec: LocalModelSpec) => ({
    baseURL: `http://127.0.0.1:${spec.port}/v1`,
    alreadyRunning: true,
    stop: async () => {},
  }),
};
```
<sub>excerpt · `snippets/06-advanced.ts` — pass it as `localModel('qwen3.5-4b', { runtime })`; aliases,
the consent flow and the agent side are untouched</sub>

> **Local models come after certification.** Chapter 05's discipline stands: a run against a
> `localhost` base-url is an informational smoke, not a gate.

---

## 3. Native tools and MCP — when the tools execute themselves

Chapter 03 taught **Path A**: JSON-schema `toolDefs` executed through a world you hand-write. It is
the certified path and the one to reach for.

**Path B** is the other execution model — tools that execute themselves: Mastra assigned tools,
toolsets, or an MCP server.

```ts
import { MCPClient } from '@mastra/mcp'
import { LoopRunAgent } from 'looprun/mastra'

const mcp = new MCPClient({ servers: { crm: { url: new URL('https://crm.example/mcp') } } })

new LoopRunAgent({
  spec,                          // its surface must list crm_createLead — see below
  tools: await mcp.listTools(),  // native tools — mutually exclusive with world + toolDefs
  stateView,                     // optional: state reads for stateful guards + contract.stateBlock
  model: 'google/gemini-3.1-flash-lite',
})
```
<sub>illustrative — needs `@mastra/mcp` and a live server, so it is not in the compiled snippets</sub>

> **The first-run failure, and it catches almost everyone.** `listTools()` returns tools **namespaced
> by server**: a `createLead` tool on the `crm` server arrives as `crm_createLead`. And the spec
> surface is **deny-by-default** in native-tools mode:
>
> ```
>    a surface tool the host does NOT provide   →  construction THROWS, naming the tool
>    a host tool the surface does NOT list      →  never registered, never active;
>                                                  one loud console.error names the exclusions
> ```
>
> So `tools: ['createLead']` in the spec fails both ways at once: it throws for the tool the host
> "does not provide", and logs the exclusion of the one it does. Declare the **namespaced** name:
> `tools: ['crm_createLead']`. Governance being visible rather than silent is the point — a spec
> that promises a capability the host lacks is a broken bundle, not a warning.

The governance itself does not change. Mastra applies agent hooks to every tool source, so the veto
binds to an MCP tool with zero extra wiring: the model emits the call → the `preTool` guards run → a
denial returns as the governance veto envelope (chapter 01 §4) and the model retries → otherwise the
MCP tool's own `execute` performs the remote request → `postTool` records the verified outcome.

### `worldFromTools` + `StateView` — state without execution

What Path B lacks is a world, and two things still want state: guards that read domain state, and
`contract.stateBlock`. That is `worldFromTools`'s only job.

```ts
export const calendarStateView: StateView = {
  snapshot: () => cachedEvents,
  clashesWith: (start: string, end: string) => cachedEvents.filter((e) => e.start < end && start < e.end),
  async refresh() {
    cachedEvents = await fetchCalendar();
  },
};

/** The synthesized world: state reads work, `exec` throws — the tools already execute themselves. */
export const nativeWorld: AgentWorld = worldFromTools({ stateView: calendarStateView });
```
<sub>excerpt · `snippets/06-advanced.ts`</sub>

```ts
interface StateView {
  refresh?(): void | Promise<void>;   // called at every turn boundary
  [k: string]: any;                   // your accessors and values
}

function worldFromTools(opts: { stateView?: StateView } = {}): AgentWorld
```
<sub>signatures, from `looprun/mastra`. Both the argument and the `stateView` are optional — a world
with no state view still supplies the seam, and every state read on it is then `undefined`</sub>

**`worldFromTools` does not build a world from plain functions.** It synthesizes a world whose `exec`
**throws** if anything calls it:

```
looprun: world.exec("addEvent") called in native-tools mode — domain tools execute
themselves; only the runtime-owned terminal tools should reach the world.
```

That throw is the design: in Path B the tools already execute elsewhere, so a call reaching the world
means the wiring is wrong. Every property of the `StateView` except `refresh` is copied onto the
world with functions bound, so `contract.stateBlock` and stateful guards read it exactly as they
would read a hand-written world — which is also why chapter 03 §7's **structural** cast is the right
one here: there is no class to name.

What needs a `stateView`, and what does not:

| guards | need a `stateView`? |
|---|---|
| everything keyed on the ledger of recorded calls — `requiresBefore`, `noDuplicateCall`, `destructiveThrottle`, `maxCalls`, the argument guards, reply checks over observed activity — plus `confirmFirst` and `valueFromUser`, which read the consent and the user's own words off the ctx | **no.** The hooks feed the ledger and the runtime seats the rest; it is there either way |
| `precondition` and custom guards that read *domain* state, and `contract.stateBlock` | **yes** — those accessors have to come from somewhere |

> **`refresh()` is fire-and-forget.** `advanceTurn()` calls it as `void view.refresh?.()` — it does
> not await. An **async** `refresh` is therefore still in flight while `contract.stateBlock` renders,
> so the turn can be prompted with the *previous* turn's state. And `advanceTurn()` fires *between*
> turns, so **turn 0 renders on a view that was never refreshed at all** — whatever the view held at
> construction is what the first prompt sees. If your state must be current at render time, either
> keep `refresh` synchronous over an already-warm cache, or refresh outside the agent before calling
> `generate()`. This is a real seam, not a rounding error, on any remote-backed `StateView`.

---

## 4. Recap

```
   createModelServer   config → { url, port, handler, close() }   the governed agent as a "model"
   ModelServerConfig   agents · port · apiKey · resolveSession · sessionTtlMs · onTurn
   ModelServer         the handle — `handler` embeds in any fetch-style framework
   TurnEvent           model · sessionId · meta (corrections, violations, observed)

   localModel          alias → a ready AI-SDK client: file ensured, server up, health-waited
   LocalModelOptions   runtime · autoStart · autoDownload (FALSE by default) · timeoutMs
   resolveAlias        alias → LocalModelSpec, or a throw naming the known aliases
   LocalModelSpec      the measured profile: file · kv · ctx · cacheRam · port · servedId · specType
   LlamaCppRuntime     the shipped runtime: binary, weights, spawn, health-wait
   ModelRuntimePort    the seam a second runtime implements — three methods
   localModelStatus    binary / file / server, before you blame the model

   worldFromTools      native-tools mode ONLY — state reads; `exec` THROWS
   StateView           those state reads; `refresh()` runs per turn, fire-and-forget
```

That is the tutorial: the concepts (01), a governed turn (02), the anatomy (03), the catalog (04),
the measured loop (05), and the three places the same spec goes next. Everything looprun exports in
public is taught in one of those six chapters — and anything that is not taught is not public.

**Where next.** [`docs/benchmarks.md`](../benchmarks.md) has the measured numbers and the harness
they came from. [`examples/hermes-sim`](../../examples/hermes-sim) is the served path against a real
external harness. [`CONTRIBUTING.md`](../../CONTRIBUTING.md) is where a new guard goes, catalog entry
and all. And writing the bundle by hand is not the only path: the **agentspec** skill (private beta)
generates the specs, the contract, the tool world and the eval set from one purpose sentence — see
the [root README](../../README.md).

← **[05 · Running and eval](05-running-and-eval.md)** · **[Back to 01 · Concepts](01-concepts.md)**
