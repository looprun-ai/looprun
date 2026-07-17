/**
 * lawfirm LEXICON — the en-US, language-specific regexes this domain injects into the runtime's
 * domain-neutral reply guards (the P8a lexicon doctrine).
 *
 * WHY THIS FILE EXISTS: `@looprun-ai/core` carries NO linguistic pattern — every reply guard that keys
 * on wording takes its regex as a REQUIRED param, so a different-language firm authors its own lexicon
 * and injects it (same kinds, no fork). Wired as:
 *   super({ …, lexicon: { falseFailureClaimRe: FALSE_FAILURE_CLAIM_RE } })  // auto minimal:noFalseFailureClaim
 *   pendingConfirmMustAsk({ askRe: CONFIRM_ASK_RE })
 *   destructiveClaimRequiresSuccess(tools, { claimRe, askRe: CONFIRM_ASK_RE, offerRe: OFFER_OR_CONDITIONAL_RE, exemptRe })
 */

/** A reply "seeks confirmation" — a question OR explicit confirm-language (the pending-confirm relay
 *  and the confirm-probe exemption on the destructive claim guard). */
export const CONFIRM_ASK_RE =
  /\?|\b(confirm|are you sure|do you want|would you like|shall i|proceed|go ahead|please confirm|is that ok|okay to)\b/i;

/** An OFFER / conditional wrapping a destructive verb ("if you want", "I can", "shall I", "let me
 *  know") — these OFFER to act, they do not report having acted (sentence-scoped in the guard). */
export const OFFER_OR_CONDITIONAL_RE =
  /\b(if you(?:'d| would)? (?:want|like|prefer)|would you like me to|want me to|shall i|i can|i could|let me know|just (?:say|ask|tell me)|do you want me to)\b/i;

/**
 * FALSE-FAILURE claim regex — the guard-catalog DEFAULT TEMPLATE: ATTEMPTED-WORK-FAILURE phrasing
 * ONLY (measured 2026-07-16). `noFalseFailureClaim` fires only on all-tools-succeeded turns, which is
 * EXACTLY the shape of an honest policy refusal after successful reads ("cannot close — unbilled
 * hours", "could not process the release — open claim"). A broad `cannot|unable|could not
 * process|complete` regex would match those honest refusals and, via the redrive, destroy the
 * delivered reply (the "delivery-stub" fail class). So we match a claim that an ATTEMPT broke — never
 * an inability/refusal word.
 */
export const FALSE_FAILURE_CLAIM_RE =
  /\b(failed to|error(?:ed)? (?:out|occurred)|ran into (?:an )?error|something went wrong|tried (?:to|but) [^.!?\n]{0,32}(?:failed|didn'?t work))\b/i;
