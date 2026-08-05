/**
 * STRUCTURAL / LICENSING primitives + the RECENCY LAW — `askedEarlier`, the unified `confirmFirst`
 * (`via` matrix), and `requiresBefore`'s evidence bound.
 *
 * These kinds read ONLY structure (observed call names, `ok`, `turnIndex`, args equality) — never any
 * text. The tests build a minimal fake `GuardCtx` and assert deny/allow, including the RECENCY LAW:
 * a LICENSING event (a probe/ask that UNLOCKS an act) is turn-bounded — default `within:1`
 * (only the immediately-preceding turn licenses; distance 2 does NOT; `within` widens it) — while an
 * EVIDENCE guard (`requiresBefore`, proof work was done) defaults UNBOUNDED.
 */
import { describe, expect, it } from 'vitest';
import type { GuardCtx, HistoryTurn, ObservedCall } from '../src/rules.js';
import { askedEarlier } from '../src/guards/structural.js';
import { confirmFirst } from '../src/guards/confirmation.js';
import { requiresBefore } from '../src/guards/flow.js';

/** A minimal, structure-only GuardCtx — no world accessors, no reply, no user text. `history` defaults to
 *  [] (always an array in the real runtime). The cross-turn ask signal is SEALED HISTORY ONLY — a raw
 *  `observed` respond is a hook-time record, not evidence of a delivered turn — so every ask fixture
 *  below is a `HistoryTurn`. */
function ctxWith(partial: Partial<GuardCtx> & { observed: ObservedCall[]; turnIndex: number }): GuardCtx {
  return {
    args: {},
    world: {} as GuardCtx['world'],
    history: [],
    ...partial,
  } as GuardCtx;
}

/** The RAW hook-time record of a turn-closing `respond` that declared an ask. It is NOT consent
 *  evidence — only `confirmFirst`'s SAME-TURN diagnostic still reads it. */
const askCall = (turn: number): ObservedCall => ({
  name: 'respond',
  ok: true,
  turnIndex: turn,
  args: { message: 'q?', did: [{ op: 'ask' }] },
});

/** A SEALED HistoryTurn that DID pose a question — its `did` carries an `ask` intention over a
 *  non-blank delivered `reply`. This is THE cross-turn ask signal. */
const askedTurn = (turn: number): HistoryTurn =>
  ({ turnIndex: turn, userText: '', reply: 'q?', toolCalls: [], did: [{ op: 'ask' }], attemptedCalls: [], guardEvents: [] });

const probe = (tool: string, turn: number, args: Record<string, unknown> = {}): ObservedCall => ({
  name: tool,
  ok: true,
  turnIndex: turn,
  args: { ...args, confirmed: false },
});

function ctxConfirmed(
  tool: string,
  args: Record<string, unknown>,
  observed: ObservedCall[],
  turnIndex: number,
  history: HistoryTurn[] = [],
): GuardCtx {
  return ctxWith({ tool, args, observed, turnIndex, history });
}

describe('askedEarlier', () => {
  const g = askedEarlier({ tool: 'completeMaintenance', arg: 'condition' });

  it('denies when no earlier-turn ask exists', () => {
    expect(g.check(ctxWith({ observed: [], turnIndex: 2, args: { condition: 'good' } }))).toMatch(/ask/i);
  });

  it('allows when an earlier-turn ask exists (distance 1)', () => {
    expect(g.check(ctxWith({ observed: [], history: [askedTurn(1)], turnIndex: 2, args: { condition: 'good' } }))).toBeNull();
  });

  it('does not count a SAME-turn ask', () => {
    expect(g.check(ctxWith({ observed: [], history: [askedTurn(2)], turnIndex: 2, args: { condition: 'good' } }))).toMatch(/ask/i);
  });

  it('a RAW observed ask-intent respond is NOT consent evidence (sealed history only)', () => {
    expect(g.check(ctxWith({ observed: [askCall(1)], turnIndex: 2, args: { condition: 'good' } }))).toMatch(/ask/i);
  });

  it('a sealed ask over a BLANK delivered reply licenses nothing', () => {
    const silent: HistoryTurn = { ...askedTurn(1), reply: '\u200b \u3164' };
    expect(g.check(ctxWith({ observed: [], history: [silent], turnIndex: 2, args: { condition: 'good' } }))).toMatch(/ask/i);
  });

  it('is silent when the gated arg is absent (not this guard\'s business)', () => {
    expect(g.check(ctxWith({ observed: [], turnIndex: 2, args: {} }))).toBeNull();
  });

  describe('ask signal — the sealed HistoryTurn\'s ask INTENTION is the PRIMARY signal', () => {
    it('licenses off an earlier COMPLETED turn whose did carries an ask, no observed ask needed', () => {
      expect(
        g.check(ctxWith({ observed: [], history: [askedTurn(1)], turnIndex: 2, args: { condition: 'good' } })),
      ).toBeNull();
    });
    it('a same-turn history entry is impossible (history is prior turns) — a distance-1 earlier ask licenses, distance-2 does not', () => {
      expect(
        g.check(ctxWith({ observed: [], history: [askedTurn(1)], turnIndex: 3, args: { condition: 'good' } })),
      ).toMatch(/ask/i);
    });
    it('a history turn that did NOT ask (no ask intention in did) does not license', () => {
      const noAsk: HistoryTurn = { ...askedTurn(1), did: [{ op: 'inform' }] };
      expect(
        g.check(ctxWith({ observed: [], history: [noAsk], turnIndex: 2, args: { condition: 'good' } })),
      ).toMatch(/ask/i);
    });
  });

  describe('recency law (default within:1)', () => {
    it('distance 1 licenses', () => {
      expect(g.check(ctxWith({ observed: [], history: [askedTurn(1)], turnIndex: 2, args: { condition: 'good' } }))).toBeNull();
    });
    it('distance 2 does NOT license (a stale ask must not unlock today\'s write)', () => {
      expect(g.check(ctxWith({ observed: [], history: [askedTurn(1)], turnIndex: 3, args: { condition: 'good' } }))).toMatch(/ask/i);
    });
    it('within:5 widens the window (distance 4 licenses)', () => {
      const wide = askedEarlier({ tool: 'completeMaintenance', arg: 'condition', within: 5 });
      expect(wide.check(ctxWith({ observed: [], history: [askedTurn(1)], turnIndex: 5, args: { condition: 'good' } }))).toBeNull();
    });
  });
});
describe('requiresBefore — EVIDENCE guard (default UNBOUNDED)', () => {
  const ran = (tool: string, turn: number): ObservedCall => ({ name: tool, ok: true, turnIndex: turn, args: {} });

  it('a dep from an early turn grounds a much later call (unbounded default)', () => {
    const g = requiresBefore(['findBooking']);
    expect(g.check(ctxConfirmed('cancelBooking', {}, [ran('findBooking', 1)], 9))).toBeNull();
  });

  it('denies when the dep never ran', () => {
    const g = requiresBefore(['findBooking']);
    expect(g.check(ctxConfirmed('cancelBooking', {}, [], 3))).toMatch(/FIRST/);
  });

  it('bounded when within is set: distance 1 grounds, distance 3 does not (within:2)', () => {
    const g = requiresBefore(['findBooking'], { within: 2 });
    expect(g.check(ctxConfirmed('cancelBooking', {}, [ran('findBooking', 2)], 3))).toBeNull(); // distance 1
    expect(g.check(ctxConfirmed('cancelBooking', {}, [ran('findBooking', 0)], 3))).toMatch(/FIRST/); // distance 3
  });

  it('bounded: a same-turn dep still counts (distance 0 ≤ within)', () => {
    const g = requiresBefore(['findBooking'], { within: 1 });
    expect(g.check(ctxConfirmed('cancelBooking', {}, [ran('findBooking', 3)], 3))).toBeNull();
  });
});
