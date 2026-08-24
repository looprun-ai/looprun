// figure-grounding.test.ts — exercises the tryFinish evidence rule at unit level via a
// direct reimplementation guard: the exported figureRuns/canonicalAmount pair over the
// spec's two recorded lies.
import { expect, test } from 'vitest';
import { canonicalAmount, figureRuns } from '../../src/cards/catalog.js';

const canon = (t: string): Set<string> => new Set(figureRuns(t).map(canonicalAmount));

test('desk arithmetic grounds on nothing', () => {
  const evidence = canon('settlement 9000 requested; deposit held 1200 on bk_1003');
  const stated = canon('A diferença de 7800 deve ser tratada fora deste sistema.');
  expect([...stated].filter(f => !evidence.has(f))).toEqual(['7800']);
});

test('pt-BR formatting covers the plain figure', () => {
  expect(canon('limite de 5.000.000')).toEqual(canon('5000000 of deposit float'));
});
