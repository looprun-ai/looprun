/**
 * REPLY guards — what survives on the user-facing message after the tier-③ deletion (SCG-T5): the
 * always-on degeneration ARTIFACT lint and the egress jargon scrub (a mutator). The reply-TEXT coverage
 * guards that used to live here — `replyMentions`, `replySingleQuestion`, `replyMaxOccurrences`,
 * `emptyReply` — are DELETED (see the tombstone in `catalog.ts`): reply prose stopped being a thing guards
 * READ (the red-team broke every literal scan structurally). Reply-coverage/polarity moved to the
 * structured cross-check `claimCoversRubric` (honesty.ts); the empty-reply floor is subsumed by the
 * respond schema (`message` minLength 1) + the forced-terminal fallback.
 */
import type { ReplyMutator } from '../rules.js';
import type { Guard } from '../rules.js';
import { escapeRe } from './shared.js';

/**
 * Output-channel DEGENERATION lint — domain-neutral, always-on (Minimal layer). Catches the weak-model
 * failure class (leaked reasoning/tool markup — `<think>`, `<tool_call>`, `<tool_response>`, chat-template
 * tokens, raw `respond{` — and run-away repetition). These branches are an ARTIFACT-SHAPE lint over
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
