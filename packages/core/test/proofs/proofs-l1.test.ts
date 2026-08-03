/**
 * L1 — pure check() proofs. For every GuardProof case that crafts a ctx, the guard's deterministic
 * check must fire ('fires') or stay silent ('silent') exactly as declared. Mockless and loop-free —
 * this is the per-kind bulk of the proof suite.
 */
import { describe, expect, it } from 'vitest';
import {
  consentRequired,
  degenerationGuard,
  jargonScrub,
  maxCalls,
} from '../../src/guards/index.js';
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

// The canonical maxCalls GuardProof (catalog-run-output) pins the DEFAULT 'turn' scope; the
// 'conversation' scope has no honest expression through a single-make GuardProof, so it is proven here.
describe('L1 · maxCalls — conversation scope (bespoke)', () => {
  const reason = 'You already generated 3 media assets this conversation — that is the limit; explain it instead of generating another.';
  const conv = () => maxCalls('createMedia', 3, reason, { scope: 'conversation' });
  const call = (turnIndex: number) => ({ name: 'createMedia', args: {}, ok: true, turnIndex });

  it('positive: two prior successes across turns stay under the limit', () => {
    const ctx = craftCtx({ tool: 'createMedia', observed: [call(0), call(1)], turnIndex: 2 });
    expect(conv().check(ctx)).toBeNull();
  });
  it('negative: three prior successes across turns hit the conversation limit', () => {
    const ctx = craftCtx({ tool: 'createMedia', observed: [call(0), call(1), call(2)], turnIndex: 3 });
    expect(conv().check(ctx)).toBe(reason);
  });
  it('neutral: unrelated observed history does not count', () => {
    const ctx = craftCtx({
      tool: 'createMedia',
      observed: [{ name: 'searchItem', args: {}, ok: true, turnIndex: 0 }],
      turnIndex: 2,
    });
    expect(conv().check(ctx)).toBeNull();
  });
  it('scope contrast: three cross-turn successes fire for conversation scope but NOT for turn scope', () => {
    const ctx = craftCtx({ tool: 'createMedia', observed: [call(0), call(1), call(2)], turnIndex: 3 });
    expect(conv().check(ctx)).toBe(reason);
    expect(maxCalls('createMedia', 3, reason).check(ctx)).toBeNull(); // default 'turn' scope: turnIndex 3 has 0 prior
  });
});

describe('L1 · degenerationGuard — param-free artifact-shape lint (bespoke)', () => {
  // degenerationGuard takes no params, so plain third-person narration is NOT gated here — that is
  // llmCheck's job. The always-on markup / repetition branches are the whole of it.
  it('third-person narration is NOT gated (no selfNarrationRe param)', () => {
    expect(degenerationGuard().check(craftCtx({ reply: 'The assistant confirmed the update.' }))).toBeNull();
  });
  it('markup still fires, clean stays silent', () => {
    const g = degenerationGuard();
    expect(g.check(craftCtx({ reply: '<think>plan</think> done' }))).toBeTruthy();
    expect(g.check(craftCtx({ reply: 'The item is ready.' }))).toBeNull();
  });
  it('run-away repetition fires', () => {
    const rep = 'This is a repeated line.\nThis is a repeated line.\nThis is a repeated line.';
    expect(degenerationGuard().check(craftCtx({ reply: rep }))).toBeTruthy();
  });
});

/**
 * FAIL-FAST CONSTRUCTION (bespoke — a GuardProof case can only assert on check(), and these kinds never
 * reach check()). A safety guard whose configuration makes it INERT must break the build.
 * `consentRequired` is the risk-family kind with a construction guard.
 */
describe('L1 · consentRequired — misconfiguration throws at CONSTRUCTION', () => {
  it('consentRequired: an empty tool set, or a blank reason (a falsy deny value reads as "allowed")', () => {
    expect(() => consentRequired({ tools: [], consentOk: () => true, reason: 'r' })).toThrow(/gate nothing/);
    expect(() => consentRequired({ tools: ['useMedia'], consentOk: () => true, reason: '  ' })).toThrow(/blank/);
  });
});

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
