import { describe, expect, test } from 'vitest';
import { forbidThisTurn, precondition, requiresBefore, resultInvariant } from '../src/guards/index.js';

describe('opts.prose overrides the derived prose on every kind that accepts it', () => {
  test('requiresBefore renders the derived sentence without opts.prose', () => {
    expect(requiresBefore(['getBooking']).prose()).toBe('only after getBooking has run');
  });
  test('requiresBefore renders the author prose when passed', () => {
    const g = requiresBefore(['getBooking'], { prose: 'read the booking first — the record names the asset' });
    expect(g.prose()).toBe('read the booking first — the record names the asset');
  });
  test('requiresBefore check is untouched by the prose option', () => {
    const g = requiresBefore(['getBooking'], { prose: 'x' });
    const deny = g.check({ tool: 'cancelBooking', args: {}, observed: [], turnIndex: 0, world: { toolCalls: [] } } as never);
    expect(deny).toMatch(/getBooking/);
  });
  test('forbidThisTurn takes prose in opts', () => {
    expect(forbidThisTurn('denied', { prose: 'not on this turn' }).prose()).toBe('not on this turn');
    expect(forbidThisTurn('denied').prose()).toBe('do not call this tool in this turn — not even once');
  });
  test('precondition takes prose in opts', () => {
    expect(precondition(() => true, 'account frozen', { prose: 'only while the account is active' }).prose()).toBe('only while the account is active');
    expect(precondition(() => true, 'account frozen').prose()).toBe('account frozen');
  });
  test('resultInvariant takes prose in opts', () => {
    expect(resultInvariant(() => true, 'empty report', { prose: 'the report must hold rows' }).prose()).toBe('the report must hold rows');
  });
});
