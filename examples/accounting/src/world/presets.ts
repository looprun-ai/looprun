/**
 * src/world/presets.ts — boundary presets for the accounting world (Stage G2 step 3).
 *
 * Every state the eval set needs exists here BEFORE a case references it (a rubric that needs a
 * state no preset provides is the known eval-defect class). All data is fixed and deterministic;
 * dates are ISO `YYYY-MM-DD` strings compared lexicographically against REFERENCE_TODAY.
 */

export type Regime = 'simplified' | 'standard' | 'cash_basis';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';
export type FilingState = 'not_started' | 'prepared' | 'submitted';

export interface ClientRec {
  id: string;
  name: string;
  email: string;
  phone?: string;
  regime: Regime | null;
}

export interface EntryRec {
  id: string;
  clientId: string;
  kind: 'income' | 'expense';
  amount: number;
  date: string; // YYYY-MM-DD
  description: string;
  /** Set on a reversal entry: the id of the original entry it compensates. */
  reverses?: string;
  /** Set on a reversed original: the id of the reversal entry that compensated it. */
  reversedBy?: string;
}

export interface PaymentRec {
  amount: number;
  method?: string;
  date: string; // YYYY-MM-DD
}

export interface InvoiceRec {
  id: string;
  clientId: string;
  amount: number;
  description: string;
  dueDate: string; // YYYY-MM-DD
  status: InvoiceStatus;
  payment?: PaymentRec;
  voidReason?: string;
}

export interface FilingFigures {
  totalIncome: number;
  totalExpenses: number;
  taxDue: number;
}

export interface DeadlineRec {
  id: string;
  clientId: string;
  tax: string;
  period: string;
  dueDate: string; // YYYY-MM-DD
  filing: FilingState;
  figures?: FilingFigures;
  receipt?: string;
}

export interface WorldData {
  clients: ClientRec[];
  entries: EntryRec[];
  invoices: InvoiceRec[];
  deadlines: DeadlineRec[];
}

export const PRESETS = [
  'steady-books',
  'fresh-client-no-regime',
  'empty-books',
  'unpaid-invoice-overdue',
  'invoice-paid',
  'overdue-tax-deadline',
  'filing-prepared',
  'filing-submitted',
] as const;

export type PresetName = (typeof PRESETS)[number];

// ── shared roster builders (fresh objects per call — worlds must never share state) ──────────────

function baseClients(): ClientRec[] {
  return [
    { id: 'cli_acme', name: 'Acme Web Studio', email: 'billing@acmeweb.example', regime: 'standard' },
    { id: 'cli_bloom', name: 'Bloom Bakery', email: 'ola@bloombakery.example', phone: '555-0142', regime: 'simplified' },
  ];
}

function baseEntries(): EntryRec[] {
  return [
    { id: 'ent_101', clientId: 'cli_acme', kind: 'income', amount: 4200, date: '2026-06-05', description: 'June retainer — web maintenance' },
    { id: 'ent_102', clientId: 'cli_acme', kind: 'expense', amount: 350, date: '2026-06-12', description: 'Software subscriptions' },
    { id: 'ent_103', clientId: 'cli_bloom', kind: 'income', amount: 1800, date: '2026-06-20', description: 'Wholesale order — Juniper Cafe' },
    { id: 'ent_104', clientId: 'cli_bloom', kind: 'expense', amount: 240, date: '2026-06-18', description: 'Flour supplier' },
  ];
}

function baseInvoices(): InvoiceRec[] {
  return [
    {
      id: 'inv_1001', clientId: 'cli_acme', amount: 4200, description: 'June retainer',
      dueDate: '2026-06-30', status: 'paid', payment: { amount: 4200, method: 'bank_transfer', date: '2026-06-28' },
    },
    {
      id: 'inv_1002', clientId: 'cli_bloom', amount: 1800, description: 'June bookkeeping services',
      dueDate: '2026-07-15', status: 'sent',
    },
    {
      id: 'inv_1003', clientId: 'cli_acme', amount: 950, description: 'Q2 tax preparation',
      dueDate: '2026-07-20', status: 'draft',
    },
  ];
}

function baseDeadlines(): DeadlineRec[] {
  return [
    { id: 'tax_vat_q2_acme', clientId: 'cli_acme', tax: 'VAT', period: 'Q2 2026', dueDate: '2026-07-20', filing: 'not_started' },
    { id: 'tax_income_h1_bloom', clientId: 'cli_bloom', tax: 'Income tax (H1 estimate)', period: 'H1 2026', dueDate: '2026-07-31', filing: 'not_started' },
  ];
}

function steady(): WorldData {
  return { clients: baseClients(), entries: baseEntries(), invoices: baseInvoices(), deadlines: baseDeadlines() };
}

// ── the preset factory ────────────────────────────────────────────────────────────────────────────

export function buildPreset(preset: string): WorldData {
  switch (preset as PresetName) {
    case 'steady-books':
      return steady();

    case 'fresh-client-no-regime': {
      const d = steady();
      d.clients.push({ id: 'cli_field', name: 'Field & Co Landscaping', email: 'office@fieldco.example', regime: null });
      d.deadlines.push({
        id: 'tax_vat_q2_field', clientId: 'cli_field', tax: 'VAT', period: 'Q2 2026',
        dueDate: '2026-07-25', filing: 'not_started',
      });
      return d;
    }

    case 'empty-books': {
      const d = steady();
      d.entries = d.entries.filter((e) => e.clientId !== 'cli_acme'); // Acme has ZERO recorded entries
      return d;
    }

    case 'unpaid-invoice-overdue': {
      const d = steady();
      const inv = d.invoices.find((i) => i.id === 'inv_1002');
      if (inv) inv.dueDate = '2026-06-15'; // sent, unpaid, due BEFORE the reference day → overdue
      return d;
    }

    case 'invoice-paid': {
      const d = steady();
      d.invoices = d.invoices.filter((i) => i.id !== 'inv_1002'); // only inv_1001 (paid) + inv_1003 (draft)
      return d;
    }

    case 'overdue-tax-deadline': {
      const d = steady();
      const dl = d.deadlines.find((x) => x.id === 'tax_vat_q2_acme');
      if (dl) dl.dueDate = '2026-06-30'; // one day before the reference day, filing not_started → OVERDUE
      return d;
    }

    case 'filing-prepared': {
      const d = steady();
      const dl = d.deadlines.find((x) => x.id === 'tax_vat_q2_acme');
      if (dl) {
        dl.filing = 'prepared';
        dl.figures = { totalIncome: 4200, totalExpenses: 350, taxDue: 577.5 }; // standard regime, 15% of net
      }
      return d;
    }

    case 'filing-submitted': {
      const d = steady();
      const dl = d.deadlines.find((x) => x.id === 'tax_vat_q2_acme');
      if (dl) {
        dl.filing = 'submitted';
        dl.figures = { totalIncome: 4200, totalExpenses: 350, taxDue: 577.5 };
        dl.receipt = 'rcpt_84213';
      }
      return d;
    }

    default:
      throw new Error(`unknown preset "${preset}" — known: ${PRESETS.join(', ')}`);
  }
}
