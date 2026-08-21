import { describe, expect, test } from 'vitest';
import { checkAgainstSurface } from '../src/index.js';
import { decl, FACTS, soundDeclaration } from './helpers.js';

describe('checkAgainstSurface', () => {
  test('an act the surface does not declare', () => {
    expect(checkAgainstSurface(decl({ guards: [{ name: 'g', acts: ['getInvioce'], factory: 'onlyAfter' }] }), FACTS))
      .toEqual([expect.stringContaining("the surface declares no such act")]);
  });

  test('a destructive act with no before', () => {
    expect(checkAgainstSurface(decl({ disclosure: {} }), FACTS))
      .toEqual([expect.stringContaining("issueRefund is destructive and declares no `before`")]);
  });

  test('a precondition reading the record over an act with no target', () => {
    expect(checkAgainstSurface(decl({ guards: [{ name: 'g', acts: ['closeBooking'], factory: 'precondition',
                                                 args: { reads: 'record' } }] }), FACTS))
      .toEqual([expect.stringContaining("declares no target")]);
  });

  test('a conduct law missing from one desk', () => {
    expect(checkAgainstSurface(decl({ desks: [
      { name: 'a', persona: 'p', tools: ['issueRefund'], conduct: { declareHonestly: 'x', oneQuestion: 'y' } },
      { name: 'b', persona: 'p', tools: ['getInvoice'],  conduct: { declareHonestly: 'x' } }] }), FACTS))
      .toEqual([expect.stringContaining("'oneQuestion' is on 1 desk and missing from b")]);
  });

  test('a disclosure alias whose read cannot answer from the held call', () => {
    expect(checkAgainstSurface(decl({ disclosure: { issueRefund: {
      needs: { invoice: 'getInvoice' }, before: 'x' } } }), { tools: {
        ...(FACTS as never as { tools: Record<string, unknown> }).tools,
        getInvoice: { name: 'getInvoice', effect: 'read', target: 'holdId', entity: 'holds', schema: { properties: { holdId: {} } } }
      } } as never))
      .toEqual([expect.stringContaining("needs getInvoice to accept")]);
  });

  test('a sound declaration refuses nothing', () => {
    expect(checkAgainstSurface(soundDeclaration(), FACTS)).toEqual([]);
  });

  test('a disclosure needs alias naming a tool that does not exist, held act target null', () => {
    const facts = { tools: {
      ...(FACTS as never as { tools: Record<string, unknown> }).tools,
      issueRefund: { name: 'issueRefund', effect: 'destructive', target: null, entity: 'invoices', schema: {} }
    } } as never;
    expect(checkAgainstSurface(decl({ disclosure: { issueRefund: {
      needs: { invoice: 'thisToolDoesNotExistAnywhere' }, before: 'x' } } }), facts))
      .toEqual([expect.stringContaining("the surface declares no such tool")]);
  });

  test('a disclosure needs alias naming a tool that does not exist, held act target set', () => {
    const refusals = checkAgainstSurface(decl({ disclosure: { issueRefund: {
      needs: { invoice: 'thisToolDoesNotExistAnywhere' }, before: 'x' } } }), FACTS);
    expect(refusals).toEqual([expect.stringContaining("the surface declares no such tool")]);
    expect(refusals[0]).not.toContain('only accepts');
  });
});
