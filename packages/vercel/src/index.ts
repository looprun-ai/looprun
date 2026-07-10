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
 */
import type { AgentSpec, AgentWorld, ToolDef, TrunkTheme } from '@looprun-ai/core';

export interface VercelBackendConfig {
  spec: AgentSpec;
  theme?: TrunkTheme;
  world: AgentWorld;
  toolDefs?: ToolDef[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
}

export function createLoopRunAgent(_config: VercelBackendConfig): never {
  throw new Error('@looprun-ai/vercel: not implemented — the v0 backend is @looprun-ai/mastra.');
}
