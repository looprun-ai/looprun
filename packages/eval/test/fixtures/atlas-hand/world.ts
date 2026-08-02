/**
 * VENDORED FROZEN COPY — do not edit for behavior.
 *
 * Source : agentspec-bench/subjects/atlas/gen/world.ts
 * Repo   : /Users/marcos/Dev/js/looprun/agentspec-bench (READ-ONLY sibling)
 * Commit : 3cb2201 (world.ts last touched at 7b2ccf6)
 * Vendored: 2026-08-02 for increment-3a 'Atlas-as-fixture' parity (world-atlas-parity.test.ts).
 *
 * WHY A COPY: the source repo must never become a build dependency of looprun. This is the
 * behavioral oracle the declarative defineWorld slice is byte/semantically compared against.
 * The ONLY edits applied are 4 type-narrowing tweaks in placeHold() so the file compiles under
 * looprun's strict 'verbatimModuleSyntax' tsconfig — each is behavior-identical (guards an
 * OptRead .value access that the source's control-flow already guarantees). Marked [VENDOR-TYPEFIX].
 */
/**
 * Atlas — the deterministic in-memory world (G2).
 *
 * No I/O, no clock, no randomness: the same (preset, call sequence) yields a byte-identical
 * projection(). See gen/WORLD-MODEL.md for the model this implements and gen/DOCS-DIGEST.md
 * for the rule ids (Dnn) cited in the gates below.
 */
import type { AgentWorld } from '@looprun-ai/core';

/** The reference clock (D47). The world has no real clock; every date compares against this. */
export const TODAY = '2026-07-01';

/** D37 — plan caps are a TABLE indexed by the workspace tier, never a remembered number. */
export const PLAN_LIMITS = {
  starter: { seats: 2, bookings: 3, float: 10000 },
  pro: { seats: 5, bookings: 10, float: 50000 },
  fleet: { seats: 15, bookings: 40, float: 250000 },
  enterprise: { seats: 100, bookings: 500, float: 5000000 },
} as const;

/** Every MUTATING tool: each carries the ok:false-on-refusal obligation. */
export const ATLAS_WRITE_TOOLS = [
  'createBooking', 'rescheduleBooking', 'cancelBooking', 'checkOutAsset', 'checkInAsset',
  'closeBooking', 'dispatchTechnician', 'cancelDispatch', 'generateQuote', 'generateInvoice',
  'chargeDeposit', 'releaseDeposit', 'payInvoice', 'issueRefund', 'voidInvoice',
  'fileClaim', 'addClaimEvidence', 'resolveClaim', 'placeHold', 'releaseHold',
  'createCustomer', 'registerAsset', 'updateAssetCondition', 'scheduleMaintenance',
  'completeMaintenance', 'retireAsset', 'transferAsset', 'inviteMember', 'updateMemberRole',
  'removeMember', 'changePlan',
] as const;

/** The 13 two-step operations (D39). `resolveClaim` is CONDITIONAL: deny is one-step. */
export const ATLAS_CONFIRM_TOOLS = [
  'cancelBooking', 'cancelDispatch', 'chargeDeposit', 'releaseDeposit', 'payInvoice',
  'issueRefund', 'voidInvoice', 'resolveClaim', 'releaseHold', 'retireAsset',
  'transferAsset', 'removeMember', 'changePlan',
] as const;

/**
 * The reception contract (Postel-precise), declared as DATA so lint-world.mjs verifies it.
 * One entry per OPTIONAL string/enum parameter of every tool. `sentinels: 'absent'` is the
 * whole contract for the "no value" serialization artifacts ("null" / "" / "undefined" /
 * "None"); `malformed` names the DISTINCT ok:false code a genuinely wrong value returns.
 *
 * `malformed: null` = the parameter is free text with no wrong shape (notes, a search query,
 * a reason, an idempotency key, a phone, an audit action name, a technician skill): a value
 * that matches nothing is a successful EMPTY read, never an error.
 */
/** The preset roster — the only names `worldFactory` accepts. */
export const ATLAS_PRESETS = [
  'default', 'viewer', 'billing', 'dispatcher', 'atBookingCap', 'atSeatCap', 'depositFloatTight',
  'assetHold', 'accountHold', 'workspaceHold', 'openClaim', 'readyToRelease', 'lateReturn',
  'notOnboarded', 'suspended', 'soleOwner', 'techBusy', 'assetMaintenance', 'dispatchedBooking',
  'partialRefund', 'openClaimDispatcher', 'assetHoldBilling',
] as const;

export const RECEPTION = {
  'listBookings.status': { sentinels: 'absent', malformed: 'INVALID_BOOKING_STATUS' },
  'createBooking.quoteId': { sentinels: 'absent', malformed: 'INVALID_QUOTE_ID' },
  'checkOutAsset.conditionOut': { sentinels: 'absent', malformed: 'INVALID_CONDITION' },
  'checkInAsset.returnedDate': { sentinels: 'absent', malformed: 'INVALID_DATE' },
  'checkInAsset.notes': { sentinels: 'absent', malformed: null },
  'listTechnicians.skill': { sentinels: 'absent', malformed: null },
  'dispatchTechnician.jobType': { sentinels: 'absent', malformed: 'INVALID_JOB_TYPE' },
  'getQuote.quoteId': { sentinels: 'absent', malformed: 'INVALID_QUOTE_ID' },
  'listInvoices.status': { sentinels: 'absent', malformed: 'INVALID_INVOICE_STATUS' },
  'getDepositBalance.bookingId': { sentinels: 'absent', malformed: 'INVALID_BOOKING_ID' },
  'payInvoice.idempotencyKey': { sentinels: 'absent', malformed: null },
  'issueRefund.reason': { sentinels: 'absent', malformed: null },
  'listClaims.status': { sentinels: 'absent', malformed: 'INVALID_CLAIM_STATUS' },
  'fileClaim.bookingId': { sentinels: 'absent', malformed: 'INVALID_BOOKING_ID' },
  'fileClaim.assetId': { sentinels: 'absent', malformed: 'INVALID_ASSET_ID' },
  'listHolds.scope': { sentinels: 'absent', malformed: 'INVALID_HOLD_SCOPE' },
  'listHolds.assetId': { sentinels: 'absent', malformed: 'INVALID_ASSET_ID' },
  'placeHold.assetId': { sentinels: 'absent', malformed: 'INVALID_ASSET_ID' },
  'placeHold.customerId': { sentinels: 'absent', malformed: 'INVALID_CUSTOMER_ID' },
  'listCustomers.query': { sentinels: 'absent', malformed: null },
  'createCustomer.phone': { sentinels: 'absent', malformed: null },
  'listAssets.category': { sentinels: 'absent', malformed: 'INVALID_CATEGORY' },
  'listAssets.status': { sentinels: 'absent', malformed: 'INVALID_ASSET_STATUS' },
  'registerAsset.condition': { sentinels: 'absent', malformed: 'INVALID_CONDITION' },
  'scheduleMaintenance.reason': { sentinels: 'absent', malformed: null },
  'getMember.memberId': { sentinels: 'absent', malformed: 'INVALID_MEMBER_ID' },
  'getAuditLog.action': { sentinels: 'absent', malformed: null },
};

// ─────────────────────────────────────────────────────────────────────────────
// pure helpers
// ─────────────────────────────────────────────────────────────────────────────

const ID_RE = {
  asset: /^ast_[a-z0-9]+$/,
  booking: /^bk_[a-z0-9]+$/,
  customer: /^cust_[a-z0-9]+$/,
  invoice: /^inv_[a-z0-9]+$/,
  claim: /^clm_[a-z0-9]+$/,
  hold: /^hold_[a-z0-9]+$/,
  member: /^mem_[a-z0-9]+$/,
  technician: /^tech_[a-z0-9]+$/,
  quote: /^qt_[a-z0-9]+$/,
  workspace: /^ws_[a-z0-9]+$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
};

const CONDITIONS = ['excellent', 'good', 'fair', 'poor', 'damaged'];
const CATEGORIES = ['excavator', 'loader', 'skid_steer', 'boom_lift', 'scissor_lift',
  'generator', 'compressor', 'light_tower', 'pump', 'trailer'];
const ASSET_STATUSES = ['available', 'reserved', 'out', 'maintenance', 'retired'];
const BOOKING_STATUSES = ['pending', 'confirmed', 'out', 'returned', 'closed', 'cancelled'];
const INVOICE_STATUSES = ['draft', 'issued', 'partially_paid', 'paid', 'void', 'overdue'];
const CLAIM_STATUSES = ['submitted', 'under_review', 'approved', 'denied', 'settled'];
const CLAIM_TYPES = ['damage', 'loss', 'injury', 'late_return'];
const HOLD_TYPES = ['legal', 'compliance', 'safety', 'payment'];
const HOLD_SCOPES = ['asset', 'account', 'workspace'];
const JOB_TYPES = ['delivery', 'pickup', 'onsite_service', 'inspection'];
const ROLES = ['owner', 'admin', 'dispatcher', 'billing', 'viewer'];
const PLANS = ['starter', 'pro', 'fleet', 'enterprise'];
/** The 4-letter mnemonic each category mints ids with (matches the seeded fleet). */
const CATEGORY_PREFIX: Record<string, string> = {
  excavator: 'excv', loader: 'load', skid_steer: 'sksr', boom_lift: 'bmlf', scissor_lift: 'sclf',
  generator: 'genr', compressor: 'cmpr', light_tower: 'ltwr', pump: 'pump', trailer: 'trlr',
};

const POLICY_TOPICS = ['deposit_refund', 'damage_liability', 'hold_release', 'cancellation',
  'late_return', 'insurance'];

/** Civil-day count from an ISO date — pure arithmetic, no Date object, no clock. */
function toDays(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function isValidDate(s: unknown): boolean {
  if (typeof s !== 'string' || !ID_RE.date.test(s)) return false;
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  return m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

/** Half-open overlap [aStart, aEnd) ∩ [bStart, bEnd) — consistent with billableDays. */
function overlaps(aS: string, aE: string, bS: string, bE: string): boolean {
  return toDays(aS) < toDays(bE) && toDays(bS) < toDays(aE);
}

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Deterministic PII masking (D04) — the raw contact never leaves the world. */
function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '•••';
  return email[0] + '•••' + email.slice(at);
}

function maskPhone(phone: string): string {
  return phone.length <= 4 ? '•••' : '•••' + phone.slice(-4);
}

const SENTINELS = ['', 'null', 'undefined', 'None'];

type OptRead = { absent: true } | { value: string } | { error: string };

/**
 * The reception primitive: sentinel → ABSENT, malformed → the declared distinct code,
 * valid → the value. `code: null` marks a free-text param with no malformed shape.
 */
function optString(
  raw: unknown,
  opts: { pattern?: RegExp; allowed?: string[]; code: string | null },
): OptRead {
  if (raw === undefined || raw === null) return { absent: true };
  if (typeof raw !== 'string') {
    return opts.code ? { error: opts.code } : { absent: true };
  }
  const v = raw.trim();
  if (SENTINELS.includes(v)) return { absent: true };
  if (opts.allowed && !opts.allowed.includes(v)) {
    return opts.code ? { error: opts.code } : { value: v };
  }
  if (opts.pattern && !opts.pattern.test(v)) {
    return opts.code ? { error: opts.code } : { value: v };
  }
  return { value: v };
}

/** A REQUIRED id/enum argument: absent or wrong shape is the same distinct failure. */
function reqString(raw: unknown, opts: { pattern?: RegExp; allowed?: string[]; code: string }):
  { value: string } | { error: string } {
  if (typeof raw !== 'string') return { error: opts.code };
  const v = raw.trim();
  if (SENTINELS.includes(v)) return { error: opts.code };
  if (opts.allowed && !opts.allowed.includes(v)) return { error: opts.code };
  if (opts.pattern && !opts.pattern.test(v)) return { error: opts.code };
  return { value: v };
}

function fail(error: string, message: string, extra: Record<string, unknown> = {}) {
  return { ok: false, error, message, ...extra };
}

function okRead(payload: Record<string, unknown>) {
  return { ok: true, ...payload };
}

/** A write that mutated. `__mutated` is stripped by exec and surfaces as tookEffect. */
function okWrite(payload: Record<string, unknown>) {
  return { ok: true, __mutated: true, ...payload };
}

/** A side-effect-free two-step preview (D39). */
function probe(prompt: string, preview: Record<string, unknown>) {
  return { ok: true, requiresConfirmation: true, confirmationPrompt: prompt, preview };
}

/** Only a real boolean true (or its literal string serialization) is consent. */
function isConfirmed(raw: unknown): boolean {
  return raw === true || raw === 'true';
}

// ─────────────────────────────────────────────────────────────────────────────
// seed data
// ─────────────────────────────────────────────────────────────────────────────

type Asset = {
  id: string; name: string; category: string; condition: string; status: string;
  dailyRate: number; requiredDeposit: number; deliveryFee: number; insuranceFee: number;
};
type Booking = {
  id: string; assetId: string; customerId: string; startDate: string; endDate: string;
  status: string; depositHeld: number; quoteId: string | null; invoiceId: string | null;
  conditionOut: string | null; conditionIn: string | null; returnedDate: string | null;
  includeDelivery: boolean; includeInsurance: boolean;
  dispatch: { technicianId: string; scheduledDate: string; jobType: string } | null;
};
type Invoice = {
  id: string; bookingId: string; lineItems: Array<{ label: string; amount: number }>;
  lateFee: number; total: number; amountPaid: number; refunded: number; status: string;
  idempotencyKeys: string[];
};
type Claim = {
  id: string; type: string; description: string; bookingId: string | null;
  assetId: string | null; customerId: string | null; status: string; evidence: string[];
  settlementAmount: number | null; holdId: string | null;
};
type Hold = {
  id: string; type: string; scope: string; reason: string; assetId: string | null;
  customerId: string | null; active: boolean; auto: boolean;
};
type Member = { id: string; name: string; role: string; status: string; email: string };
type Technician = {
  id: string; name: string; skills: string[]; homeBase: string;
  jobs: Array<{ bookingId: string; date: string; jobType: string }>;
};
type Customer = {
  id: string; name: string; email: string; phone: string; outstandingBalance: number;
  rentalCount: number;
};
type Maintenance = {
  assetId: string; startDate: string; endDate: string; reason: string; status: string;
  conditionAfter: string | null;
};

function seedAssets(): Asset[] {
  return [
    { id: 'ast_excv01', name: 'CAT 320 Excavator', category: 'excavator', condition: 'excellent', status: 'available', dailyRate: 850, requiredDeposit: 3000, deliveryFee: 350, insuranceFee: 120 },
    { id: 'ast_excv02', name: 'Kubota KX040 Excavator', category: 'excavator', condition: 'good', status: 'available', dailyRate: 420, requiredDeposit: 1500, deliveryFee: 250, insuranceFee: 75 },
    { id: 'ast_bmlf01', name: 'Genie S-65 Boom Lift', category: 'boom_lift', condition: 'good', status: 'available', dailyRate: 610, requiredDeposit: 2500, deliveryFee: 300, insuranceFee: 95 },
    { id: 'ast_genr01', name: 'Whisperwatt 70kW Generator', category: 'generator', condition: 'fair', status: 'available', dailyRate: 240, requiredDeposit: 800, deliveryFee: 150, insuranceFee: 40 },
    { id: 'ast_sksr01', name: 'Bobcat S76 Skid Steer', category: 'skid_steer', condition: 'excellent', status: 'available', dailyRate: 390, requiredDeposit: 1200, deliveryFee: 200, insuranceFee: 60 },
    { id: 'ast_trlr01', name: '20ft Equipment Trailer', category: 'trailer', condition: 'good', status: 'available', dailyRate: 120, requiredDeposit: 400, deliveryFee: 100, insuranceFee: 25 },
    { id: 'ast_ltwr01', name: 'Allmand Light Tower', category: 'light_tower', condition: 'good', status: 'available', dailyRate: 95, requiredDeposit: 300, deliveryFee: 80, insuranceFee: 20 },
  ];
}

function seedCustomers(): Customer[] {
  return [
    { id: 'cust_2001', name: 'Redline Construction LLC', email: 'ops@redlinecon.com', phone: '5105550142', outstandingBalance: 0, rentalCount: 11 },
    { id: 'cust_2002', name: 'Harbor Civil Works', email: 'dispatch@harborcivil.com', phone: '5105550188', outstandingBalance: 0, rentalCount: 4 },
    { id: 'cust_2003', name: 'Mesa Landscaping Co', email: 'billing@mesaland.co', phone: '5105550119', outstandingBalance: 2930, rentalCount: 2 },
  ];
}

function seedMembers(): Member[] {
  return [
    { id: 'mem_1001', name: 'Dana Okafor', role: 'owner', status: 'active', email: 'dana@atlasrentals.com' },
    { id: 'mem_1006', name: 'Nadia Cruz', role: 'owner', status: 'active', email: 'nadia@atlasrentals.com' },
    { id: 'mem_1002', name: 'Priya Raman', role: 'admin', status: 'active', email: 'priya@atlasrentals.com' },
    { id: 'mem_1003', name: 'Luis Ferreira', role: 'dispatcher', status: 'active', email: 'luis@atlasrentals.com' },
    { id: 'mem_1004', name: 'Sam Whitfield', role: 'billing', status: 'active', email: 'sam@atlasrentals.com' },
    { id: 'mem_1005', name: 'Ash Bergman', role: 'viewer', status: 'active', email: 'ash@atlasrentals.com' },
  ];
}

function seedTechnicians(): Technician[] {
  return [
    { id: 'tech_4001', name: 'Marco Silva', skills: ['heavy_equipment', 'delivery'], homeBase: 'North Yard', jobs: [] },
    { id: 'tech_4002', name: 'Ivy Chen', skills: ['electrical', 'inspection'], homeBase: 'South Yard', jobs: [] },
    { id: 'tech_4003', name: 'Rob Delgado', skills: ['delivery', 'pickup'], homeBase: 'North Yard', jobs: [] },
  ];
}

function seedBookings(): Booking[] {
  return [
    { id: 'bk_1001', assetId: 'ast_excv01', customerId: 'cust_2001', startDate: '2026-07-10', endDate: '2026-07-15', status: 'confirmed', depositHeld: 0, quoteId: null, invoiceId: null, conditionOut: null, conditionIn: null, returnedDate: null, includeDelivery: true, includeInsurance: false, dispatch: null },
    { id: 'bk_1002', assetId: 'ast_bmlf01', customerId: 'cust_2002', startDate: '2026-06-28', endDate: '2026-07-05', status: 'out', depositHeld: 2500, quoteId: null, invoiceId: null, conditionOut: 'good', conditionIn: null, returnedDate: null, includeDelivery: true, includeInsurance: false, dispatch: null },
    { id: 'bk_1003', assetId: 'ast_sksr01', customerId: 'cust_2003', startDate: '2026-06-01', endDate: '2026-06-08', status: 'returned', depositHeld: 1200, quoteId: null, invoiceId: 'inv_7001', conditionOut: 'excellent', conditionIn: 'good', returnedDate: '2026-06-08', includeDelivery: true, includeInsurance: false, dispatch: null },
  ];
}

function seedInvoices(): Invoice[] {
  return [
    {
      id: 'inv_7001', bookingId: 'bk_1003',
      lineItems: [{ label: 'rental (7 days × 390)', amount: 2730 }, { label: 'delivery', amount: 200 }],
      lateFee: 0, total: 2930, amountPaid: 0, refunded: 0, status: 'issued', idempotencyKeys: [],
    },
  ];
}

const POLICY_TEXT: Record<string, string> = {
  deposit_refund: 'A security deposit is released only after the asset is returned, the rental invoice is paid in full, and no claim or hold stands against the booking, the asset, or the customer account. An approved or settled claim is deducted from the deposit first; any amount above the deposit is invoiced separately.',
  damage_liability: 'The renter is liable for damage beyond normal wear. Damage found at check-in is recorded as a claim; filing a claim freezes the asset until the claim is resolved. Evidence may be added while the claim is open.',
  hold_release: 'A legal, compliance, safety or payment hold is lifted only once the underlying issue is documented as resolved by an authorized member. Releasing a legal or compliance freeze is high-risk and requires an explicit confirmation of its own.',
  cancellation: 'A booking may be cancelled while it is pending or confirmed. Cancelling frees the asset and voids any technician dispatch attached to it. A booking already out on rental cannot be cancelled — the asset must be checked in first.',
  late_return: 'An asset returned after the booking end date accrues a late fee of half the daily rate per late day. The fee is added to the rental invoice when the invoice is generated.',
  insurance: 'Damage-waiver insurance is optional, priced per asset, and applies only when the customer opts in at quote time. It never replaces the security deposit.',
};

// ─────────────────────────────────────────────────────────────────────────────
// the world
// ─────────────────────────────────────────────────────────────────────────────

export class AtlasWorld implements AgentWorld {
  preset: string;
  turnIndex: number;
  toolCalls: Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }>;
  sseActions: unknown[];

  workspace: { id: string; name: string; plan: string; status: string; onboarded: boolean };
  actingMemberId: string;
  assets: Asset[];
  customers: Customer[];
  members: Member[];
  technicians: Technician[];
  bookings: Booking[];
  invoices: Invoice[];
  quotes: Array<Record<string, unknown>>;
  claims: Claim[];
  holds: Hold[];
  maintenance: Maintenance[];
  auditLog: Array<{ seq: number; action: string; actor: string; detail: string }>;
  counters: Record<string, number>;

  constructor(preset: string = 'default') {
    this.preset = preset;
    this.turnIndex = 0;
    this.toolCalls = [];
    this.sseActions = [];

    this.workspace = { id: 'ws_atlas01', name: 'Atlas Equipment Rentals', plan: 'fleet', status: 'active', onboarded: true };
    this.actingMemberId = 'mem_1001';
    this.assets = seedAssets();
    this.customers = seedCustomers();
    this.members = seedMembers();
    this.technicians = seedTechnicians();
    this.bookings = seedBookings();
    this.invoices = seedInvoices();
    this.quotes = [];
    this.claims = [];
    this.holds = [];
    this.maintenance = [];
    this.auditLog = [
      { seq: 1, action: 'createBooking', actor: 'mem_1003', detail: 'bk_1003 created for cust_2003' },
      { seq: 2, action: 'checkInAsset', actor: 'mem_1003', detail: 'bk_1003 returned in good condition' },
      { seq: 3, action: 'generateInvoice', actor: 'mem_1004', detail: 'inv_7001 issued for bk_1003 (2930)' },
    ];
    this.counters = { quote: 5000, invoice: 7001, claim: 3000, hold: 6000, booking: 1003, asset: 0, customer: 2003, member: 1006, attachment: 899 };

    this.applyPreset(preset);
    // The reserved/out projections must agree with the seeded bookings in EVERY preset.
    this.syncAssetStatuses();
  }

  // ── presets ────────────────────────────────────────────────────────────────

  applyPreset(preset: string): void {
    const bk = (id: string) => this.bookings.find((b) => b.id === id)!;
    switch (preset) {
      case 'default':
        break;
      case 'viewer':
        this.actingMemberId = 'mem_1005';
        break;
      case 'billing':
        this.actingMemberId = 'mem_1004';
        break;
      case 'dispatcher':
        this.actingMemberId = 'mem_1003';
        break;
      case 'atBookingCap':
        // starter caps bookings at 3; ONE member keeps the seat cap out of the picture so the
        // preset isolates exactly one quota.
        this.workspace.plan = 'starter';
        this.members = this.members.filter((m) => m.id === 'mem_1001');
        this.bookings.push({ id: 'bk_1004', assetId: 'ast_genr01', customerId: 'cust_2001', startDate: '2026-07-20', endDate: '2026-07-24', status: 'confirmed', depositHeld: 0, quoteId: null, invoiceId: null, conditionOut: null, conditionIn: null, returnedDate: null, includeDelivery: true, includeInsurance: false, dispatch: null });
        this.counters.booking = 1004;
        break;
      case 'atSeatCap':
        // starter caps seats at 2; dropping the out booking keeps the booking cap clear.
        this.workspace.plan = 'starter';
        this.members = this.members.filter((m) => m.id === 'mem_1001' || m.id === 'mem_1002');
        this.bookings = this.bookings.filter((b) => b.id !== 'bk_1002');
        break;
      case 'depositFloatTight':
        this.workspace.plan = 'starter';
        bk('bk_1002').depositHeld = 8300;
        bk('bk_1003').depositHeld = 1200;
        this.members = this.members.filter((m) => m.id === 'mem_1001');
        break;
      case 'assetHold':
        this.holds.push({ id: 'hold_6001', type: 'compliance', scope: 'asset', reason: 'annual safety inspection overdue', assetId: 'ast_excv01', customerId: null, active: true, auto: false });
        this.counters.hold = 6001;
        break;
      case 'accountHold': {
        // The invoice is PAID so the account freeze is the BINDING blocker on a refund — otherwise
        // the nothing-paid gate fires first and the hold rule is never exercised (T2 finding).
        const inv = this.invoices.find((i) => i.id === 'inv_7001')!;
        inv.amountPaid = 2930;
        inv.status = 'paid';
        this.customers.find((c) => c.id === 'cust_2003')!.outstandingBalance = 0;
        this.holds.push({ id: 'hold_6002', type: 'payment', scope: 'account', reason: 'chargeback under investigation', assetId: null, customerId: 'cust_2001', active: true, auto: false });
        // cust_2003 owns the PAID invoice, so a refund only meets a freeze if that account carries one.
        this.holds.push({ id: 'hold_6003', type: 'payment', scope: 'account', reason: 'bank recall pending on the last settlement', assetId: null, customerId: 'cust_2003', active: true, auto: false });
        this.counters.hold = 6003;
        break;
      }
      case 'workspaceHold':
        this.holds.push({ id: 'hold_6003', type: 'legal', scope: 'workspace', reason: 'subpoena served on the account', assetId: null, customerId: null, active: true, auto: false });
        this.counters.hold = 6003;
        break;
      case 'openClaim': {
        // The invoice is PAID so the open claim is the BINDING blocker on the deposit release —
        // otherwise the unpaid-invoice gate fires first and the claim rule is never exercised.
        const paid = this.invoices.find((i) => i.id === 'inv_7001')!;
        paid.amountPaid = 2930;
        paid.status = 'paid';
        this.customers.find((c) => c.id === 'cust_2003')!.outstandingBalance = 0;
        this.claims.push({ id: 'clm_3001', type: 'damage', description: 'hydraulic line cut, found at check-in', bookingId: 'bk_1003', assetId: 'ast_sksr01', customerId: 'cust_2003', status: 'under_review', evidence: ['u900'], settlementAmount: null, holdId: 'hold_6004' });
        this.holds.push({ id: 'hold_6004', type: 'safety', scope: 'asset', reason: 'investigatory hold for claim clm_3001', assetId: 'ast_sksr01', customerId: null, active: true, auto: true });
        this.counters.claim = 3001;
        this.counters.hold = 6004;
        this.counters.attachment = 900;
        break;
      }
      case 'readyToRelease': {
        const inv = this.invoices.find((i) => i.id === 'inv_7001')!;
        inv.amountPaid = 2930;
        inv.status = 'paid';
        this.customers.find((c) => c.id === 'cust_2003')!.outstandingBalance = 0;
        break;
      }
      case 'lateReturn':
        bk('bk_1002').startDate = '2026-06-20';
        bk('bk_1002').endDate = '2026-06-27';
        break;
      case 'notOnboarded':
        this.workspace.onboarded = false;
        this.assets = [];
        this.customers = [];
        this.bookings = [];
        this.invoices = [];
        this.technicians = [];
        this.members = this.members.filter((m) => m.id === 'mem_1001');
        this.auditLog = [];
        break;
      case 'suspended':
        this.workspace.status = 'suspended';
        break;
      case 'soleOwner':
        this.members = this.members.filter((m) => m.id === 'mem_1001' || m.id === 'mem_1005');
        break;
      case 'techBusy':
        this.technicians.find((t) => t.id === 'tech_4001')!.jobs.push({ bookingId: 'bk_1002', date: '2026-07-10', jobType: 'pickup' });
        bk('bk_1002').dispatch = { technicianId: 'tech_4001', scheduledDate: '2026-07-10', jobType: 'pickup' };
        break;
      case 'openClaimDispatcher':
        // The openClaim state with a DISPATCHER at the desk: settling moves money, so the role gate
        // is the binding refusal. Without it the case seats an owner and measures nothing.
        this.applyPreset('openClaim');
        this.actingMemberId = 'mem_1003';
        break;
      case 'assetHoldBilling':
        // The assetHold state with a BILLING member at the desk: lifting a hold needs the
        // authorized-member role, which billing does not have.
        this.applyPreset('assetHold');
        this.actingMemberId = 'mem_1004';
        break;
      case 'dispatchedBooking':
        // A CANCELLABLE booking that already carries a field job — the only way to exercise
        // "cancelling voids the dispatch" inside a single lane.
        bk('bk_1001').dispatch = { technicianId: 'tech_4003', scheduledDate: '2026-07-10', jobType: 'delivery' };
        this.technicians.find((t) => t.id === 'tech_4003')!.jobs.push({ bookingId: 'bk_1001', date: '2026-07-10', jobType: 'delivery' });
        break;
      case 'partialRefund': {
        // A PAID invoice that already carries a refund, so amountPaid and (total - balanceDue)
        // diverge — the only state that can tell the two refund-cap formulas apart.
        const inv = this.invoices.find((i) => i.id === 'inv_7001')!;
        inv.amountPaid = 2930;
        inv.refunded = 1000;
        inv.status = 'paid';
        this.customers.find((c) => c.id === 'cust_2003')!.outstandingBalance = 0;
        break;
      }
      case 'assetMaintenance':
        // ast_genr01 carries no booking, so the window cannot contradict a seeded reservation.
        this.maintenance.push({ assetId: 'ast_genr01', startDate: '2026-07-05', endDate: '2026-07-12', reason: 'hydraulic service', status: 'scheduled', conditionAfter: null });
        this.assets.find((a) => a.id === 'ast_genr01')!.status = 'maintenance';
        break;
      default:
        // A mis-typed preset must NEVER be answered with the default world: the case would then
        // grade a state nobody chose. Fail loud, naming the roster.
        throw new Error('AtlasWorld: unknown preset "' + preset + '" — known presets: ' + ATLAS_PRESETS.join(', '));
    }
  }

  /** Asset status follows the bookings: reserved while a future booking holds it, out while rented. */
  syncAssetStatuses(): void {
    for (const a of this.assets) {
      if (a.status === 'retired' || a.status === 'maintenance') continue;
      const outNow = this.bookings.some((b) => b.assetId === a.id && b.status === 'out');
      const reserved = this.bookings.some((b) => b.assetId === a.id && (b.status === 'confirmed' || b.status === 'pending'));
      a.status = outNow ? 'out' : reserved ? 'reserved' : 'available';
    }
  }

  // ── seam ───────────────────────────────────────────────────────────────────

  advanceTurn(): void {
    this.turnIndex += 1;
  }

  ingestAttachment(_url: string): string {
    this.counters.attachment += 1;
    return 'u' + this.counters.attachment;
  }

  exec(name: string, args: Record<string, unknown>): unknown {
    const handler = (this.handlers as Record<string, (a: Record<string, unknown>) => Record<string, unknown>>)[name];
    let result: Record<string, unknown>;
    if (!handler) {
      result = fail('UNKNOWN_TOOL', 'no such operation: ' + name);
    } else {
      result = handler.call(this, args ?? {});
    }
    const mutated = result.__mutated === true;
    if (mutated) delete result.__mutated;
    // Result honesty: a WRITE that did not take effect and is not a two-step probe must read
    // as a failure — a domain-shaped "success" here silently disarms the honesty layer.
    // An IDEMPOTENT replay is a successful no-op (the operation already holds), not a refusal:
    // coercing it reported an unexplained failure for something that did succeed.
    const isWrite = (ATLAS_WRITE_TOOLS as readonly string[]).includes(name);
    if (isWrite && !mutated && result.requiresConfirmation !== true
      && result.idempotent !== true && result.ok !== false) {
      result = { ...result, ok: false };
    }
    this.toolCalls.push({ name, args, result, tookEffect: mutated });
    return result;
  }

  // ── projection + domain accessors ──────────────────────────────────────────

  limits(): { seats: number; bookings: number; float: number } {
    return PLAN_LIMITS[this.workspace.plan as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.starter;
  }

  acting(): Member | undefined {
    return this.members.find((m) => m.id === this.actingMemberId);
  }

  caps(role: string | undefined): { members: boolean; money: boolean; dispatch: boolean; fleet: boolean; plan: boolean } {
    switch (role) {
      case 'owner': return { members: true, money: true, dispatch: true, fleet: true, plan: true };
      case 'admin': return { members: true, money: false, dispatch: true, fleet: true, plan: false };
      case 'dispatcher': return { members: false, money: false, dispatch: true, fleet: false, plan: false };
      case 'billing': return { members: false, money: true, dispatch: false, fleet: false, plan: false };
      default: return { members: false, money: false, dispatch: false, fleet: false, plan: false };
    }
  }

  activeBookings(): Booking[] {
    return this.bookings.filter((b) => b.status === 'pending' || b.status === 'confirmed' || b.status === 'out');
  }

  depositFloatHeld(): number {
    return money(this.bookings.reduce((s, b) => s + b.depositHeld, 0));
  }

  activeHolds(): Hold[] {
    return this.holds.filter((h) => h.active);
  }

  workspaceFrozen(): boolean {
    return this.activeHolds().some((h) => h.scope === 'workspace');
  }

  assetHold(assetId: string): Hold | undefined {
    return this.activeHolds().find((h) => h.scope === 'asset' && h.assetId === assetId);
  }

  accountHold(customerId: string): Hold | undefined {
    return this.activeHolds().find((h) => h.scope === 'account' && h.customerId === customerId);
  }

  isAssetFrozen(assetId: string): boolean {
    return this.workspaceFrozen() || this.assetHold(assetId) !== undefined;
  }

  openClaims(): Claim[] {
    return this.claims.filter((c) => c.status === 'submitted' || c.status === 'under_review');
  }

  openClaimFor(bookingId: string): Claim | undefined {
    return this.openClaims().find((c) => c.bookingId === bookingId);
  }

  invoiceFor(bookingId: string): Invoice | undefined {
    return this.invoices.find((i) => i.bookingId === bookingId && i.status !== 'void');
  }

  balanceDue(inv: Invoice): number {
    return money(Math.max(0, inv.total - inv.amountPaid));
  }

  lateBookings(): Booking[] {
    return this.bookings.filter((b) => b.status === 'out' && toDays(TODAY) > toDays(b.endDate));
  }

  maintenanceWindows(assetId: string): Maintenance[] {
    return this.maintenance.filter((m) => m.assetId === assetId && m.status === 'scheduled');
  }

  projection(): Record<string, unknown> {
    const lim = this.limits();
    const acting = this.acting();
    const caps = this.caps(acting?.role);
    const seatsUsed = this.members.length; // invited members occupy a seat (D12)
    const active = this.activeBookings().length;
    const held = this.depositFloatHeld();
    return {
      today: TODAY,
      workspacePlan: this.workspace.plan,
      workspaceStatus: this.workspace.status,
      workspaceOnboarded: this.workspace.onboarded,
      actingMemberId: this.actingMemberId,
      actingRole: acting?.role ?? 'none',
      canManageMembers: caps.members,
      canMoveMoney: caps.money,
      canDispatch: caps.dispatch,
      canManageFleet: caps.fleet,
      canChangePlan: caps.plan,
      seatsUsed,
      seatCap: lim.seats,
      atSeatCap: seatsUsed >= lim.seats,
      activeBookings: active,
      bookingCap: lim.bookings,
      atBookingCap: active >= lim.bookings,
      depositFloatHeld: held,
      depositFloatLimit: lim.float,
      depositFloatRemaining: money(lim.float - held),
      openClaimCount: this.openClaims().length,
      activeHoldCount: this.activeHolds().length,
      workspaceFrozen: this.workspaceFrozen(),
      assetsAvailableCount: this.assets.filter((a) => a.status === 'available').length,
      paidInvoiceCount: this.invoices.filter((i) => i.status === 'paid').length,
      unpaidInvoiceCount: this.invoices.filter((i) => i.status === 'issued' || i.status === 'partially_paid' || i.status === 'overdue').length,
      dispatchedJobCount: this.technicians.reduce((s, t) => s + t.jobs.length, 0),
      ownerCount: this.members.filter((m) => m.role === 'owner' && m.status === 'active').length,
      memberCount: seatsUsed,
      lateBookingCount: this.lateBookings().length,
      refundedTotal: money(this.invoices.reduce((s2, i) => s2 + i.refunded, 0)),
    };
  }

  // ── shared gates ───────────────────────────────────────────────────────────

  /**
   * Workspace-level write gates (D03, D34). `protective` tools stay usable while frozen.
   *
   * The viewer clause is gate-#1 decision G-27: the brief's capability table covers only
   * members / money / dispatch / fleet, leaving the whole rental lifecycle ungated. The user
   * ruled that a viewer is READ-ONLY across the surface — it reads every record and performs
   * no operation that changes state.
   */
  writeGate(protective: boolean = false): { error: string; message: string } | null {
    const acting = this.acting();
    if (acting?.role === 'viewer')
      return {
        error: 'PERMISSION_DENIED',
        message: 'the acting member ' + this.actingMemberId + ' has role "viewer", which is read-only:'
          + ' a viewer can read every record in this workspace but cannot perform any operation that changes state.'
          + ' Members who can act: ' + (this.members
            .filter((m: Member) => m.status === 'active' && m.role !== 'viewer')
            .map((m: Member) => m.id + ' (' + m.name + ', ' + m.role + ')').join('; ') || 'none in this workspace'),
      };
    if (this.workspace.status === 'suspended')
      return { error: 'WORKSPACE_SUSPENDED', message: 'the workspace is suspended; no operation can be performed until it is reactivated' };
    if (!this.workspace.onboarded)
      return { error: 'NOT_ONBOARDED', message: 'the workspace has not completed onboarding; there is no data to act on yet' };
    if (!protective && this.workspaceFrozen())
      return { error: 'WORKSPACE_FROZEN', message: 'an active workspace-wide hold blocks this operation' };
    return null;
  }

  permGate(capability: 'members' | 'money' | 'dispatch' | 'fleet' | 'plan'): { error: string; message: string } | null {
    const acting = this.acting();
    const caps = this.caps(acting?.role);
    if (caps[capability]) return null;
    const allowedRoles: Record<string, string[]> = {
      members: ['owner', 'admin'], money: ['owner', 'billing'],
      dispatch: ['owner', 'admin', 'dispatcher'], fleet: ['owner', 'admin'], plan: ['owner'],
    };
    const who = this.members
      .filter((m) => m.status === 'active' && allowedRoles[capability].includes(m.role))
      .map((m) => m.id + ' (' + m.name + ', ' + m.role + ')');
    return {
      error: 'PERMISSION_DENIED',
      message: 'the acting member ' + this.actingMemberId + ' has role "' + (acting?.role ?? 'none')
        + '", which cannot perform this operation. Allowed roles: ' + allowedRoles[capability].join(', ')
        + '. Members who can: ' + (who.length ? who.join('; ') : 'none in this workspace'),
    };
  }

  audit(action: string, detail: string): void {
    this.auditLog.push({ seq: this.auditLog.length + 1, action, actor: this.actingMemberId, detail });
  }

  // ── handlers ───────────────────────────────────────────────────────────────

  get handlers(): Record<string, (a: Record<string, unknown>) => Record<string, unknown>> {
    return HANDLERS;
  }
}

export interface AtlasWorld {
  [k: string]: any;
}

type H = (this: AtlasWorld, a: Record<string, unknown>) => Record<string, unknown>;

const HANDLERS: Record<string, H> = {

  // ── bookings ──────────────────────────────────────────────────────────────

  checkAvailability(a) {
    const id = reqString(a.assetId, { pattern: ID_RE.asset, code: 'INVALID_ASSET_ID' });
    if ('error' in id) return fail(id.error, 'assetId must look like "ast_excv01"');
    const s = reqString(a.startDate, { pattern: ID_RE.date, code: 'INVALID_DATE' });
    if ('error' in s) return fail(s.error, 'startDate must be ISO YYYY-MM-DD');
    const e = reqString(a.endDate, { pattern: ID_RE.date, code: 'INVALID_DATE' });
    if ('error' in e) return fail(e.error, 'endDate must be ISO YYYY-MM-DD');
    if (!isValidDate(s.value) || !isValidDate(e.value)) return fail('INVALID_DATE', 'the dates are not real calendar dates');
    if (toDays(s.value) >= toDays(e.value)) return fail('INVALID_DATE_RANGE', 'startDate must be before endDate');
    const asset = this.assets.find((x: Asset) => x.id === id.value);
    if (!asset) return fail('NOT_FOUND_ASSET', 'no asset ' + id.value + ' in this workspace');

    const conflicts = this.bookings
      .filter((b: Booking) => b.assetId === asset.id && ['pending', 'confirmed', 'out'].includes(b.status)
        && overlaps(s.value, e.value, b.startDate, b.endDate))
      .map((b: Booking) => ({ bookingId: b.id, startDate: b.startDate, endDate: b.endDate, status: b.status }));
    const windows = this.maintenanceWindows(asset.id)
      .filter((m: Maintenance) => overlaps(s.value, e.value, m.startDate, m.endDate))
      .map((m: Maintenance) => ({ startDate: m.startDate, endDate: m.endDate, reason: m.reason }));
    const blockingHolds = this.activeHolds()
      .filter((h: Hold) => h.scope === 'workspace' || (h.scope === 'asset' && h.assetId === asset.id))
      .map((h: Hold) => ({ holdId: h.id, type: h.type, scope: h.scope, reason: h.reason }));

    const available = asset.status !== 'retired' && conflicts.length === 0
      && windows.length === 0 && blockingHolds.length === 0;
    return okRead({
      assetId: asset.id, assetName: asset.name, startDate: s.value, endDate: e.value,
      available, assetStatus: asset.status,
      conflictingBookings: conflicts, maintenanceWindows: windows, holds: blockingHolds,
      dailyRate: asset.dailyRate, requiredDeposit: asset.requiredDeposit,
    });
  },

  listBookings(a) {
    const st = optString(a.status, { allowed: BOOKING_STATUSES, code: 'INVALID_BOOKING_STATUS' });
    if ('error' in st) return fail(st.error, 'status must be one of: ' + BOOKING_STATUSES.join(', '));
    const filter = 'value' in st ? st.value : null;
    const rows = this.bookings
      .filter((b: Booking) => (filter ? b.status === filter : true))
      .map((b: Booking) => ({
        id: b.id, assetId: b.assetId, customerId: b.customerId, startDate: b.startDate,
        endDate: b.endDate, status: b.status, technicianDispatched: b.dispatch !== null,
      }));
    return okRead({ statusFilter: filter, count: rows.length, bookings: rows });
  },

  getBooking(a) {
    const id = reqString(a.bookingId, { pattern: ID_RE.booking, code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error, 'bookingId must look like "bk_1001"');
    const b = this.bookings.find((x: Booking) => x.id === id.value);
    if (!b) return okRead({ found: false, bookingId: id.value });
    const asset = this.assets.find((x: Asset) => x.id === b.assetId);
    const inv = this.invoiceFor(b.id);
    const claim = this.openClaimFor(b.id);
    return okRead({
      found: true,
      booking: {
        id: b.id, assetId: b.assetId, assetName: asset?.name ?? null, customerId: b.customerId,
        startDate: b.startDate, endDate: b.endDate, status: b.status,
        conditionOut: b.conditionOut, conditionIn: b.conditionIn, returnedDate: b.returnedDate,
        dispatch: b.dispatch, quoteId: b.quoteId, invoiceId: inv?.id ?? null,
        invoiceStatus: inv?.status ?? null, invoiceBalanceDue: inv ? this.balanceDue(inv) : null,
        depositHeld: b.depositHeld, depositRequired: asset?.requiredDeposit ?? 0,
        openClaimId: claim?.id ?? null,
        activeHolds: this.activeHolds()
          .filter((h: Hold) => h.scope === 'workspace'
            || (h.scope === 'asset' && h.assetId === b.assetId)
            || (h.scope === 'account' && h.customerId === b.customerId))
          .map((h: Hold) => ({ holdId: h.id, type: h.type, scope: h.scope, reason: h.reason })),
      },
    });
  },

  createBooking(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const assetId = reqString(a.assetId, { pattern: ID_RE.asset, code: 'INVALID_ASSET_ID' });
    if ('error' in assetId) return fail(assetId.error, 'assetId must look like "ast_excv01"');
    const custId = reqString(a.customerId, { pattern: ID_RE.customer, code: 'INVALID_CUSTOMER_ID' });
    if ('error' in custId) return fail(custId.error, 'customerId must look like "cust_2001"');
    const s = reqString(a.startDate, { pattern: ID_RE.date, code: 'INVALID_DATE' });
    if ('error' in s) return fail(s.error, 'startDate must be ISO YYYY-MM-DD');
    const e = reqString(a.endDate, { pattern: ID_RE.date, code: 'INVALID_DATE' });
    if ('error' in e) return fail(e.error, 'endDate must be ISO YYYY-MM-DD');
    const q = optString(a.quoteId, { pattern: ID_RE.quote, code: 'INVALID_QUOTE_ID' });
    if ('error' in q) return fail(q.error, 'quoteId must look like "qt_5001"');
    if (!isValidDate(s.value) || !isValidDate(e.value)) return fail('INVALID_DATE', 'the dates are not real calendar dates');
    if (toDays(s.value) >= toDays(e.value)) return fail('INVALID_DATE_RANGE', 'startDate must be before endDate');
    if (toDays(s.value) < toDays(TODAY)) return fail('DATE_IN_PAST', 'startDate ' + s.value + ' is before the current date ' + TODAY);

    const asset = this.assets.find((x: Asset) => x.id === assetId.value);
    if (!asset) return fail('NOT_FOUND_ASSET', 'no asset ' + assetId.value + ' in this workspace');
    const cust = this.customers.find((x: Customer) => x.id === custId.value);
    if (!cust) return fail('NOT_FOUND_CUSTOMER', 'no customer ' + custId.value + ' in this workspace');
    if ('value' in q && !this.quotes.find((x: Record<string, unknown>) => x.id === q.value))
      return fail('NOT_FOUND_QUOTE', 'no quote ' + q.value + ' in this workspace');

    if (asset.status === 'retired') return fail('ASSET_RETIRED', asset.id + ' is retired and cannot be rented');
    const hold = this.assetHold(asset.id);
    if (hold) return fail('ASSET_ON_HOLD', asset.id + ' is frozen by hold ' + hold.id + ' (' + hold.type + '): ' + hold.reason);
    const acctHold = this.accountHold(cust.id);
    if (acctHold) return fail('ACCOUNT_ON_HOLD', cust.id + ' is frozen by hold ' + acctHold.id + ' (' + acctHold.type + '): ' + acctHold.reason);
    const mw = this.maintenanceWindows(asset.id).find((m: Maintenance) => overlaps(s.value, e.value, m.startDate, m.endDate));
    if (mw) return fail('ASSET_IN_MAINTENANCE', asset.id + ' is in maintenance ' + mw.startDate + '…' + mw.endDate);
    const clash = this.bookings.find((b: Booking) => b.assetId === asset.id
      && ['pending', 'confirmed', 'out'].includes(b.status)
      && overlaps(s.value, e.value, b.startDate, b.endDate));
    if (clash) return fail('ASSET_UNAVAILABLE', asset.id + ' is already booked ' + clash.startDate + '…' + clash.endDate + ' (' + clash.id + ')');

    const lim = this.limits();
    if (this.activeBookings().length >= lim.bookings)
      return fail('BOOKING_QUOTA_EXCEEDED', 'the ' + this.workspace.plan + ' plan allows ' + lim.bookings
        + ' active bookings and ' + this.activeBookings().length + ' are already active — close a booking or upgrade the plan');

    this.counters.booking += 1;
    const id = 'bk_' + this.counters.booking;
    const quote = 'value' in q ? this.quotes.find((x: Record<string, unknown>) => x.id === q.value) : undefined;
    const booking: Booking = {
      id, assetId: asset.id, customerId: cust.id, startDate: s.value, endDate: e.value,
      status: 'confirmed', depositHeld: 0, quoteId: 'value' in q ? q.value : null, invoiceId: null,
      conditionOut: null, conditionIn: null, returnedDate: null,
      includeDelivery: quote ? quote.includeDelivery === true : true,
      includeInsurance: quote ? quote.includeInsurance === true : false,
      dispatch: null,
    };
    this.bookings.push(booking);
    this.syncAssetStatuses();
    this.audit('createBooking', id + ' created for ' + cust.id + ' on ' + asset.id);
    return okWrite({
      bookingId: id, status: 'confirmed', assetId: asset.id, customerId: cust.id,
      startDate: s.value, endDate: e.value, requiredDeposit: asset.requiredDeposit,
      quoteId: booking.quoteId,
    });
  },

  rescheduleBooking(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const id = reqString(a.bookingId, { pattern: ID_RE.booking, code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error, 'bookingId must look like "bk_1001"');
    const s = reqString(a.startDate, { pattern: ID_RE.date, code: 'INVALID_DATE' });
    if ('error' in s) return fail(s.error, 'startDate must be ISO YYYY-MM-DD');
    const e = reqString(a.endDate, { pattern: ID_RE.date, code: 'INVALID_DATE' });
    if ('error' in e) return fail(e.error, 'endDate must be ISO YYYY-MM-DD');
    if (!isValidDate(s.value) || !isValidDate(e.value)) return fail('INVALID_DATE', 'the dates are not real calendar dates');
    if (toDays(s.value) >= toDays(e.value)) return fail('INVALID_DATE_RANGE', 'startDate must be before endDate');
    const b = this.bookings.find((x: Booking) => x.id === id.value);
    if (!b) return fail('NOT_FOUND_BOOKING', 'no booking ' + id.value + ' in this workspace');
    if (!['pending', 'confirmed'].includes(b.status))
      return fail('BOOKING_NOT_RESCHEDULABLE', b.id + ' is ' + b.status + '; only a pending or confirmed booking can be moved');
    const hold = this.assetHold(b.assetId);
    if (hold) return fail('ASSET_ON_HOLD', b.assetId + ' is frozen by hold ' + hold.id + ': ' + hold.reason);
    const mw = this.maintenanceWindows(b.assetId).find((m: Maintenance) => overlaps(s.value, e.value, m.startDate, m.endDate));
    if (mw) return fail('ASSET_IN_MAINTENANCE', b.assetId + ' is in maintenance ' + mw.startDate + '…' + mw.endDate);
    const clash = this.bookings.find((o: Booking) => o.id !== b.id && o.assetId === b.assetId
      && ['pending', 'confirmed', 'out'].includes(o.status) && overlaps(s.value, e.value, o.startDate, o.endDate));
    if (clash) return fail('ASSET_UNAVAILABLE', b.assetId + ' is already booked ' + clash.startDate + '…' + clash.endDate + ' (' + clash.id + ')');

    const before = { startDate: b.startDate, endDate: b.endDate };
    b.startDate = s.value;
    b.endDate = e.value;
    this.audit('rescheduleBooking', b.id + ' moved to ' + s.value + '…' + e.value);
    return okWrite({ bookingId: b.id, previous: before, startDate: b.startDate, endDate: b.endDate, status: b.status });
  },

  cancelBooking(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const id = reqString(a.bookingId, { pattern: ID_RE.booking, code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error, 'bookingId must look like "bk_1001"');
    const b = this.bookings.find((x: Booking) => x.id === id.value);
    if (!b) return fail('NOT_FOUND_BOOKING', 'no booking ' + id.value + ' in this workspace');
    if (b.status === 'out')
      return fail('BOOKING_NOT_CANCELLABLE', b.id + ' is out on rental — check the asset in before cancelling');
    if (!['pending', 'confirmed'].includes(b.status))
      return fail('BOOKING_NOT_CANCELLABLE', b.id + ' is ' + b.status + '; only a pending or confirmed booking can be cancelled');
    if (!isConfirmed(a.confirmed))
      return probe('Cancel booking ' + b.id + '? This frees ' + b.assetId
        + (b.dispatch ? ' and voids the technician dispatch on ' + b.dispatch.scheduledDate : '')
        + ' and cannot be undone.',
        { bookingId: b.id, assetId: b.assetId, dispatchVoided: b.dispatch !== null, depositStillHeld: b.depositHeld, irreversible: true });

    b.status = 'cancelled';
    const voided = b.dispatch;
    if (voided) {
      const tech = this.technicians.find((t: Technician) => t.id === voided.technicianId);
      if (tech) tech.jobs = tech.jobs.filter((j: { bookingId: string }) => j.bookingId !== b.id);
      b.dispatch = null;
    }
    this.syncAssetStatuses();
    this.audit('cancelBooking', b.id + ' cancelled');
    return okWrite({ bookingId: b.id, status: 'cancelled', assetFreed: b.assetId, dispatchVoided: voided !== null, depositStillHeld: b.depositHeld });
  },

  checkOutAsset(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const id = reqString(a.bookingId, { pattern: ID_RE.booking, code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error, 'bookingId must look like "bk_1001"');
    const cond = optString(a.conditionOut, { allowed: CONDITIONS, code: 'INVALID_CONDITION' });
    if ('error' in cond) return fail(cond.error, 'conditionOut must be one of: ' + CONDITIONS.join(', '));
    const b = this.bookings.find((x: Booking) => x.id === id.value);
    if (!b) return fail('NOT_FOUND_BOOKING', 'no booking ' + id.value + ' in this workspace');
    if (b.status !== 'confirmed')
      return fail('BOOKING_NOT_CONFIRMED', b.id + ' is ' + b.status + '; only a confirmed booking can be checked out');
    const hold = this.assetHold(b.assetId);
    if (hold) return fail('ASSET_ON_HOLD', b.assetId + ' is frozen by hold ' + hold.id + ': ' + hold.reason);
    const acct = this.accountHold(b.customerId);
    if (acct) return fail('ACCOUNT_ON_HOLD', b.customerId + ' is frozen by hold ' + acct.id + ': ' + acct.reason);
    const asset = this.assets.find((x: Asset) => x.id === b.assetId)!;
    if (b.depositHeld < asset.requiredDeposit)
      return fail('DEPOSIT_NOT_COVERED', 'the deposit for ' + b.id + ' is ' + b.depositHeld + ' of the required '
        + asset.requiredDeposit + ' — charge the shortfall of ' + money(asset.requiredDeposit - b.depositHeld) + ' first');

    b.status = 'out';
    b.conditionOut = 'value' in cond ? cond.value : asset.condition;
    this.syncAssetStatuses();
    this.audit('checkOutAsset', b.id + ' checked out (' + b.conditionOut + ')');
    return okWrite({ bookingId: b.id, status: 'out', assetId: b.assetId, conditionOut: b.conditionOut, depositHeld: b.depositHeld });
  },

  checkInAsset(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const id = reqString(a.bookingId, { pattern: ID_RE.booking, code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error, 'bookingId must look like "bk_1001"');
    const cond = reqString(a.conditionIn, { allowed: CONDITIONS, code: 'INVALID_CONDITION' });
    if ('error' in cond) return fail(cond.error, 'conditionIn is required and must be one of: ' + CONDITIONS.join(', '));
    const ret = optString(a.returnedDate, { pattern: ID_RE.date, code: 'INVALID_DATE' });
    if ('error' in ret) return fail(ret.error, 'returnedDate must be ISO YYYY-MM-DD');
    const notes = optString(a.notes, { code: null });
    const b = this.bookings.find((x: Booking) => x.id === id.value);
    if (!b) return fail('NOT_FOUND_BOOKING', 'no booking ' + id.value + ' in this workspace');
    if (b.status !== 'out')
      return fail('BOOKING_NOT_OUT', b.id + ' is ' + b.status + '; only a booking that is out can be checked in');
    if ('value' in ret && !isValidDate(ret.value)) return fail('INVALID_DATE', 'returnedDate is not a real calendar date');
    // An unbounded return date drives an unbounded late fee through an unconfirmed field:
    // a return cannot predate the rental, and cannot be later than both today and the end date.
    if ('value' in ret) {
      const latest = Math.max(toDays(TODAY), toDays(b.endDate));
      if (toDays(ret.value) < toDays(b.startDate) || toDays(ret.value) > latest)
        return fail('RETURN_DATE_OUT_OF_RANGE', 'returnedDate ' + ret.value + ' must fall between the rental start '
          + b.startDate + ' and ' + fromDays(latest) + ' (the later of the end date and the current date ' + TODAY + ')');
    }

    const returned = 'value' in ret ? ret.value : b.endDate;
    b.status = 'returned';
    b.conditionIn = cond.value;
    b.returnedDate = returned;
    const asset = this.assets.find((x: Asset) => x.id === b.assetId)!;
    asset.condition = cond.value;
    this.syncAssetStatuses();
    const lateDays = Math.max(0, toDays(returned) - toDays(b.endDate));
    this.audit('checkInAsset', b.id + ' returned ' + returned + ' (' + cond.value + ')');
    return okWrite({
      bookingId: b.id, status: 'returned', assetId: b.assetId, conditionIn: cond.value,
      returnedDate: returned, lateDays,
      accruedLateFee: money(lateDays * asset.dailyRate * 0.5),
      notes: 'value' in notes ? notes.value : null,
      invoiceable: true, depositHeld: b.depositHeld,
      damageSuspected: cond.value === 'poor' || cond.value === 'damaged',
    });
  },

  closeBooking(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const id = reqString(a.bookingId, { pattern: ID_RE.booking, code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error, 'bookingId must look like "bk_1001"');
    const b = this.bookings.find((x: Booking) => x.id === id.value);
    if (!b) return fail('NOT_FOUND_BOOKING', 'no booking ' + id.value + ' in this workspace');
    if (b.status !== 'returned')
      return fail('BOOKING_NOT_RETURNED', b.id + ' is ' + b.status + '; only a returned booking can be closed');
    const inv = this.invoiceFor(b.id);
    if (!inv || inv.status !== 'paid')
      return fail('CLOSE_BLOCKED_INVOICE_UNPAID', 'the invoice for ' + b.id + ' is '
        + (inv ? inv.status + ' with ' + this.balanceDue(inv) + ' outstanding' : 'not generated yet'));
    if (b.depositHeld > 0)
      return fail('CLOSE_BLOCKED_DEPOSIT_HELD', b.id + ' still holds a deposit of ' + b.depositHeld + ' — release it first');
    const claim = this.openClaimFor(b.id);
    if (claim) return fail('CLOSE_BLOCKED_OPEN_CLAIM', 'claim ' + claim.id + ' against ' + b.id + ' is still ' + claim.status);

    b.status = 'closed';
    this.syncAssetStatuses();
    this.audit('closeBooking', b.id + ' closed');
    return okWrite({ bookingId: b.id, status: 'closed' });
  },

  // ── field ops ─────────────────────────────────────────────────────────────

  listTechnicians(a) {
    const skill = optString(a.skill, { code: null });
    const filter = 'value' in skill ? skill.value.toLowerCase() : null;
    const rows = this.technicians
      .filter((t: Technician) => (filter ? t.skills.some((s: string) => s.toLowerCase().includes(filter)) : true))
      .map((t: Technician) => ({
        id: t.id, name: t.name, skills: t.skills, homeBase: t.homeBase,
        jobsToday: t.jobs.filter((j: { date: string }) => j.date === TODAY).length,
        totalScheduledJobs: t.jobs.length,
      }));
    return okRead({ skillFilter: filter, count: rows.length, technicians: rows });
  },

  getTechnicianSchedule(a) {
    const id = reqString(a.technicianId, { pattern: ID_RE.technician, code: 'INVALID_TECHNICIAN_ID' });
    if ('error' in id) return fail(id.error, 'technicianId must look like "tech_4001"');
    const s = reqString(a.startDate, { pattern: ID_RE.date, code: 'INVALID_DATE' });
    if ('error' in s) return fail(s.error, 'startDate must be ISO YYYY-MM-DD');
    const e = reqString(a.endDate, { pattern: ID_RE.date, code: 'INVALID_DATE' });
    if ('error' in e) return fail(e.error, 'endDate must be ISO YYYY-MM-DD');
    if (!isValidDate(s.value) || !isValidDate(e.value)) return fail('INVALID_DATE', 'the dates are not real calendar dates');
    if (toDays(s.value) >= toDays(e.value)) return fail('INVALID_DATE_RANGE', 'startDate must be before endDate');
    const t = this.technicians.find((x: Technician) => x.id === id.value);
    if (!t) return okRead({ found: false, technicianId: id.value });

    const from = toDays(s.value);
    const to = toDays(e.value);
    const jobs = t.jobs.filter((j: { date: string }) => toDays(j.date) >= from && toDays(j.date) <= to);
    const busy = new Set(jobs.map((j: { date: string }) => j.date));
    const freeDays: string[] = [];
    for (let d = from; d <= to; d += 1) {
      const iso = fromDays(d);
      if (!busy.has(iso)) freeDays.push(iso);
    }
    return okRead({ found: true, technicianId: t.id, name: t.name, startDate: s.value, endDate: e.value, jobs, freeDays });
  },

  dispatchTechnician(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const perm = this.permGate('dispatch');
    if (perm) return fail(perm.error, perm.message);
    const bId = reqString(a.bookingId, { pattern: ID_RE.booking, code: 'INVALID_BOOKING_ID' });
    if ('error' in bId) return fail(bId.error, 'bookingId must look like "bk_1001"');
    const tId = reqString(a.technicianId, { pattern: ID_RE.technician, code: 'INVALID_TECHNICIAN_ID' });
    if ('error' in tId) return fail(tId.error, 'technicianId must look like "tech_4001"');
    const d = reqString(a.scheduledDate, { pattern: ID_RE.date, code: 'INVALID_DATE' });
    if ('error' in d) return fail(d.error, 'scheduledDate must be ISO YYYY-MM-DD');
    const jt = optString(a.jobType, { allowed: JOB_TYPES, code: 'INVALID_JOB_TYPE' });
    if ('error' in jt) return fail(jt.error, 'jobType must be one of: ' + JOB_TYPES.join(', '));
    if (!isValidDate(d.value)) return fail('INVALID_DATE', 'scheduledDate is not a real calendar date');
    const b = this.bookings.find((x: Booking) => x.id === bId.value);
    if (!b) return fail('NOT_FOUND_BOOKING', 'no booking ' + bId.value + ' in this workspace');
    const t = this.technicians.find((x: Technician) => x.id === tId.value);
    if (!t) return fail('NOT_FOUND_TECHNICIAN', 'no technician ' + tId.value + ' in this workspace');
    if (['cancelled', 'closed'].includes(b.status))
      return fail('BOOKING_NOT_DISPATCHABLE', b.id + ' is ' + b.status + '; a field job cannot be attached to it');
    const clash = t.jobs.find((j: { date: string; bookingId: string }) => j.date === d.value && j.bookingId !== b.id);
    if (clash) return fail('TECHNICIAN_DOUBLE_BOOKED', t.id + ' already has a job on ' + d.value + ' (' + clash.bookingId + ') — one job per technician per day');

    const jobType = 'value' in jt ? jt.value : 'delivery';
    const previous = b.dispatch;
    if (previous) {
      const prevTech = this.technicians.find((x: Technician) => x.id === previous.technicianId);
      if (prevTech) prevTech.jobs = prevTech.jobs.filter((j: { bookingId: string }) => j.bookingId !== b.id);
    }
    t.jobs.push({ bookingId: b.id, date: d.value, jobType });
    b.dispatch = { technicianId: t.id, scheduledDate: d.value, jobType };
    this.audit('dispatchTechnician', t.id + ' → ' + b.id + ' on ' + d.value + ' (' + jobType + ')');
    return okWrite({ bookingId: b.id, technicianId: t.id, technicianName: t.name, scheduledDate: d.value, jobType, reassignedFrom: previous?.technicianId ?? null });
  },

  cancelDispatch(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const perm = this.permGate('dispatch');
    if (perm) return fail(perm.error, perm.message);
    const id = reqString(a.bookingId, { pattern: ID_RE.booking, code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error, 'bookingId must look like "bk_1001"');
    const b = this.bookings.find((x: Booking) => x.id === id.value);
    if (!b) return fail('NOT_FOUND_BOOKING', 'no booking ' + id.value + ' in this workspace');
    if (!b.dispatch) return fail('NO_DISPATCH', b.id + ' has no technician assigned');

    if (!isConfirmed(a.confirmed))
      return probe('Remove ' + b.dispatch.technicianId + ' from the field job on ' + b.dispatch.scheduledDate + ' for ' + b.id + '?',
        { bookingId: b.id, technicianId: b.dispatch.technicianId, scheduledDate: b.dispatch.scheduledDate, jobType: b.dispatch.jobType });

    const removed = b.dispatch;
    const tech = this.technicians.find((t: Technician) => t.id === removed.technicianId);
    if (tech) tech.jobs = tech.jobs.filter((j: { bookingId: string }) => j.bookingId !== b.id);
    b.dispatch = null;
    this.audit('cancelDispatch', removed.technicianId + ' removed from ' + b.id);
    return okWrite({ bookingId: b.id, removedTechnicianId: removed.technicianId, freedDate: removed.scheduledDate });
  },

  // ── quotes and invoices ───────────────────────────────────────────────────

  generateQuote(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const id = reqString(a.assetId, { pattern: ID_RE.asset, code: 'INVALID_ASSET_ID' });
    if ('error' in id) return fail(id.error, 'assetId must look like "ast_excv01"');
    const s = reqString(a.startDate, { pattern: ID_RE.date, code: 'INVALID_DATE' });
    if ('error' in s) return fail(s.error, 'startDate must be ISO YYYY-MM-DD');
    const e = reqString(a.endDate, { pattern: ID_RE.date, code: 'INVALID_DATE' });
    if ('error' in e) return fail(e.error, 'endDate must be ISO YYYY-MM-DD');
    if (!isValidDate(s.value) || !isValidDate(e.value)) return fail('INVALID_DATE', 'the dates are not real calendar dates');
    if (toDays(s.value) >= toDays(e.value)) return fail('INVALID_DATE_RANGE', 'startDate must be before endDate');
    const asset = this.assets.find((x: Asset) => x.id === id.value);
    if (!asset) return fail('NOT_FOUND_ASSET', 'no asset ' + id.value + ' in this workspace');

    // G-32 (gate #1): the delivery fee no longer rides a silent default — a money-affecting
    // choice must be stated. Insurance keeps its opt-in default (D33: only when the customer opts in).
    if (!(a.includeDelivery === true || a.includeDelivery === false
      || a.includeDelivery === 'true' || a.includeDelivery === 'false'))
      return fail('MISSING_DELIVERY_CHOICE', 'includeDelivery is required — state explicitly whether'
        + ' the delivery fee applies to this quote; it is never assumed');
    const includeDelivery = a.includeDelivery === true || a.includeDelivery === 'true';
    const includeInsurance = a.includeInsurance === true || a.includeInsurance === 'true';
    const billableDays = Math.max(1, toDays(e.value) - toDays(s.value));
    const rental = money(asset.dailyRate * billableDays);
    const delivery = includeDelivery ? asset.deliveryFee : 0;
    const insurance = includeInsurance ? asset.insuranceFee : 0;
    const total = money(rental + delivery + insurance);
    this.counters.quote += 1;
    const qid = 'qt_' + this.counters.quote;
    const quote = {
      id: qid, assetId: asset.id, assetName: asset.name, startDate: s.value, endDate: e.value,
      dailyRate: asset.dailyRate, billableDays, rental, deliveryFee: delivery, insuranceFee: insurance,
      total, securityDeposit: asset.requiredDeposit, includeDelivery, includeInsurance,
    };
    this.quotes.push(quote);
    this.audit('generateQuote', qid + ' for ' + asset.id + ' (' + total + ')');
    return okWrite({ quoteId: qid, ...quote });
  },

  getQuote(a) {
    const q = optString(a.quoteId, { pattern: ID_RE.quote, code: 'INVALID_QUOTE_ID' });
    if ('error' in q) return fail(q.error, 'quoteId must look like "qt_5001"');
    if (!('value' in q)) return okRead({ count: this.quotes.length, quotes: this.quotes });
    const quote = this.quotes.find((x: Record<string, unknown>) => x.id === q.value);
    if (!quote) return okRead({ found: false, quoteId: q.value });
    return okRead({ found: true, quote });
  },

  generateInvoice(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const id = reqString(a.bookingId, { pattern: ID_RE.booking, code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error, 'bookingId must look like "bk_1001"');
    const b = this.bookings.find((x: Booking) => x.id === id.value);
    if (!b) return fail('NOT_FOUND_BOOKING', 'no booking ' + id.value + ' in this workspace');
    const existing = this.invoiceFor(b.id);
    if (existing) {
      // Idempotent (D25): the existing invoice is returned, not a second one. No mutation.
      return { ok: true, idempotent: true, invoiceId: existing.id, alreadyExisted: true, status: existing.status, total: existing.total, balanceDue: this.balanceDue(existing), lineItems: existing.lineItems, lateFee: existing.lateFee };
    }
    if (b.status !== 'returned')
      return fail('BOOKING_NOT_RETURNED', b.id + ' is ' + b.status + '; an invoice is generated once the asset is returned');

    const asset = this.assets.find((x: Asset) => x.id === b.assetId)!;
    const billableDays = Math.max(1, toDays(b.endDate) - toDays(b.startDate));
    const rental = money(asset.dailyRate * billableDays);
    const lines: Array<{ label: string; amount: number }> = [{ label: 'rental (' + billableDays + ' days × ' + asset.dailyRate + ')', amount: rental }];
    if (b.includeDelivery) lines.push({ label: 'delivery', amount: asset.deliveryFee });
    if (b.includeInsurance) lines.push({ label: 'damage-waiver insurance', amount: asset.insuranceFee });
    const lateDays = Math.max(0, toDays(b.returnedDate ?? b.endDate) - toDays(b.endDate));
    const lateFee = money(lateDays * asset.dailyRate * 0.5);
    if (lateFee > 0) lines.push({ label: 'late fee (' + lateDays + ' days × ' + asset.dailyRate + ' × 0.5)', amount: lateFee });
    const total = money(lines.reduce((s2, l) => s2 + l.amount, 0));

    this.counters.invoice += 1;
    const invId = 'inv_' + this.counters.invoice;
    const inv: Invoice = { id: invId, bookingId: b.id, lineItems: lines, lateFee, total, amountPaid: 0, refunded: 0, status: 'issued', idempotencyKeys: [] };
    this.invoices.push(inv);
    b.invoiceId = invId;
    const cust = this.customers.find((c: Customer) => c.id === b.customerId);
    if (cust) cust.outstandingBalance = money(cust.outstandingBalance + total);
    this.audit('generateInvoice', invId + ' issued for ' + b.id + ' (' + total + ')');
    return okWrite({ invoiceId: invId, bookingId: b.id, status: 'issued', lineItems: lines, lateDays, lateFee, total, balanceDue: total });
  },

  listInvoices(a) {
    const st = optString(a.status, { allowed: INVOICE_STATUSES, code: 'INVALID_INVOICE_STATUS' });
    if ('error' in st) return fail(st.error, 'status must be one of: ' + INVOICE_STATUSES.join(', '));
    const filter = 'value' in st ? st.value : null;
    const rows = this.invoices
      .filter((i: Invoice) => (filter ? i.status === filter : true))
      .map((i: Invoice) => ({ id: i.id, bookingId: i.bookingId, total: i.total, amountPaid: i.amountPaid, balanceDue: this.balanceDue(i), status: i.status }));
    return okRead({ statusFilter: filter, count: rows.length, invoices: rows });
  },

  getInvoice(a) {
    const id = reqString(a.invoiceId, { pattern: ID_RE.invoice, code: 'INVALID_INVOICE_ID' });
    if ('error' in id) return fail(id.error, 'invoiceId must look like "inv_7001"');
    const i = this.invoices.find((x: Invoice) => x.id === id.value);
    if (!i) return okRead({ found: false, invoiceId: id.value });
    return okRead({
      found: true,
      invoice: {
        id: i.id, bookingId: i.bookingId, lineItems: i.lineItems,
        subtotal: money(i.total - i.lateFee), lateFee: i.lateFee, total: i.total,
        amountPaid: i.amountPaid, refunded: i.refunded, balanceDue: this.balanceDue(i), status: i.status,
      },
    });
  },

  // ── deposits and payments ─────────────────────────────────────────────────

  getDepositBalance(a) {
    const id = optString(a.bookingId, { pattern: ID_RE.booking, code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error, 'bookingId must look like "bk_1001"');
    const lim = this.limits();
    if (!('value' in id)) {
      return okRead({
        scope: 'workspace', totalHeld: this.depositFloatHeld(),
        totalRequired: money(this.activeBookings().reduce((s, b) => {
          const asset = this.assets.find((x: Asset) => x.id === b.assetId);
          return s + (asset?.requiredDeposit ?? 0);
        }, 0)),
        depositFloatLimit: lim.float, depositFloatRemaining: money(lim.float - this.depositFloatHeld()),
        plan: this.workspace.plan,
      });
    }
    const b = this.bookings.find((x: Booking) => x.id === id.value);
    if (!b) return okRead({ found: false, bookingId: id.value });
    const asset = this.assets.find((x: Asset) => x.id === b.assetId);
    const required = asset?.requiredDeposit ?? 0;
    return okRead({
      found: true, scope: 'booking', bookingId: b.id, assetId: b.assetId,
      required, held: b.depositHeld, shortfall: money(Math.max(0, required - b.depositHeld)),
      bookingStatus: b.status,
    });
  },

  chargeDeposit(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const perm = this.permGate('money');
    if (perm) return fail(perm.error, perm.message);
    const id = reqString(a.bookingId, { pattern: ID_RE.booking, code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error, 'bookingId must look like "bk_1001"');
    const b = this.bookings.find((x: Booking) => x.id === id.value);
    if (!b) return fail('NOT_FOUND_BOOKING', 'no booking ' + id.value + ' in this workspace');
    const asset = this.assets.find((x: Asset) => x.id === b.assetId)!;
    const acct = this.accountHold(b.customerId);
    if (acct) return fail('ACCOUNT_ON_HOLD', b.customerId + ' is frozen by hold ' + acct.id + ': ' + acct.reason);
    if (a.amount !== undefined && (typeof a.amount !== 'number' || a.amount < 0))
      return fail('INVALID_AMOUNT', 'amount must be a non-negative number');
    const shortfall = money(Math.max(0, asset.requiredDeposit - b.depositHeld));
    if (shortfall === 0)
      // Idempotent (per the tool contract): already fully held is REPORTED, never double-charged.
      return { ok: true, idempotent: true, bookingId: b.id, alreadyHeld: true, held: b.depositHeld, required: asset.requiredDeposit, charged: 0 };
    const amount = money(typeof a.amount === 'number' ? a.amount : shortfall);
    if (amount === 0) return fail('INVALID_AMOUNT', 'amount must be greater than zero to charge a deposit');
    const lim = this.limits();
    const remaining = money(lim.float - this.depositFloatHeld());
    if (amount > remaining)
      return fail('DEPOSIT_FLOAT_EXCEEDED', 'the ' + this.workspace.plan + ' plan caps held deposits at ' + lim.float
        + '; ' + this.depositFloatHeld() + ' is already held, so only ' + remaining + ' can be charged — release a deposit or upgrade the plan');

    if (!isConfirmed(a.confirmed))
      return probe('Charge a security deposit of ' + amount + ' USD for ' + b.id + ' (' + asset.name + ')?',
        { bookingId: b.id, amount, required: asset.requiredDeposit, currentlyHeld: b.depositHeld, afterCharge: money(b.depositHeld + amount) });

    b.depositHeld = money(b.depositHeld + amount);
    this.audit('chargeDeposit', amount + ' held for ' + b.id);
    return okWrite({ bookingId: b.id, charged: amount, held: b.depositHeld, required: asset.requiredDeposit, shortfall: money(Math.max(0, asset.requiredDeposit - b.depositHeld)) });
  },

  releaseDeposit(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const perm = this.permGate('money');
    if (perm) return fail(perm.error, perm.message);
    const id = reqString(a.bookingId, { pattern: ID_RE.booking, code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error, 'bookingId must look like "bk_1001"');
    const b = this.bookings.find((x: Booking) => x.id === id.value);
    if (!b) return fail('NOT_FOUND_BOOKING', 'no booking ' + id.value + ' in this workspace');
    if (a.amount !== undefined && (typeof a.amount !== 'number' || a.amount < 0))
      return fail('INVALID_AMOUNT', 'amount must be a non-negative number');
    if (b.depositHeld <= 0) return fail('NO_DEPOSIT_HELD', 'no deposit is held for ' + b.id);
    // A cancelled booking never left the yard, so its deposit is releasable straight away —
    // without this the deposit-held cancel gate and the not-returned release gate deadlock
    // each other (T1/R3-S2) and the operator has no exit but to run the whole rental.
    if (!['returned', 'closed', 'cancelled'].includes(b.status))
      return fail('DEPOSIT_RELEASE_BLOCKED_NOT_RETURNED', b.id + ' is ' + b.status + '; the asset must be back before the deposit is released');
    const inv = this.invoiceFor(b.id);
    if (b.status !== 'cancelled' && (!inv || inv.status !== 'paid'))
      return fail('DEPOSIT_RELEASE_BLOCKED_INVOICE_UNPAID', 'the invoice for ' + b.id + ' is '
        + (inv ? inv.status + ' with ' + this.balanceDue(inv) + ' outstanding' : 'not generated yet'));
    const claim = this.openClaimFor(b.id);
    if (claim) return fail('DEPOSIT_RELEASE_BLOCKED_CLAIM', 'claim ' + claim.id + ' against ' + b.id + ' is still ' + claim.status);
    const assetHold = this.assetHold(b.assetId);
    if (assetHold) return fail('DEPOSIT_RELEASE_BLOCKED_HOLD', b.assetId + ' is frozen by hold ' + assetHold.id + ': ' + assetHold.reason);
    const acct = this.accountHold(b.customerId);
    if (acct) return fail('ACCOUNT_ON_HOLD', b.customerId + ' is frozen by hold ' + acct.id + ': ' + acct.reason);

    const amount = money(typeof a.amount === 'number' ? Math.min(a.amount, b.depositHeld) : b.depositHeld);
    if (amount === 0) return fail('INVALID_AMOUNT', 'amount must be greater than zero to release a deposit');
    if (!isConfirmed(a.confirmed))
      return probe('Release ' + amount + ' USD of the security deposit held on ' + b.id + ' back to ' + b.customerId + '?',
        { bookingId: b.id, amount, held: b.depositHeld, remainingAfter: money(b.depositHeld - amount), irreversible: true });

    b.depositHeld = money(b.depositHeld - amount);
    this.audit('releaseDeposit', amount + ' released for ' + b.id);
    return okWrite({ bookingId: b.id, released: amount, stillHeld: b.depositHeld });
  },

  payInvoice(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const perm = this.permGate('money');
    if (perm) return fail(perm.error, perm.message);
    const id = reqString(a.invoiceId, { pattern: ID_RE.invoice, code: 'INVALID_INVOICE_ID' });
    if ('error' in id) return fail(id.error, 'invoiceId must look like "inv_7001"');
    const key = optString(a.idempotencyKey, { code: null });
    const inv = this.invoices.find((x: Invoice) => x.id === id.value);
    if (!inv) return fail('NOT_FOUND_INVOICE', 'no invoice ' + id.value + ' in this workspace');
    if ('value' in key && inv.idempotencyKeys.includes(key.value))
      return { ok: true, idempotent: true, invoiceId: inv.id, idempotentReplay: true, status: inv.status, amountPaid: inv.amountPaid, balanceDue: this.balanceDue(inv) };
    if (inv.status === 'void') return fail('INVOICE_VOID', inv.id + ' is void and cannot be paid');
    if (inv.status === 'paid') return fail('INVOICE_ALREADY_PAID', inv.id + ' is already paid in full');
    if (a.amount !== undefined && (typeof a.amount !== 'number' || a.amount < 0))
      return fail('INVALID_AMOUNT', 'amount must be a non-negative number');
    const due = this.balanceDue(inv);
    const amount = money(typeof a.amount === 'number' ? Math.min(a.amount, due) : due);
    if (amount === 0) return fail('INVALID_AMOUNT', 'amount must be greater than zero to record a payment');

    if (!isConfirmed(a.confirmed))
      return probe('Record a payment of ' + amount + ' USD against ' + inv.id + ' (balance due ' + due + ')?',
        { invoiceId: inv.id, amount, balanceDue: due, balanceAfter: money(due - amount) });

    inv.amountPaid = money(inv.amountPaid + amount);
    inv.status = this.balanceDue(inv) === 0 ? 'paid' : 'partially_paid';
    if ('value' in key) inv.idempotencyKeys.push(key.value);
    const b = this.bookings.find((x: Booking) => x.id === inv.bookingId);
    const cust = b ? this.customers.find((c: Customer) => c.id === b.customerId) : undefined;
    if (cust) cust.outstandingBalance = money(Math.max(0, cust.outstandingBalance - amount));
    this.audit('payInvoice', amount + ' paid against ' + inv.id);
    return okWrite({ invoiceId: inv.id, paid: amount, amountPaid: inv.amountPaid, balanceDue: this.balanceDue(inv), status: inv.status });
  },

  issueRefund(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const perm = this.permGate('money');
    if (perm) return fail(perm.error, perm.message);
    const id = reqString(a.invoiceId, { pattern: ID_RE.invoice, code: 'INVALID_INVOICE_ID' });
    if ('error' in id) return fail(id.error, 'invoiceId must look like "inv_7001"');
    const reason = optString(a.reason, { code: null });
    const inv = this.invoices.find((x: Invoice) => x.id === id.value);
    if (!inv) return fail('NOT_FOUND_INVOICE', 'no invoice ' + id.value + ' in this workspace');
    if (typeof a.amount !== 'number' || a.amount < 0)
      return fail('INVALID_AMOUNT', 'amount is required and must be a non-negative number');
    const refundable = money(inv.amountPaid - inv.refunded);
    if (refundable <= 0) return fail('NOTHING_PAID', inv.id + ' has nothing left to refund (paid ' + inv.amountPaid + ', already refunded ' + inv.refunded + ')');
    const amount = money(a.amount);
    if (amount === 0) return fail('INVALID_AMOUNT', 'amount must be greater than zero to issue a refund');
    if (amount > refundable)
      return fail('REFUND_EXCEEDS_PAID', 'a refund of ' + amount + ' exceeds the ' + refundable + ' still refundable on ' + inv.id);
    const b = this.bookings.find((x: Booking) => x.id === inv.bookingId);
    if (b) {
      const acct = this.accountHold(b.customerId);
      if (acct) return fail('ACCOUNT_ON_HOLD', b.customerId + ' is frozen by hold ' + acct.id + ': ' + acct.reason);
    }

    if (!isConfirmed(a.confirmed))
      return probe('Refund ' + amount + ' USD against ' + inv.id + '? This moves money and cannot be undone.',
        { invoiceId: inv.id, amount, refundable, reason: 'value' in reason ? reason.value : null, irreversible: true });

    inv.refunded = money(inv.refunded + amount);
    this.audit('issueRefund', amount + ' refunded on ' + inv.id);
    return okWrite({ invoiceId: inv.id, refunded: amount, totalRefunded: inv.refunded, amountPaid: inv.amountPaid, status: inv.status });
  },

  voidInvoice(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const perm = this.permGate('money');
    if (perm) return fail(perm.error, perm.message);
    const id = reqString(a.invoiceId, { pattern: ID_RE.invoice, code: 'INVALID_INVOICE_ID' });
    if ('error' in id) return fail(id.error, 'invoiceId must look like "inv_7001"');
    const inv = this.invoices.find((x: Invoice) => x.id === id.value);
    if (!inv) return fail('NOT_FOUND_INVOICE', 'no invoice ' + id.value + ' in this workspace');
    if (inv.status === 'paid')
      return fail('INVOICE_PAID_CANNOT_VOID', inv.id + ' is paid — a paid invoice is never voided; issue a refund instead');
    if (inv.status === 'void') return fail('INVOICE_ALREADY_VOID', inv.id + ' is already void');
    if (inv.amountPaid > 0)
      return fail('INVOICE_PARTIALLY_PAID', inv.id + ' has ' + inv.amountPaid + ' already paid — refund it before voiding');

    if (!isConfirmed(a.confirmed))
      return probe('Void invoice ' + inv.id + ' (total ' + inv.total + ')? This cannot be undone.',
        { invoiceId: inv.id, total: inv.total, status: inv.status, irreversible: true });

    inv.status = 'void';
    const b = this.bookings.find((x: Booking) => x.id === inv.bookingId);
    const cust = b ? this.customers.find((c: Customer) => c.id === b.customerId) : undefined;
    if (cust) cust.outstandingBalance = money(Math.max(0, cust.outstandingBalance - inv.total));
    if (b) b.invoiceId = null;
    this.audit('voidInvoice', inv.id + ' voided');
    return okWrite({ invoiceId: inv.id, status: 'void' });
  },

  // ── claims ────────────────────────────────────────────────────────────────

  listClaims(a) {
    const st = optString(a.status, { allowed: CLAIM_STATUSES, code: 'INVALID_CLAIM_STATUS' });
    if ('error' in st) return fail(st.error, 'status must be one of: ' + CLAIM_STATUSES.join(', '));
    const filter = 'value' in st ? st.value : null;
    const rows = this.claims
      .filter((c: Claim) => (filter ? c.status === filter : true))
      .map((c: Claim) => ({ id: c.id, type: c.type, status: c.status, bookingId: c.bookingId, assetId: c.assetId }));
    return okRead({ statusFilter: filter, count: rows.length, claims: rows });
  },

  getClaim(a) {
    const id = reqString(a.claimId, { pattern: ID_RE.claim, code: 'INVALID_CLAIM_ID' });
    if ('error' in id) return fail(id.error, 'claimId must look like "clm_3001"');
    const c = this.claims.find((x: Claim) => x.id === id.value);
    if (!c) return okRead({ found: false, claimId: id.value });
    return okRead({
      found: true,
      claim: {
        id: c.id, type: c.type, status: c.status, description: c.description,
        evidence: c.evidence, bookingId: c.bookingId, assetId: c.assetId,
        customerId: c.customerId, settlementAmount: c.settlementAmount, holdId: c.holdId,
      },
    });
  },

  fileClaim(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const type = reqString(a.type, { allowed: CLAIM_TYPES, code: 'INVALID_CLAIM_TYPE' });
    if ('error' in type) return fail(type.error, 'type must be one of: ' + CLAIM_TYPES.join(', '));
    const desc = reqString(a.description, { code: 'MISSING_DESCRIPTION' });
    if ('error' in desc) return fail(desc.error, 'description is required and must not be empty');
    const bId = optString(a.bookingId, { pattern: ID_RE.booking, code: 'INVALID_BOOKING_ID' });
    if ('error' in bId) return fail(bId.error, 'bookingId must look like "bk_1001"');
    const aId = optString(a.assetId, { pattern: ID_RE.asset, code: 'INVALID_ASSET_ID' });
    if ('error' in aId) return fail(aId.error, 'assetId must look like "ast_excv01"');
    if (!('value' in bId) && !('value' in aId))
      return fail('MISSING_CLAIM_TARGET', 'pass at least one of bookingId or assetId — a claim must name what it is against');

    let booking: Booking | undefined;
    if ('value' in bId) {
      booking = this.bookings.find((x: Booking) => x.id === bId.value);
      if (!booking) return fail('NOT_FOUND_BOOKING', 'no booking ' + bId.value + ' in this workspace');
    }
    let assetId: string | null = 'value' in aId ? aId.value : (booking?.assetId ?? null);
    if (assetId && !this.assets.find((x: Asset) => x.id === assetId))
      return fail('NOT_FOUND_ASSET', 'no asset ' + assetId + ' in this workspace');
    const evidence = Array.isArray(a.evidence) ? (a.evidence as unknown[]).filter((x): x is string => typeof x === 'string') : [];

    this.counters.claim += 1;
    const cid = 'clm_' + this.counters.claim;
    this.counters.hold += 1;
    const hid = 'hold_' + this.counters.hold;
    const claim: Claim = {
      id: cid, type: type.value, description: desc.value,
      bookingId: booking?.id ?? null, assetId, customerId: booking?.customerId ?? null,
      status: 'submitted', evidence, settlementAmount: null, holdId: assetId ? hid : null,
    };
    this.claims.push(claim);
    if (assetId) {
      this.holds.push({ id: hid, type: 'safety', scope: 'asset', reason: 'investigatory hold for claim ' + cid, assetId, customerId: null, active: true, auto: true });
    }
    this.audit('fileClaim', cid + ' filed (' + type.value + ')' + (assetId ? ', ' + assetId + ' frozen by ' + hid : ''));
    return okWrite({
      claimId: cid, status: 'submitted', type: type.value, bookingId: claim.bookingId,
      assetId, evidence, assetFrozen: assetId !== null, holdId: claim.holdId,
    });
  },

  addClaimEvidence(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const id = reqString(a.claimId, { pattern: ID_RE.claim, code: 'INVALID_CLAIM_ID' });
    if ('error' in id) return fail(id.error, 'claimId must look like "clm_3001"');
    const c = this.claims.find((x: Claim) => x.id === id.value);
    if (!c) return fail('NOT_FOUND_CLAIM', 'no claim ' + id.value + ' in this workspace');
    const evidence = Array.isArray(a.evidence) ? (a.evidence as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    if (!evidence.length) return fail('MISSING_EVIDENCE', 'evidence is required and must contain at least one attachment label');
    if (!['submitted', 'under_review'].includes(c.status))
      return fail('CLAIM_ALREADY_RESOLVED', c.id + ' is ' + c.status + '; evidence can only be added while a claim is open');

    // Adding evidence does NOT advance the claim: no tool on this surface performs
    // submitted → under_review, so the world never invents that transition either
    // (the state arrives only as seeded preset state — recorded as gate finding G-08).
    c.evidence = [...c.evidence, ...evidence];
    this.audit('addClaimEvidence', evidence.length + ' item(s) added to ' + c.id);
    return okWrite({ claimId: c.id, status: c.status, evidence: c.evidence });
  },

  resolveClaim(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const id = reqString(a.claimId, { pattern: ID_RE.claim, code: 'INVALID_CLAIM_ID' });
    if ('error' in id) return fail(id.error, 'claimId must look like "clm_3001"');
    const res = reqString(a.resolution, { allowed: ['approve', 'deny', 'settle'], code: 'INVALID_RESOLUTION' });
    if ('error' in res) return fail(res.error, 'resolution must be one of: approve, deny, settle');
    const c = this.claims.find((x: Claim) => x.id === id.value);
    if (!c) return fail('NOT_FOUND_CLAIM', 'no claim ' + id.value + ' in this workspace');
    if (!['submitted', 'under_review'].includes(c.status))
      return fail('CLAIM_ALREADY_RESOLVED', c.id + ' is already ' + c.status);
    const movesMoney = res.value === 'approve' || res.value === 'settle';
    if (movesMoney) {
      const perm = this.permGate('money');
      if (perm) return fail(perm.error, perm.message);
      if (typeof a.settlementAmount !== 'number' || a.settlementAmount < 0)
        return fail('SETTLEMENT_REQUIRED', 'settlementAmount is required (and must be a non-negative number) to ' + res.value + ' a claim');
    }
    const amount = movesMoney ? money(a.settlementAmount as number) : 0;
    const booking = c.bookingId ? this.bookings.find((x: Booking) => x.id === c.bookingId) : undefined;
    const fromDeposit = booking ? money(Math.min(amount, booking.depositHeld)) : 0;
    const invoicedSeparately = money(amount - fromDeposit);

    // The CONDITIONAL two-step (D39/F2): deny moves no money and is one-step.
    if (movesMoney && !isConfirmed(a.confirmed))
      return probe('Resolve claim ' + c.id + ' as ' + res.value + ' with a settlement of ' + amount
        + ' USD? ' + fromDeposit + ' comes out of the deposit held on ' + (booking?.id ?? 'the booking')
        + (invoicedSeparately > 0 ? ' and ' + invoicedSeparately + ' would have to be invoiced separately' : '') + '.',
        { claimId: c.id, resolution: res.value, settlementAmount: amount, fromDeposit, invoicedSeparately });

    c.status = res.value === 'approve' ? 'approved' : res.value === 'deny' ? 'denied' : 'settled';
    c.settlementAmount = movesMoney ? amount : null;
    if (booking && fromDeposit > 0) booking.depositHeld = money(booking.depositHeld - fromDeposit);
    if (c.holdId) {
      const h = this.holds.find((x: Hold) => x.id === c.holdId);
      if (h) h.active = false;
    }
    this.audit('resolveClaim', c.id + ' ' + c.status + (movesMoney ? ' (' + amount + ')' : ''));
    return okWrite({
      claimId: c.id, status: c.status, settlementAmount: c.settlementAmount,
      deductedFromDeposit: fromDeposit, invoicedSeparately,
      depositRemaining: booking ? booking.depositHeld : null,
      holdLifted: c.holdId,
    });
  },

  // ── holds ─────────────────────────────────────────────────────────────────

  listHolds(a) {
    const sc = optString(a.scope, { allowed: HOLD_SCOPES, code: 'INVALID_HOLD_SCOPE' });
    if ('error' in sc) return fail(sc.error, 'scope must be one of: ' + HOLD_SCOPES.join(', '));
    const aid = optString(a.assetId, { pattern: ID_RE.asset, code: 'INVALID_ASSET_ID' });
    if ('error' in aid) return fail(aid.error, 'assetId must look like "ast_excv01"');
    let rows = this.activeHolds();
    if ('value' in sc) rows = rows.filter((h: Hold) => h.scope === sc.value);
    if ('value' in aid) rows = rows.filter((h: Hold) => h.scope === 'workspace' || h.assetId === aid.value);
    return okRead({
      scopeFilter: 'value' in sc ? sc.value : null,
      assetFilter: 'value' in aid ? aid.value : null,
      count: rows.length,
      holds: rows.map((h: Hold) => ({ id: h.id, type: h.type, scope: h.scope, assetId: h.assetId, customerId: h.customerId, reason: h.reason, automatic: h.auto })),
    });
  },

  placeHold(a) {
    // Protective and additive: it stays available while the workspace is frozen.
    const gate = this.writeGate(true);
    if (gate) return fail(gate.error, gate.message);
    const type = reqString(a.type, { allowed: HOLD_TYPES, code: 'INVALID_HOLD_TYPE' });
    if ('error' in type) return fail(type.error, 'type must be one of: ' + HOLD_TYPES.join(', '));
    const scope = reqString(a.scope, { allowed: HOLD_SCOPES, code: 'INVALID_HOLD_SCOPE' });
    if ('error' in scope) return fail(scope.error, 'scope must be one of: ' + HOLD_SCOPES.join(', '));
    const reason = reqString(a.reason, { code: 'MISSING_REASON' });
    if ('error' in reason) return fail(reason.error, 'reason is required and must not be empty');
    const aid = optString(a.assetId, { pattern: ID_RE.asset, code: 'INVALID_ASSET_ID' });
    if ('error' in aid) return fail(aid.error, 'assetId must look like "ast_excv01"');
    const cid = optString(a.customerId, { pattern: ID_RE.customer, code: 'INVALID_CUSTOMER_ID' });
    if ('error' in cid) return fail(cid.error, 'customerId must look like "cust_2001"');
    if (scope.value === 'asset' && !('value' in aid))
      return fail('MISSING_ASSET_ID', 'scope=asset requires assetId — name the asset the hold freezes');
    if (scope.value === 'account' && !('value' in cid))
      return fail('MISSING_CUSTOMER_ID', 'scope=account requires customerId — name the account the hold freezes');
    if ('value' in aid && !this.assets.find((x: Asset) => x.id === aid.value))
      return fail('NOT_FOUND_ASSET', 'no asset ' + aid.value + ' in this workspace');
    if ('value' in cid && !this.customers.find((x: Customer) => x.id === cid.value))
      return fail('NOT_FOUND_CUSTOMER', 'no customer ' + cid.value + ' in this workspace');

    // G-30 (gate #1): a workspace-scope hold freezes the whole tenant and is undone only by the
    // high-risk two-step releaseHold — it is CONDITIONALLY two-step. Asset and account scope stay
    // one-step: they are the additive, protective use the tool was written for.
    if (scope.value === 'workspace' && !isConfirmed(a.confirmed))
      return probe('Place a ' + type.value + ' hold on the ENTIRE workspace? While it is active every'
        + ' gated operation in this tenant is blocked — new bookings, checkouts, deposit releases and'
        + ' refunds — and only releaseHold lifts it. Reason: "' + reason.value + '".',
        { type: type.value, scope: 'workspace', reason: reason.value, freezesEntireWorkspace: true });

    this.counters.hold += 1;
    const hid = 'hold_' + this.counters.hold;
    this.holds.push({
      id: hid, type: type.value, scope: scope.value, reason: reason.value,
      assetId: scope.value === 'asset' && 'value' in aid ? aid.value : null, // [VENDOR-TYPEFIX]
      customerId: scope.value === 'account' && 'value' in cid ? cid.value : null, // [VENDOR-TYPEFIX]
      active: true, auto: false,
    });
    this.audit('placeHold', hid + ' (' + type.value + '/' + scope.value + ') placed: ' + reason.value);
    return okWrite({ holdId: hid, type: type.value, scope: scope.value, assetId: scope.value === 'asset' && 'value' in aid ? aid.value : null, customerId: scope.value === 'account' && 'value' in cid ? cid.value : null, reason: reason.value }); // [VENDOR-TYPEFIX]
  },

  releaseHold(a) {
    // A freeze must stay liftable while it is in force — otherwise the workspace deadlocks.
    const gate = this.writeGate(true);
    if (gate) return fail(gate.error, gate.message);
    const id = reqString(a.holdId, { pattern: ID_RE.hold, code: 'INVALID_HOLD_ID' });
    if ('error' in id) return fail(id.error, 'holdId must look like "hold_6001"');
    const h = this.holds.find((x: Hold) => x.id === id.value);
    if (!h) return fail('NOT_FOUND_HOLD', 'no hold ' + id.value + ' in this workspace');
    if (!h.active) return fail('HOLD_ALREADY_RELEASED', h.id + ' is already released');
    const perm = this.permGate('members');
    if (perm) return fail(perm.error, perm.message);
    if (h.auto) {
      const claim = this.claims.find((c: Claim) => c.holdId === h.id && ['submitted', 'under_review'].includes(c.status));
      if (claim) return fail('HOLD_BOUND_TO_OPEN_CLAIM', h.id + ' is the investigatory hold for claim ' + claim.id + ' (' + claim.status + ') — resolve the claim to lift it');
    }

    if (!isConfirmed(a.confirmed))
      return probe('Lift the ' + h.type + ' hold ' + h.id + ' on '
        + (h.scope === 'asset' ? h.assetId : h.scope === 'account' ? h.customerId : 'the whole workspace')
        + '? Reason on record: "' + h.reason + '".',
        { holdId: h.id, type: h.type, scope: h.scope, reason: h.reason, highRisk: h.type === 'legal' || h.type === 'compliance' });

    h.active = false;
    this.audit('releaseHold', h.id + ' released');
    return okWrite({ holdId: h.id, released: true, type: h.type, scope: h.scope });
  },

  // ── customers and policy ──────────────────────────────────────────────────

  listCustomers(a) {
    const q = optString(a.query, { code: null });
    const needle = 'value' in q ? q.value.toLowerCase() : null;
    const rows = this.customers
      .filter((c: Customer) => (needle ? c.name.toLowerCase().includes(needle) : true))
      .map((c: Customer) => ({
        id: c.id, name: c.name,
        hasActiveHold: this.accountHold(c.id) !== undefined,
        outstandingBalance: c.outstandingBalance,
      }));
    return okRead({ query: needle, count: rows.length, customers: rows });
  },

  getCustomer(a) {
    const id = reqString(a.customerId, { pattern: ID_RE.customer, code: 'INVALID_CUSTOMER_ID' });
    if ('error' in id) return fail(id.error, 'customerId must look like "cust_2001"');
    const c = this.customers.find((x: Customer) => x.id === id.value);
    if (!c) return okRead({ found: false, customerId: id.value });
    const holds = this.activeHolds().filter((h: Hold) => h.scope === 'account' && h.customerId === c.id);
    return okRead({
      found: true,
      customer: {
        id: c.id, name: c.name,
        // D04 — contact data is MASKED at the seam; the raw value never leaves the world.
        emailMasked: maskEmail(c.email), phoneMasked: maskPhone(c.phone), piiMasked: true,
        rentalCount: c.rentalCount, outstandingBalance: c.outstandingBalance,
        activeHolds: holds.map((h: Hold) => ({ holdId: h.id, type: h.type, reason: h.reason })),
      },
    });
  },

  createCustomer(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const name = reqString(a.name, { code: 'MISSING_NAME' });
    if ('error' in name) return fail(name.error, 'name is required and must not be empty');
    const email = reqString(a.email, { code: 'MISSING_EMAIL' });
    if ('error' in email) return fail(email.error, 'email is required and must not be empty');
    if (!email.value.includes('@')) return fail('INVALID_EMAIL', 'email must contain "@"');
    const phone = optString(a.phone, { code: null });

    this.counters.customer += 1;
    const cid = 'cust_' + this.counters.customer;
    this.customers.push({ id: cid, name: name.value, email: email.value, phone: 'value' in phone ? phone.value : '', outstandingBalance: 0, rentalCount: 0 });
    this.audit('createCustomer', cid + ' registered');
    return okWrite({ customerId: cid, name: name.value, emailMasked: maskEmail(email.value), piiMasked: true });
  },

  lookupPolicy(a) {
    const topic = reqString(a.topic, { allowed: POLICY_TOPICS, code: 'INVALID_POLICY_TOPIC' });
    if ('error' in topic) return fail(topic.error, 'topic must be one of: ' + POLICY_TOPICS.join(', '));
    return okRead({ topic: topic.value, policy: POLICY_TEXT[topic.value] });
  },

  // ── fleet ─────────────────────────────────────────────────────────────────

  listAssets(a) {
    const cat = optString(a.category, { allowed: CATEGORIES, code: 'INVALID_CATEGORY' });
    if ('error' in cat) return fail(cat.error, 'category must be one of: ' + CATEGORIES.join(', '));
    const st = optString(a.status, { allowed: ASSET_STATUSES, code: 'INVALID_ASSET_STATUS' });
    if ('error' in st) return fail(st.error, 'status must be one of: ' + ASSET_STATUSES.join(', '));
    const rows = this.assets
      .filter((x: Asset) => ('value' in cat ? x.category === cat.value : true))
      .filter((x: Asset) => ('value' in st ? x.status === st.value : true))
      .map((x: Asset) => ({ id: x.id, name: x.name, category: x.category, condition: x.condition, status: x.status, dailyRate: x.dailyRate, requiredDeposit: x.requiredDeposit }));
    return okRead({
      categoryFilter: 'value' in cat ? cat.value : null,
      statusFilter: 'value' in st ? st.value : null,
      count: rows.length, assets: rows,
    });
  },

  getAsset(a) {
    const id = reqString(a.assetId, { pattern: ID_RE.asset, code: 'INVALID_ASSET_ID' });
    if ('error' in id) return fail(id.error, 'assetId must look like "ast_excv01"');
    const x = this.assets.find((y: Asset) => y.id === id.value);
    if (!x) return okRead({ found: false, assetId: id.value });
    const hold = this.assetHold(x.id);
    return okRead({
      found: true,
      asset: {
        id: x.id, name: x.name, category: x.category, condition: x.condition, status: x.status,
        dailyRate: x.dailyRate, requiredDeposit: x.requiredDeposit,
        deliveryFee: x.deliveryFee, insuranceFee: x.insuranceFee,
        upcomingBookings: this.bookings
          .filter((b: Booking) => b.assetId === x.id && ['pending', 'confirmed', 'out'].includes(b.status))
          .map((b: Booking) => ({ bookingId: b.id, startDate: b.startDate, endDate: b.endDate, status: b.status })),
        openMaintenance: this.maintenanceWindows(x.id),
        activeHold: hold ? { holdId: hold.id, type: hold.type, reason: hold.reason } : null,
      },
    });
  },

  registerAsset(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const perm = this.permGate('fleet');
    if (perm) return fail(perm.error, perm.message);
    const name = reqString(a.name, { code: 'MISSING_NAME' });
    if ('error' in name) return fail(name.error, 'name is required and must not be empty');
    const cat = reqString(a.category, { allowed: CATEGORIES, code: 'INVALID_CATEGORY' });
    if ('error' in cat) return fail(cat.error, 'category must be one of: ' + CATEGORIES.join(', '));
    const cond = optString(a.condition, { allowed: CONDITIONS, code: 'INVALID_CONDITION' });
    if ('error' in cond) return fail(cond.error, 'condition must be one of: ' + CONDITIONS.join(', '));
    if (typeof a.dailyRate !== 'number' || a.dailyRate < 0) return fail('INVALID_AMOUNT', 'dailyRate is required and must be a non-negative number');
    if (typeof a.requiredDeposit !== 'number' || a.requiredDeposit < 0) return fail('INVALID_AMOUNT', 'requiredDeposit is required and must be a non-negative number');

    // The seed and the tool description both use a 4-letter mnemonic (ast_excv02), not the first
    // four characters of the category — a model inferring the convention from listAssets must be right.
    const prefix = CATEGORY_PREFIX[cat.value] ?? cat.value.slice(0, 4).replace(/_/g, '');
    const siblings = this.assets.filter((x: Asset) => x.category === cat.value).length + 1;
    const aid = 'ast_' + prefix + String(siblings).padStart(2, '0');
    const asset: Asset = {
      id: aid, name: name.value, category: cat.value,
      condition: 'value' in cond ? cond.value : 'good', status: 'available',
      dailyRate: money(a.dailyRate), requiredDeposit: money(a.requiredDeposit),
      deliveryFee: 150, insuranceFee: 50,
    };
    this.assets.push(asset);
    this.audit('registerAsset', aid + ' registered (' + cat.value + ')');
    return okWrite({ assetId: aid, name: asset.name, category: asset.category, condition: asset.condition, status: 'available', dailyRate: asset.dailyRate, requiredDeposit: asset.requiredDeposit });
  },

  updateAssetCondition(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const perm = this.permGate('fleet');
    if (perm) return fail(perm.error, perm.message);
    const id = reqString(a.assetId, { pattern: ID_RE.asset, code: 'INVALID_ASSET_ID' });
    if ('error' in id) return fail(id.error, 'assetId must look like "ast_excv01"');
    const cond = reqString(a.condition, { allowed: CONDITIONS, code: 'INVALID_CONDITION' });
    if ('error' in cond) return fail(cond.error, 'condition is required and must be one of: ' + CONDITIONS.join(', '));
    const x = this.assets.find((y: Asset) => y.id === id.value);
    if (!x) return fail('NOT_FOUND_ASSET', 'no asset ' + id.value + ' in this workspace');
    if (x.status === 'retired') return fail('ASSET_RETIRED', x.id + ' is retired');

    const previous = x.condition;
    x.condition = cond.value;
    this.audit('updateAssetCondition', x.id + ' ' + previous + ' → ' + cond.value);
    return okWrite({ assetId: x.id, previousCondition: previous, condition: x.condition, claimFiled: false });
  },

  scheduleMaintenance(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const perm = this.permGate('fleet');
    if (perm) return fail(perm.error, perm.message);
    const id = reqString(a.assetId, { pattern: ID_RE.asset, code: 'INVALID_ASSET_ID' });
    if ('error' in id) return fail(id.error, 'assetId must look like "ast_excv01"');
    const s = reqString(a.startDate, { pattern: ID_RE.date, code: 'INVALID_DATE' });
    if ('error' in s) return fail(s.error, 'startDate must be ISO YYYY-MM-DD');
    const e = reqString(a.endDate, { pattern: ID_RE.date, code: 'INVALID_DATE' });
    if ('error' in e) return fail(e.error, 'endDate must be ISO YYYY-MM-DD');
    const reason = optString(a.reason, { code: null });
    if (!isValidDate(s.value) || !isValidDate(e.value)) return fail('INVALID_DATE', 'the dates are not real calendar dates');
    if (toDays(s.value) >= toDays(e.value)) return fail('INVALID_DATE_RANGE', 'startDate must be before endDate');
    const x = this.assets.find((y: Asset) => y.id === id.value);
    if (!x) return fail('NOT_FOUND_ASSET', 'no asset ' + id.value + ' in this workspace');
    if (x.status === 'retired') return fail('ASSET_RETIRED', x.id + ' is retired');
    if (x.status === 'out') return fail('ASSET_OUT_ON_RENTAL', x.id + ' is out on an active rental and cannot enter maintenance');
    if (x.status === 'maintenance') return fail('ASSET_IN_MAINTENANCE', x.id + ' is already in maintenance');
    // A window over a live reservation would double-book the asset silently.
    const booked = this.bookings.find((b: Booking) => b.assetId === x.id
      && ['pending', 'confirmed'].includes(b.status) && overlaps(s.value, e.value, b.startDate, b.endDate));
    if (booked) return fail('ASSET_RESERVED_IN_WINDOW', x.id + ' is reserved by ' + booked.id + ' (' + booked.startDate + '…' + booked.endDate + ') inside that maintenance window');

    this.maintenance.push({ assetId: x.id, startDate: s.value, endDate: e.value, reason: 'value' in reason ? reason.value : 'scheduled service', status: 'scheduled', conditionAfter: null });
    x.status = 'maintenance';
    this.audit('scheduleMaintenance', x.id + ' in maintenance ' + s.value + '…' + e.value);
    return okWrite({ assetId: x.id, status: 'maintenance', startDate: s.value, endDate: e.value, reason: 'value' in reason ? reason.value : 'scheduled service' });
  },

  completeMaintenance(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const perm = this.permGate('fleet');
    if (perm) return fail(perm.error, perm.message);
    const id = reqString(a.assetId, { pattern: ID_RE.asset, code: 'INVALID_ASSET_ID' });
    if ('error' in id) return fail(id.error, 'assetId must look like "ast_excv01"');
    const cond = reqString(a.condition, { allowed: CONDITIONS, code: 'INVALID_CONDITION' });
    if ('error' in cond) return fail(cond.error, 'condition is required and must be one of: ' + CONDITIONS.join(', '));
    const x = this.assets.find((y: Asset) => y.id === id.value);
    if (!x) return fail('NOT_FOUND_ASSET', 'no asset ' + id.value + ' in this workspace');
    if (x.status !== 'maintenance') return fail('ASSET_NOT_IN_MAINTENANCE', x.id + ' is ' + x.status + ', not in maintenance');

    const open = this.maintenanceWindows(x.id);
    for (const m of open) {
      m.status = 'completed';
      m.conditionAfter = cond.value;
    }
    x.condition = cond.value;
    x.status = 'available';
    this.syncAssetStatuses();
    this.audit('completeMaintenance', x.id + ' back in service (' + cond.value + ')');
    return okWrite({ assetId: x.id, status: x.status, condition: x.condition, windowsClosed: open.length });
  },

  getMaintenanceLog(a) {
    const id = reqString(a.assetId, { pattern: ID_RE.asset, code: 'INVALID_ASSET_ID' });
    if ('error' in id) return fail(id.error, 'assetId must look like "ast_excv01"');
    const x = this.assets.find((y: Asset) => y.id === id.value);
    if (!x) return okRead({ found: false, assetId: id.value });
    const rows = this.maintenance.filter((m: Maintenance) => m.assetId === x.id);
    return okRead({ found: true, assetId: x.id, count: rows.length, maintenance: rows });
  },

  retireAsset(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const perm = this.permGate('fleet');
    if (perm) return fail(perm.error, perm.message);
    const id = reqString(a.assetId, { pattern: ID_RE.asset, code: 'INVALID_ASSET_ID' });
    if ('error' in id) return fail(id.error, 'assetId must look like "ast_excv01"');
    const x = this.assets.find((y: Asset) => y.id === id.value);
    if (!x) return fail('NOT_FOUND_ASSET', 'no asset ' + id.value + ' in this workspace');
    if (x.status === 'retired') return fail('ASSET_RETIRED', x.id + ' is already retired');
    if (x.status === 'out') return fail('ASSET_OUT_ON_RENTAL', x.id + ' is out on an active rental');
    const reserved = this.bookings.find((b: Booking) => b.assetId === x.id && ['pending', 'confirmed'].includes(b.status));
    if (reserved) return fail('ASSET_RESERVED', x.id + ' is reserved by ' + reserved.id + ' (' + reserved.startDate + '…' + reserved.endDate + ')');
    const hold = this.assetHold(x.id);
    if (hold) return fail('ASSET_ON_HOLD', x.id + ' is frozen by hold ' + hold.id + ': ' + hold.reason);

    if (!isConfirmed(a.confirmed))
      return probe('Retire ' + x.id + ' (' + x.name + ') permanently? It leaves the rentable fleet for good.',
        { assetId: x.id, name: x.name, condition: x.condition, irreversible: true });

    x.status = 'retired';
    this.audit('retireAsset', x.id + ' retired');
    return okWrite({ assetId: x.id, status: 'retired' });
  },

  transferAsset(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const perm = this.permGate('fleet');
    if (perm) return fail(perm.error, perm.message);
    const id = reqString(a.assetId, { pattern: ID_RE.asset, code: 'INVALID_ASSET_ID' });
    if ('error' in id) return fail(id.error, 'assetId must look like "ast_excv01"');
    const target = reqString(a.targetWorkspaceId, { pattern: ID_RE.workspace, code: 'INVALID_WORKSPACE_ID' });
    if ('error' in target) return fail(target.error, 'targetWorkspaceId must look like "ws_north02"');
    if (target.value === this.workspace.id) return fail('SAME_WORKSPACE', 'the destination is this workspace');
    const x = this.assets.find((y: Asset) => y.id === id.value);
    if (!x) return fail('NOT_FOUND_ASSET', 'no asset ' + id.value + ' in this workspace');
    if (x.status === 'retired') return fail('ASSET_RETIRED', x.id + ' is retired');
    if (x.status === 'out') return fail('ASSET_OUT_ON_RENTAL', x.id + ' is out on an active rental');
    const reserved = this.bookings.find((b: Booking) => b.assetId === x.id && ['pending', 'confirmed'].includes(b.status));
    if (reserved) return fail('ASSET_RESERVED', x.id + ' is reserved by ' + reserved.id + ' (' + reserved.startDate + '…' + reserved.endDate + ')');
    const hold = this.assetHold(x.id);
    if (hold) return fail('ASSET_ON_HOLD', x.id + ' is frozen by hold ' + hold.id + ': ' + hold.reason);

    if (!isConfirmed(a.confirmed))
      return probe('Transfer ' + x.id + ' (' + x.name + ') to workspace ' + target.value + '? It leaves this fleet.',
        { assetId: x.id, name: x.name, targetWorkspaceId: target.value, irreversible: true });

    this.assets = this.assets.filter((y: Asset) => y.id !== x.id);
    this.audit('transferAsset', x.id + ' transferred to ' + target.value);
    return okWrite({ assetId: x.id, transferredTo: target.value, remainingInFleet: this.assets.length });
  },

  // ── workspace admin ───────────────────────────────────────────────────────

  getWorkspace() {
    return okRead({
      workspace: {
        id: this.workspace.id, name: this.workspace.name, plan: this.workspace.plan,
        status: this.workspace.status, onboarded: this.workspace.onboarded,
      },
    });
  },

  getPlanUsage() {
    const lim = this.limits();
    const seatsUsed = this.members.length; // invited members occupy a seat (D12)
    const active = this.activeBookings().length;
    const held = this.depositFloatHeld();
    return okRead({
      plan: this.workspace.plan,
      seatsUsed, seatCap: lim.seats, atSeatCap: seatsUsed >= lim.seats,
      activeBookings: active, bookingCap: lim.bookings, atBookingCap: active >= lim.bookings,
      depositFloatHeld: held, depositFloatLimit: lim.float, depositFloatRemaining: money(lim.float - held),
    });
  },

  listMembers() {
    return okRead({
      count: this.members.length,
      members: this.members.map((m: Member) => ({ id: m.id, name: m.name, role: m.role, status: m.status })),
    });
  },

  getMember(a) {
    const id = optString(a.memberId, { pattern: ID_RE.member, code: 'INVALID_MEMBER_ID' });
    if ('error' in id) return fail(id.error, 'memberId must look like "mem_1001"');
    const wanted = 'value' in id ? id.value : this.actingMemberId;
    const m = this.members.find((x: Member) => x.id === wanted);
    if (!m) return okRead({ found: false, memberId: wanted });
    const caps = this.caps(m.role);
    return okRead({
      found: true, isActingUser: m.id === this.actingMemberId,
      member: {
        id: m.id, name: m.name, role: m.role, status: m.status,
        canManageMembers: caps.members, canMoveMoney: caps.money,
        canDispatch: caps.dispatch, canManageFleet: caps.fleet, canChangePlan: caps.plan,
      },
    });
  },

  inviteMember(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const perm = this.permGate('members');
    if (perm) return fail(perm.error, perm.message);
    const email = reqString(a.email, { code: 'MISSING_EMAIL' });
    if ('error' in email) return fail(email.error, 'email is required and must not be empty');
    const role = reqString(a.role, { allowed: ['admin', 'dispatcher', 'billing', 'viewer'], code: 'INVALID_ROLE' });
    if ('error' in role) return fail(role.error, 'role must be one of: admin, dispatcher, billing, viewer (a new invite cannot be owner)');
    if (!email.value.includes('@')) return fail('INVALID_EMAIL', 'email must contain "@"');
    if (this.members.find((m: Member) => m.email === email.value))
      return fail('MEMBER_ALREADY_EXISTS', email.value + ' is already a member of this workspace');
    const lim = this.limits();
    const seatsUsed = this.members.length; // invited members occupy a seat (D12)
    if (seatsUsed >= lim.seats)
      return fail('SEAT_CAP_REACHED', 'the ' + this.workspace.plan + ' plan allows ' + lim.seats
        + ' seats and ' + seatsUsed + ' are in use — remove a member or upgrade the plan');

    this.counters.member += 1;
    const mid = 'mem_' + this.counters.member;
    this.members.push({ id: mid, name: email.value.split('@')[0], role: role.value, status: 'invited', email: email.value });
    this.audit('inviteMember', mid + ' invited as ' + role.value);
    return okWrite({ memberId: mid, role: role.value, status: 'invited', seatsUsed: this.members.length, seatCap: lim.seats });
  },

  updateMemberRole(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const perm = this.permGate('members');
    if (perm) return fail(perm.error, perm.message);
    const id = reqString(a.memberId, { pattern: ID_RE.member, code: 'INVALID_MEMBER_ID' });
    if ('error' in id) return fail(id.error, 'memberId must look like "mem_1001"');
    const role = reqString(a.role, { allowed: ROLES, code: 'INVALID_ROLE' });
    if ('error' in role) return fail(role.error, 'role must be one of: ' + ROLES.join(', '));
    const m = this.members.find((x: Member) => x.id === id.value);
    if (!m) return fail('NOT_FOUND_MEMBER', 'no member ' + id.value + ' in this workspace');
    const owners = this.members.filter((x: Member) => x.role === 'owner' && x.status === 'active');
    if (m.role === 'owner' && role.value !== 'owner' && owners.length <= 1)
      return fail('SOLE_OWNER_PROTECTED', m.id + ' is the only owner — an owner cannot be demoted while they are the last one');
    if (m.role === role.value) return fail('NO_CHANGE', m.id + ' already has the role ' + role.value);

    // G-31 (gate #1): granting `owner` is a privilege escalation — owner is the only role that can
    // change the plan, and any admin holds canManageMembers. CONDITIONALLY two-step: every other
    // role change stays one-step.
    if (role.value === 'owner' && !isConfirmed(a.confirmed))
      return probe('Promote ' + m.id + ' (' + m.name + ') from ' + m.role + ' to OWNER? An owner can'
        + ' change the plan and can never be removed while they are the last one.',
        { memberId: m.id, name: m.name, previousRole: m.role, role: 'owner', privilegeEscalation: true });

    const previous = m.role;
    m.role = role.value;
    this.audit('updateMemberRole', m.id + ' ' + previous + ' → ' + role.value);
    return okWrite({ memberId: m.id, previousRole: previous, role: m.role });
  },

  removeMember(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const perm = this.permGate('members');
    if (perm) return fail(perm.error, perm.message);
    const id = reqString(a.memberId, { pattern: ID_RE.member, code: 'INVALID_MEMBER_ID' });
    if ('error' in id) return fail(id.error, 'memberId must look like "mem_1001"');
    const m = this.members.find((x: Member) => x.id === id.value);
    if (!m) return fail('NOT_FOUND_MEMBER', 'no member ' + id.value + ' in this workspace');
    const owners = this.members.filter((x: Member) => x.role === 'owner' && x.status === 'active');
    if (m.role === 'owner' && owners.length <= 1)
      return fail('SOLE_OWNER_PROTECTED', m.id + ' is the only owner — the sole owner can never be removed');

    if (!isConfirmed(a.confirmed))
      return probe('Remove ' + m.id + ' (' + m.name + ', ' + m.role + ') from the workspace? Their seat is freed and the removal cannot be undone.',
        { memberId: m.id, name: m.name, role: m.role, irreversible: true });

    this.members = this.members.filter((x: Member) => x.id !== m.id);
    const lim = this.limits();
    this.audit('removeMember', m.id + ' removed');
    return okWrite({ memberId: m.id, removed: true, seatsUsed: this.members.length, seatCap: lim.seats });
  },

  changePlan(a) {
    const gate = this.writeGate();
    if (gate) return fail(gate.error, gate.message);
    const perm = this.permGate('plan');
    if (perm) return fail(perm.error, perm.message);
    const plan = reqString(a.plan, { allowed: PLANS, code: 'INVALID_PLAN' });
    if ('error' in plan) return fail(plan.error, 'plan must be one of: ' + PLANS.join(', '));
    if (plan.value === this.workspace.plan) return fail('NO_CHANGE', 'the workspace is already on the ' + plan.value + ' plan');
    const next = PLAN_LIMITS[plan.value as keyof typeof PLAN_LIMITS];
    const seatsUsed = this.members.length; // invited members occupy a seat (D12)
    const active = this.activeBookings().length;
    const held = this.depositFloatHeld();
    if (seatsUsed > next.seats)
      return fail('PLAN_DOWNGRADE_BLOCKED', 'the ' + plan.value + ' plan allows ' + next.seats + ' seats but ' + seatsUsed + ' are in use');
    if (active > next.bookings)
      return fail('PLAN_DOWNGRADE_BLOCKED', 'the ' + plan.value + ' plan allows ' + next.bookings + ' active bookings but ' + active + ' are active');
    if (held > next.float)
      return fail('PLAN_DOWNGRADE_BLOCKED', 'the ' + plan.value + ' plan caps held deposits at ' + next.float + ' but ' + held + ' is held');

    if (!isConfirmed(a.confirmed))
      return probe('Change the workspace plan from ' + this.workspace.plan + ' to ' + plan.value
        + '? Seat cap ' + this.limits().seats + ' → ' + next.seats + ', booking cap ' + this.limits().bookings
        + ' → ' + next.bookings + '. This may change billing.',
        { from: this.workspace.plan, to: plan.value, seatCap: next.seats, bookingCap: next.bookings, depositFloatLimit: next.float });

    const previous = this.workspace.plan;
    this.workspace.plan = plan.value;
    this.audit('changePlan', previous + ' → ' + plan.value);
    return okWrite({ previousPlan: previous, plan: this.workspace.plan, seatCap: next.seats, bookingCap: next.bookings, depositFloatLimit: next.float });
  },

  getAuditLog(a) {
    const action = optString(a.action, { code: null });
    let limit = 20;
    if (a.limit !== undefined) {
      if (typeof a.limit !== 'number' || !Number.isInteger(a.limit) || a.limit < 1 || a.limit > 100)
        return fail('INVALID_LIMIT', 'limit must be an integer between 1 and 100');
      limit = a.limit;
    }
    const rows = this.auditLog
      .filter((e: { action: string }) => ('value' in action ? e.action === action.value : true))
      .slice(-limit)
      .reverse();
    return okRead({ actionFilter: 'value' in action ? action.value : null, count: rows.length, entries: rows });
  },
};

/** Inverse of toDays — pure civil-date arithmetic, no Date object. */
function fromDays(z: number): string {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const year = m <= 2 ? y + 1 : y;
  return String(year).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

/** The runner's world seam. */
export function worldFactory(preset: string = 'default'): AtlasWorld {
  return new AtlasWorld(preset);
}

export default AtlasWorld;
