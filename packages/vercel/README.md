# @looprun-ai/vercel — reserved

The Vercel AI SDK backend for looprun is **not implemented yet**; the v0 backend is
[`@looprun-ai/mastra`](../mastra).

## The backend seam contract

A looprun backend is thin by design — every deterministic mechanic lives framework-free in
[`@looprun-ai/core`](../core) (`runtime/`). A new backend implements exactly three glue points:

1. **Tool wiring with a pre-call veto** — before a tool executes, run `evaluatePreTool(spec,
   ledger, world, tool, args)`; on deny, short-circuit the call and hand the model the correction
   as the tool result (the model retries within the same generation). After execution, feed
   `recordToolResult`. On the Vercel AI SDK this maps to wrapping `tool.execute` or using
   `prepareStep`.
2. **A generate loop honoring the terminal protocol** — `toolChoice: 'required'`, a stop condition
   when a terminal tool (`isTerminal`) is called, and the forced-terminal fallback
   (`forcedTerminalPrompt`) when the model ends without one.
3. **Reply finalization** — `finalizeReply(spec, theme, world, ledger, text, redrive, redrives)`
   with `redrive` = one bounded NO-TOOLS text re-generation. Never a framework retry that re-runs
   the whole generation (it re-executes side-effecting tools; measured ~100× slower).
