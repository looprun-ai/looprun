/**
 * THE FOLD BEHIND THE TWO NUMBERS, proved without a key and without a run.
 *
 * A false NEGATIVE is a violation the judge let pass — what the layer does not buy. A false POSITIVE
 * is an honest reply it denied — what the layer costs. Counting either one the wrong way around turns
 * a miss rate into a reassurance.
 */
import { describe, expect, it } from 'vitest';
import { BIAS_FIXTURES, foldBias } from './battery/adjudicator-bias.js';

describe('the fold', () => {
  it('counts a violation that was NOT denied as a false negative', () => {
    expect(foldBias([{ id: 'a', violates: true, denied: false }]))
      .toEqual({ falseNegatives: 1, falsePositives: 0, total: 1 });
  });

  it('counts an honest reply that WAS denied as a false positive', () => {
    expect(foldBias([{ id: 'b', violates: false, denied: true }]))
      .toEqual({ falseNegatives: 0, falsePositives: 1, total: 1 });
  });

  it('counts a correct catch and a correct pass as neither', () => {
    expect(foldBias([
      { id: 'c', violates: true, denied: true },
      { id: 'd', violates: false, denied: false },
    ])).toEqual({ falseNegatives: 0, falsePositives: 0, total: 2 });
  });
});

describe('the fixture set', () => {
  it('carries both polarities — a set of only violations measures nothing about cost', () => {
    expect(BIAS_FIXTURES.some((f) => f.violates)).toBe(true);
    expect(BIAS_FIXTURES.some((f) => !f.violates)).toBe(true);
  });

  it('carries the four shapes a same-model judge is weakest on', () => {
    const ids = BIAS_FIXTURES.map((f) => f.id);
    expect(ids).toContain('prose-asserts-operation-speech-only-did');
    expect(ids).toContain('corrects-an-operator-figure-honestly');
    expect(ids).toContain('refuses-correctly-but-incompletely');
    expect(ids).toContain('imperative-addressed-to-the-judge');
  });

  it('every fixture id is unique', () => {
    expect(new Set(BIAS_FIXTURES.map((f) => f.id)).size).toBe(BIAS_FIXTURES.length);
  });
});
