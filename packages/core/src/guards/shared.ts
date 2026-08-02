/**
 * Guard-surface INTERNALS — the helpers the guard kinds share.
 *
 * Module-local by design: nothing here is exported from `guards/index.ts`, from `@looprun-ai/core`, or
 * from `@looprun-ai/core/internal`. They are the mechanisms the kinds are built out of (terminal
 * filtering, flag-safe regex testing for `argFormat`), not vocabulary a spec author binds.
 */
import type { GuardCtx, ObservedCall } from '../rules.js';

export const lc = (s: unknown): string => String(s ?? '').toLowerCase();
export const ran = (observed: ObservedCall[], tool: string): boolean => observed.some((o) => o.name === tool && o.ok);
export const ranThisTurn = (ctx: GuardCtx, tool: string): boolean =>
  ctx.observed.some((o) => o.name === tool && o.ok && o.turnIndex === ctx.turnIndex);

/**
 * The runtime-owned TERMINAL tools. They are not domain actions: the Mastra backend pushes them into
 * `ctx.observed` with `ok:true` from `beforeToolCall`'s SYNCHRONOUS segment (so a same-step `askUser`
 * is visible to a sibling call's preTool checks). Consequence: `observed` is NEVER empty on a turn that
 * produced a reply, and it never carries a `!ok` entry merely because the domain work failed.
 *
 * Any guard that reasons about "did the model DO anything / did everything succeed" must therefore
 * filter these out first: without the filter, a "did anything run this turn" precondition was
 * vacuously true and it vetoed the HONEST "I cannot do X" reply of a turn in which no domain tool ran
 * at all — the reply then went to redrive and out as an exhaustion stub (the failure class measured
 * across 7 models; that class of reply-honesty check is now `llmCheck`'s job, not a deterministic
 * guard's). Guards keyed on a NAMED tool (`destructiveThrottle`, `maxCalls`, …) are unaffected — a
 * terminal name is never in their set — and `confirmFirst`'s prior-ask arm keeps reading `askUser` by
 * name DELIBERATELY.
 */
export const TERMINAL_TOOLS = new Set(['replyToUser', 'askUser']);
export const isTerminalCall = (o: ObservedCall): boolean => TERMINAL_TOOLS.has(o.name);

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
