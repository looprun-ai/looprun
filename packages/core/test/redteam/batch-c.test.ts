/**
 * RED-TEAM BATCH C — the permanent break record for the LITERAL reply/arg guards.
 *
 * Each `it` documents ONE attack. For the SURVIVING guards the assertion encodes the observed verdict:
 *  - a `.toBeNull()` on a should-be-CAUGHT reply that PASSES = a CONFIRMED break (guard allowed what it
 *    must catch).
 *  - a `.not.toBeNull()` where the guard OVER-BLOCKS a legitimate reply = a quality bug (false-deny).
 *
 * The four reply-TEXT guards this batch originally broke — replyMentions, replySingleQuestion,
 * replyMaxOccurrences, emptyReply — are DELETED (tier-③, SCG-T5). Their blocks below are REWRITTEN to
 * assert the NEW closure: reply prose stopped being a thing guards read, so the break can no longer be
 * constructed. The describe names still point at the original break (permanent record).
 */
import { describe, expect, it } from 'vitest';
import * as core from '../../src/index.js';
import {
  AgentSpecBase,
  claimCoversRubric,
  degenerationGuard,
  jargonScrub,
  pendingConfirmMustAsk,
  askedEarlier,
} from '../../src/index.js';
import { terminalToolDefs } from '../../src/runtime/terminal.js';
import { createLedger } from '../../src/runtime/ledger.js';
import { finalizeReply } from '../../src/runtime/turn.js';
import type { GuardCtx, ObservedCall, AgentWorld } from '../../src/rules.js';
import type { RespondPayload } from '../../src/runtime/claims.js';

const rctx = (reply: string) => ({ reply, observed: [], turnIndex: 0, history: [] } as unknown as GuardCtx);
const obs = (o: Partial<ObservedCall>): ObservedCall =>
  ({ name: '', args: {}, ok: true, turnIndex: 0, ...o } as ObservedCall);

function fixtureWorld(): AgentWorld {
  return { exec: () => ({}), advanceTurn: () => {}, ingestAttachment: (u: string) => u, toolCalls: [], sseActions: [] };
}

// ── replyMentions → claimCoversRubric (tier-③ deleted; POLARITY break CLOSED) ──
describe('replyMentions', () => {
  // ORIGINAL BREAK (replyMentions): a literal mention scan for "refund" passed on "no refund possible" —
  // a text check cannot read polarity, and no pattern fixes it. CLOSED: coverage is now over the STRUCTURED
  // `did`, and the outcome polarity is a FIELD (claimCoversRubric), never reply prose.
  const didCtx = (did: unknown) => ({ did, observed: [], turnIndex: 0, history: [] } as unknown as GuardCtx);

  it('CLOSED negated-mention: a success rubric is NOT satisfied by a not_found claim on the same target', () => {
    const g = claimCoversRubric({ targets: ['refund'], outcome: 'success' }, 'confirm the refund');
    // The old break: "no refund" satisfied a refund coverage req. Now the not_found polarity is read.
    expect(g.check(didCtx([{ op: 'refund', target: 'refund', outcome: 'not_found' }]))).not.toBeNull();
  });
  it('CLOSED false-failure: a success rubric is NOT satisfied by a failure claim', () => {
    const g = claimCoversRubric({ targets: ['BK-1'], outcome: 'success' }, 'account for BK-1');
    expect(g.check(didCtx([{ op: 'cancel', target: 'BK-1', outcome: 'failure' }]))).not.toBeNull();
  });
  it('HONEST case still passes: a matching-polarity claim satisfies the rubric', () => {
    const g = claimCoversRubric({ targets: ['refund'], outcome: 'success' }, 'confirm the refund');
    expect(g.check(didCtx([{ op: 'refund', target: 'refund', outcome: 'success' }]))).toBeNull();
  });
});

// ── replySingleQuestion / replyMaxOccurrences → DELETED (no sound structural fix) ──
describe('replySingleQuestion / replyMaxOccurrences', () => {
  // ORIGINAL BREAKS (batch-c): a second question worded without a '?' (or a full-width '？') defeated the
  // one-'?' count; asks worded OUTSIDE the CTA lemma list bypassed the cap. Both are punctuation/CTA
  // LITERALISM with no sound structural fix — the concern is TEXT judgment, now an `llmCheck` rubric.
  // Recorded here as a permanent deletion: the fragile guards no longer exist, so the break cannot be built.
  it('CLOSED by deletion: the fragile factories are gone from the public surface', () => {
    const api = core as Record<string, unknown>;
    expect(api.replySingleQuestion).toBeUndefined();
    expect(api.replyMaxOccurrences).toBeUndefined();
    expect(api.replyMentions).toBeUndefined();
  });
});

// ── emptyReply → the ENGINE FLOOR in finalizeReply (tier-③ guard deleted; zero-width break CLOSED by
// the runtime, NOT by the schema) ──
describe('emptyReply', () => {
  // ORIGINAL BREAK (batch-a/c): a zero-width U+200B / word-joiner U+2060 reply survived trim() and passed
  // the emptyReply guard as "non-empty". The respond terminal's `message` minLength 1 does NOT close this:
  // the backend ships that constraint to the provider (MI-T5), but a zero-width string SATISFIES it — it can
  // never decide emptiness (proven directly below). The real guarantee is `finalizeReply`'s blank-delivery FLOOR
  // (`runtime/turn.ts`): it strips zero-width/format characters from the composed delivery and, when still
  // blank, routes to the non-empty engine-derived exhaustion closure — proven by feeding the exact
  // zero-width payload through the real pipeline, not by inspecting the schema.
  it('the schema minLength is DECLARED — but a zero-width message satisfies it, so it stops nothing', () => {
    const [respond] = terminalToolDefs();
    const props = (respond.inputSchema as { properties: Record<string, { minLength?: number }> }).properties;
    expect(props.message.minLength).toBe(1);
    expect((respond.inputSchema as { required: string[] }).required).toContain('message');
  });
  it('CLOSED by the engine FLOOR: a zero-width-only message routes finalizeReply to the non-empty closure', async () => {
    const spec = new AgentSpecBase({ id: 'a', mode: 'M', persona: 'p', tools: [] });
    const ledger = createLedger();
    // U+200B (zero-width space) + U+2060 (word joiner) — survives .trim() as a non-empty string.
    const zeroWidth: RespondPayload = { message: '\u200B\u2060', did: [{ op: 'inform' }] };
    const out = await finalizeReply(spec, undefined, fixtureWorld(), ledger, zeroWidth, async () => zeroWidth, 1);
    expect(out.exhausted).toBe(true);
    expect(out.text.trim().length).toBeGreaterThan(0);
  });
  it('CLOSED by deletion: the emptyReply factory is gone from the public surface', () => {
    expect((core as Record<string, unknown>).emptyReply).toBeUndefined();
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
  // BREAK: an UNRELATED ask this turn satisfies the pending-confirm relay while the reply
  // summarizes the destructive act as DONE — the guard never checks the ask relates to the probe.
  it('BREAK unrelated-ask: an ask about a different topic clears a pending destructive confirm', () => {
    const g = pendingConfirmMustAsk();
    const ctx = {
      turnIndex: 3,
      reply: 'Your account has been permanently deleted.',
      observed: [
        obs({ name: 'deleteAccount', turnIndex: 3, ok: true, resultFlags: { requiresConfirmation: true } }),
        obs({ name: 'respond', turnIndex: 3, ok: true, args: { message: 'What is your billing email?', did: [{ op: 'ask' }] } }),
      ],
    } as unknown as GuardCtx;
    expect(g.check(ctx)).toBeNull(); // pending confirm relayed by an off-topic ask → allowed
  });
});

// ── askedEarlier ─────────────────────────────────────────────────────────────
describe('askedEarlier', () => {
  // BREAK: an earlier-turn ask about a DIFFERENT arg licenses recording THIS arg — no association.
  it('BREAK unrelated-ask: earlier ask (any topic) licenses recording a different value', () => {
    const g = askedEarlier({ tool: 'completeMaintenance', arg: 'diagnosis' });
    const ctx = {
      tool: 'completeMaintenance',
      turnIndex: 2,
      args: { diagnosis: 'engine seized' },
      history: [{ turnIndex: 1, userText: '', reply: 'your name?', toolCalls: [], did: [{ op: 'ask' }], asked: true, attemptedCalls: [], guardEvents: [] }],
      observed: [],
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
      history: [{ turnIndex: 1, userText: '', reply: 'q?', toolCalls: [], did: [{ op: 'ask' }], asked: true, attemptedCalls: [], guardEvents: [] }],
      observed: [],
    } as unknown as GuardCtx;
    expect(g.check(ctx)).not.toBeNull();
  });
});
