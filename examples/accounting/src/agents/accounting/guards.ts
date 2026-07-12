/**
 * src/agents/accounting/guards.ts — domain-local reply-guard factories (Stage N revisions).
 *
 * Both replace shared kinds after the composition review (N3) demonstrated concrete misfires on
 * legal flows; they keep the shared kinds' exemptions (confirm-probe, honest failure/negation)
 * and add the discriminators the review demanded:
 *   1. ATTEMPT-KEYING — a destructive-claim check may fire only when a listed destructive tool
 *      was actually ATTEMPTED this turn (observed call, executed or vetoed). Pure status talk
 *      after read-only turns ("inv_1001 is paid") is read-backed reporting, not an action claim.
 *   2. RESOLUTION-AWARENESS — a pending-confirmation check must not force a question when the
 *      SAME tool acting on the SAME record already took effect with confirmed:true later in the
 *      same turn (re-probe → approved execute is a legal single-turn tail of a two-step flow).
 *   3. N3 round-2 hardening: (a) resolution matches tool NAME + record id (a probe on X is not
 *      resolved by a confirm on Y); (b) the claim check's confirm exemption requires
 *      confirm-LANGUAGE — a bare question mark ("…sent! Anything else?") no longer bypasses it.
 *
 * Purity: every check reads ONLY ctx.observed / ctx.reply / ctx.args — never user text.
 */
import { custom } from 'looprun';
import type { Guard } from 'looprun';

/** Any-question shapes — used ONLY by the must-ask check (a pending confirm demands a question). */
const CONFIRM_ASK = /\?|\b(?:confirm|are you sure|do you want|would you like|shall i|proceed|go ahead)\b/i;
/** Confirm-LANGUAGE only (no bare `?`) — the claim check's probe-relay exemption (N3 round-2 b). */
const CONFIRM_LANG = /\b(?:confirm|are you sure|do you want|would you like|shall i|proceed|go ahead)\b/i;

/**
 * en-US LEXICON for the runtime's domain-neutral `noFalseFailureClaim({ claimRe })` guard — the STRINGS
 * live in the business bundle (the domain-neutrality law: @looprun-ai/core carries no linguistic pattern).
 * A false "I couldn't do X" claim about an action that actually succeeded (inability phrase + action verb).
 */
export const FALSE_FAILURE_CLAIM_RE =
  /(cannot|can'?t|could ?not|couldn'?t|unable to|not able to|failed to|failed)[^.!?\n]{0,40}(updat|sav|creat|send|sent|record|regist|void|draft|invoic|payment|remind|file|fil|reconcil|appli|apply|mark|clos|open)/i;

/** The record id an accounting tool call acts on (first domain-id-shaped string arg), or null. */
function recordId(args: Record<string, unknown>): string | null {
  for (const v of Object.values(args)) {
    if (typeof v === 'string' && /^(?:cli|ent|inv|tax)_/.test(v)) return v;
  }
  return null;
}

/**
 * The reply may not claim a destructive action happened unless a listed tool was attempted AND
 * took effect (ok + confirmed:true) this turn. Exempts confirm-language relays and honest
 * failure/negation/status phrasing. Fires on NOTHING when no listed tool was attempted this turn.
 */
export function destructiveClaimRequiresAttemptedSuccess(tools: string[], claimRe: RegExp, exemptRe: RegExp): Guard {
  const set = new Set(tools);
  return custom({
    kind: 'destructiveClaimRequiresAttemptedSuccess',
    dim: 'behavior',
    check: (ctx) => {
      const attempts = ctx.observed.filter((o) => o.turnIndex === ctx.turnIndex && set.has(o.name));
      if (!attempts.length) return null; // no attempt → status talk is read-backed reporting
      const tookEffect = attempts.some((o) => o.ok && o.args?.confirmed === true);
      if (tookEffect) return null;
      const reply = ctx.reply ?? '';
      if (CONFIRM_LANG.test(reply)) return null; // legal confirm-probe relay (confirm language required)
      if (exemptRe.test(reply)) return null; // honest failure / negation / already-state report
      return claimRe.test(reply)
        ? 'The record change did NOT complete this turn (only a probe, a denial, or a failure) — do not present it as done. Relay the confirmation question or report what actually happened.'
        : null;
    },
    prose: () =>
      'never present a record change as completed unless the tool succeeded with confirmed:true this turn — after a probe, ask for confirmation; after a failure, report it honestly',
  });
}

/**
 * When a tool returned requiresConfirmation this turn AND that same tool did not complete on the
 * SAME record later in the turn, the reply MUST ask the confirmation question.
 */
export function pendingConfirmUnlessResolved(): Guard {
  return custom({
    kind: 'pendingConfirmUnlessResolved',
    dim: 'behavior',
    check: (ctx) => {
      const thisTurn = ctx.observed.filter((o) => o.turnIndex === ctx.turnIndex);
      const unresolved = thisTurn
        .filter((o) => o.resultFlags?.requiresConfirmation)
        .filter((probe) => {
          const probeId = recordId(probe.args ?? {});
          return !thisTurn.some(
            (o) =>
              o.name === probe.name &&
              o.ok &&
              o.args?.confirmed === true &&
              (probeId === null || recordId(o.args ?? {}) === probeId),
          );
        });
      if (!unresolved.length) return null;
      return CONFIRM_ASK.test(ctx.reply ?? '')
        ? null
        : 'A confirmation is PENDING — relay the confirmation question to the user (your reply must ask it), and do not summarize the action as done.';
    },
    prose: () => 'when a tool asks for confirmation and the action was not completed, relay that question to the user before anything else',
  });
}
