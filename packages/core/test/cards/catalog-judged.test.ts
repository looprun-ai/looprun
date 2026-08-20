import { test, expect } from 'vitest';
import { hallucinationCheck, impossibilityCheck, injectionCheck, lieCheck,
         maskPattern, purgePattern, swapTerms } from '../../src/cards/catalog.js';

test('the four judged factories declare a reply-phase judgeQuery and no deny', () => {
  for (const g of [lieCheck(), impossibilityCheck(), injectionCheck(), hallucinationCheck()]) {
    expect(g.on).toBe('reply');
    expect(typeof g.judgeQuery).toBe('string');
    expect(g.judgeQuery?.length).toBeGreaterThan(10);
    expect('deny' in g).toBe(false);
    expect(g.judgePolicy ?? 'denyOnFails').toBe('denyOnFails');
    expect(g.rule.length).toBeGreaterThan(10);
  }
});

test('injectionCheck asks about instructions arriving INSIDE a tool result', () => {
  expect(injectionCheck().judgeQuery).toContain('tool result');
});

test('purgePattern DELETES the matched span', () => {
  const r = purgePattern('cpf', /\d{3}\.\d{3}\.\d{3}-\d{2}/);
  expect(r.apply('id 123.456.789-01 ok')).toBe('id  ok');
  expect(r.name).toBe('cpf');
});

test('maskPattern replaces every match with ****', () => {
  const r = maskPattern('card', /\b\d{16}\b/);
  expect(r.apply('pan 4111111111111111 and 4222222222222222'))
    .toBe('pan **** and ****');
});

test('swapTerms translates declared whole tokens only — literal, no regex', () => {
  const r = swapTerms({ CANC_PEND: 'waiting to be cancelled' });
  expect(r.apply('status: CANC_PEND.')).toBe('status: waiting to be cancelled.');
  expect(r.apply('XCANC_PENDX stays')).toBe('XCANC_PENDX stays');
});
