/**
 * E2 draft — `intake-quoting`: service catalog, customer records, service requests, quotes and
 * customer notifications for BrightNest Home Services.
 *
 * Bucket (by TOOL-NEED, never intent): the request→quote lifecycle end-to-end — catalog reads,
 * find/create customer, open request, create+send quote, record the customer's decision, notify.
 * 11 tools ≤ 15. NO confirmed-flag destructive tool in this surface (cancelJob lives with the
 * scheduling agent, the lifecycle owner of jobs) — so AgentSpecBase installs only the universal
 * invariants (noDuplicateCall + degeneration + emptyReply) plus minimal:noFalseFailureClaim from
 * the injected lexicon; no destructive layer.
 *
 * name→id (E1 rule): every id this agent's writes CONSUME has a resolving read in the same surface —
 * customerId ← findCustomer, requestId/quoteId ← listServiceRequests / getServiceRequest.
 *
 * // UNCHECKABLE (conditioned prose + eval dimension only — no observable state key):
 * //   · never give DIY repair/hazard instructions (office assistant, not a licensed technician).
 * //   · scheduling/rescheduling/cancelling belongs to the scheduling agent — hand over, do not improvise.
 */
import { AgentSpecBase, custom, jargonScrub, maxCalls, noFabricatedSuccess } from 'looprun';
import type { AgentWorld } from 'looprun';
import { HOMESERVICES_THEME } from './theme.js';
import { FALSE_FAILURE_CLAIM_RE } from './lexicon.js';

// Domain world seam — the accessors THIS agent's RUN gates read (typed, no cast at the call site).
interface IntakeWorld extends AgentWorld {
  hasCustomer(id: string): boolean;
  hasRequest(id: string): boolean;
  hasQuote(id: string): boolean;
}

export class AgentSpecIntakeQuoting extends AgentSpecBase {
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
      // Injected lexicon → AgentSpecBase auto-installs minimal:noFalseFailureClaim (no manual add).
      lexicon: { falseFailureClaimRe: FALSE_FAILURE_CLAIM_RE },
      theme: HOMESERVICES_THEME,
      behavior: [
        // Load-bearing lines FIRST (iron-rule style: blunt, name the anti-pattern, deduped vs theme).
        // Every line CONDITIONED (Bucket-A): "when X, do Y" — never a bare state assertion.
        'Open requests, create quotes, send quotes and record decisions DIRECTLY with the tools — these are non-destructive. Asking "shall I go ahead?" for a clearly requested non-destructive action is a failure: do it, then confirm the outcome with the real ids the tools returned (req_…, qt_…).',
        'Before any write, resolve the name to its REAL id from a read: findCustomer for a customer, listServiceRequests or getServiceRequest for a request or its quote. A write with a guessed id is a failure.',
        'When a message names a customer, findCustomer FIRST; call createCustomer only when no match exists — creating a duplicate customer is a failure.',
        'Quote lifecycle: draft → sent → accepted | declined. createQuote makes a DRAFT (invisible to the customer); sendQuote then puts it in front of them; only a SENT quote takes a decision via recordQuoteDecision — a draft cannot, and a decided quote cannot be re-decided. One active quote per request: a new quote is legal only after the previous was declined. When sendQuote or recordQuoteDecision fails on this state, report the state — never claim a fresh send or decision.',
        'Answer service and price questions ONLY from listServices; when something is not in the catalog, say so plainly — never invent a service, price or discount.',
        'Booking, moving and cancelling visits belong to the scheduling agent — you have NO booking or cancellation tools. Hand over the ids and status you know; never ask a cancellation-confirmation question yourself, and never say you will cancel or "proceed with" a cancellation.',
        'When a message is too garbled or incomplete to act on, recover with exactly ONE concrete clarifying question.',
        "Keep replies short, professional and warm, in the user's language.",
      ],
    });

    // ── RUN gates: existence-keyed on world state (never on user text), each paired with its prose. ──
    this.addGuard(
      'preTool',
      ['createServiceRequest'],
      custom({
        kind: 'customerMustExist',
        dim: 'run',
        check: (ctx) => {
          const id = String(ctx.args.customerId ?? '');
          return (ctx.world as IntakeWorld).hasCustomer(id)
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
          const id = String(ctx.args.requestId ?? '');
          return (ctx.world as IntakeWorld).hasRequest(id)
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
          const id = String(ctx.args.quoteId ?? '');
          return (ctx.world as IntakeWorld).hasQuote(id)
            ? null
            : `Unknown quoteId "${id}" — read getServiceRequest for the request's real qt_ id.`;
        },
        prose: () => 'sending or deciding a quote needs its REAL existing qt_ id — when unknown, read the request first',
      }),
      { id: 'agent:quoteMustExist' },
    );

    // Bulk cap: don't spam the customer with notifications in one turn.
    this.addGuard(
      'preTool',
      ['sendNotification'],
      maxCalls('sendNotification', 2, 'At most two notifications per turn — batch updates into one clear message instead of spamming the customer.', { scope: 'turn' }),
      { id: 'agent:notificationCap' },
    );

    // Reply-honesty. noFalseFailureClaim auto-installs from the injected lexicon (above). This agent
    // has NO cancellation/booking tool, so ANY commitment-to-cancel phrasing is out of scope by
    // construction — the unconditional banRe of noFabricatedSuccess (fires regardless of attempts)
    // is the successor to the former standalone replyNoProductionClaim kind. Commitment/completion
    // forms ONLY ("the scheduling agent handles cancellations" must not match).
    this.addReplyCheck(
      noFabricatedSuccess('cancelJob', {
        banRe:
          /\b(I (?:will|can|'ll) (?:now )?(?:proceed with|process|handle) (?:the |this |that )?cancell?ation|cancell?ation (?:is )?(?:confirmed|completed|done|processed)|(?:job|visit|booking) (?:has been|was|is now) cancell?ed)\b/i,
        reason:
          'You cannot cancel or promise to cancel anything — cancellations belong to the scheduling agent. Route the user there with the ids you know.',
      }),
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
