/**
 * @looprun-ai/vercel — RESERVED backend slot (not implemented in v0).
 *
 * The seam contract a backend implements (everything else lives framework-free in @looprun-ai/core):
 *   1. Tool wiring with a pre-call veto — run `evaluatePreTool` before each tool executes and
 *      short-circuit with the correction as the tool result; feed `recordToolResult` after.
 *   2. A generate loop honoring the terminal protocol — `toolChoice:'required'`, a stop condition
 *      on terminal calls (`isTerminal`), and the forced-terminal fallback.
 *   3. Reply finalization via `finalizeReply` with a bounded NO-TOOLS re-generate callback —
 *      never a framework-level retry that re-runs side-effecting tools.
 *   4. The STRUCTURED terminal: ship `terminalToolDefs()` / `normalizeTerminalToolDef` AS
 *      AUTHORED — `did` keeps `minItems: 1` and every field keeps its description, because the
 *      intention vocabulary and the `inform` guardrail ARE the honesty forcing function (a
 *      schema converter that drops descriptions silently deletes the protocol). Read the payload
 *      through `respondPayload` — `message` + `did`, never a reply-text field and never a boolean
 *      `asked` flag: an intention to ask is one of the `did` entries, nothing else.
 *   5. Prune the terminals the user never saw, in the SAME place the delivery is invalidated:
 *      `pruneSupersededTerminals(ledger, prematureTerminalCalls(steps))` for a terminal that shared
 *      its step with a domain call, and the same call with `supersededTerminalCalls(steps)` for the
 *      losers of a within-step delivery contest. Skipping either leaves an `ask` intention in
 *      `observed` that licenses a consent guard off a question that was never delivered.
 *
 * WORLD-SIDE OBLIGATION a backend author must relay to a domain: a write result must NAME what it
 * touched, under a singular IDENTITY KEY (`id`, `label`, `<entity>Id`, `<entity>_id`) — that key scope is
 * the whole identity set, whatever the value's type, so `{ orderIds: [5,6] }`, a bare scalar result and
 * `{ ORDER_ID: 5 }` name nothing. The comparison is WHOLE-VALUE equality after canonicalization, so the
 * value must EQUAL the entity name the agent will report: an id embedded in a longer label matches
 * nothing (`{ label: 'Order 5' }` grounds a target of `'Order 5'`, never of `'5'`). A write the
 * cross-check cannot match is a write no claim can cover, and the turn fails closed into the engine
 * closure (see `packages/core/GUARDS.md`).
 */
import type { AgentSpec, AgentWorld, ToolDef, DomainContract } from '@looprun-ai/core';

export interface VercelBackendConfig {
  spec: AgentSpec;
  contract?: DomainContract;
  world: AgentWorld;
  toolDefs?: ToolDef[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
}

export function createLoopRunAgent(_config: VercelBackendConfig): never {
  throw new Error('@looprun-ai/vercel: not implemented — the v0 backend is @looprun-ai/mastra.');
}
