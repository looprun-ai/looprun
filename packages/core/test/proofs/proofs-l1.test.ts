/**
 * L1 — pure check() proofs. For every GuardProof case that crafts a ctx, the guard's deterministic
 * check must fire ('fires') or stay silent ('silent') exactly as declared. Mockless and loop-free —
 * this is the per-kind bulk of the proof suite.
 */
import { describe, expect, it } from 'vitest';
import { jargonScrub } from '../../src/guards.js';
import { craftCtx, runL1 } from '../../src/testing/index.js';
import { GUARD_PROOFS } from './catalog.js';

for (const proof of GUARD_PROOFS) {
  describe(`L1 · ${proof.guard}`, () => {
    const l1Cases = proof.cases.filter((c) => c.ctx !== undefined);
    it('has at least one L1 case', () => {
      expect(l1Cases.length).toBeGreaterThan(0);
    });
    for (const c of l1Cases) {
      it(`${c.polarity} · ${c.name} → ${c.l1}`, async () => {
        const { fired, reason } = await runL1(proof, c);
        if (c.l1 === 'fires') {
          expect(fired, `expected check() to fire, got null`).toBe(true);
          expect(reason).toBeTruthy();
        } else {
          expect(fired, `expected check() to stay silent, got: ${reason}`).toBe(false);
        }
      });
    }
  });
}

describe('L1 · jargonScrub (mutator proof)', () => {
  const scrub = jargonScrub({ 'itm-record': 'item', 'media asset': 'media' });
  it('positive: rewrites mapped jargon word-boundary, case-insensitive', () => {
    const out = scrub.apply('Your Itm-Record is ready; the MEDIA ASSET too.', craftCtx());
    expect(out).toBe('Your item is ready; the media too.');
  });
  it('neutral: leaves an unmapped reply untouched', () => {
    const text = 'Your items are ready.';
    expect(scrub.apply(text, craftCtx())).toBe(text);
  });
  it('neutral: word-boundary — no partial-word rewrite', () => {
    const text = 'The itm-records catalog.'; // plural ≠ the mapped singular token
    expect(scrub.apply(text, craftCtx())).toBe(text);
  });
});
