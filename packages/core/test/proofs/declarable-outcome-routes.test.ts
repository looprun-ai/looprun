/**
 * THE GROUNDED DENY NAMES WHAT IS DECLARABLE.
 *
 * When `claimIsGrounded` rejects a claim it appends, in exactly this shape, the core outcomes the SAME
 * action history would ground for the SAME target — so the rewrite has a fact to reach for instead of a
 * second guess at the outcome word:
 *
 * ```
 *   Declarable with this turn's evidence: blocked, refused, no_op.
 *   Declarable with this turn's evidence: none.
 * ```
 *
 * The list is computed by the grounding rules themselves — never authored, never a subset chosen by
 * hand — so an outcome that appears here is one the guard would accept on the next pass.
 */
import { describe, it, expect } from 'vitest';
import { claimIsGrounded } from '../../src/guards/honesty.js';
import type { GuardCtx, ObservedCall } from '../../src/rules.js';
import type { Intention } from '../../src/runtime/claims.js';

/** The world side of the action history: the result the world ISSUED for each call. */
function worldWith(toolCalls: Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }>): GuardCtx['world'] {
  return {
    exec: () => ({ success: true }),
    advanceTurn: () => {},
    ingestAttachment: (u: string) => u,
    toolCalls,
    sseActions: [],
  } as GuardCtx['world'];
}

const call = (name: string, args: Record<string, unknown>, over: Partial<ObservedCall> = {}): ObservedCall => ({
  name,
  args,
  ok: true,
  turnIndex: 0,
  ...over,
});

/** The reply-side ctx `checkReply` builds, over one read of bk_1003 that changed nothing. */
function ctxWith(did: Intention[]): GuardCtx {
  return {
    args: {},
    world: worldWith([{ name: 'getBooking', args: { bookingId: 'bk_1003' }, result: { id: 'bk_1003', status: 'active' } }]),
    observed: [call('getBooking', { bookingId: 'bk_1003' })],
    turnIndex: 0,
    userText: '',
    history: [],
    reply: 'anything',
    attemptedThisTurn: [],
    did,
  } as GuardCtx;
}

const deny = (did: Intention[]) => claimIsGrounded({ writeTools: ['releaseDeposit'] }).check(ctxWith(did));

describe('negative — the deny carries the declarable list', () => {
  it('states the whole sentence, outcomes in the core order', () => {
    expect(deny([{ op: 'release', target: 'bk_1003', outcome: 'success' }])).toBe(
      'You reported "release" on bk_1003 as success, but nothing this turn shows that — report only what actually happened.' +
        " Declarable with this turn's evidence: blocked, refused, no_op.",
    );
  });

  it('says `none` when the evidence of the turn would ground no outcome at all', () => {
    expect(deny([{ op: 'release', target: 'bk_9999', outcome: 'success' }])).toBe(
      'You reported "release" on bk_9999 as success, but nothing this turn shows that — report only what actually happened.' +
        " Declarable with this turn's evidence: none.",
    );
  });

  it('the hint reads the same whether or not the claim named a record', () => {
    const message = deny([{ op: 'release', outcome: 'not_found' }]);
    expect(message).toContain(" Declarable with this turn's evidence: ");
  });
});

describe('positive — an outcome the deny listed is one the guard then accepts', () => {
  it('accepts every outcome the previous deny named', () => {
    for (const outcome of ['blocked', 'refused', 'no_op'] as const) {
      expect(deny([{ op: 'release', target: 'bk_1003', outcome }])).toBeNull();
    }
  });
});

describe('neutral — a grounded claim carries no hint at all', () => {
  it('adds nothing to a turn the guard has no objection to', () => {
    expect(deny([{ op: 'inform' }])).toBeNull();
  });
});
