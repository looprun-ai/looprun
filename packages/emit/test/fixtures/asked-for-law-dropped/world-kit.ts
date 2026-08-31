/** atlas-next world kit: the mutable VIEW an executor's logic runs over, the diff
 *  that turns its changes into patches, and the domain helpers. No regex anywhere —
 *  id shapes are checked with plain string walks; the declared schema patterns are
 *  DATA the engine's own argMatchesFormat guard evaluates. */
import type { Json, Patch, StateSnapshot } from '@looprun-ai/core';

export const TODAY = '2026-07-01';

export const PLAN_LIMITS: Readonly<Record<string, { seats: number; bookings: number; float: number }>> = {
  starter: { seats: 2, bookings: 3, float: 10000 },
  pro: { seats: 5, bookings: 10, float: 50000 },
  fleet: { seats: 15, bookings: 40, float: 250000 },
  enterprise: { seats: 100, bookings: 500, float: 5000000 }
};

export const CONDITIONS = ['excellent', 'good', 'fair', 'poor', 'damaged'];
export const BOOKING_STATUSES = ['pending', 'confirmed', 'out', 'returned', 'closed', 'cancelled'];
export const INVOICE_STATUSES = ['draft', 'issued', 'partially_paid', 'paid', 'void', 'overdue'];
export const CLAIM_STATUSES = ['submitted', 'under_review', 'approved', 'denied', 'settled'];
export const HOLD_SCOPES = ['asset', 'account', 'workspace'];
export const HOLD_TYPES = ['legal', 'compliance', 'safety', 'payment'];
export const JOB_TYPES = ['delivery', 'pickup', 'onsite_service', 'inspection'];
export const ROLES = ['owner', 'admin', 'dispatcher', 'billing', 'viewer'];
export const PLANS = ['starter', 'pro', 'fleet', 'enterprise'];
export const CATEGORIES = ['excavator', 'loader', 'skid_steer', 'boom_lift', 'scissor_lift',
  'generator', 'compressor', 'light_tower', 'pump', 'trailer'];
export const CATEGORY_PREFIX: Readonly<Record<string, string>> = {
  excavator: 'excv', loader: 'load', skid_steer: 'sksr', boom_lift: 'bmlf', scissor_lift: 'sclf',
  generator: 'genr', compressor: 'cmpr', light_tower: 'ltwr', pump: 'pump', trailer: 'trlr'
};
export const POLICY_TOPICS = ['deposit_refund', 'damage_liability', 'hold_release', 'cancellation',
  'late_return', 'insurance'];

// ── plain string/date checks (no regex — the purity law) ─────────────────────

const LOWER_DIGITS = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function idOk(v: string, prefix: string): boolean {
  if (!v.startsWith(prefix) || v.length === prefix.length) return false;
  for (const ch of v.slice(prefix.length)) {
    if (!LOWER_DIGITS.includes(ch)) return false;
  }
  return true;
}

export function isIsoShape(v: string): boolean {
  if (v.length !== 10 || v[4] !== '-' || v[7] !== '-') return false;
  for (const at of [0, 1, 2, 3, 5, 6, 8, 9]) {
    if (v[at] < '0' || v[at] > '9') return false;
  }
  return true;
}

export function isValidDate(v: unknown): v is string {
  if (typeof v !== 'string' || !isIsoShape(v)) return false;
  const m = Number(v.slice(5, 7));
  const d = Number(v.slice(8, 10));
  return m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

export function toDays(iso: string): number {
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

export function fromDays(days: number): string {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const yy = m <= 2 ? y + 1 : y;
  const pad = (n: number) => (n < 10 ? `0${String(n)}` : String(n));
  return `${String(yy)}-${pad(m)}-${pad(d)}`;
}

export function overlaps(aS: string, aE: string, bS: string, bE: string): boolean {
  return toDays(aS) < toDays(bE) && toDays(bS) < toDays(aE);
}

export function money(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── arg reception (the codes are the API's own) ──────────────────────────────

type OptRead = { absent: true } | { value: string } | { error: string };

export function optString(raw: unknown,
  opts: { prefix?: string; date?: true; allowed?: readonly string[]; code: string | null }): OptRead {
  if (raw === undefined || raw === null) return { absent: true };
  if (typeof raw !== 'string') return opts.code !== null ? { error: opts.code } : { absent: true };
  const v = raw.trim();
  if (opts.allowed && !opts.allowed.includes(v)) return opts.code !== null ? { error: opts.code } : { value: v };
  if (opts.prefix !== undefined && !idOk(v, opts.prefix)) return opts.code !== null ? { error: opts.code } : { value: v };
  if (opts.date === true && !isIsoShape(v)) return opts.code !== null ? { error: opts.code } : { value: v };
  return { value: v };
}

export function reqString(raw: unknown,
  opts: { prefix?: string; date?: true; allowed?: readonly string[]; code: string }):
  { value: string } | { error: string } {
  if (typeof raw !== 'string') return { error: opts.code };
  const v = raw.trim();
  if (v === '') return { error: opts.code };
  if (opts.allowed && !opts.allowed.includes(v)) return { error: opts.code };
  if (opts.prefix !== undefined && !idOk(v, opts.prefix)) return { error: opts.code };
  if (opts.date === true && !isIsoShape(v)) return { error: opts.code };
  return { value: v };
}

// ── the mutable w an executor's logic runs over ───────────────────────────

export type Row = Record<string, Json>;
export type Dispatch = { technicianId: string; scheduledDate: string; jobType: string };

export interface View {
  workspace: Row & { id: string };
  actingMemberId: string;
  assets: Row[]; customers: Row[]; members: Row[]; technicians: Row[];
  bookings: Row[]; invoices: Row[]; quotes: Row[]; claims: Row[]; holds: Row[];
  maintenance: Row[]; auditLog: Row[];
  counters: Record<string, number>;
}

const ARRAY_ENTITIES = ['assets', 'customers', 'members', 'technicians', 'bookings',
  'invoices', 'quotes', 'claims', 'holds', 'maintenance'] as const;

function tableToRows(table: Readonly<Record<string, Readonly<Record<string, Json>>>> | undefined): Row[] {
  return Object.entries(table ?? {}).map(([id, fields]) => ({ id, ...structuredClone(fields) as Row }));
}

export function toView(records: StateSnapshot): View {
  const wsTable = records.workspace ?? {};
  const wsId = Object.keys(wsTable)[0];
  const ws = structuredClone(wsTable[wsId]) as Row;
  const acting = typeof ws.actingMemberId === 'string' ? ws.actingMemberId : '';
  delete ws.actingMemberId;
  const w = { workspace: { id: wsId, ...ws }, actingMemberId: acting } as View;
  for (const entity of ARRAY_ENTITIES) w[entity] = tableToRows(records[entity]);
  w.auditLog = tableToRows(records.auditLog).map(r => { const { id, ...rest } = r; void id; return rest; });
  w.counters = structuredClone(records.counters?.counters ?? {}) as Record<string, number>;
  return w;
}

/** Maintenance rows carry a w-internal id (their record key); handler results
 *  return them the way the API states them — without it. */
export function maintenanceRowOut(row: Row): Row {
  const { id, ...fields } = row;
  void id;
  return fields;
}

function rowsToTable(rows: Row[], keyOf: (r: Row) => string): Record<string, Row> {
  const out: Record<string, Row> = {};
  for (const row of rows) {
    const { id, ...fields } = row;
    void id;
    out[keyOf(row)] = keyOf === keyById ? fields as Row : row;
  }
  return out;
}
const keyById = (r: Row): string => String(r.id);

export function fromView(w: View): Record<string, Record<string, Row>> {
  const out: Record<string, Record<string, Row>> = {};
  for (const entity of ARRAY_ENTITIES) out[entity] = rowsToTable(w[entity], keyById);
  const { id, ...wsFields } = w.workspace;
  out.workspace = { [id]: { ...wsFields, actingMemberId: w.actingMemberId } };
  out.counters = { counters: w.counters as Row };
  out.auditLog = Object.fromEntries(w.auditLog.map(row => [`a${String(row.seq)}`, row]));
  return out;
}

export function diffToPatches(before: StateSnapshot, w: View): Patch[] {
  const after = fromView(w);
  const patches: Patch[] = [];
  for (const entity of Object.keys(after)) {
    const beforeTable = before[entity] ?? {};
    const afterTable = after[entity];
    for (const id of Object.keys(afterTable)) {
      if (beforeTable[id] === undefined) {
        patches.push({ entity, id, make: afterTable[id] });
        continue;
      }
      const set: Row = {};
      const fields = new Set([...Object.keys(beforeTable[id]), ...Object.keys(afterTable[id])]);
      for (const field of fields) {
        if (JSON.stringify(beforeTable[id][field]) !== JSON.stringify(afterTable[id][field])) {
          set[field] = afterTable[id][field] ?? null;
        }
      }
      if (Object.keys(set).length > 0) patches.push({ entity, id, set });
    }
    for (const id of Object.keys(beforeTable)) {
      if (afterTable[id] === undefined) patches.push({ entity, id, remove: true });
    }
  }
  return patches;
}

// ── the domain queries the handlers share ─────────────────────────────────────

export function limits(w: View): { seats: number; bookings: number; float: number } {
  return PLAN_LIMITS[String(w.workspace.plan)] ?? PLAN_LIMITS.starter;
}

export function acting(w: View): Row | undefined {
  return w.members.find(m => m.id === w.actingMemberId);
}

export function caps(role: string | undefined):
  { members: boolean; money: boolean; dispatch: boolean; fleet: boolean; plan: boolean } {
  switch (role) {
    case 'owner': return { members: true, money: true, dispatch: true, fleet: true, plan: true };
    case 'admin': return { members: true, money: false, dispatch: true, fleet: true, plan: false };
    case 'dispatcher': return { members: false, money: false, dispatch: true, fleet: false, plan: false };
    case 'billing': return { members: false, money: true, dispatch: false, fleet: false, plan: false };
    default: return { members: false, money: false, dispatch: false, fleet: false, plan: false };
  }
}

export function activeBookings(w: View): Row[] {
  return w.bookings.filter(b => ['pending', 'confirmed', 'out'].includes(String(b.status)));
}

export function depositFloatHeld(w: View): number {
  return w.bookings.reduce((sum, b) => sum + (typeof b.depositHeld === 'number' ? b.depositHeld : 0), 0);
}

export function activeHolds(w: View): Row[] {
  return w.holds.filter(h => h.active === true);
}

export function workspaceFrozen(w: View): boolean {
  return activeHolds(w).some(h => h.scope === 'workspace');
}

export function assetHold(w: View, assetId: string): Row | undefined {
  return activeHolds(w).find(h => h.scope === 'asset' && h.assetId === assetId);
}

export function accountHold(w: View, customerId: string): Row | undefined {
  return activeHolds(w).find(h => h.scope === 'account' && h.customerId === customerId);
}

export function openClaimFor(w: View, bookingId: string): Row | undefined {
  return w.claims.find(c => c.bookingId === bookingId
    && ['submitted', 'under_review'].includes(String(c.status)));
}

export function invoiceFor(w: View, bookingId: string): Row | undefined {
  return w.invoices.find(i => i.bookingId === bookingId && i.status !== 'void');
}

export function balanceDue(inv: Row): number {
  const total = typeof inv.total === 'number' ? inv.total : 0;
  const paid = typeof inv.amountPaid === 'number' ? inv.amountPaid : 0;
  return money(total - paid);
}

export function maintenanceWindows(w: View, assetId: string): Row[] {
  return w.maintenance.filter(m => m.assetId === assetId && m.status === 'scheduled');
}

/** The rentable-pool truth. A maintenance or retired status is sticky — only the
 *  maintenance pair and retirement move an asset out of those states. */
export function syncAssetStatuses(w: View): void {
  for (const asset of w.assets) {
    if (asset.status === 'retired' || asset.status === 'maintenance') continue;
    const outNow = w.bookings.some(b => b.assetId === asset.id && b.status === 'out');
    const reserved = w.bookings.some(b => b.assetId === asset.id
      && (b.status === 'confirmed' || b.status === 'pending'));
    asset.status = outNow ? 'out' : reserved ? 'reserved' : 'available';
  }
}

export function freezeGate(w: View, protective = false):
  { error: string; detail?: string } | null {
  if (w.workspace.status === 'suspended') return { error: 'WORKSPACE_SUSPENDED' };
  if (w.workspace.onboarded === false) return { error: 'NOT_ONBOARDED' };
  if (!protective && workspaceFrozen(w)) {
    const hold = activeHolds(w).find(h => h.scope === 'workspace');
    return { error: 'WORKSPACE_FROZEN',
      ...(hold === undefined ? {} : { detail: `A ${String(hold.type)} hold stands over the whole workspace: ${String(hold.id)} — "${String(hold.reason)}". Every gated operation waits until it is lifted.` }) };
  }
  return null;
}

/** A gate verdict as the handler's refusal, its detail sentence riding along. */
export const gateFail = (gate: { error: string; detail?: string }): HandlerOut =>
  fail(gate.error, gate.detail === undefined ? {} : { detail: gate.detail });

/** The account freeze as the handler's refusal: the hold named with its reason. */
export function accountFrozenFail(w: View, customerId: string): HandlerOut | null {
  const hold = accountHold(w, customerId);
  if (hold === undefined) return null;
  return fail('ACCOUNT_ON_HOLD', { detail: `The customer account is frozen: ${String(hold.id)} — a ${String(hold.type)} hold for "${String(hold.reason)}". Nothing moves on this account until the hold is lifted.` });
}

export function permGate(w: View,
  capability: 'members' | 'money' | 'dispatch' | 'fleet' | 'plan'): { error: string } | null {
  const role = acting(w)?.role;
  if (caps(typeof role === 'string' ? role : undefined)[capability]) return null;
  return { error: 'PERMISSION_DENIED' };
}

export function audit(w: View, action: string, detail: string): void {
  w.auditLog.push({ seq: w.auditLog.length + 1, action,
    actor: w.actingMemberId, detail });
}

// ── the executor wrapper ──────────────────────────────────────────────────────

export type HandlerOut = { ok: false; error: string } & Row | { ok: true } & Row;

export const fail = (error: string, extra: Row = {}): HandlerOut => ({ ok: false, error, ...extra });
export const okRead = (payload: Row): HandlerOut => ({ ok: true, ...payload });
export const okWrite = (payload: Row): HandlerOut => ({ ok: true, ...payload });

export type Handler = (w: View, args: Readonly<Record<string, Json>>) => HandlerOut;

/** Old-handler semantics on the new seam: run the logic over a cloned w; a fail
 *  is the refusal channel; a success diffs the w into audited patches. */
export function executor(run: Handler) {
  return (ctx: { readonly args: Readonly<Record<string, Json>>; readonly records: StateSnapshot;
                 readonly mintId: (entity: string) => string }):
    { result: Json; patches: Patch[] } | { refuse: Json } => {
    const w = toView(ctx.records);
    const out = run(w, ctx.args);
    if (out.ok === false) {
      const { ok, error, ...extra } = out;
      void ok;
      return { refuse: Object.keys(extra).length > 0 ? { error, ...extra } : error };
    }
    const { ok, ...payload } = out;
    void ok;
    return { result: payload, patches: diffToPatches(ctx.records, w) };
  };
}

export const ASSET_STATUSES_LIST = ['available', 'reserved', 'out', 'maintenance', 'retired'];
export const CLAIM_TYPES = ['damage', 'loss', 'injury', 'late_return'];

export const POLICY_TEXT: Readonly<Record<string, string>> = {
  deposit_refund: 'A security deposit is released only after the asset is returned, the rental invoice is paid in full, and no claim or hold stands against the booking, the asset, or the customer account. An approved or settled claim is deducted from the deposit first; any amount above the deposit is invoiced separately.',
  damage_liability: 'The renter is liable for damage beyond normal wear. Damage found at check-in is recorded as a claim; filing a claim freezes the asset until the claim is resolved. Evidence may be added while the claim is open.',
  hold_release: 'A legal, compliance, safety or payment hold is lifted only once the underlying issue is documented as resolved by an authorized member. Releasing a legal or compliance freeze is high-risk and requires an explicit confirmation of its own.',
  cancellation: 'A booking may be cancelled while it is pending or confirmed. Cancelling frees the asset and voids any technician dispatch attached to it. A booking already out on rental cannot be cancelled — the asset must be checked in first.',
  late_return: 'An asset returned after the booking end date accrues a late fee of half the daily rate per late day. The fee is added to the rental invoice when the invoice is generated.',
  insurance: 'Damage-waiver insurance is optional, priced per asset, and applies only when the customer opts in at quote time. It never replaces the security deposit.'
};
