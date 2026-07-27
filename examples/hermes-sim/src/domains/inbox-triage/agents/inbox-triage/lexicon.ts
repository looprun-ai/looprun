/**
 * inbox-triage LEXICON — the language-specific regexes this (en-US) domain injects into the
 * runtime's domain-neutral reply guards.
 *
 * WHY THIS FILE EXISTS (the domain-neutrality law): `@looprun-ai/core` carries NO linguistic
 * pattern — every reply guard that keys on wording takes its regex as a REQUIRED param. The
 * STRINGS/REGEXES live HERE, in the business bundle, so a different-language domain authors its
 * own. Wired as:
 *   noFabricatedSuccess('emailSend',    { banRe: SENT_CLAIM_RE, ... })     (unconditional — send can never succeed)
 *   noFabricatedSuccess('emailArchive', { claimRe: ARCHIVE_CLAIM_RE, ... }) (attempt-keyed)
 *   noFalseFailureClaim({ claimRe: FALSE_FAILURE_CLAIM_RE })  (auto-installed via cfg.lexicon.falseFailureClaimRe)
 */

/**
 * A DECLARATIVE "the mail went out" claim. Used as `banRe` on the emailSend fabrication guard:
 * sending is hard-vetoed, so under governance this phrasing can NEVER be true — it is banned
 * unconditionally. Built from contiguous positive phrases so honest negations stay legal:
 * "I have not sent", "no reply was sent", "it hasn't been sent", "I cannot send email" all fail
 * to match (the negation word breaks the contiguous phrase; "send" != "sent").
 */
export const SENT_CLAIM_RE =
  /\b(?:i(?:['’]ve| have| just)? (?:sent|emailed|dispatched)\b|(?<!\bno )(?<!\bnothing )(?:reply|response|email|message|draft|it) (?:was|has been|is) (?:sent|delivered|emailed|on its way)|sent (?:it|him|her|them|the (?:reply|email|response|message)) (?:off|out|over|to)\b|replied directly to)\b/i;

/**
 * A "the email was archived / inbox was cleared" claim — the attempt-keyed `claimRe` on the
 * emailArchive fabrication guard (fires only when emailArchive was ATTEMPTED this turn and none
 * succeeded). Contiguous positive phrases only, so honest negations ("I have not archived",
 * "nothing was archived") pass.
 */
export const ARCHIVE_CLAIM_RE =
  /\b(?:i(?:['’]ve| have| just)? archived\b|(?<!\bnot )(?<!\bnothing )(?:was|were|been) archived|moved (?:it|them|those) to (?:the )?archive|cleared (?:out |up )?(?:the|your) inbox)\b/i;

/**
 * A FALSE "the work failed" claim on a turn where every tool call actually SUCCEEDED — feeds the
 * always-on `noFalseFailureClaim({ claimRe })` (auto via `cfg.lexicon.falseFailureClaimRe`).
 *
 * ATTEMPT-CONTEXT failure verbs ONLY (the default-template rule): this guard fires on
 * all-calls-succeeded turns, which is exactly the shape of the domain's HONEST policy refusal
 * ("I cannot send email — the draft is saved for your review"). Generic inability/refusal words
 * (`cannot`, `unable`, `could not`) would match that honest refusal and exhaust the redrive into
 * the fallback stub — so they are deliberately EXCLUDED. Only "the attempt broke" phrasing
 * qualifies.
 */
export const FALSE_FAILURE_CLAIM_RE =
  /\b(failed to|error(?:ed)? (?:out|occurred)|ran into (?:an )?error|something went wrong|tried (?:to|but) [^.!?\n]{0,32}(?:failed|didn'?t work))\b/i;
