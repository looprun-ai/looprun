/**
 * STRUCTURAL primitives — `askedEarlier` + `confirmedNeedsEarlierProbe`.
 *
 * The consent-binding pair reads ONLY structure (observed call names, `ok`, `turnIndex`, args
 * equality) — never any text. These tests build a minimal fake `GuardCtx` (a plain object with
 * `observed`, `args`, `turnIndex`, `tool`) and assert the deny/allow decisions the brief pins.
 */
import { describe, expect, it } from 'vitest';
import type { GuardCtx, ObservedCall } from '../src/rules.js';
import { askedEarlier, confirmedNeedsEarlierProbe } from '../src/guards/structural.js';

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

  it('allows when an earlier-turn askUser exists', () => {
    expect(g.check(ctxWith({ observed: [ask(1)], turnIndex: 2, args: { condition: 'good' } }))).toBeNull();
  });

  it('does not count a SAME-turn ask', () => {
    expect(g.check(ctxWith({ observed: [ask(2)], turnIndex: 2, args: { condition: 'good' } }))).toMatch(/ask/i);
  });

  it('is silent when the gated arg is absent (not this guard\'s business)', () => {
    expect(g.check(ctxWith({ observed: [], turnIndex: 2, args: {} }))).toBeNull();
  });
});

describe('confirmedNeedsEarlierProbe', () => {
  const c = confirmedNeedsEarlierProbe({ tools: ['chargeDeposit', 'payInvoice'] });

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

  it('is silent when confirmed is not set', () => {
    expect(
      c.check(ctxConfirmed('chargeDeposit', { bookingId: 'bk_1' }, [], 2)),
    ).toBeNull();
  });

  it('is silent for a tool not in the list', () => {
    expect(
      c.check(ctxConfirmed('someOtherTool', { bookingId: 'bk_1', confirmed: true }, [], 2)),
    ).toBeNull();
  });

  it('does not accept an earlier probe whose args differ', () => {
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
});
