import { test, expect } from 'vitest';
import { canonicalAmount, carriedIds, figureRuns } from '../../src/cards/catalog.js';

// An identifier is a stem of letters, one separator, and a tail holding a digit — the
// case of the letters and the choice of underscore or hyphen decide nothing. The
// identifiers of a text leave it before its digit runs are read as amounts, so the
// digits painted inside a record's name for a thing are never an amount the reply owes.

/** The walk both the owed-fact gate and the figure walk perform on a text. */
const amountsOf = (text: string): readonly string[] => {
  let bare = text;
  for (const id of carriedIds(text)) bare = bare.split(id).join(' ');
  return [...new Set(figureRuns(bare).map(canonicalAmount))];
};

test('a record code is one identifier whatever its case and separator', () => {
  expect(carriedIds('berth A-05 is vacant')).toEqual(['A-05']);
  expect(carriedIds('BK-4402 is closed')).toEqual(['BK-4402']);
  expect(carriedIds('getBooking(bk_9) — done')).toEqual(['bk_9']);
  expect(carriedIds('ast_excv01 freed')).toEqual(['ast_excv01']);
  expect(carriedIds('Question q_5cc4f7d5 closed.')).toEqual(['q_5cc4f7d5']);
});

test('the digits painted inside a record code are never an amount', () => {
  expect(amountsOf('Kittiwake is off berth A-05, and 986 stays owed.')).toEqual(['986']);
  expect(amountsOf('BK-4402 is closed')).toEqual([]);
  expect(amountsOf('Question q_5cc4f7d5 closed: expired.')).toEqual([]);
});

test('an amount wearing a unit, a currency mark or a grouping separator is still walked', () => {
  expect(amountsOf('R$364 owed')).toEqual(['364']);
  expect(amountsOf('364m of quay')).toEqual(['364']);
  expect(amountsOf('364,00 owed')).toEqual(['364']);
  expect(amountsOf('the week comes to 364')).toEqual(['364']);
});

test('a hyphenated word and a date are not identifiers — their digits stay readable', () => {
  expect(carriedIds('status out-of-service')).toEqual([]);
  expect(carriedIds('a haul-out, well-known')).toEqual([]);
  expect(carriedIds('from 2026-09-05 to 2026-09-12')).toEqual([]);
  expect(amountsOf('from 2026-09-05 to 2026-09-12')).toEqual(['2026', '9', '5', '12']);
});

test('an amount written inside an identifier goes with it', () => {
  expect(carriedIds('the total_364 is due')).toEqual(['total_364']);
  expect(amountsOf('the total_364 is due')).toEqual([]);
});
