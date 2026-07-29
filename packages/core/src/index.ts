/**
 * @looprun-ai/core — the PUBLIC API.
 *
 * This barrel is the tutorial contract, nothing more: every symbol below is taught by a chapter of
 * `docs/tutorial/` (chapters 03, 04 and 05 own the core rows of the placement table in
 * `docs/tutorial/00-outline.md` §4). A concept the tutorial does not teach is not exported here.
 *
 * Everything else that used to live on this barrel is still available, unchanged, from
 * `@looprun-ai/core/internal` — the sibling-package and fork-author seam (spec binding resolution,
 * the trunk renderer, the ledger, the terminal protocol, the prompt renderer, the governed-turn
 * machine). That subpath carries no compatibility promise.
 */

// ── Chapter 03 · agent anatomy ───────────────────────────────────────────────
export { AgentSpecBase } from './spec.js';
export type {
  AgentSpec,
  AgentSpecConfig,
  AgentScope,
  TerminalPolicy,
  Hook,
  ToolTarget,
} from './spec.js';
export type { AgentWorld } from './rules.js';
export type { DomainContract } from './trunk.js';
export type { ToolDef } from './runtime/types.js';
export { validateSpec } from './validate.js';

// ── Chapter 04 · guards ──────────────────────────────────────────────────────
// The vocabulary…
export type { Guard, GuardCtx, ObservedCall, Dim } from './rules.js';
// …and the catalog.
export {
  custom,
  requiresBefore,
  forbidThisTurn,
  argRequired,
  argAbsent,
  argFormat,
  precondition,
  maxCalls,
  canonArgs,
  noDuplicateCall,
  confirmFirst,
  noActAfterAskSameTurn,
  destructiveThrottle,
  resultInvariant,
  noFabricatedSuccess,
  replyMustMention,
  replyMaxOccurrences,
  replySingleQuestion,
  replyConfirmsLabels,
  emptyReply,
  degenerationGuard,
  pendingConfirmMustAsk,
  destructiveClaimRequiresSuccess,
  noFalseFailureClaim,
  minimalDisclosure,
  noInstructionFromData,
  noCompetitorClaim,
  noOutOfSurfaceActionClaim,
  noUngroundedRegulatedFigure,
  consentRequired,
  jargonScrub,
} from './guards.js';

// ── Chapter 05 · running and eval ────────────────────────────────────────────
export type { TurnInput, TurnRecord, RunResult } from './runtime/types.js';
export { geminiThinkingOff, pinnedDecoding } from './model-params.js';
