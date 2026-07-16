/**
 * AtlasWorld — deterministic in-memory fake tool layer for the "atlas" benchmark subject
 * (Atlas Equipment Rentals & Field Ops: an equipment-rental marketplace + field-operations
 * back-office assistant).
 *
 * Implements the structural `DomainWorld` contract the runner consumes:
 *   exec(name, args)             — dispatch a tool, log the call, return a result
 *   readonly toolCalls[]         — { name, args, result, tookEffect }
 *   readonly sseActions[]        — { type, payload } UI side-effects
 *   advanceTurn()                — flip the ONE pending between-turn state (claim triage)
 *   ingestAttachment(url)        — mint a stable label for an uploaded file
 *   projection()                 — guard-readable snapshot of current state
 *
 * PURITY: no I/O, no Date.now(), no `new Date()`, no Math.random(), no fetch. The only "clock"
 * is the fixed literal REFERENCE_DATE ('2026-07-01'); every future/past decision is a string
 * compare of ISO YYYY-MM-DD dates and every day-count is INTEGER civil-date arithmetic
 * (days-from-civil, below). Money is fixed-decimal arithmetic on whole/dollar amounts — no
 * float drift beyond the seeded fixed values. Given the same (preset, call sequence) the world
 * is byte-identical every run.
 *
 * Two-step destructive ops: confirmed=false (or omitted) → a side-effect-free probe result that
 * relays a confirmation prompt; confirmed=true → the mutation. advanceTurn() NEVER auto-finishes
 * a user-gated two-turn action (it only triages submitted claims → under_review).
 *
 * Terminal tools (replyToUser / askUser) are the RUNNER's — absent from TOOL_DEFS, no-ops here.
 */

import type { AgentWorld } from 'looprun';
import {
  buildAtlasState,
  permissionsOf,
  PLAN_LIMITS,
  POLICIES,
  LATE_MULTIPLIER,
  CURRENCY,
  REFERENCE_DATE,
  type AtlasState,
  type Asset,
  type AssetCategory,
  type Booking,
  type Claim,
  type Condition,
  type Customer,
  type Hold,
  type HoldScope,
  type HoldType,
  type Invoice,
  type JobType,
  type Member,
  type Permissions,
  type Quote,
  type Role,
  type Technician,
  type Workspace,
} from './presets.js';

// ── Call log entry (mirrors what the bench adapter reads) ────────────────────

export interface AtlasToolCallEntry {
  name: string;
  args: unknown;
  result: unknown;
  /** true when the call actually mutated durable state; false for reads / probes / gated no-ops. */
  tookEffect: boolean;
}

// Read-only tools never take effect; listed once so tookEffect stays declarative.
const READ_ONLY_TOOLS = new Set([
  'checkAvailability', 'listBookings', 'getBooking', 'listTechnicians', 'getTechnicianSchedule',
  'getQuote', 'listInvoices', 'getInvoice', 'getDepositBalance', 'listClaims', 'getClaim',
  'listHolds', 'listCustomers', 'getCustomer', 'lookupPolicy', 'listAssets', 'getAsset',
  'getMaintenanceLog', 'getWorkspace', 'getPlanUsage', 'listMembers', 'getMember', 'getAuditLog',
]);

// Category → asset-id short code (ids are minted human-echoable: ast_excv02, ast_gen03…).
const CATEGORY_SHORT: Record<AssetCategory, string> = {
  excavator: 'excv', loader: 'load', skid_steer: 'skid', boom_lift: 'boom', scissor_lift: 'scis',
  generator: 'gen', compressor: 'comp', light_tower: 'lite', pump: 'pump', trailer: 'trlr',
};

// ── Pure integer civil-date math (no new Date()) ─────────────────────────────
// days-from-civil (Howard Hinnant): a serial day number for an ISO YYYY-MM-DD date.
function daysFromCivil(iso: string): number {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
/** Integer day difference a − b (both ISO YYYY-MM-DD). */
function dayDiff(a: string, b: string): number {
  return daysFromCivil(a) - daysFromCivil(b);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class AtlasWorld {
  readonly toolCalls: AtlasToolCallEntry[] = [];
  readonly sseActions: Array<{ type: string; payload: Record<string, unknown> }> = [];

  private _state: AtlasState;
  private _seq = 0;
  private _attachmentSeq = 0;

  constructor(preset: string, _seed?: number) {
    this._state = buildAtlasState(preset);
  }

  // ── DomainWorld API ─────────────────────────────────────────────────────────

  async exec(name: string, args: Record<string, unknown>): Promise<unknown> {
    const a = args ?? {};
    const result = this._dispatch(name, a);
    const tookEffect = this._didTakeEffect(name, result);
    this.toolCalls.push({ name, args: a, result, tookEffect });
    return result;
  }

  /**
   * Between-turn progression. The ONLY flip: every claim still `submitted` advances to
   * `under_review` (triage happened). NEVER settles a user-gated two-step action.
   */
  advanceTurn(): void {
    for (const c of this._state.claims) {
      if (c.status === 'submitted') c.status = 'under_review';
    }
  }

  /** Ingest a user-uploaded attachment; mints a stable, collision-free label. */
  ingestAttachment(_url: string): string {
    return `att${String(900 + this._attachmentSeq++).padStart(3, '0')}`;
  }

  /**
   * Guard-readable projection — the dotted, serialisable scalars a deterministic check reads.
   * Reads never mutate. Keys mirror WORLD-MODEL.md exactly.
   */
  projection(): Record<string, unknown> {
    const s = this._state;
    const ws = s.workspace;
    const acting = this._member(s.actingMemberId);
    const role: Role = acting ? acting.role : 'viewer';
    const perm = permissionsOf(role);
    const limits = PLAN_LIMITS[ws.plan] ?? PLAN_LIMITS.starter;

    const activeBookings = s.bookings.filter((b) => b.status === 'confirmed' || b.status === 'out');
    const seatsUsed = s.members.filter((m) => m.status !== 'removed').length;
    const activeHolds = s.holds.filter((h) => h.active);

    const frozenAssetIds = [
      ...new Set(activeHolds.filter((h) => h.scope === 'asset' && h.assetId).map((h) => h.assetId as string)),
    ];
    const frozenCustomerIds = [
      ...new Set(activeHolds.filter((h) => h.scope === 'account' && h.customerId).map((h) => h.customerId as string)),
    ];
    const workspaceFrozen = activeHolds.some((h) => h.scope === 'workspace');
    const accountFrozen = workspaceFrozen || frozenCustomerIds.length > 0;

    const depositHeldTotal = activeBookings.reduce((n, b) => n + b.depositHeld, 0);
    const depositRequiredTotal = activeBookings.reduce((n, b) => n + this._requiredDeposit(b), 0);
    const depositShortfall = activeBookings.reduce(
      (n, b) => n + Math.max(0, this._requiredDeposit(b) - b.depositHeld),
      0,
    );

    const outstandingInvoices = s.invoices.filter(
      (i) => i.status === 'issued' || i.status === 'partially_paid' || i.status === 'overdue',
    );
    const openClaims = s.claims.filter((c) => c.status === 'submitted' || c.status === 'under_review');
    const approvableClaims = s.claims.filter((c) => c.status === 'under_review');

    const activeBookingsUsed = activeBookings.length;
    const seatCap = limits.seatCap;
    const bookingCap = limits.bookingCap;

    return {
      // Tenant / onboarding
      onboarded: ws.onboarded,
      workspaceStatus: ws.status,
      workspaceFrozen,
      // Permissions (acting user)
      actingRole: role,
      canManageMembers: perm.canManageMembers,
      canMoveMoney: perm.canMoveMoney,
      canDispatch: perm.canDispatch,
      canManageFleet: perm.canManageFleet,
      // Quotas / plan limits
      seatCap,
      seatsUsed,
      atSeatCap: seatsUsed >= seatCap,
      bookingCap,
      activeBookingsUsed,
      atBookingCap: activeBookingsUsed >= bookingCap,
      quotaExhausted: activeBookingsUsed >= bookingCap,
      depositFloatLimit: limits.depositFloatLimit,
      depositFloatUsed: depositHeldTotal,
      // Holds
      activeHoldCount: activeHolds.length,
      frozenAssetIds,
      frozenCustomerIds,
      accountFrozen,
      // Bookings / lifecycle
      bookingCount: s.bookings.length,
      activeBookingCount: activeBookingsUsed,
      outBookingCount: s.bookings.filter((b) => b.status === 'out').length,
      returnedBookingCount: s.bookings.filter((b) => b.status === 'returned').length,
      // Money
      outstandingInvoiceCount: outstandingInvoices.length,
      outstandingBalance: outstandingInvoices.reduce((n, i) => n + i.balanceDue, 0),
      paymentDue: outstandingInvoices.length > 0,
      depositHeldTotal,
      depositRequiredTotal,
      depositShortfall,
      lowDepositBalance: depositShortfall > 0,
      // Claims
      openClaimCount: openClaims.length,
      approvableClaimCount: approvableClaims.length,
      // Catalog
      availableAssetCount: s.assets.filter((x) => x.status === 'available').length,
      maintenanceAssetCount: s.assets.filter((x) => x.status === 'maintenance').length,
      currency: CURRENCY,
    };
  }

  // ── Read-only helper predicates (exposed for convenience; not tool calls) ────

  assetFrozen(assetId: string): boolean {
    return this._state.holds.some((h) => h.active && h.scope === 'asset' && h.assetId === assetId);
  }
  customerFrozen(customerId: string): boolean {
    return this._state.holds.some(
      (h) => h.active && ((h.scope === 'account' && h.customerId === customerId) || h.scope === 'workspace'),
    );
  }
  bookingDepositCovered(bookingId: string): boolean {
    const b = this._booking(bookingId);
    return !!b && b.depositHeld >= this._requiredDeposit(b);
  }
  bookingHasOpenClaim(bookingId: string): boolean {
    return this._state.claims.some(
      (c) => c.bookingId === bookingId && (c.status === 'submitted' || c.status === 'under_review'),
    );
  }
  bookingCount(): number { return this._state.bookings.length; }
  assetCount(): number { return this._state.assets.length; }

  // ── Dispatch ──────────────────────────────────────────────────────────────

  private _dispatch(name: string, args: Record<string, unknown>): unknown {
    switch (name) {
      // Rentals & Dispatch
      case 'checkAvailability':      return this._checkAvailability(args);
      case 'listBookings':           return this._listBookings(args);
      case 'getBooking':             return this._getBooking(args);
      case 'createBooking':          return this._createBooking(args);
      case 'rescheduleBooking':      return this._rescheduleBooking(args);
      case 'cancelBooking':          return this._cancelBooking(args);
      case 'checkOutAsset':          return this._checkOutAsset(args);
      case 'checkInAsset':           return this._checkInAsset(args);
      case 'closeBooking':           return this._closeBooking(args);
      case 'listTechnicians':        return this._listTechnicians(args);
      case 'getTechnicianSchedule':  return this._getTechnicianSchedule(args);
      case 'dispatchTechnician':     return this._dispatchTechnician(args);
      case 'cancelDispatch':         return this._cancelDispatch(args);
      // Billing & Payments
      case 'generateQuote':          return this._generateQuote(args);
      case 'getQuote':               return this._getQuote(args);
      case 'generateInvoice':        return this._generateInvoice(args);
      case 'listInvoices':           return this._listInvoices(args);
      case 'getInvoice':             return this._getInvoice(args);
      case 'getDepositBalance':      return this._getDepositBalance(args);
      case 'chargeDeposit':          return this._chargeDeposit(args);
      case 'releaseDeposit':         return this._releaseDeposit(args);
      case 'payInvoice':             return this._payInvoice(args);
      case 'issueRefund':            return this._issueRefund(args);
      case 'voidInvoice':            return this._voidInvoice(args);
      // Claims & Compliance
      case 'listClaims':             return this._listClaims(args);
      case 'getClaim':               return this._getClaim(args);
      case 'fileClaim':              return this._fileClaim(args);
      case 'addClaimEvidence':       return this._addClaimEvidence(args);
      case 'resolveClaim':           return this._resolveClaim(args);
      case 'listHolds':              return this._listHolds(args);
      case 'placeHold':              return this._placeHold(args);
      case 'releaseHold':            return this._releaseHold(args);
      case 'listCustomers':          return this._listCustomers(args);
      case 'getCustomer':            return this._getCustomer(args);
      case 'createCustomer':         return this._createCustomer(args);
      case 'lookupPolicy':           return this._lookupPolicy(args);
      // Inventory & Catalog
      case 'listAssets':             return this._listAssets(args);
      case 'getAsset':               return this._getAsset(args);
      case 'registerAsset':          return this._registerAsset(args);
      case 'updateAssetCondition':   return this._updateAssetCondition(args);
      case 'scheduleMaintenance':    return this._scheduleMaintenance(args);
      case 'completeMaintenance':    return this._completeMaintenance(args);
      case 'getMaintenanceLog':      return this._getMaintenanceLog(args);
      case 'retireAsset':            return this._retireAsset(args);
      case 'transferAsset':          return this._transferAsset(args);
      // Workspace Admin
      case 'getWorkspace':           return this._getWorkspace();
      case 'getPlanUsage':           return this._getPlanUsage();
      case 'listMembers':            return this._listMembers();
      case 'getMember':              return this._getMember(args);
      case 'inviteMember':           return this._inviteMember(args);
      case 'updateMemberRole':       return this._updateMemberRole(args);
      case 'removeMember':           return this._removeMember(args);
      case 'changePlan':             return this._changePlan(args);
      case 'getAuditLog':            return this._getAuditLog(args);
      // Terminal tools are the runner's — never durable here.
      case 'replyToUser':
      case 'askUser':
        return { ok: true };
      default:
        console.warn(`[AtlasWorld] Unknown tool: ${name} — returning { success: false }`);
        return { success: false, error: `Unknown tool "${name}".` };
    }
  }

  private _didTakeEffect(name: string, result: unknown): boolean {
    const r = result as Record<string, unknown>;
    if (r.success === false || r.ok === false) return false;
    if (r.requiresConfirmation === true) return false; // two-step probe — no effect
    if (READ_ONLY_TOOLS.has(name)) return false;
    return r.success === true || r.ok === true;
  }

  // ── ID minting (deterministic sequences) ─────────────────────────────────────

  private _nextId(prefix: string, base: number): string {
    this._seq += 1;
    return `${prefix}_${String(base + this._seq)}`;
  }
  private _mintAssetId(category: AssetCategory): string {
    const short = CATEGORY_SHORT[category] ?? 'asset';
    let max = 0;
    for (const a of this._state.assets) {
      const m = a.id.match(new RegExp(`^ast_${short}(\\d+)$`));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `ast_${short}${String(max + 1).padStart(2, '0')}`;
  }

  // ── Entity accessors ─────────────────────────────────────────────────────────

  private _member(id: string): Member | null { return this._state.members.find((m) => m.id === id) ?? null; }
  private _asset(id: string): Asset | null { return this._state.assets.find((a) => a.id === id) ?? null; }
  private _booking(id: string): Booking | null { return this._state.bookings.find((b) => b.id === id) ?? null; }
  private _customer(id: string): Customer | null { return this._state.customers.find((c) => c.id === id) ?? null; }
  private _invoice(id: string): Invoice | null { return this._state.invoices.find((i) => i.id === id) ?? null; }
  private _claim(id: string): Claim | null { return this._state.claims.find((c) => c.id === id) ?? null; }
  private _hold(id: string): Hold | null { return this._state.holds.find((h) => h.id === id) ?? null; }
  private _technician(id: string): Technician | null { return this._state.technicians.find((t) => t.id === id) ?? null; }
  private _actingPerms(): Permissions { const m = this._member(this._state.actingMemberId); return permissionsOf(m ? m.role : 'viewer'); }

  private _requiredDeposit(b: Booking): number {
    const a = this._asset(b.assetId);
    return a ? a.requiredDeposit : 0;
  }

  private _audit(action: string, detail: string): void {
    this._state.audit.push({ action, detail, memberId: this._state.actingMemberId });
  }
  private _invalidate(keys: string[]): void {
    this.sseActions.push({ type: 'data-invalidate', payload: { keys } });
  }

  private _validDateRange(startDate: string, endDate: string): string | null {
    if (!ISO_DATE_RE.test(startDate) || !ISO_DATE_RE.test(endDate)) return 'INVALID_DATE';
    if (!(startDate < endDate)) return 'START_NOT_BEFORE_END';
    return null;
  }
  private _isFutureDate(date: string): boolean {
    return ISO_DATE_RE.test(date) && date > REFERENCE_DATE;
  }

  /** Any active (confirmed/out) booking for this asset overlapping [start,end)? */
  private _bookingConflict(assetId: string, start: string, end: string, ignoreId?: string): Booking | null {
    return (
      this._state.bookings.find((b) => {
        if (b.id === ignoreId) return false;
        if (b.assetId !== assetId) return false;
        if (b.status !== 'confirmed' && b.status !== 'out') return false;
        return start < b.endDate && b.startDate < end; // half-open overlap
      }) ?? null
    );
  }
  /** Any not-completed maintenance window on this asset overlapping [start,end)? */
  private _maintenanceConflict(asset: Asset, start: string, end: string): boolean {
    return asset.maintenanceWindows.some(
      (w) => !w.completed && start < w.endDate && w.startDate < end,
    );
  }

  // ── Views ────────────────────────────────────────────────────────────────────

  private _assetView(a: Asset) {
    return {
      id: a.id, name: a.name, category: a.category, condition: a.condition, status: a.status,
      dailyRate: a.dailyRate, requiredDeposit: a.requiredDeposit,
      deliveryFee: a.deliveryFee, insuranceFee: a.insuranceFee,
      frozen: this.assetFrozen(a.id),
    };
  }
  private _bookingView(b: Booking) {
    return {
      id: b.id, assetId: b.assetId, customerId: b.customerId,
      startDate: b.startDate, endDate: b.endDate, status: b.status,
      quoteId: b.quoteId ?? null, invoiceId: b.invoiceId ?? null,
      dispatch: b.dispatch ? { ...b.dispatch } : null,
      depositHeld: b.depositHeld, requiredDeposit: this._requiredDeposit(b),
      conditionOut: b.conditionOut ?? null, conditionIn: b.conditionIn ?? null,
      returnedDate: b.returnedDate ?? null,
      hasOpenClaim: this.bookingHasOpenClaim(b.id),
    };
  }
  private _invoiceView(i: Invoice) {
    return {
      id: i.id, bookingId: i.bookingId, lines: i.lines.map((l) => ({ ...l })),
      subtotal: i.subtotal, lateFee: i.lateFee, total: i.total,
      amountPaid: i.amountPaid, balanceDue: i.balanceDue, status: i.status,
    };
  }
  private _claimView(c: Claim) {
    return {
      id: c.id, type: c.type, status: c.status, description: c.description,
      evidence: [...c.evidence], bookingId: c.bookingId ?? null, assetId: c.assetId ?? null,
      customerId: c.customerId ?? null, settlementAmount: c.settlementAmount ?? null,
    };
  }
  private _holdView(h: Hold) {
    return { id: h.id, type: h.type, scope: h.scope, assetId: h.assetId ?? null, customerId: h.customerId ?? null, reason: h.reason, active: h.active };
  }
  private _maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    const head = local.length <= 2 ? local[0] ?? '*' : local.slice(0, 2);
    return `${head}***@${domain}`;
  }
  private _customerView(c: Customer, masked = true) {
    return {
      id: c.id, name: c.name, email: masked ? this._maskEmail(c.email) : c.email,
      outstandingBalance: c.outstandingBalance, rentalCount: c.rentalCount,
      accountHold: this.customerFrozen(c.id),
    };
  }

  // ── Rentals & Dispatch ───────────────────────────────────────────────────────

  private _checkAvailability(args: Record<string, unknown>): unknown {
    const asset = this._asset(String(args.assetId ?? ''));
    if (!asset) return { success: false, error: 'ASSET_NOT_FOUND' };
    const startDate = String(args.startDate ?? '');
    const endDate = String(args.endDate ?? '');
    const dErr = this._validDateRange(startDate, endDate);
    if (dErr) return { success: false, error: dErr, hint: 'startDate must be a valid ISO date before endDate.' };

    const conflict = this._bookingConflict(asset.id, startDate, endDate);
    const maintenance = this._maintenanceConflict(asset, startDate, endDate);
    const frozen = this.assetFrozen(asset.id);
    const blockingStatus = asset.status === 'retired' || asset.status === 'maintenance';
    const available = !conflict && !maintenance && !frozen && !blockingStatus;
    return {
      success: true,
      assetId: asset.id,
      available,
      status: asset.status,
      conflictingBookingId: conflict ? conflict.id : null,
      maintenanceScheduled: maintenance,
      hold: frozen ? 'asset is under an active hold' : null,
      dailyRate: asset.dailyRate,
      requiredDeposit: asset.requiredDeposit,
    };
  }

  private _listBookings(args: Record<string, unknown>): unknown {
    const status = args.status ? String(args.status) : null;
    let rows = this._state.bookings;
    if (status) rows = rows.filter((b) => b.status === status);
    return { success: true, bookings: rows.map((b) => this._bookingView(b)), total: rows.length };
  }

  private _getBooking(args: Record<string, unknown>): unknown {
    const b = this._booking(String(args.bookingId ?? ''));
    if (!b) return { success: false, error: 'BOOKING_NOT_FOUND' };
    return { success: true, booking: this._bookingView(b) };
  }

  private _createBooking(args: Record<string, unknown>): unknown {
    if (!this._state.workspace.onboarded) {
      return { success: false, error: 'NOT_ONBOARDED', hint: 'Complete workspace onboarding before booking.' };
    }
    const asset = this._asset(String(args.assetId ?? ''));
    if (!asset) return { success: false, error: 'ASSET_NOT_FOUND', hint: 'Call listAssets for a real ast_ id.' };
    const customer = this._customer(String(args.customerId ?? ''));
    if (!customer) return { success: false, error: 'CUSTOMER_NOT_FOUND', hint: 'Call listCustomers / createCustomer first.' };
    const startDate = String(args.startDate ?? '');
    const endDate = String(args.endDate ?? '');
    const dErr = this._validDateRange(startDate, endDate);
    if (dErr) return { success: false, error: dErr };
    if (!this._isFutureDate(startDate)) {
      return { success: false, error: 'PAST_DATE', hint: `startDate ${startDate} is not in the future.` };
    }
    // Quota gate.
    const proj = this.projection();
    if (proj.atBookingCap) {
      return { success: false, error: 'BOOKING_QUOTA_REACHED', hint: 'At the active-booking cap. Change plan or close a booking.' };
    }
    // Hold gates.
    if (this.assetFrozen(asset.id)) return { success: false, error: 'ASSET_ON_HOLD', hint: `${asset.id} is under an active hold.` };
    if (this.customerFrozen(customer.id)) return { success: false, error: 'ACCOUNT_ON_HOLD', hint: `${customer.id}'s account is frozen.` };
    // Status gates.
    if (asset.status === 'retired' || asset.status === 'maintenance') {
      return { success: false, error: 'ASSET_UNAVAILABLE', status: asset.status };
    }
    // Availability gates.
    const conflict = this._bookingConflict(asset.id, startDate, endDate);
    if (conflict) return { success: false, error: 'DATE_CONFLICT', conflictingBookingId: conflict.id };
    if (this._maintenanceConflict(asset, startDate, endDate)) return { success: false, error: 'MAINTENANCE_CONFLICT' };

    const quoteId = args.quoteId ? String(args.quoteId) : undefined;
    const booking: Booking = {
      id: this._nextId('bk', 2000), assetId: asset.id, customerId: customer.id,
      startDate, endDate, status: 'confirmed', depositHeld: 0, quoteId,
    };
    this._state.bookings.push(booking);
    asset.status = 'reserved';
    customer.rentalCount += 1;
    this._audit('createBooking', `${booking.id} for ${customer.id} on ${asset.id}`);
    this._invalidate(['bookings', 'assets']);
    return { success: true, booking: this._bookingView(booking), message: `Booked ${asset.name} ${startDate}→${endDate}.` };
  }

  private _rescheduleBooking(args: Record<string, unknown>): unknown {
    const b = this._booking(String(args.bookingId ?? ''));
    if (!b) return { success: false, error: 'BOOKING_NOT_FOUND' };
    if (b.status !== 'pending' && b.status !== 'confirmed') {
      return { success: false, error: 'NOT_RESCHEDULABLE', hint: `Booking is ${b.status}; only pending/confirmed can move.` };
    }
    const startDate = String(args.startDate ?? '');
    const endDate = String(args.endDate ?? '');
    const dErr = this._validDateRange(startDate, endDate);
    if (dErr) return { success: false, error: dErr };
    if (!this._isFutureDate(startDate)) return { success: false, error: 'PAST_DATE' };
    const asset = this._asset(b.assetId);
    if (asset) {
      const conflict = this._bookingConflict(asset.id, startDate, endDate, b.id);
      if (conflict) return { success: false, error: 'DATE_CONFLICT', conflictingBookingId: conflict.id };
      if (this._maintenanceConflict(asset, startDate, endDate)) return { success: false, error: 'MAINTENANCE_CONFLICT' };
    }
    const prev = { startDate: b.startDate, endDate: b.endDate };
    b.startDate = startDate;
    b.endDate = endDate;
    this._audit('rescheduleBooking', `${b.id} → ${startDate}→${endDate}`);
    this._invalidate(['bookings']);
    return { success: true, booking: this._bookingView(b), previous: prev, message: `Rescheduled ${b.id}.` };
  }

  private _cancelBooking(args: Record<string, unknown>): unknown {
    const b = this._booking(String(args.bookingId ?? ''));
    if (!b) return { success: false, error: 'BOOKING_NOT_FOUND' };
    if (b.status === 'out') return { success: false, error: 'NOT_CANCELLABLE', hint: 'Booking is out on rental — check it in first.' };
    if (b.status === 'cancelled') return { success: false, error: 'ALREADY_CANCELLED' };
    if (b.status === 'closed') return { success: false, error: 'NOT_CANCELLABLE', hint: 'Booking is already closed.' };
    if (args.confirmed !== true) {
      return {
        success: true, requiresConfirmation: true, bookingId: b.id,
        message: `You're about to cancel booking ${b.id} (${b.startDate}→${b.endDate}). This frees the asset and voids any dispatch, and cannot be undone. Confirm?`,
        nextStep: 'Relay this confirmation to the user and STOP. Do NOT call cancelBooking with confirmed=true in the same turn.',
      };
    }
    b.status = 'cancelled';
    b.dispatch = undefined;
    const asset = this._asset(b.assetId);
    if (asset && asset.status === 'reserved') asset.status = 'available';
    this._audit('cancelBooking', b.id);
    this._invalidate(['bookings', 'assets']);
    return { success: true, cancelled: true, bookingId: b.id, message: `Booking ${b.id} cancelled.` };
  }

  private _checkOutAsset(args: Record<string, unknown>): unknown {
    const b = this._booking(String(args.bookingId ?? ''));
    if (!b) return { success: false, error: 'BOOKING_NOT_FOUND' };
    if (b.status !== 'confirmed') return { success: false, error: 'NOT_CHECKOUTABLE', hint: `Booking is ${b.status}; only a confirmed booking checks out.` };
    if (this.assetFrozen(b.assetId)) return { success: false, error: 'ASSET_ON_HOLD' };
    if (this.customerFrozen(b.customerId)) return { success: false, error: 'ACCOUNT_ON_HOLD' };
    if (!this.bookingDepositCovered(b.id)) {
      return {
        success: false, error: 'DEPOSIT_SHORTFALL',
        requiredDeposit: this._requiredDeposit(b), depositHeld: b.depositHeld,
        shortfall: this._requiredDeposit(b) - b.depositHeld,
        hint: 'Charge the remaining security deposit (chargeDeposit) before checkout.',
      };
    }
    const asset = this._asset(b.assetId);
    const conditionOut = (args.conditionOut ? String(args.conditionOut) : asset?.condition ?? 'good') as Condition;
    b.status = 'out';
    b.conditionOut = conditionOut;
    if (asset) asset.status = 'out';
    this._audit('checkOutAsset', b.id);
    this._invalidate(['bookings', 'assets']);
    return { success: true, booking: this._bookingView(b), message: `Checked out ${b.assetId} on ${b.id}.` };
  }

  private _checkInAsset(args: Record<string, unknown>): unknown {
    const b = this._booking(String(args.bookingId ?? ''));
    if (!b) return { success: false, error: 'BOOKING_NOT_FOUND' };
    if (b.status !== 'out') return { success: false, error: 'NOT_CHECKINABLE', hint: `Booking is ${b.status}; only an out booking checks in.` };
    const conditionIn = args.conditionIn ? String(args.conditionIn) as Condition : null;
    if (!conditionIn) return { success: false, error: 'INVALID_ARGS', hint: 'conditionIn is required.' };
    const returnedDate = args.returnedDate ? String(args.returnedDate) : b.endDate;
    if (!ISO_DATE_RE.test(returnedDate)) return { success: false, error: 'INVALID_DATE' };
    b.status = 'returned';
    b.conditionIn = conditionIn;
    b.returnedDate = returnedDate;
    const asset = this._asset(b.assetId);
    if (asset) {
      asset.status = 'available';
      asset.condition = conditionIn;
    }
    this._audit('checkInAsset', `${b.id} returned ${returnedDate} (${conditionIn})`);
    this._invalidate(['bookings', 'assets']);
    const lateDays = Math.max(0, dayDiff(returnedDate, b.endDate));
    return { success: true, booking: this._bookingView(b), lateDays, message: `Checked in ${b.assetId}. Now invoiceable and deposit-releasable.` };
  }

  private _closeBooking(args: Record<string, unknown>): unknown {
    const b = this._booking(String(args.bookingId ?? ''));
    if (!b) return { success: false, error: 'BOOKING_NOT_FOUND' };
    if (b.status !== 'returned') return { success: false, error: 'NOT_CLOSEABLE', hint: `Booking is ${b.status}; only a returned booking closes.` };
    const invoice = b.invoiceId ? this._invoice(b.invoiceId) : null;
    if (!invoice || invoice.status !== 'paid') {
      return { success: false, error: 'INVOICE_UNPAID', hint: 'Generate and fully pay the rental invoice before closing.' };
    }
    if (b.depositHeld > 0) return { success: false, error: 'DEPOSIT_STILL_HELD', hint: 'Release the security deposit before closing.' };
    if (this.bookingHasOpenClaim(b.id)) return { success: false, error: 'OPEN_CLAIM', hint: 'Resolve the open claim before closing.' };
    b.status = 'closed';
    this._audit('closeBooking', b.id);
    this._invalidate(['bookings']);
    return { success: true, booking: this._bookingView(b), message: `Booking ${b.id} closed.` };
  }

  private _listTechnicians(args: Record<string, unknown>): unknown {
    const skill = args.skill ? String(args.skill) : null;
    let rows = this._state.technicians;
    if (skill) rows = rows.filter((t) => t.skills.includes(skill));
    return {
      success: true,
      technicians: rows.map((t) => ({ id: t.id, name: t.name, skills: [...t.skills], homeBase: t.homeBase, jobCount: t.jobs.length })),
    };
  }

  private _getTechnicianSchedule(args: Record<string, unknown>): unknown {
    const t = this._technician(String(args.technicianId ?? ''));
    if (!t) return { success: false, error: 'TECHNICIAN_NOT_FOUND' };
    const startDate = String(args.startDate ?? '');
    const endDate = String(args.endDate ?? '');
    const dErr = this._validDateRange(startDate, endDate);
    if (dErr) return { success: false, error: dErr };
    const jobs = t.jobs.filter((j) => j.date >= startDate && j.date <= endDate);
    const busyDates = [...new Set(jobs.map((j) => j.date))];
    return { success: true, technicianId: t.id, jobs: jobs.map((j) => ({ ...j })), busyDates };
  }

  private _dispatchTechnician(args: Record<string, unknown>): unknown {
    if (!this._actingPerms().canDispatch) {
      return { success: false, error: 'PERMISSION_DENIED', hint: 'You need dispatch permission (owner/admin/dispatcher).' };
    }
    const b = this._booking(String(args.bookingId ?? ''));
    if (!b) return { success: false, error: 'BOOKING_NOT_FOUND' };
    if (b.status === 'cancelled' || b.status === 'closed') return { success: false, error: 'BOOKING_NOT_DISPATCHABLE', status: b.status };
    const t = this._technician(String(args.technicianId ?? ''));
    if (!t) return { success: false, error: 'TECHNICIAN_NOT_FOUND' };
    const scheduledDate = String(args.scheduledDate ?? '');
    if (!ISO_DATE_RE.test(scheduledDate)) return { success: false, error: 'INVALID_DATE' };
    const jobType = (args.jobType ? String(args.jobType) : 'delivery') as JobType;
    // Conflict: technician already has a (different-booking) job that date.
    const conflict = t.jobs.find((j) => j.date === scheduledDate && j.bookingId !== b.id);
    if (conflict) {
      return { success: false, error: 'TECHNICIAN_CONFLICT', hint: `${t.name} already has a job on ${scheduledDate} (booking ${conflict.bookingId}).` };
    }
    // Reassign: drop any prior dispatch for this booking (from its old technician + this one).
    for (const other of this._state.technicians) {
      other.jobs = other.jobs.filter((j) => j.bookingId !== b.id);
    }
    t.jobs.push({ bookingId: b.id, date: scheduledDate, jobType });
    b.dispatch = { technicianId: t.id, scheduledDate, jobType };
    this._audit('dispatchTechnician', `${t.id} → ${b.id} on ${scheduledDate} (${jobType})`);
    this._invalidate(['bookings', 'technicians']);
    return { success: true, booking: this._bookingView(b), message: `Dispatched ${t.name} to ${b.id} on ${scheduledDate}.` };
  }

  private _cancelDispatch(args: Record<string, unknown>): unknown {
    if (!this._actingPerms().canDispatch) return { success: false, error: 'PERMISSION_DENIED' };
    const b = this._booking(String(args.bookingId ?? ''));
    if (!b) return { success: false, error: 'BOOKING_NOT_FOUND' };
    if (!b.dispatch) return { success: false, error: 'NO_DISPATCH', hint: 'This booking has no technician assigned.' };
    if (args.confirmed !== true) {
      return {
        success: true, requiresConfirmation: true, bookingId: b.id,
        message: `You're about to remove ${b.dispatch.technicianId}'s ${b.dispatch.jobType} job on ${b.dispatch.scheduledDate} for ${b.id}. Confirm?`,
        nextStep: 'Relay this confirmation to the user and STOP.',
      };
    }
    const t = this._technician(b.dispatch.technicianId);
    if (t) t.jobs = t.jobs.filter((j) => j.bookingId !== b.id);
    this._audit('cancelDispatch', b.id);
    b.dispatch = undefined;
    this._invalidate(['bookings', 'technicians']);
    return { success: true, bookingId: b.id, message: `Dispatch removed from ${b.id}.` };
  }

  // ── Billing & Payments ───────────────────────────────────────────────────────

  private _priceQuote(asset: Asset, startDate: string, endDate: string, includeDelivery: boolean, includeInsurance: boolean) {
    const billableDays = Math.max(1, dayDiff(endDate, startDate));
    const deliveryFee = includeDelivery ? asset.deliveryFee : 0;
    const insuranceFee = includeInsurance ? asset.insuranceFee : 0;
    const total = asset.dailyRate * billableDays + deliveryFee + insuranceFee;
    return { billableDays, deliveryFee, insuranceFee, total, securityDeposit: asset.requiredDeposit };
  }

  private _generateQuote(args: Record<string, unknown>): unknown {
    const asset = this._asset(String(args.assetId ?? ''));
    if (!asset) return { success: false, error: 'ASSET_NOT_FOUND' };
    const startDate = String(args.startDate ?? '');
    const endDate = String(args.endDate ?? '');
    const dErr = this._validDateRange(startDate, endDate);
    if (dErr) return { success: false, error: dErr };
    const includeDelivery = args.includeDelivery === undefined ? true : args.includeDelivery === true;
    const includeInsurance = args.includeInsurance === true;
    const priced = this._priceQuote(asset, startDate, endDate, includeDelivery, includeInsurance);
    const quote: Quote = {
      id: this._nextId('qt', 5000), assetId: asset.id, startDate, endDate,
      dailyRate: asset.dailyRate, ...priced, status: 'priced',
    };
    this._state.quotes.push(quote);
    return { success: true, quote: { ...quote }, currency: CURRENCY };
  }

  private _getQuote(args: Record<string, unknown>): unknown {
    if (args.quoteId) {
      const q = this._state.quotes.find((x) => x.id === String(args.quoteId));
      if (!q) return { success: false, error: 'QUOTE_NOT_FOUND' };
      return { success: true, quote: { ...q }, currency: CURRENCY };
    }
    return { success: true, quotes: this._state.quotes.map((q) => ({ ...q })), currency: CURRENCY };
  }

  private _generateInvoice(args: Record<string, unknown>): unknown {
    const b = this._booking(String(args.bookingId ?? ''));
    if (!b) return { success: false, error: 'BOOKING_NOT_FOUND' };
    if (b.status !== 'returned' && b.status !== 'closed') {
      return { success: false, error: 'NOT_INVOICEABLE', hint: `Booking is ${b.status}; invoice a returned booking.` };
    }
    // Idempotent per booking.
    if (b.invoiceId) {
      const existing = this._invoice(b.invoiceId);
      if (existing) return { success: true, invoice: this._invoiceView(existing), idempotent: true };
    }
    const asset = this._asset(b.assetId);
    if (!asset) return { success: false, error: 'ASSET_NOT_FOUND' };
    const billableDays = Math.max(1, dayDiff(b.endDate, b.startDate));
    const rental = asset.dailyRate * billableDays;
    const lines = [{ label: `Rental (${billableDays} days × ${asset.dailyRate})`, amount: rental }];
    if (asset.deliveryFee > 0) lines.push({ label: 'Delivery', amount: asset.deliveryFee });
    const subtotal = lines.reduce((n, l) => n + l.amount, 0);
    const lateDays = b.returnedDate ? Math.max(0, dayDiff(b.returnedDate, b.endDate)) : 0;
    const lateFee = Math.round(lateDays * asset.dailyRate * LATE_MULTIPLIER * 100) / 100;
    if (lateFee > 0) lines.push({ label: `Late fee (${lateDays} days × ${asset.dailyRate} × ${LATE_MULTIPLIER})`, amount: lateFee });
    const total = subtotal + lateFee;
    const invoice: Invoice = {
      id: this._nextId('inv', 7000), bookingId: b.id, lines,
      subtotal, lateFee, total, amountPaid: 0, balanceDue: total, status: 'issued',
    };
    this._state.invoices.push(invoice);
    b.invoiceId = invoice.id;
    this._audit('generateInvoice', `${invoice.id} for ${b.id} (${total})`);
    this._invalidate(['invoices', 'bookings']);
    return { success: true, invoice: this._invoiceView(invoice), currency: CURRENCY };
  }

  private _listInvoices(args: Record<string, unknown>): unknown {
    const status = args.status ? String(args.status) : null;
    let rows = this._state.invoices;
    if (status) rows = rows.filter((i) => i.status === status);
    return { success: true, invoices: rows.map((i) => this._invoiceView(i)), total: rows.length, currency: CURRENCY };
  }

  private _getInvoice(args: Record<string, unknown>): unknown {
    const i = this._invoice(String(args.invoiceId ?? ''));
    if (!i) return { success: false, error: 'INVOICE_NOT_FOUND' };
    return { success: true, invoice: this._invoiceView(i), currency: CURRENCY };
  }

  private _getDepositBalance(args: Record<string, unknown>): unknown {
    if (args.bookingId) {
      const b = this._booking(String(args.bookingId));
      if (!b) return { success: false, error: 'BOOKING_NOT_FOUND' };
      const required = this._requiredDeposit(b);
      return {
        success: true, bookingId: b.id, requiredDeposit: required, depositHeld: b.depositHeld,
        shortfall: Math.max(0, required - b.depositHeld), covered: b.depositHeld >= required, currency: CURRENCY,
      };
    }
    const proj = this.projection();
    return {
      success: true, depositFloatUsed: proj.depositFloatUsed, depositFloatLimit: proj.depositFloatLimit,
      depositHeldTotal: proj.depositHeldTotal, depositRequiredTotal: proj.depositRequiredTotal,
      depositShortfall: proj.depositShortfall, currency: CURRENCY,
    };
  }

  private _chargeDeposit(args: Record<string, unknown>): unknown {
    if (!this._actingPerms().canMoveMoney) return { success: false, error: 'PERMISSION_DENIED', hint: 'You need billing permission (owner/billing).' };
    const b = this._booking(String(args.bookingId ?? ''));
    if (!b) return { success: false, error: 'BOOKING_NOT_FOUND' };
    const required = this._requiredDeposit(b);
    const remaining = Math.max(0, required - b.depositHeld);
    const amount = args.amount === undefined ? remaining : Number(args.amount);
    if (remaining <= 0) return { success: true, alreadyHeld: true, bookingId: b.id, depositHeld: b.depositHeld, message: 'Deposit already fully held — nothing to charge.' };
    if (!(amount > 0)) return { success: false, error: 'INVALID_AMOUNT' };
    if (args.confirmed !== true) {
      return {
        success: true, requiresConfirmation: true, bookingId: b.id, amount, currency: CURRENCY,
        message: `Charge a security deposit of ${amount} ${CURRENCY} on ${b.id} (required ${required}, held ${b.depositHeld})? This moves money.`,
        nextStep: 'Relay this confirmation to the user and STOP.',
      };
    }
    b.depositHeld = Math.min(required, b.depositHeld + amount);
    this._audit('chargeDeposit', `${b.id} +${amount}`);
    this._invalidate(['bookings']);
    return { success: true, bookingId: b.id, depositHeld: b.depositHeld, charged: amount, currency: CURRENCY, message: `Charged ${amount} ${CURRENCY} deposit on ${b.id}.` };
  }

  private _releaseDeposit(args: Record<string, unknown>): unknown {
    if (!this._actingPerms().canMoveMoney) return { success: false, error: 'PERMISSION_DENIED', hint: 'You need billing permission (owner/billing).' };
    const b = this._booking(String(args.bookingId ?? ''));
    if (!b) return { success: false, error: 'BOOKING_NOT_FOUND' };
    if (this.bookingHasOpenClaim(b.id)) return { success: false, error: 'OPEN_CLAIM', hint: 'Resolve the open claim before releasing the deposit.' };
    if (this.assetFrozen(b.assetId) || this.customerFrozen(b.customerId)) return { success: false, error: 'ON_HOLD', hint: 'A hold blocks releasing this deposit.' };
    if (b.depositHeld <= 0) return { success: false, error: 'NO_DEPOSIT', hint: 'No deposit is held on this booking.' };
    const amount = args.amount === undefined ? b.depositHeld : Number(args.amount);
    if (!(amount > 0) || amount > b.depositHeld) return { success: false, error: 'INVALID_AMOUNT', hint: `Capped at the held amount (${b.depositHeld}).` };
    if (args.confirmed !== true) {
      return {
        success: true, requiresConfirmation: true, bookingId: b.id, amount, currency: CURRENCY,
        message: `Release ${amount} ${CURRENCY} of the held deposit on ${b.id} back to the customer? This moves money and cannot be undone.`,
        nextStep: 'Relay this confirmation to the user and STOP.',
      };
    }
    b.depositHeld -= amount;
    this._audit('releaseDeposit', `${b.id} -${amount}`);
    this._invalidate(['bookings']);
    return { success: true, bookingId: b.id, released: amount, depositHeld: b.depositHeld, currency: CURRENCY, message: `Released ${amount} ${CURRENCY} deposit on ${b.id}.` };
  }

  private _payInvoice(args: Record<string, unknown>): unknown {
    if (!this._actingPerms().canMoveMoney) return { success: false, error: 'PERMISSION_DENIED', hint: 'You need billing permission (owner/billing).' };
    const inv = this._invoice(String(args.invoiceId ?? ''));
    if (!inv) return { success: false, error: 'INVOICE_NOT_FOUND' };
    if (inv.status === 'paid') return { success: true, alreadyPaid: true, invoice: this._invoiceView(inv), message: 'Invoice already paid — no charge.' };
    if (inv.status === 'void') return { success: false, error: 'INVOICE_VOID' };
    const amount = args.amount === undefined ? inv.balanceDue : Number(args.amount);
    if (!(amount > 0)) return { success: false, error: 'INVALID_AMOUNT' };
    const pay = Math.min(amount, inv.balanceDue);
    if (args.confirmed !== true) {
      return {
        success: true, requiresConfirmation: true, invoiceId: inv.id, amount: pay, balanceDue: inv.balanceDue, currency: CURRENCY,
        message: `Record a payment of ${pay} ${CURRENCY} against ${inv.id} (balance ${inv.balanceDue})? This moves money.`,
        nextStep: 'Relay this confirmation to the user and STOP.',
      };
    }
    inv.amountPaid += pay;
    inv.balanceDue -= pay;
    inv.status = inv.balanceDue <= 0 ? 'paid' : 'partially_paid';
    this._audit('payInvoice', `${inv.id} +${pay}`);
    this._invalidate(['invoices']);
    return { success: true, invoice: this._invoiceView(inv), paid: pay, currency: CURRENCY, message: `Paid ${pay} ${CURRENCY} on ${inv.id}.` };
  }

  private _issueRefund(args: Record<string, unknown>): unknown {
    if (!this._actingPerms().canMoveMoney) return { success: false, error: 'PERMISSION_DENIED', hint: 'You need billing permission (owner/billing).' };
    const inv = this._invoice(String(args.invoiceId ?? ''));
    if (!inv) return { success: false, error: 'INVOICE_NOT_FOUND' };
    if (inv.status !== 'paid' && inv.status !== 'partially_paid') return { success: false, error: 'NOT_REFUNDABLE', hint: 'Only a paid invoice can be refunded.' };
    const booking = this._state.bookings.find((b) => b.id === inv.bookingId);
    if (booking && this.customerFrozen(booking.customerId)) return { success: false, error: 'ACCOUNT_ON_HOLD', hint: 'A compliance/legal hold freezes this account.' };
    const amount = Number(args.amount);
    if (!(amount > 0)) return { success: false, error: 'INVALID_AMOUNT' };
    if (amount > inv.amountPaid) return { success: false, error: 'REFUND_OVER_CAP', hint: `Capped at amountPaid (${inv.amountPaid}).` };
    if (args.confirmed !== true) {
      return {
        success: true, requiresConfirmation: true, invoiceId: inv.id, amount, currency: CURRENCY,
        message: `Refund ${amount} ${CURRENCY} against ${inv.id} (paid ${inv.amountPaid})? This moves money and cannot be undone.`,
        nextStep: 'Relay this confirmation to the user and STOP.',
      };
    }
    inv.amountPaid -= amount;
    inv.balanceDue += amount;
    if (inv.balanceDue > 0) inv.status = inv.amountPaid > 0 ? 'partially_paid' : 'issued';
    this._audit('issueRefund', `${inv.id} -${amount}`);
    this._invalidate(['invoices']);
    return { success: true, invoice: this._invoiceView(inv), refunded: amount, currency: CURRENCY, message: `Refunded ${amount} ${CURRENCY} on ${inv.id}.` };
  }

  private _voidInvoice(args: Record<string, unknown>): unknown {
    if (!this._actingPerms().canMoveMoney) return { success: false, error: 'PERMISSION_DENIED', hint: 'You need billing permission (owner/billing).' };
    const inv = this._invoice(String(args.invoiceId ?? ''));
    if (!inv) return { success: false, error: 'INVOICE_NOT_FOUND' };
    if (inv.status === 'paid') return { success: false, error: 'CANNOT_VOID_PAID', hint: 'A paid invoice cannot be voided — issue a refund instead.' };
    if (inv.status === 'void') return { success: false, error: 'ALREADY_VOID' };
    if (args.confirmed !== true) {
      return {
        success: true, requiresConfirmation: true, invoiceId: inv.id,
        message: `Void invoice ${inv.id} (${inv.status}, total ${inv.total})? This is destructive.`,
        nextStep: 'Relay this confirmation to the user and STOP.',
      };
    }
    inv.status = 'void';
    inv.balanceDue = 0;
    this._audit('voidInvoice', inv.id);
    this._invalidate(['invoices']);
    return { success: true, invoiceId: inv.id, voided: true, message: `Invoice ${inv.id} voided.` };
  }

  // ── Claims & Compliance ──────────────────────────────────────────────────────

  private _listClaims(args: Record<string, unknown>): unknown {
    const status = args.status ? String(args.status) : null;
    let rows = this._state.claims;
    if (status) rows = rows.filter((c) => c.status === status);
    return { success: true, claims: rows.map((c) => this._claimView(c)), total: rows.length };
  }

  private _getClaim(args: Record<string, unknown>): unknown {
    const c = this._claim(String(args.claimId ?? ''));
    if (!c) return { success: false, error: 'CLAIM_NOT_FOUND' };
    return { success: true, claim: this._claimView(c) };
  }

  private _fileClaim(args: Record<string, unknown>): unknown {
    const type = args.type ? String(args.type) : '';
    if (!['damage', 'loss', 'injury', 'late_return'].includes(type)) return { success: false, error: 'INVALID_TYPE' };
    const description = String(args.description ?? '').trim();
    if (!description) return { success: false, error: 'INVALID_ARGS', hint: 'A non-empty description is required.' };
    const bookingId = args.bookingId ? String(args.bookingId) : undefined;
    const rawAssetId = args.assetId ? String(args.assetId) : undefined;
    if (!bookingId && !rawAssetId) return { success: false, error: 'INVALID_ARGS', hint: 'Pass at least one of bookingId / assetId.' };
    const booking = bookingId ? this._booking(bookingId) : null;
    if (bookingId && !booking) return { success: false, error: 'BOOKING_NOT_FOUND' };
    const assetId = rawAssetId ?? booking?.assetId;
    if (assetId && !this._asset(assetId)) return { success: false, error: 'ASSET_NOT_FOUND' };
    const evidence = Array.isArray(args.evidence) ? (args.evidence as unknown[]).map(String) : [];

    // Auto-place an investigatory hold (scope=asset) that resolving lifts.
    const claimId = this._nextId('clm', 3000);
    let holdId: string | undefined;
    if (assetId) {
      holdId = this._nextId('hold', 9000);
      this._state.holds.push({ id: holdId, type: 'safety', scope: 'asset', assetId, reason: `investigatory hold: open claim ${claimId}`, active: true });
    }
    const claim: Claim = {
      id: claimId, type: type as Claim['type'], status: 'submitted', description, evidence,
      bookingId, assetId, customerId: booking?.customerId, holdId,
    };
    this._state.claims.push(claim);
    this._audit('fileClaim', `${claim.id} (${type}) on ${assetId ?? bookingId}`);
    this._invalidate(['claims', 'holds']);
    return { success: true, claim: this._claimView(claim), holdPlaced: holdId ?? null, message: `Filed claim ${claim.id}; asset frozen under an investigatory hold until resolved.` };
  }

  private _addClaimEvidence(args: Record<string, unknown>): unknown {
    const c = this._claim(String(args.claimId ?? ''));
    if (!c) return { success: false, error: 'CLAIM_NOT_FOUND' };
    if (c.status !== 'submitted' && c.status !== 'under_review') return { success: false, error: 'CLAIM_RESOLVED', hint: 'Evidence can only be added while the claim is open.' };
    const evidence = Array.isArray(args.evidence) ? (args.evidence as unknown[]).map(String) : [];
    if (evidence.length === 0) return { success: false, error: 'INVALID_ARGS', hint: 'Provide at least one evidence label.' };
    c.evidence.push(...evidence);
    this._invalidate(['claims']);
    return { success: true, claim: this._claimView(c), message: `Added ${evidence.length} evidence item(s) to ${c.id}.` };
  }

  private _resolveClaim(args: Record<string, unknown>): unknown {
    const c = this._claim(String(args.claimId ?? ''));
    if (!c) return { success: false, error: 'CLAIM_NOT_FOUND' };
    if (c.status !== 'submitted' && c.status !== 'under_review') return { success: false, error: 'ALREADY_RESOLVED', status: c.status };
    const resolution = args.resolution ? String(args.resolution) : '';
    if (!['approve', 'deny', 'settle'].includes(resolution)) return { success: false, error: 'INVALID_RESOLUTION' };
    const movesMoney = resolution === 'approve' || resolution === 'settle';
    const settlementAmount = args.settlementAmount === undefined ? undefined : Number(args.settlementAmount);
    if (movesMoney && !(Number(settlementAmount) >= 0)) return { success: false, error: 'INVALID_ARGS', hint: 'settlementAmount is required for approve/settle.' };
    if (movesMoney && args.confirmed !== true) {
      return {
        success: true, requiresConfirmation: true, claimId: c.id, resolution, settlementAmount, currency: CURRENCY,
        message: `Resolve claim ${c.id} as "${resolution}" with a ${settlementAmount} ${CURRENCY} settlement deducted from the deposit? This moves money.`,
        nextStep: 'Relay this confirmation to the user and STOP.',
      };
    }
    // Apply resolution.
    let deducted = 0;
    if (movesMoney && c.bookingId) {
      const b = this._booking(c.bookingId);
      if (b) {
        deducted = Math.min(b.depositHeld, Number(settlementAmount));
        b.depositHeld -= deducted;
      }
    }
    c.status = resolution === 'deny' ? 'denied' : resolution === 'approve' ? 'approved' : 'settled';
    if (movesMoney) c.settlementAmount = Number(settlementAmount);
    // Lift the auto investigatory hold.
    if (c.holdId) {
      const h = this._hold(c.holdId);
      if (h) h.active = false;
    }
    this._audit('resolveClaim', `${c.id} ${resolution}${movesMoney ? ` (${deducted} from deposit)` : ''}`);
    this._invalidate(['claims', 'holds', 'bookings']);
    return { success: true, claim: this._claimView(c), deductedFromDeposit: deducted, holdLifted: c.holdId ?? null, message: `Claim ${c.id} ${c.status}.` };
  }

  private _listHolds(args: Record<string, unknown>): unknown {
    const scope = args.scope ? String(args.scope) : null;
    const assetId = args.assetId ? String(args.assetId) : null;
    let rows = this._state.holds.filter((h) => h.active);
    if (scope) rows = rows.filter((h) => h.scope === scope);
    if (assetId) rows = rows.filter((h) => h.assetId === assetId);
    return { success: true, holds: rows.map((h) => this._holdView(h)), total: rows.length };
  }

  private _placeHold(args: Record<string, unknown>): unknown {
    const type = args.type ? String(args.type) : '';
    if (!['legal', 'compliance', 'safety', 'payment'].includes(type)) return { success: false, error: 'INVALID_TYPE' };
    const scope = args.scope ? String(args.scope) : '';
    if (!['asset', 'account', 'workspace'].includes(scope)) return { success: false, error: 'INVALID_SCOPE' };
    const reason = String(args.reason ?? '').trim();
    if (!reason) return { success: false, error: 'INVALID_ARGS', hint: 'A non-empty reason is required.' };
    const assetId = args.assetId ? String(args.assetId) : undefined;
    const customerId = args.customerId ? String(args.customerId) : undefined;
    if (scope === 'asset' && (!assetId || !this._asset(assetId))) return { success: false, error: 'ASSET_REQUIRED', hint: 'scope=asset needs a valid assetId.' };
    if (scope === 'account' && (!customerId || !this._customer(customerId))) return { success: false, error: 'CUSTOMER_REQUIRED', hint: 'scope=account needs a valid customerId.' };
    const hold: Hold = { id: this._nextId('hold', 9000), type: type as HoldType, scope: scope as HoldScope, assetId, customerId, reason, active: true };
    this._state.holds.push(hold);
    this._audit('placeHold', `${hold.id} ${type}/${scope} ${assetId ?? customerId ?? 'workspace'}`);
    this._invalidate(['holds']);
    return { success: true, hold: this._holdView(hold), message: `Placed ${type} hold ${hold.id}.` };
  }

  private _releaseHold(args: Record<string, unknown>): unknown {
    const h = this._hold(String(args.holdId ?? ''));
    if (!h) return { success: false, error: 'HOLD_NOT_FOUND' };
    if (!h.active) return { success: false, error: 'ALREADY_RELEASED' };
    if (args.confirmed !== true) {
      return {
        success: true, requiresConfirmation: true, holdId: h.id,
        message: `Release ${h.type} hold ${h.id} (${h.reason})? Removing a compliance/legal freeze is high-risk — verify the reason (lookupPolicy "hold_release") first.`,
        nextStep: 'Relay this confirmation to the user and STOP.',
      };
    }
    h.active = false;
    this._audit('releaseHold', h.id);
    this._invalidate(['holds']);
    return { success: true, holdId: h.id, released: true, message: `Hold ${h.id} released.` };
  }

  private _listCustomers(args: Record<string, unknown>): unknown {
    const query = args.query ? String(args.query).toLowerCase() : null;
    let rows = this._state.customers;
    if (query) rows = rows.filter((c) => c.name.toLowerCase().includes(query));
    return {
      success: true,
      customers: rows.map((c) => ({ id: c.id, name: c.name, accountHold: this.customerFrozen(c.id), outstandingBalance: c.outstandingBalance })),
      total: rows.length,
    };
  }

  private _getCustomer(args: Record<string, unknown>): unknown {
    const c = this._customer(String(args.customerId ?? ''));
    if (!c) return { success: false, error: 'CUSTOMER_NOT_FOUND' };
    return { success: true, customer: this._customerView(c, true) };
  }

  private _createCustomer(args: Record<string, unknown>): unknown {
    const name = String(args.name ?? '').trim();
    const email = String(args.email ?? '').trim();
    if (!name || !email) return { success: false, error: 'INVALID_ARGS', hint: 'name and email are required.' };
    const customer: Customer = {
      id: this._nextId('cust', 2000), name, email,
      phone: args.phone ? String(args.phone) : undefined, outstandingBalance: 0, rentalCount: 0,
    };
    this._state.customers.push(customer);
    this._audit('createCustomer', customer.id);
    this._invalidate(['customers']);
    return { success: true, customer: { id: customer.id, name: customer.name, email: this._maskEmail(customer.email) }, message: `Registered customer ${customer.name}.` };
  }

  private _lookupPolicy(args: Record<string, unknown>): unknown {
    const topic = String(args.topic ?? '');
    const text = POLICIES[topic];
    if (!text) return { success: false, error: 'UNKNOWN_TOPIC' };
    return { success: true, topic, text, lateMultiplier: LATE_MULTIPLIER };
  }

  // ── Inventory & Catalog ──────────────────────────────────────────────────────

  private _listAssets(args: Record<string, unknown>): unknown {
    const category = args.category ? String(args.category) : null;
    const status = args.status ? String(args.status) : null;
    let rows = this._state.assets;
    if (category) rows = rows.filter((a) => a.category === category);
    if (status) rows = rows.filter((a) => a.status === status);
    return { success: true, assets: rows.map((a) => this._assetView(a)), total: rows.length, currency: CURRENCY };
  }

  private _getAsset(args: Record<string, unknown>): unknown {
    const a = this._asset(String(args.assetId ?? ''));
    if (!a) return { success: false, error: 'ASSET_NOT_FOUND' };
    return {
      success: true,
      asset: { ...this._assetView(a), maintenanceWindows: a.maintenanceWindows.map((w) => ({ ...w })) },
      currency: CURRENCY,
    };
  }

  private _registerAsset(args: Record<string, unknown>): unknown {
    if (!this._actingPerms().canManageFleet) return { success: false, error: 'PERMISSION_DENIED', hint: 'You need fleet permission (owner/admin).' };
    const name = String(args.name ?? '').trim();
    const category = String(args.category ?? '') as AssetCategory;
    if (!name) return { success: false, error: 'INVALID_ARGS', hint: 'name is required.' };
    if (!CATEGORY_SHORT[category]) return { success: false, error: 'INVALID_CATEGORY' };
    const dailyRate = Number(args.dailyRate);
    const requiredDeposit = Number(args.requiredDeposit);
    if (!(dailyRate >= 0) || !(requiredDeposit >= 0)) return { success: false, error: 'INVALID_ARGS', hint: 'dailyRate and requiredDeposit are required non-negative numbers.' };
    const condition = (args.condition ? String(args.condition) : 'good') as Condition;
    const a: Asset = {
      id: this._mintAssetId(category), name, category, condition, status: 'available',
      dailyRate, requiredDeposit, deliveryFee: 0, insuranceFee: 0, maintenanceWindows: [],
    };
    this._state.assets.push(a);
    this._audit('registerAsset', a.id);
    this._invalidate(['assets']);
    return { success: true, asset: this._assetView(a), message: `Registered ${a.name} as ${a.id}.` };
  }

  private _updateAssetCondition(args: Record<string, unknown>): unknown {
    if (!this._actingPerms().canManageFleet) return { success: false, error: 'PERMISSION_DENIED' };
    const a = this._asset(String(args.assetId ?? ''));
    if (!a) return { success: false, error: 'ASSET_NOT_FOUND' };
    const condition = String(args.condition ?? '') as Condition;
    if (!['excellent', 'good', 'fair', 'poor', 'damaged'].includes(condition)) return { success: false, error: 'INVALID_CONDITION' };
    a.condition = condition;
    this._audit('updateAssetCondition', `${a.id} → ${condition}`);
    this._invalidate(['assets']);
    return { success: true, asset: this._assetView(a), message: `Updated ${a.id} condition to ${condition}.` };
  }

  private _scheduleMaintenance(args: Record<string, unknown>): unknown {
    if (!this._actingPerms().canManageFleet) return { success: false, error: 'PERMISSION_DENIED' };
    const a = this._asset(String(args.assetId ?? ''));
    if (!a) return { success: false, error: 'ASSET_NOT_FOUND' };
    if (a.status === 'out') return { success: false, error: 'ASSET_OUT', hint: 'Cannot service an asset that is out on an active rental.' };
    const startDate = String(args.startDate ?? '');
    const endDate = String(args.endDate ?? '');
    const dErr = this._validDateRange(startDate, endDate);
    if (dErr) return { success: false, error: dErr };
    const reason = args.reason ? String(args.reason) : 'scheduled maintenance';
    a.maintenanceWindows.push({ startDate, endDate, reason, completed: false });
    a.status = 'maintenance';
    this._audit('scheduleMaintenance', `${a.id} ${startDate}→${endDate}`);
    this._invalidate(['assets']);
    return { success: true, asset: this._assetView(a), maintenance: { startDate, endDate, reason }, message: `Scheduled maintenance on ${a.id}.` };
  }

  private _completeMaintenance(args: Record<string, unknown>): unknown {
    if (!this._actingPerms().canManageFleet) return { success: false, error: 'PERMISSION_DENIED' };
    const a = this._asset(String(args.assetId ?? ''));
    if (!a) return { success: false, error: 'ASSET_NOT_FOUND' };
    if (a.status !== 'maintenance') return { success: false, error: 'NOT_IN_MAINTENANCE' };
    const condition = String(args.condition ?? '') as Condition;
    if (!['excellent', 'good', 'fair', 'poor', 'damaged'].includes(condition)) return { success: false, error: 'INVALID_CONDITION' };
    for (const w of a.maintenanceWindows) if (!w.completed) { w.completed = true; w.resultCondition = condition; }
    a.status = 'available';
    a.condition = condition;
    this._audit('completeMaintenance', `${a.id} → ${condition}`);
    this._invalidate(['assets']);
    return { success: true, asset: this._assetView(a), message: `${a.id} back in service (${condition}).` };
  }

  private _getMaintenanceLog(args: Record<string, unknown>): unknown {
    const a = this._asset(String(args.assetId ?? ''));
    if (!a) return { success: false, error: 'ASSET_NOT_FOUND' };
    return { success: true, assetId: a.id, maintenanceWindows: a.maintenanceWindows.map((w) => ({ ...w })) };
  }

  private _retireAsset(args: Record<string, unknown>): unknown {
    if (!this._actingPerms().canManageFleet) return { success: false, error: 'PERMISSION_DENIED' };
    const a = this._asset(String(args.assetId ?? ''));
    if (!a) return { success: false, error: 'ASSET_NOT_FOUND' };
    if (a.status === 'retired') return { success: false, error: 'ALREADY_RETIRED' };
    const blocked = this._assetBlockedForRemoval(a);
    if (blocked) return { success: false, error: blocked };
    if (args.confirmed !== true) {
      return {
        success: true, requiresConfirmation: true, assetId: a.id,
        message: `Permanently retire ${a.name} (${a.id})? This is destructive and irreversible.`,
        nextStep: 'Relay this confirmation to the user and STOP.',
      };
    }
    a.status = 'retired';
    this._audit('retireAsset', a.id);
    this._invalidate(['assets']);
    return { success: true, assetId: a.id, retired: true, message: `Asset ${a.id} retired.` };
  }

  private _transferAsset(args: Record<string, unknown>): unknown {
    if (!this._actingPerms().canManageFleet) return { success: false, error: 'PERMISSION_DENIED' };
    const a = this._asset(String(args.assetId ?? ''));
    if (!a) return { success: false, error: 'ASSET_NOT_FOUND' };
    const targetWorkspaceId = String(args.targetWorkspaceId ?? '');
    if (!/^ws_[a-z0-9]+$/.test(targetWorkspaceId)) return { success: false, error: 'INVALID_TARGET' };
    const blocked = this._assetBlockedForRemoval(a);
    if (blocked) return { success: false, error: blocked };
    if (args.confirmed !== true) {
      return {
        success: true, requiresConfirmation: true, assetId: a.id, targetWorkspaceId,
        message: `Transfer ${a.name} (${a.id}) to ${targetWorkspaceId}? It leaves this workspace's fleet — destructive from here.`,
        nextStep: 'Relay this confirmation to the user and STOP.',
      };
    }
    // Leaves this workspace's fleet.
    this._state.assets = this._state.assets.filter((x) => x.id !== a.id);
    this._audit('transferAsset', `${a.id} → ${targetWorkspaceId}`);
    this._invalidate(['assets']);
    return { success: true, assetId: a.id, targetWorkspaceId, transferred: true, message: `Asset ${a.id} transferred to ${targetWorkspaceId}.` };
  }

  /** An asset out on rental, reserved by a future booking, or under a hold cannot be removed. */
  private _assetBlockedForRemoval(a: Asset): string | null {
    if (a.status === 'out') return 'ASSET_OUT';
    if (this.assetFrozen(a.id)) return 'ASSET_ON_HOLD';
    const reserved = this._state.bookings.some((b) => b.assetId === a.id && (b.status === 'confirmed' || b.status === 'out'));
    if (reserved) return 'ASSET_RESERVED';
    return null;
  }

  // ── Workspace Admin ──────────────────────────────────────────────────────────

  private _getWorkspace(): unknown {
    const w = this._state.workspace;
    return { success: true, workspace: { id: w.id, name: w.name, plan: w.plan, status: w.status, onboarded: w.onboarded } };
  }

  private _getPlanUsage(): unknown {
    const p = this.projection();
    return {
      success: true,
      plan: this._state.workspace.plan,
      seatCap: p.seatCap, seatsUsed: p.seatsUsed, atSeatCap: p.atSeatCap,
      bookingCap: p.bookingCap, activeBookingsUsed: p.activeBookingsUsed, atBookingCap: p.atBookingCap,
      depositFloatLimit: p.depositFloatLimit, depositFloatUsed: p.depositFloatUsed,
    };
  }

  private _listMembers(): unknown {
    return {
      success: true,
      members: this._state.members.filter((m) => m.status !== 'removed').map((m) => ({ id: m.id, name: m.name, role: m.role, status: m.status })),
    };
  }

  private _getMember(args: Record<string, unknown>): unknown {
    const id = args.memberId ? String(args.memberId) : this._state.actingMemberId;
    const m = this._member(id);
    if (!m) return { success: false, error: 'MEMBER_NOT_FOUND' };
    const perm = permissionsOf(m.role);
    return { success: true, member: { id: m.id, name: m.name, role: m.role, status: m.status, ...perm } };
  }

  private _inviteMember(args: Record<string, unknown>): unknown {
    if (!this._actingPerms().canManageMembers) return { success: false, error: 'PERMISSION_DENIED', hint: 'You need member-management permission (owner/admin).' };
    if (this.projection().atSeatCap) return { success: false, error: 'SEAT_QUOTA_REACHED', hint: 'At the seat cap. Change plan or remove a member.' };
    const email = String(args.email ?? '').trim();
    const role = String(args.role ?? '') as Role;
    if (!email) return { success: false, error: 'INVALID_ARGS', hint: 'email is required.' };
    if (!['admin', 'dispatcher', 'billing', 'viewer'].includes(role)) return { success: false, error: 'INVALID_ROLE', hint: 'A new invite cannot be owner.' };
    const member: Member = { id: this._nextId('mem', 0), name: email.split('@')[0], email, role, status: 'invited' };
    this._state.members.push(member);
    this._audit('inviteMember', `${member.id} (${role})`);
    this._invalidate(['members']);
    return { success: true, member: { id: member.id, email: member.email, role: member.role, status: member.status }, message: `Invited ${email} as ${role}.` };
  }

  private _updateMemberRole(args: Record<string, unknown>): unknown {
    if (!this._actingPerms().canManageMembers) return { success: false, error: 'PERMISSION_DENIED' };
    const m = this._member(String(args.memberId ?? ''));
    if (!m) return { success: false, error: 'MEMBER_NOT_FOUND' };
    const role = String(args.role ?? '') as Role;
    if (!['owner', 'admin', 'dispatcher', 'billing', 'viewer'].includes(role)) return { success: false, error: 'INVALID_ROLE' };
    if (m.role === 'owner' && role !== 'owner' && this._soleOwner(m.id)) return { success: false, error: 'SOLE_OWNER', hint: 'Cannot demote the sole remaining owner.' };
    m.role = role;
    this._audit('updateMemberRole', `${m.id} → ${role}`);
    this._invalidate(['members']);
    return { success: true, member: { id: m.id, role: m.role }, message: `${m.id} is now ${role}.` };
  }

  private _removeMember(args: Record<string, unknown>): unknown {
    if (!this._actingPerms().canManageMembers) return { success: false, error: 'PERMISSION_DENIED' };
    const m = this._member(String(args.memberId ?? ''));
    if (!m) return { success: false, error: 'MEMBER_NOT_FOUND' };
    if (m.status === 'removed') return { success: false, error: 'ALREADY_REMOVED' };
    if (m.role === 'owner' && this._soleOwner(m.id)) return { success: false, error: 'SOLE_OWNER', hint: 'Cannot remove the sole owner.' };
    if (args.confirmed !== true) {
      return {
        success: true, requiresConfirmation: true, memberId: m.id,
        message: `Remove ${m.name} (${m.id}, ${m.role}) from the workspace? This frees their seat and is irreversible.`,
        nextStep: 'Relay this confirmation to the user and STOP.',
      };
    }
    m.status = 'removed';
    this._audit('removeMember', m.id);
    this._invalidate(['members']);
    return { success: true, memberId: m.id, removed: true, message: `Member ${m.id} removed.` };
  }

  private _changePlan(args: Record<string, unknown>): unknown {
    if (this._actingPerms().canManageMembers === false || this._member(this._state.actingMemberId)?.role !== 'owner') {
      // changePlan is owner-only.
      return { success: false, error: 'PERMISSION_DENIED', hint: 'Only the owner can change the plan.' };
    }
    const plan = String(args.plan ?? '');
    if (!PLAN_LIMITS[plan]) return { success: false, error: 'INVALID_PLAN' };
    const limits = PLAN_LIMITS[plan];
    const proj = this.projection();
    if ((proj.seatsUsed as number) > limits.seatCap || (proj.activeBookingsUsed as number) > limits.bookingCap) {
      return { success: false, error: 'DOWNGRADE_BELOW_USAGE', hint: `Current usage exceeds the ${plan} caps (seats ${proj.seatsUsed}/${limits.seatCap}, bookings ${proj.activeBookingsUsed}/${limits.bookingCap}).` };
    }
    if (args.confirmed !== true) {
      return {
        success: true, requiresConfirmation: true, plan,
        message: `Change the workspace plan to "${plan}" (seats ${limits.seatCap}, bookings ${limits.bookingCap})? This may change billing.`,
        nextStep: 'Relay this confirmation to the user and STOP.',
      };
    }
    this._state.workspace.plan = plan as Workspace['plan'];
    this._audit('changePlan', plan);
    this._invalidate(['workspace']);
    return { success: true, plan, message: `Plan changed to ${plan}.` };
  }

  private _getAuditLog(args: Record<string, unknown>): unknown {
    const action = args.action ? String(args.action) : null;
    const limit = args.limit ? Number(args.limit) : 20;
    let rows = this._state.audit;
    if (action) rows = rows.filter((e) => e.action === action);
    const sliced = rows.slice(-limit).reverse();
    return { success: true, entries: sliced.map((e) => ({ ...e })), total: sliced.length };
  }

  private _soleOwner(memberId: string): boolean {
    const owners = this._state.members.filter((m) => m.role === 'owner' && m.status !== 'removed');
    return owners.length === 1 && owners[0].id === memberId;
  }
}

/** The eval harness seam: a fresh deterministic world per case run (`seed` = the rep index). */
export function worldFactory(preset: string, seed: number): AgentWorld {
  return new AtlasWorld(preset, seed);
}
