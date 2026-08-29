/** The six voices a house teaches at every one of its counters. A conduct law renders into the
 *  system prefix of the desk that carries it, so a desk missing one reads a prompt the desk beside
 *  it does not — and the operator handed from the first counter to the second meets two houses. */
import { describe, expect, test } from 'vitest';
import type { AgentSpec } from '@looprun-ai/core';
import { conductComplete } from '../src/lints.js';

const VOICES = ['declareHonestly', 'oneQuestion', 'yourLaneYourReads', 'recordsOverAssertions',
                'askBeforeYouChoose', 'nameItDoNotPassItOn'] as const;

/** One desk teaching the voices it is handed, in the shape a card carries them: one prose guard
 *  per conduct law, named by the law. */
const desk = (name: string, voices: readonly string[]): AgentSpec => ({
  name,
  persona: `You are the ${name} desk.`,
  guards: voices.map(voice => ({ name: voice, rule: `The ${voice} law.`, on: 'reply' as const }))
});

describe('conductComplete', () => {
  test('a desk missing one voice is one finding, naming the desk and the voice', () => {
    const found = conductComplete({
      billing: desk('billing', VOICES.filter(voice => voice !== 'oneQuestion')),
      claims: desk('claims', VOICES)
    });
    expect(found.map(f => f.code)).toEqual(['CONDUCT_INCOMPLETE']);
    expect(found[0].sentence).toContain("'billing'");
    expect(found[0].sentence).toContain("'oneQuestion'");
  });

  test('every desk teaching all six asks nothing', () => {
    expect(conductComplete({ billing: desk('billing', VOICES), claims: desk('claims', VOICES) }))
      .toEqual([]);
  });

  test('one desk asks nothing: the six bind a house with more than one counter', () => {
    expect(conductComplete({ billing: desk('billing', []) })).toEqual([]);
  });
});
