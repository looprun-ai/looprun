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
  ChainSpec,
  GuardBinding,
  MutatorBinding,
  StateDirective,
  TerminalPolicy,
  Hook,
  ToolTarget,
  Layer,
} from './spec.js';
export { renderScopedSpecTrunk, renderTrunkBlocks, chainOrder } from './trunk.js';
export type { DomainContract, TrunkRenderOptions } from './trunk.js';
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
export { createLedger, beginTurn, resultOk, recordVeto, recordToolResult, recordTerminal, recordTerminalCall, pruneSupersededTerminals, vetoStormHit, VETO_STORM_LIMIT } from './runtime/ledger.js';
export type { TurnLedger, PostToolViolation } from './runtime/ledger.js';
export {
  TERMINAL_TOOLS,
  isTerminal,
  terminalProtocol,
  TERMINAL_PROTOCOL,
  TERMINAL_PROTOCOL_REPLY_ONLY,
  forcedTerminalPrompt,
  terminalToolDefs,
  normalizeTerminalToolDef,
  prematureTerminalTools,
  supersededTerminalCalls,
} from './runtime/terminal.js';
// The single owner of the bytes a turn sends — the drivers AND the offline instruments render
// through this one function, so an instrument can never report on a prompt nothing runs.
export { renderTurnPrompt, uploadDisplayLabels, isReplyOnly } from './runtime/prompt.js';
export type { TurnPrompt, TurnPromptInput } from './runtime/prompt.js';
export {
  evaluatePreTool,
  evaluateOnInput,
  applyMutators,
  checkReply,
  enforcePostTool,
  redriveMessage,
  defaultExhaustionReply,
  finalizeReply,
  governanceVeto,
  shouldFireChain,
  runChainCompletionPass,
} from './runtime/turn.js';
export type {
  PreToolVerdict,
  GovernanceVeto,
  ReplyViolation,
  FinalizedReply,
  PostToolEnforcement,
  ChainPassCtx,
  ChainPassResult,
} from './runtime/turn.js';
