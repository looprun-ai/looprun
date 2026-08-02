/**
 * @looprun-ai/core — the typed guard-KIND library (framework-free).
 *
 * The guard vocabulary the agentspec skill authors. Each factory returns a {@link Guard}:
 * a deterministic `check()` (the machine gate) + an LLM-facing `prose()` (rendered into the trunk,
 * never read by the checker) — the prose+check pairing. Every predicate reads tool args / world
 * state / observed calls, NEVER the user text (the magnet firewall). The pure set is deterministic
 * by construction: no clock, no entropy, no network, no LLM call inside a check.
 *
 * DOMAIN-NEUTRALITY LAW (P8a, completed by P8b): this package is truly language- and label-scheme-neutral
 * — and carries no MEDIA concept and no narration language either. No generic guard carries a linguistic
 * regex (claim verbs, confirm-language) or a label scheme by default — those STRINGS/REGEXES live in the
 * business bundle's own lexicon and are passed back in as REQUIRED params (`noFabricatedSuccess(tool, {
 * claimRe, labelRe, verbClaimRe, banRe, refExists, reason })`, `degenerationGuard({ selfNarrationRe })`,
 * `pendingConfirmMustAsk({ askRe })`, `destructiveClaimRequiresSuccess(tools, { claimRe, askRe, offerRe,
 * exemptRe? })`, `noFalseFailureClaim({ claimRe })`). Media/label INPUT guards are a DOMAIN concern —
 * a domain authors them as `custom({ dim:'input' })` over its world's own accessors, never a runtime kind.
 * The runtime holds only the MECHANISM and the generic English prose. A domain-neutrality lint scans this
 * package for accented letters / language stems, so a re-introduced default fails CI.
 *
 * ONE KIND PER CATEGORY FILE, one import site. The categories are the tutorial's own sections
 * (`docs/superpowers/specs/2026-07-28-tutorial-outline-final.md` §4): flow · args · world · confirmation · honesty · reply · custom.
 * `catalog.ts` holds the same vocabulary as DATA (`GUARD_CATALOG`) plus the runtime's kind
 * classification registries; `shared.ts` holds the module-local helpers and is exported by nobody.
 */

export { custom } from './custom.js';
export { askedEarlier, confirmedNeedsEarlierProbe } from './structural.js';
export { requiresBefore, forbidThisTurn, maxCalls, canonArgs, noDuplicateCall } from './flow.js';
export { argRequired, argAbsent, argFormat } from './args.js';
export { precondition, resultInvariant, consentRequired } from './world.js';
export {
  confirmFirst,
  noActAfterAskSameTurn,
  destructiveThrottle,
  pendingConfirmMustAsk,
} from './confirmation.js';
export { llmCheck } from './llm-check.js';
export {
  noFabricatedSuccess,
  destructiveClaimRequiresSuccess,
  noFalseFailureClaim,
  noOutOfSurfaceActionClaim,
  noUngroundedRegulatedFigure,
  noCompetitorClaim,
} from './honesty.js';
export {
  replyMustMention,
  replyMaxOccurrences,
  replySingleQuestion,
  replyConfirmsLabels,
  emptyReply,
  degenerationGuard,
  minimalDisclosure,
  noInstructionFromData,
  jargonScrub,
} from './reply.js';

// The vocabulary as data + the runtime's own kind classification (read via `@looprun-ai/core/internal`).
export { GUARD_CATALOG, DENY_ONLY_PROSE_KINDS, CONFIRM_CLASS_KINDS, ARMED_SEAMS } from './catalog.js';
export type { GuardCatalogEntry } from './catalog.js';
