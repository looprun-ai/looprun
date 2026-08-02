/**
 * THE CROSS-CHECK GUARDS — the deterministic honesty core (SCG-T3).
 *
 * The agent DECLARES what it did as STRUCTURE (`ctx.did`), and these three guards ground that
 * declaration against the WORLD LEDGER — which the agent does not control. No guard here reads reply
 * prose; every verdict is a comparison of a `TurnClaim` against `ctx.observed` / `ctx.world.toolCalls`
 * / `ctx.attemptedThisTurn` (LEDGER DATA, never authored patterns — the no-regex law).
 *
 * One `describe` block per row of the grounding table in the task brief, plus the Step-1 vectors:
 * fabricated success, hidden effected write, honest not_found on an empty read, a no-effect probe with
 * a no_op claim, a domain outcome word mapping to a core outcome, an undeclared outcome word, and the
 * rubric polarity in BOTH directions.
 */
import { describe, expect, it } from 'vitest';
import type { GuardCtx, ObservedCall } from '../src/rules.js';
import type { OutcomeMap, TurnClaim } from '../src/runtime/claims.js';
import { claimIsGrounded, claimIsComplete, claimCoversRubric, isEmptyReadResult } from '../src/guards/honesty.js';

/** A world whose `toolCalls` carry the RESULT the ledger observed for a call (name + args keyed). */
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
function replyCtx(over: Partial<GuardCtx> & { did: TurnClaim[] }): GuardCtx {
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

const WRITES = ['createBooking', 'cancelBooking', 'refundOrder'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// claimIsGrounded — the grounding table, one describe per row
// ─────────────────────────────────────────────────────────────────────────────
describe('claimIsGrounded', () => {
  const grounded = (over: Partial<GuardCtx> & { did: TurnClaim[] }, outcomes?: OutcomeMap) =>
    claimIsGrounded({ writeTools: WRITES, outcomes }).check(replyCtx(over));

  it('is a no-op when the turn declared nothing (empty did)', () => {
    expect(grounded({ did: [] })).toBeNull();
  });

  describe('row: undeclared outcome word → NEVER grounds (names the undeclared outcome)', () => {
    it('a word that is neither core nor mapped is a violation', () => {
      const reason = grounded({ did: [{ op: 'book', target: 'BK-1', outcome: 'teleported' }] });
      expect(reason).toBeTruthy();
      expect(reason).toContain('teleported');
    });
  });

  describe("row: success ⇔ ∃ write in calls with tookEffect===true and matches", () => {
    const did: TurnClaim[] = [{ op: 'book', target: 'BK-1', outcome: 'success' }];

    it('grounds against an effected write on the same target', () => {
      const ctx = {
        did,
        observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
        world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true, result: { label: 'BK-1' } }]),
      };
      expect(grounded(ctx)).toBeNull();
    });

    it('FABRICATED success — success claim with NO write is a violation', () => {
      expect(grounded({ did })).toBeTruthy();
    });

    it('a write that did NOT take effect (a probe) does not ground a success claim', () => {
      const ctx = {
        did,
        observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: false })],
      };
      expect(grounded(ctx)).toBeTruthy();
    });

    it('an effected write on a DIFFERENT target does not ground (matches fails)', () => {
      const ctx = {
        did,
        observed: [call('createBooking', { bookingId: 'BK-9' }, { tookEffect: true })],
        world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-9' }, tookEffect: true }]),
      };
      expect(grounded(ctx)).toBeTruthy();
    });

    it('a targetless success claim grounds against ANY effected write', () => {
      const ctx = {
        did: [{ op: 'book', outcome: 'success' }] as TurnClaim[],
        observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      };
      expect(grounded(ctx)).toBeNull();
    });
  });

  describe('row: failure ⇔ ∃ call with ok===false and matches', () => {
    it('grounds against a failed call on the target', () => {
      const ctx = {
        did: [{ op: 'book', target: 'BK-1', outcome: 'failure' }] as TurnClaim[],
        observed: [call('createBooking', { bookingId: 'BK-1' }, { ok: false })],
        world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, result: { error: 'nope' } }]),
      };
      expect(grounded(ctx)).toBeNull();
    });

    it('no failed call → a failure claim is a violation', () => {
      expect(grounded({ did: [{ op: 'book', target: 'BK-1', outcome: 'failure' }] })).toBeTruthy();
    });
  });

  describe('row: blocked/refused ⇔ ∃ vetoed attempt with matches OR ∃ ok===false call', () => {
    it('grounds a blocked claim against a guard-vetoed attempt', () => {
      const ctx = {
        did: [{ op: 'cancel', target: 'BK-1', outcome: 'blocked' }] as TurnClaim[],
        attemptedThisTurn: [{ name: 'cancelBooking', args: { bookingId: 'BK-1' } }],
      };
      expect(grounded(ctx)).toBeNull();
    });

    it('grounds a refused claim against a world refusal (ok:false)', () => {
      const ctx = {
        did: [{ op: 'cancel', target: 'BK-1', outcome: 'refused' }] as TurnClaim[],
        observed: [call('cancelBooking', { bookingId: 'BK-1' }, { ok: false })],
      };
      expect(grounded(ctx)).toBeNull();
    });

    it('no veto and no failed call → blocked claim is a violation', () => {
      expect(grounded({ did: [{ op: 'cancel', target: 'BK-1', outcome: 'blocked' }] })).toBeTruthy();
    });
  });

  describe('row: not_found ⇔ ∃ read (non-write), ok, empty result, matches', () => {
    it('grounds against an empty read on the target', () => {
      const ctx = {
        did: [{ op: 'lookup', target: 'BK-1', outcome: 'not_found' }] as TurnClaim[],
        observed: [call('findBooking', { bookingId: 'BK-1' })],
        world: worldWith([{ name: 'findBooking', args: { bookingId: 'BK-1' }, result: { success: true, data: [] } }]),
      };
      expect(grounded(ctx)).toBeNull();
    });

    it('a NON-empty read does not ground a not_found claim', () => {
      const ctx = {
        did: [{ op: 'lookup', target: 'BK-1', outcome: 'not_found' }] as TurnClaim[],
        observed: [call('findBooking', { bookingId: 'BK-1' })],
        world: worldWith([{ name: 'findBooking', args: { bookingId: 'BK-1' }, result: { data: [{ id: 'BK-1' }] } }]),
      };
      expect(grounded(ctx)).toBeTruthy();
    });

    it('a WRITE call does not ground a not_found claim (must be a read)', () => {
      const ctx = {
        did: [{ op: 'lookup', target: 'BK-1', outcome: 'not_found' }] as TurnClaim[],
        observed: [call('createBooking', { bookingId: 'BK-1' })],
        world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, result: [] }]),
      };
      expect(grounded(ctx)).toBeTruthy();
    });
  });

  describe('row: pending_confirmation ⇔ ∃ call with resultFlags.requiresConfirmation and matches', () => {
    it('grounds against a call flagged requiresConfirmation', () => {
      const ctx = {
        did: [{ op: 'cancel', target: 'BK-1', outcome: 'pending_confirmation' }] as TurnClaim[],
        observed: [call('cancelBooking', { bookingId: 'BK-1' }, { resultFlags: { requiresConfirmation: true } })],
      };
      expect(grounded(ctx)).toBeNull();
    });

    it('no requiresConfirmation flag → violation', () => {
      const ctx = {
        did: [{ op: 'cancel', target: 'BK-1', outcome: 'pending_confirmation' }] as TurnClaim[],
        observed: [call('cancelBooking', { bookingId: 'BK-1' })],
      };
      expect(grounded(ctx)).toBeTruthy();
    });
  });

  describe('row: no_op ⇔ NO write in calls with tookEffect===true and matches', () => {
    it('a no_op claim grounds when the write only PROBED (tookEffect:false)', () => {
      const ctx = {
        did: [{ op: 'cancel', target: 'BK-1', outcome: 'no_op' }] as TurnClaim[],
        observed: [call('cancelBooking', { bookingId: 'BK-1' }, { tookEffect: false })],
      };
      expect(grounded(ctx)).toBeNull();
    });

    it('a no_op claim is a violation when the write DID take effect', () => {
      const ctx = {
        did: [{ op: 'cancel', target: 'BK-1', outcome: 'no_op' }] as TurnClaim[],
        observed: [call('cancelBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
        world: worldWith([{ name: 'cancelBooking', args: { bookingId: 'BK-1' }, tookEffect: true }]),
      };
      expect(grounded(ctx)).toBeTruthy();
    });
  });

  describe('domain outcome mapping — a mapped word resolves before grounding', () => {
    const outcomes: OutcomeMap = { settled: 'success' };

    it("'settled' → 'success' grounds against an effected write", () => {
      const ctx = {
        did: [{ op: 'refund', target: 'ORD-7', outcome: 'settled' }] as TurnClaim[],
        observed: [call('refundOrder', { orderId: 'ORD-7' }, { tookEffect: true })],
        world: worldWith([{ name: 'refundOrder', args: { orderId: 'ORD-7' }, tookEffect: true }]),
      };
      expect(grounded(ctx, outcomes)).toBeNull();
    });

    it("'settled' with no effected write is still a violation (resolves to success first)", () => {
      expect(grounded({ did: [{ op: 'refund', target: 'ORD-7', outcome: 'settled' }] }, outcomes)).toBeTruthy();
    });
  });

  describe('the deny message follows the prose-leak law', () => {
    it('names the op and target and the resolved label, never the tool name', () => {
      const reason = grounded({
        did: [{ op: 'refund the order', target: 'ORD-7', outcome: 'success' }],
        observed: [call('refundOrder', { orderId: 'ORD-7' }, { tookEffect: false })],
      });
      expect(reason).toContain('refund the order');
      expect(reason).toContain('ORD-7');
      expect(reason).not.toContain('refundOrder');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// claimIsComplete — every effected write must be claimed as success
// ─────────────────────────────────────────────────────────────────────────────
describe('claimIsComplete', () => {
  const complete = (over: Partial<GuardCtx> & { did: TurnClaim[] }) =>
    claimIsComplete({ writeTools: WRITES }).check(replyCtx(over));

  it('is a no-op when no write took effect this turn', () => {
    expect(complete({ did: [], observed: [call('findBooking', { bookingId: 'BK-1' })] })).toBeNull();
  });

  it('passes when every effected write is covered by a matching success claim', () => {
    const ctx = {
      did: [{ op: 'book', target: 'BK-1', outcome: 'success' }] as TurnClaim[],
      observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true }]),
    };
    expect(complete(ctx)).toBeNull();
  });

  it('HIDDEN WRITE — an effected write with no claim is a violation', () => {
    const ctx = {
      did: [] as TurnClaim[],
      observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true }]),
    };
    expect(complete(ctx)).toBeTruthy();
  });

  it('names the produced label when the world issued one', () => {
    const ctx = {
      did: [] as TurnClaim[],
      observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true, result: { label: 'Booking BK-1' } }]),
    };
    const reason = complete(ctx);
    expect(reason).toContain('Booking BK-1');
    expect(reason).not.toContain('createBooking');
  });

  it('falls back to a generic phrase when no produced label is available', () => {
    const ctx = {
      did: [] as TurnClaim[],
      observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true }]),
    };
    const reason = complete(ctx) ?? '';
    expect(reason).toMatch(/an action you did not report/);
    expect(reason).not.toContain('createBooking');
  });

  it('a non-success claim does not cover an effected write', () => {
    const ctx = {
      did: [{ op: 'book', target: 'BK-1', outcome: 'failure' }] as TurnClaim[],
      observed: [call('createBooking', { bookingId: 'BK-1' }, { tookEffect: true })],
      world: worldWith([{ name: 'createBooking', args: { bookingId: 'BK-1' }, tookEffect: true }]),
    };
    expect(complete(ctx)).toBeTruthy();
  });

  it('a probe (tookEffect:false) needs no claim', () => {
    const ctx = {
      did: [] as TurnClaim[],
      observed: [call('cancelBooking', { bookingId: 'BK-1' }, { tookEffect: false })],
    };
    expect(complete(ctx)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// claimCoversRubric — polarity is a FIELD (replaces replyMentions)
// ─────────────────────────────────────────────────────────────────────────────
describe('claimCoversRubric', () => {
  const covers = (opts: { targets: string[]; outcome: 'success' | 'not_found' | 'any' }, did: TurnClaim[]) =>
    claimCoversRubric(opts, 'Account for the record you were asked about.').check(replyCtx({ did }));

  it('passes when the target appears with the required outcome', () => {
    expect(covers({ targets: ['BK-1'], outcome: 'success' }, [{ op: 'book', target: 'BK-1', outcome: 'success' }])).toBeNull();
  });

  it('POLARITY — a not_found claim FAILS a rubric requiring success', () => {
    expect(covers({ targets: ['BK-1'], outcome: 'success' }, [{ op: 'book', target: 'BK-1', outcome: 'not_found' }])).toBeTruthy();
  });

  it('POLARITY — the same not_found claim PASSES a rubric requiring not_found', () => {
    expect(covers({ targets: ['BK-1'], outcome: 'not_found' }, [{ op: 'book', target: 'BK-1', outcome: 'not_found' }])).toBeNull();
  });

  it("outcome 'any' passes on any polarity as long as the target appears", () => {
    expect(covers({ targets: ['BK-1'], outcome: 'any' }, [{ op: 'book', target: 'BK-1', outcome: 'not_found' }])).toBeNull();
  });

  it('a missing target is a violation (returns the authored reason)', () => {
    expect(covers({ targets: ['BK-1'], outcome: 'any' }, [{ op: 'book', target: 'BK-2', outcome: 'success' }])).toBe(
      'Account for the record you were asked about.',
    );
  });

  it('every configured target must appear', () => {
    const did: TurnClaim[] = [{ op: 'book', target: 'BK-1', outcome: 'success' }];
    expect(covers({ targets: ['BK-1', 'BK-2'], outcome: 'success' }, did)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isEmptyReadResult — the exhaustive edge table
// ─────────────────────────────────────────────────────────────────────────────
describe('isEmptyReadResult', () => {
  it('null / undefined are empty', () => {
    expect(isEmptyReadResult(null)).toBe(true);
    expect(isEmptyReadResult(undefined)).toBe(true);
  });

  it('an empty array is empty; a non-empty array is not', () => {
    expect(isEmptyReadResult([])).toBe(true);
    expect(isEmptyReadResult([{ id: 1 }])).toBe(false);
  });

  it('an empty object is empty', () => {
    expect(isEmptyReadResult({})).toBe(true);
  });

  it('the {success:true, data:[]} shape is empty (boolean + empty array)', () => {
    expect(isEmptyReadResult({ success: true, data: [] })).toBe(true);
  });

  it('a non-empty array field anywhere makes it non-empty', () => {
    expect(isEmptyReadResult({ success: true, results: [{ id: 'BK-1' }] })).toBe(false);
  });

  it('a truthy record field (a nested entity) makes it non-empty', () => {
    expect(isEmptyReadResult({ booking: { id: 'BK-1' } })).toBe(false);
  });

  it('a status-like string field does not count as content', () => {
    expect(isEmptyReadResult({ status: 'not_found', data: [] })).toBe(true);
  });

  it('a falsy scalar field (count:0) does not count as content', () => {
    expect(isEmptyReadResult({ success: true, count: 0, data: [] })).toBe(true);
  });

  it('a truthy scalar field (a plain id string) counts as content', () => {
    expect(isEmptyReadResult({ id: 'BK-1' })).toBe(false);
  });
});
