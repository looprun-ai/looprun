import type { SeamRow } from '@looprun-ai/eval';
import type { Declaration, DeclaredDisclosure, DeclaredGuard, DeclaredSeam } from '../src/index.js';

/** The seam of the fixture world: one refusal the world spells out, on the destructive act. A
 *  declaration paying any other row is paying a row this table does not carry. */
export const SEAM: readonly SeamRow[] = [
  { act: 'issueRefund', code: 'stateIs:status', guard: null }
];

export const FACTS = { tools: {
  issueRefund: { name: 'issueRefund', effect: 'destructive', target: 'invoiceId', entity: 'invoices', schema: {} },
  getInvoice:  { name: 'getInvoice',  effect: 'read', target: 'invoiceId', entity: 'invoices', schema: { properties: { invoiceId: {} } } },
  closeBooking:{ name: 'closeBooking',effect: 'write', target: null, entity: 'auditLog', schema: {} }
} } as never;

/** A guard set, disclosure map and desk pair that together fit FACTS with no gaps: the
 *  destructive act is disclosed with a `before`, its disclosure alias resolves against the
 *  read it names, every guard names a real act and carries what its factory is configured
 *  from, a `precondition` reading a record sits over an act that has a target, and both
 *  desks teach the same conduct laws. */
export const SOUND_GUARDS: readonly DeclaredGuard[] = [
  { name: 'confirmBeforeRefund', acts: ['issueRefund'], factory: 'onlyAfter', args: { after: 'getInvoice' } },
  { name: 'confirmInvoiceKnown', acts: ['getInvoice'], factory: 'precondition', args: { reads: 'record' },
    rule: 'Read the invoice this desk was asked about before you speak for it.' }
];
export const SOUND_DISCLOSURE: Readonly<Record<string, DeclaredDisclosure>> = {
  issueRefund: { needs: { invoice: 'getInvoice' }, before: 'Say the invoice total before refunding it.' }
};
export const SOUND_DESKS: Declaration['desks'] = [
  { name: 'a', persona: 'p', tools: ['issueRefund', 'getInvoice'], conduct: { declareHonestly: 'x', oneQuestion: 'y' } },
  { name: 'b', persona: 'p', tools: ['getInvoice'], conduct: { declareHonestly: 'x', oneQuestion: 'y' } }
];

export function decl(overrides: {
  readonly guards?: readonly DeclaredGuard[];
  readonly disclosure?: Readonly<Record<string, DeclaredDisclosure>>;
  readonly desks?: Declaration['desks'];
  readonly seam?: DeclaredSeam;
} = {}): Declaration {
  return {
    contract: {
      name: 'sound-contract',
      voice: 'Warm, brief, and exact about dates and money.',
      facts: [],
      guards: overrides.guards ?? SOUND_GUARDS,
      disclosure: overrides.disclosure ?? SOUND_DISCLOSURE,
      ...(overrides.seam === undefined ? {} : { seam: overrides.seam })
    },
    desks: overrides.desks ?? SOUND_DESKS
  };
}

export function soundDeclaration(): Declaration {
  return decl();
}
