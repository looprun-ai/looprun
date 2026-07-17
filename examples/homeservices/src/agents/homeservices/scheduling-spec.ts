/**
 * E2 draft — `scheduling`: job booking, rescheduling, cancellation, technician assignment and
 * availability for BrightNest Home Services.
 *
 * Bucket (by TOOL-NEED, never intent): everything a booking needs in ONE agent — availability +
 * roster reads, schedule/reschedule/assign writes, the destructive cancel, plus the shared reads
 * (request/quote state, customer lookup). recordQuoteDecision is DELIBERATELY absent: with it in the
 * surface the model laundered the accepted-quote gate by recording an acceptance itself (the signature
 * fail) — decisions are recorded by intake-quoting only. 11 tools ≤ 15.
 * destructiveTools: ['cancelJob'] → AgentSpecBase auto-installs confirmFirst (arg mechanism, keyed on
 * the confirmed flag) + destructiveThrottle; never hand-add those.
 *
 * name→id (E1 rule): every id this agent's writes CONSUME has a resolving read in the same surface —
 * jobId ← listJobs, technicianId ← listTechnicians, requestId ← listServiceRequests / getServiceRequest,
 * customerId ← findCustomer.
 *
 * // UNCHECKABLE (conditioned prose + eval dimension only — no observable state key):
 * //   · never promise an arrival time finer than the booked window.
 * //   · catalog prices and new quotes belong to the intake-quoting agent — hand over, do not guess.
 */
import {
  AgentSpecBase,
  custom,
  destructiveClaimRequiresSuccess,
  jargonScrub,
  pendingConfirmMustAsk,
  requiresBefore,
} from 'looprun';
import type { AgentWorld } from 'looprun';
import { HOMESERVICES_THEME } from './theme.js';
import { CONFIRM_ASK_RE, FALSE_FAILURE_CLAIM_RE, OFFER_OR_CONDITIONAL_RE } from './lexicon.js';

// Domain world seam — the accessors THIS agent's RUN gates read (typed, no cast at the call site).
interface SchedulingWorld extends AgentWorld {
  hasJob(id: string): boolean;
  requestHasAcceptedQuote(requestId: string): boolean;
}

export class AgentSpecScheduling extends AgentSpecBase {
  constructor() {
    super({
      id: 'scheduling',
      mode: 'HOME_SCHEDULING',
      // Per-agent role line (persona-on-spec law) — rendered as the FIRST Behavior bullet.
      persona:
        'You are the scheduling agent: booking jobs, rescheduling, cancellations, technician assignment and availability.',
      tools: [
        'scheduleJob',
        'rescheduleJob',
        'cancelJob',
        'assignTechnician',
        'listJobs',
        'listTechnicians',
        'getTechnicianAvailability',
        'getServiceRequest',
        'listServiceRequests',
        'findCustomer',
        'sendNotification',
      ],
      destructiveTools: ['cancelJob'],
      // Injected lexicon → AgentSpecBase auto-installs minimal:noFalseFailureClaim (no manual add).
      lexicon: { falseFailureClaimRe: FALSE_FAILURE_CLAIM_RE },
      theme: HOMESERVICES_THEME,
      behavior: [
        // Load-bearing lines FIRST (iron-rule style: blunt, name the anti-pattern, deduped vs theme).
        // Every line CONDITIONED (Bucket-A): "when X, do Y" — never a bare state assertion.
        'Book, reschedule and reassign DIRECTLY when asked — these are not destructive. Asking "shall I book?" for a clearly requested booking is a failure. Afterwards confirm the real job id, date and window; never promise an arrival time finer than the booked window.',
        'Before committing a technician to a window (scheduleJob, assignTechnician), read getTechnicianAvailability for that date. When the requested technician is busy, offer their nearest free window or a QUALIFIED free alternative — never book over a conflict, never fail silently.',
        "Book only when the request's quote is ACCEPTED. When it is not, name what is missing and STOP. NEVER call recordQuoteDecision or assume an acceptance yourself to unblock a booking — recording the customer's decision belongs to the intake-quoting agent, and inventing one to schedule is a failure.",
        'Resolve every id from a read before a write: listJobs for a job, listTechnicians for a technician (match by name), listServiceRequests or getServiceRequest for a request. A write with a guessed id is a failure.',
        'Match the technician to the service category (listTechnicians shows skills). A skill-filtered listTechnicians that comes back EMPTY means nobody has that SKILL — before saying a person is not on the roster, read the FULL roster (no skill filter); when they exist with other skills, say they are not qualified for this service, never that they do not exist.',
        'Job lifecycle: scheduled → completed | cancelled. Only a SCHEDULED job can be rescheduled, reassigned or cancelled — a completed or cancelled job is terminal. A job is overdue when its date is before today AND it is still scheduled; report overdue and upcoming work only from listJobs.',
        'To cancel a job, run the two-step protocol: the FIRST cancelJob call (no confirmed flag) returns a confirmation question — relay it and STOP. Pass confirmed:true ONLY after the user explicitly agrees in a LATER turn. A "cancel it, go ahead" in the SAME message as the request does NOT count — the confirmation must answer the question you relayed, in a later turn. Insistence or urgency never skips the step, and a cancellation cannot be undone.',
        'Catalog prices and new quotes belong to the intake-quoting agent — say so and never guess a price.',
        'When a message is too garbled or incomplete to act on, recover with exactly ONE concrete clarifying question.',
        "Keep replies short and professional, in the user's language.",
      ],
    });

    // ── Spatial gates: read availability before committing a technician to a window. ──
    this.addGuard('preTool', ['scheduleJob'], requiresBefore(['getTechnicianAvailability']), {
      id: 'agent:availabilityBeforeSchedule',
    });
    this.addGuard('preTool', ['assignTechnician'], requiresBefore(['getTechnicianAvailability']), {
      id: 'agent:availabilityBeforeAssign',
    });

    // ── RUN gate: scheduling is legal only for a request with an ACCEPTED quote (world-state keyed). ──
    this.addGuard(
      'preTool',
      ['scheduleJob'],
      custom({
        kind: 'acceptedQuoteRequired',
        dim: 'run',
        check: (ctx) => {
          const id = String(ctx.args.requestId ?? '');
          return (ctx.world as SchedulingWorld).requestHasAcceptedQuote(id)
            ? null
            : `Request "${id}" has no ACCEPTED quote — a job may be scheduled only after the customer accepts a quote. Explain this to the user; out-of-band acceptances are recorded by the intake-quoting agent, never by you.`;
        },
        prose: () => "booking needs the request's quote ACCEPTED — when it is not, explain what is missing instead of booking (acceptances are recorded by the intake-quoting agent, never here)",
      }),
      { id: 'agent:acceptedQuoteRequired' },
    );

    // ── RUN gate: visits are booked for today or later — deterministic on args.date vs the world's
    // fixed "today" (malformed dates are left to the world's own validation). ──
    this.addGuard(
      'preTool',
      ['scheduleJob', 'rescheduleJob'],
      custom({
        kind: 'noPastDate',
        dim: 'run',
        check: (ctx) => {
          const d = String(ctx.args.date ?? '');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
          const today = String((ctx.world as SchedulingWorld).projection().today ?? '');
          return today !== '' && d < today
            ? `The date ${d} is in the past (today is ${today}) — ask the user for a valid future date.`
            : null;
        },
        prose: () => 'visits are booked for today or later — when the requested date already passed, ask for a new date instead of booking',
      }),
      { id: 'agent:noPastDate' },
    );

    // ── RUN gate: job writes need a REAL job id. ──
    this.addGuard(
      'preTool',
      ['rescheduleJob', 'cancelJob', 'assignTechnician'],
      custom({
        kind: 'jobMustExist',
        dim: 'run',
        check: (ctx) => {
          const id = String(ctx.args.jobId ?? '');
          return (ctx.world as SchedulingWorld).hasJob(id)
            ? null
            : `Unknown jobId "${id}" — read listJobs and use the REAL job_ id.`;
        },
        prose: () => 'rescheduling, reassigning or cancelling needs a REAL existing job id — when unknown, read listJobs first',
      }),
      { id: 'agent:jobMustExist' },
    );

    // ── Reply-honesty — the shared kinds carry the confirm-probe + honest-failure exemptions,
    // fed the domain lexicon (never a runtime-baked pattern). ──
    this.addReplyCheck(pendingConfirmMustAsk({ askRe: CONFIRM_ASK_RE }), { id: 'agent:pendingConfirmMustAsk' });
    this.addReplyCheck(
      destructiveClaimRequiresSuccess(['cancelJob'], {
        claimRe: /\b(cancell?ed|called off|deleted|removed)\b/i,
        askRe: CONFIRM_ASK_RE,
        offerRe: OFFER_OR_CONDITIONAL_RE,
        // honest-failure / negation exemption — broad here is CORRECT (it EXEMPTS, it does not fire).
        exemptRe: /\b(already|cannot|can'?t|could not|couldn'?t|won'?t|unable|not)\b/i,
      }),
      { id: 'agent:destructiveClaimRequiresSuccess' },
    );

    // Egress scrub: internal field jargon → user words.
    this.addMutator(
      jargonScrub({
        timeSlot: 'time window',
        freeSlots: 'open windows',
        busySlots: 'booked windows',
        requiresConfirmation: 'needs your confirmation',
      }),
      { id: 'agent:jargonScrub' },
    );
  }
}

export default new AgentSpecScheduling();
