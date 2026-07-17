/**
 * homeservices LEXICON — the language-specific regexes this (en-US) domain injects into the runtime's
 * domain-neutral reply guards.
 *
 * WHY THIS FILE EXISTS (the P8a domain-neutrality law): `@looprun-ai/core` carries NO linguistic
 * pattern — every reply guard that keys on wording takes its regex as a REQUIRED param. The
 * STRINGS/REGEXES live HERE, in the business bundle, so a different-language domain authors its own.
 * Passed back into the factories as:
 *   super({ …, lexicon: { falseFailureClaimRe: FALSE_FAILURE_CLAIM_RE } })  // auto minimal:noFalseFailureClaim
 *   pendingConfirmMustAsk({ askRe: CONFIRM_ASK_RE })
 *   destructiveClaimRequiresSuccess(tools, { claimRe, askRe: CONFIRM_ASK_RE, offerRe: OFFER_OR_CONDITIONAL_RE, exemptRe })
 */

/** A reply "seeks confirmation" if it asks a question OR carries confirm-language (the must-ask relay). */
export const CONFIRM_ASK_RE =
  /\?|\b(confirm|are you sure|do you want|would you like|shall i|proceed|go ahead|please confirm|is that ok|okay to)\b/i;

/** An offer / conditional wrapping a destructive verb — "if you want", "I can", "shall I", "let me know" —
 *  which OFFER to act; they do not report having acted (sentence-scoped in the guard). */
export const OFFER_OR_CONDITIONAL_RE =
  /\b(if you(?:'d| would)? (?:want|like|prefer)|would you like me to|want me to|shall i|i can|i could|let me know|just (?:say|ask|tell me)|do you want me to)\b/i;

/**
 * FALSE-FAILURE claim regex — the DEFAULT TEMPLATE (guard-catalog.md, measured 2026-07-16).
 *
 * It must match ATTEMPTED-WORK-FAILURE phrasing ONLY — never generic inability/refusal words. A
 * policy refusal after successful reads ("cannot book — the quote is not accepted", "could not
 * schedule — no qualified technician is free") is HONEST: noFalseFailureClaim fires exactly on
 * all-calls-succeeded turns, which is the refusal shape, so a broad `cannot|unable|could not
 * process|complete` regex would destroy the delivered reply (the "delivery-stub" wipeout). Keep the
 * verbs about work that was tried and broke, not about declining to act.
 */
export const FALSE_FAILURE_CLAIM_RE =
  /\b(failed to (?:book|schedul|reschedul|cancel|assign|send|creat|open|record|updat|notif)|error(?:ed)? (?:out|occurred)|ran into (?:an )?error|something went wrong|tried (?:to|but) [^.!?\n]{0,32}(?:failed|didn'?t work))\b/i;
