/**
 * billing — invoices, payments, and payment reminders.
 *
 * Bucket: draft/send invoices, record payments, void invoices, reminder notifications, invoice
 * reads. Layer: AgentSpecBase — sendInvoice, recordPayment, and voidInvoice carry the
 * confirmed-flag two-step protocol (confirmFirst + destructiveThrottle install from the layer).
 *
 * // UNCHECKABLE: claims about PAST reminders are unverifiable (there is no reminder log) — the
 * //              reply must say it cannot verify them — conditioned prose + eval dimension only
 * //              (case 15).
 */
import { AgentSpecBase, custom, jargonScrub, noFalseFailureClaim } from 'looprun';
import { FALSE_FAILURE_CLAIM_RE, destructiveClaimRequiresAttemptedSuccess, pendingConfirmUnlessResolved } from './guards.js';
import { ACCOUNTING_THEME } from './theme.js';

/** The one per-id status read the invoice gates need (world accessor via the ctx closure). */
type InvoiceStatusReader = { invoiceStatus?: (invoiceId: string) => string | null };

const readStatus = (ctx: { args: Record<string, unknown>; world: unknown }): string | null => {
  const id = typeof ctx.args.invoiceId === 'string' ? ctx.args.invoiceId : '';
  return (ctx.world as InvoiceStatusReader).invoiceStatus?.(id) ?? null;
};

export class AgentSpecBilling extends AgentSpecBase {
  constructor() {
    super({
      id: 'billing',
      mode: 'BILLING',
      persona:
        'You are the billing agent: drafting and sending invoices, recording client payments, ' +
        'voiding unpaid invoices, and payment reminders.',
      tools: [
        'listClients',
        'getClient',
        'createInvoice',
        'listInvoices',
        'getInvoice',
        'sendInvoice',
        'recordPayment',
        'voidInvoice',
        'sendClientNotification',
      ],
      destructiveTools: ['sendInvoice', 'recordPayment', 'voidInvoice'],
      theme: ACCOUNTING_THEME,
      behavior: [
        'When the user asks for an invoice and gives client, amount, and purpose, create the DRAFT directly this turn (creation needs no confirmation); sending it is the two-step part — relay the send-confirmation question and stop.',
        'When recording a payment, use the invoice amount from the records (getInvoice/listInvoices) — a payment must equal the invoice amount exactly; when the user names a different figure, point at the mismatch instead of forcing it.',
        'When the user tells you to skip the confirmation of a payment, void, or send, still relay the confirmation question — financial-record changes always get the explicit yes in a separate turn; say so briefly.',
        'When an invoice cannot be acted on (paid invoices can never be voided; only drafts can be sent; only sent invoices can be paid), report the real status and why the action is not possible — never claim it happened.',
        'When sending a payment reminder, read the invoice first and quote only the real invoice id, amount, and due date in the message.',
        'When asked whether a reminder was already sent before this conversation, say that past reminders cannot be verified (there is no reminder log) — never claim one was or was not sent.',
        'When a request needs bookkeeping entries, client onboarding, or tax filings, say the client-records or tax-filing assistant handles it.',
        'If a tool fails, report the real error briefly — never claim success that did not happen.',
        'When a message is garbled or missing a needed detail, recover with ONE concrete clarifying question.',
      ],
    });

    // Run gates (deterministic, state-keyed): the invoice lifecycle is decidable from the status
    // accessor BEFORE execution — deny with a routing correction instead of executing into a
    // world error. Unknown ids fall through to the world's own honest error.
    this.addGuard(
      'preTool',
      ['voidInvoice'],
      custom({
        kind: 'noVoidClosedInvoice',
        dim: 'run',
        check: (ctx) => {
          const status = readStatus(ctx);
          if (status === 'paid') {
            return `${String(ctx.args.invoiceId)} is already PAID — a paid invoice can never be voided. Tell the user why, and suggest raising the dispute with the firm instead.`;
          }
          if (status === 'void') {
            return `${String(ctx.args.invoiceId)} is already void — tell the user it is already void; do not void it again.`;
          }
          return null;
        },
        prose: () => 'voiding applies only to unpaid invoices — when an invoice is already paid (or already void), say it cannot be voided and why',
      }),
      { id: 'agent:noVoidClosedInvoice' },
    );
    this.addGuard(
      'preTool',
      ['sendInvoice'],
      custom({
        kind: 'sendableOnlyDraft',
        dim: 'run',
        check: (ctx) => {
          const status = readStatus(ctx);
          if (status === null || status === 'draft') return null;
          return `${String(ctx.args.invoiceId)} is ${status} — only DRAFT invoices can be sent. Tell the user its real status instead.`;
        },
        prose: () => 'only a draft invoice can be sent — when it was already sent (or is paid/void), report its real status instead',
      }),
      { id: 'agent:sendableOnlyDraft' },
    );
    this.addGuard(
      'preTool',
      ['recordPayment'],
      custom({
        kind: 'payableOnlySent',
        dim: 'run',
        check: (ctx) => {
          const status = readStatus(ctx);
          if (status === null || status === 'sent') return null;
          if (status === 'draft') {
            return `${String(ctx.args.invoiceId)} is still a DRAFT — it must be sent before a payment can be recorded. Tell the user.`;
          }
          return `${String(ctx.args.invoiceId)} is ${status} — no payment can be recorded against it. Tell the user its real status.`;
        },
        prose: () => 'a payment can be recorded only against a sent, unpaid invoice — when the invoice is a draft, already paid, or void, say so instead',
      }),
      { id: 'agent:payableOnlySent' },
    );

    // Reply honesty — attempt-keyed + resolution-aware local factories (see ./guards.ts).
    this.addReplyCheck(pendingConfirmUnlessResolved(), { id: 'agent:pendingConfirmUnlessResolved' });
    this.addReplyCheck(
      destructiveClaimRequiresAttemptedSuccess(
        ['sendInvoice', 'recordPayment', 'voidInvoice'],
        /\b(?:invoice[^.!?\n]{0,40}\b(?:sent|voided|paid)|(?:sent|voided)[^.!?\n]{0,40}\binvoice|marked (?:it |the invoice )?(?:as )?paid|payment[^.!?\n]{0,30}\brecorded|recorded[^.!?\n]{0,30}\bpayment)\b/i,
        /\b(?:already|cannot|can['’]?t|could not|couldn['’]?t|not|unable|hasn['’]?t|haven['’]?t|isn['’]?t|wasn['’]?t|yet|pending|overdue|reminder|notification|notice)\b/i,
      ),
      { id: 'agent:destructiveClaimRequiresAttemptedSuccess' },
    );
    this.addReplyCheck(noFalseFailureClaim({ claimRe: FALSE_FAILURE_CLAIM_RE }), { id: 'agent:noFalseFailureClaim' });

    this.addMutator(jargonScrub({ bank_transfer: 'bank transfer' }), { id: 'agent:jargonScrub' });
  }
}

export default new AgentSpecBilling();
