/**
 * Guard-surface INTERNALS — the helpers the guard kinds share.
 *
 * Module-local by design: nothing here is exported from `guards/index.ts`, from `@looprun-ai/core`, or
 * from `@looprun-ai/core/internal`. They are the mechanisms the kinds are built out of (terminal
 * filtering, flag-safe regex testing for `argFormat`), not vocabulary a spec author binds.
 */
import type { GuardCtx, ObservedCall } from '../rules.js';
import { hasAskIntent, isBlankDelivery } from '../runtime/claims.js';

export const lc = (s: unknown): string => String(s ?? '').toLowerCase();
export const ran = (observed: ObservedCall[], tool: string): boolean => observed.some((o) => o.name === tool && o.ok);
export const ranThisTurn = (ctx: GuardCtx, tool: string): boolean =>
  ctx.observed.some((o) => o.name === tool && o.ok && o.turnIndex === ctx.turnIndex);

/**
 * The runtime-owned TERMINAL tool. It is not a domain action: the Mastra backend pushes it into
 * `ctx.observed` with `ok:true` from `beforeToolCall`'s SYNCHRONOUS segment (so a same-step ask
 * (a `respond` whose `did` carries an `ask` intention) is visible to a sibling's preTool checks). Consequence:
 * `observed` is NEVER empty on a turn that produced a reply, and it never carries a `!ok` entry merely
 * because the domain work failed.
 *
 * Any guard that reasons about "did the model DO anything / did everything succeed" must therefore
 * filter this out first: without the filter, a "did anything run this turn" precondition was
 * vacuously true and it vetoed the HONEST "I cannot do X" reply of a turn in which no domain tool ran
 * at all — the reply then went to redrive and out as an exhaustion stub (the failure class measured
 * across 7 models; that class of reply-honesty check is now `llmCheck`'s job, not a deterministic
 * guard's). Guards keyed on a NAMED tool (`destructiveThrottle`, `maxCalls`, …) are unaffected — the
 * terminal name is never in their set.
 */
export const TERMINAL_TOOLS = new Set(['respond']);
export const isTerminalCall = (o: ObservedCall): boolean => TERMINAL_TOOLS.has(o.name);

/**
 * Did the agent pose a question to the user in a DELIVERED turn `[1, within]` turns back?
 *
 * The ONE cross-turn ask signal, shared by every kind that reads one, so the
 * two can never disagree about what consent looks like. Asking is an `ask` INTENTION in the turn's
 * `did`, never a flag.
 *
 * SEALED HISTORY IS THE ONLY SOURCE. `ctx.observed` records EVERY `respond` at HOOK time — including
 * calls the runtime then REFUSED (a blank message / an empty `did` fail the terminal schema, and the
 * hook runs outside the tool's input validation), one that lost a within-step delivery contest, and one
 * invalidated as premature. The backend prunes what it can, but falling back to a RAW `observed` ask
 * scan for a turn missing from `ctx.history` would be a silent failure mode: any host that does not seal
 * its turns would lose the whole guarantee with no signal — a host that advances the turn counter and
 * never seals would let a refused `respond` license a `confirmed:true` delete one turn later. So there
 * is no fallback. Consent evidence is a DELIVERED TURN RECORD or it does not exist: a host that wants
 * its turns to license anything must seal them (`recordTurnHistory`) — fail-closed, and loud in the only
 * way that matters (the act is denied).
 *
 * THE TURN MUST HAVE SAID SOMETHING. The sealed `reply` is checked alongside the sealed
 * `did`: a turn whose delivered text is blank ({@link isBlankDelivery} — invisibles stripped) never
 * asked anything a user could answer, whatever its declaration says. This is the deterministic floor
 * under a SELF-DECLARED signal; it does not (and cannot, under the no-regex law) decide whether a
 * non-blank message actually poses a question — see GUARDS.md, "what the ask guarantees".
 *
 * RECENCY LAW: an ask is a LICENSING signal, so it must satisfy `1 ≤ ctx.turnIndex − askTurn ≤ within`.
 * A same-turn ask (distance 0) never licenses — the user has had no chance to answer.
 */
export function askedInDeliveredTurn(ctx: GuardCtx, within: number): boolean {
  const recent = (turnIndex: number): boolean =>
    ctx.turnIndex - turnIndex >= 1 && ctx.turnIndex - turnIndex <= within;
  return ctx.history.some((h) => recent(h.turnIndex) && hasAskIntent(h.did) && !isBlankDelivery(h.reply));
}

/** This turn's observed DOMAIN calls (terminals excluded — see {@link TERMINAL_TOOLS}). */
export const domainCallsThisTurn = (ctx: GuardCtx): ObservedCall[] =>
  ctx.observed.filter((o) => o.turnIndex === ctx.turnIndex && !isTerminalCall(o));

/**
 * Test `re` against `s` WITHOUT ever touching a caller-held regex's `lastIndex`.
 *
 * GUARDS.md §1 forbids a `/g` or `/y` regex on a closure-held pattern: `RegExp.prototype.test` advances
 * `lastIndex` on a match, so the SAME guard on the SAME reply alternates verdict between turns. Every
 * linguistic pattern in this file is INJECTED by a bundle (P8a), so the runtime cannot assume the flags
 * it is handed — it must be immune by construction. `allMatches` already rebuilt a local copy locally;
 * this helper is that discipline made universal.
 *
 * Non-stateful regexes (the common case) are tested directly — no allocation on the hot path.
 */
export function matches(re: RegExp, s: string): boolean {
  if (!re.global && !re.sticky) return re.test(s);
  return new RegExp(re.source, re.flags.replace(/[gy]/g, '')).test(s);
}

/** Escape a literal for embedding in a character-safe alternation. */
export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
