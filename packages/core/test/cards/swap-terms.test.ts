import { test, expect } from 'vitest';
import { swapTerms } from '../../src/cards/catalog.js';

// A declared term is a word in the operator's own script: the swap reads a word as any run
// of letters, in any alphabet, and never as the ASCII slice of one.

const swap = swapTerms({ 'peças': 'publicações', 'peça': 'publicação', briefing: 'resumo' });

test('a term carrying an accented letter is swapped whole', () => {
  expect(swap.apply('não consigo gerar a peça agora')).toBe('não consigo gerar a publicação agora');
  expect(swap.apply('vale planejar 4 peças por semana')).toBe('vale planejar 4 publicações por semana');
});

test('an ASCII term still swaps, and a word that merely contains a term is left alone', () => {
  expect(swap.apply('o briefing chegou')).toBe('o resumo chegou');
  expect(swap.apply('a cabeça e o despeçamento')).toBe('a cabeça e o despeçamento');
  expect(swap.apply('peça-chave')).toBe('publicação-chave');
});
