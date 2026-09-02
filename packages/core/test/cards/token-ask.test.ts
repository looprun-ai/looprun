/** The deterministic token ask: where the schema declares the argument's tokens, the
 *  gate's refusal LISTS them — engine data, engine sentence — and the delivery gate
 *  forces every listed token verbatim into the reply, whatever its language. The
 *  operator answers with the token; the verbatim licence already accepts it. */
import { test, expect } from 'vitest';
import type { CallCtx, Json } from '../../src/contract/vocabulary.js';
import { NO_READS } from '../../src/contract/vocabulary.js';
import { valueFromUser } from '../../src/cards/catalog.js';
import { gateMisses } from '../../src/run/delivery-facts.js';
import type { SurfaceFacts } from '../../src/contract/vocabulary.js';

const FACTS = { tools: {
  completeMaintenance: { name: 'completeMaintenance', label: 'Return an asset to service',
    effect: 'write', entity: 'assets', target: 'assetId',
    schema: { type: 'object', properties: {
      assetId: { type: 'string' },
      condition: { type: 'string', enum: ['excellent', 'good', 'fair', 'poor', 'damaged'] }
    }, required: ['assetId', 'condition'] } }
} } as unknown as SurfaceFacts;

function ctx(args: Record<string, Json>, userTexts: readonly string[]): CallCtx {
  return { call: { tool: 'completeMaintenance', args, key: 'k' }, effect: 'write',
    consented: false, reads: NO_READS, userText: userTexts[0] ?? '', userTexts,
    turnActs: [], pastActs: [] } as unknown as CallCtx;
}

test('the refusal lists the schema tokens — engine data, engine sentence', () => {
  const g = valueFromUser('completeMaintenance', 'condition').compile('contract', FACTS);
  const deny = g.deny(ctx({ condition: 'good' }, ['Saiu boa.']));
  expect(deny).toContain('takes exactly one of: ');
  for (const token of ['excellent', 'good', 'fair', 'poor', 'damaged']) {
    expect(deny).toContain(token);
  }
});

test('an echoed token is licensed verbatim — the existing law, unchanged', () => {
  const g = valueFromUser('completeMaintenance', 'condition').compile('contract', FACTS);
  expect(g.deny(ctx({ condition: 'good' }, ['Saiu em condição "good".']))).toBeNull();
});

test('gateMisses forces every listed token into the reply, whatever the language', () => {
  const fact = { kind: 'refusal' as const, state: 'refused' as const,
    text: "'condition' takes exactly one of: excellent | good | fair | poor | damaged "
      + '— ask the operator which and send it verbatim' };
  const ptWithTokens = 'Em qual condição a máquina saiu? Responda com uma destas palavras: '
    + 'excellent, good, fair, poor ou damaged.';
  expect(gateMisses([fact], ptWithTokens)).toEqual([]);
  const ptWithout = 'Em qual condição a máquina saiu?';
  expect(gateMisses([fact], ptWithout).join(' ')).toContain('excellent');
});
