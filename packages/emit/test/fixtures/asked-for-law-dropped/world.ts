/** atlas-next — the world card: the operations API as records + gates + custom
 *  executors. Handlers carry the AS-IS AtlasWorld's logic over the kit's mutable
 *  view (MAPPING rule 19), with the port's declared additions: the served
 *  refundable figure, the record-family map (TARGET_ENTITY) and the state note.
 *  A fail(code) rides the refusal channel; the view diff lands as audited patches. */
import type { Json } from '@looprun-ai/core';
import { world } from '@looprun-ai/core';
import { BASE_RECORDS, PRESET_PATCHES } from './generated/world-data.js';
import { TOOL_SCHEMAS } from './generated/tool-schemas.js';
import {
  ASSET_STATUSES_LIST, accountFrozenFail, accountHold, activeBookings, activeHolds, assetHold, audit,
  balanceDue, BOOKING_STATUSES, caps, CATEGORIES, CATEGORY_PREFIX, CLAIM_STATUSES, CLAIM_TYPES,
  CONDITIONS, executor, fail, fromDays, gateFail, HOLD_SCOPES, HOLD_TYPES, invoiceFor, INVOICE_STATUSES,
  isValidDate, JOB_TYPES, limits, maintenanceRowOut, maintenanceWindows, money, okRead, okWrite,
  openClaimFor, optString, overlaps, permGate, PLANS, PLAN_LIMITS, POLICY_TEXT, POLICY_TOPICS,
  reqString, ROLES, syncAssetStatuses, TODAY, toDays, freezeGate,
  type Handler, type Row
} from './world-kit.js';

const HANDLERS: Record<string, Handler> = {

  // ── bookings ────────────────────────────────────────────────────────────────

  checkAvailability: (w, a) => {
    const id = reqString(a.assetId, { prefix: 'ast_', code: 'INVALID_ASSET_ID' });
    if ('error' in id) return fail(id.error);
    const s = reqString(a.startDate, { date: true, code: 'INVALID_DATE' });
    if ('error' in s) return fail(s.error);
    const e = reqString(a.endDate, { date: true, code: 'INVALID_DATE' });
    if ('error' in e) return fail(e.error);
    if (!isValidDate(s.value) || !isValidDate(e.value)) return fail('INVALID_DATE');
    if (toDays(s.value) >= toDays(e.value)) return fail('INVALID_DATE_RANGE');
    const asset = w.assets.find(x => x.id === id.value);
    if (!asset) return fail('NOT_FOUND_ASSET');

    const conflicts = w.bookings
      .filter(b => b.assetId === asset.id && BOOKING_ACTIVE.includes(String(b.status))
        && overlaps(s.value, e.value, String(b.startDate), String(b.endDate)))
      .map(b => ({ bookingId: b.id, startDate: b.startDate, endDate: b.endDate, status: b.status }));
    const windows = maintenanceWindows(w, String(asset.id))
      .filter(m => overlaps(s.value, e.value, String(m.startDate), String(m.endDate)))
      .map(m => ({ startDate: m.startDate, endDate: m.endDate, reason: m.reason }));
    const blockingHolds = activeHolds(w)
      .filter(h => h.scope === 'workspace' || (h.scope === 'asset' && h.assetId === asset.id))
      .map(h => ({ holdId: h.id, type: h.type, scope: h.scope, reason: h.reason }));

    const available = asset.status !== 'retired' && conflicts.length === 0
      && windows.length === 0 && blockingHolds.length === 0;
    return okRead({
      assetId: asset.id, assetName: asset.name, startDate: s.value, endDate: e.value,
      available, assetStatus: asset.status,
      conflictingBookings: conflicts, maintenanceWindows: windows, holds: blockingHolds,
      dailyRate: asset.dailyRate, requiredDeposit: asset.requiredDeposit
    });
  },

  listBookings: (w, a) => {
    const st = optString(a.status, { allowed: BOOKING_STATUSES, code: 'INVALID_BOOKING_STATUS' });
    if ('error' in st) return fail(st.error);
    const filter = 'value' in st ? st.value : null;
    const rows = w.bookings
      .filter(b => (filter !== null ? b.status === filter : true))
      .map(b => ({ id: b.id, assetId: b.assetId, customerId: b.customerId,
        startDate: b.startDate, endDate: b.endDate, status: b.status,
        technicianDispatched: b.dispatch !== null }));
    return okRead({ statusFilter: filter, count: rows.length, bookings: rows });
  },

  getBooking: (w, a) => {
    const id = reqString(a.bookingId, { prefix: 'bk_', code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error);
    const b = w.bookings.find(x => x.id === id.value);
    if (!b) return okRead({ found: false });
    const asset = w.assets.find(x => x.id === b.assetId);
    const inv = invoiceFor(w, String(b.id));
    const claim = openClaimFor(w, String(b.id));
    return okRead({
      found: true,
      booking: {
        id: b.id, assetId: b.assetId, assetName: asset?.name ?? null, customerId: b.customerId,
        startDate: b.startDate, endDate: b.endDate, status: b.status,
        conditionOut: b.conditionOut, conditionIn: b.conditionIn, returnedDate: b.returnedDate,
        dispatch: b.dispatch, quoteId: b.quoteId, invoiceId: inv?.id ?? null,
        invoiceStatus: inv?.status ?? null, invoiceBalanceDue: inv ? balanceDue(inv) : null,
        depositHeld: b.depositHeld, depositRequired: asset?.requiredDeposit ?? 0,
        openClaimId: claim?.id ?? null,
        activeHolds: activeHolds(w)
          .filter(h => h.scope === 'workspace'
            || (h.scope === 'asset' && h.assetId === b.assetId)
            || (h.scope === 'account' && h.customerId === b.customerId))
          .map(h => ({ holdId: h.id, type: h.type, scope: h.scope, reason: h.reason }))
      }
    });
  },

  createBooking: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const assetId = reqString(a.assetId, { prefix: 'ast_', code: 'INVALID_ASSET_ID' });
    if ('error' in assetId) return fail(assetId.error);
    const custId = reqString(a.customerId, { prefix: 'cust_', code: 'INVALID_CUSTOMER_ID' });
    if ('error' in custId) return fail(custId.error);
    const s = reqString(a.startDate, { date: true, code: 'INVALID_DATE' });
    if ('error' in s) return fail(s.error);
    const e = reqString(a.endDate, { date: true, code: 'INVALID_DATE' });
    if ('error' in e) return fail(e.error);
    const q = optString(a.quoteId, { prefix: 'qt_', code: 'INVALID_QUOTE_ID' });
    if ('error' in q) return fail(q.error);
    if (!isValidDate(s.value) || !isValidDate(e.value)) return fail('INVALID_DATE');
    if (toDays(s.value) >= toDays(e.value)) return fail('INVALID_DATE_RANGE');
    if (toDays(s.value) < toDays(TODAY)) return fail('DATE_IN_PAST');

    const asset = w.assets.find(x => x.id === assetId.value);
    if (!asset) return fail('NOT_FOUND_ASSET');
    const cust = w.customers.find(x => x.id === custId.value);
    if (!cust) return fail('NOT_FOUND_CUSTOMER');
    if ('value' in q && !w.quotes.find(x => x.id === q.value)) return fail('NOT_FOUND_QUOTE');

    if (asset.status === 'retired') return fail('ASSET_RETIRED');
    if (assetHold(w, String(asset.id))) return fail('ASSET_ON_HOLD');
    { const frozen = accountFrozenFail(w, String(cust.id)); if (frozen) return frozen; }
    const mw = maintenanceWindows(w, String(asset.id)).find(m =>
      overlaps(s.value, e.value, String(m.startDate), String(m.endDate)));
    if (mw) return fail('ASSET_IN_MAINTENANCE');
    const clash = w.bookings.find(b => b.assetId === asset.id
      && BOOKING_ACTIVE.includes(String(b.status))
      && overlaps(s.value, e.value, String(b.startDate), String(b.endDate)));
    if (clash) return fail('ASSET_UNAVAILABLE');

    const lim = limits(w);
    if (activeBookings(w).length >= lim.bookings) return fail('BOOKING_QUOTA_EXCEEDED');

    w.counters.booking += 1;
    const id = `bk_${String(w.counters.booking)}`;
    const quote = 'value' in q ? w.quotes.find(x => x.id === q.value) : undefined;
    w.bookings.push({
      id, assetId: asset.id, customerId: cust.id, startDate: s.value, endDate: e.value,
      status: 'confirmed', depositHeld: 0, quoteId: 'value' in q ? q.value : null, invoiceId: null,
      conditionOut: null, conditionIn: null, returnedDate: null,
      includeDelivery: quote ? quote.includeDelivery === true : true,
      includeInsurance: quote ? quote.includeInsurance === true : false,
      dispatch: null
    });
    syncAssetStatuses(w);
    audit(w, 'createBooking', `${id} created for ${String(cust.id)} on ${String(asset.id)}`);
    return okWrite({
      id, bookingId: id, status: 'confirmed', assetId: asset.id, customerId: cust.id,
      startDate: s.value, endDate: e.value, requiredDeposit: asset.requiredDeposit,
      quoteId: 'value' in q ? q.value : null
    });
  },

  rescheduleBooking: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const id = reqString(a.bookingId, { prefix: 'bk_', code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error);
    const s = reqString(a.startDate, { date: true, code: 'INVALID_DATE' });
    if ('error' in s) return fail(s.error);
    const e = reqString(a.endDate, { date: true, code: 'INVALID_DATE' });
    if ('error' in e) return fail(e.error);
    if (!isValidDate(s.value) || !isValidDate(e.value)) return fail('INVALID_DATE');
    if (toDays(s.value) >= toDays(e.value)) return fail('INVALID_DATE_RANGE');
    const b = w.bookings.find(x => x.id === id.value);
    if (!b) return fail('NOT_FOUND_BOOKING');
    if (!['pending', 'confirmed'].includes(String(b.status))) return fail('BOOKING_NOT_RESCHEDULABLE');
    if (assetHold(w, String(b.assetId))) return fail('ASSET_ON_HOLD');
    const mw = maintenanceWindows(w, String(b.assetId)).find(m =>
      overlaps(s.value, e.value, String(m.startDate), String(m.endDate)));
    if (mw) return fail('ASSET_IN_MAINTENANCE');
    const clash = w.bookings.find(o => o.id !== b.id && o.assetId === b.assetId
      && BOOKING_ACTIVE.includes(String(o.status))
      && overlaps(s.value, e.value, String(o.startDate), String(o.endDate)));
    if (clash) return fail('ASSET_UNAVAILABLE');

    const before = { startDate: b.startDate, endDate: b.endDate };
    b.startDate = s.value;
    b.endDate = e.value;
    audit(w, 'rescheduleBooking', `${String(b.id)} moved to ${s.value}…${e.value}`);
    return okWrite({ bookingId: b.id, previous: before, startDate: b.startDate,
      endDate: b.endDate, status: b.status });
  },

  cancelBooking: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const id = reqString(a.bookingId, { prefix: 'bk_', code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error);
    const b = w.bookings.find(x => x.id === id.value);
    if (!b) return fail('NOT_FOUND_BOOKING');
    if (!['pending', 'confirmed'].includes(String(b.status))) return fail('BOOKING_NOT_CANCELLABLE');

    b.status = 'cancelled';
    const voided = b.dispatch as { technicianId: string } | null;
    if (voided) {
      const tech = w.technicians.find(t => t.id === voided.technicianId);
      if (tech) tech.jobs = (tech.jobs as Row[]).filter(j => j.bookingId !== b.id);
      b.dispatch = null;
    }
    syncAssetStatuses(w);
    audit(w, 'cancelBooking', `${String(b.id)} cancelled`);
    return okWrite({ bookingId: b.id, status: 'cancelled', assetFreed: b.assetId,
      dispatchVoided: voided !== null, depositStillHeld: b.depositHeld });
  },

  checkOutAsset: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const id = reqString(a.bookingId, { prefix: 'bk_', code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error);
    const cond = optString(a.conditionOut, { allowed: CONDITIONS, code: 'INVALID_CONDITION' });
    if ('error' in cond) return fail(cond.error);
    const b = w.bookings.find(x => x.id === id.value);
    if (!b) return fail('NOT_FOUND_BOOKING');
    if (b.status !== 'confirmed') return fail('BOOKING_NOT_CONFIRMED');
    if (assetHold(w, String(b.assetId))) return fail('ASSET_ON_HOLD');
    { const frozen = accountFrozenFail(w, String(b.customerId)); if (frozen) return frozen; }
    const asset = w.assets.find(x => x.id === b.assetId);
    if (!asset) return fail('NOT_FOUND_ASSET');
    if (Number(b.depositHeld) < Number(asset.requiredDeposit)) return fail('DEPOSIT_NOT_COVERED');

    b.status = 'out';
    b.conditionOut = 'value' in cond ? cond.value : asset.condition;
    syncAssetStatuses(w);
    audit(w, 'checkOutAsset', `${String(b.id)} checked out (${String(b.conditionOut)})`);
    return okWrite({ id: b.id, bookingId: b.id, status: 'out', assetId: b.assetId,
      conditionOut: b.conditionOut, depositHeld: b.depositHeld });
  },

  checkInAsset: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const id = reqString(a.bookingId, { prefix: 'bk_', code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error);
    const cond = reqString(a.conditionIn, { allowed: CONDITIONS, code: 'INVALID_CONDITION' });
    if ('error' in cond) return fail(cond.error);
    const ret = optString(a.returnedDate, { date: true, code: 'INVALID_DATE' });
    if ('error' in ret) return fail(ret.error);
    const notes = optString(a.notes, { code: null });
    const b = w.bookings.find(x => x.id === id.value);
    if (!b) return fail('NOT_FOUND_BOOKING');
    if (b.status !== 'out') return fail('BOOKING_NOT_OUT');
    if ('value' in ret && !isValidDate(ret.value)) return fail('INVALID_DATE');
    if ('value' in ret) {
      const latest = Math.max(toDays(TODAY), toDays(String(b.endDate)));
      if (toDays(ret.value) < toDays(String(b.startDate)) || toDays(ret.value) > latest) {
        return fail('RETURN_DATE_OUT_OF_RANGE');
      }
    }

    const returned = 'value' in ret ? ret.value : String(b.endDate);
    b.status = 'returned';
    b.conditionIn = cond.value;
    b.returnedDate = returned;
    const asset = w.assets.find(x => x.id === b.assetId);
    if (asset) asset.condition = cond.value;
    syncAssetStatuses(w);
    const lateDays = Math.max(0, toDays(returned) - toDays(String(b.endDate)));
    audit(w, 'checkInAsset', `${String(b.id)} returned ${returned} (${cond.value})`);
    return okWrite({
      id: b.id, bookingId: b.id, status: 'returned', assetId: b.assetId, conditionIn: cond.value,
      returnedDate: returned, lateDays,
      accruedLateFee: money(lateDays * Number(asset?.dailyRate ?? 0) * 0.5),
      notes: 'value' in notes ? notes.value : null,
      invoiceable: true, depositHeld: b.depositHeld,
      damageSuspected: cond.value === 'poor' || cond.value === 'damaged'
    });
  },

  closeBooking: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const id = reqString(a.bookingId, { prefix: 'bk_', code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error);
    const b = w.bookings.find(x => x.id === id.value);
    if (!b) return fail('NOT_FOUND_BOOKING');
    if (b.status !== 'returned') return fail('BOOKING_NOT_RETURNED');
    const inv = invoiceFor(w, String(b.id));
    if (!inv || inv.status !== 'paid') return fail('CLOSE_BLOCKED_INVOICE_UNPAID');
    if (Number(b.depositHeld) > 0) return fail('CLOSE_BLOCKED_DEPOSIT_HELD');
    if (openClaimFor(w, String(b.id))) return fail('CLOSE_BLOCKED_OPEN_CLAIM');

    b.status = 'closed';
    syncAssetStatuses(w);
    audit(w, 'closeBooking', `${String(b.id)} closed`);
    return okWrite({ bookingId: b.id, status: 'closed' });
  },

  // ── field ops ───────────────────────────────────────────────────────────────

  listTechnicians: (w, a) => {
    const skill = optString(a.skill, { code: null });
    const filter = 'value' in skill ? skill.value : null;
    const folded = filter === null ? null : filter.toLowerCase();
    const rows = w.technicians
      .filter(t => (folded !== null
        ? (t.skills as string[]).some(s => s.toLowerCase().includes(folded)) : true))
      .map(t => ({
        id: t.id, name: t.name, skills: t.skills, homeBase: t.homeBase,
        jobsToday: (t.jobs as Row[]).filter(j => j.date === TODAY).length,
        totalScheduledJobs: (t.jobs as Row[]).length
      }));
    return okRead({ skillFilter: filter, count: rows.length, technicians: rows });
  },

  getTechnicianSchedule: (w, a) => {
    const id = reqString(a.technicianId, { prefix: 'tech_', code: 'INVALID_TECHNICIAN_ID' });
    if ('error' in id) return fail(id.error);
    const s = reqString(a.startDate, { date: true, code: 'INVALID_DATE' });
    if ('error' in s) return fail(s.error);
    const e = reqString(a.endDate, { date: true, code: 'INVALID_DATE' });
    if ('error' in e) return fail(e.error);
    if (!isValidDate(s.value) || !isValidDate(e.value)) return fail('INVALID_DATE');
    if (toDays(s.value) >= toDays(e.value)) return fail('INVALID_DATE_RANGE');
    const t = w.technicians.find(x => x.id === id.value);
    if (!t) return okRead({ found: false });

    const from = toDays(s.value);
    const to = toDays(e.value);
    const jobs = (t.jobs as Row[]).filter(j =>
      toDays(String(j.date)) >= from && toDays(String(j.date)) <= to);
    const busy = new Set(jobs.map(j => String(j.date)));
    const freeDays: string[] = [];
    for (let d = from; d <= to; d += 1) {
      const iso = fromDays(d);
      if (!busy.has(iso)) freeDays.push(iso);
    }
    return okRead({ found: true, technicianId: t.id, name: t.name,
      startDate: s.value, endDate: e.value, jobs: jobs as unknown as Json, freeDays });
  },

  dispatchTechnician: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const perm = permGate(w, 'dispatch');
    if (perm) return fail(perm.error);
    const bId = reqString(a.bookingId, { prefix: 'bk_', code: 'INVALID_BOOKING_ID' });
    if ('error' in bId) return fail(bId.error);
    const tId = reqString(a.technicianId, { prefix: 'tech_', code: 'INVALID_TECHNICIAN_ID' });
    if ('error' in tId) return fail(tId.error);
    const d = reqString(a.scheduledDate, { date: true, code: 'INVALID_DATE' });
    if ('error' in d) return fail(d.error);
    const jt = optString(a.jobType, { allowed: JOB_TYPES, code: 'INVALID_JOB_TYPE' });
    if ('error' in jt) return fail(jt.error);
    if (!isValidDate(d.value)) return fail('INVALID_DATE');
    const b = w.bookings.find(x => x.id === bId.value);
    if (!b) return fail('NOT_FOUND_BOOKING');
    const t = w.technicians.find(x => x.id === tId.value);
    if (!t) return fail('NOT_FOUND_TECHNICIAN');
    if (['cancelled', 'closed'].includes(String(b.status))) return fail('BOOKING_NOT_DISPATCHABLE');
    const clash = (t.jobs as Row[]).find(j => j.date === d.value && j.bookingId !== b.id);
    if (clash) return fail('TECHNICIAN_DOUBLE_BOOKED');

    const jobType = 'value' in jt ? jt.value : 'delivery';
    const previous = b.dispatch as { technicianId: string } | null;
    if (previous) {
      const prevTech = w.technicians.find(x => x.id === previous.technicianId);
      if (prevTech) prevTech.jobs = (prevTech.jobs as Row[]).filter(j => j.bookingId !== b.id);
    }
    (t.jobs as Row[]).push({ bookingId: b.id, date: d.value, jobType });
    b.dispatch = { technicianId: String(t.id), scheduledDate: d.value, jobType };
    audit(w, 'dispatchTechnician', `${String(t.id)} → ${String(b.id)} on ${d.value} (${jobType})`);
    return okWrite({ id: b.id, bookingId: b.id, technicianId: t.id, technicianName: t.name,
      scheduledDate: d.value, jobType, reassignedFrom: previous?.technicianId ?? null });
  },

  cancelDispatch: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const perm = permGate(w, 'dispatch');
    if (perm) return fail(perm.error);
    const id = reqString(a.bookingId, { prefix: 'bk_', code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error);
    const b = w.bookings.find(x => x.id === id.value);
    if (!b) return fail('NOT_FOUND_BOOKING');
    const removed = b.dispatch as { technicianId: string; scheduledDate: string } | null;
    if (!removed) return fail('NO_DISPATCH');

    const tech = w.technicians.find(t => t.id === removed.technicianId);
    if (tech) tech.jobs = (tech.jobs as Row[]).filter(j => j.bookingId !== b.id);
    b.dispatch = null;
    audit(w, 'cancelDispatch', `${removed.technicianId} removed from ${String(b.id)}`);
    return okWrite({ id: b.id, bookingId: b.id, removedTechnicianId: removed.technicianId,
      freedDate: removed.scheduledDate });
  },

  // ── quotes and invoices ─────────────────────────────────────────────────────

  generateQuote: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const id = reqString(a.assetId, { prefix: 'ast_', code: 'INVALID_ASSET_ID' });
    if ('error' in id) return fail(id.error);
    const s = reqString(a.startDate, { date: true, code: 'INVALID_DATE' });
    if ('error' in s) return fail(s.error);
    const e = reqString(a.endDate, { date: true, code: 'INVALID_DATE' });
    if ('error' in e) return fail(e.error);
    if (!isValidDate(s.value) || !isValidDate(e.value)) return fail('INVALID_DATE');
    if (toDays(s.value) >= toDays(e.value)) return fail('INVALID_DATE_RANGE');
    const asset = w.assets.find(x => x.id === id.value);
    if (!asset) return fail('NOT_FOUND_ASSET');

    if (!(a.includeDelivery === true || a.includeDelivery === false
      || a.includeDelivery === 'true' || a.includeDelivery === 'false')) {
      return fail('MISSING_DELIVERY_CHOICE');
    }
    const includeDelivery = a.includeDelivery === true || a.includeDelivery === 'true';
    const includeInsurance = a.includeInsurance === true || a.includeInsurance === 'true';
    const billableDays = Math.max(1, toDays(e.value) - toDays(s.value));
    const rental = money(Number(asset.dailyRate) * billableDays);
    const delivery = includeDelivery ? Number(asset.deliveryFee) : 0;
    const insurance = includeInsurance ? Number(asset.insuranceFee) : 0;
    const total = money(rental + delivery + insurance);
    w.counters.quote += 1;
    const qid = `qt_${String(w.counters.quote)}`;
    const quote = {
      id: qid, assetId: asset.id, assetName: asset.name, startDate: s.value, endDate: e.value,
      dailyRate: asset.dailyRate, billableDays, rental, deliveryFee: delivery,
      insuranceFee: insurance, total, securityDeposit: asset.requiredDeposit,
      includeDelivery, includeInsurance
    };
    w.quotes.push(quote);
    audit(w, 'generateQuote', `${qid} for ${String(asset.id)} (${String(total)})`);
    return okWrite({ quoteId: qid, ...quote });
  },

  getQuote: (w, a) => {
    const q = optString(a.quoteId, { prefix: 'qt_', code: 'INVALID_QUOTE_ID' });
    if ('error' in q) return fail(q.error);
    if (!('value' in q)) return okRead({ count: w.quotes.length, quotes: w.quotes as unknown as Json });
    const quote = w.quotes.find(x => x.id === q.value);
    if (!quote) return okRead({ found: false });
    return okRead({ found: true, quote });
  },

  generateInvoice: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const id = reqString(a.bookingId, { prefix: 'bk_', code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error);
    const b = w.bookings.find(x => x.id === id.value);
    if (!b) return fail('NOT_FOUND_BOOKING');
    const existing = invoiceFor(w, String(b.id));
    if (existing) {
      return okWrite({ idempotent: true, invoiceId: existing.id, alreadyExisted: true,
        status: existing.status, total: existing.total, balanceDue: balanceDue(existing),
        lineItems: existing.lineItems, lateFee: existing.lateFee });
    }
    if (b.status !== 'returned') return fail('BOOKING_NOT_RETURNED');

    const asset = w.assets.find(x => x.id === b.assetId);
    if (!asset) return fail('NOT_FOUND_ASSET');
    const billableDays = Math.max(1, toDays(String(b.endDate)) - toDays(String(b.startDate)));
    const rental = money(Number(asset.dailyRate) * billableDays);
    const lines: { label: string; amount: number }[] =
      [{ label: `rental (${String(billableDays)} days × ${String(asset.dailyRate)})`, amount: rental }];
    if (b.includeDelivery === true) lines.push({ label: 'delivery', amount: Number(asset.deliveryFee) });
    if (b.includeInsurance === true) {
      lines.push({ label: 'damage-waiver insurance', amount: Number(asset.insuranceFee) });
    }
    const lateDays = Math.max(0,
      toDays(String(b.returnedDate ?? b.endDate)) - toDays(String(b.endDate)));
    const lateFee = money(lateDays * Number(asset.dailyRate) * 0.5);
    if (lateFee > 0) {
      lines.push({ label: `late fee (${String(lateDays)} days × ${String(asset.dailyRate)} × 0.5)`,
        amount: lateFee });
    }
    const total = money(lines.reduce((s2, l) => s2 + l.amount, 0));

    w.counters.invoice += 1;
    const invId = `inv_${String(w.counters.invoice)}`;
    w.invoices.push({ id: invId, bookingId: b.id, lineItems: lines as unknown as Json,
      lateFee, total, amountPaid: 0, refunded: 0, status: 'issued',
      idempotencyKeys: [], refundReason: null });
    b.invoiceId = invId;
    const cust = w.customers.find(c => c.id === b.customerId);
    if (cust) cust.outstandingBalance = money(Number(cust.outstandingBalance) + total);
    audit(w, 'generateInvoice', `${invId} issued for ${String(b.id)} (${String(total)})`);
    return okWrite({ id: invId, invoiceId: invId, bookingId: b.id, status: 'issued',
      lineItems: lines as unknown as Json, lateDays, lateFee, total, balanceDue: total });
  },

  listInvoices: (w, a) => {
    const st = optString(a.status, { allowed: INVOICE_STATUSES, code: 'INVALID_INVOICE_STATUS' });
    if ('error' in st) return fail(st.error);
    const filter = 'value' in st ? st.value : null;
    const rows = w.invoices
      .filter(i => (filter !== null ? i.status === filter : true))
      .map(i => ({ id: i.id, bookingId: i.bookingId, total: i.total,
        amountPaid: i.amountPaid, balanceDue: balanceDue(i), status: i.status }));
    return okRead({ statusFilter: filter, count: rows.length, invoices: rows });
  },

  getInvoice: (w, a) => {
    const id = reqString(a.invoiceId, { prefix: 'inv_', code: 'INVALID_INVOICE_ID' });
    if ('error' in id) return fail(id.error);
    const i = w.invoices.find(x => x.id === id.value);
    if (!i) return okRead({ found: false });
    return okRead({
      found: true,
      invoice: {
        id: i.id, bookingId: i.bookingId, lineItems: i.lineItems,
        subtotal: money(Number(i.total) - Number(i.lateFee)), lateFee: i.lateFee, total: i.total,
        amountPaid: i.amountPaid, refunded: i.refunded,
        refundable: money(Number(i.amountPaid) - Number(i.refunded)),
        balanceDue: balanceDue(i), status: i.status
      }
    });
  },

  // ── deposits and payments ───────────────────────────────────────────────────

  getDepositBalance: (w, a) => {
    const id = optString(a.bookingId, { prefix: 'bk_', code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error);
    const lim = limits(w);
    if (!('value' in id)) {
      const held = w.bookings.reduce((s, b) => s + Number(b.depositHeld ?? 0), 0);
      return okRead({
        scope: 'workspace', totalHeld: held,
        totalRequired: money(activeBookings(w).reduce((s, b) => {
          const asset = w.assets.find(x => x.id === b.assetId);
          return s + Number(asset?.requiredDeposit ?? 0);
        }, 0)),
        depositFloatLimit: lim.float, depositFloatRemaining: money(lim.float - held),
        plan: w.workspace.plan
      });
    }
    const b = w.bookings.find(x => x.id === id.value);
    if (!b) return okRead({ found: false });
    const asset = w.assets.find(x => x.id === b.assetId);
    const required = Number(asset?.requiredDeposit ?? 0);
    return okRead({
      found: true, scope: 'booking', bookingId: b.id, assetId: b.assetId,
      required, held: b.depositHeld,
      shortfall: money(Math.max(0, required - Number(b.depositHeld))),
      bookingStatus: b.status
    });
  },

  chargeDeposit: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const perm = permGate(w, 'money');
    if (perm) return fail(perm.error);
    const id = reqString(a.bookingId, { prefix: 'bk_', code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error);
    const b = w.bookings.find(x => x.id === id.value);
    if (!b) return fail('NOT_FOUND_BOOKING');
    const asset = w.assets.find(x => x.id === b.assetId);
    if (!asset) return fail('NOT_FOUND_ASSET');
    { const frozen = accountFrozenFail(w, String(b.customerId)); if (frozen) return frozen; }
    if (a.amount !== undefined && (typeof a.amount !== 'number' || a.amount < 0)) {
      return fail('INVALID_AMOUNT');
    }
    const required = Number(asset.requiredDeposit);
    const shortfall = money(Math.max(0, required - Number(b.depositHeld)));
    if (shortfall === 0) {
      if (a.amount !== undefined) return fail('DEPOSIT_ALREADY_COVERED');
      return okWrite({ idempotent: true, bookingId: b.id, alreadyHeld: true,
        held: b.depositHeld, required, charged: 0 });
    }
    const amount = money(typeof a.amount === 'number' ? a.amount : shortfall);
    if (amount === 0) return fail('INVALID_AMOUNT');
    const lim = limits(w);
    const floatHeld = w.bookings.reduce((s, x) => s + Number(x.depositHeld ?? 0), 0);
    if (amount > money(lim.float - floatHeld)) return fail('DEPOSIT_FLOAT_EXCEEDED');

    b.depositHeld = money(Number(b.depositHeld) + amount);
    audit(w, 'chargeDeposit', `${String(amount)} held for ${String(b.id)}`);
    return okWrite({ bookingId: b.id, charged: amount, held: b.depositHeld, required,
      shortfall: money(Math.max(0, required - Number(b.depositHeld))) });
  },

  releaseDeposit: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const perm = permGate(w, 'money');
    if (perm) return fail(perm.error);
    const id = reqString(a.bookingId, { prefix: 'bk_', code: 'INVALID_BOOKING_ID' });
    if ('error' in id) return fail(id.error);
    const b = w.bookings.find(x => x.id === id.value);
    if (!b) return fail('NOT_FOUND_BOOKING');
    if (a.amount !== undefined && (typeof a.amount !== 'number' || a.amount < 0)) {
      return fail('INVALID_AMOUNT');
    }
    if (Number(b.depositHeld) <= 0) return fail('NO_DEPOSIT_HELD');
    if (!['returned', 'closed', 'cancelled'].includes(String(b.status))) {
      return fail('DEPOSIT_RELEASE_BLOCKED_NOT_RETURNED');
    }
    const inv = invoiceFor(w, String(b.id));
    if (b.status !== 'cancelled' && (!inv || inv.status !== 'paid')) {
      return fail('DEPOSIT_RELEASE_BLOCKED_INVOICE_UNPAID');
    }
    if (openClaimFor(w, String(b.id))) return fail('DEPOSIT_RELEASE_BLOCKED_CLAIM');
    if (assetHold(w, String(b.assetId))) return fail('DEPOSIT_RELEASE_BLOCKED_HOLD');
    { const frozen = accountFrozenFail(w, String(b.customerId)); if (frozen) return frozen; }

    const amount = money(typeof a.amount === 'number'
      ? Math.min(a.amount, Number(b.depositHeld)) : Number(b.depositHeld));
    if (amount === 0) return fail('INVALID_AMOUNT');

    b.depositHeld = money(Number(b.depositHeld) - amount);
    audit(w, 'releaseDeposit', `${String(amount)} released for ${String(b.id)}`);
    return okWrite({ bookingId: b.id, released: amount, stillHeld: b.depositHeld });
  },

  payInvoice: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const perm = permGate(w, 'money');
    if (perm) return fail(perm.error);
    const id = reqString(a.invoiceId, { prefix: 'inv_', code: 'INVALID_INVOICE_ID' });
    if ('error' in id) return fail(id.error);
    const key = optString(a.idempotencyKey, { code: null });
    const inv = w.invoices.find(x => x.id === id.value);
    if (!inv) return fail('NOT_FOUND_INVOICE');
    if ('value' in key && (inv.idempotencyKeys as string[]).includes(key.value)) {
      return okWrite({ idempotent: true, invoiceId: inv.id, idempotentReplay: true,
        status: inv.status, amountPaid: inv.amountPaid, balanceDue: balanceDue(inv) });
    }
    if (inv.status === 'void') return fail('INVOICE_VOID');
    if (inv.status === 'paid') return fail('INVOICE_ALREADY_PAID');
    if (a.amount !== undefined && (typeof a.amount !== 'number' || a.amount < 0)) {
      return fail('INVALID_AMOUNT');
    }
    const due = balanceDue(inv);
    const amount = money(typeof a.amount === 'number' ? Math.min(a.amount, due) : due);
    if (amount === 0) return fail('INVALID_AMOUNT');

    inv.amountPaid = money(Number(inv.amountPaid) + amount);
    inv.status = balanceDue(inv) === 0 ? 'paid' : 'partially_paid';
    if ('value' in key) (inv.idempotencyKeys as string[]).push(key.value);
    const b = w.bookings.find(x => x.id === inv.bookingId);
    const cust = b ? w.customers.find(c => c.id === b.customerId) : undefined;
    if (cust) cust.outstandingBalance = money(Math.max(0, Number(cust.outstandingBalance) - amount));
    audit(w, 'payInvoice', `${String(amount)} paid against ${String(inv.id)}`);
    return okWrite({ invoiceId: inv.id, paid: amount, amountPaid: inv.amountPaid,
      balanceDue: balanceDue(inv), status: inv.status });
  },

  issueRefund: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const perm = permGate(w, 'money');
    if (perm) return fail(perm.error);
    const id = reqString(a.invoiceId, { prefix: 'inv_', code: 'INVALID_INVOICE_ID' });
    if ('error' in id) return fail(id.error);
    const reason = optString(a.reason, { code: null });
    const inv = w.invoices.find(x => x.id === id.value);
    if (!inv) return fail('NOT_FOUND_INVOICE');
    if (typeof a.amount !== 'number' || a.amount < 0) return fail('INVALID_AMOUNT');
    const refundable = money(Number(inv.amountPaid) - Number(inv.refunded));
    if (refundable <= 0) return fail('NOTHING_PAID');
    const amount = money(a.amount);
    if (amount === 0) return fail('INVALID_AMOUNT');
    if (amount > refundable) return fail('REFUND_EXCEEDS_PAID');
    const b = w.bookings.find(x => x.id === inv.bookingId);
    if (b) { const frozen = accountFrozenFail(w, String(b.customerId)); if (frozen) return frozen; }

    inv.refunded = money(Number(inv.refunded) + amount);
    inv.refundReason = 'value' in reason ? reason.value : null;
    audit(w, 'issueRefund', `${String(amount)} refunded on ${String(inv.id)}`);
    return okWrite({ invoiceId: inv.id, refunded: amount, totalRefunded: inv.refunded,
      amountPaid: inv.amountPaid, status: inv.status, reason: inv.refundReason });
  },

  voidInvoice: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const perm = permGate(w, 'money');
    if (perm) return fail(perm.error);
    const id = reqString(a.invoiceId, { prefix: 'inv_', code: 'INVALID_INVOICE_ID' });
    if ('error' in id) return fail(id.error);
    const inv = w.invoices.find(x => x.id === id.value);
    if (!inv) return fail('NOT_FOUND_INVOICE');
    if (inv.status === 'paid') return fail('INVOICE_PAID_CANNOT_VOID');
    if (inv.status === 'void') return fail('INVOICE_ALREADY_VOID');
    if (Number(inv.amountPaid) > 0) return fail('INVOICE_PARTIALLY_PAID');

    inv.status = 'void';
    const b = w.bookings.find(x => x.id === inv.bookingId);
    const cust = b ? w.customers.find(c => c.id === b.customerId) : undefined;
    if (cust) {
      cust.outstandingBalance = money(Math.max(0, Number(cust.outstandingBalance) - Number(inv.total)));
    }
    if (b) b.invoiceId = null;
    audit(w, 'voidInvoice', `${String(inv.id)} voided`);
    return okWrite({ invoiceId: inv.id, status: 'void' });
  },

  // ── claims ──────────────────────────────────────────────────────────────────

  listClaims: (w, a) => {
    const st = optString(a.status, { allowed: CLAIM_STATUSES, code: 'INVALID_CLAIM_STATUS' });
    if ('error' in st) return fail(st.error);
    const filter = 'value' in st ? st.value : null;
    const rows = w.claims
      .filter(c => (filter !== null ? c.status === filter : true))
      .map(c => ({ id: c.id, type: c.type, status: c.status,
        bookingId: c.bookingId, assetId: c.assetId }));
    return okRead({ statusFilter: filter, count: rows.length, claims: rows });
  },

  getClaim: (w, a) => {
    const id = reqString(a.claimId, { prefix: 'clm_', code: 'INVALID_CLAIM_ID' });
    if ('error' in id) return fail(id.error);
    const c = w.claims.find(x => x.id === id.value);
    if (!c) return okRead({ found: false });
    return okRead({
      found: true,
      claim: { id: c.id, type: c.type, status: c.status, description: c.description,
        evidence: c.evidence, bookingId: c.bookingId, assetId: c.assetId,
        customerId: c.customerId, settlementAmount: c.settlementAmount, holdId: c.holdId }
    });
  },

  fileClaim: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const type = reqString(a.type, { allowed: CLAIM_TYPES, code: 'INVALID_CLAIM_TYPE' });
    if ('error' in type) return fail(type.error);
    const desc = reqString(a.description, { code: 'MISSING_DESCRIPTION' });
    if ('error' in desc) return fail(desc.error);
    const bId = optString(a.bookingId, { prefix: 'bk_', code: 'INVALID_BOOKING_ID' });
    if ('error' in bId) return fail(bId.error);
    const aId = optString(a.assetId, { prefix: 'ast_', code: 'INVALID_ASSET_ID' });
    if ('error' in aId) return fail(aId.error);
    if (!('value' in bId) && !('value' in aId)) return fail('MISSING_CLAIM_TARGET');

    let booking: Row | undefined;
    if ('value' in bId) {
      booking = w.bookings.find(x => x.id === bId.value);
      if (!booking) return fail('NOT_FOUND_BOOKING');
    }
    const assetId: string | null = 'value' in aId ? aId.value
      : (booking !== undefined ? String(booking.assetId) : null);
    if (assetId !== null && !w.assets.find(x => x.id === assetId)) return fail('NOT_FOUND_ASSET');
    const evidence = Array.isArray(a.evidence)
      ? (a.evidence as unknown[]).filter((x): x is string => typeof x === 'string') : [];

    w.counters.claim += 1;
    const cid = `clm_${String(w.counters.claim)}`;
    w.counters.hold += 1;
    const hid = `hold_${String(w.counters.hold)}`;
    w.claims.push({
      id: cid, type: type.value, description: desc.value,
      bookingId: booking !== undefined ? booking.id : null, assetId,
      customerId: booking !== undefined ? booking.customerId : null,
      status: 'submitted', evidence, settlementAmount: null,
      holdId: assetId !== null ? hid : null
    });
    if (assetId !== null) {
      w.holds.push({ id: hid, type: 'safety', scope: 'asset',
        reason: `investigatory hold for claim ${cid}`, assetId, customerId: null,
        active: true, auto: true });
    }
    audit(w, 'fileClaim', `${cid} filed (${type.value})`
      + (assetId !== null ? `, ${assetId} frozen by ${hid}` : ''));
    return okWrite({ id: cid, claimId: cid, status: 'submitted', type: type.value,
      bookingId: booking !== undefined ? booking.id : null, assetId, evidence,
      assetFrozen: assetId !== null, holdId: assetId !== null ? hid : null });
  },

  addClaimEvidence: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const id = reqString(a.claimId, { prefix: 'clm_', code: 'INVALID_CLAIM_ID' });
    if ('error' in id) return fail(id.error);
    const c = w.claims.find(x => x.id === id.value);
    if (!c) return fail('NOT_FOUND_CLAIM');
    const evidence = Array.isArray(a.evidence)
      ? (a.evidence as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    if (evidence.length === 0) return fail('MISSING_EVIDENCE');
    if (!['submitted', 'under_review'].includes(String(c.status))) return fail('CLAIM_ALREADY_RESOLVED');

    c.evidence = [...(c.evidence as string[]), ...evidence];
    audit(w, 'addClaimEvidence', `${String(evidence.length)} item(s) added to ${String(c.id)}`);
    return okWrite({ claimId: c.id, status: c.status, evidence: c.evidence });
  },

  resolveClaim: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const id = reqString(a.claimId, { prefix: 'clm_', code: 'INVALID_CLAIM_ID' });
    if ('error' in id) return fail(id.error);
    const res = reqString(a.resolution, { allowed: ['approve', 'deny', 'settle'],
      code: 'INVALID_RESOLUTION' });
    if ('error' in res) return fail(res.error);
    const c = w.claims.find(x => x.id === id.value);
    if (!c) return fail('NOT_FOUND_CLAIM');
    if (!['submitted', 'under_review'].includes(String(c.status))) return fail('CLAIM_ALREADY_RESOLVED');
    const movesMoney = res.value === 'approve' || res.value === 'settle';
    if (movesMoney) {
      const perm = permGate(w, 'money');
      if (perm) return fail(perm.error);
      if (typeof a.settlementAmount !== 'number' || a.settlementAmount < 0) {
        return fail('SETTLEMENT_REQUIRED');
      }
    }
    const amount = movesMoney ? money(a.settlementAmount as number) : 0;
    const booking = c.bookingId !== null ? w.bookings.find(x => x.id === c.bookingId) : undefined;
    const fromDeposit = booking !== undefined
      ? money(Math.min(amount, Number(booking.depositHeld))) : 0;
    const invoicedSeparately = money(amount - fromDeposit);

    c.status = res.value === 'approve' ? 'approved' : res.value === 'deny' ? 'denied' : 'settled';
    c.settlementAmount = movesMoney ? amount : null;
    if (booking !== undefined && fromDeposit > 0) {
      booking.depositHeld = money(Number(booking.depositHeld) - fromDeposit);
    }
    if (c.holdId !== null) {
      const h = w.holds.find(x => x.id === c.holdId);
      if (h) h.active = false;
    }
    audit(w, 'resolveClaim', `${String(c.id)} ${String(c.status)}`
      + (movesMoney ? ` (${String(amount)})` : ''));
    return okWrite({ claimId: c.id, status: c.status, settlementAmount: c.settlementAmount,
      deductedFromDeposit: fromDeposit, invoicedSeparately,
      depositRemaining: booking !== undefined ? booking.depositHeld : null,
      holdLifted: c.holdId });
  },

  // ── holds ───────────────────────────────────────────────────────────────────

  listHolds: (w, a) => {
    const sc = optString(a.scope, { allowed: HOLD_SCOPES, code: 'INVALID_HOLD_SCOPE' });
    if ('error' in sc) return fail(sc.error);
    const aid = optString(a.assetId, { prefix: 'ast_', code: 'INVALID_ASSET_ID' });
    if ('error' in aid) return fail(aid.error);
    let rows = activeHolds(w);
    if ('value' in sc) rows = rows.filter(h => h.scope === sc.value);
    if ('value' in aid) rows = rows.filter(h => h.scope === 'workspace' || h.assetId === aid.value);
    return okRead({
      scopeFilter: 'value' in sc ? sc.value : null,
      assetFilter: 'value' in aid ? aid.value : null,
      count: rows.length,
      holds: rows.map(h => ({ id: h.id, type: h.type, scope: h.scope, assetId: h.assetId,
        customerId: h.customerId, reason: h.reason, automatic: h.auto }))
    });
  },

  placeHold: (w, a) => {
    const gate = freezeGate(w, true);
    if (gate) return gateFail(gate);
    const type = reqString(a.type, { allowed: HOLD_TYPES, code: 'INVALID_HOLD_TYPE' });
    if ('error' in type) return fail(type.error);
    const scope = reqString(a.scope, { allowed: HOLD_SCOPES, code: 'INVALID_HOLD_SCOPE' });
    if ('error' in scope) return fail(scope.error);
    const reason = reqString(a.reason, { code: 'MISSING_REASON' });
    if ('error' in reason) return fail(reason.error);
    const aid = optString(a.assetId, { prefix: 'ast_', code: 'INVALID_ASSET_ID' });
    if ('error' in aid) return fail(aid.error);
    const cid = optString(a.customerId, { prefix: 'cust_', code: 'INVALID_CUSTOMER_ID' });
    if ('error' in cid) return fail(cid.error);
    if (scope.value === 'asset' && !('value' in aid)) return fail('MISSING_ASSET_ID');
    if (scope.value === 'account' && !('value' in cid)) return fail('MISSING_CUSTOMER_ID');
    if ('value' in aid && !w.assets.find(x => x.id === aid.value)) return fail('NOT_FOUND_ASSET');
    if ('value' in cid && !w.customers.find(x => x.id === cid.value)) return fail('NOT_FOUND_CUSTOMER');

    w.counters.hold += 1;
    const hid = `hold_${String(w.counters.hold)}`;
    w.holds.push({
      id: hid, type: type.value, scope: scope.value, reason: reason.value,
      assetId: scope.value === 'asset' && 'value' in aid ? aid.value : null,
      customerId: scope.value === 'account' && 'value' in cid ? cid.value : null,
      active: true, auto: false
    });
    audit(w, 'placeHold', `${hid} (${type.value}/${scope.value}) placed: ${reason.value}`);
    return okWrite({
      id: hid, holdId: hid, type: type.value, scope: scope.value,
      assetId: scope.value === 'asset' && 'value' in aid ? aid.value : null,
      customerId: scope.value === 'account' && 'value' in cid ? cid.value : null,
      workspaceId: scope.value === 'workspace' ? w.workspace.id : null,
      reason: reason.value
    });
  },

  releaseHold: (w, a) => {
    const gate = freezeGate(w, true);
    if (gate) return gateFail(gate);
    const id = reqString(a.holdId, { prefix: 'hold_', code: 'INVALID_HOLD_ID' });
    if ('error' in id) return fail(id.error);
    const h = w.holds.find(x => x.id === id.value);
    if (!h) return fail('NOT_FOUND_HOLD');
    if (h.active !== true) return fail('HOLD_ALREADY_RELEASED');
    const perm = permGate(w, 'members');
    if (perm) return fail(perm.error);
    if (h.auto === true) {
      const claim = w.claims.find(c => c.holdId === h.id
        && ['submitted', 'under_review'].includes(String(c.status)));
      if (claim) return fail('HOLD_BOUND_TO_OPEN_CLAIM');
    }

    h.active = false;
    audit(w, 'releaseHold', `${String(h.id)} released`);
    return okWrite({ holdId: h.id, released: true, type: h.type, scope: h.scope });
  },

  // ── customers and policy ────────────────────────────────────────────────────

  listCustomers: (w, a) => {
    const q = optString(a.query, { code: null });
    const needle = 'value' in q ? q.value : null;
    const folded = needle === null ? null : needle.toLowerCase();
    const rows = w.customers
      .filter(c => (folded !== null ? String(c.name).toLowerCase().includes(folded) : true))
      .map(c => ({ id: c.id, name: c.name,
        hasActiveHold: accountHold(w, String(c.id)) !== undefined,
        outstandingBalance: c.outstandingBalance }));
    return okRead({ query: needle, count: rows.length, customers: rows });
  },

  getCustomer: (w, a) => {
    const id = reqString(a.customerId, { prefix: 'cust_', code: 'INVALID_CUSTOMER_ID' });
    if ('error' in id) return fail(id.error);
    const c = w.customers.find(x => x.id === id.value);
    if (!c) return okRead({ found: false });
    const holds = activeHolds(w).filter(h => h.scope === 'account' && h.customerId === c.id);
    return okRead({
      found: true,
      customer: { id: c.id, name: c.name, email: c.email, phone: c.phone,
        rentalCount: c.rentalCount, outstandingBalance: c.outstandingBalance,
        activeHolds: holds.map(h => ({ holdId: h.id, type: h.type, reason: h.reason })) }
    });
  },

  createCustomer: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const name = reqString(a.name, { code: 'MISSING_NAME' });
    if ('error' in name) return fail(name.error);
    const email = reqString(a.email, { code: 'MISSING_EMAIL' });
    if ('error' in email) return fail(email.error);
    if (!email.value.includes('@')) return fail('INVALID_EMAIL');
    const phone = optString(a.phone, { code: null });

    w.counters.customer += 1;
    const cid = `cust_${String(w.counters.customer)}`;
    w.customers.push({ id: cid, name: name.value, email: email.value,
      phone: 'value' in phone ? phone.value : '', outstandingBalance: 0, rentalCount: 0 });
    audit(w, 'createCustomer', `${cid} registered`);
    return okWrite({ customerId: cid, name: name.value, email: email.value });
  },

  lookupPolicy: (w, a) => {
    const topic = reqString(a.topic, { allowed: POLICY_TOPICS, code: 'INVALID_POLICY_TOPIC' });
    if ('error' in topic) return fail(topic.error);
    return okRead({ topic: topic.value, policy: POLICY_TEXT[topic.value] });
  },

  // ── the fleet ───────────────────────────────────────────────────────────────

  listAssets: (w, a) => {
    const cat = optString(a.category, { allowed: CATEGORIES, code: 'INVALID_CATEGORY' });
    if ('error' in cat) return fail(cat.error);
    const st = optString(a.status, { allowed: ASSET_STATUSES_LIST, code: 'INVALID_ASSET_STATUS' });
    if ('error' in st) return fail(st.error);
    const rows = w.assets
      .filter(x => ('value' in cat ? x.category === cat.value : true))
      .filter(x => ('value' in st ? x.status === st.value : true))
      .map(x => ({ id: x.id, name: x.name, category: x.category, condition: x.condition,
        status: x.status, dailyRate: x.dailyRate, requiredDeposit: x.requiredDeposit }));
    return okRead({
      categoryFilter: 'value' in cat ? cat.value : null,
      statusFilter: 'value' in st ? st.value : null,
      count: rows.length, assets: rows
    });
  },

  getAsset: (w, a) => {
    const id = reqString(a.assetId, { prefix: 'ast_', code: 'INVALID_ASSET_ID' });
    if ('error' in id) return fail(id.error);
    const x = w.assets.find(y => y.id === id.value);
    if (!x) return okRead({ found: false });
    const hold = assetHold(w, String(x.id));
    return okRead({
      found: true,
      asset: {
        id: x.id, name: x.name, category: x.category, condition: x.condition, status: x.status,
        dailyRate: x.dailyRate, requiredDeposit: x.requiredDeposit,
        deliveryFee: x.deliveryFee, insuranceFee: x.insuranceFee,
        upcomingBookings: w.bookings
          .filter(b => b.assetId === x.id && BOOKING_ACTIVE.includes(String(b.status)))
          .map(b => ({ bookingId: b.id, startDate: b.startDate, endDate: b.endDate, status: b.status })),
        openMaintenance: maintenanceWindows(w, String(x.id)).map(maintenanceRowOut),
        activeHold: hold ? { holdId: hold.id, type: hold.type, reason: hold.reason } : null
      }
    });
  },

  registerAsset: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const perm = permGate(w, 'fleet');
    if (perm) return fail(perm.error);
    const name = reqString(a.name, { code: 'MISSING_NAME' });
    if ('error' in name) return fail(name.error);
    const cat = reqString(a.category, { allowed: CATEGORIES, code: 'INVALID_CATEGORY' });
    if ('error' in cat) return fail(cat.error);
    const cond = optString(a.condition, { allowed: CONDITIONS, code: 'INVALID_CONDITION' });
    if ('error' in cond) return fail(cond.error);
    if (typeof a.dailyRate !== 'number' || a.dailyRate < 0) return fail('INVALID_AMOUNT');
    if (typeof a.requiredDeposit !== 'number' || a.requiredDeposit < 0) return fail('INVALID_AMOUNT');

    const prefix = CATEGORY_PREFIX[cat.value] ?? cat.value.split('_').join('').slice(0, 4);
    const siblings = w.assets.filter(x => x.category === cat.value).length + 1;
    const pad = siblings < 10 ? `0${String(siblings)}` : String(siblings);
    const aid = `ast_${prefix}${pad}`;
    w.assets.push({
      id: aid, name: name.value, category: cat.value,
      condition: 'value' in cond ? cond.value : 'good', status: 'available',
      dailyRate: money(a.dailyRate), requiredDeposit: money(a.requiredDeposit),
      deliveryFee: 150, insuranceFee: 50
    });
    audit(w, 'registerAsset', `${aid} registered (${cat.value})`);
    return okWrite({ assetId: aid, name: name.value, category: cat.value,
      condition: 'value' in cond ? cond.value : 'good', status: 'available',
      dailyRate: money(a.dailyRate), requiredDeposit: money(a.requiredDeposit) });
  },

  updateAssetCondition: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const perm = permGate(w, 'fleet');
    if (perm) return fail(perm.error);
    const id = reqString(a.assetId, { prefix: 'ast_', code: 'INVALID_ASSET_ID' });
    if ('error' in id) return fail(id.error);
    const cond = reqString(a.condition, { allowed: CONDITIONS, code: 'INVALID_CONDITION' });
    if ('error' in cond) return fail(cond.error);
    const x = w.assets.find(y => y.id === id.value);
    if (!x) return fail('NOT_FOUND_ASSET');
    if (x.status === 'retired') return fail('ASSET_RETIRED');

    const previous = x.condition;
    x.condition = cond.value;
    audit(w, 'updateAssetCondition', `${String(x.id)} ${String(previous)} → ${cond.value}`);
    return okWrite({ assetId: x.id, previousCondition: previous, condition: x.condition,
      claimFiled: false });
  },

  scheduleMaintenance: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const perm = permGate(w, 'fleet');
    if (perm) return fail(perm.error);
    const id = reqString(a.assetId, { prefix: 'ast_', code: 'INVALID_ASSET_ID' });
    if ('error' in id) return fail(id.error);
    const s = reqString(a.startDate, { date: true, code: 'INVALID_DATE' });
    if ('error' in s) return fail(s.error);
    const e = reqString(a.endDate, { date: true, code: 'INVALID_DATE' });
    if ('error' in e) return fail(e.error);
    const reason = optString(a.reason, { code: null });
    if (!isValidDate(s.value) || !isValidDate(e.value)) return fail('INVALID_DATE');
    if (toDays(s.value) >= toDays(e.value)) return fail('INVALID_DATE_RANGE');
    const x = w.assets.find(y => y.id === id.value);
    if (!x) return fail('NOT_FOUND_ASSET');
    if (x.status === 'retired') return fail('ASSET_RETIRED');
    if (x.status === 'out') return fail('ASSET_OUT_ON_RENTAL');
    if (x.status === 'maintenance') return fail('ASSET_IN_MAINTENANCE');
    const booked = w.bookings.find(b => b.assetId === x.id
      && ['pending', 'confirmed'].includes(String(b.status))
      && overlaps(s.value, e.value, String(b.startDate), String(b.endDate)));
    if (booked) return fail('ASSET_RESERVED_IN_WINDOW', { detail: `The window clashes with ${String(booked.id)}, which runs ${String(booked.startDate)} to ${String(booked.endDate)}; pick a window that clears it, or move the booking first.` });

    w.maintenance.push({ id: `mw${String(w.maintenance.length + 1)}`, assetId: x.id,
      startDate: s.value, endDate: e.value,
      reason: 'value' in reason ? reason.value : 'scheduled service',
      status: 'scheduled', conditionAfter: null });
    x.status = 'maintenance';
    audit(w, 'scheduleMaintenance', `${String(x.id)} in maintenance ${s.value}…${e.value}`);
    return okWrite({ assetId: x.id, status: 'maintenance', startDate: s.value, endDate: e.value,
      reason: 'value' in reason ? reason.value : 'scheduled service' });
  },

  completeMaintenance: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const perm = permGate(w, 'fleet');
    if (perm) return fail(perm.error);
    const id = reqString(a.assetId, { prefix: 'ast_', code: 'INVALID_ASSET_ID' });
    if ('error' in id) return fail(id.error);
    const cond = reqString(a.condition, { allowed: CONDITIONS, code: 'INVALID_CONDITION' });
    if ('error' in cond) return fail(cond.error);
    const x = w.assets.find(y => y.id === id.value);
    if (!x) return fail('NOT_FOUND_ASSET');
    if (x.status !== 'maintenance') return fail('ASSET_NOT_IN_MAINTENANCE');

    const open = maintenanceWindows(w, String(x.id));
    for (const m of open) {
      m.status = 'completed';
      m.conditionAfter = cond.value;
    }
    x.condition = cond.value;
    x.status = 'available';
    syncAssetStatuses(w);
    audit(w, 'completeMaintenance', `${String(x.id)} back in service (${cond.value})`);
    return okWrite({ assetId: x.id, status: x.status, condition: x.condition,
      windowsClosed: open.length });
  },

  getMaintenanceLog: (w, a) => {
    const id = reqString(a.assetId, { prefix: 'ast_', code: 'INVALID_ASSET_ID' });
    if ('error' in id) return fail(id.error);
    const x = w.assets.find(y => y.id === id.value);
    if (!x) return okRead({ found: false });
    const rows = w.maintenance.filter(m => m.assetId === x.id).map(maintenanceRowOut);
    return okRead({ found: true, assetId: x.id, count: rows.length, maintenance: rows });
  },

  retireAsset: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const perm = permGate(w, 'fleet');
    if (perm) return fail(perm.error);
    const id = reqString(a.assetId, { prefix: 'ast_', code: 'INVALID_ASSET_ID' });
    if ('error' in id) return fail(id.error);
    const x = w.assets.find(y => y.id === id.value);
    if (!x) return fail('NOT_FOUND_ASSET');
    if (x.status === 'retired') return fail('ASSET_RETIRED');
    if (x.status === 'out') return fail('ASSET_OUT_ON_RENTAL');
    const reserved = w.bookings.find(b => b.assetId === x.id
      && ['pending', 'confirmed'].includes(String(b.status)));
    if (reserved) return fail('ASSET_RESERVED', { detail: `The asset is reserved by ${String(reserved.id)} from ${String(reserved.startDate)} to ${String(reserved.endDate)}; deal with that booking first.` });
    if (assetHold(w, String(x.id))) return fail('ASSET_ON_HOLD');

    x.status = 'retired';
    audit(w, 'retireAsset', `${String(x.id)} retired`);
    return okWrite({ assetId: x.id, status: 'retired' });
  },

  transferAsset: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const perm = permGate(w, 'fleet');
    if (perm) return fail(perm.error);
    const id = reqString(a.assetId, { prefix: 'ast_', code: 'INVALID_ASSET_ID' });
    if ('error' in id) return fail(id.error);
    const target = reqString(a.targetWorkspaceId, { prefix: 'ws_', code: 'INVALID_WORKSPACE_ID' });
    if ('error' in target) return fail(target.error);
    if (target.value === w.workspace.id) return fail('SAME_WORKSPACE');
    const x = w.assets.find(y => y.id === id.value);
    if (!x) return fail('NOT_FOUND_ASSET');
    if (x.status === 'retired') return fail('ASSET_RETIRED');
    if (x.status === 'out') return fail('ASSET_OUT_ON_RENTAL');
    const reserved = w.bookings.find(b => b.assetId === x.id
      && ['pending', 'confirmed'].includes(String(b.status)));
    if (reserved) return fail('ASSET_RESERVED', { detail: `The asset is reserved by ${String(reserved.id)} from ${String(reserved.startDate)} to ${String(reserved.endDate)}; deal with that booking first.` });
    if (assetHold(w, String(x.id))) return fail('ASSET_ON_HOLD');

    w.assets = w.assets.filter(y => y.id !== x.id);
    audit(w, 'transferAsset', `${String(x.id)} transferred to ${target.value}`);
    return okWrite({ assetId: x.id, transferredTo: target.value,
      remainingInFleet: w.assets.length });
  },

  // ── the tenant ──────────────────────────────────────────────────────────────

  getWorkspace: (w) => okRead({
    workspace: { id: w.workspace.id, name: w.workspace.name, plan: w.workspace.plan,
      status: w.workspace.status, onboarded: w.workspace.onboarded }
  }),

  getPlanUsage: (w) => {
    const lim = limits(w);
    const seatsUsed = w.members.length;
    const active = activeBookings(w).length;
    const held = w.bookings.reduce((s, b) => s + Number(b.depositHeld ?? 0), 0);
    return okRead({
      plan: w.workspace.plan,
      seatsUsed, seatCap: lim.seats, atSeatCap: seatsUsed >= lim.seats,
      activeBookings: active, bookingCap: lim.bookings, atBookingCap: active >= lim.bookings,
      depositFloatHeld: held, depositFloatLimit: lim.float,
      depositFloatRemaining: money(lim.float - held)
    });
  },

  listMembers: (w) => okRead({
    count: w.members.length,
    members: w.members.map(m => ({ id: m.id, name: m.name, role: m.role, status: m.status }))
  }),

  getMember: (w, a) => {
    const id = optString(a.memberId, { prefix: 'mem_', code: 'INVALID_MEMBER_ID' });
    if ('error' in id) return fail(id.error);
    const wanted = 'value' in id ? id.value : w.actingMemberId;
    const m = w.members.find(x => x.id === wanted);
    if (!m) return okRead({ found: false });
    const c = capsOf(String(m.role));
    return okRead({
      found: true, isActingUser: m.id === w.actingMemberId,
      member: { id: m.id, name: m.name, role: m.role, status: m.status,
        canManageMembers: c.members, canMoveMoney: c.money,
        canDispatch: c.dispatch, canManageFleet: c.fleet, canChangePlan: c.plan }
    });
  },

  inviteMember: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const perm = permGate(w, 'members');
    if (perm) return fail(perm.error);
    const email = reqString(a.email, { code: 'MISSING_EMAIL' });
    if ('error' in email) return fail(email.error);
    const role = reqString(a.role, { allowed: ['admin', 'dispatcher', 'billing', 'viewer'],
      code: 'INVALID_ROLE' });
    if ('error' in role) return fail(role.error);
    if (!email.value.includes('@')) return fail('INVALID_EMAIL');
    if (w.members.find(m => m.email === email.value)) return fail('MEMBER_ALREADY_EXISTS');
    const lim = limits(w);
    if (w.members.length >= lim.seats) return fail('SEAT_CAP_REACHED');

    w.counters.member += 1;
    const mid = `mem_${String(w.counters.member)}`;
    w.members.push({ id: mid, name: email.value.split('@')[0], role: role.value,
      status: 'invited', email: email.value });
    audit(w, 'inviteMember', `${mid} invited as ${role.value}`);
    return okWrite({ memberId: mid, role: role.value, status: 'invited',
      seatsUsed: w.members.length, seatCap: lim.seats });
  },

  updateMemberRole: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const perm = permGate(w, 'members');
    if (perm) return fail(perm.error);
    const id = reqString(a.memberId, { prefix: 'mem_', code: 'INVALID_MEMBER_ID' });
    if ('error' in id) return fail(id.error);
    const role = reqString(a.role, { allowed: ROLES, code: 'INVALID_ROLE' });
    if ('error' in role) return fail(role.error);
    const m = w.members.find(x => x.id === id.value);
    if (!m) return fail('NOT_FOUND_MEMBER');
    const owners = w.members.filter(x => x.role === 'owner' && x.status === 'active');
    if (m.role === 'owner' && role.value !== 'owner' && owners.length <= 1) {
      return fail('SOLE_OWNER_PROTECTED');
    }

    const previous = m.role;
    m.role = role.value;
    audit(w, 'updateMemberRole', `${String(m.id)} ${String(previous)} → ${role.value}`);
    return okWrite({ memberId: m.id, previousRole: previous, role: m.role });
  },

  removeMember: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const perm = permGate(w, 'members');
    if (perm) return fail(perm.error);
    const id = reqString(a.memberId, { prefix: 'mem_', code: 'INVALID_MEMBER_ID' });
    if ('error' in id) return fail(id.error);
    const m = w.members.find(x => x.id === id.value);
    if (!m) return fail('NOT_FOUND_MEMBER');
    const owners = w.members.filter(x => x.role === 'owner' && x.status === 'active');
    if (m.role === 'owner' && owners.length <= 1) return fail('SOLE_OWNER_PROTECTED');

    w.members = w.members.filter(x => x.id !== m.id);
    const lim = limits(w);
    audit(w, 'removeMember', `${String(m.id)} removed`);
    return okWrite({ memberId: m.id, removed: true, seatsUsed: w.members.length,
      seatCap: lim.seats });
  },

  changePlan: (w, a) => {
    const gate = freezeGate(w);
    if (gate) return gateFail(gate);
    const perm = permGate(w, 'plan');
    if (perm) return fail(perm.error);
    const plan = reqString(a.plan, { allowed: PLANS, code: 'INVALID_PLAN' });
    if ('error' in plan) return fail(plan.error);
    const next = PLAN_LIMITS[plan.value];
    const seatsUsed = w.members.length;
    const active = activeBookings(w).length;
    const held = w.bookings.reduce((s, b) => s + Number(b.depositHeld ?? 0), 0);
    if (seatsUsed > next.seats || active > next.bookings || held > next.float) {
      return fail('PLAN_DOWNGRADE_BLOCKED', { detail: `The workspace holds ${String(seatsUsed)} seats, ${String(active)} active bookings and ${String(held)} in deposits; the ${plan.value} plan caps at ${String(next.seats)} seats, ${String(next.bookings)} bookings and ${String(next.float)} of float. Free what stands over those caps first.` });
    }

    const previous = w.workspace.plan;
    w.workspace.plan = plan.value;
    audit(w, 'changePlan', `${String(previous)} → ${plan.value}`);
    return okWrite({ workspaceId: w.workspace.id, previousPlan: previous, plan: w.workspace.plan,
      seatCap: next.seats, bookingCap: next.bookings, depositFloatLimit: next.float });
  },

  getAuditLog: (w, a) => {
    const action = optString(a.action, { code: null });
    let limit = 20;
    if (a.limit !== undefined) {
      if (typeof a.limit !== 'number' || !Number.isInteger(a.limit) || a.limit < 1 || a.limit > 100) {
        return fail('INVALID_LIMIT');
      }
      limit = a.limit;
    }
    const rows = w.auditLog
      .filter(entry => ('value' in action ? entry.action === action.value : true))
      .slice(-limit)
      .reverse();
    return okRead({ actionFilter: 'value' in action ? action.value : null,
      count: rows.length, entries: rows as unknown as Json });
  }
};

const BOOKING_ACTIVE = ['pending', 'confirmed', 'out'];

/** getMember composes the capability flags the record states — the kit's one table. */
const capsOf = (role: string): ReturnType<typeof caps> => caps(role);

// ── the card ──────────────────────────────────────────────────────────────────

const READS = ['checkAvailability', 'listBookings', 'getBooking', 'listTechnicians',
  'getTechnicianSchedule', 'getQuote', 'listInvoices', 'getInvoice', 'getDepositBalance',
  'listClaims', 'getClaim', 'listHolds', 'listCustomers', 'getCustomer', 'lookupPolicy',
  'listAssets', 'getAsset', 'getMaintenanceLog', 'getWorkspace', 'getPlanUsage',
  'listMembers', 'getMember', 'getAuditLog'] as const;

const WRITES: readonly string[] = ['createBooking', 'rescheduleBooking', 'checkOutAsset', 'checkInAsset',
  'closeBooking', 'dispatchTechnician', 'generateQuote', 'generateInvoice', 'fileClaim',
  'addClaimEvidence', 'createCustomer', 'registerAsset', 'updateAssetCondition',
  'scheduleMaintenance', 'completeMaintenance', 'inviteMember'] as const;

/** The birth register: the acts that mint a record that did not exist. The block a tool
 *  sits in is its effect; this list is its birth register — placeHold sits under consent
 *  for its workspace branch, and a hold is still born on every placement. The card's
 *  `creates` key names this list, and that seat is where the surface reader finds it. */
export const CREATES: readonly string[] = ['createBooking', 'createCustomer', 'fileClaim',
  'placeHold', 'registerAsset', 'scheduleMaintenance', 'generateInvoice', 'inviteMember',
  'generateQuote'] as const;

/** The consented set: the AS-IS destructive list plus the two conditional branches. */
const DESTRUCTIVE: Readonly<Record<string, { label: string; target?: string;
    when?: { arg: string; oneOf: readonly Json[] } }>> = {
  cancelBooking: { target: 'bookingId', label: 'cancelling a booking' },
  cancelDispatch: { target: 'bookingId', label: 'cancelling a technician dispatch' },
  chargeDeposit: { target: 'bookingId', label: 'charging a security deposit' },
  releaseDeposit: { target: 'bookingId', label: 'releasing a security deposit' },
  payInvoice: { target: 'invoiceId', label: 'recording a payment on an invoice' },
  issueRefund: { target: 'invoiceId', label: 'paying a refund out' },
  voidInvoice: { target: 'invoiceId', label: 'voiding an invoice' },
  resolveClaim: { target: 'claimId', label: 'resolving a claim for good',
    when: { arg: 'resolution', oneOf: ['approve', 'settle'] } },
  placeHold: { label: 'freezing the entire workspace',
    when: { arg: 'scope', oneOf: ['workspace'] } },
  releaseHold: { target: 'holdId', label: 'releasing a hold' },
  retireAsset: { target: 'assetId', label: 'retiring an asset out of the fleet' },
  transferAsset: { target: 'assetId', label: 'transferring an asset to another site' },
  removeMember: { target: 'memberId', label: 'removing a member from the workspace' },
  updateMemberRole: { target: 'memberId', label: 'making a member an owner',
    when: { arg: 'role', oneOf: ['owner'] } },
  changePlan: { label: 'switching this workspace to a different plan tier' }
};

const LABELS: Readonly<Record<string, string>> = {
  checkAvailability: 'Check a date range against the asset calendar',
  listBookings: 'List the bookings', getBooking: 'Look up one booking',
  listTechnicians: 'List the technicians', getTechnicianSchedule: 'Read a technician schedule',
  getQuote: 'Look up quotes', listInvoices: 'List the invoices', getInvoice: 'Look up one invoice',
  getDepositBalance: 'Read a deposit balance', listClaims: 'List the claims',
  getClaim: 'Look up one claim', listHolds: 'List the active holds',
  listCustomers: 'Search the customer register', getCustomer: 'Look up one customer',
  lookupPolicy: 'Read the published policy', listAssets: 'List the equipment register',
  getAsset: 'Look up one asset', getMaintenanceLog: 'Read an asset maintenance log',
  getWorkspace: 'Read the workspace record', getPlanUsage: 'Read the plan usage',
  listMembers: 'List the members', getMember: 'Look up one member',
  getAuditLog: 'Read the activity log',
  createBooking: 'Open a booking', rescheduleBooking: 'Move a booking to new dates',
  checkOutAsset: 'Hand the asset over', checkInAsset: 'Take the asset back',
  closeBooking: 'Finish a rental', dispatchTechnician: 'Put a technician on a job',
  generateQuote: 'Price a rental', generateInvoice: 'Raise the rental invoice',
  fileClaim: 'File a claim', addClaimEvidence: 'Attach claim evidence',
  createCustomer: 'Register a customer', registerAsset: 'Register equipment',
  updateAssetCondition: 'Record an asset grade', scheduleMaintenance: 'Book a workshop window',
  completeMaintenance: 'Return an asset to service', inviteMember: 'Invite a member'
};

/** The record family each target id lives in — a guard's record lookup and the
 *  consent target binding both route through it. */
const TARGET_ENTITY: Readonly<Record<string, string>> = {
  bookingId: 'bookings', invoiceId: 'invoices', claimId: 'claims',
  holdId: 'holds', assetId: 'assets', memberId: 'members'
};

function entryFor(name: string): Record<string, Json> {
  const declared = TOOL_SCHEMAS[name];
  return { form: 'run', entity: 'auditLog', label: LABELS[name] ?? DESTRUCTIVE[name]?.label ?? name,
    does: declared.does, schema: declared.schema };
}

/** The write surface, derived from the world card's own blocks — the one home;
 *  a second copy of this list is drift. */
export const WRITE_TOOL_NAMES: readonly string[] =
  [...WRITES, ...Object.keys(DESTRUCTIVE)];

export const subjectWorld = world({
  records: BASE_RECORDS,
  presets: PRESET_PATCHES,
  creates: CREATES,
  // The state NOTE, the stateBlock law: only what disqualifies a whole turn
  // and what no read answers — the date and the standing condition, never an
  // identifier. Everything else stays behind the reads.
  note: (records) => {
    const ws = Object.values(records.workspace ?? {})[0];
    const lines = [`Today's date: ${String(ws?.today ?? '')}`];
    if (ws?.onboarded === false) {
      lines.push('This workspace has not finished onboarding: it holds no equipment, customers or bookings yet.');
    }
    if (ws?.status === 'suspended') {
      lines.push('This workspace is suspended: no operation that changes anything can be carried out.');
    }
    if (Object.values(records.holds ?? {}).some(h => h.active === true && h.scope === 'workspace')) {
      lines.push('A workspace-wide hold is active: every gated operation is blocked until it is lifted.');
    }
    return lines.join(' ');
  },
  reads: {
  checkAvailability: {
    form: "run",
    entity: "auditLog",
    label: "Check a date range against the asset calendar",
    does: "Check whether a specific asset is free to rent for a date range. Returns available:true/false plus any conflicting bookings, scheduled maintenance windows, or legal/compliance holds that block it. ALWAYS call this before createBooking — never claim an asset is free without it. startDate/endDate are ISO YYYY-MM-DD and are compared against the fixed reference date; startDate must be < endDate. A range that starts before the reference date may read as available here but is refused by createBooking, which does not book into the past.",
    schema: {
      type: "object",
      properties: {
        assetId: {
          type: "string",
          pattern: "^ast_[a-z0-9]+$",
          description: "Asset id from listAssets (e.g. \"ast_excv01\"). Required."
        },
        startDate: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Rental start date, ISO YYYY-MM-DD. Required."
        },
        endDate: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Rental end date, ISO YYYY-MM-DD, after startDate. Required."
        }
      },
      required: [
        "assetId",
        "startDate",
        "endDate"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  listBookings: {
    form: "run",
    entity: "auditLog",
    label: "List the bookings",
    does: "List rental bookings in the current workspace, optionally filtered by status. Each row: id (bk_), assetId, customerId, startDate, endDate, status (pending/confirmed/out/returned/closed/cancelled), and whether a technician is dispatched. Call this to find a real bk_ id — NEVER invent a booking id.",
    schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: [
            "pending",
            "confirmed",
            "out",
            "returned",
            "closed",
            "cancelled"
          ],
          description: "Optional status filter."
        }
      },
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  getBooking: {
    form: "run",
    entity: "auditLog",
    label: "Look up one booking",
    does: "Get full detail for one booking by id: asset, customer, date range, status, dispatched technician, linked quote/invoice, held deposit, and any active hold. Read before checking out, invoicing, or cancelling. Also returns openClaimId, the claim that blocks closing this booking.",
    schema: {
      type: "object",
      properties: {
        bookingId: {
          type: "string",
          pattern: "^bk_[a-z0-9]+$",
          description: "The booking id (e.g. \"bk_1001\"). Required."
        }
      },
      required: [
        "bookingId"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  listTechnicians: {
    form: "run",
    entity: "auditLog",
    label: "List the technicians",
    does: "List field technicians in the workspace: id (tech_), name, skills, home base, and today's job load. Call this to find a real tech_ id before dispatching — NEVER invent a technician. The job load is counted against the environment reference date, not a live clock.",
    schema: {
      type: "object",
      properties: {
        skill: {
          type: "string",
          description: "Optional. Filter to technicians with this skill (e.g. \"heavy_equipment\", \"electrical\", \"delivery\")."
        }
      },
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  getTechnicianSchedule: {
    form: "run",
    entity: "auditLog",
    label: "Read a technician schedule",
    does: "Return a technician's scheduled dispatch jobs and free days across a date range, so you can spot conflicts before dispatching. Use these EXACT dates — never claim a technician is free without reading this. startDate must be strictly before endDate: to inspect ONE day, pass that day as startDate and the next day as endDate.",
    schema: {
      type: "object",
      properties: {
        technicianId: {
          type: "string",
          pattern: "^tech_[a-z0-9]+$",
          description: "The technician to inspect. Required."
        },
        startDate: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Window start, ISO YYYY-MM-DD. Required."
        },
        endDate: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Window end, ISO YYYY-MM-DD, after startDate. Required."
        }
      },
      required: [
        "technicianId",
        "startDate",
        "endDate"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  getQuote: {
    form: "run",
    entity: "auditLog",
    label: "Look up quotes",
    does: "Read a rental quote. Pass a quoteId for one quote's full numeric breakdown, or omit it to list all quotes. Report the stored numbers exactly — never re-estimate a total.",
    schema: {
      type: "object",
      properties: {
        quoteId: {
          type: "string",
          pattern: "^qt_[a-z0-9]+$",
          description: "Optional. The quote id (e.g. \"qt_5001\"). Omit to list all."
        }
      },
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  listInvoices: {
    form: "run",
    entity: "auditLog",
    label: "List the invoices",
    does: "List invoices in the workspace, optionally filtered by status. Each row: id (inv_), bookingId, total, balanceDue, status (draft/issued/partially_paid/paid/void/overdue). Call this to find a real inv_ id — NEVER invent an invoice id or amount. Also returns amountPaid per row — cap a refund on that figure, never on total minus balanceDue.",
    schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: [
            "draft",
            "issued",
            "partially_paid",
            "paid",
            "void",
            "overdue"
          ],
          description: "Optional status filter."
        }
      },
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  getInvoice: {
    form: "run",
    entity: "auditLog",
    label: "Look up one invoice",
    does: "Get full detail for one invoice: line items, subtotal, fees, lateFee, total, amountPaid, balanceDue, and status. Ground any amount you state in these numbers — never fabricate a total.",
    schema: {
      type: "object",
      properties: {
        invoiceId: {
          type: "string",
          pattern: "^inv_[a-z0-9]+$",
          description: "The invoice id (e.g. \"inv_7001\"). Required."
        }
      },
      required: [
        "invoiceId"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  getDepositBalance: {
    form: "run",
    entity: "auditLog",
    label: "Read a deposit balance",
    does: "Read security-deposit balances. Pass a bookingId for that booking's required vs held deposit and any shortfall; omit it for the workspace deposit-float summary (total held, total required). Never claim a deposit is covered or refundable without reading this. With no bookingId it also returns the plan deposit-float limit and what remains of it.",
    schema: {
      type: "object",
      properties: {
        bookingId: {
          type: "string",
          pattern: "^bk_[a-z0-9]+$",
          description: "Optional. A booking to read the deposit for. Omit for the workspace float summary."
        }
      },
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  listClaims: {
    form: "run",
    entity: "auditLog",
    label: "List the claims",
    does: "List damage/incident claims in the workspace, optionally filtered by status. Each row: id (clm_), type, status (submitted/under_review/approved/denied/settled), linked bookingId/assetId. Call this to find a real clm_ id — NEVER invent a claim.",
    schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: [
            "submitted",
            "under_review",
            "approved",
            "denied",
            "settled"
          ],
          description: "Optional status filter."
        }
      },
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  getClaim: {
    form: "run",
    entity: "auditLog",
    label: "Look up one claim",
    does: "Get full detail for one claim: type, status, description, evidence labels, linked booking/asset/customer, and settlementAmount. Read this before resolving a claim or discussing a deposit while a claim is open.",
    schema: {
      type: "object",
      properties: {
        claimId: {
          type: "string",
          pattern: "^clm_[a-z0-9]+$",
          description: "The claim id (e.g. \"clm_3001\"). Required."
        }
      },
      required: [
        "claimId"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  listHolds: {
    form: "run",
    entity: "auditLog",
    label: "List the active holds",
    does: "List active legal/compliance/safety/payment holds in the workspace. Each hold: id (hold_), type, scope (asset/account/workspace), the frozen assetId/customerId, and reason. OTHER operations (createBooking, checkOutAsset, releaseDeposit, issueRefund, retireAsset, transferAsset) are gated on these — ALWAYS read holds before promising an asset or moving money.",
    schema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: [
            "asset",
            "account",
            "workspace"
          ],
          description: "Optional scope filter."
        },
        assetId: {
          type: "string",
          pattern: "^ast_[a-z0-9]+$",
          description: "Optional. Only holds affecting this asset."
        }
      },
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  listCustomers: {
    form: "run",
    entity: "auditLog",
    label: "Search the customer register",
    does: "List customers in the workspace: id (cust_), name, and whether the account has an active hold or outstanding balance. Call this to find a real cust_ id before booking or reading a record — NEVER invent a customer.",
    schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional. Case-insensitive name substring filter."
        }
      },
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  getCustomer: {
    form: "run",
    entity: "auditLog",
    label: "Look up one customer",
    does: "Read a customer record: id (cust_), name, masked contact, rental-history summary, outstanding balance, and any account-level holds. PII-SENSITIVE — share only what the user needs and never fabricate customer details.",
    schema: {
      type: "object",
      properties: {
        customerId: {
          type: "string",
          pattern: "^cust_[a-z0-9]+$",
          description: "The customer id (e.g. \"cust_2001\"). Required."
        }
      },
      required: [
        "customerId"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  lookupPolicy: {
    form: "run",
    entity: "auditLog",
    label: "Read the published policy",
    does: "Look up an operating/compliance policy by topic. Ground any policy claim (deposit rules, damage liability, when a hold may be released, cancellation windows) in the returned text — NEVER invent a rule or a number.",
    schema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: [
            "deposit_refund",
            "damage_liability",
            "hold_release",
            "cancellation",
            "late_return",
            "insurance"
          ],
          description: "The policy topic. Required."
        }
      },
      required: [
        "topic"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  listAssets: {
    form: "run",
    entity: "auditLog",
    label: "List the equipment register",
    does: "List the asset registry / rental catalog, optionally filtered by category or status. Each row: id (ast_, e.g. \"ast_excv01\"), name, category, condition, status (available/reserved/out/maintenance/retired), dailyRate, requiredDeposit. Call this to find a real asset id and its rate — NEVER invent an asset or a price. The status field is POINT-IN-TIME and is NOT a date-range availability answer — only checkAvailability establishes that an asset is free for a range.",
    schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: [
            "excavator",
            "loader",
            "skid_steer",
            "boom_lift",
            "scissor_lift",
            "generator",
            "compressor",
            "light_tower",
            "pump",
            "trailer"
          ],
          description: "Optional category filter."
        },
        status: {
          type: "string",
          enum: [
            "available",
            "reserved",
            "out",
            "maintenance",
            "retired"
          ],
          description: "Optional status filter."
        }
      },
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  getAsset: {
    form: "run",
    entity: "auditLog",
    label: "Look up one asset",
    does: "Full asset detail: name, category, condition, current status, dailyRate, requiredDeposit, availability windows, open maintenance, and any active hold. Read this before quoting, booking, or checking out — never state a rate or availability you have not read. Also returns the per-asset catalog constants deliveryFee and insuranceFee. The status field is POINT-IN-TIME and is NOT a date-range availability answer — only checkAvailability establishes that an asset is free for a range.",
    schema: {
      type: "object",
      properties: {
        assetId: {
          type: "string",
          pattern: "^ast_[a-z0-9]+$",
          description: "The asset id (e.g. \"ast_excv01\"). Required."
        }
      },
      required: [
        "assetId"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  getMaintenanceLog: {
    form: "run",
    entity: "auditLog",
    label: "Read an asset maintenance log",
    does: "Read the maintenance history for an asset (past and scheduled windows, reasons, resulting conditions). Never invent a maintenance record.",
    schema: {
      type: "object",
      properties: {
        assetId: {
          type: "string",
          pattern: "^ast_[a-z0-9]+$",
          description: "The asset to inspect. Required."
        }
      },
      required: [
        "assetId"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  getWorkspace: {
    form: "run",
    entity: "auditLog",
    label: "Read the workspace record",
    does: "Read the current workspace/tenant: id (ws_), name, plan tier, status (active/suspended), and whether onboarding is complete. All operations act within THIS workspace only — never mix tenants or reference another workspace's data.",
    schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  getPlanUsage: {
    form: "run",
    entity: "auditLog",
    label: "Read the plan usage",
    does: "Read plan quotas vs current usage: seat cap & seats used, active-booking cap & bookings used this cycle, and the deposit-float limit. OTHER operations (createBooking, inviteMember) are gated on these — read before promising a booking or a seat. Returns atSeatCap / atBookingCap booleans. Counts bookings that are ACTIVE right now (pending, confirmed or out) — there is no billing cycle in this workspace.",
    schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  listMembers: {
    form: "run",
    entity: "auditLog",
    label: "List the members",
    does: "List workspace members: id (mem_), name, role (owner/admin/dispatcher/billing/viewer), and status. Call this to find a real mem_ id — NEVER invent a member.",
    schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  getMember: {
    form: "run",
    entity: "auditLog",
    label: "Look up one member",
    does: "Read one member's role and exact permission set (canManageMembers, canMoveMoney, canDispatch, canManageFleet). Pass memberId for a specific member, or omit it for the acting user. Check permissions here before attempting a privileged op.",
    schema: {
      type: "object",
      properties: {
        memberId: {
          type: "string",
          pattern: "^mem_[a-z0-9]+$",
          description: "Optional. The member to read; omit for the acting user."
        }
      },
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  getAuditLog: {
    form: "run",
    entity: "auditLog",
    label: "Read the activity log",
    does: "Read the workspace activity log (who did what: recent privileged actions, money movements, holds). Use to answer \"did X happen / when\" — NEVER fabricate history. Optionally filter by action or limit the number of entries.",
    schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Optional. Filter to a specific action name (e.g. \"payInvoice\", \"placeHold\")."
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Optional. Max entries to return (defaults to 20)."
        }
      },
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  }
},
  writes: {
  createBooking: {
    form: "run",
    entity: "bookings",
    label: "Open a booking",
    does: "Reserve an asset for a customer over a date range (status becomes \"confirmed\"). REQUIRES that checkAvailability returned available:true for the same assetId + range — the world re-checks and REJECTS overlaps, assets in maintenance/retired, or assets/accounts under a legal or compliance hold. REJECTED when the workspace is at its active-booking quota (check getPlanUsage). Dates ISO YYYY-MM-DD, must be in the future relative to the reference date, startDate < endDate. Optionally pass quoteId to lock a previously generated price.",
    schema: {
      type: "object",
      properties: {
        assetId: {
          type: "string",
          pattern: "^ast_[a-z0-9]+$",
          description: "Asset to reserve (from listAssets). Required."
        },
        customerId: {
          type: "string",
          pattern: "^cust_[a-z0-9]+$",
          description: "Customer the rental is for (from listCustomers). Required."
        },
        startDate: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Rental start, ISO YYYY-MM-DD. Required."
        },
        endDate: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Rental end, ISO YYYY-MM-DD, after startDate. Required."
        },
        quoteId: {
          type: "string",
          pattern: "^qt_[a-z0-9]+$",
          description: "Optional. A qt_ id from generateQuote to lock the quoted price."
        }
      },
      required: [
        "assetId",
        "customerId",
        "startDate",
        "endDate"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  rescheduleBooking: {
    form: "run",
    entity: "auditLog",
    label: "Move a booking to new dates",
    does: "Move a pending/confirmed booking to a new date range. Re-checks availability for the new range and REJECTS conflicts/maintenance/holds. Bookings that are out/returned/closed/cancelled cannot be rescheduled.",
    schema: {
      type: "object",
      properties: {
        bookingId: {
          type: "string",
          pattern: "^bk_[a-z0-9]+$",
          description: "The booking to move. Required."
        },
        startDate: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "New start, ISO YYYY-MM-DD. Required."
        },
        endDate: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "New end, ISO YYYY-MM-DD, after startDate. Required."
        }
      },
      required: [
        "bookingId",
        "startDate",
        "endDate"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  checkOutAsset: {
    form: "run",
    entity: "auditLog",
    label: "Hand the asset over",
    does: "Mark a confirmed booking's asset as picked up / checked out to the customer (status confirmed→out). BLOCKED if the required security deposit is not fully held (call getDepositBalance / chargeDeposit first) or the asset/account is under a hold. Records the checkout condition of the asset.",
    schema: {
      type: "object",
      properties: {
        bookingId: {
          type: "string",
          pattern: "^bk_[a-z0-9]+$",
          description: "The confirmed booking to check out. Required."
        },
        conditionOut: {
          type: "string",
          enum: [
            "excellent",
            "good",
            "fair",
            "poor",
            "damaged"
          ],
          description: "Optional. Asset condition recorded at checkout (defaults to the asset's current condition)."
        }
      },
      required: [
        "bookingId"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  checkInAsset: {
    form: "run",
    entity: "auditLog",
    label: "Take the asset back",
    does: "Mark an out booking's asset as returned (status out→returned) and record the return condition. A return condition of \"poor\"/\"damaged\" should be followed by fileClaim before releasing the deposit. Returning the asset makes the rental invoiceable (generateInvoice) and the deposit releasable.",
    schema: {
      type: "object",
      properties: {
        bookingId: {
          type: "string",
          pattern: "^bk_[a-z0-9]+$",
          description: "The out booking being returned. Required."
        },
        conditionIn: {
          type: "string",
          enum: [
            "excellent",
            "good",
            "fair",
            "poor",
            "damaged"
          ],
          description: "Asset condition at return. Required."
        },
        returnedDate: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Optional. Actual return date, ISO YYYY-MM-DD (defaults to the booking endDate). A date after endDate accrues a late fee at invoice time."
        },
        notes: {
          type: "string",
          description: "Optional free-text return notes."
        }
      },
      required: [
        "bookingId",
        "conditionIn"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  closeBooking: {
    form: "run",
    entity: "auditLog",
    label: "Finish a rental",
    does: "Finalize a returned booking (status returned→closed). BLOCKED while the invoice is unpaid, the deposit is still held, or an open claim exists against the booking. Read getBooking / getInvoice / getDepositBalance first to see what is outstanding.",
    schema: {
      type: "object",
      properties: {
        bookingId: {
          type: "string",
          pattern: "^bk_[a-z0-9]+$",
          description: "The returned booking to close. Required."
        }
      },
      required: [
        "bookingId"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  dispatchTechnician: {
    form: "run",
    entity: "auditLog",
    label: "Put a technician on a job",
    does: "PRIVILEGED: requires canDispatch (owner/admin/dispatcher) — read your own permissions with getMember and no arguments. Assign a technician to a booking's field job (delivery/pickup/onsite_service/inspection) on a date. REJECTED if the technician already has a job on that date (check getTechnicianSchedule first) or the booking is cancelled/closed. Calling again for the same booking reassigns to the new technician/date. If the booking already has a dispatch this REPLACES it and frees the previous technician day — it never adds a second job.",
    schema: {
      type: "object",
      properties: {
        bookingId: {
          type: "string",
          pattern: "^bk_[a-z0-9]+$",
          description: "The booking whose field job is being dispatched. Required."
        },
        technicianId: {
          type: "string",
          pattern: "^tech_[a-z0-9]+$",
          description: "The technician to assign. Required."
        },
        scheduledDate: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Job date, ISO YYYY-MM-DD. Required."
        },
        jobType: {
          type: "string",
          enum: [
            "delivery",
            "pickup",
            "onsite_service",
            "inspection"
          ],
          description: "Optional. Kind of field job (defaults to \"delivery\")."
        }
      },
      required: [
        "bookingId",
        "technicianId",
        "scheduledDate"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  generateQuote: {
    form: "run",
    entity: "quotes",
    label: "Price a rental",
    does: "Compute a rental quote for an asset over a date range. Returns a NUMERIC breakdown: dailyRate × billableDays + deliveryFee + insuranceFee = total, plus the required securityDeposit. Amounts are computed deterministically from the catalog — quote the EXACT numbers returned, never estimate or round. Produces a qt_ id you can pass to createBooking to lock the price. includeDelivery is required and never defaulted: a delivery fee is only charged when the rental is actually delivered.",
    schema: {
      type: "object",
      properties: {
        assetId: {
          type: "string",
          pattern: "^ast_[a-z0-9]+$",
          description: "Asset to quote (from listAssets). Required."
        },
        startDate: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Rental start, ISO YYYY-MM-DD. Required."
        },
        endDate: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Rental end, ISO YYYY-MM-DD, after startDate. Required."
        },
        includeDelivery: {
          type: "boolean",
          description: "REQUIRED. Whether the delivery fee applies. It is never assumed — ask the user if the rental is delivered or collected."
        },
        includeInsurance: {
          type: "boolean",
          description: "Optional. Add the damage-waiver insurance fee (defaults to false)."
        }
      },
      required: [
        "assetId",
        "startDate",
        "endDate",
        "includeDelivery"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  generateInvoice: {
    form: "run",
    entity: "invoices",
    label: "Raise the rental invoice",
    does: "Generate the rental invoice for a returned booking (status issued). Computes the line items deterministically: rental (dailyRate × billableDays) + deliveryFee + insuranceFee, plus a lateFee line = lateDays × dailyRate × 0.5 when the asset was returned after endDate. No money moves here — payInvoice charges it. Idempotent: a booking that already has an invoice returns the existing inv_ id.",
    schema: {
      type: "object",
      properties: {
        bookingId: {
          type: "string",
          pattern: "^bk_[a-z0-9]+$",
          description: "The returned booking to invoice. Required."
        }
      },
      required: [
        "bookingId"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  fileClaim: {
    form: "run",
    entity: "claims",
    label: "File a claim",
    does: "File a damage/incident claim (types: damage, loss, injury, late_return) against a booking OR an asset — pass at least one of bookingId/assetId. Provide a description and evidence references (attachment labels the user uploaded). Filing AUTOMATICALLY places an investigatory hold that freezes the asset until the claim is resolved — do NOT promise the deposit back while a claim is open. At least one of bookingId or assetId is REQUIRED — a claim filed against neither is rejected.",
    schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: [
            "damage",
            "loss",
            "injury",
            "late_return"
          ],
          description: "The kind of claim. Required."
        },
        description: {
          type: "string",
          description: "What happened. Required, non-empty."
        },
        bookingId: {
          type: "string",
          pattern: "^bk_[a-z0-9]+$",
          description: "The booking the claim is against (pass this or assetId)."
        },
        assetId: {
          type: "string",
          pattern: "^ast_[a-z0-9]+$",
          description: "The asset the claim is against (pass this or bookingId)."
        },
        evidence: {
          type: "array",
          items: {
            type: "string"
          },
          description: "Optional. Attachment labels supporting the claim."
        }
      },
      required: [
        "type",
        "description"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  addClaimEvidence: {
    form: "run",
    entity: "auditLog",
    label: "Attach claim evidence",
    does: "Attach more evidence labels to a claim that is still submitted/under_review. Rejected once the claim is resolved (approved/denied/settled). Adding evidence does not change the claim status.",
    schema: {
      type: "object",
      properties: {
        claimId: {
          type: "string",
          pattern: "^clm_[a-z0-9]+$",
          description: "The open claim. Required."
        },
        evidence: {
          type: "array",
          items: {
            type: "string"
          },
          minItems: 1,
          description: "Attachment labels to add. Required, non-empty."
        }
      },
      required: [
        "claimId",
        "evidence"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  createCustomer: {
    form: "run",
    entity: "customers",
    label: "Register a customer",
    does: "Register a new customer record and return its cust_ id. Requires a name and a contact email. PII-sensitive. Use before booking for a customer who is not already in listCustomers.",
    schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Customer or company name. Required."
        },
        email: {
          type: "string",
          description: "Contact email. Required."
        },
        phone: {
          type: "string",
          description: "Optional contact phone."
        }
      },
      required: [
        "name",
        "email"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  registerAsset: {
    form: "run",
    entity: "assets",
    label: "Register equipment",
    does: "PRIVILEGED: requires canManageFleet (owner/admin) — read your own permissions with getMember and no arguments. Add a new asset to the fleet registry and return its ast_ id (minted from the category, e.g. ast_excv02). Requires a name, category, dailyRate, and requiredDeposit; a new asset starts status=available.",
    schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Human name/model of the asset. Required."
        },
        category: {
          type: "string",
          enum: [
            "excavator",
            "loader",
            "skid_steer",
            "boom_lift",
            "scissor_lift",
            "generator",
            "compressor",
            "light_tower",
            "pump",
            "trailer"
          ],
          description: "Asset category. Required."
        },
        dailyRate: {
          type: "number",
          minimum: 0,
          description: "Rental rate per day. Required."
        },
        requiredDeposit: {
          type: "number",
          minimum: 0,
          description: "Security deposit required to rent it. Required."
        },
        condition: {
          type: "string",
          enum: [
            "excellent",
            "good",
            "fair",
            "poor",
            "damaged"
          ],
          description: "Optional starting condition (defaults to \"good\")."
        }
      },
      required: [
        "name",
        "category",
        "dailyRate",
        "requiredDeposit"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  updateAssetCondition: {
    form: "run",
    entity: "auditLog",
    label: "Record an asset grade",
    does: "PRIVILEGED: requires canManageFleet (owner/admin) — read your own permissions with getMember and no arguments. Update an asset's recorded condition (excellent…damaged), e.g. after an inspection. This is an out-of-band correction; checkInAsset already records the return condition. Setting condition to \"damaged\" does NOT auto-file a claim — call fileClaim separately.",
    schema: {
      type: "object",
      properties: {
        assetId: {
          type: "string",
          pattern: "^ast_[a-z0-9]+$",
          description: "The asset to update. Required."
        },
        condition: {
          type: "string",
          enum: [
            "excellent",
            "good",
            "fair",
            "poor",
            "damaged"
          ],
          description: "New condition. Required."
        }
      },
      required: [
        "assetId",
        "condition"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  scheduleMaintenance: {
    form: "run",
    entity: "auditLog",
    label: "Book a workshop window",
    does: "PRIVILEGED: requires canManageFleet (owner/admin) — read your own permissions with getMember and no arguments. Put an asset into maintenance for a date window, making it unavailable to book in that window (status→maintenance). REJECTED if the asset is currently out on an active rental. Returns a maintenance record. There is no way to cancel a maintenance window on this surface: completeMaintenance is the only exit and it records a real resulting condition.",
    schema: {
      type: "object",
      properties: {
        assetId: {
          type: "string",
          pattern: "^ast_[a-z0-9]+$",
          description: "The asset to service. Required."
        },
        startDate: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Maintenance window start, ISO YYYY-MM-DD. Required."
        },
        endDate: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Maintenance window end, ISO YYYY-MM-DD, after startDate. Required."
        },
        reason: {
          type: "string",
          description: "Optional reason (e.g. \"hydraulic service\")."
        }
      },
      required: [
        "assetId",
        "startDate",
        "endDate"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  completeMaintenance: {
    form: "run",
    entity: "auditLog",
    label: "Return an asset to service",
    does: "PRIVILEGED: requires canManageFleet (owner/admin) — read your own permissions with getMember and no arguments. Return an asset from maintenance to service (status maintenance→available) and record the resulting condition. Only assets currently in maintenance can be completed.",
    schema: {
      type: "object",
      properties: {
        assetId: {
          type: "string",
          pattern: "^ast_[a-z0-9]+$",
          description: "The asset in maintenance. Required."
        },
        condition: {
          type: "string",
          enum: [
            "excellent",
            "good",
            "fair",
            "poor",
            "damaged"
          ],
          description: "Condition after maintenance. Required."
        }
      },
      required: [
        "assetId",
        "condition"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  inviteMember: {
    form: "run",
    entity: "members",
    label: "Invite a member",
    does: "Invite a new member with a role. CONSUMES a seat — REJECTED when the workspace is at its seat cap (check getPlanUsage). PRIVILEGED: requires the acting user to have canManageMembers (owner/admin).",
    schema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          description: "Invitee email. Required."
        },
        role: {
          type: "string",
          enum: [
            "admin",
            "dispatcher",
            "billing",
            "viewer"
          ],
          description: "Role to grant. Required (a new invite cannot be owner)."
        }
      },
      required: [
        "email",
        "role"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  }
},
  destructive: {
  cancelBooking: {
    form: "run",
    entity: "bookings",
    label: "cancelling a booking",
    does: "Cancel a booking. DESTRUCTIVE and irreversible — frees the asset and voids any dispatch. A booking already out on rental cannot be cancelled (check it in instead).",
    schema: {
      type: "object",
      properties: {
        bookingId: {
          type: "string",
          pattern: "^bk_[a-z0-9]+$",
          description: "The booking to cancel. Required."
        }
      },
      required: [
        "bookingId"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    target: "bookingId"
  },
  cancelDispatch: {
    form: "run",
    entity: "bookings",
    label: "cancelling a technician dispatch",
    does: "PRIVILEGED: requires canDispatch (owner/admin/dispatcher) — read your own permissions with getMember and no arguments. Remove a technician's field-job assignment from a booking, freeing that technician's day. DESTRUCTIVE.",
    schema: {
      type: "object",
      properties: {
        bookingId: {
          type: "string",
          pattern: "^bk_[a-z0-9]+$",
          description: "The booking whose dispatch to cancel. Required."
        }
      },
      required: [
        "bookingId"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    target: "bookingId"
  },
  chargeDeposit: {
    form: "run",
    entity: "bookings",
    label: "charging a security deposit",
    does: "PRIVILEGED: requires canMoveMoney (owner/billing) — read your own permissions with getMember and no arguments. Charge / place a security-deposit hold for a booking. MOVES money. Amount defaults to the asset's required deposit; pass amount for a partial top-up. Idempotent — a booking already fully held is reported, not double-charged. REJECTED when the workspace-wide sum of held deposits would pass the plan deposit-float limit — read getDepositBalance with no bookingId for the limit and what remains.",
    schema: {
      type: "object",
      properties: {
        bookingId: {
          type: "string",
          pattern: "^bk_[a-z0-9]+$",
          description: "The booking to place the deposit for. Required."
        },
        amount: {
          type: "number",
          minimum: 0,
          description: "Optional. Amount to hold (defaults to the asset's required deposit)."
        }
      },
      required: [
        "bookingId"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    target: "bookingId"
  },
  releaseDeposit: {
    form: "run",
    entity: "bookings",
    label: "releasing a security deposit",
    does: "PRIVILEGED: requires canMoveMoney (owner/billing) — read your own permissions with getMember and no arguments. Release a held security deposit back to the customer. MOVES money and cannot be undone. BLOCKED while an open damage claim or a legal/compliance hold exists against the booking, asset, or customer account. Pass amount for a partial release, capped at the amount held.",
    schema: {
      type: "object",
      properties: {
        bookingId: {
          type: "string",
          pattern: "^bk_[a-z0-9]+$",
          description: "The booking whose deposit to release. Required."
        },
        amount: {
          type: "number",
          minimum: 0,
          description: "Optional. Partial amount to release (capped at the held amount)."
        }
      },
      required: [
        "bookingId"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    target: "bookingId"
  },
  payInvoice: {
    form: "run",
    entity: "invoices",
    label: "recording a payment on an invoice",
    does: "PRIVILEGED: requires canMoveMoney (owner/billing) — read your own permissions with getMember and no arguments. Record a payment against an invoice. MOVES money. Idempotent via an optional idempotencyKey and an already-paid guard — never double-charge. Pass amount for a partial payment, capped at balanceDue.",
    schema: {
      type: "object",
      properties: {
        invoiceId: {
          type: "string",
          pattern: "^inv_[a-z0-9]+$",
          description: "The invoice to pay. Required."
        },
        amount: {
          type: "number",
          minimum: 0,
          description: "Optional. Amount to pay (defaults to the full balanceDue; capped at it)."
        },
        idempotencyKey: {
          type: "string",
          description: "Optional. A caller-supplied key; a repeat call with the same key is a no-op returning the first result."
        }
      },
      required: [
        "invoiceId"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    target: "invoiceId"
  },
  issueRefund: {
    form: "run",
    entity: "invoices",
    label: "paying a refund out",
    does: "PRIVILEGED: requires canMoveMoney (owner/billing) — read your own permissions with getMember and no arguments. Refund money against a paid invoice. CAPPED at amountPaid — partial allowed, over-cap REJECTED. MOVES money and cannot be undone. BLOCKED while a compliance/legal hold freezes the account.",
    schema: {
      type: "object",
      properties: {
        invoiceId: {
          type: "string",
          pattern: "^inv_[a-z0-9]+$",
          description: "The paid invoice to refund. Required."
        },
        amount: {
          type: "number",
          minimum: 0,
          description: "Amount to refund, capped at amountPaid. Required."
        },
        reason: {
          type: "string",
          description: "Optional refund reason."
        }
      },
      required: [
        "invoiceId",
        "amount"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    target: "invoiceId"
  },
  voidInvoice: {
    form: "run",
    entity: "invoices",
    label: "voiding an invoice",
    does: "PRIVILEGED: requires canMoveMoney (owner/billing) — read your own permissions with getMember and no arguments. Void an issued/overdue invoice (status→void). DESTRUCTIVE. A PAID invoice cannot be voided — issue a refund instead.",
    schema: {
      type: "object",
      properties: {
        invoiceId: {
          type: "string",
          pattern: "^inv_[a-z0-9]+$",
          description: "The invoice to void. Required."
        }
      },
      required: [
        "invoiceId"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    target: "invoiceId"
  },
  resolveClaim: {
    form: "run",
    entity: "claims",
    label: "resolving a claim for good",
    does: "PRIVILEGED: requires canMoveMoney (owner/billing), for approve/settle — read your own permissions with getMember and no arguments. Resolve a claim: \"approve\" (deduct settlementAmount from the booking's security deposit), \"deny\" (no charge), or \"settle\" (record an agreed settlementAmount). Resolving lifts the claim's investigatory hold.settlementAmount is REQUIRED for approve and settle and is ignored for deny. resolution=deny moves no money and is ONE step; approve and settle move money and are two-step. Never invent a settlement figure: it comes from the user or from getClaim.",
    schema: {
      type: "object",
      properties: {
        claimId: {
          type: "string",
          pattern: "^clm_[a-z0-9]+$",
          description: "The claim to resolve. Required."
        },
        resolution: {
          type: "string",
          enum: [
            "approve",
            "deny",
            "settle"
          ],
          description: "How to resolve it. Required."
        },
        settlementAmount: {
          type: "number",
          minimum: 0,
          description: "Amount to charge against the deposit for approve/settle. Required for approve/settle."
        }
      },
      required: [
        "claimId",
        "resolution"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    target: "claimId",
    when: {
      arg: "resolution",
      oneOf: [
        "approve",
        "settle"
      ]
    }
  },
  placeHold: {
    form: "run",
    entity: "holds",
    label: "freezing the entire workspace",
    does: "Place a legal/compliance/safety/payment hold that FREEZES an asset, a customer account, or the whole workspace. While active it blocks new bookings, checkouts, deposit releases, and refunds on the frozen entity. Additive and protective — no confirm needed. Pass assetId for scope=asset, customerId for scope=account. assetId is REQUIRED when scope=asset and customerId is REQUIRED when scope=account; a missing one is rejected. Asset and account scope stay one-step.",
    schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: [
            "legal",
            "compliance",
            "safety",
            "payment"
          ],
          description: "The hold category. Required."
        },
        scope: {
          type: "string",
          enum: [
            "asset",
            "account",
            "workspace"
          ],
          description: "What the hold freezes. Required."
        },
        reason: {
          type: "string",
          description: "Why the hold is placed. Required, non-empty."
        },
        assetId: {
          type: "string",
          pattern: "^ast_[a-z0-9]+$",
          description: "The frozen asset (required when scope=asset)."
        },
        customerId: {
          type: "string",
          pattern: "^cust_[a-z0-9]+$",
          description: "The frozen customer account (required when scope=account)."
        }
      },
      required: [
        "type",
        "scope",
        "reason"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    when: {
      arg: "scope",
      oneOf: [
        "workspace"
      ]
    }
  },
  releaseHold: {
    form: "run",
    entity: "holds",
    label: "releasing a hold",
    does: "PRIVILEGED: requires canManageMembers (owner/admin) — the authorized-member requirement of the hold-release policy — read your own permissions with getMember and no arguments. Lift a legal/compliance/safety/payment hold, un-freezing the entity. DESTRUCTIVE — removing a compliance/legal freeze is high-risk. Verify the reason (and lookupPolicy \"hold_release\") before releasing.",
    schema: {
      type: "object",
      properties: {
        holdId: {
          type: "string",
          pattern: "^hold_[a-z0-9]+$",
          description: "The hold to lift. Required."
        }
      },
      required: [
        "holdId"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    target: "holdId"
  },
  retireAsset: {
    form: "run",
    entity: "assets",
    label: "retiring an asset out of the fleet",
    does: "PRIVILEGED: requires canManageFleet (owner/admin) — read your own permissions with getMember and no arguments. Permanently retire an asset from the fleet (status→retired). DESTRUCTIVE and irreversible. BLOCKED if the asset is out on rental, reserved by a future booking, or under a hold.",
    schema: {
      type: "object",
      properties: {
        assetId: {
          type: "string",
          pattern: "^ast_[a-z0-9]+$",
          description: "The asset to retire. Required."
        }
      },
      required: [
        "assetId"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    target: "assetId"
  },
  transferAsset: {
    form: "run",
    entity: "assets",
    label: "transferring an asset to another site",
    does: "PRIVILEGED: requires canManageFleet (owner/admin) — read your own permissions with getMember and no arguments. Transfer an asset to another workspace/location (leaves this workspace's fleet). DESTRUCTIVE from this workspace's view. BLOCKED while the asset is out on rental, reserved by a future booking, or under a hold.targetWorkspaceId must be supplied VERBATIM by the user: no tool on this surface lists or resolves another workspace, so it can never be looked up, derived or inferred. If the user names a place instead of a ws_ id, ask for the id. Transferring to this same workspace is rejected.",
    schema: {
      type: "object",
      properties: {
        assetId: {
          type: "string",
          pattern: "^ast_[a-z0-9]+$",
          description: "The asset to transfer. Required."
        },
        targetWorkspaceId: {
          type: "string",
          pattern: "^ws_[a-z0-9]+$",
          description: "Destination workspace id. Required."
        }
      },
      required: [
        "assetId",
        "targetWorkspaceId"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    target: "assetId"
  },
  removeMember: {
    form: "run",
    entity: "members",
    label: "removing a member from the workspace",
    does: "Remove a member from the workspace, freeing their seat. DESTRUCTIVE and irreversible. PRIVILEGED (owner/admin). Cannot remove the sole owner.",
    schema: {
      type: "object",
      properties: {
        memberId: {
          type: "string",
          pattern: "^mem_[a-z0-9]+$",
          description: "The member to remove. Required."
        }
      },
      required: [
        "memberId"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    target: "memberId"
  },
  updateMemberRole: {
    form: "run",
    entity: "members",
    label: "making a member an owner",
    does: "Change a member's role. PRIVILEGED — requires the acting user to be owner/admin (canManageMembers). Cannot demote the sole remaining owner. Every other role change is one-step.",
    schema: {
      type: "object",
      properties: {
        memberId: {
          type: "string",
          pattern: "^mem_[a-z0-9]+$",
          description: "The member to change. Required."
        },
        role: {
          type: "string",
          enum: [
            "owner",
            "admin",
            "dispatcher",
            "billing",
            "viewer"
          ],
          description: "New role. Required."
        }
      },
      required: [
        "memberId",
        "role"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    },
    target: "memberId",
    when: {
      arg: "role",
      oneOf: [
        "owner"
      ]
    }
  },
  changePlan: {
    form: "run",
    entity: "auditLog",
    label: "switching this workspace to a different plan tier",
    does: "Change the workspace plan tier (starter/pro/fleet/enterprise). Adjusts seat and booking caps and MAY change billing. PRIVILEGED (owner). Downgrading below current usage (seats or active bookings over the new cap) is REJECTED.",
    schema: {
      type: "object",
      properties: {
        plan: {
          type: "string",
          enum: [
            "starter",
            "pro",
            "fleet",
            "enterprise"
          ],
          description: "Target plan tier. Required."
        }
      },
      required: [
        "plan"
      ],
      additionalProperties: false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  }
}
} as never, Object.fromEntries([...READS, ...WRITES, ...Object.keys(DESTRUCTIVE)]
  .map(name => [name, executor(HANDLERS[name])])));
