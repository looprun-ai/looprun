/**
 * STRUCTURAL guards — the consent-binding kind that keys ONLY on structure: observed call NAMES, their
 * `ok`/`turnIndex`, and args EQUALITY. No text is ever matched (no RegExp over any user or model
 * string) — that is the defect class this family exists to replace. A generated bundle used to
 * hand-write this as a `custom()` guard carrying a regex over the reply or the args; the kind here
 * carries the identical decision as a runtime primitive, so the bundle binds a name instead of shipping a
 * pattern. (The former sibling `confirmedNeedsEarlierProbe` was absorbed into the unified `confirmFirst`
 * via `via:'probe'` — 2026-08-02.)
 */
import type { Guard, GuardCtx } from '../rules.js';
import { isAskEvent } from '../runtime/claims.js';

/**
 * A value the agent may only RECORD after it has asked the operator for it in an EARLIER turn.
 *
 * Fires only when the gated argument is actually present on this call (`ctx.args[arg]` non-nullish) — an
 * absent arg is not this guard's business. The exemption is purely structural: an EARLIER completed turn
 * that posed an ask (its delivered `respond` carried `asked:true`). A same-turn ask does NOT count — the
 * operator has not had a chance to answer within the same message, so consent to record their answer cannot
 * have arrived yet.
 *
 * ASK SIGNAL (SCG-T5): the PRIMARY signal is a sealed `HistoryTurn` with `asked === true` — the delivered,
 * verified ask (`ledger.asked` synced by `finalizeReply`, retained frozen in history since T2). The
 * observed-scan (an `isAskEvent` over `ctx.observed` in an earlier turn) is the FALLBACK for the
 * same-conversation PRE-HISTORY window — an earlier ask observed but not yet sealed into history (e.g. a
 * chained micro-turn). Both key on structure only — never reply text.
 *
 * RECENCY LAW (2026-08-02): the earlier ask is a LICENSING signal — it UNLOCKS this write — so it is
 * turn-bounded by `within` (default **1**, the immediately-preceding turn): the ask must satisfy
 * `1 ≤ currentTurnIndex − askTurnIndex ≤ within`. An answer given 20 turns ago must not license today's
 * record; widen deliberately with `within` when the flow genuinely spans turns.
 */
export function askedEarlier(opts: { tool: string; arg?: string; within?: number }): Guard {
  const arg = opts.arg;
  const within = opts.within ?? 1;
  return {
    kind: 'askedEarlier',
    dim: 'run',
    check(ctx: GuardCtx): string | null {
      // Only in scope when the value this guard governs is actually being written this call.
      if (arg != null) {
        const v = ctx.args[arg];
        if (v === undefined || v === null || v === '') return null;
      }
      // An earlier-turn ask, turn-bounded by `within`: `1 ≤ currentTurn − askTurn ≤ within`.
      const recent = (turnIndex: number): boolean =>
        ctx.turnIndex - turnIndex >= 1 && ctx.turnIndex - turnIndex <= within;
      // PRIMARY: an earlier COMPLETED turn delivered an ask (history.asked — the verified delivered signal).
      const askedInHistory = ctx.history.some((h) => h.asked && recent(h.turnIndex));
      // FALLBACK: an ask observed in an earlier turn not yet sealed into history (pre-history window).
      const askedInObserved = ctx.observed.some((o) => isAskEvent(o) && o.ok && recent(o.turnIndex));
      if (askedInHistory || askedInObserved) return null;
      const what = arg ?? 'that value';
      return `Ask the operator for ${what} first — record it only after they answer.`;
    },
    prose: () =>
      `record ${arg ?? 'that value'} only after asking the operator for it in an earlier turn — never on the opening turn`,
  };
}
