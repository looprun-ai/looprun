/**
 * @looprun-ai/core — the PUBLIC API.
 *
 * THE CONTRACT. Every taught symbol below is claimed by a chapter of `docs/tutorial/` — chapters 03,
 * 04 and 05 own the core rows of the placement table in `docs/superpowers/specs/2026-07-28-tutorial-outline-final.md` §4. A concept
 * the tutorial does not teach is not taught here.
 *
 * WHERE THE REST WENT — three destinations, not one:
 *   · `@looprun-ai/core/internal` — the 37 symbols with an `internal` verdict: the specific backend
 *     seam (spec binding resolution, the trunk renderer, model settings, and the governed-turn
 *     machine: ledger + terminal protocol + prompt renderer + turn functions). Sibling packages and
 *     fork authors drive the loop through it. NO compatibility promise.
 *   · the type-closure riders at the bottom of this file — see the note there.
 *   · everything else (`renderTrunkBlocks`, `chainOrder`, `resolveBindings`, `TERMINAL_TOOLS`, the
 *     trunk's attributed table in `trunk-fold.ts`, …) is now MODULE-LOCAL: reachable from no entry
 *     point at all. What survives there is only what the exported entry points transitively need —
 *     the coherence query layer that once ran over the trunk table was removed, and the fold that
 *     produces the trunk's bytes lives on in `trunk-fold.ts`. Do not read a symbol's absence here as
 *     a promise that it still works elsewhere.
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
  llmCheck,
  askedEarlier,
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
  replyMustMention,
  replyMaxOccurrences,
  replySingleQuestion,
  replyConfirmsLabels,
  emptyReply,
  degenerationGuard,
  pendingConfirmMustAsk,
  consentRequired,
  jargonScrub,
} from './guards/index.js';

// ── Chapter 05 · running and eval ────────────────────────────────────────────
export type { TurnInput, TurnRecord, RunResult } from './runtime/types.js';
export { geminiThinkingOff, pinnedDecoding } from './model-params.js';

// ── Type-closure riders — exported, NOT taught ───────────────────────────────
// A pure type reachable from a taught signature must be nameable, or a consumer compiling with
// `declaration: true` fails with TS4023/TS2742 ("cannot be named without a reference to …") the
// moment it writes `export const w = validateSpec(spec)` or subclasses `AgentSpecBase`. So the
// contract carries a rider: the transitive type closure of the public value signatures ships as
// type-only exports. Riders are NOT part of the 89 taught symbols, get no tutorial chapter, and are
// not a licence to widen the surface — the list below is mechanically derived (see
// `test/proofs/surface-lock.test.ts`), and it shrinks as Tasks 5–6 shrink what the signatures touch.
// Recorded in `docs/superpowers/specs/2026-07-28-tutorial-outline-final.md` §7 and the inventory §9.
export type { SpecWarning } from './validate.js';
export type { SamplingSettings } from './model-params.js';
export type { ReplyMutator, SpatialEdge, HistoryTurn, HistoryToolCall, Adjudicator, AdjudicatorVerdict } from './rules.js';
export type { AgentControls, ChainSpec, StateDirective, GuardBinding, MutatorBinding, Layer } from './spec.js';
export type { TokenUsage } from './runtime/types.js';
