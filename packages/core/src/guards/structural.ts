/**
 * STRUCTURAL guards — the consent-binding pair that keys ONLY on structure: observed call NAMES, their
 * `ok`/`turnIndex`, and args EQUALITY. No text is ever matched (no RegExp over any user or model
 * string) — that is the defect class this family exists to replace. A generated bundle used to
 * hand-write these as `custom()` guards carrying a regex over the reply or the args; the two kinds here
 * carry the identical decision as a runtime primitive, so the bundle binds a name instead of shipping a
 * pattern.
 */
import type { Guard, GuardCtx, ObservedCall } from '../rules.js';

/**
 * A value the agent may only RECORD after it has asked the operator for it in an EARLIER turn.
 *
 * Fires only when the gated argument is actually present on this call (`ctx.args[arg]` non-nullish) — an
 * absent arg is not this guard's business. The exemption is purely structural: any observed `askUser`
 * that ran OK in a turn BEFORE this one. A same-turn ask does NOT count — the operator has not had a
 * chance to answer within the same message, so consent to record their answer cannot have arrived yet.
 * Reads observed / args only — never the user's text (magnet-safe).
 */
export function askedEarlier(opts: { tool: string; arg?: string }): Guard {
  const arg = opts.arg;
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
        (o) => o.name === 'askUser' && o.ok && o.turnIndex < ctx.turnIndex,
      );
      if (askedEarlierTurn) return null;
      const what = arg ?? 'that value';
      return `Ask the operator for ${what} first — record it only after they answer.`;
    },
    prose: () =>
      `record ${arg ?? 'that value'} only after asking the operator for it in an earlier turn — never on the opening turn`,
  };
}

/**
 * A confirmed destructive call needs its OWN earlier-turn preview.
 *
 * Fires when `ctx.args.confirmed === true` for one of the listed `tools`. The exemption is a matching
 * PROBE: an observed call of the SAME tool that ran OK, carried `confirmed !== true`, happened in an
 * EARLIER turn, and whose every non-`confirmed` argument key equals this call's — so the preview was of
 * the SAME act, not a different one. A same-turn probe is denied on its own message (the go-ahead must
 * arrive LATER); no matching probe at all is denied for lack of a preview. One agreement covers one act:
 * the preview and the go-ahead live in different messages. Reads observed / args only (magnet-safe).
 */
export function confirmedNeedsEarlierProbe(opts: { tools: string[] }): Guard {
  const set = new Set(opts.tools);
  return {
    kind: 'confirmedNeedsEarlierProbe',
    dim: 'run',
    check(ctx: GuardCtx): string | null {
      if (!ctx.tool || !set.has(ctx.tool)) return null;
      if (ctx.args.confirmed !== true) return null;
      const isMatchingProbe = (o: ObservedCall): boolean =>
        o.name === ctx.tool &&
        o.ok &&
        o.args?.confirmed !== true &&
        Object.keys(o.args ?? {})
          .filter((k) => k !== 'confirmed')
          .every((k) => o.args[k] === ctx.args[k]);
      const earlier = ctx.observed.some((o) => isMatchingProbe(o) && o.turnIndex < ctx.turnIndex);
      if (earlier) return null;
      const sameTurn = ctx.observed.some((o) => isMatchingProbe(o) && o.turnIndex === ctx.turnIndex);
      if (sameTurn) {
        return `You previewed and confirmed ${ctx.tool} in the SAME turn — the go-ahead must arrive in a LATER message; confirm only after the user has seen the preview and replied.`;
      }
      return `Do not confirm ${ctx.tool} without a preview first — call it once WITHOUT confirmed:true, show the user what it will do, and confirm only after they agree.`;
    },
    prose: () => 'one agreement covers one act; the preview and the go-ahead live in different messages',
  };
}
