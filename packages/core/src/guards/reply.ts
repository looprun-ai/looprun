/**
 * REPLY guards — everything that acts on the user-facing message: the always-on degeneration ARTIFACT
 * lint and the egress jargon scrub (a mutator). Neither reads reply prose for MEANING, and nothing here
 * does: a literal scan over a reply cannot see polarity, so reply coverage/polarity is the structured
 * cross-check `mustAccountFor` (honesty.ts), and the non-empty guarantee is the engine's
 * blank-delivery floor in `finalizeReply` (a zero-width message satisfies the schema's `minLength`).
 */
import type { ReplyMutator } from '../rules.js';
import type { Guard } from '../rules.js';
import { escapeRe } from './shared.js';

/**
 * Output-channel DEGENERATION lint — domain-neutral, always-on (Minimal layer). Catches the weak-model
 * failure class (leaked reasoning/tool markup — `<think>`, `<tool_call>`, `<tool_response>`, chat-template
 * tokens, raw `respond{` — and run-away repetition). These branches are an ARTIFACT-SHAPE lint over
 * fixed scaffolding tokens (a model-layer property, not business text judgment), so they carry NO param
 * and stay in the deterministic surface. This guard takes no RegExp param at all: a judgment like
 * third-person SELF-NARRATION depends on wording, and wording is `llmCheck`'s job — an author who wants
 * it binds an `llmCheck` question.
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
 * KEYS ARE ESCAPED (`escapeRe`, a shared guard helper, makes each key a literal). The keys are arbitrary
 * domain strings — internal field names, statuses, product names — so a key holding a regex
 * metacharacter would otherwise either throw at construction (`'(beta)'` → an unbalanced group; `'C++'` →
 * "nothing to repeat"), which crashes the whole spec, or silently match the wrong thing.
 *
 * NOTE the `\b…\b` anchors: for a key whose first or last character is a non-word character (`'(beta)'`,
 * `'C++'`) a word boundary next to it will not match as an author might expect. That is a property of
 * the word-boundary contract this mutator advertises; escaping does not change it, and never throwing is
 * the point.
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
