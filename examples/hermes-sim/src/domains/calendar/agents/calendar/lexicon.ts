/**
 * calendar LEXICON — the language-specific regexes this (en-US) domain injects into the runtime's
 * domain-neutral reply guards.
 *
 * WHY THIS FILE EXISTS (the domain-neutrality law): `@looprun-ai/core` carries NO linguistic pattern —
 * every reply guard that keys on wording takes its regex as a REQUIRED param. The STRINGS/REGEXES live
 * HERE, in the business bundle, so a different-language domain authors its own. Passed back into the
 * (attempt-keyed / resolution-aware) shared kinds as:
 *   pendingConfirmMustAsk({ askRe: CONFIRM_ASK_RE })
 *   destructiveClaimRequiresSuccess(tools, { claimRe, askRe: CONFIRM_LANG_RE, offerRe: OFFER_OR_CONDITIONAL_RE, exemptRe: HONEST_FAILURE_RE })
 *   noFalseFailureClaim({ claimRe: FALSE_FAILURE_CLAIM_RE })  (auto-installed via cfg.lexicon.falseFailureClaimRe)
 *
 * The TWO confirm regexes are DELIBERATELY different (the discriminator the N3 composition review demands):
 *   - CONFIRM_ASK_RE includes a bare `?` — the pending-confirm MUST-ASK relay: ANY question counts as
 *     "the reply asked the confirmation".
 *   - CONFIRM_LANG_RE is confirm-LANGUAGE only (no bare `?`) — the destructive-claim check's probe-relay
 *     exemption. A bare question mark ("…deleted! Anything else?") must NOT bypass a declarative claim.
 */

/** A reply "seeks confirmation" if it asks a question OR carries confirm-language (the must-ask relay). */
export const CONFIRM_ASK_RE = /\?|\b(?:confirm|are you sure|do you want|would you like|shall i|proceed|go ahead)\b/i;

/** Confirm-LANGUAGE only (no bare `?`) — the destructive-claim check's probe-relay exemption. */
export const CONFIRM_LANG_RE = /\b(?:confirm|are you sure|do you want|would you like|shall i|proceed|go ahead)\b/i;

/** An offer / conditional wrapping a destructive verb — "if you want", "I can", "shall I", "let me know" —
 *  which OFFER to act; they do not report having acted (the guard scopes this per sentence). */
export const OFFER_OR_CONDITIONAL_RE =
  /\b(if you(?:'d| would)? (?:want|like|prefer)|would you like me to|want me to|shall i|i can|i could|let me know|just (?:say|ask|tell me)|do you want me to)\b/i;

/**
 * Honest failure / negation / already-in-that-state phrasing — the destructive-claim check's `exemptRe`.
 * A truthful "there is no dentist appointment on the calendar — nothing to cancel" or "that window is
 * already taken" must PASS the claim gate.
 */
export const HONEST_FAILURE_RE =
  /\b(?:already|cannot|can['’]?t|could not|couldn['’]?t|not|no longer|unable|hasn['’]?t|haven['’]?t|isn['’]?t|wasn['’]?t|doesn['’]?t|don['’]?t|nothing|none|yet|taken|clash|conflict)\b/i;

/**
 * A FALSE "the work failed" claim on a turn where every tool call actually SUCCEEDED — feeds the
 * always-on `noFalseFailureClaim({ claimRe })` (auto via `cfg.lexicon.falseFailureClaimRe`).
 *
 * ATTEMPT-CONTEXT failure verbs ONLY (the default-template rule): this guard fires on
 * all-calls-succeeded turns, which is exactly the shape of an HONEST policy refusal after clean reads
 * ("that window clashes with the project review — I didn't book it", "there is no such event").
 * Generic inability/refusal words (`cannot`, `unable`, `could not process|complete`) would match those
 * honest refusals and exhaust the redrive into the fallback stub — so they are deliberately EXCLUDED.
 * Only "the attempt broke" phrasing qualifies.
 */
export const FALSE_FAILURE_CLAIM_RE =
  /\b(failed to|error(?:ed)? (?:out|occurred)|ran into (?:an )?error|something went wrong|tried (?:to|but) [^.!?\n]{0,32}(?:failed|didn'?t work))\b/i;
