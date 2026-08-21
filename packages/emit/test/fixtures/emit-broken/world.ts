/** The broken fixture's world card: the same two acts the sound one declares, so the only thing
 *  wrong with this subject is the declaration beside it — a guard that names an act spelled one
 *  letter off, which the surface does not carry. */
import { world } from '@looprun-ai/core';

export const subjectWorld = world({
  records: {
    invoices: { inv_1: { total: 240, status: 'OPEN' } }
  },
  reads: {
    getInvoice: { form: 'get', entity: 'invoices', label: 'Look up one invoice' }
  },
  destructive: {
    issueRefund: { form: 'remove', entity: 'invoices', label: 'refund an invoice' }
  }
});
