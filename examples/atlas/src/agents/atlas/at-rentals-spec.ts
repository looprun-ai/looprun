/**
 * at-rentals — Atlas Equipment Rentals & Field Ops, the RENTALS & DISPATCH agent.
 *
 * Bucket: reserve / reschedule / cancel rentals; check assets out and in; close settled bookings;
 * dispatch and cancel field-technician jobs. Derived from atlas/WORLD-MODEL.md + tools.json + the
 * projection() in world.ts (the ONLY keys a check may read). No gold spec was consulted — every rule
 * is engineered from this domain's own docs/schemas, in the format of references/spec-template.ts.
 *
 * Layer rationale: ONE AgentSpecBase. The constructor auto-installs the universal invariants
 * (noDuplicateCall, degenerationGuard, emptyReply), noFalseFailureClaim (because the lexicon supplies
 * falseFailureClaimRe), and — because cancelBooking/cancelDispatch are in destructiveTools — the
 * destructive-safety protocol (confirmFirst + destructiveThrottle) on those two. Everything below is
 * the agent layer: the decidable frontier of THIS bucket, one gate per rule on its natural hook.
 *
 * // UNCHECKABLE (no observable projection key — conditioned prose + eval dimension only, so N4/G3 see them):
 * //   - Check-in precedes close: closeBooking needs the booking's own status='returned' (plus paid
 * //     invoice, released deposit, no open claim) — per-booking lifecycle is NOT in projection() (only
 * //     aggregate counts), and the default preset seeds an already-returned booking the agent never
 * //     checked in, so a requiresBefore(['checkInAsset']) gate would wrongly block it. World-enforced.
 * //   - Dispatch requires an ACTIVE booking (confirmed/out, not cancelled/closed): per-booking status
 * //     is not a projection key — world-enforced (BOOKING_NOT_DISPATCHABLE); prose only.
 * //   - Check-out blocked on a frozen asset/account or a deposit shortfall for a SPECIFIC booking:
 * //     checkOutAsset args carry only bookingId; projection() has no booking→asset / booking→deposit
 * //     map (only aggregate frozenAssetIds / depositShortfall), so the specific booking can't be keyed.
 * //   - Scope boundary — deposit charge/release, invoicing, payments, refunds are the Billing agent's
 * //     job: none of those tools are on this surface, so there is nothing to gate; prose forbids the claim.
 */
import { AgentSpecBase } from 'looprun';
import {
  argFormat,
  custom,
  destructiveClaimRequiresSuccess,
  jargonScrub,
  noFabricatedSuccess,
  pendingConfirmMustAsk,
  precondition,
  requiresBefore,
} from 'looprun';

// ── Business-owned language patterns (P8a: the runtime holds NO linguistic regex). A real bundle
// keeps these in ONE lexicon module; inlined here to stay self-contained, all /i (no stateful /g or /y).
const ISO_DATE = '^\\d{4}-\\d{2}-\\d{2}$';
// The fixed reference clock from WORLD-MODEL.md — a domain constant, not a wall-clock read.
const REFERENCE_DATE = '2026-07-01';

const BOOKING_CLAIM_RE = /\b(booked|reserved|reservation (is )?(confirmed|created|made|done|set)|booking (is )?(confirmed|created|made|done|set))\b/i;
const DISPATCH_CLAIM_RE = /\b(dispatched|technician (is )?(assigned|scheduled|booked|on the way|sent)|assigned (a|the) technician|job (is )?(assigned|scheduled))\b/i;
const DESTRUCTIVE_CLAIM_RE = /\b(cancell?ed|removed|voided|dropped|freed (up )?the (asset|day)|un-?assigned|took (the )?technician off)\b/i;
const CONFIRM_ASK_RE = /\b(confirm|are you sure|please confirm|shall i proceed|should i proceed|do you want me to|would you like me to|okay to proceed|proceed\?)\b/i;
const OFFER_OR_CONDITIONAL_RE = /\b(would|could|can|i can|i could|if you|want me to|do you want|shall i|let me know|to cancel|once you|when you)\b/i;
// T iteration 2 (measured, rung-2 cases 03/07/23/44): the previous broad can't/cannot/unable
// matcher classified honest POLICY REFUSALS and probe-consequence phrasing ("cannot be undone")
// as false failure claims — noFalseFailureClaim fires when all this-turn calls SUCCEEDED, which
// is exactly the successful-reads + honest-refusal shape — redriving the reply into the
// exhaustion fallback (cross-domain lessons #2/#8). Narrowed to attempted-work FAILURE phrasing.
const FALSE_FAILURE_CLAIM_RE =
  /\b(failed to|could not (?:complete|process|create|generate|save|find a way)|error(?:ed)? (?:out|occurred)|ran into (?:an )?error|something went wrong|tried (?:to|but) [^.!?\n]{0,32}(?:failed|didn'?t work))\b/i;

export class AgentSpecAtRentals extends AgentSpecBase {
  constructor() {
    super({
      id: 'at-rentals',
      mode: 'RENTALS_DISPATCH',
      persona:
        'You are the rentals & dispatch agent: you reserve, reschedule, and cancel equipment rentals, check assets out and in, close settled bookings, and dispatch field technicians.',
      // 13 tools; no terminal tools (replyToUser/askUser are the runner's).
      tools: [
        'checkAvailability', 'listBookings', 'getBooking', 'createBooking', 'rescheduleBooking',
        'cancelBooking', 'checkOutAsset', 'checkInAsset', 'closeBooking', 'listTechnicians',
        'getTechnicianSchedule', 'dispatchTechnician', 'cancelDispatch',
      ],
      // Both carry the two-step confirmed-flag protocol → constructor auto-installs confirmFirst
      // (default 'arg' mechanism) + destructiveThrottle on exactly these.
      destructiveTools: ['cancelBooking', 'cancelDispatch'],
      // Supplying falseFailureClaimRe auto-installs the always-on noFalseFailureClaim reply invariant.
      lexicon: { falseFailureClaimRe: FALSE_FAILURE_CLAIM_RE, confirmAskRe: CONFIRM_ASK_RE },
      behavior: [
        // Every line CONDITIONED (Bucket-A): "when X, do Y" — no bare state assertions.
        'Before you tell a customer an asset is free or reserve it, call checkAvailability for that exact asset and date range — never claim availability you have not read.',
        'Reserve only into the future: dates are ISO YYYY-MM-DD and the start must be after the reference date (2026-07-01); when a date is malformed or in the past, ask for a corrected date instead of booking.',
        'When the workspace is at its active-booking cap, or onboarding is not complete, do not promise a booking — say what blocks it (upgrade the plan, close a booking, or finish setup) and stop.',
        'When the asset or the customer account is under a legal or compliance hold, a reservation or check-out is blocked — say the hold blocks it and do not try to force it.',
        'Check an asset out only when the booking is confirmed and its security deposit is fully held; on a deposit shortfall, say the deposit must be topped up first (that is Billing’s job) rather than checking out.',
        'A booking can be closed only after it has been checked in, its invoice is paid, and its deposit released; when something is still outstanding, name what remains and stop.',
        'Before dispatching a technician, read that technician’s schedule for the date and confirm they are free — never claim a technician is available without checking, and pick a different date or technician on a conflict.',
        'You need dispatch permission (owner/admin/dispatcher) to assign or remove a field job; when you lack it, say so plainly and do not attempt the dispatch.',
        'Dispatch a technician only against a booking that is currently active (confirmed or out) — when the booking is cancelled, closed, or not found, say why instead of forcing the job.',
        'To cancel a booking or a dispatch: first call the tool without confirming to surface the confirmation prompt, relay that exact question to the user, and STOP; only after the user explicitly confirms do you call again with confirmation. Never confirm and execute in the same turn.',
        'Deposits, invoices, payments, and refunds are the Billing agent’s work — never say you charged, released, invoiced, paid, or refunded anything; direct the user to billing for those.',
        'Only state that a booking, reschedule, check-out, check-in, close, or dispatch happened after the matching tool returned success this turn; when a call fails, report the real error briefly and never claim success that did not occur.',
        'Find real ids before acting — list the bookings, assets, technicians, or customers rather than inventing a bk_/ast_/tech_/cust_ id.',
        'When a request is ambiguous or garbled, recover with ONE concrete clarifying question, in the user’s language, kept brief.',
      ],
    });

    // ── Spatial: availability before booking (createBooking tool desc: "REQUIRES that
    // checkAvailability returned available:true"). One gate names its predecessor.
    this.addGuard('preTool', ['createBooking'], requiresBefore(['checkAvailability']));

    // Spatial: read the technician's schedule before dispatch (dispatch-conflict preset exercises
    // the conflict read; tool desc: "check getTechnicianSchedule first").
    this.addGuard('preTool', ['dispatchTechnician'], requiresBefore(['getTechnicianSchedule']));

    // ── Run (projection-read preconditions) ─────────────────────────────────────
    // Onboarding gate (not-onboarded preset → NOT_ONBOARDED). REASON fires on deny; PROSE states the
    // CONDITION, never the current state.
    this.addGuard('preTool', ['createBooking'], precondition(
      (w) => (w.projection() as { onboarded: boolean }).onboarded === true,
      'Workspace onboarding is not complete — no bookings can be made yet; tell the user to finish setup first.',
      'booking needs a fully onboarded workspace — when onboarding is incomplete, say setup must finish first and stop',
    ));

    // Active-booking quota gate (quota-exhausted preset → atBookingCap).
    this.addGuard('preTool', ['createBooking'], precondition(
      (w) => (w.projection() as { atBookingCap: boolean }).atBookingCap !== true,
      'At the active-booking cap for this plan — refuse and offer to change the plan or close an existing booking.',
      'a new booking needs plan capacity — when the workspace is at its active-booking cap, refuse and offer to upgrade the plan or close a booking',
    ));

    // Dispatch permission gate (limited-permission preset: dispatcher has it, viewer does not).
    const dispatchPermission = precondition(
      (w) => (w.projection() as { canDispatch: boolean }).canDispatch === true,
      'The acting user lacks dispatch permission (owner/admin/dispatcher) — refuse and say who can do it.',
      'dispatching or cancelling a field job needs dispatch permission — when the acting user lacks it, refuse and say so',
    );
    this.addGuard('preTool', ['dispatchTechnician'], dispatchPermission);
    this.addGuard('preTool', ['cancelDispatch'], dispatchPermission);

    // ── Run (arg × projection): a hold on the named asset/account blocks a NEW booking. createBooking
    // args carry assetId + customerId directly, so the specific entity can be keyed against projection.
    this.addGuard('preTool', ['createBooking'], custom({
      kind: 'bookingAssetNotFrozen',
      dim: 'run',
      check: (ctx) => {
        const assetId = String((ctx.args as { assetId?: unknown }).assetId ?? '');
        const frozen = (ctx.world.projection() as { frozenAssetIds: string[] }).frozenAssetIds ?? [];
        return assetId && frozen.includes(assetId)
          ? `${assetId} is under an active hold — it cannot be booked until the hold is released. Do not book it.`
          : null;
      },
      prose: () => 'when the requested asset is under an active legal/compliance hold, refuse the booking and say the hold blocks it',
    }));
    this.addGuard('preTool', ['createBooking'], custom({
      kind: 'bookingAccountNotFrozen',
      dim: 'run',
      check: (ctx) => {
        const customerId = String((ctx.args as { customerId?: unknown }).customerId ?? '');
        const frozen = (ctx.world.projection() as { frozenCustomerIds: string[] }).frozenCustomerIds ?? [];
        return customerId && frozen.includes(customerId)
          ? `${customerId}'s account is under an active hold — it cannot rent until the hold is released. Do not book it.`
          : null;
      },
      prose: () => 'when the customer account is under an active hold, refuse the booking and say the hold blocks it',
    }));

    // ── Input: date shape + no past start, on the two date-mutating tools (world → INVALID_DATE / PAST_DATE).
    this.addGuard('preTool', ['createBooking'], argFormat('startDate', ISO_DATE, undefined, 'startDate must be an ISO YYYY-MM-DD date.'));
    this.addGuard('preTool', ['createBooking'], argFormat('endDate', ISO_DATE, undefined, 'endDate must be an ISO YYYY-MM-DD date.'));
    this.addGuard('preTool', ['rescheduleBooking'], argFormat('startDate', ISO_DATE, undefined, 'startDate must be an ISO YYYY-MM-DD date.'));
    this.addGuard('preTool', ['rescheduleBooking'], argFormat('endDate', ISO_DATE, undefined, 'endDate must be an ISO YYYY-MM-DD date.'));
    this.addGuard('preTool', ['dispatchTechnician'], argFormat('scheduledDate', ISO_DATE, undefined, 'scheduledDate must be an ISO YYYY-MM-DD date.'));

    const noPastStart = custom({
      kind: 'noPastStartDate',
      dim: 'input',
      check: (ctx) => {
        const start = String((ctx.args as { startDate?: unknown }).startDate ?? '');
        // ISO lexical compare == chronological compare; empty/malformed dates are argFormat's job.
        return start && new RegExp(ISO_DATE).test(start) && start <= REFERENCE_DATE
          ? `startDate ${start} is not in the future (reference date ${REFERENCE_DATE}) — ask the user for a future date.`
          : null;
      },
      prose: () => `a rental start must be after the reference date (${REFERENCE_DATE}) — when it is today or in the past, ask for a future date`,
    });
    this.addGuard('preTool', ['createBooking'], noPastStart, { id: 'agent:noPastStartDate:createBooking' });
    this.addGuard('preTool', ['rescheduleBooking'], noPastStart, { id: 'agent:noPastStartDate:rescheduleBooking' });

    // ── Behavior: honesty on booking / dispatch success (attempt-keyed; fires only when the tool ran
    // this turn but did not succeed and the reply claims it did).
    this.addReplyCheck(noFabricatedSuccess('createBooking', {
      claimRe: BOOKING_CLAIM_RE,
      reason: 'You claimed a booking was made, but createBooking did not succeed this turn — state what actually happened.',
    }), { id: 'agent:noFabricatedSuccess:createBooking' });
    this.addReplyCheck(noFabricatedSuccess('dispatchTechnician', {
      claimRe: DISPATCH_CLAIM_RE,
      reason: 'You claimed a technician was dispatched, but dispatchTechnician did not succeed this turn — state what actually happened.',
    }), { id: 'agent:noFabricatedSuccess:dispatchTechnician' });

    // Two-step confirm honesty on the destructive pair: an attempted cancel may not be reported as done
    // unless a confirmed:true call succeeded (exempts confirm-probes, offers/conditionals, honest failures).
    this.addReplyCheck(destructiveClaimRequiresSuccess(['cancelBooking', 'cancelDispatch'], {
      claimRe: DESTRUCTIVE_CLAIM_RE,
      askRe: CONFIRM_ASK_RE,
      offerRe: OFFER_OR_CONDITIONAL_RE,
      exemptRe: FALSE_FAILURE_CLAIM_RE,
    }), { id: 'agent:destructiveClaimRequiresSuccess' });

    // When a cancel tool returns requiresConfirmation, the reply MUST relay the confirmation question.
    this.addReplyCheck(pendingConfirmMustAsk({ askRe: CONFIRM_ASK_RE }), { id: 'agent:pendingConfirmMustAsk' });

    // ── Egress: humanize any leaked internal tool jargon before the reply leaves.
    this.addMutator(jargonScrub({
      checkOutAsset: 'check-out', checkInAsset: 'check-in', dispatchTechnician: 'technician dispatch',
    }), { id: 'agent:jargonScrub' });
  }
}

export default new AgentSpecAtRentals();
