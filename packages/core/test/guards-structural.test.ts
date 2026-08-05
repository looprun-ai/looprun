/**
 * STRUCTURAL primitives — `valueFromUser` and `requiresBefore`'s evidence bound.
 *
 * These kinds read ONLY values the conversation itself produced — observed call names, `ok`,
 * `turnIndex`, args equality, and the user's own words compared by the engine's one matching law. No
 * text is ever pattern-matched.
 */
import { describe, expect, it } from 'vitest';
import type { GuardCtx, HistoryTurn, ObservedCall } from '../src/rules.js';
import { valueFromUser } from '../src/guards/structural.js';
import { requiresBefore } from '../src/guards/flow.js';

/** A minimal, structure-only GuardCtx. `history` and `observed` default to [] (always arrays in the
 *  real runtime), and `userText` to '' (a turn not opened by a fresh user message). */
function ctx(partial: Partial<GuardCtx>): GuardCtx {
  return {
    args: {},
    world: {} as GuardCtx['world'],
    observed: [],
    turnIndex: 1,
    userText: '',
    history: [],
    ...partial,
  } as GuardCtx;
}

function ctxConfirmed(
  tool: string,
  args: Record<string, unknown>,
  observed: ObservedCall[],
  turnIndex: number,
  history: HistoryTurn[] = [],
): GuardCtx {
  return ctx({ tool, args, observed, turnIndex, history });
}

/** A SEALED prior turn, carrying what the user said on it. */
const histTurn = (turnIndex: number, _asked: boolean, userText: string): HistoryTurn =>
  ({ turnIndex, userText, reply: '', toolCalls: [], did: [{ op: 'inform' }], attemptedCalls: [], guardEvents: [] });

describe('valueFromUser — the world receives the user\'s own words', () => {
  const g = valueFromUser({ arg: 'email' });

  it('allows a value the user said this turn', () => {
    expect(g.check(ctx({ tool: 'saveLead', args: { email: 'marcos@x.com' }, userText: 'my email is marcos@x.com' }))).toBeNull();
  });

  it('allows it whatever punctuation surrounds it in the sentence', () => {
    expect(g.check(ctx({ tool: 'saveLead', args: { email: 'marcos@x.com' }, userText: 'sure — "marcos@x.com".' }))).toBeNull();
  });

  it('denies a value the user never said', () => {
    expect(g.check(ctx({ tool: 'saveLead', args: { email: 'guess@y.com' }, userText: 'my email is marcos@x.com' }))).not.toBeNull();
  });

  it('denies a value that is only a PREFIX of what the user said', () => {
    expect(g.check(ctx({ tool: 'saveLead', args: { email: 'marcos@x.co' }, userText: 'my email is marcos@x.com' }))).not.toBeNull();
  });

  it('allows a value the user said on an EARLIER turn', () => {
    expect(
      g.check(
        ctx({
          tool: 'saveLead',
          args: { email: 'marcos@x.com' },
          userText: 'go ahead',
          history: [histTurn(0, false, 'my email is marcos@x.com')],
        }),
      ),
    ).toBeNull();
  });

  it('allows it however long ago they said it — nothing unsays a value', () => {
    expect(
      g.check(
        ctx({
          tool: 'saveLead',
          args: { email: 'marcos@x.com' },
          turnIndex: 9,
          userText: 'ok',
          history: [histTurn(0, false, 'my email is marcos@x.com')],
        }),
      ),
    ).toBeNull();
  });

  it('denies a PARAPHRASE of what the user said', () => {
    const d = valueFromUser({ arg: 'diagnosis' });
    expect(d.check(ctx({ tool: 'saveCase', args: { diagnosis: 'engine seized' }, userText: 'the engine locked up' }))).not.toBeNull();
  });

  it('allows the multi-word value the user actually used', () => {
    const d = valueFromUser({ arg: 'diagnosis' });
    expect(d.check(ctx({ tool: 'saveCase', args: { diagnosis: 'the engine locked up' }, userText: 'I think the engine locked up' }))).toBeNull();
  });

  it('is silent when the gated argument is absent', () => {
    expect(g.check(ctx({ tool: 'saveLead', args: {}, userText: '' }))).toBeNull();
  });

  it('is silent when the gated argument is empty', () => {
    expect(g.check(ctx({ tool: 'saveLead', args: { email: '' }, userText: '' }))).toBeNull();
  });

  it('names the gated argument in the prose the model reads', () => {
    expect(g.prose()).toContain('email');
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
