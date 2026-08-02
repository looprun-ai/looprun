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

/**
 * A value the agent may only RECORD after it has asked the operator for it in an EARLIER turn.
 *
 * Fires only when the gated argument is actually present on this call (`ctx.args[arg]` non-nullish) — an
 * absent arg is not this guard's business. The exemption is purely structural: an observed `askUser`
 * that ran OK in a turn BEFORE this one. A same-turn ask does NOT count — the operator has not had a
 * chance to answer within the same message, so consent to record their answer cannot have arrived yet.
 * Keys on observed / args only — a structural signal (an earlier-turn `askUser`), not reply text.
 *
 * RECENCY LAW (2026-08-02): the earlier `askUser` is a LICENSING signal — it UNLOCKS this write — so it is
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
      const askedEarlierTurn = ctx.observed.some(
        (o) =>
          o.name === 'askUser' &&
          o.ok &&
          ctx.turnIndex - o.turnIndex >= 1 &&
          ctx.turnIndex - o.turnIndex <= within,
      );
      if (askedEarlierTurn) return null;
      const what = arg ?? 'that value';
      return `Ask the operator for ${what} first — record it only after they answer.`;
    },
    prose: () =>
      `record ${arg ?? 'that value'} only after asking the operator for it in an earlier turn — never on the opening turn`,
  };
}
