/**
 * accounting LEXICON — the language-specific regexes this (en-US) domain injects into the runtime's
 * domain-neutral reply guards.
 *
 * WHY THIS FILE EXISTS (the domain-neutrality law): `@looprun-ai/core` carries NO linguistic pattern —
 * every reply guard that keys on wording takes its regex as a REQUIRED param. The STRINGS/REGEXES live
 * HERE, in the business bundle, so a different-language domain authors its own. Passed back into the
 * (now attempt-keyed / resolution-aware) shared kinds as:
 *   pendingConfirmMustAsk({ askRe: CONFIRM_ASK_RE })
 *   destructiveClaimRequiresSuccess(tools, { claimRe, askRe: CONFIRM_LANG_RE, offerRe: OFFER_OR_CONDITIONAL_RE, exemptRe })
 *   noFalseFailureClaim({ claimRe: FALSE_FAILURE_CLAIM_RE })  (auto via cfg.lexicon)
 *
 * NOTE the TWO confirm regexes are DELIBERATELY different — the discriminator the N3 composition review
 * demanded (round-2 b):
 *   - CONFIRM_ASK_RE includes a bare `?` — the pending-confirm MUST-ASK relay: any question counts as
 *     "the reply asked".
 *   - CONFIRM_LANG_RE is confirm-LANGUAGE only (no bare `?`) — the destructive-claim check's probe-relay
 *     exemption. A bare question mark ("…sent! Anything else?") must NOT bypass a declarative claim, so the
 *     claim check's confirm exemption requires actual confirm words.
 */

/** A reply "seeks confirmation" if it asks a question OR carries confirm-language (the must-ask relay). */
export const CONFIRM_ASK_RE = /\?|\b(?:confirm|are you sure|do you want|would you like|shall i|proceed|go ahead)\b/i;

/** Confirm-LANGUAGE only (no bare `?`) — the destructive-claim check's probe-relay exemption (N3 round-2 b). */
export const CONFIRM_LANG_RE = /\b(?:confirm|are you sure|do you want|would you like|shall i|proceed|go ahead)\b/i;

/** An offer / conditional wrapping a destructive verb — "if you want", "I can", "shall I", "let me know" —
 *  which OFFER to act, they do not report having acted (sentence-scoped in the guard). */
export const OFFER_OR_CONDITIONAL_RE =
  /\b(if you(?:'d| would)? (?:want|like|prefer)|would you like me to|want me to|shall i|i can|i could|let me know|just (?:say|ask|tell me)|do you want me to)\b/i;

/**
 * A false "I couldn't do X" claim about an action that actually succeeded (inability phrase + action verb).
 * Feeds the runtime's domain-neutral `noFalseFailureClaim({ claimRe })` guard (auto-installed via
 * `cfg.lexicon.falseFailureClaimRe`).
 */
export const FALSE_FAILURE_CLAIM_RE =
  /(cannot|can'?t|could ?not|couldn'?t|unable to|not able to|failed to|failed)[^.!?\n]{0,40}(updat|sav|creat|send|sent|record|regist|void|draft|invoic|payment|remind|file|fil|reconcil|appli|apply|mark|clos|open)/i;
