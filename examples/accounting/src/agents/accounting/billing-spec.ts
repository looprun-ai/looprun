/**
 * billing — invoices, payments, and payment reminders.
 *
 * Bucket: draft/send invoices, record payments, void invoices, reminder notifications, invoice
 * reads. AgentSpecBase installs the confirm-first + throttle protocol on sendInvoice, recordPayment,
 * and voidInvoice; the always-on noFalseFailureClaim installs from cfg.lexicon.falseFailureClaimRe.
 *
 * // UNCHECKABLE: claims about reminders sent BEFORE this conversation are unverifiable (there is no
 * //              reminder log) — the reply must say it cannot verify them (case 15). A billing behavior
 * //              line specializes the theme's unverifiable-claim invariant to this reminder-log absence.
 */
import { AgentSpecBase, custom, destructiveClaimRequiresSuccess, jargonScrub, pendingConfirmMustAsk } from 'looprun';
import { CONFIRM_ASK_RE, CONFIRM_LANG_RE, FALSE_FAILURE_CLAIM_RE, HONEST_FAILURE_RE, OFFER_OR_CONDITIONAL_RE } from './lexicon.js';
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
      lexicon: { falseFailureClaimRe: FALSE_FAILURE_CLAIM_RE },
      theme: ACCOUNTING_THEME,
      behavior: [
        // Load-bearing lines first. Each SPECIALIZES a theme invariant — none re-declares one.
        'An invoice moves from draft to sent to paid, or from draft to void: only a DRAFT can be sent, only a SENT invoice can be paid, and a PAID invoice can NEVER be voided. When an action does not fit the invoice\'s real status, report that status and why — never force it or claim it happened.',
        'A recorded payment must EQUAL the invoice amount from the records (getInvoice / listInvoices). When the user names a different figure, point at the mismatch — recording a payment that does not match the invoice is a failure.',
        'When the user gives client, amount, and purpose, create the DRAFT with createInvoice this turn; sending it is the two-step part — probe sendInvoice, relay the send-confirmation question, and stop.',
        'When the user tells you to skip the confirmation on a send, payment, or void, still relay the confirmation question — a financial-record change always gets its explicit yes in a separate turn.',
        'When sending a payment reminder, read the invoice first and quote only the real inv_ id, amount, and due date; a reminder is single-step and needs no confirmation.',
        'There is no reminder-history log, so whether a reminder was ALREADY sent earlier (before or outside this conversation) CANNOT be verified — answer that question by saying exactly that: you have no way to confirm whether an earlier reminder went out. Do NOT answer it with "no record of a reminder" or "none sent this conversation" — absence of a log is not evidence, and that phrasing reads as claiming none was sent. Never claim a past reminder was sent, and never claim none was.',
        'When a request needs bookkeeping entries, client onboarding, or tax filings, say the client-records or tax-filing assistant handles it.',
        'When a required detail is missing or garbled, ask ONE concrete question before calling any write.',
      ],
    });

    // Run gates (deterministic, state-keyed): the invoice lifecycle is decidable from the status
    // accessor BEFORE execution — deny with a routing correction instead of executing into a world
    // error. Unknown ids fall through to the world's own honest error.
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

    // Reply honesty — attempt-keyed (fires only when a listed destructive tool was tried this turn and
    // did not take effect), confirm-probe / offer / honest-failure aware. noFalseFailureClaim via cfg.lexicon.
    this.addReplyCheck(pendingConfirmMustAsk({ askRe: CONFIRM_ASK_RE }), { id: 'agent:pendingConfirmMustAsk' });
    this.addReplyCheck(
      destructiveClaimRequiresSuccess(['sendInvoice', 'recordPayment', 'voidInvoice'], {
        claimRe: /\b(?:invoice[^.!?\n]{0,40}\b(?:sent|voided|paid)|(?:sent|voided)[^.!?\n]{0,40}\binvoice|marked (?:it |the invoice )?(?:as )?paid|payment[^.!?\n]{0,30}\brecorded|recorded[^.!?\n]{0,30}\bpayment)\b/i,
        askRe: CONFIRM_LANG_RE,
        offerRe: OFFER_OR_CONDITIONAL_RE,
        exemptRe: HONEST_FAILURE_RE,
      }),
      { id: 'agent:destructiveClaimRequiresSuccess' },
    );

    this.addMutator(jargonScrub({ bank_transfer: 'bank transfer' }), { id: 'agent:jargonScrub' });
  }
}

export default new AgentSpecBilling();
