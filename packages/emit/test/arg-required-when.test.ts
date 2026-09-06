/** An argument another argument's value requires: a law over the call's own arguments, written
 *  from two declared fields and run here against the calls a desk would make. */
import { expect, test } from 'vitest';
import { writeCards } from '../src/index.js';
import type { Declaration, DeclaredGuard } from '../src/index.js';
import { decl, FACTS } from './helpers.js';

const cards = (guards: readonly DeclaredGuard[]): string =>
  writeCards(decl({ guards }) as Declaration, FACTS);

/** The emitted predicate of one guard, runnable. */
function predicateOf(written: string, name: string): (args: Record<string, unknown>) => unknown {
  const at = written.indexOf(`name: '${name}'`);
  const start = written.lastIndexOf('({ args }) => {', at);
  const open = written.indexOf('{', start + 5);
  const close = written.indexOf('\n        },', open);
  const fn = new Function('args', written.slice(open + 1, close)) as (a: unknown) => unknown;
  return args => fn(args);
}

const SETTLEMENT: DeclaredGuard = { name: 'aSettlementCarriesItsAmount', acts: ['issueRefund'],
  factory: 'argRequired',
  args: { arg: 'amount', when: { arg: 'reason', in: ['goodwill', 'overcharge'] } },
  rule: 'A refund for goodwill or an overcharge names its amount; ask for it first.' };

test('the argument is required only when the other carries a declared value', () => {
  const law = predicateOf(cards([SETTLEMENT]), 'aSettlementCarriesItsAmount');
  expect(law({ reason: 'goodwill' })).toBe(false);
  expect(law({ reason: 'goodwill', amount: 250 })).toBe(true);
  expect(law({ reason: 'goodwill', amount: '' })).toBe(false);
  expect(law({ reason: 'duplicate' })).toBe(true);
});

test('without when, the argument is required on every call', () => {
  const law = predicateOf(cards([{ ...SETTLEMENT, args: { arg: 'amount' } }]), 'aSettlementCarriesItsAmount');
  expect(law({ reason: 'duplicate' })).toBe(false);
  expect(law({ amount: 0 })).toBe(true);
});

test('a when block without its argument, and a rule left out, are refused', () => {
  expect(() => cards([{ ...SETTLEMENT, args: { arg: 'amount', when: { is: 'goodwill' } } }]))
    .toThrow('{ arg, is | in }');
  expect(() => cards([{ ...SETTLEMENT, rule: undefined }])).toThrow('rule');
});
