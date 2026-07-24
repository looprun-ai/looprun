/**
 * @looprun-ai/core — public API.
 *
 * AgentSpec (the map) + typed deterministic guards (the safety kit) + the scoped trunk renderer +
 * the backend-agnostic governed-turn machine (the GPS). Framework backends live in sibling
 * packages (@looprun-ai/mastra, …).
 */
export * from './rules.js';
export * from './guards.js';
export {
  AgentSpecBase,
  resolveBindings,
  resolveGuards,
  resolveMutators,
} from './spec.js';
export type {
  AgentSpec,
  AgentSpecConfig,
  AgentControls,
  AgentScope,
  AgentModelRef,
  ChainSpec,
  GuardBinding,
  MutatorBinding,
  StateDirective,
  TerminalPolicy,
  ToolSchemaLike,
  Hook,
  ToolTarget,
  Layer,
} from './spec.js';
export { renderScopedSpecTrunk, renderTrunkBlocks, chainOrder } from './trunk.js';
export type { DomainContract, TrunkRenderOptions } from './trunk.js';
/** @deprecated compat alias for the pre-rename name — see trunk.ts. */
export type { TrunkTheme } from './trunk.js';
// Trunk PROVENANCE + the coherence queries (the trunk is a fold over an attributed table, not a join).
export {
  GUARD_KIND_SUBJECT, derivePolarity, deriveSubject, foldRow, foldTrunk, trunkLines,
  findContradictions, findDuplications, findMultiOwnerSubjects, findSubjectlessLines,
  findUnassessableLines, isSingleClause,
  DEFAULT_POLARITY_LEXICON, withPolarityLexicon, mutatorLines,
} from './coherence.js';
export type {
  TrunkLine, TrunkRow, TrunkBlock, TrunkPolarity, SubjectRule, NormativeLine,
  ContradictionFinding, DuplicationFinding, SingleOwnerFinding,
  PolarityLexicon, MutatorBindingLike,
} from './coherence.js';
export { validateSpec, MAX_TOOL_SURFACE } from './validate.js';
export type { SpecWarning } from './validate.js';
export { geminiThinkingOff, pinnedDecoding, normalizeModelParams, resolveModelSettings } from './model-params.js';
export type { SamplingSettings } from './model-params.js';

// The governed-turn machine (framework-free) — consumed by backends.
export type { ToolDef, TokenUsage, TurnInput, TurnRecord, RunResult, RuntimeTurnInput, RuntimeTurnRecord } from './runtime/types.js';
export { createLedger, beginTurn, resultOk, recordVeto, recordToolResult, recordTerminal, recordTerminalCall, vetoStormHit, VETO_STORM_LIMIT } from './runtime/ledger.js';
export type { TurnLedger, PostToolViolation } from './runtime/ledger.js';
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
  enforcePostTool,
  redriveMessage,
  defaultExhaustionReply,
  finalizeReply,
  shouldFireChain,
  runChainCompletionPass,
} from './runtime/turn.js';
export type {
  PreToolVerdict,
  ReplyViolation,
  FinalizedReply,
  PostToolEnforcement,
  ChainPassCtx,
  ChainPassResult,
} from './runtime/turn.js';
