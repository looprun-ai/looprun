/**
 * RED-TEAM BATCH C — the permanent break record for the LITERAL reply/arg guards.
 *
 * Each `it` documents ONE attack. The assertion encodes the observed verdict:
 *  - a `.toBeNull()` on a should-be-CAUGHT reply that PASSES = a CONFIRMED break (guard allowed what it
 *    must catch).
 *  - a `.not.toBeNull()` where the guard OVER-BLOCKS a legitimate reply = a quality bug (false-deny).
 *
 * Reply prose is not a thing guards read: coverage of what a turn did is decided over the structured
 * `did`, and the blank-delivery floor lives in the runtime. The text-literalism attacks below
 * therefore have no guard left to land on, and the blocks assert the closure that replaces them.
 */
import { describe, expect, it } from 'vitest';
import {
  AgentSpecBase,
  mustAccountFor,
  degenerationGuard,
  jargonScrub,
  valueFromUser,
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

// ── rubric coverage reads POLARITY, so the negated-mention attack has nothing to land on ──
describe('mustAccountFor — coverage over structured `did`', () => {
  // A literal mention scan cannot read polarity: scanning a reply for "refund" matches "no refund
  // possible", and no pattern fixes that. Coverage is decided over the STRUCTURED `did` instead, where
  // the outcome polarity is a FIELD, never reply prose.
  const didCtx = (did: unknown) => ({ did, observed: [], turnIndex: 0, history: [] } as unknown as GuardCtx);

  it('CLOSED negated-mention: a success rubric is NOT satisfied by a not_found claim on the same target', () => {
    const g = mustAccountFor({ records: ['refund'], outcome: 'success' }, 'confirm the refund');
    // A text scan would take "no refund" for coverage of a refund; the not_found polarity is a field.
    expect(g.check(didCtx([{ op: 'refund', target: 'refund', outcome: 'not_found' }]))).not.toBeNull();
  });
  it('CLOSED false-failure: a success rubric is NOT satisfied by a failure claim', () => {
    const g = mustAccountFor({ records: ['BK-1'], outcome: 'success' }, 'account for BK-1');
    expect(g.check(didCtx([{ op: 'cancel', target: 'BK-1', outcome: 'failure' }]))).not.toBeNull();
  });
  it('HONEST case still passes: a matching-polarity claim satisfies the rubric', () => {
    const g = mustAccountFor({ records: ['refund'], outcome: 'success' }, 'confirm the refund');
    expect(g.check(didCtx([{ op: 'refund', target: 'refund', outcome: 'success' }]))).toBeNull();
  });
});

// ── the BLANK-DELIVERY FLOOR lives in the runtime, NOT in the schema ──
describe('blank-delivery floor', () => {
  // A zero-width U+200B / word-joiner U+2060 reply survives trim() and reads as "non-empty" to any
  // check that only trims. The respond terminal's `message` minLength 1 does NOT close this: the
  // backend ships that constraint to the provider, but a zero-width string SATISFIES it — a length
  // bound can never decide emptiness (proven directly below). The guarantee is `finalizeReply`'s
  // blank-delivery FLOOR (`runtime/turn.ts`): it strips zero-width/format characters from the composed
  // delivery and, when still blank, routes to the non-empty engine-derived exhaustion closure — proven
  // by feeding the exact zero-width payload through the real pipeline, not by inspecting the schema.
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
    const m = jargonScrub({ '(beta)': 'early access' });
    expect(m.apply('This is the (beta) release.', rctx('') as GuardCtx)).toContain('(beta)');
  });
});
describe('valueFromUser', () => {
  // CLOSED: what licenses the write is the USER having said the value, so a question about something
  // else — or no question at all — buys the agent nothing.
  it('CLOSED unrelated-ask: an earlier question about another field licenses no value', () => {
    const g = valueFromUser({ arg: 'diagnosis' });
    const ctx = {
      tool: 'completeMaintenance',
      turnIndex: 2,
      args: { diagnosis: 'engine seized' },
      userText: 'go ahead',
      history: [{ turnIndex: 1, userText: 'Marcos', reply: 'your name?', toolCalls: [], did: [{ op: 'ask' }], attemptedCalls: [], guardEvents: [] }],
      observed: [],
    } as unknown as GuardCtx;
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CLOSED paraphrase: the agent\'s wording for what the user said is not what the user said', () => {
    const g = valueFromUser({ arg: 'diagnosis' });
    const ctx = {
      tool: 'completeMaintenance',
      turnIndex: 2,
      args: { diagnosis: 'engine seized' },
      userText: 'the engine locked up',
      history: [],
      observed: [],
    } as unknown as GuardCtx;
    expect(g.check(ctx)).not.toBeNull();
  });

  it('CONTROL: the value the user actually said is recorded', () => {
    const g = valueFromUser({ arg: 'diagnosis' });
    const ctx = {
      tool: 'completeMaintenance',
      turnIndex: 2,
      args: { diagnosis: 'the engine locked up' },
      userText: 'the engine locked up',
      history: [],
      observed: [],
    } as unknown as GuardCtx;
    expect(g.check(ctx)).toBeNull();
  });
});

