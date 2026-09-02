/** A label the prompt minted is unspeakable in every wrapper. What varies is the wrapper —
 *  brackets, parentheses, a bare word after a comma — and the record's own names, which look
 *  the same to a reader and are never one of the labels. */
import { test, expect } from 'vitest';
import { engineLabels } from '../../src/run/delivery-facts.js';
import type { DeliveryFact } from '../../src/run/delivery-facts.js';

/** A turn owing three facts numbers them F1, F2, F3. */
const THREE: readonly DeliveryFact[] = [
  { kind: 'act', text: 'The records refuse it: SOLE_OWNER_PROTECTED.', state: 'refused' },
  { kind: 'ask', text: 'Removing mem_1001 frees their seat.', state: 'held' },
  { kind: 'code', text: '006353', state: null }
];

test('a minted label answers in any wrapper the desk reaches for', () => {
  for (const wrapped of ['the records refuse it (F1).', 'refused [F1] here',
    'the reason is F1, and the seat', 'F1']) {
    expect(engineLabels(wrapped, THREE)).toContain('F1');
  }
});

test('the record\'s own names are not labels, wrapped or bare', () => {
  const reply = 'Removing Dana Okafor (mem_1001) frees their seat, and the hold (hold_6004) '
    + 'stands against ast_excv01. Invoice inv_7001 is paid.';
  expect(engineLabels(reply, THREE)).toEqual([]);
});

test('a label this turn never minted is not answered for as a bare word', () => {
  expect(engineLabels('the F9 chassis and the F4 model', THREE)).toEqual([]);
});

test('a label inside a word is not a label', () => {
  expect(engineLabels('the AF1 grade and the F1X rating', THREE)).toEqual([]);
});

test('a bracketed tag answers whatever the turn numbered', () => {
  expect(engineLabels('carrying [F9] anyway', [])).toEqual(['[F9]']);
});
