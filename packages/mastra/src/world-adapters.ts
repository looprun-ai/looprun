/**
 * @looprun-ai/mastra — world adapters for NATIVE-TOOLS mode (including MCP).
 *
 * In native-tools mode the tools execute themselves (Mastra assigned tools, toolsets, or
 * `@mastra/mcp` MCPClient tools) and guards are enforced through the agent hooks; the world seam
 * is needed only for STATE: stateful guards (`precondition`, custom world reads) and
 * `theme.stateBlock`. A `StateView` supplies those reads; `refresh` (if given) runs at each
 * turn boundary so remote state can be re-fetched.
 *
 * Ledger-based guards (requiresBefore, noDuplicateCall, confirmFirst, maxCalls, …) need
 * NO state view — they read the observed ledger the hooks feed.
 */
import type { AgentWorld } from '@looprun-ai/core';

/** Domain state reads for guards + theme.stateBlock (backed by your API / MCP resources / cache). */
export interface StateView {
  /** Called at each turn boundary (advanceTurn) — re-fetch remote state here if needed. */
  refresh?(): void | Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

/** Synthesize an AgentWorld for native-tools mode: state from `stateView`, execution by the tools. */
export function worldFromTools(opts: { stateView?: StateView } = {}): AgentWorld {
  const view = opts.stateView ?? {};
  const world: AgentWorld = {
    exec: (name: string) => {
      throw new Error(
        `looprun: world.exec("${name}") called in native-tools mode — domain tools execute themselves; ` +
          'only the runtime-owned terminal tools should reach the world.',
    );
    },
    advanceTurn: () => {
      void view.refresh?.();
    },
    ingestAttachment: (url: string) => url,
    toolCalls: [],
    sseActions: [],
  };
  for (const [k, v] of Object.entries(view)) {
    if (k === 'refresh') continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (world as any)[k] = typeof v === 'function' ? v.bind(view) : v;
  }
  return world;
}
