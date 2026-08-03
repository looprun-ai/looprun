/**
 * `@looprun-ai/core/internal` — the seam, not the API.
 *
 * Every symbol here carries the `internal` verdict in
 * `docs/superpowers/specs/2026-07-28-symbol-inventory.md` §7.1: it has a consumer, but no tutorial
 * chapter teaches it, so by the contract principle it may not sit on the public barrel
 * (`docs/superpowers/specs/2026-07-28-tutorial-outline-final.md` §0).
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
export { DENY_ONLY_PROSE_KINDS, CONFIRM_CLASS_KINDS, ARMED_SEAMS } from './guards/catalog.js';

/**
 * The guard vocabulary as DATA — one entry per exported factory (summary / when-to-use / example).
 * Documentation infrastructure, not agent-authoring vocabulary: the tutorial's guard chapter is
 * GENERATED from it, so it sits on the seam rather than on the public barrel (outline §6, decision 4).
 * `test/guard-catalog-parity.test.ts` keeps it in bijection with `src/guards/`.
 */
export { GUARD_CATALOG } from './guards/catalog.js';
export type { GuardCatalogEntry } from './guards/catalog.js';

// Spec binding resolution — how a backend turns a spec's guard bindings into runnable guards.
export { resolveGuards } from './spec.js';
export type { GuardBinding } from './spec.js';

// The scoped trunk renderer — the bytes a spec's system prompt is made of.
export { renderScopedSpecTrunk } from './trunk.js';

// Model call settings.
export { normalizeModelParams, resolveModelSettings } from './model-params.js';

// The declarative world builder. Seam, not taught API: its audience is the
// agentspec generator (which emits the WorldSpec literal) and hosts/fork authors wiring a world —
// exactly the same audience as the governed-turn machinery below, and NO tutorial chapter teaches
// it yet (3b finalizes the world.json form). AgentWorld the TYPE stays on the public barrel;
// defineWorld the BUILDER lives here until the world chapter lands.
export { defineWorld, compileFormula, FormulaError } from './world/index.js';
export type {
  WorldSpec, WorldFactory, BuiltWorld, WorldCall, AuditEntry, EntityDecl, ArgDecl, Gate, ToolDecl,
  ReadResult, CreateResult, TransitionResult, PresetDelta, DefineWorldOptions, CustomExecutor, CustomCtx, CustomResult,
  ScalarType, FieldType, CompiledFormula,
} from './world/index.js';

// The governed-turn machine ────────────────────────────────────────────────────
export type { TokenUsage, RuntimeTurnRecord } from './runtime/types.js';

export {
  createLedger,
  beginTurn,
  resultOk,
  recordToolResult,
  recordTerminal,
  recordTerminalCall,
  recordTurnHistory,
  pruneSupersededTerminals,
  clearDeliveredTerminal,
  vetoStormHit,
} from './runtime/ledger.js';
export type { TurnLedger } from './runtime/ledger.js';

// The structured-claim RENDERER + ledger derivation: the engine renders the user-facing
// operation report from the VERIFIED `did`, and derives the true claims from the ledger for the
// exhaustion closure. Backends consume both; `RespondPayload`/`RenderOpts` ride finalizeReply's/the
// renderer's signature so a declaration:true consumer can name them.
export {
  renderOperationReport,
  deriveClaimsFromLedger,
  respondPayload,
  terminalPayloadRejection,
  // The shadow-law assertion, exported so the CONFIG path can enforce it at its own door and report
  // it as a path-qualified load error: `packages/eval`'s loader builds a
  // contract-less spec, so the spec constructor's call site never sees its `outcomes` block. The guard
  // factories assert it too — this is the loader's earlier, better-worded gate, not the only one.
  assertNoCoreOutcomeShadow,
  hasAskIntent,
  isSpeechOp,
  isActionOp,
  SPEECH_OPS,
} from './runtime/claims.js';
export type { RespondPayload, RenderOpts, Intention, SpeechOp } from './runtime/claims.js';

export {
  isTerminal,
  terminalProtocol,
  forcedTerminalPrompt,
  terminalToolDefs,
  normalizeTerminalToolDef,
  prematureTerminalTools,
  prematureTerminalCalls,
  supersededTerminalCalls,
  lastTerminalArgs,
} from './runtime/terminal.js';

// The single owner of the bytes a turn sends — drivers AND offline instruments render through this
// one function, so an instrument can never report on a prompt nothing runs.
export { renderTurnPrompt } from './runtime/prompt.js';

export {
  evaluatePreTool,
  evaluateOnInput,
  enforcePostTool,
  redriveMessage,
  finalizeReply,
  governanceVeto,
  runChainCompletionPass,
  assertAdjudicatorPresent,
  specInstallsLlmCheck,
} from './runtime/turn.js';
export type { ReplyViolation, FinalizedReply } from './runtime/turn.js';

/**
 * The ATTRIBUTED guard failure — thrown at the consumer when a guard's `check()`/`prose()` throws
 * (an author bug, never swallowed and never converted into a deny; see `spec.ts#attributeGuard`).
 * The runtime throws it across the package boundary, so it must be reachable from some entry point
 * to be caught by class. Placed here by controller ruling, and it STAYS here:
 * chapter 04's custom-guard section MENTIONS it (the diagnostic naming the broken binding) without
 * teaching it as API — the intended reaction to a throwing guard is to fix the guard, not to catch
 * the error — so it is not a taught symbol and does not go on the public barrel (outline §6, #8).
 */
export { GuardExecutionError } from './rules.js';

// ── Type-closure riders — same rule as the public barrel's ───────────────────
// The types reachable from the signatures above that NO entry point would otherwise name. The ones
// the closure also reaches through `@looprun-ai/core` (`AgentSpec`, `AgentWorld`, `Guard`,
// `GuardCtx`, `ToolDef`, `AgentControls`, `Layer`, …) are nameable from there and are not repeated.
export type { PreToolVerdict, GovernanceVeto, PostToolEnforcement, ChainPassCtx, ChainPassResult } from './runtime/turn.js';
export type { PostToolViolation } from './runtime/ledger.js';
export type { TurnPrompt, TurnPromptInput } from './runtime/prompt.js';
