# MCP & native tools

looprun agents take tools in two shapes. Guards enforce in BOTH — Mastra applies agent hooks to every
tool source, so the veto works on MCP tools with zero extra wiring.

## Path A — a deterministic world (`world` + `toolDefs`)

The certified path (and what the agentspec skill generates): JSON-schema `toolDefs` executed through
`world.exec(name, args)`. The world is also the STATE source for stateful guards and the theme's
`stateBlock`. Use a factory for multi-conversation hosts:

```ts
new LoopRunAgent({ spec, world: (sessionId) => makeWorld('default'), toolDefs: TOOL_DEFS, model })
```

## Path B — native Mastra tools, including MCP

Pass tools that execute themselves — e.g. from `@mastra/mcp`:

```ts
import { MCPClient } from '@mastra/mcp'
import { LoopRunAgent } from 'looprun/mastra'

const mcp = new MCPClient({ servers: { crm: { url: new URL('https://crm.example/mcp') } } })

new LoopRunAgent({
  spec,
  tools: await mcp.getTools(),   // native tools — mutually exclusive with world+toolDefs
  stateView,                     // optional: state reads for stateful guards + theme.stateBlock
  model: 'openai/gpt-5.5',
})
```

How a call flows: the LLM emits a tool call → looprun's `beforeToolCall` hook runs the spec's preTool
guards (deny ⇒ `{ proceed:false, output:{ success:false, error } }` — the model sees the correction and
retries) → the MCP tool's own `execute` performs the remote request → `afterToolCall` records the
verified outcome in the observed ledger → the result returns to the model.

### What needs a `stateView`

- **Nothing**, for ledger-based guards: `requiresBefore`, `noDuplicateCall`, `confirmFirst`,
  `destructiveThrottle`, `maxCallsPerTurn/Conversation`, arg guards, reply checks over observed
  activity — they read the ledger the hooks feed.
- **A `stateView`**, for `precondition`/custom guards that read domain state, and for the theme's
  `stateBlock`: an object exposing those accessor methods (backed by your API / MCP resources / a
  cache), with an optional `refresh()` looprun calls at each turn boundary:

```ts
const stateView = {
  plan: 'pro',
  imageQuotaRemaining: () => quotaCache.remaining,
  async refresh() { quotaCache = await api.quota() },
}
```

Under the hood `worldFromTools({ stateView })` synthesizes the world seam; domain tool execution never
touches it (only the runtime-owned terminal tools do).
