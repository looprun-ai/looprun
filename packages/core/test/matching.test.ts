/**
 * THE MATCHING LAW — the one comparison consent, grounding and elicitation all route through.
 */
import { describe, it, expect } from 'vitest';
import { targetMatchesValue, valueSpokenBy } from '../src/guards/matching.js';

describe('targetMatchesValue', () => {
  it('matches a whole value regardless of edge punctuation and case', () => {
    expect(targetMatchesValue('BK-1', '(bk-1).')).toBe(true);
  });

  it('rejects a value that merely contains the target', () => {
    expect(targetMatchesValue('BK-1', 'BK-12')).toBe(false);
  });
});

describe('valueSpokenBy', () => {
  it('finds a single token inside a sentence', () => {
    expect(valueSpokenBy('marcos@x.com', 'my email is marcos@x.com.')).toBe(true);
  });

  it('rejects a value the user never said', () => {
    expect(valueSpokenBy('guess@y.com', 'my email is marcos@x.com.')).toBe(false);
  });

  it('rejects a prefix of a token the user said', () => {
    expect(valueSpokenBy('BK-1', 'cancel the BK-12')).toBe(false);
  });

  it('finds a contiguous multi-token value', () => {
    expect(valueSpokenBy('the engine locked up', 'I think the engine locked up yesterday')).toBe(true);
  });

  it('rejects the same tokens when they are not contiguous', () => {
    expect(valueSpokenBy('the engine locked up', 'the engine, I think, locked up')).toBe(false);
  });

  it('finds a token that carries internal punctuation', () => {
    expect(valueSpokenBy('CONFIRM BK-1', 'yes, CONFIRM BK-1')).toBe(true);
  });

  it('matches the token whatever case the user typed it in', () => {
    expect(valueSpokenBy('CONFIRM BK-1', 'confirm bk-1')).toBe(true);
  });

  it('rejects a token decorated with an invisible mark', () => {
    expect(valueSpokenBy('CONFIRM BK-1', 'CONFIRM BK-1​')).toBe(false);
  });

  it('rejects a value that canonicalizes to nothing', () => {
    expect(valueSpokenBy('...', 'anything at all')).toBe(false);
  });
});
