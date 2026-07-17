# @looprun-ai/server

Expose governed [LoopRun](https://looprun.ai) agents behind an **OpenAI-compatible endpoint** —
the "agent-as-model" pattern. Any harness that can point a custom provider at a `base_url`
(personal-agent frameworks, Open WebUI, IDE assistants, plain OpenAI SDKs) calls a governed agent
as if it were a model: the full governed turn (guards → tools → redrive) runs inside each
`/v1/chat/completions` request and returns one final assistant message.

```ts
import { createModelServer } from '@looprun-ai/server';
import { LoopRunAgent } from '@looprun-ai/mastra';

const agent = new LoopRunAgent({ spec, world: worldFactory, toolDefs, model });
const server = await createModelServer({ agents: { 'inbox-triage': agent }, port: 8099 });
console.log(server.url); // http://127.0.0.1:8099/v1
```

Point the harness at it:

```yaml
# e.g. a harness config.yaml
model:
  provider: custom
  base_url: "http://127.0.0.1:8099/v1"   # model field selects the agent: "inbox-triage"
  context_length: 128000
```

## The mapping law (what the facade does with the incoming request)

The server implements the protocol as a **facade** — the harness believes it is talking to a
model, so parts of the request that would fight the spec are deliberately not honored:

| Incoming | Treatment | Why |
|---|---|---|
| `model` | routes to the registered agent | one server, N agents as N "models" |
| last `user` message | the governed turn's input | the agent's own session is the canonical memory |
| earlier history | **ignored** (transport-only) | harnesses compress/rewrite it; replay would desync the governed state |
| `system` message | **discarded** | the AgentSpec renders its own trunk (byte-stable, cache-friendly) |
| `tools`, `tool_choice` | **ignored** | the spec owns the tool surface; guards govern every call |
| `temperature` etc. | **ignored** | `spec.controls.sampling` governs |
| `stream: true` | honored (see below) | |

## Sessions

The protocol is stateless; the agent is stateful. Session id resolution, first hit wins:

1. `x-looprun-session` header (explicit — always safe; OpenAI SDKs support `default_headers`),
2. the OpenAI-standard `user` field,
3. fingerprint fallback: hash of `model` + the **first** user message — stable for a conversation
   unless the harness compresses that message away (mitigated by the high `context_length`
   reported by `/v1/models`). A changed fingerprint starts a fresh session: degraded, never unsafe.

Concurrent requests on the same session serialize; different sessions run concurrently.
Optional `sessionTtlMs` evicts idle sessions via `agent.endSession()`.

## Streaming

`stream: true` still runs the governed turn to completion (streaming cannot be governed at the
reply level), then emits a valid SSE stream: an immediate role delta, `: keepalive` comments while
the turn runs, one content delta with the full governed text, a finish chunk, `[DONE]`.

## Observability

Every response carries a non-standard `looprun` field (`sessionId`, `turnIndex`, `corrections`,
`exhausted`, `violations`) — OpenAI SDKs ignore it; integration harnesses can assert on it.
`onTurn` fires server-side after every governed turn with the same metadata.

## API

- `createModelServer(config) → { url, port, handler, close() }` — node:http server, ephemeral
  port by default.
- `createOpenAiHandler(config) → (req: Request) => Promise<Response>` — the bare fetch-style
  handler (embed it in any web server).
- `config`: `agents` (model id → `LoopRunAgent`), `port`, `hostname`, `contextLength`,
  `apiKey` (optional bearer check), `resolveSession`, `sessionTtlMs`, `onTurn`.
