/**
 * replyMentions — the ONE reply-coverage gate (merged from replyMustMention + replyConfirmsLabels).
 * Proves the two modes and the case-insensitive literal scan; the L1/L3 proof lives in
 * proofs/catalog-behavior.ts (default all-of mode).
 */
import { describe, expect, it } from 'vitest';
import { replyMentions } from '../src/index.js';

const ctx = (reply: string) => ({ reply, observed: [], turnIndex: 0 } as never);

describe('replyMentions — anyTerm:true (at least one of)', () => {
  const g = replyMentions({ terms: ['done', 'ready'], anyTerm: true }, 'say done or ready');

  it('passes when ONE term is present', () => {
    expect(g.check(ctx('It is done now.'))).toBeNull();
  });
  it('passes when the other term is present', () => {
    expect(g.check(ctx('All ready.'))).toBeNull();
  });
  it('fires when NO term is present', () => {
    expect(g.check(ctx('Sure thing.'))).toBe('say done or ready');
  });
});

describe('replyMentions — anyTerm:false / default (all of)', () => {
  const g = replyMentions({ terms: ['BK-1', 'BK-2'] }, 'name both bookings');

  it('passes only when EVERY term is present', () => {
    expect(g.check(ctx('Cancelled BK-1 and BK-2.'))).toBeNull();
  });
  it('fires when only some terms are present', () => {
    expect(g.check(ctx('Cancelled BK-1.'))).toBe('name both bookings');
  });
  it('fires on an empty reply', () => {
    expect(g.check(ctx('   '))).toBe('name both bookings');
  });
  it('default anyTerm is all-of (omitting the flag requires every term)', () => {
    const d = replyMentions({ terms: ['a', 'b'] }, 'r');
    expect(d.check(ctx('only a'))).toBe('r');
  });
});

describe('replyMentions — case-insensitive literal scan', () => {
  it('anyTerm:true matches regardless of case', () => {
    const g = replyMentions({ terms: ['Refund'], anyTerm: true }, 'r');
    expect(g.check(ctx('your refund is on the way'))).toBeNull();
  });
  it('all-of matches regardless of case', () => {
    const g = replyMentions({ terms: ['BK-100234'] }, 'r');
    expect(g.check(ctx('booking bk-100234 is cancelled'))).toBeNull();
  });
  it('meta.requiredStrings carries the terms verbatim', () => {
    expect(replyMentions({ terms: ['x', 'y'] }, 'r').meta).toEqual({ requiredStrings: ['x', 'y'] });
  });
});
