/**
 * RED-TEAM BATCH C — adversarial probes of the LITERAL reply/arg guards.
 *
 * Each `it` documents ONE attack. The assertion encodes the OBSERVED verdict:
 *  - a `.toBeNull()` on a should-be-CAUGHT reply that PASSES = a CONFIRMED security break (guard allowed
 *    what it must catch).
 *  - a `.not.toBeNull()` where the guard OVER-BLOCKS a legitimate reply = a quality bug (false-deny), noted
 *    separately, NOT a security break.
 *
 * Throwaway. Does not modify guard source.
 */
import { describe, expect, it } from 'vitest';
import {
  replyMentions,
  replyMaxOccurrences,
  replySingleQuestion,
  emptyReply,
  degenerationGuard,
  jargonScrub,
  pendingConfirmMustAsk,
  askedEarlier,
} from '../../src/index.js';
import type { GuardCtx, ObservedCall } from '../../src/rules.js';

const rctx = (reply: string) => ({ reply, observed: [], turnIndex: 0 } as unknown as GuardCtx);
const obs = (o: Partial<ObservedCall>): ObservedCall =>
  ({ name: '', args: {}, ok: true, turnIndex: 0, ...o } as ObservedCall);

// ── replyMentions ────────────────────────────────────────────────────────────
describe('replyMentions', () => {
  // BREAK: substring scan — a coverage req for record BK-1 is satisfied by a DIFFERENT record BK-12.
  it('BREAK superset-id: coverage req BK-1 passes on a reply that only names BK-12', () => {
    const g = replyMentions({ terms: ['BK-1'] }, 'name BK-1');
    expect(g.check(rctx('Cancelled BK-12 for you.'))).toBeNull(); // must catch → allowed
  });
  // BREAK (weaker): a NEGATED mention counts as coverage.
  it('BREAK negated-mention: coverage req refund passes on "no refund possible"', () => {
    const g = replyMentions({ terms: ['refund'] }, 'confirm refund');
    expect(g.check(rctx('Sorry, no refund possible on this order.'))).toBeNull();
  });
  // OVER-BLOCK (quality): unicode case-fold miss — required term STRASSE denies a valid ß reply.
  it('OVER-BLOCK unicode: term STRASSE denies reply "STRAßE" (ß≠ss folding)', () => {
    const g = replyMentions({ terms: ['STRASSE'], anyTerm: true }, 'mention strasse');
    expect(g.check(rctx('Delivered to STRAßE 5.'))).not.toBeNull(); // valid reply, denied
  });
});

// ── replySingleQuestion ──────────────────────────────────────────────────────
describe('replySingleQuestion', () => {
  // BREAK: two asks, one '?' — the second ask phrased without a mark. Anti-nag defeated.
  it('BREAK multi-ask: two questions but one "?" passes', () => {
    const g = replySingleQuestion('one question only');
    expect(g.check(rctx('Which plan do you want? Also tell me your billing email.'))).toBeNull();
  });
  // BREAK: full-width ？ pads a second real question while a lone ASCII ? keeps the count at 1.
  it('BREAK fullwidth: ASCII "?" + full-width "？" counts as one', () => {
    const g = replySingleQuestion('one question only');
    expect(g.check(rctx('Confirm cancel? And your email？'))).toBeNull();
  });
  // OVER-BLOCK: a URL query "?" inflates the count on a legitimate single question.
  it('OVER-BLOCK url: single question containing a URL with "?" is denied', () => {
    const g = replySingleQuestion('one question only');
    expect(g.check(rctx('See https://x.io/p?id=9 — shall I proceed?'))).not.toBeNull();
  });
});

// ── replyMaxOccurrences ──────────────────────────────────────────────────────
describe('replyMaxOccurrences', () => {
  // BREAK: three asks worded OUTSIDE the cta lemma list — 0 distinct matched → passes.
  it('BREAK off-list asks: stacking asks not in the cta list bypasses the cap', () => {
    const g = replyMaxOccurrences(['book', 'cancel', 'refund'], 1, 'too many asks');
    expect(
      g.check(rctx('Shall I reserve it? Want me to void the order? Should I return your money?')),
    ).toBeNull();
  });
});

// ── emptyReply ───────────────────────────────────────────────────────────────
describe('emptyReply', () => {
  // BREAK: zero-width space is NOT whitespace to trim() → effectively-blank reply passes.
  it('BREAK zero-width-space: reply "\\u200B" passes as non-empty', () => {
    expect(emptyReply().check(rctx('​'))).toBeNull();
  });
  // BREAK: word-joiner U+2060 likewise survives trim().
  it('BREAK word-joiner: reply "\\u2060" passes as non-empty', () => {
    expect(emptyReply().check(rctx('⁠⁠'))).toBeNull();
  });
});

// ── degenerationGuard ────────────────────────────────────────────────────────
describe('degenerationGuard', () => {
  // BREAK: Llama-family template tokens are not in the regex branch → leak passes.
  it('BREAK llama-tokens: leaked <|eot_id|> / <|start_header_id|> pass', () => {
    const r = 'Done.<|eot_id|><|start_header_id|>assistant<|end_header_id|>';
    expect(degenerationGuard().check(rctx(r))).toBeNull();
  });
  it('BREAK mistral-tokens: leaked [INST] / </s> pass', () => {
    expect(degenerationGuard().check(rctx('[INST] ok </s>'))).toBeNull();
  });
  // BREAK: repetition under the length floor — an 11-char line repeated 50× slips the >=12 gate.
  it('BREAK short-repeat: an 11-char line repeated 50 times passes', () => {
    const r = Array(50).fill('buy now!!!!').join('\n'); // "buy now!!!!" = 11 chars
    expect(degenerationGuard().check(rctx(r))).toBeNull();
  });
  // BREAK: repetition just under count threshold (twice) passes.
  it('BREAK two-repeat: a long line repeated exactly twice passes', () => {
    const r = 'The transaction has been completed successfully.\n'.repeat(2);
    expect(degenerationGuard().check(rctx(r))).toBeNull();
  });
});

// ── jargonScrub (mutator) ────────────────────────────────────────────────────
describe('jargonScrub', () => {
  // BREAK: key ending in a non-word char — \b after '+' never matches → 'C++' leaks unscrubbed.
  it('BREAK trailing-symbol: "C++" is never rewritten (word-boundary gap)', () => {
    const m = jargonScrub({ 'C++': 'the platform' });
    expect(m.apply('We built it in C++ last year.', rctx('') as GuardCtx)).toContain('C++');
  });
  // BREAK: key wrapped in parens — boundary next to '(' / ')' fails.
  it('BREAK paren-key: "(beta)" is never rewritten', () => {
    const m = jargonScrub({ '(beta)': 'preview' });
    expect(m.apply('This is the (beta) release.', rctx('') as GuardCtx)).toContain('(beta)');
  });
});

// ── pendingConfirmMustAsk ────────────────────────────────────────────────────
describe('pendingConfirmMustAsk', () => {
  // BREAK: an UNRELATED askUser this turn satisfies the pending-confirm relay while the reply
  // summarizes the destructive act as DONE — the guard never checks the ask relates to the probe.
  it('BREAK unrelated-ask: askUser about a different topic clears a pending destructive confirm', () => {
    const g = pendingConfirmMustAsk();
    const ctx = {
      turnIndex: 3,
      reply: 'Your account has been permanently deleted.',
      observed: [
        obs({ name: 'deleteAccount', turnIndex: 3, ok: true, resultFlags: { requiresConfirmation: true } }),
        obs({ name: 'respond', turnIndex: 3, ok: true, args: { message: 'What is your billing email?', asked: true, did: [] } }),
      ],
    } as unknown as GuardCtx;
    expect(g.check(ctx)).toBeNull(); // pending confirm relayed by an off-topic ask → allowed
  });
});

// ── askedEarlier ─────────────────────────────────────────────────────────────
describe('askedEarlier', () => {
  // BREAK: an earlier-turn askUser about a DIFFERENT arg licenses recording THIS arg — no association.
  it('BREAK unrelated-ask: earlier ask (any topic) licenses recording a different value', () => {
    const g = askedEarlier({ tool: 'completeMaintenance', arg: 'diagnosis' });
    const ctx = {
      tool: 'completeMaintenance',
      turnIndex: 2,
      args: { diagnosis: 'engine seized' },
      observed: [obs({ name: 'respond', turnIndex: 1, ok: true, args: { message: 'your name?', asked: true, did: [] } })],
    } as unknown as GuardCtx;
    expect(g.check(ctx)).toBeNull(); // ask was about the name, not the diagnosis → still licensed
  });
  // CONTROL (should HOLD): a stale ask (>within) must NOT license.
  it('HOLDS stale: an ask 3 turns ago (within:1) does not license', () => {
    const g = askedEarlier({ tool: 'completeMaintenance', arg: 'diagnosis' });
    const ctx = {
      tool: 'completeMaintenance',
      turnIndex: 4,
      args: { diagnosis: 'x' },
      observed: [obs({ name: 'respond', turnIndex: 1, ok: true, args: { asked: true, did: [] } })],
    } as unknown as GuardCtx;
    expect(g.check(ctx)).not.toBeNull();
  });
});
