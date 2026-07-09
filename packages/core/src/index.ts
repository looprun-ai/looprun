/**
 * @looprun/core — public API.
 *
 * AgentSpec (the map) + typed deterministic guards (the safety kit) + the scoped trunk renderer +
 * the backend-agnostic governed-turn machine (the GPS). Framework backends live in sibling
 * packages (@looprun/mastra, …).
 */
export * from './rules.js';
export * from './guards.js';
export {
  AgentSpecMinimal,
  AgentSpecBase,
  AgentSpecFull,
  resolveBindings,
  resolveGuards,
  resolveMutators,
} from './spec.js';
export type {
  AgentSpec,
  AgentSpecConfig,
  AgentControls,
  AgentModelRef,
  GuardBinding,
  MutatorBinding,
  StateDirective,
  TerminalPolicy,
  ToolSchemaLike,
  Hook,
  ToolTarget,
  Layer,
} from './spec.js';
export { renderScopedSpecTrunk, chainOrder } from './trunk.js';
export type { TrunkTheme } from './trunk.js';
export { validateSpec, MAX_TOOL_SURFACE } from './validate.js';
export type { SpecWarning } from './validate.js';
export { geminiThinkingOff, pinnedDecoding } from './model-params.js';

// The governed-turn machine (framework-free) — consumed by backends.
export type { ToolDef, TokenUsage, TurnInput, TurnRecord, RunResult, RuntimeTurnInput, RuntimeTurnRecord } from './runtime/types.js';
export { createLedger, beginTurn, resultOk, recordVeto, recordToolResult, recordTerminal } from './runtime/ledger.js';
export type { TurnLedger } from './runtime/ledger.js';
export {
  TERMINAL_TOOLS,
  isTerminal,
  terminalProtocol,
  TERMINAL_PROTOCOL,
  TERMINAL_PROTOCOL_REPLY_ONLY,
  forcedTerminalPrompt,
  terminalToolDefs,
} from './runtime/terminal.js';
export {
  evaluatePreTool,
  evaluateOnInput,
  applyMutators,
  checkReply,
  redriveMessage,
  defaultExhaustionReply,
  finalizeReply,
} from './runtime/turn.js';
export type { PreToolVerdict, ReplyViolation, FinalizedReply } from './runtime/turn.js';
