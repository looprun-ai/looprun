/**
 * STRUCTURAL / LICENSING primitives + the RECENCY LAW — `askedEarlier`, the unified `confirmFirst`
 * (`via` matrix, absorbing the former `confirmedNeedsEarlierProbe`), and `requiresBefore`'s evidence
 * bound.
 *
 * These kinds read ONLY structure (observed call names, `ok`, `turnIndex`, args equality) — never any
 * text. The tests build a minimal fake `GuardCtx` and assert deny/allow, including the RECENCY LAW
 * (2026-08-02): a LICENSING event (a probe/ask that UNLOCKS an act) is turn-bounded — default `within:1`
 * (only the immediately-preceding turn licenses; distance 2 does NOT; `within` widens it) — while an
 * EVIDENCE guard (`requiresBefore`, proof work was done) defaults UNBOUNDED.
 */
import { describe, expect, it } from 'vitest';
import type { GuardCtx, ObservedCall } from '../src/rules.js';
import { askedEarlier } from '../src/guards/structural.js';
import { confirmFirst } from '../src/guards/confirmation.js';
import { requiresBefore } from '../src/guards/flow.js';

/** A minimal, structure-only GuardCtx — no world accessors, no reply, no user text. */
function ctxWith(partial: Partial<GuardCtx> & { observed: ObservedCall[]; turnIndex: number }): GuardCtx {
  return {
    args: {},
    world: {} as GuardCtx['world'],
    ...partial,
  } as GuardCtx;
}

const ask = (turn: number): ObservedCall => ({
  name: 'askUser',
  ok: true,
  turnIndex: turn,
  args: { text: 'q?' },
});

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
): GuardCtx {
  return ctxWith({ tool, args, observed, turnIndex });
}

describe('askedEarlier', () => {
  const g = askedEarlier({ tool: 'completeMaintenance', arg: 'condition' });

  it('denies when no earlier-turn askUser exists', () => {
    expect(g.check(ctxWith({ observed: [], turnIndex: 2, args: { condition: 'good' } }))).toMatch(/ask/i);
  });

  it('allows when an earlier-turn askUser exists (distance 1)', () => {
    expect(g.check(ctxWith({ observed: [ask(1)], turnIndex: 2, args: { condition: 'good' } }))).toBeNull();
  });

  it('does not count a SAME-turn ask', () => {
    expect(g.check(ctxWith({ observed: [ask(2)], turnIndex: 2, args: { condition: 'good' } }))).toMatch(/ask/i);
  });

  it('is silent when the gated arg is absent (not this guard\'s business)', () => {
    expect(g.check(ctxWith({ observed: [], turnIndex: 2, args: {} }))).toBeNull();
  });

  describe('recency law (default within:1)', () => {
    it('distance 1 licenses', () => {
      expect(g.check(ctxWith({ observed: [ask(1)], turnIndex: 2, args: { condition: 'good' } }))).toBeNull();
    });
    it('distance 2 does NOT license (a stale ask must not unlock today\'s write)', () => {
      expect(g.check(ctxWith({ observed: [ask(1)], turnIndex: 3, args: { condition: 'good' } }))).toMatch(/ask/i);
    });
    it('within:5 widens the window (distance 4 licenses)', () => {
      const wide = askedEarlier({ tool: 'completeMaintenance', arg: 'condition', within: 5 });
      expect(wide.check(ctxWith({ observed: [ask(1)], turnIndex: 5, args: { condition: 'good' } }))).toBeNull();
    });
  });
});

describe('confirmFirst — via:probe (absorbed confirmedNeedsEarlierProbe)', () => {
  const c = confirmFirst({ via: 'probe' });

  it('denies a confirmed call with no earlier-turn probe of the SAME tool+args', () => {
    expect(
      c.check(ctxConfirmed('chargeDeposit', { bookingId: 'bk_1', confirmed: true }, [probe('payInvoice', 1)], 2)),
    ).toMatch(/preview|probe|confirm/i);
  });

  it('allows when an earlier-turn probe of the same tool with matching args exists', () => {
    expect(
      c.check(
        ctxConfirmed(
          'chargeDeposit',
          { bookingId: 'bk_1', confirmed: true },
          [probe('chargeDeposit', 1, { bookingId: 'bk_1' })],
          2,
        ),
      ),
    ).toBeNull();
  });

  it('denies a same-turn probe (consent must arrive in a LATER message)', () => {
    expect(
      c.check(
        ctxConfirmed(
          'chargeDeposit',
          { bookingId: 'bk_1', confirmed: true },
          [probe('chargeDeposit', 2, { bookingId: 'bk_1' })],
          2,
        ),
      ),
    ).toMatch(/later/i);
  });

  it('is silent when confirmed is not set (a probe passes freely)', () => {
    expect(
      c.check(ctxConfirmed('chargeDeposit', { bookingId: 'bk_1' }, [], 2)),
    ).toBeNull();
  });

  it('is silent when there is no tool in context', () => {
    expect(c.check(ctxWith({ observed: [], turnIndex: 2, args: { confirmed: true } }))).toBeNull();
  });

  it('does not accept an earlier probe whose args differ (record-bound)', () => {
    expect(
      c.check(
        ctxConfirmed(
          'chargeDeposit',
          { bookingId: 'bk_1', confirmed: true },
          [probe('chargeDeposit', 1, { bookingId: 'bk_OTHER' })],
          2,
        ),
      ),
    ).toMatch(/preview|probe|confirm/i);
  });

  it('does NOT accept a prior askUser (probe-only, unlike either)', () => {
    expect(
      c.check(ctxConfirmed('chargeDeposit', { bookingId: 'bk_1', confirmed: true }, [ask(1)], 2)),
    ).toMatch(/preview|probe|confirm/i);
  });

  describe('recency law (default within:1)', () => {
    it('probe at distance 1 licenses', () => {
      expect(
        c.check(ctxConfirmed('chargeDeposit', { id: 'x', confirmed: true }, [probe('chargeDeposit', 1, { id: 'x' })], 2)),
      ).toBeNull();
    });
    it('probe at distance 2 does NOT license', () => {
      expect(
        c.check(ctxConfirmed('chargeDeposit', { id: 'x', confirmed: true }, [probe('chargeDeposit', 1, { id: 'x' })], 3)),
      ).toMatch(/preview|probe|confirm/i);
    });
    it('within:5 widens the window (probe at distance 4 licenses)', () => {
      const wide = confirmFirst({ via: 'probe', within: 5 });
      expect(
        wide.check(ctxConfirmed('chargeDeposit', { id: 'x', confirmed: true }, [probe('chargeDeposit', 1, { id: 'x' })], 5)),
      ).toBeNull();
    });
  });
});

describe('confirmFirst — via matrix', () => {
  const record = { id: 'x', confirmed: true };
  const priorProbe = [probe('act', 1, { id: 'x' })];
  const priorAsk = [ask(1)];

  it('via:ask — flag-less: licensed by a prior ask OR a prior OK run of the tool itself', () => {
    const g = confirmFirst({ via: 'ask' });
    expect(g.check(ctxConfirmed('act', {}, priorAsk, 2))).toBeNull();
    // a prior successful call of the flag-less tool is its own surfacing signal
    expect(g.check(ctxConfirmed('act', {}, [{ name: 'act', ok: true, turnIndex: 1, args: {} }], 2))).toBeNull();
    expect(g.check(ctxConfirmed('act', {}, [], 2))).not.toBeNull();
    // gated on every call regardless of any confirm flag; a same-turn ask does not license
    expect(g.check(ctxConfirmed('act', {}, [ask(2)], 2))).not.toBeNull();
  });

  it('via:either — licensed by a matching probe OR a prior ask', () => {
    const g = confirmFirst({ via: 'either' });
    expect(g.check(ctxConfirmed('act', record, priorProbe, 2))).toBeNull();
    expect(g.check(ctxConfirmed('act', record, priorAsk, 2))).toBeNull();
    expect(g.check(ctxConfirmed('act', record, [], 2))).not.toBeNull();
  });

  it('via:probe — a prior ask does NOT license (probe only)', () => {
    const g = confirmFirst({ via: 'probe' });
    expect(g.check(ctxConfirmed('act', record, priorAsk, 2))).not.toBeNull();
    expect(g.check(ctxConfirmed('act', record, priorProbe, 2))).toBeNull();
  });

  it('string overload maps to {flag:confirmed, via:either, within:1}', () => {
    const g = confirmFirst('confirmed');
    expect(g.check(ctxConfirmed('act', record, priorProbe, 2))).toBeNull(); // distance 1
    expect(g.check(ctxConfirmed('act', record, priorAsk, 2))).toBeNull();
    expect(g.check(ctxConfirmed('act', record, [probe('act', 1, { id: 'x' })], 3))).not.toBeNull(); // distance 2
  });

  it('rejects a via NAME passed as the string overload', () => {
    expect(() => confirmFirst('probe')).toThrow(/via/i);
    expect(() => confirmFirst('ask')).toThrow(/via/i);
    expect(() => confirmFirst('either')).toThrow(/via/i);
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
