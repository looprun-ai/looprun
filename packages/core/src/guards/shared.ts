/**
 * Guard-surface INTERNALS — the helpers the guard kinds share.
 *
 * Module-local by design: nothing here is exported from `guards/index.ts`, from `@looprun-ai/core`, or
 * from `@looprun-ai/core/internal`. They are the mechanisms the kinds are built out of (terminal
 * filtering, flag-safe regex testing, the grounding readers), not vocabulary a spec author binds.
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
 * filter these out first: without the filter `noFalseFailureClaim`'s
 * precondition was vacuously true and it vetoed the HONEST "I cannot do X" reply of a turn in which no
 * domain tool ran at all — the reply then went to redrive and out as an exhaustion stub (the failure
 * class measured across 7 models). Guards keyed on a NAMED tool (`noFabricatedSuccess`,
 * `destructiveThrottle`, `maxCalls`, `destructiveClaimRequiresSuccess`, …) are unaffected — a terminal
 * name is never in their set — and the two kinds that read `askUser` DELIBERATELY (`confirmFirst`'s
 * prior-ask arm, `noInstructionFromData`'s approval shape) keep reading it by name.
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
 * it is handed — it must be immune by construction. `noFabricatedSuccess` and `allMatches` already
 * rebuilt a local copy; this helper is that discipline made universal.
 *
 * Non-stateful regexes (the common case) are tested directly — no allocation on the hot path.
 */
export function matches(re: RegExp, s: string): boolean {
  if (!re.global && !re.sticky) return re.test(s);
  return new RegExp(re.source, re.flags.replace(/[gy]/g, '')).test(s);
}

/** Split a reply into sentences on ./!/? boundaries — pure, LANGUAGE-NEUTRAL (punctuation only; no
 *  stateful regex — split() takes no g/y flag, so there is no lastIndex to leak between calls). */
export function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

// ── RISK-FAMILY readers (the grounding + escaping helpers) ───────────────────

/** Escape a literal for embedding in a character-safe alternation. */
export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** All matches of `re` in `text`. Builds a FRESH global copy per call, so a caller's shared regex never
 *  leaks a `lastIndex` between turns (the T1 purity discipline). */
export function allMatches(re: RegExp, text: string): string[] {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  return text.match(g) ?? [];
}

/** Flatten every string-ish token of a tool RESULT — both keys and scalar values — into a list. Keys
 *  are included because a field NAME is exactly what a field-name-keyed PII/regulated pattern matches
 *  (`{ dosage: '500 mg' }` grounds both "dosage" and "500 mg"). Depth-bounded, pure. */
export function flattenResultText(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 6 || value == null) return out;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) flattenResultText(v, out, depth + 1);
    return out;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.push(k);
      flattenResultText(v, out, depth + 1);
    }
  }
  return out;
}

/** Every tool RESULT recorded on the world, as one text blob (`scope:'conversation'`), or only the
 *  results of tools that ran OK THIS turn (`scope:'turn'` — the GROUNDING set for reply checks).
 *
 *  `ObservedCall` deliberately carries no result payload, so the results are read from the world's own
 *  `toolCalls` ledger (world/projection — firewall-clean) and turn-scoped by intersecting with the
 *  observed NAMES of this turn. That intersection is a conservative OVER-approximation (a second
 *  result of the same tool from an earlier turn also counts as grounding), which errs toward ALLOW —
 *  the safe direction for a reply gate that must never destroy an honest answer. A host with a richer
 *  ledger can replace the whole reader via `resultText`. */
export function toolResultText(ctx: GuardCtx, scope: 'turn' | 'conversation', reader?: (ctx: GuardCtx) => string): string {
  if (reader) return reader(ctx);
  const calls = Array.isArray(ctx.world?.toolCalls) ? ctx.world.toolCalls : [];
  // TERMINALS EXCLUDED: `replyToUser`/`askUser` are pushed into
  // `observed` with ok:true, so an unfiltered turn set named them as grounding sources — and their
  // ledger entries carry the MODEL'S OWN reply. A reply could then ground its own fabricated PII /
  // regulated figure simply by containing it. Grounding must come from domain tool results only.
  const names =
    scope === 'turn'
      ? new Set(
          ctx.observed
            .filter((o) => o.turnIndex === ctx.turnIndex && o.ok && !isTerminalCall(o))
            .map((o) => o.name),
        )
      : null;
  const out: string[] = [];
  for (const call of calls) if (!names || names.has(call.name)) flattenResultText(call.result, out);
  return out.join('\n');
}

/** Whitespace/case-normalized containment — "is this token grounded in that blob?". */
export const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();
