import { describe, expect, test } from 'vitest';
import { checkAgainstSurface } from '../src/index.js';
import type { Declaration, DeclaredDisclosure, DeclaredGuard } from '../src/index.js';

const FACTS = { tools: {
  issueRefund: { name: 'issueRefund', effect: 'destructive', target: 'invoiceId', entity: 'invoices', schema: {} },
  getInvoice:  { name: 'getInvoice',  effect: 'read', target: 'invoiceId', entity: 'invoices', schema: { properties: { invoiceId: {} } } },
  closeBooking:{ name: 'closeBooking',effect: 'write', target: null, entity: 'auditLog', schema: {} }
} } as never;

/** A guard set, disclosure map and desk pair that together fit FACTS with no gaps: the
 *  destructive act is disclosed with a `before`, its disclosure alias resolves against the
 *  read it names, every guard names a real act, and both desks teach the same conduct laws. */
const SOUND_GUARDS: readonly DeclaredGuard[] = [
  { name: 'confirmBeforeRefund', acts: ['issueRefund'], factory: 'onlyAfter' }
];
const SOUND_DISCLOSURE: Readonly<Record<string, DeclaredDisclosure>> = {
  issueRefund: { needs: { invoice: 'getInvoice' }, before: 'Say the invoice total before refunding it.' }
};
const SOUND_DESKS: Declaration['desks'] = [
  { name: 'a', persona: 'p', tools: ['issueRefund', 'getInvoice'], conduct: { declareHonestly: 'x', oneQuestion: 'y' } },
  { name: 'b', persona: 'p', tools: ['getInvoice'], conduct: { declareHonestly: 'x', oneQuestion: 'y' } }
];

function decl(overrides: {
  readonly guards?: readonly DeclaredGuard[];
  readonly disclosure?: Readonly<Record<string, DeclaredDisclosure>>;
  readonly desks?: Declaration['desks'];
} = {}): Declaration {
  return {
    contract: {
      name: 'sound-contract',
      voice: 'Warm, brief, and exact about dates and money.',
      facts: [],
      guards: overrides.guards ?? SOUND_GUARDS,
      disclosure: overrides.disclosure ?? SOUND_DISCLOSURE
    },
    desks: overrides.desks ?? SOUND_DESKS
  };
}

function soundDeclaration(): Declaration {
  return decl();
}

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
});
