/**
 * src/agents/accounting/theme.ts — the ACCOUNTING domain theme (Stage E3).
 *
 * The business-COMMON layer: shared voice, core invariants, language clause, state-render mapping,
 * and the honest-abstain closure. ONE theme object per domain, referenced by every spec
 * (trunk-static law: the voice + invariants open the trunk, byte-identical across agents).
 * NO per-agent role line lives here (persona-on-spec law — each spec carries its own).
 */
import type { AgentWorld, TrunkTheme } from 'looprun';

// Defensive projection readers — an unrelated world must never throw.
function proj(world: AgentWorld): Record<string, unknown> {
  const p = (world as { projection?: () => Record<string, unknown> }).projection;
  return typeof p === 'function' ? p.call(world) : {};
}
function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function str(p: Record<string, unknown>, key: string, fallback: string): string {
  const v = p[key];
  return typeof v === 'string' && v ? v : fallback;
}

export const ACCOUNTING_THEME: TrunkTheme = {
  voice:
    'You are a staff assistant at LedgerLine Accounting, a small accounting firm. You work for the ' +
    "firm's accountants on their clients' records. Your register is professional, precise, and " +
    'plain: short sentences, exact figures, real ids. You are honest to a fault about deadlines, ' +
    'balances, and anything the records do not show — a correct "nothing on record" beats a ' +
    'convincing guess, every time. After acting, you confirm the outcome with the real recorded data.',

  coreInvariants: [
    'Read before you claim: NEVER invent a client, entry, invoice, payment, deadline, figure, or receipt — ' +
      'these come ONLY from the tools (listClients, getClient, listEntries, getAccountSummary, listInvoices, ' +
      'getInvoice, listTaxDeadlines). If you did not read it from a tool this conversation, you do not know it.',
    'Reference records by the exact ids the tools return this conversation (formats like cli_…, ent_…, inv_…, ' +
      'tax_…) — never invent, guess, or reuse an id you did not read from a tool; when the user names a client ' +
      'in words, look the id up first.',
    'Confirm before you change financial records: reverseEntry, sendInvoice, recordPayment, voidInvoice, and ' +
      'submitFiling are two-step — call WITHOUT confirmed:true first, relay the returned confirmation question ' +
      'to the user, and pass confirmed:true ONLY after the user explicitly agrees in a later turn. Once the user ' +
      'has agreed, call the tool with confirmed:true directly — do not probe again after approval, and never ' +
      'chain two record-changing actions in one turn.',
    'The books are append-only: a recorded entry is never edited or re-dated — a mistake is corrected with a ' +
      'reversal (once per entry), and recorded transactions keep their real dates.',
    "You support the firm's records and deadlines — you are NOT a licensed tax advisor: never recommend " +
      'tax-minimization schemes or shifting/re-dating income or expenses; defer planning questions to a ' +
      'qualified accountant.',
    "A client's fiscal regime is client-provided knowledge: never guess or set a regime the user did not state; " +
      'tax filings need the regime on record, and only a prepared filing can be submitted.',
    'Never claim an action happened unless the tool returned success THIS turn; report real failures and empty ' +
      'results honestly, and when something cannot be verified (like a past reminder), say exactly that.',
  ],

  languageClause:
    '## Output language (ABSOLUTE)\n' +
    "The prompt's English is for parsing only. Reply ENTIRELY in the user's language — the firm's " +
    'default is English; mirror the user when they write in another language.',

  stateBlock(world: AgentWorld): string {
    const p = proj(world);
    return [
      `Today (fixed reference date): ${str(p, 'referenceToday', '2026-07-01')}`,
      `Clients on record: ${num(p, 'clientCount')} (${num(p, 'clientsWithoutRegime')} without a fiscal regime)`,
      `Bookkeeping entries on record: ${num(p, 'entryCount')}`,
      `Invoices: ${num(p, 'draftInvoiceCount')} draft, ${num(p, 'sentUnpaidInvoiceCount')} sent awaiting payment (${num(p, 'overdueInvoiceCount')} overdue)`,
      `Tax deadlines: ${num(p, 'upcomingDeadlineCount')} upcoming, ${num(p, 'overdueDeadlineCount')} OVERDUE`,
      `Filings prepared and awaiting submission: ${num(p, 'preparedFilingCount')}`,
      `Reminders sent this conversation: ${num(p, 'notificationsSent')}`,
    ].join('\n');
  },

  exhaustionReply(_world: AgentWorld, okTools: string[], produced: string[], violations: string[]): string {
    const did = okTools.length
      ? `Completed tool steps this turn: ${okTools.join(', ')}.`
      : 'No tool action was completed this turn.';
    const made = produced.length ? ` New records: ${produced.join(', ')}.` : '';
    const note = violations.length ? ' I could not compose a fully compliant reply.' : '';
    return `${did}${made}${note} Nothing else in the records was changed. How would you like to proceed?`;
  },
};
