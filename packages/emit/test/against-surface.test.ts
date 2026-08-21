import { describe, expect, test } from 'vitest';
import { checkAgainstSurface } from '../src/index.js';
import type { Declaration, DeclaredGuard } from '../src/index.js';
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

  // The hotel's own shape: `moveBooking` is `form: 'set'`, whose derived schema is `{ id, set }`,
  // and a law about the day the guest chose has no argument on that act to hold on to.
  const HOTEL = { tools: {
    moveBooking: { name: 'moveBooking', effect: 'write', target: 'id', entity: 'bookings',
      schema: { properties: { id: {}, set: {} } } },
    cancelBooking: { name: 'cancelBooking', effect: 'destructive', target: 'id', entity: 'bookings',
      schema: { properties: { id: {} } } }
  } } as never;
  const hotelDecl = (guards: readonly DeclaredGuard[]): Declaration => decl({
    guards,
    disclosure: { cancelBooking: { before: 'Cancelling this booking cannot be taken back.' } },
    desks: [{ name: 'concierge', persona: 'p', tools: ['moveBooking', 'cancelBooking'],
              conduct: { declareHonestly: 'x' } }]
  });

  test('valueFromUser pointed at an argument the act does not declare', () => {
    expect(checkAgainstSurface(hotelDecl([
      { name: 'valueFromUser:moveBooking', acts: ['moveBooking'], factory: 'valueFromUser',
        args: { arg: 'day' } }]), HOTEL))
      .toEqual([expect.stringContaining("contract.guards[0].args.arg names 'day', and 'moveBooking' "
        + "accepts 'id', 'set' — pointed at an argument its act does not carry, the guard refuses "
        + "every call of it.")]);
  });

  test('argFormat pointed at an argument the act does not declare names the near miss', () => {
    const refusals = checkAgainstSurface(hotelDecl([
      { name: 'argFormat:cancelBooking', acts: ['cancelBooking'], factory: 'argFormat',
        args: { arg: 'ids', pattern: 'bk_[0-9]+' } }]), HOTEL);
    expect(refusals).toEqual([expect.stringContaining("Did you mean 'id'?")]);
  });

  test('a guard configured from an argument the act does declare passes', () => {
    expect(checkAgainstSurface(hotelDecl([
      { name: 'valueFromUser:moveBooking', acts: ['moveBooking'], factory: 'valueFromUser',
        args: { arg: 'id' } }]), HOTEL)).toEqual([]);
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
