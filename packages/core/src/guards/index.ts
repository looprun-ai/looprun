/**
 * @looprun-ai/core — the typed guard-KIND library (framework-free).
 *
 * The guard vocabulary the agentspec skill authors. Each factory returns a {@link Guard}:
 * a deterministic `check()` (the machine gate) + an LLM-facing `prose()` (rendered into the trunk,
 * never read by the checker) — the prose+check pairing. A deterministic predicate reads tool args /
 * world state / observed calls; the ONE guard that reasons over conversation TEXT is `llmCheck`, whose
 * verdict is a host adjudicator's, never a closure-held pattern. The deterministic set is pure by
 * construction: no clock, no entropy, no network, no LLM call inside a check.
 *
 * NO-REGEX LAW (2026-08-02, full-context guards): NO guard FACTORY takes a RegExp-typed parameter.
 * Text judgment — claim language, confirm-language, PII/regulated/competitor patterns — is `llmCheck`'s
 * job (a trusted rubric answered by the host adjudicator). Structural jobs use structural signals
 * (`confirmFirst` / `pendingConfirmMustAsk` key on the ask INTENTION a delivered `respond` declares in its
 * `did` — `hasAskIntent` / `isAskEvent` — plus args equality, never on reply text). The former regex-param honesty/reply guards (`noFabricatedSuccess`, `destructiveClaimRequiresSuccess`,
 * `noFalseFailureClaim`, `noCompetitorClaim`, `noOutOfSurfaceActionClaim`, `noUngroundedRegulatedFigure`,
 * `minimalDisclosure`, `noInstructionFromData`) are DELETED — an author expresses those as `llmCheck`
 * rubrics. Media/label INPUT guards are a DOMAIN concern — `custom({ dim:'input' })` over the world's own
 * accessors. The runtime holds only the MECHANISM and the generic English prose; a grep-gate
 * (guards-purity.test.ts) fails CI on any re-introduced RegExp-typed factory param.
 *
 * ONE KIND PER CATEGORY FILE, one import site. The categories are the tutorial's own sections
 * (`docs/superpowers/specs/2026-07-28-tutorial-outline-final.md` §4): flow · args · world · confirmation · honesty · reply · custom.
 * `catalog.ts` holds the same vocabulary as DATA (`GUARD_CATALOG`) plus the runtime's kind
 * classification registries; `shared.ts` holds the module-local helpers and is exported by nobody.
 */

export { custom } from './custom.js';
export { askedEarlier } from './structural.js';
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
export { claimIsGrounded, claimIsComplete, claimCoversRubric, isEmptyReadResult } from './honesty.js';
export { degenerationGuard, jargonScrub } from './reply.js';

// The vocabulary as data + the runtime's own kind classification (read via `@looprun-ai/core/internal`).
export { GUARD_CATALOG, DENY_ONLY_PROSE_KINDS, CONFIRM_CLASS_KINDS, ARMED_SEAMS } from './catalog.js';
export type { GuardCatalogEntry } from './catalog.js';
