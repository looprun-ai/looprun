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

  test('a judged check naming an act the surface does not declare', () => {
    expect(checkAgainstSurface(decl({ desks: [
      { name: 'a', persona: 'p', tools: ['issueRefund'], conduct: { declareHonestly: 'x' },
        judged: [{ factory: 'lieCheck', acts: ['issueRefudn'] }] }] }), FACTS))
      .toEqual([expect.stringContaining("desks[0].judged[0].acts[0] names 'issueRefudn'")]);
  });

  test('a judged check scoped to an act outside its own desk\'s lane', () => {
    expect(checkAgainstSurface(decl({ desks: [
      { name: 'a', persona: 'p', tools: ['issueRefund'], conduct: { declareHonestly: 'x' },
        judged: [{ factory: 'lieCheck', acts: ['closeBooking'] }] }] }), FACTS))
      .toEqual([expect.stringContaining("the 'a' desk's lane holds 'issueRefund'")]);
  });

  test('a conduct law two desks teach and a third never reads', () => {
    expect(checkAgainstSurface(decl({ desks: [
      { name: 'a', persona: 'p', tools: ['issueRefund'], conduct: { declareHonestly: 'x', oneQuestion: 'y' } },
      { name: 'b', persona: 'p', tools: ['getInvoice'],  conduct: { declareHonestly: 'x', oneQuestion: 'y' } },
      { name: 'c', persona: 'p', tools: ['getInvoice'],  conduct: { declareHonestly: 'x' } }] }), FACTS))
      .toEqual([expect.stringContaining("'oneQuestion' is on 2 desks and missing from c")]);
  });

  test('a conduct law one desk alone teaches is that desk\'s own', () => {
    expect(checkAgainstSurface(decl({ desks: [
      { name: 'a', persona: 'p', tools: ['issueRefund'],
        conduct: { declareHonestly: 'x', registryFiguresAreGiven: 'The deposit is the operator\'s figure.' } },
      { name: 'b', persona: 'p', tools: ['getInvoice'], conduct: { declareHonestly: 'x' } }] }), FACTS))
      .toEqual([]);
  });

  test('a disclosure alias whose read cannot answer from the held call', () => {
    expect(checkAgainstSurface(decl({ disclosure: { issueRefund: {
      needs: { invoice: 'getInvoice' }, before: 'x' } } }), { tools: {
        ...(FACTS as never as { tools: Record<string, unknown> }).tools,
        getInvoice: { name: 'getInvoice', effect: 'read', target: 'holdId', entity: 'holds', schema: { properties: { holdId: {} } } }
      } } as never))
      .toEqual([expect.stringContaining("needs getInvoice to accept")]);
  });

  // A read whose every argument is optional answers any act: `listHolds` declares two arguments
  // and requires neither. A read that requires the id it reads by answers only a binding that
  // states that id.
  const READS = { tools: {
    ...(FACTS as never as { tools: Record<string, unknown> }).tools,
    listHolds: { name: 'listHolds', effect: 'read', target: null, entity: 'holds',
                 schema: { properties: { scope: {}, assetId: {} } } },
    getInvoice: { name: 'getInvoice', effect: 'read', target: 'invoiceId', entity: 'invoices',
                  schema: { properties: { invoiceId: {} }, required: ['invoiceId'] } }
  } } as never;

  test('a needs alias binding a read whose every argument is optional', () => {
    expect(checkAgainstSurface(decl({ disclosure: { issueRefund: {
      needs: { freezes: { tool: 'listHolds', args: {} } },
      before: 'Say what stands frozen before refunding.' } } }), READS)).toEqual([]);
  });

  test('a needs alias whose binding leaves a required argument of the read unfilled', () => {
    expect(checkAgainstSurface(decl({ disclosure: { issueRefund: {
      needs: { invoice: { tool: 'getInvoice', args: {} } },
      before: 'Say the invoice total before refunding it.' } } }), READS))
      .toEqual([expect.stringContaining("getInvoice requires 'invoiceId'")]);
  });

  test('a needs alias whose binding fills the argument the read requires', () => {
    expect(checkAgainstSurface(decl({ disclosure: { issueRefund: {
      needs: { invoice: { tool: 'getInvoice', args: { invoiceId: 'invoiceId' } } },
      before: 'Say the invoice total before refunding it.' } } }), READS)).toEqual([]);
  });

  test('a prose guard naming an act the surface does not declare', () => {
    expect(checkAgainstSurface(decl({ guards: [{ name: 'roleRefusalNamesWhoCan',
      acts: ['issueRefund', 'closeBookng'], factory: 'prose',
      rule: 'Name the role the record states, then a member whose role can act.' }] }), FACTS))
      .toEqual([expect.stringContaining("the surface declares no such act")]);
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

  // `valueFromUser` finds no string where it looks and returns its deny sentence, so the act it
  // covers is refused on every call for the whole conversation.
  test('valueFromUser pointed at an argument the act does not declare', () => {
    expect(checkAgainstSurface(hotelDecl([
      { name: 'valueFromUser:moveBooking', acts: ['moveBooking'], factory: 'valueFromUser',
        args: { arg: 'day' } }]), HOTEL))
      .toEqual(["contract.guards[0].args.arg names 'day', and 'moveBooking' accepts 'id', 'set'. "
        + 'Pointed at an argument its act does not carry, the guard refuses every call of it. '
        + "Did you mean 'id'?"]);
  });

  // `argFormat` returns null the moment it finds nothing to test, so the same mistake is the
  // opposite failure: a check that is installed, counted in the census, and never decides anything.
  test('argFormat pointed at an argument the act does not declare', () => {
    expect(checkAgainstSurface(hotelDecl([
      { name: 'argFormat:cancelBooking', acts: ['cancelBooking'], factory: 'argFormat',
        args: { arg: 'ids', pattern: 'bk_[0-9]+' } }]), HOTEL))
      .toEqual(["contract.guards[0].args.arg names 'ids', and 'cancelBooking' accepts 'id'. "
        + 'Pointed at an argument its act does not carry, the guard never fires — it sits in the '
        + "census as a check that decides nothing. Did you mean 'id'?"]);
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
