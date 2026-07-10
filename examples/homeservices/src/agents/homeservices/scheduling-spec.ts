/**
 * E2 draft — `scheduling`: job booking, rescheduling, cancellation, technician assignment and
 * availability for BrightNest Home Services.
 *
 * Bucket (by TOOL-NEED, never intent): everything a booking needs in ONE agent — availability +
 * roster reads, schedule/reschedule/assign writes, the destructive cancel, plus the shared reads
 * (request/quote state, customer lookup). recordQuoteDecision was REMOVED in measured iteration 1:
 * with it in the surface the model laundered the accepted-quote gate by recording an acceptance
 * itself (case 13) — decisions are recorded by intake-quoting only. 11 tools ≤ 15.
 * Layer: AgentSpecBase — cancelJob carries the confirmed-flag two-step protocol (auto-installs
 * confirmFirst + destructiveThrottle; never hand-add those).
 *
 * // UNCHECKABLE: never promise an arrival time finer than the booked window — no observable
 * //              state key; conditioned prose + eval dimension only.
 * // UNCHECKABLE: catalog prices and new quotes belong to the intake-quoting agent — say so
 * //              rather than guess; no state key — conditioned prose + eval dimension only.
 */
import {
  AgentSpecBase,
  custom,
  destructiveClaimRequiresSuccess,
  jargonScrub,
  noFalseFailureClaim,
  pendingConfirmMustAsk,
  requiresBefore,
} from 'looprun';
import { HOMESERVICES_THEME } from './theme.js';

type SchedulingWorld = {
  hasJob(id: string): boolean;
  requestHasAcceptedQuote(requestId: string): boolean;
};

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
      theme: HOMESERVICES_THEME,
      behavior: [
        // Every line CONDITIONED (Bucket-A): "when X, do Y" — never a bare state assertion.
        'Before booking or reassigning, read getTechnicianAvailability for the requested date — when the requested technician is busy, offer the nearest free window or a QUALIFIED free alternative instead of failing silently.',
        "When a booking is requested but the request's quote is not accepted yet, explain that acceptance is missing and STOP — recording a customer's quote decision belongs to the intake-quoting agent, and you must NEVER record or assume an acceptance yourself to unblock a booking.",
        "When picking a technician, match skills to the service category (listTechnicians shows skills) — when nobody qualified is free, say so honestly and offer the next option.",
        'When a skill-filtered listTechnicians comes back empty, that means nobody has that SKILL — before saying a person is not on the roster, read the FULL roster (listTechnicians without a skill filter); when they exist with other skills, say they are not qualified for this service, never that they do not exist.',
        'When the user asks to book or reschedule, act directly — these are not destructive and need no permission-asking; afterwards confirm the real job id, date and window. Never promise an arrival time finer than the booked window.',
        'When the user asks to cancel a job, run the two-step protocol: the first cancelJob call returns a confirmation question — relay it and STOP until the user explicitly agrees in a LATER turn, even when the user insists it is urgent.',
        'When asked about overdue or upcoming work, read listJobs and report only what it returns — a job is overdue when its date is before today and it is still scheduled.',
        'When a tool returns success:false, relay the real reason in one short sentence — never claim a booking, move or cancellation happened when it did not.',
        'When asked about catalog prices or new quotes, say the intake-quoting agent handles those — never guess a price.',
        'When a message is too garbled or incomplete to act on, recover with ONE concrete clarifying question.',
        "Keep replies short and professional, in the user's language.",
      ],
    });

    // Spatial gates: read availability before committing a technician to a window.
    this.addGuard('preTool', ['scheduleJob'], requiresBefore(['getTechnicianAvailability']), {
      id: 'agent:availabilityBeforeSchedule',
    });
    this.addGuard('preTool', ['assignTechnician'], requiresBefore(['getTechnicianAvailability']), {
      id: 'agent:availabilityBeforeAssign',
    });

    // Run gate: scheduling is legal only for a request with an ACCEPTED quote (world-state keyed).
    this.addGuard(
      'preTool',
      ['scheduleJob'],
      custom({
        kind: 'acceptedQuoteRequired',
        dim: 'run',
        check: (ctx) => {
          const w = ctx.world as unknown as SchedulingWorld;
          const id = String(ctx.args.requestId ?? '');
          return w.requestHasAcceptedQuote(id)
            ? null
            : `Request "${id}" has no ACCEPTED quote — a job may be scheduled only after the customer accepts a quote. Explain this to the user; out-of-band acceptances are recorded by the intake-quoting agent, never by you.`;
        },
        prose: () => "booking needs the request's quote ACCEPTED — when it is not, explain what is missing instead of booking (acceptances are recorded by the intake-quoting agent, never here)",
      }),
      { id: 'agent:acceptedQuoteRequired' },
    );

    // Run gate (N4 finding): visits are booked for today or later — deterministic on args.date
    // vs the world's fixed "today" (malformed dates are left to the world's own validation).
    this.addGuard(
      'preTool',
      ['scheduleJob', 'rescheduleJob'],
      custom({
        kind: 'noPastDate',
        dim: 'run',
        check: (ctx) => {
          const d = String(ctx.args.date ?? '');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
          const w = ctx.world as unknown as { projection(): Record<string, unknown> };
          const today = String(w.projection().today ?? '');
          return today !== '' && d < today
            ? `The date ${d} is in the past (today is ${today}) — ask the user for a valid future date.`
            : null;
        },
        prose: () => 'visits are booked for today or later — when the requested date already passed, ask for a new date instead of booking',
      }),
      { id: 'agent:noPastDate' },
    );

    // Input/run gate: job writes need a REAL job id.
    this.addGuard(
      'preTool',
      ['rescheduleJob', 'cancelJob', 'assignTechnician'],
      custom({
        kind: 'jobMustExist',
        dim: 'run',
        check: (ctx) => {
          const w = ctx.world as unknown as SchedulingWorld;
          const id = String(ctx.args.jobId ?? '');
          return w.hasJob(id) ? null : `Unknown jobId "${id}" — read listJobs and use the REAL job_ id.`;
        },
        prose: () => 'rescheduling, reassigning or cancelling needs a REAL existing job id — when unknown, read listJobs first',
      }),
      { id: 'agent:jobMustExist' },
    );

    // Behavior gates — the shared kinds carry the confirm-probe + honest-failure exemptions.
    this.addReplyCheck(pendingConfirmMustAsk(), { id: 'agent:pendingConfirmMustAsk' });
    this.addReplyCheck(
      destructiveClaimRequiresSuccess(
        ['cancelJob'],
        /\b(cancell?ed|called off|deleted|removed)\b/i,
        /\b(already|cannot|can'?t|could not|couldn'?t|won'?t|unable|not)\b/i,
      ),
      { id: 'agent:destructiveClaimRequiresSuccess' },
    );
    this.addReplyCheck(noFalseFailureClaim(), { id: 'agent:noFalseFailureClaim' });

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
