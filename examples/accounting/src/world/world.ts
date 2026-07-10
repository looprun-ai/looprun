/**
 * src/world/world.ts — the deterministic accounting world (Stage G2 step 2).
 *
 * A pure in-memory world: NO I/O, NO clock, NO randomness (the guard-purity lints apply to worlds
 * the same as guards). All date logic compares ISO `YYYY-MM-DD` strings lexicographically against
 * the fixed REFERENCE_TODAY. Destructive probes (`confirmed` absent/false) are side-effect-free
 * and return `{ success: true, requiresConfirmation: true, question }`. `advanceTurn()` only
 * increments the turn counter — it never auto-finishes a user-gated two-step action.
 */
import type { AgentWorld } from 'looprun';
import {
  buildPreset,
  type DeadlineRec,
  type EntryRec,
  type FilingState,
  type InvoiceRec,
  type Regime,
  type WorldData,
} from './presets.js';

/** The fixed world clock (never a real clock). */
export const REFERENCE_NOW = '2026-07-01T09:00:00.000Z';
export const REFERENCE_TODAY = '2026-07-01';

const REGIME_RATES: Record<Regime, number> = { simplified: 0.1, standard: 0.15, cash_basis: 0.12 };
const REGIMES: readonly string[] = ['simplified', 'standard', 'cash_basis'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type ToolResult = { success: boolean; [k: string]: unknown };

const fail = (error: string): ToolResult => ({ success: false, error });

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export class AccountingWorld implements AgentWorld {
  readonly preset: string;
  readonly seed: number;
  /** Ledger of executed calls (host-visible; NOT the runtime's observed ledger). */
  toolCalls: Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }> = [];
  sseActions: unknown[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;

  private data: WorldData;
  private turn = 0;
  private notifications: Array<{ id: string; clientId: string; message: string }> = [];
  private reversedEntries = new Set<string>();
  private nextEntryNum: number;
  private nextInvoiceNum: number;
  private nextNotificationNum = 1;
  private nextReceiptNum = 84214;

  constructor(preset: string, seed: number) {
    this.preset = preset;
    this.seed = seed;
    this.data = buildPreset(preset);
    this.nextEntryNum = 1 + this.data.entries.reduce((m, e) => Math.max(m, Number(e.id.slice(4)) || 0), 100);
    this.nextInvoiceNum = 1 + this.data.invoices.reduce((m, i) => Math.max(m, Number(i.id.slice(4)) || 0), 1000);
  }

  // ── runtime seams ────────────────────────────────────────────────────────────────────────────

  advanceTurn(): void {
    this.turn += 1; // counter ONLY — never auto-completes a pending two-step action
  }

  ingestAttachment(url: string): string {
    const label = `att_${this.toolCalls.length + 1}_${url.length}`;
    return label; // deterministic label; the accounting domain takes no attachments
  }

  exec(name: string, args: Record<string, unknown>): unknown {
    const result = this.dispatch(name, args ?? {});
    const tookEffect = result.success === true && result.requiresConfirmation !== true && this.isWrite(name);
    this.toolCalls.push({ name, args, result, tookEffect });
    return result;
  }

  // ── accessors (the ONLY per-id state guards may read, via closures) ─────────────────────────────

  hasClient(clientId: string): boolean {
    return this.data.clients.some((c) => c.id === clientId);
  }

  clientRegime(clientId: string): string | null {
    return this.data.clients.find((c) => c.id === clientId)?.regime ?? null;
  }

  hasEntry(entryId: string): boolean {
    return this.data.entries.some((e) => e.id === entryId);
  }

  entryReversed(entryId: string): boolean {
    return this.reversedEntries.has(entryId);
  }

  invoiceStatus(invoiceId: string): 'draft' | 'sent' | 'paid' | 'void' | null {
    return this.data.invoices.find((i) => i.id === invoiceId)?.status ?? null;
  }

  deadlineClient(deadlineId: string): string | null {
    return this.data.deadlines.find((d) => d.id === deadlineId)?.clientId ?? null;
  }

  filingStatus(deadlineId: string): FilingState | null {
    return this.data.deadlines.find((d) => d.id === deadlineId)?.filing ?? null;
  }

  /** The flat state snapshot deterministic checks + the theme stateBlock may read. */
  projection(): Record<string, unknown> {
    const sentUnpaid = this.data.invoices.filter((i) => i.status === 'sent');
    return {
      referenceToday: REFERENCE_TODAY,
      clientCount: this.data.clients.length,
      clientsWithoutRegime: this.data.clients.filter((c) => c.regime === null).length,
      entryCount: this.data.entries.length,
      draftInvoiceCount: this.data.invoices.filter((i) => i.status === 'draft').length,
      sentUnpaidInvoiceCount: sentUnpaid.length,
      overdueInvoiceCount: sentUnpaid.filter((i) => i.dueDate < REFERENCE_TODAY).length,
      upcomingDeadlineCount: this.data.deadlines.filter((d) => d.filing !== 'submitted' && d.dueDate >= REFERENCE_TODAY).length,
      overdueDeadlineCount: this.data.deadlines.filter((d) => d.filing !== 'submitted' && d.dueDate < REFERENCE_TODAY).length,
      preparedFilingCount: this.data.deadlines.filter((d) => d.filing === 'prepared').length,
      notificationsSent: this.notifications.length,
    };
  }

  // ── dispatch ─────────────────────────────────────────────────────────────────────────────────

  private isWrite(name: string): boolean {
    return [
      'createClient', 'updateClient', 'setFiscalRegime', 'recordEntry', 'reverseEntry',
      'createInvoice', 'sendInvoice', 'recordPayment', 'voidInvoice',
      'createTaxDeadline', 'cancelTaxDeadline', 'prepareFiling', 'submitFiling', 'sendClientNotification',
    ].includes(name);
  }

  private dispatch(name: string, args: Record<string, unknown>): ToolResult {
    switch (name) {
      // terminal tools are runtime-owned; the world just acknowledges them
      case 'replyToUser':
      case 'askUser':
        return { success: true };

      case 'listClients': return this.listClients(args);
      case 'getClient': return this.getClient(args);
      case 'createClient': return this.createClient(args);
      case 'updateClient': return this.updateClient(args);
      case 'setFiscalRegime': return this.setFiscalRegime(args);
      case 'recordEntry': return this.recordEntry(args);
      case 'reverseEntry': return this.reverseEntry(args);
      case 'listEntries': return this.listEntries(args);
      case 'getAccountSummary': return this.getAccountSummary(args);
      case 'createInvoice': return this.createInvoice(args);
      case 'listInvoices': return this.listInvoices(args);
      case 'getInvoice': return this.getInvoice(args);
      case 'sendInvoice': return this.sendInvoice(args);
      case 'recordPayment': return this.recordPayment(args);
      case 'voidInvoice': return this.voidInvoice(args);
      case 'listTaxDeadlines': return this.listTaxDeadlines(args);
      case 'createTaxDeadline': return this.createTaxDeadline(args);
      case 'cancelTaxDeadline': return this.cancelTaxDeadline(args);
      case 'prepareFiling': return this.prepareFiling(args);
      case 'submitFiling': return this.submitFiling(args);
      case 'sendClientNotification': return this.sendClientNotification(args);

      default:
        return fail(`unknown tool "${name}"`);
    }
  }

  // ── clients ──────────────────────────────────────────────────────────────────────────────────

  private listClients(args: Record<string, unknown>): ToolResult {
    const q = typeof args.query === 'string' ? args.query.toLowerCase() : '';
    const clients = this.data.clients
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .map((c) => ({ clientId: c.id, name: c.name, fiscalRegime: c.regime }));
    return { success: true, count: clients.length, clients };
  }

  private requireClient(clientId: unknown): { id: string } | ToolResult {
    if (typeof clientId !== 'string' || !clientId) return fail('clientId is required');
    if (!this.hasClient(clientId)) return fail(`unknown clientId "${clientId}" — look it up with listClients`);
    return { id: clientId };
  }

  private getClient(args: Record<string, unknown>): ToolResult {
    const ref = this.requireClient(args.clientId);
    if ('success' in ref) return ref;
    const c = this.data.clients.find((x) => x.id === ref.id)!;
    return {
      success: true,
      client: { clientId: c.id, name: c.name, email: c.email, phone: c.phone ?? null, fiscalRegime: c.regime },
    };
  }

  private createClient(args: Record<string, unknown>): ToolResult {
    const name = typeof args.name === 'string' ? args.name.trim() : '';
    const email = typeof args.email === 'string' ? args.email.trim() : '';
    if (!name) return fail('name is required');
    if (!email || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return fail('a valid email is required');
    const slugBase = 'cli_' + (name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').split('_')[0] || 'client');
    let slug = slugBase;
    let n = 2;
    while (this.hasClient(slug)) slug = `${slugBase}${n++}`;
    this.data.clients.push({ id: slug, name, email, phone: typeof args.phone === 'string' ? args.phone : undefined, regime: null });
    return { success: true, clientId: slug, name, fiscalRegime: null, note: 'fiscal regime not set yet — set it with setFiscalRegime when known' };
  }

  private updateClient(args: Record<string, unknown>): ToolResult {
    const ref = this.requireClient(args.clientId);
    if ('success' in ref) return ref;
    const c = this.data.clients.find((x) => x.id === ref.id)!;
    const changed: string[] = [];
    if (typeof args.name === 'string' && args.name.trim()) { c.name = args.name.trim(); changed.push('name'); }
    if (typeof args.email === 'string' && args.email.trim()) {
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(args.email.trim())) return fail('invalid email format');
      c.email = args.email.trim(); changed.push('email');
    }
    if (typeof args.phone === 'string' && args.phone.trim()) { c.phone = args.phone.trim(); changed.push('phone'); }
    if (!changed.length) return fail('nothing to update — pass name, email, or phone');
    return { success: true, clientId: c.id, updated: changed };
  }

  private setFiscalRegime(args: Record<string, unknown>): ToolResult {
    const ref = this.requireClient(args.clientId);
    if ('success' in ref) return ref;
    const regime = args.regime;
    if (typeof regime !== 'string' || !REGIMES.includes(regime)) {
      return fail(`regime must be one of: ${REGIMES.join(', ')}`);
    }
    const c = this.data.clients.find((x) => x.id === ref.id)!;
    c.regime = regime as Regime;
    return { success: true, clientId: c.id, fiscalRegime: c.regime };
  }

  // ── bookkeeping ──────────────────────────────────────────────────────────────────────────────

  private recordEntry(args: Record<string, unknown>): ToolResult {
    const ref = this.requireClient(args.clientId);
    if ('success' in ref) return ref;
    const kind = args.kind;
    if (kind !== 'income' && kind !== 'expense') return fail('kind must be income or expense');
    const amount = args.amount;
    if (typeof amount !== 'number' || !(amount > 0)) return fail('amount must be a positive number');
    const date = args.date;
    if (typeof date !== 'string' || !DATE_RE.test(date)) return fail('date must be YYYY-MM-DD');
    const description = typeof args.description === 'string' ? args.description.trim() : '';
    if (!description) return fail('description is required');
    const entry: EntryRec = { id: `ent_${this.nextEntryNum++}`, clientId: ref.id, kind, amount: round2(amount), date, description };
    this.data.entries.push(entry);
    return { success: true, entryId: entry.id, ...entry };
  }

  private reverseEntry(args: Record<string, unknown>): ToolResult {
    const entryId = args.entryId;
    if (typeof entryId !== 'string' || !entryId) return fail('entryId is required');
    const original = this.data.entries.find((e) => e.id === entryId);
    if (!original) return fail(`unknown entryId "${entryId}" — look it up with listEntries`);
    if (original.reverses) return fail(`${entryId} is itself a reversal entry and cannot be reversed`);
    if (this.reversedEntries.has(entryId)) return fail(`${entryId} was already reversed — an entry can be reversed only once`);
    const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
    if (!reason) return fail('reason is required — reversals are audited');
    if (args.confirmed !== true) {
      return {
        success: true,
        requiresConfirmation: true,
        question: `Reverse ${entryId} (${original.kind} of $${original.amount} on ${original.date}, "${original.description}") by appending a compensating entry? This changes the books and cannot be undone.`,
      };
    }
    const reversal: EntryRec = {
      id: `ent_${this.nextEntryNum++}`,
      clientId: original.clientId,
      kind: original.kind === 'income' ? 'expense' : 'income',
      amount: original.amount,
      date: REFERENCE_TODAY,
      description: `REVERSAL of ${original.id} — ${reason}`,
      reverses: original.id,
    };
    original.reversedBy = reversal.id;
    this.data.entries.push(reversal);
    this.reversedEntries.add(entryId);
    return { success: true, reversedEntryId: entryId, reversalEntryId: reversal.id };
  }

  private listEntries(args: Record<string, unknown>): ToolResult {
    const ref = this.requireClient(args.clientId);
    if ('success' in ref) return ref;
    const from = typeof args.from === 'string' ? args.from : null;
    const to = typeof args.to === 'string' ? args.to : null;
    const kind = args.kind === 'income' || args.kind === 'expense' ? args.kind : null;
    const entries = this.data.entries.filter(
      (e) => e.clientId === ref.id && (!from || e.date >= from) && (!to || e.date <= to) && (!kind || e.kind === kind),
    );
    return { success: true, clientId: ref.id, count: entries.length, entries };
  }

  private getAccountSummary(args: Record<string, unknown>): ToolResult {
    const ref = this.requireClient(args.clientId);
    if ('success' in ref) return ref;
    const entries = this.data.entries.filter((e) => e.clientId === ref.id);
    const totalIncome = round2(entries.filter((e) => e.kind === 'income').reduce((s, e) => s + e.amount, 0));
    const totalExpenses = round2(entries.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount, 0));
    const outstanding = this.data.invoices.filter((i) => i.clientId === ref.id && i.status === 'sent');
    return {
      success: true,
      clientId: ref.id,
      totalIncome,
      totalExpenses,
      net: round2(totalIncome - totalExpenses),
      entryCount: entries.length,
      outstandingInvoices: outstanding.map((i) => ({ invoiceId: i.id, amount: i.amount, dueDate: i.dueDate })),
      outstandingTotal: round2(outstanding.reduce((s, i) => s + i.amount, 0)),
    };
  }

  // ── invoices & payments ──────────────────────────────────────────────────────────────────────

  private createInvoice(args: Record<string, unknown>): ToolResult {
    const ref = this.requireClient(args.clientId);
    if ('success' in ref) return ref;
    const amount = args.amount;
    if (typeof amount !== 'number' || !(amount > 0)) return fail('amount must be a positive number');
    const description = typeof args.description === 'string' ? args.description.trim() : '';
    if (!description) return fail('description is required');
    const dueDate = args.dueDate;
    if (typeof dueDate !== 'string' || !DATE_RE.test(dueDate)) return fail('dueDate must be YYYY-MM-DD');
    const inv: InvoiceRec = {
      id: `inv_${this.nextInvoiceNum++}`, clientId: ref.id, amount: round2(amount), description, dueDate, status: 'draft',
    };
    this.data.invoices.push(inv);
    return { success: true, invoiceId: inv.id, status: 'draft', amount: inv.amount, dueDate, note: 'draft only — deliver it with sendInvoice' };
  }

  private listInvoices(args: Record<string, unknown>): ToolResult {
    const clientId = typeof args.clientId === 'string' && args.clientId ? args.clientId : null;
    if (clientId && !this.hasClient(clientId)) return fail(`unknown clientId "${clientId}"`);
    const status = typeof args.status === 'string' && args.status ? args.status : null;
    const invoices = this.data.invoices
      .filter((i) => (!clientId || i.clientId === clientId) && (!status || i.status === status))
      .map((i) => ({ invoiceId: i.id, clientId: i.clientId, amount: i.amount, description: i.description, dueDate: i.dueDate, status: i.status }));
    return { success: true, count: invoices.length, invoices };
  }

  private requireInvoice(invoiceId: unknown): InvoiceRec | ToolResult {
    if (typeof invoiceId !== 'string' || !invoiceId) return fail('invoiceId is required');
    const inv = this.data.invoices.find((i) => i.id === invoiceId);
    if (!inv) return fail(`unknown invoiceId "${invoiceId}" — look it up with listInvoices`);
    return inv;
  }

  private getInvoice(args: Record<string, unknown>): ToolResult {
    const inv = this.requireInvoice(args.invoiceId);
    if ('success' in inv) return inv;
    return {
      success: true,
      invoice: {
        invoiceId: inv.id, clientId: inv.clientId, amount: inv.amount, description: inv.description,
        dueDate: inv.dueDate, status: inv.status,
        overdue: inv.status === 'sent' && inv.dueDate < REFERENCE_TODAY,
        payment: inv.payment ?? null,
        voidReason: inv.voidReason ?? null,
      },
    };
  }

  private sendInvoice(args: Record<string, unknown>): ToolResult {
    const inv = this.requireInvoice(args.invoiceId);
    if ('success' in inv) return inv;
    if (inv.status !== 'draft') return fail(`only draft invoices can be sent — ${inv.id} is ${inv.status}`);
    const client = this.data.clients.find((c) => c.id === inv.clientId)!;
    if (args.confirmed !== true) {
      return {
        success: true,
        requiresConfirmation: true,
        question: `Send invoice ${inv.id} ($${inv.amount}, "${inv.description}", due ${inv.dueDate}) to ${client.name} at ${client.email}? Sending cannot be undone.`,
      };
    }
    inv.status = 'sent';
    return { success: true, invoiceId: inv.id, status: 'sent', sentTo: client.email };
  }

  private recordPayment(args: Record<string, unknown>): ToolResult {
    const inv = this.requireInvoice(args.invoiceId);
    if ('success' in inv) return inv;
    if (inv.status === 'draft') return fail(`${inv.id} is a draft — it must be sent before a payment can be recorded`);
    if (inv.status === 'paid') return fail(`${inv.id} is already paid (${inv.payment?.date ?? 'date on record'})`);
    if (inv.status === 'void') return fail(`${inv.id} is void — no payment can be recorded against it`);
    const amount = args.amount;
    if (typeof amount !== 'number' || !(amount > 0)) return fail('amount must be a positive number');
    if (round2(amount) !== inv.amount) {
      return fail(`amount mismatch: ${inv.id} is for $${inv.amount}, got $${round2(amount)} — partial or excess payments are not supported`);
    }
    if (args.confirmed !== true) {
      return {
        success: true,
        requiresConfirmation: true,
        question: `Record a payment of $${inv.amount} against ${inv.id} and mark it paid? This changes the financial records.`,
      };
    }
    inv.status = 'paid';
    inv.payment = { amount: inv.amount, method: typeof args.method === 'string' ? args.method : undefined, date: REFERENCE_TODAY };
    return { success: true, invoiceId: inv.id, status: 'paid', payment: inv.payment };
  }

  private voidInvoice(args: Record<string, unknown>): ToolResult {
    const inv = this.requireInvoice(args.invoiceId);
    if ('success' in inv) return inv;
    if (inv.status === 'paid') return fail(`${inv.id} is paid — a paid invoice can never be voided`);
    if (inv.status === 'void') return fail(`${inv.id} is already void`);
    const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
    if (!reason) return fail('reason is required');
    if (args.confirmed !== true) {
      return {
        success: true,
        requiresConfirmation: true,
        question: `Void invoice ${inv.id} ($${inv.amount}, "${inv.description}", currently ${inv.status})? Voiding cannot be undone.`,
      };
    }
    inv.status = 'void';
    inv.voidReason = reason;
    return { success: true, invoiceId: inv.id, status: 'void', reason };
  }

  // ── tax deadlines & filings ──────────────────────────────────────────────────────────────────

  private deadlineView(d: DeadlineRec) {
    return {
      deadlineId: d.id, clientId: d.clientId, tax: d.tax, period: d.period, dueDate: d.dueDate,
      filingStatus: d.filing,
      overdue: d.filing !== 'submitted' && d.dueDate < REFERENCE_TODAY,
      figures: d.figures ?? null,
      receipt: d.receipt ?? null,
    };
  }

  private listTaxDeadlines(args: Record<string, unknown>): ToolResult {
    const clientId = typeof args.clientId === 'string' && args.clientId ? args.clientId : null;
    if (clientId && !this.hasClient(clientId)) return fail(`unknown clientId "${clientId}"`);
    const deadlines = this.data.deadlines.filter((d) => !clientId || d.clientId === clientId).map((d) => this.deadlineView(d));
    return { success: true, referenceToday: REFERENCE_TODAY, count: deadlines.length, deadlines };
  }

  private createTaxDeadline(args: Record<string, unknown>): ToolResult {
    const ref = this.requireClient(args.clientId);
    if ('success' in ref) return ref;
    const tax = typeof args.tax === 'string' ? args.tax.trim() : '';
    const period = typeof args.period === 'string' ? args.period.trim() : '';
    const dueDate = args.dueDate;
    if (!tax) return fail('tax is required');
    if (!period) return fail('period is required');
    if (typeof dueDate !== 'string' || !DATE_RE.test(dueDate)) return fail('dueDate must be YYYY-MM-DD');
    const dup = this.data.deadlines.find(
      (d) => d.clientId === ref.id && d.tax.toLowerCase() === tax.toLowerCase() && d.period.toLowerCase() === period.toLowerCase(),
    );
    if (dup) return fail(`a ${tax} deadline for ${period} already exists for ${ref.id} (${dup.id}) — duplicates are rejected`);
    const slug = `tax_${(tax + '_' + period).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}_${ref.id.slice(4)}`;
    if (this.data.deadlines.some((d) => d.id === slug)) return fail(`deadline ${slug} already exists`);
    const rec: DeadlineRec = { id: slug, clientId: ref.id, tax, period, dueDate, filing: 'not_started' };
    this.data.deadlines.push(rec);
    return { success: true, ...this.deadlineView(rec) };
  }

  private cancelTaxDeadline(args: Record<string, unknown>): ToolResult {
    const d = this.requireDeadline(args.deadlineId);
    if ('success' in d) return d;
    if (d.filing !== 'not_started') {
      return fail(`${d.id} cannot be cancelled — its filing is ${d.filing}; only a deadline whose filing is not started can be cancelled`);
    }
    const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
    if (!reason) return fail('reason is required');
    if (args.confirmed !== true) {
      return {
        success: true,
        requiresConfirmation: true,
        question: `Cancel (remove) deadline ${d.id} (${d.tax}, ${d.period}, due ${d.dueDate}) from the compliance calendar? This cannot be undone.`,
      };
    }
    this.data.deadlines = this.data.deadlines.filter((x) => x.id !== d.id);
    return { success: true, cancelledDeadlineId: d.id, reason };
  }

  private requireDeadline(deadlineId: unknown): DeadlineRec | ToolResult {
    if (typeof deadlineId !== 'string' || !deadlineId) return fail('deadlineId is required');
    const d = this.data.deadlines.find((x) => x.id === deadlineId);
    if (!d) return fail(`unknown deadlineId "${deadlineId}" — look it up with listTaxDeadlines`);
    return d;
  }

  private prepareFiling(args: Record<string, unknown>): ToolResult {
    const d = this.requireDeadline(args.deadlineId);
    if ('success' in d) return d;
    if (d.filing === 'submitted') return fail(`${d.id} was already submitted (receipt ${d.receipt}) — a submitted filing can never be re-prepared`);
    const regime = this.clientRegime(d.clientId);
    if (regime === null) {
      return fail(`client ${d.clientId} has no fiscal regime on record — the regime must be provided and set before any tax work`);
    }
    const entries = this.data.entries.filter((e) => e.clientId === d.clientId);
    const totalIncome = round2(entries.filter((e) => e.kind === 'income').reduce((s, e) => s + e.amount, 0));
    const totalExpenses = round2(entries.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount, 0));
    const taxDue = round2(Math.max(0, (totalIncome - totalExpenses) * REGIME_RATES[regime as Regime]));
    d.figures = { totalIncome, totalExpenses, taxDue };
    d.filing = 'prepared';
    return { success: true, deadlineId: d.id, filingStatus: 'prepared', figures: d.figures };
  }

  private submitFiling(args: Record<string, unknown>): ToolResult {
    const d = this.requireDeadline(args.deadlineId);
    if ('success' in d) return d;
    if (d.filing === 'submitted') return fail(`${d.id} was already submitted (receipt ${d.receipt}) — a filing cannot be submitted twice`);
    const regime = this.clientRegime(d.clientId);
    if (regime === null) {
      return fail(`client ${d.clientId} has no fiscal regime on record — the regime must be provided and set before any tax work`);
    }
    if (d.filing !== 'prepared') return fail(`${d.id} is not prepared — prepare the filing first (prepareFiling)`);
    if (args.confirmed !== true) {
      return {
        success: true,
        requiresConfirmation: true,
        question: `Submit the ${d.tax} filing for ${d.period} (deadline ${d.id}, tax due $${d.figures?.taxDue ?? 0}) to the tax authority? Submission is final and cannot be undone.`,
      };
    }
    d.filing = 'submitted';
    d.receipt = `rcpt_${this.nextReceiptNum++}`;
    return { success: true, deadlineId: d.id, filingStatus: 'submitted', receipt: d.receipt, figures: d.figures ?? null };
  }

  // ── notifications ────────────────────────────────────────────────────────────────────────────

  private sendClientNotification(args: Record<string, unknown>): ToolResult {
    const ref = this.requireClient(args.clientId);
    if ('success' in ref) return ref;
    const message = typeof args.message === 'string' ? args.message.trim() : '';
    if (!message) return fail('message is required');
    const client = this.data.clients.find((c) => c.id === ref.id)!;
    const rec = { id: `ntf_${String(this.nextNotificationNum++).padStart(3, '0')}`, clientId: ref.id, message };
    this.notifications.push(rec);
    return { success: true, notificationId: rec.id, sentTo: client.email };
  }
}

/** The eval harness seam: a fresh deterministic world per case run (`seed` = the rep index). */
export function worldFactory(preset: string, seed: number): AccountingWorld {
  return new AccountingWorld(preset, seed);
}
