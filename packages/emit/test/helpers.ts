import type { SeamRow } from '@looprun-ai/eval';
import type { Declaration, DeclaredDisclosure, DeclaredGuard, DeclaredSeam } from '../src/index.js';

/** The seam of the fixture world: one refusal the world spells out, on the destructive act. A
 *  declaration paying any other row is paying a row this table does not carry. */
export const SEAM: readonly SeamRow[] = [
  { act: 'issueRefund', code: 'stateIs:status', guard: null }
];

export const FACTS = { tools: {
  issueRefund: { name: 'issueRefund', effect: 'destructive', target: 'invoiceId', entity: 'invoices',
    schema: { type: 'object',
              properties: { invoiceId: {}, amount: {}, currency: {}, reason: {}, note: {} },
              required: ['invoiceId', 'amount', 'currency', 'reason'] } },
  getInvoice:  { name: 'getInvoice',  effect: 'read', target: 'invoiceId', entity: 'invoices', schema: { properties: { invoiceId: {} } } },
  closeBooking:{ name: 'closeBooking',effect: 'write', target: null, entity: 'auditLog', schema: {} }
} } as never;

/** The six voices, in one desk's words. Every desk of a house of two or more states all six, so a
 *  fixture pairing two desks hands each of them this map. */
export const SIX_VOICES: Readonly<Record<string, string>> = {
  declareHonestly: 'Say what ran and what did not.',
  oneQuestion: 'Put ONE thing up for agreement per turn.',
  yourLaneYourReads: 'Answer from the reads this desk can run.',
  recordsOverAssertions: 'Say what the read returned, never what you recall.',
  askBeforeYouChoose: 'Ask before you choose on the operator\'s behalf.',
  nameItDoNotPassItOn: 'Name what this desk cannot do, and never hand it on in silence.'
};

/** A guard set, disclosure map and desk pair that together fit FACTS with no gaps: the
 *  destructive act is disclosed with a `before` and every act that changes the world with an
 *  `after`, its disclosure alias resolves against the read it names, every guard names a real act
 *  and carries what its factory is configured from, a `precondition` reading a record sits over an
 *  act that has a target, and both desks teach all six voices. */
export const SOUND_GUARDS: readonly DeclaredGuard[] = [
  { name: 'confirmBeforeRefund', acts: ['issueRefund'], factory: 'onlyAfter', args: { after: 'getInvoice' } },
  { name: 'confirmInvoiceKnown', acts: ['getInvoice'], factory: 'precondition', args: { reads: 'record' },
    rule: 'Read the invoice this desk was asked about before you speak for it.' }
];

/** The after-tense of every act of FACTS that changes the world: the sentence the operator reads
 *  once the change exists, written from what the call itself came back with. A declaration that
 *  leaves one of these out is refused by the act's own name, so every fixture handing FACTS to the
 *  surface check states them — the ones testing a gap elsewhere spread this map and write their
 *  own gap over it. */
export const AFTERS: Readonly<Record<string, DeclaredDisclosure>> = {
  issueRefund: { after: 'The refund of {result.refunded} is on the invoice.' },
  closeBooking: { after: 'The closing note reads {result.status}.' }
};

export const SOUND_DISCLOSURE: Readonly<Record<string, DeclaredDisclosure>> = {
  ...AFTERS,
  issueRefund: { ...AFTERS.issueRefund, needs: { invoice: 'getInvoice' },
    before: 'Say the invoice total before refunding it.' }
};
export const SOUND_DESKS: Declaration['desks'] = [
  { name: 'a', persona: 'p', tools: ['issueRefund', 'getInvoice'], conduct: SIX_VOICES,
    description: 'refunds and the invoices behind them', summary: 'the desk', },
  { name: 'b', persona: 'p', tools: ['getInvoice'], conduct: SIX_VOICES,
    description: 'invoice lookups on their own', summary: 'the desk', }
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
