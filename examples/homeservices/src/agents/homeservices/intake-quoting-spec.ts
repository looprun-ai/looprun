/**
 * E2 draft — `intake-quoting`: service catalog, customer records, service requests, quotes and
 * customer notifications for BrightNest Home Services.
 *
 * Bucket (by TOOL-NEED, never intent): the request→quote lifecycle end-to-end — catalog reads,
 * find/create customer, open request, create+send quote, record the customer's decision, notify.
 * 11 tools ≤ 15. Layer: AgentSpecMinimal — NO confirmed-flag destructive tool in this surface
 * (cancelJob lives with the scheduling agent, the lifecycle owner of jobs).
 *
 * // UNCHECKABLE: never give DIY repair/hazard instructions (office assistant, not a licensed
 * //              technician) — no observable state key; conditioned prose + eval dimension only.
 * // UNCHECKABLE: scheduling/rescheduling/cancelling belongs to the scheduling agent — say so
 * //              rather than improvise; no state key — conditioned prose + eval dimension only.
 */
import { AgentSpecMinimal, custom, jargonScrub, maxCallsPerTurn, noFalseFailureClaim, replyNoProductionClaim } from 'looprun';
import { HOMESERVICES_THEME } from './theme.js';

type IntakeWorld = {
  hasCustomer(id: string): boolean;
  hasRequest(id: string): boolean;
  hasQuote(id: string): boolean;
};

export class AgentSpecIntakeQuoting extends AgentSpecMinimal {
  constructor() {
    super({
      id: 'intake-quoting',
      mode: 'HOME_INTAKE_QUOTING',
      // Per-agent role line (persona-on-spec law) — rendered as the FIRST Behavior bullet.
      persona:
        'You are the intake and quoting agent: service catalog questions, customer records, service requests, quotes and customer notifications.',
      tools: [
        'listServices',
        'findCustomer',
        'createCustomer',
        'createServiceRequest',
        'getServiceRequest',
        'listServiceRequests',
        'createQuote',
        'sendQuote',
        'recordQuoteDecision',
        'sendNotification',
        'listNotifications',
      ],
      theme: HOMESERVICES_THEME,
      behavior: [
        // Every line CONDITIONED (Bucket-A): "when X, do Y" — never a bare state assertion.
        'When asked about services or prices, read listServices and answer only from its results — when something is not in the catalog, say so plainly.',
        'When a request names a customer, look them up with findCustomer first; create a record with createCustomer only when no match exists — never duplicate a customer.',
        'When the user asks to open a request, create a quote, or send it, act directly with the tools — these steps are not destructive and need no permission-asking; afterwards confirm the outcome with the real ids (req_…, qt_…).',
        'To get a quote in front of the customer: createQuote first (a draft), then sendQuote — when a send fails because the quote was already sent or decided, report that state instead of claiming a new send.',
        'When the customer communicates a decision on a sent quote (phone, email), record it with recordQuoteDecision before anything else.',
        'When the user asks to schedule, move or cancel a visit, say the scheduling agent handles that and hand over what you know (ids, status) — you have NO booking or cancellation tools: never ask a cancellation-confirmation question yourself and never say you will proceed with one.',
        'When a tool returns success:false, relay the real reason in one short sentence — never claim the action happened.',
        'When a message is too garbled or incomplete to act on, recover with ONE concrete clarifying question.',
        "Keep replies short, professional and warm, in the user's language.",
      ],
    });

    // Input/run gates — EXISTENCE-keyed on world state (never on user text).
    this.addGuard(
      'preTool',
      ['createServiceRequest'],
      custom({
        kind: 'customerMustExist',
        dim: 'run',
        check: (ctx) => {
          const w = ctx.world as unknown as IntakeWorld;
          const id = String(ctx.args.customerId ?? '');
          return w.hasCustomer(id)
            ? null
            : `Unknown customerId "${id}" — find the customer with findCustomer, or create one with createCustomer, and use the REAL cust_ id it returns.`;
        },
        prose: () => 'a service request needs a REAL existing customer id — when the customer is unknown, find or create them first',
      }),
      { id: 'agent:customerMustExist' },
    );

    this.addGuard(
      'preTool',
      ['createQuote'],
      custom({
        kind: 'requestMustExist',
        dim: 'run',
        check: (ctx) => {
          const w = ctx.world as unknown as IntakeWorld;
          const id = String(ctx.args.requestId ?? '');
          return w.hasRequest(id)
            ? null
            : `Unknown requestId "${id}" — read getServiceRequest or listServiceRequests and use the REAL req_ id.`;
        },
        prose: () => 'a quote is created for an EXISTING request id — when the id is unknown, read the requests first',
      }),
      { id: 'agent:requestMustExist' },
    );

    this.addGuard(
      'preTool',
      ['sendQuote', 'recordQuoteDecision'],
      custom({
        kind: 'quoteMustExist',
        dim: 'run',
        check: (ctx) => {
          const w = ctx.world as unknown as IntakeWorld;
          const id = String(ctx.args.quoteId ?? '');
          return w.hasQuote(id)
            ? null
            : `Unknown quoteId "${id}" — read getServiceRequest for the request's real qt_ id.`;
        },
        prose: () => 'sending or deciding a quote needs its REAL existing qt_ id — when unknown, read the request first',
      }),
      { id: 'agent:quoteMustExist' },
    );

    this.addGuard(
      'preTool',
      ['sendNotification'],
      maxCallsPerTurn('sendNotification', 2, 'At most two notifications per turn — batch updates into one clear message instead of spamming the customer.'),
      { id: 'agent:notificationCap' },
    );

    // Behavior gates.
    this.addReplyCheck(noFalseFailureClaim(), { id: 'agent:noFalseFailureClaim' });
    // Measured iteration 2 (case 11): this agent has NO cancellation/booking tool, so ANY
    // commitment-to-cancel phrasing is out of scope by construction (commitment/completion forms
    // only — "the scheduling agent handles cancellations" does not match).
    this.addReplyCheck(
      replyNoProductionClaim(
        /\b(I (?:will|can|'ll) (?:now )?(?:proceed with|process|handle) (?:the |this |that )?cancell?ation|cancell?ation (?:is )?(?:confirmed|completed|done|processed)|(?:job|visit|booking) (?:has been|was|is now) cancell?ed)\b/i,
        'You cannot cancel or promise to cancel anything — cancellations belong to the scheduling agent. Route the user there with the ids you know.',
      ),
      { id: 'agent:noCancelCommitment' },
    );

    // Egress scrub: internal field jargon → user words.
    this.addMutator(
      jargonScrub({
        customerId: 'customer ID',
        requestId: 'request ID',
        quoteId: 'quote ID',
        serviceId: 'service ID',
      }),
      { id: 'agent:jargonScrub' },
    );
  }
}

export default new AgentSpecIntakeQuoting();
