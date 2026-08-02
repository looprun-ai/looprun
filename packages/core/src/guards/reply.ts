/**
 * REPLY guards — the shape and content of the user-facing message: required mentions, CTA budget,
 * single question, label confirmation, the empty/degenerate reply lints, disclosure minimisation and
 * the instruction-from-data proxy (risk families 1 and 2), plus the egress jargon scrub.
 */
import type { ReplyMutator } from '../rules.js';
import type { Guard } from '../rules.js';
import { escapeRe, lc } from './shared.js';

/**
 * The reply must MENTION the given `terms` — a literal, case-insensitive substring scan (terms are DATA
 * from config, never patterns). Two modes, chosen by `anyTerm`:
 *  - `anyTerm: true` — AT LEAST ONE term suffices (the former `replyMustMention`): a required disclaimer,
 *    a referral phrase, any single element of coverage that is the same on every turn.
 *  - `anyTerm: false` (DEFAULT) — EVERY term is required and the reply must be non-empty (the former
 *    `replyConfirmsLabels`): the model just acted on identified records and the user must see WHICH ones.
 * `prose` = derived rule (prose≠reason law) — pass it to override the mode-appropriate default.
 */
export function replyMentions(
  opts: { terms: string[]; anyTerm?: boolean },
  reason: string,
  prose?: string,
): Guard {
  const terms = [...opts.terms];
  const anyTerm = opts.anyTerm ?? false;
  return {
    kind: 'replyMentions',
    dim: 'behavior',
    meta: { requiredStrings: [...terms] },
    check(ctx) {
      const raw = ctx.reply ?? '';
      if (anyTerm) {
        const r = lc(raw);
        return terms.some((t) => r.includes(lc(t))) ? null : reason;
      }
      // all-of: the reply must be non-empty AND name every term (case-insensitive).
      if (raw.trim() === '') return reason;
      const r = lc(raw);
      return terms.every((t) => r.includes(lc(t))) ? null : reason;
    },
    prose: () =>
      prose ??
      (anyTerm
        ? `every reply must mention at least one of: ${terms.join(', ')}`
        : `name ${terms.join(', ')} in the reply`),
  };
}

/**
 * At most `n` DISTINCT CTA lemmas from `ctas` may appear in one reply. `prose` = derived rule.
 *
 * NOT an occurrence counter, despite the kind's name: it counts how many
 * DIFFERENT entries of `ctas` the reply contains, so the same CTA repeated five times passes while two
 * different CTAs once each can deny. The CHECK is the intended semantics — the rule it enforces is
 * "don't stack a pile of different asks onto one reply" (anti-nag), which is what a spec author binds it
 * for, and a true occurrence counter would also fire on incidental re-mentions of one CTA inside a
 * genuinely single ask. What was wrong was the PROSE, which read as an anti-repetition rule; it now
 * states the DISTINCT-item semantics explicitly, so a model reading the trunk cannot infer the other
 * rule. The kind's NAME is kept: it is the byte-stable ratchet/proof key and appears in every certified
 * bundle's guard ids — renaming it is a breaking change that buys nothing the prose fix does not.
 */
export function replyMaxOccurrences(ctas: string[], n: number, reason: string, prose?: string): Guard {
  return {
    kind: 'replyMaxOccurrences',
    dim: 'behavior',
    check(ctx) {
      const r = lc(ctx.reply);
      const distinct = ctas.filter((c) => r.includes(lc(c))).length;
      return distinct > n ? reason : null;
    },
    prose: () =>
      prose ??
      `use at most ${n} DIFFERENT of these calls-to-action in one reply (they are counted as distinct asks, not as repetitions): ${ctas.join(', ')}`,
  };
}

/** The reply must be a single short question (exactly one '?'). `prose` = derived rule. */
export function replySingleQuestion(reason: string, prose?: string): Guard {
  return {
    kind: 'replySingleQuestion',
    dim: 'behavior',
    check(ctx) {
      const questionMarks = ((ctx.reply ?? '').match(/\?/g) ?? []).length;
      return questionMarks === 1 ? null : reason;
    },
    prose: () => prose ?? 'ask exactly ONE question per reply',
  };
}

/** The final reply must be non-empty. */
export function emptyReply(): Guard {
  return {
    kind: 'emptyReply',
    dim: 'behavior',
    check(ctx) {
      return (ctx.reply ?? '').trim() === ''
        ? 'Your reply was EMPTY — produce the complete user-facing message now, in the user\'s language.'
        : null;
    },
    prose: () => 'never end a turn with an empty reply',
  };
}

/**
 * Output-channel DEGENERATION lint — domain-neutral, always-on (Minimal layer). Catches the weak-model
 * failure class (leaked reasoning/tool markup — `<think>`, `<tool_call>`, `<tool_response>`, chat-template
 * tokens, raw `replyToUser{` — and run-away repetition). These branches are an ARTIFACT-SHAPE lint over
 * fixed scaffolding tokens (a model-layer property, not business text judgment), so they carry NO param
 * and stay in the deterministic surface. The former third-person SELF-NARRATION branch was a
 * text-judgment param (`selfNarrationRe`) — that job is text judgment, so it is now `llmCheck`'s (an
 * author who wants it binds an `llmCheck` rubric); this guard no longer takes any RegExp param.
 * A hit routes into the existing redrive → exhaustion battery (redrives are reply-only regenerations,
 * which is exactly what this class needs). Pure check: no clock/RNG/IO; fresh regexes per call.
 */
export function degenerationGuard(): Guard {
  return {
    kind: 'degenerationGuard',
    dim: 'behavior',
    check(ctx) {
      const r = String(ctx.reply ?? '');
      if (!r) return null;
      if (/<think|<\/think|<tool_call|<tool_response|<\|im_(?:start|end)\|>|\[end of turn\]|<\|assistant\|>|respond\s*\{/i.test(r)) {
        return 'the reply leaks internal scaffolding (think blocks / tool-call markup / chat-template tokens) — rewrite it as ONE short, clean user-facing message with none of that.';
      }
      // run-away repetition: any non-trivial line repeated 3+ times
      const counts = new Map<string, number>();
      for (const line of r.split('\n').map((l) => l.trim()).filter((l) => l.length >= 12)) {
        const n = (counts.get(line) ?? 0) + 1;
        counts.set(line, n);
        if (n >= 3) return 'the reply repeats the same line over and over — rewrite it as ONE short message that says it once.';
      }
      return null;
    },
    prose: () =>
      'reply in ONE clean user-facing message — never leak internal reasoning, template tokens, or repeated lines',
  };
}

// ── Egress mutator ───────────────────────────────────────────────────────────

/**
 * Deterministic egress jargon scrub (word-boundary, case-insensitive) before the reply leaves.
 *
 * KEYS ARE ESCAPED. The keys are arbitrary domain strings — internal field
 * names, statuses, product names — and were interpolated RAW into the pattern. A key holding a regex
 * metacharacter either threw at construction (`'(beta)'` → an unbalanced group; `'C++'` → "nothing to
 * repeat") or silently matched the wrong thing, and a throw here is a construction-time crash of the
 * whole spec. `escapeRe` (a shared guard helper) makes the key a literal.
 *
 * NOTE the `\b…\b` anchors are kept as-is: for a key whose first/last character is a non-word character
 * (`'(beta)'`, `'C++'`) a word boundary next to it will not match as an author might expect. That is a
 * pre-existing property of the word-boundary contract this mutator advertises, not something escaping
 * changes — but it no longer THROWS, which is the defect.
 */
export function jargonScrub(map: Record<string, string>): ReplyMutator {
  const entries = Object.entries(map).map(([from, to]) => ({ re: new RegExp(`\\b${escapeRe(from)}\\b`, 'gi'), to }));
  return {
    kind: 'jargonScrub',
    apply(reply) {
      let out = reply;
      for (const { re, to } of entries) out = out.replace(re, to);
      return out;
    },
  };
}
