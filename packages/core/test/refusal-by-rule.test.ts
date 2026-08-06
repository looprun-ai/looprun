/**
 * REFUSAL BY RULE — a `blocked`/`refused` claim grounds without a vetoed attempt or a failed call when
 * the turn READ the entity and CHANGED NOTHING: the refusal is the spec's own law speaking, and demanding
 * an attempt as its proof would order the model to reach for the act it is refusing. An EFFECTED write on
 * the entity still refutes the refusal — reading the record and then acting on it is not a rule-grounded
 * no-op, and a refusal claim over that write is a fabrication like any other.
 */
import { describe, expect, it } from 'vitest';
import type { GuardCtx, ObservedCall } from '../src/rules.js';
import type { Intention } from '../src/runtime/claims.js';
import { claimIsGrounded } from '../src/guards/honesty.js';

/** A world whose `toolCalls` carry the RESULT the action history observed for a call (name + args keyed). */
function worldWith(toolCalls: Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }>): GuardCtx['world'] {
  return {
    exec: () => ({ success: true }),
    advanceTurn: () => {},
    ingestAttachment: (u: string) => u,
    toolCalls,
    sseActions: [],
  } as GuardCtx['world'];
}

/** A reply-side GuardCtx (turnIndex 0) — the shape `checkReply` builds. */
function replyCtx(over: Partial<GuardCtx> & { did: Intention[] }): GuardCtx {
  return {
    args: {},
    world: over.world ?? worldWith([]),
    observed: [],
    turnIndex: 0,
    userText: '',
    history: [],
    reply: 'anything',
    attemptedThisTurn: [],
    ...over,
  } as GuardCtx;
}

/** An observed domain call of this turn. */
const call = (
  name: string,
  args: Record<string, unknown>,
  over: Partial<ObservedCall> = {},
): ObservedCall => ({ name, args, ok: true, turnIndex: 0, ...over });

const WRITES = ['releaseDeposit'] as const;

describe('refusal by rule', () => {
  const grounded = (over: Partial<GuardCtx> & { did: Intention[] }) =>
    claimIsGrounded({ writeTools: WRITES }).check(replyCtx(over));

  it('refused grounds on a read that addressed the entity with no effected write', () => {
    const ctx = {
      did: [{ op: 'release', target: 'bk_1003', outcome: 'refused' }] as Intention[],
      observed: [call('getBooking', { bookingId: 'bk_1003' })],
      world: worldWith([{ name: 'getBooking', args: { bookingId: 'bk_1003' }, result: { id: 'bk_1003', status: 'active' } }]),
    };
    expect(grounded(ctx)).toBeNull();
  });

  it('an effected write on the entity still refutes the refusal', () => {
    const ctx = {
      did: [{ op: 'release', target: 'bk_1003', outcome: 'refused' }] as Intention[],
      observed: [
        call('getBooking', { bookingId: 'bk_1003' }),
        call('releaseDeposit', { bookingId: 'bk_1003' }, { tookEffect: true }),
      ],
      world: worldWith([
        { name: 'getBooking', args: { bookingId: 'bk_1003' }, result: { id: 'bk_1003', status: 'active' } },
        { name: 'releaseDeposit', args: { bookingId: 'bk_1003' }, tookEffect: true, result: { id: 'bk_1003' } },
      ]),
    };
    expect(grounded(ctx)).toMatch(/report only what actually happened/);
  });

  it('refused on an entity no read addressed stays ungrounded', () => {
    const ctx = {
      did: [{ op: 'release', target: 'bk_1003', outcome: 'refused' }] as Intention[],
      observed: [call('getBooking', { bookingId: 'bk_9999' })],
      world: worldWith([{ name: 'getBooking', args: { bookingId: 'bk_9999' }, result: { id: 'bk_9999', status: 'active' } }]),
    };
    expect(grounded(ctx)).toMatch(/report only what actually happened/);
  });

  it('the deny lists the outcomes the evidence supports', () => {
    const ctx = {
      did: [{ op: 'release', target: 'bk_1003', outcome: 'pending_confirmation' }] as Intention[],
      observed: [call('getBooking', { bookingId: 'bk_1003' })],
      world: worldWith([{ name: 'getBooking', args: { bookingId: 'bk_1003' }, result: { id: 'bk_1003', status: 'active' } }]),
    };
    const deny = grounded(ctx);
    expect(deny).toMatch(/Declarable for bk_1003 with this turn's evidence: /);
    expect(deny).toContain('refused'); // a read that addressed the entity with no effected write grounds a refusal
    expect(deny).not.toContain('success');
  });
});
