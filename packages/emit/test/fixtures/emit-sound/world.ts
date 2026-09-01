/** The sound fixture's world card: three acts over four record families, and one gate the WORLD
 *  itself enforces — a refund lands only on an invoice that is still open. The gate is what puts
 *  a row in the seam table: a refusal the operator meets as a bare code. The workspace row names
 *  who is acting and the roster carries their role, which is what the closing note is gated on. */
import { world } from '@looprun-ai/core';

export const subjectWorld = world({
  records: {
    invoices: {
      inv_1: { total: 240, status: 'OPEN' },
      inv_2: { total: 180, status: 'SETTLED' }
    },
    auditLog: {},
    workspace: { ws_1: { actingMemberId: 'mem_1' } },
    members: { mem_1: { role: 'auditor' } }
  },
  reads: {
    getInvoice: { form: 'get', entity: 'invoices', label: 'Look up one invoice' },
    getMember: { form: 'get', entity: 'members', label: 'Look up the acting member' },
    listMembers: { form: 'list', entity: 'members', label: 'List the members' }
  },
  writes: {
    closeBooking: { form: 'make', entity: 'auditLog', label: 'Write the closing note' }
  },
  destructive: {
    issueRefund: {
      form: 'remove', entity: 'invoices', label: 'refund an invoice', target: 'id',
      schema: { type: 'object',
                properties: { id: { type: 'string' }, amount: { type: 'number' } },
                required: ['id', 'amount'] },
      gates: [{ kind: 'stateIs', field: 'status', value: 'OPEN' }]
    }
  }
});
