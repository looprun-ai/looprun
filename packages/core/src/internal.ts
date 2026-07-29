/**
 * `@looprun-ai/core/internal` — the seam, not the API.
 *
 * Every symbol here carries the `internal` verdict in
 * `docs/superpowers/specs/2026-07-28-symbol-inventory.md` §7.1: it has a consumer, but no tutorial
 * chapter teaches it, so by the contract principle it may not sit on the public barrel
 * (`docs/tutorial/00-outline.md` §0).
 *
 * Two audiences:
 *   1. the sibling packages (`@looprun-ai/mastra`, `/eval`, `/server`, `/models`) that implement the
 *      loop this package deliberately does not own;
 *   2. fork and benchmark authors driving the governed turn themselves — the "bring your own loop"
 *      seam (outline §6, decision 3): ledger + terminal protocol + prompt renderer + turn machine.
 *      Closing that loop needs all four, which is exactly why the seam stays whole here instead of
 *      being taught in pieces.
 *
 * NO COMPATIBILITY PROMISE. This subpath moves with the implementation; only `.` is stable.
 */

// Guard-catalog classification tables (consumed by @looprun-ai/eval's linters).
export { DENY_ONLY_PROSE_KINDS, CONFIRM_CLASS_KINDS, ARMED_SEAMS } from './guards.js';

// Spec binding resolution — how a backend turns a spec's guard bindings into runnable guards.
export { resolveGuards } from './spec.js';
export type { GuardBinding } from './spec.js';

// The scoped trunk renderer — the bytes a spec's system prompt is made of.
export { renderScopedSpecTrunk } from './trunk.js';

// Model call settings.
export { normalizeModelParams, resolveModelSettings } from './model-params.js';

// The governed-turn machine ────────────────────────────────────────────────────
export type { TokenUsage, RuntimeTurnRecord } from './runtime/types.js';

export {
  createLedger,
  beginTurn,
  resultOk,
  recordToolResult,
  recordTerminal,
  recordTerminalCall,
  pruneSupersededTerminals,
  vetoStormHit,
} from './runtime/ledger.js';
export type { TurnLedger } from './runtime/ledger.js';

export {
  isTerminal,
  terminalProtocol,
  forcedTerminalPrompt,
  terminalToolDefs,
  normalizeTerminalToolDef,
  prematureTerminalTools,
  supersededTerminalCalls,
} from './runtime/terminal.js';

// The single owner of the bytes a turn sends — drivers AND offline instruments render through this
// one function, so an instrument can never report on a prompt nothing runs.
export { renderTurnPrompt } from './runtime/prompt.js';

export {
  evaluatePreTool,
  evaluateOnInput,
  enforcePostTool,
  redriveMessage,
  defaultExhaustionReply,
  finalizeReply,
  governanceVeto,
  runChainCompletionPass,
} from './runtime/turn.js';
export type { ReplyViolation, FinalizedReply } from './runtime/turn.js';
