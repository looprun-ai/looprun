import { test, expect } from 'vitest';
import { swapTerms } from '../../src/cards/catalog.js';

// A declared term is a word in the operator's own script: the swap reads a word as any run
// of letters, in any alphabet, and never as the ASCII slice of one.

const swap = swapTerms({ 'famílias': 'grupos', 'família': 'grupo', extra: 'adicional' });

test('a term carrying an accented letter is swapped whole', () => {
  expect(swap.apply('a família chega às nove')).toBe('a grupo chega às nove');
  expect(swap.apply('duas famílias no mesmo quarto')).toBe('duas grupos no mesmo quarto');
});

test('an ASCII term still swaps, and a word that merely contains a term is left alone', () => {
  expect(swap.apply('uma cama extra')).toBe('uma cama adicional');
  expect(swap.apply('o extrato e a familiaridade')).toBe('o extrato e a familiaridade');
  expect(swap.apply('família-anfitriã')).toBe('grupo-anfitriã');
});
