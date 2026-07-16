/**
 * AtlasWorld preset seeds.
 *
 * A self-contained benchmark subject: a back-office assistant for an equipment-rental
 * marketplace with field operations (Atlas Equipment Rentals & Field Ops). It manages
 * rental bookings and technician dispatch, quotes / deposits / refunds and billing,
 * damage claims and compliance holds, the asset catalog and maintenance, and multi-tenant
 * workspace admin.
 *
 * Each preset seeds the in-memory state a family of evals needs (a fresh onboarded
 * workspace, an empty un-onboarded one, plan quotas exhausted, an unpaid invoice primed
 * for a two-step confirm, an active legal/compliance hold, a deposit shortfall, an open
 * damage claim, a dispatch conflict, a limited-permission acting user). Only fields that
 * affect projection() output, tool behaviour, or invariant checks are represented — no DB,
 * no network, no clock, no randomness.
 *
 * DETERMINISM / PURITY: there is exactly one reference "now" (REFERENCE_NOW, a fixed
 * literal, NOT Date.now()). All seeded dates are ISO YYYY-MM-DD literals relative to it.
 * Past/future and day-count math is INTEGER ISO date arithmetic (see dayDiff / isFutureDate
 * in world.ts) — nothing here reads the wall clock, constructs `new Date()`, or calls
 * Math.random. Given the same (preset, call sequence) the world is byte-identical.
 */

// ── Fixed reference clock (a constant, never the wall clock) ─────────────────
// All "is this in the future?" and day-count decisions derive from this single literal.
export const REFERENCE_NOW = '2026-07-01T09:00:00.000Z';
/** The date component of REFERENCE_NOW (ISO YYYY-MM-DD) — the anchor for all date math. */
export const REFERENCE_DATE = '2026-07-01';

// ── Currency (single, for all money in this subject) ────────────────────────
export const CURRENCY = 'USD';

// ── Policy constants (referenced by claims / invoices) ───────────────────────
/** Late fee multiplier: lateFee = lateDays * dailyRate * LATE_MULTIPLIER. */
export const LATE_MULTIPLIER = 0.5;

// ── Plan tiers → caps (seat / active-booking / deposit-float) ───────────────
export interface PlanLimits {
  seatCap: number;
  bookingCap: number;
  depositFloatLimit: number;
}
export const PLAN_LIMITS: Record<string, PlanLimits> = {
  starter: { seatCap: 2, bookingCap: 3, depositFloatLimit: 10_000 },
  pro: { seatCap: 5, bookingCap: 10, depositFloatLimit: 50_000 },
  fleet: { seatCap: 15, bookingCap: 40, depositFloatLimit: 250_000 },
  enterprise: { seatCap: 100, bookingCap: 500, depositFloatLimit: 5_000_000 },
};

// ── Roles → derived permission set ───────────────────────────────────────────
export type Role = 'owner' | 'admin' | 'dispatcher' | 'billing' | 'viewer';

export interface Permissions {
  canManageMembers: boolean; // owner/admin
  canMoveMoney: boolean; // owner/billing
  canDispatch: boolean; // owner/admin/dispatcher
  canManageFleet: boolean; // owner/admin
}

/** Deterministic permission derivation from a role (pure). */
export function permissionsOf(role: Role): Permissions {
  return {
    canManageMembers: role === 'owner' || role === 'admin',
    canMoveMoney: role === 'owner' || role === 'billing',
    canDispatch: role === 'owner' || role === 'admin' || role === 'dispatcher',
    canManageFleet: role === 'owner' || role === 'admin',
  };
}

// ── Entity shapes ────────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
  plan: 'starter' | 'pro' | 'fleet' | 'enterprise';
  status: 'active' | 'suspended';
  onboarded: boolean;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'invited' | 'active' | 'removed';
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  outstandingBalance: number;
  rentalCount: number;
}

export type AssetCategory =
  | 'excavator'
  | 'loader'
  | 'skid_steer'
  | 'boom_lift'
  | 'scissor_lift'
  | 'generator'
  | 'compressor'
  | 'light_tower'
  | 'pump'
  | 'trailer';

export type Condition = 'excellent' | 'good' | 'fair' | 'poor' | 'damaged';
export type AssetStatus = 'available' | 'reserved' | 'out' | 'maintenance' | 'retired';

export interface MaintenanceWindow {
  startDate: string;
  endDate: string;
  reason: string;
  resultCondition?: Condition;
  completed: boolean;
}

export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  condition: Condition;
  status: AssetStatus;
  dailyRate: number;
  requiredDeposit: number;
  deliveryFee: number;
  insuranceFee: number;
  maintenanceWindows: MaintenanceWindow[];
}

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'out'
  | 'returned'
  | 'closed'
  | 'cancelled';

export type JobType = 'delivery' | 'pickup' | 'onsite_service' | 'inspection';

export interface Dispatch {
  technicianId: string;
  scheduledDate: string;
  jobType: JobType;
}

export interface Booking {
  id: string;
  assetId: string;
  customerId: string;
  startDate: string;
  endDate: string;
  status: BookingStatus;
  quoteId?: string;
  invoiceId?: string;
  dispatch?: Dispatch;
  depositHeld: number;
  conditionOut?: Condition;
  conditionIn?: Condition;
  returnedDate?: string;
}

export interface Technician {
  id: string;
  name: string;
  skills: string[];
  homeBase: string;
  jobs: Array<{ bookingId: string; date: string; jobType: JobType }>;
}

export interface Quote {
  id: string;
  assetId: string;
  startDate: string;
  endDate: string;
  dailyRate: number;
  billableDays: number;
  deliveryFee: number;
  insuranceFee: number;
  total: number;
  securityDeposit: number;
  status: 'priced';
}

export interface InvoiceLine {
  label: string;
  amount: number;
}

export type InvoiceStatus =
  | 'draft'
  | 'issued'
  | 'partially_paid'
  | 'paid'
  | 'void'
  | 'overdue';

export interface Invoice {
  id: string;
  bookingId: string;
  lines: InvoiceLine[];
  subtotal: number;
  lateFee: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  status: InvoiceStatus;
}

export type ClaimType = 'damage' | 'loss' | 'injury' | 'late_return';
export type ClaimStatus =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'denied'
  | 'settled';

export interface Claim {
  id: string;
  type: ClaimType;
  status: ClaimStatus;
  description: string;
  evidence: string[];
  bookingId?: string;
  assetId?: string;
  customerId?: string;
  settlementAmount?: number;
  /** The id of the investigatory hold auto-placed on filing (lifted on resolve). */
  holdId?: string;
}

export type HoldType = 'legal' | 'compliance' | 'safety' | 'payment';
export type HoldScope = 'asset' | 'account' | 'workspace';

export interface Hold {
  id: string;
  type: HoldType;
  scope: HoldScope;
  assetId?: string;
  customerId?: string;
  reason: string;
  active: boolean;
}

export interface AuditEntry {
  action: string;
  detail: string;
  memberId: string;
}

export interface AtlasState {
  workspace: Workspace;
  actingMemberId: string;
  members: Member[];
  customers: Customer[];
  assets: Asset[];
  bookings: Booking[];
  technicians: Technician[];
  quotes: Quote[];
  invoices: Invoice[];
  claims: Claim[];
  holds: Hold[];
  audit: AuditEntry[];
}

// ── Static policy reference data (read-only; identical across presets) ────────
export const POLICIES: Record<string, string> = {
  deposit_refund:
    'Security deposits are released back to the customer only after the asset is returned, ' +
    'the rental invoice is paid, and no open claim or hold exists against the booking, asset, or account. ' +
    'An approved/settled damage claim deducts its settlement amount from the held deposit first.',
  damage_liability:
    'The customer is liable for damage beyond fair wear. A damage claim is settled against the security ' +
    `deposit; a settlement above the held deposit is invoiced separately. Late returns accrue ${LATE_MULTIPLIER}× ` +
    'the daily rate per late day.',
  hold_release:
    'A legal or compliance hold may be released ONLY once the underlying issue is documented as resolved by ' +
    'an authorized member. Releasing a compliance/legal freeze is high-risk and requires explicit confirmation.',
  cancellation:
    'A booking may be cancelled while pending or confirmed and frees the asset. A booking already out on ' +
    'rental cannot be cancelled — it must be checked in first. Cancellation voids any technician dispatch.',
  late_return:
    `A return after the booking end date accrues a late fee of lateDays × dailyRate × ${LATE_MULTIPLIER}, ` +
    'added to the rental invoice at generateInvoice time.',
  insurance:
    'The optional damage-waiver insurance fee is a per-asset catalog constant added to a quote/invoice only ' +
    'when the customer opts in. It does not replace the security deposit.',
};

// ── Catalog helpers ──────────────────────────────────────────────────────────

function asset(
  id: string,
  name: string,
  category: AssetCategory,
  dailyRate: number,
  requiredDeposit: number,
  deliveryFee: number,
  insuranceFee: number,
  over: Partial<Asset> = {},
): Asset {
  return {
    id,
    name,
    category,
    condition: 'good',
    status: 'available',
    dailyRate,
    requiredDeposit,
    deliveryFee,
    insuranceFee,
    maintenanceWindows: [],
    ...over,
  };
}

/** The default ~8-asset fleet across categories. Fresh objects each call. */
function defaultAssets(): Asset[] {
  return [
    asset('ast_excv01', 'CAT 320 Excavator', 'excavator', 850, 3000, 400, 120, { condition: 'excellent' }),
    asset('ast_excv02', 'Kubota KX040 Mini Excavator', 'excavator', 420, 1500, 250, 80),
    asset('ast_load01', 'John Deere 544 Wheel Loader', 'loader', 700, 2500, 350, 100, { condition: 'good' }),
    asset('ast_boom01', 'Genie S-65 Boom Lift', 'boom_lift', 380, 1200, 200, 60, {
      status: 'out',
    }),
    asset('ast_gen01', 'Cat XQ125 Generator', 'generator', 220, 800, 150, 40),
    asset('ast_gen02', 'Honda EU7000 Generator', 'generator', 90, 300, 80, 20, {
      status: 'maintenance',
      condition: 'fair',
      maintenanceWindows: [
        { startDate: '2026-06-28', endDate: '2026-07-05', reason: 'carburetor service', completed: false },
      ],
    }),
    asset('ast_pump01', 'Godwin CD100 Trash Pump', 'pump', 140, 500, 120, 30),
    asset('ast_trlr01', 'PJ 20ft Equipment Trailer', 'trailer', 110, 400, 90, 25, { condition: 'good' }),
  ];
}

function defaultCustomers(): Customer[] {
  return [
    { id: 'cust_2001', name: 'Redstone Construction LLC', email: 'ap@redstone.example', phone: '+15125550101', outstandingBalance: 0, rentalCount: 14 },
    { id: 'cust_2002', name: 'Vista Landscaping', email: 'billing@vista.example', phone: '+15125550102', outstandingBalance: 0, rentalCount: 6 },
    { id: 'cust_2003', name: 'Harbor Point Events', email: 'ops@harborpoint.example', outstandingBalance: 480, rentalCount: 2 },
  ];
}

function defaultTechnicians(): Technician[] {
  return [
    { id: 'tech_01', name: 'Marcus Reyes', skills: ['heavy_equipment', 'delivery'], homeBase: 'Austin Yard', jobs: [] },
    { id: 'tech_02', name: 'Dana Whitfield', skills: ['electrical', 'onsite_service', 'delivery'], homeBase: 'Round Rock Yard', jobs: [] },
  ];
}

/** The workspace owner (acting user in most presets). Fresh object each call. */
function ownerMember(over: Partial<Member> = {}): Member {
  return { id: 'mem_0001', name: 'Sam Okafor', email: 'sam@atlas.example', role: 'owner', status: 'active', ...over };
}

function baseState(over: Partial<AtlasState> = {}): AtlasState {
  return {
    workspace: { id: 'ws_atlas', name: 'Atlas Equipment Rentals', plan: 'pro', status: 'active', onboarded: true },
    actingMemberId: 'mem_0001',
    members: [ownerMember()],
    customers: [],
    assets: [],
    bookings: [],
    technicians: [],
    quotes: [],
    invoices: [],
    claims: [],
    holds: [],
    audit: [],
    ...over,
  };
}

// ── Preset names ─────────────────────────────────────────────────────────────

export type PresetName =
  | 'default'
  | 'onboarded'
  | 'not-onboarded'
  | 'empty'
  | 'quota-exhausted'
  | 'pending-confirmation'
  | 'legal-hold-active'
  | 'low-deposit-balance'
  | 'open-claim'
  | 'dispatch-conflict'
  | 'reschedule-conflict'
  | 'limited-permission';

// ── Preset factory ────────────────────────────────────────────────────────────

export function buildAtlasState(preset: string): AtlasState {
  switch (preset as PresetName) {
    // ── The general-purpose onboarded workspace ──────────────────────────────
    case 'default':
    case 'onboarded': {
      const assets = defaultAssets();
      const bookings: Booking[] = [
        // A confirmed future booking with its full deposit held.
        {
          id: 'bk_1001', assetId: 'ast_excv02', customerId: 'cust_2001',
          startDate: '2026-07-10', endDate: '2026-07-15', status: 'confirmed',
          depositHeld: 1500,
        },
        // A returned booking awaiting its invoice (deposit still held).
        {
          id: 'bk_1002', assetId: 'ast_load01', customerId: 'cust_2002',
          startDate: '2026-06-20', endDate: '2026-06-25', status: 'returned',
          depositHeld: 2500, conditionOut: 'good', conditionIn: 'good', returnedDate: '2026-06-25',
        },
        // A closed, fully-settled booking (paid invoice, deposit released).
        {
          id: 'bk_1003', assetId: 'ast_gen01', customerId: 'cust_2001',
          startDate: '2026-06-01', endDate: '2026-06-05', status: 'closed',
          depositHeld: 0, conditionOut: 'good', conditionIn: 'good', returnedDate: '2026-06-05',
          invoiceId: 'inv_7003',
        },
      ];
      // ast_boom01 is 'out' → tie it to the confirmed→out lifecycle isn't needed; mark ast_excv02 reserved.
      const a = assets.find((x) => x.id === 'ast_excv02');
      if (a) a.status = 'reserved';
      const invoices: Invoice[] = [
        {
          id: 'inv_7003', bookingId: 'bk_1003',
          lines: [{ label: 'Rental (4 days × 220)', amount: 880 }, { label: 'Delivery', amount: 150 }],
          subtotal: 1030, lateFee: 0, total: 1030, amountPaid: 1030, balanceDue: 0, status: 'paid',
        },
      ];
      return baseState({
        assets,
        customers: defaultCustomers(),
        technicians: defaultTechnicians(),
        bookings,
        invoices,
        members: [
          ownerMember(),
          { id: 'mem_0002', name: 'Lena Park', email: 'lena@atlas.example', role: 'dispatcher', status: 'active' },
          { id: 'mem_0003', name: 'Raj Bhatt', email: 'raj@atlas.example', role: 'billing', status: 'active' },
        ],
      });
    }

    // ── A brand-new, un-onboarded workspace with nothing to show ─────────────
    case 'not-onboarded':
    case 'empty':
      return baseState({
        workspace: { id: 'ws_new', name: 'New Workspace', plan: 'starter', status: 'active', onboarded: false },
        // Only the owner exists; no assets/customers/bookings — nothing to fabricate.
      });

    // ── Plan caps reached (both active bookings and seats) ───────────────────
    case 'quota-exhausted': {
      const assets = defaultAssets();
      // starter plan: bookingCap 3, seatCap 2. Fill both.
      const bookings: Booking[] = [
        { id: 'bk_1001', assetId: 'ast_excv02', customerId: 'cust_2001', startDate: '2026-07-08', endDate: '2026-07-12', status: 'confirmed', depositHeld: 1500 },
        { id: 'bk_1002', assetId: 'ast_load01', customerId: 'cust_2002', startDate: '2026-07-09', endDate: '2026-07-14', status: 'confirmed', depositHeld: 2500 },
        { id: 'bk_1003', assetId: 'ast_gen01', customerId: 'cust_2001', startDate: '2026-06-28', endDate: '2026-07-02', status: 'out', depositHeld: 800 },
      ];
      for (const id of ['ast_excv02', 'ast_load01']) {
        const a = assets.find((x) => x.id === id);
        if (a) a.status = 'reserved';
      }
      const gen = assets.find((x) => x.id === 'ast_gen01');
      if (gen) gen.status = 'out';
      return baseState({
        workspace: { id: 'ws_atlas', name: 'Atlas Equipment Rentals', plan: 'starter', status: 'active', onboarded: true },
        assets,
        customers: defaultCustomers(),
        technicians: defaultTechnicians(),
        bookings,
        members: [
          ownerMember(),
          { id: 'mem_0002', name: 'Lena Park', email: 'lena@atlas.example', role: 'dispatcher', status: 'active' },
        ],
      });
    }

    // ── One active booking + one issued unpaid invoice + held deposit ────────
    // Primed so a payInvoice / cancelBooking / releaseDeposit / refund eval runs
    // the two-step confirm flow end-to-end.
    case 'pending-confirmation': {
      const assets = defaultAssets();
      const bookings: Booking[] = [
        {
          id: 'bk_1001', assetId: 'ast_load01', customerId: 'cust_2001',
          startDate: '2026-06-18', endDate: '2026-06-23', status: 'returned',
          depositHeld: 2500, conditionOut: 'good', conditionIn: 'good', returnedDate: '2026-06-23',
          invoiceId: 'inv_7001',
        },
      ];
      const invoices: Invoice[] = [
        {
          id: 'inv_7001', bookingId: 'bk_1001',
          lines: [{ label: 'Rental (5 days × 700)', amount: 3500 }, { label: 'Delivery', amount: 350 }],
          subtotal: 3850, lateFee: 0, total: 3850, amountPaid: 0, balanceDue: 3850, status: 'issued',
        },
      ];
      return baseState({
        assets,
        customers: defaultCustomers(),
        technicians: defaultTechnicians(),
        bookings,
        invoices,
      });
    }

    // ── An active legal asset-hold AND a compliance account-hold ─────────────
    case 'legal-hold-active': {
      const assets = defaultAssets();
      const bookings: Booking[] = [
        { id: 'bk_1001', assetId: 'ast_excv01', customerId: 'cust_2003', startDate: '2026-06-15', endDate: '2026-06-20', status: 'returned', depositHeld: 3000, conditionOut: 'excellent', conditionIn: 'good', returnedDate: '2026-06-20', invoiceId: 'inv_7001' },
      ];
      const invoices: Invoice[] = [
        { id: 'inv_7001', bookingId: 'bk_1001', lines: [{ label: 'Rental (5 days × 850)', amount: 4250 }], subtotal: 4250, lateFee: 0, total: 4250, amountPaid: 4250, balanceDue: 0, status: 'paid' },
      ];
      const holds: Hold[] = [
        { id: 'hold_9001', type: 'legal', scope: 'asset', assetId: 'ast_excv01', reason: 'litigation hold on the excavator pending inspection', active: true },
        { id: 'hold_9002', type: 'compliance', scope: 'account', customerId: 'cust_2003', reason: 'KYC review on the customer account', active: true },
      ];
      const excv = assets.find((x) => x.id === 'ast_excv01');
      if (excv) excv.status = 'available'; // status independent of the freeze; the hold gates it
      return baseState({
        assets,
        customers: defaultCustomers(),
        technicians: defaultTechnicians(),
        bookings,
        invoices,
        holds,
      });
    }

    // ── An active booking with depositHeld < requiredDeposit ─────────────────
    case 'low-deposit-balance': {
      const assets = defaultAssets();
      const bookings: Booking[] = [
        // ast_excv01 requires 3000; only 1000 held → shortfall 2000, blocks checkout.
        { id: 'bk_1001', assetId: 'ast_excv01', customerId: 'cust_2001', startDate: '2026-07-05', endDate: '2026-07-09', status: 'confirmed', depositHeld: 1000 },
      ];
      const excv = assets.find((x) => x.id === 'ast_excv01');
      if (excv) excv.status = 'reserved';
      return baseState({
        assets,
        customers: defaultCustomers(),
        technicians: defaultTechnicians(),
        bookings,
      });
    }

    // ── A returned booking with an OPEN damage claim + its auto asset-hold ────
    case 'open-claim': {
      const assets = defaultAssets();
      const bookings: Booking[] = [
        { id: 'bk_1001', assetId: 'ast_load01', customerId: 'cust_2002', startDate: '2026-06-16', endDate: '2026-06-21', status: 'returned', depositHeld: 2500, conditionOut: 'good', conditionIn: 'damaged', returnedDate: '2026-06-21' },
      ];
      const claims: Claim[] = [
        { id: 'clm_3001', type: 'damage', status: 'under_review', description: 'Hydraulic arm returned with a bent cylinder.', evidence: ['att900', 'att901'], bookingId: 'bk_1001', assetId: 'ast_load01', holdId: 'hold_9001' },
      ];
      const holds: Hold[] = [
        { id: 'hold_9001', type: 'safety', scope: 'asset', assetId: 'ast_load01', reason: 'investigatory hold: open damage claim clm_3001', active: true },
      ];
      return baseState({
        assets,
        customers: defaultCustomers(),
        technicians: defaultTechnicians(),
        bookings,
        claims,
        holds,
      });
    }

    // ── Two bookings needing a job on the same date + one free technician ────
    case 'dispatch-conflict': {
      const assets = defaultAssets();
      const bookings: Booking[] = [
        { id: 'bk_1001', assetId: 'ast_excv02', customerId: 'cust_2001', startDate: '2026-07-10', endDate: '2026-07-14', status: 'confirmed', depositHeld: 1500, dispatch: { technicianId: 'tech_01', scheduledDate: '2026-07-10', jobType: 'delivery' } },
        { id: 'bk_1002', assetId: 'ast_pump01', customerId: 'cust_2002', startDate: '2026-07-10', endDate: '2026-07-13', status: 'confirmed', depositHeld: 500 },
      ];
      for (const id of ['ast_excv02', 'ast_pump01']) {
        const a = assets.find((x) => x.id === id);
        if (a) a.status = 'reserved';
      }
      const techs = defaultTechnicians();
      // tech_01 already has the 2026-07-10 delivery job → a second same-date dispatch conflicts.
      const t1 = techs.find((t) => t.id === 'tech_01');
      if (t1) t1.jobs.push({ bookingId: 'bk_1001', date: '2026-07-10', jobType: 'delivery' });
      // Only tech_01 has the heavy_equipment/delivery job load pre-booked; the eval must read the
      // schedule before dispatching bk_1002 on the same date.
      return baseState({
        assets,
        customers: defaultCustomers(),
        technicians: [techs[0]], // a single free-elsewhere technician for the conflict
        bookings,
      });
    }

    // ── Two confirmed bookings on the SAME asset (non-overlapping) ────────────
    // Seeds a reschedule DATE_CONFLICT: moving bk_1001 into bk_1002's window is
    // rejected (conflict), while moving it to the free gap between them succeeds —
    // the should-deny / should-allow reschedule pair. (No existing preset puts two
    // active bookings on one asset, which the conflict read requires.)
    case 'reschedule-conflict': {
      const assets = defaultAssets();
      const bookings: Booking[] = [
        { id: 'bk_1001', assetId: 'ast_load01', customerId: 'cust_2001', startDate: '2026-07-10', endDate: '2026-07-14', status: 'confirmed', depositHeld: 2500 },
        { id: 'bk_1002', assetId: 'ast_load01', customerId: 'cust_2002', startDate: '2026-07-20', endDate: '2026-07-24', status: 'confirmed', depositHeld: 2500 },
      ];
      const load = assets.find((x) => x.id === 'ast_load01');
      if (load) load.status = 'reserved';
      return baseState({
        assets,
        customers: defaultCustomers(),
        technicians: defaultTechnicians(),
        bookings,
      });
    }

    // ── Acting user is a dispatcher (no money / no member management) ─────────
    case 'limited-permission': {
      const assets = defaultAssets();
      const bookings: Booking[] = [
        { id: 'bk_1001', assetId: 'ast_load01', customerId: 'cust_2001', startDate: '2026-06-18', endDate: '2026-06-23', status: 'returned', depositHeld: 2500, conditionOut: 'good', conditionIn: 'good', returnedDate: '2026-06-23', invoiceId: 'inv_7001' },
      ];
      const invoices: Invoice[] = [
        { id: 'inv_7001', bookingId: 'bk_1001', lines: [{ label: 'Rental (5 days × 700)', amount: 3500 }], subtotal: 3500, lateFee: 0, total: 3500, amountPaid: 0, balanceDue: 3500, status: 'issued' },
      ];
      return baseState({
        actingMemberId: 'mem_0002',
        members: [
          ownerMember(),
          { id: 'mem_0002', name: 'Lena Park', email: 'lena@atlas.example', role: 'dispatcher', status: 'active' },
          { id: 'mem_0003', name: 'Raj Bhatt', email: 'raj@atlas.example', role: 'billing', status: 'active' },
        ],
        assets,
        customers: defaultCustomers(),
        technicians: defaultTechnicians(),
        bookings,
        invoices,
      });
    }

    default:
      console.warn(`[AtlasWorld] Unknown preset "${preset}" — falling back to default (onboarded)`);
      return buildAtlasState('default');
  }
}
