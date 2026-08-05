/**
 * STRUCTURAL guards — the kind that keys ONLY on values the conversation itself produced. No text is
 * ever pattern-matched: matching is the engine's one law (whole tokens, contiguous, whole-value equal).
 */
import type { Guard, GuardCtx } from '../rules.js';
import { valueSpokenBy } from './matching.js';

/**
 * A value the agent records on the user's behalf must be a value the USER SAID.
 *
 * ```
 *   user says   "my email is marcos@x.com"
 *   saveLead({ email:'marcos@x.com' })              allowed — the user said it
 *   saveLead({ email:'guess@y.com' })               denied  — the agent invented it
 *
 *   user says   "the engine locked up"
 *   saveCase({ diagnosis:'engine seized' })         denied  — a paraphrase is the agent's words
 *   saveCase({ diagnosis:'the engine locked up' })  allowed
 * ```
 *
 * The world receives the person's own words, not the agent's normalization. Paraphrase is denied: a
 * normalization that never passed the user's lips is a value they cannot be held to.
 *
 * Every turn of the conversation counts, this one included — a value the user supplied is theirs however
 * long ago they said it, and nothing about a later turn unsays it.
 *
 * Fires only when the gated argument is actually present on this call; an absent arg is not this guard's
 * business.
 */
export function valueFromUser(opts: { arg: string }): Guard {
  const arg = opts.arg;
  return {
    kind: 'valueFromUser',
    dim: 'run',
    check(ctx: GuardCtx): string | null {
      const v = ctx.args[arg];
      if (typeof v !== 'string' || v === '') return null;
      if (valueSpokenBy(v, ctx.userText)) return null;
      if (ctx.history.some((t) => valueSpokenBy(v, t.userText))) return null;
      return `Record ${arg} only with the value the user gave you, in their own words — do not supply it yourself or rephrase what they said.`;
    },
    prose: () =>
      `record ${arg} only using the exact words the user gave you — never your own rephrasing, and never a value they did not say`,
  };
}
