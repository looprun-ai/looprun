/**
 * atlas / at-billing — the billing & payments agent (quotes, invoices, deposits, payments/refunds).
 *
 * Bucket-A layering: every behavior line is CONDITIONED ("when X, do Y"); the persona is the config
 * field (rendered as the first Behavior bullet); the destructive money-movers get the auto
 * confirmFirst + destructiveThrottle protocol from `destructiveTools` (never hand-added). The
 * agent-layer guards below encode the decidable frontier of this agent's domain rules; the numeric
 * FIDELITY of quotes/invoices/refund-caps is language-layer (see the UNCHECKABLE header) — the world
 * computes the money and enforces the caps, so a guard can only key on the observable surface.
 *
 * // UNCHECKABLE (eval-dimension only — no observable predicate over args/tool/world/observed/result):
 * //  - Quote/invoice numeric FIDELITY: the reply must state the EXACT total the tool returned
 * //    (dailyRate×billableDays + fees, lateFee math). A check cannot regex an arbitrary correct
 * //    number; enforced by prose + generateQuote/getInvoice grounding + the eval.
 * //  - "generate the invoice before paying/voiding it" as ORDERING: a requiresBefore(generateInvoice)
 * //    gate would false-fire on presets that SEED an issued invoice (pending-confirmation), so the
 * //    lifecycle stays prose; the world owns the transitions (can't pay a void invoice, can't void a
 * //    paid one) and the reply-honesty guards cover the claims.
 * //  - Refund CAP as a number: issueRefund is capped at amountPaid (world-enforced, REFUND_OVER_CAP).
 * //    argRequired('amount') guards presence; the numeric cap itself is world-owned + prose.
 * //  - Deposit-shortfall / "is this deposit covered?" honesty: read from getDepositBalance — a
 * //    language-layer report, not a decidable veto.
 * //  - releaseDeposit blocked by an ASSET-scope hold on the booking's asset: projection() has no
 * //    booking→asset map, so only the accountFrozen + open-claim halves are decidable here; the
 * //    asset-hold half is world-enforced and the reply must relay it. (N4-B3, N round 1.)
 */
import { AgentSpecBase } from 'looprun';
import {
  argRequired,
  custom,
  destructiveClaimRequiresSuccess,
  jargonScrub,
  maxCalls,
  noFabricatedSuccess,
  pendingConfirmMustAsk,
  precondition,
} from 'looprun';

// ── Business-owned lexicon (P8a: the runtime carries NO linguistic regex; a spec passes its own).
// Inlined to keep this drafter self-contained; a shipping domain hoists these into one lexicon module.
// None use the /g or /y flag (stateful lastIndex would alternate verdicts — banned by the purity lint).
// T iteration 2 (measured, rung-2 cases 03/07/23/44): the previous broad can't/cannot/unable
// matcher classified honest POLICY REFUSALS and probe-consequence phrasing ("cannot be undone")
// as false failure claims — noFalseFailureClaim fires when all this-turn calls SUCCEEDED, which
// is exactly the successful-reads + honest-refusal shape — redriving the reply into the
// exhaustion fallback (cross-domain lessons #2/#8). Narrowed to attempted-work FAILURE phrasing.
const FALSE_FAILURE_CLAIM_RE =
  /\b(failed to|could not (?:complete|process|create|generate|save|find a way)|error(?:ed)? (?:out|occurred)|ran into (?:an )?error|something went wrong|tried (?:to|but) [^.!?\n]{0,32}(?:failed|didn'?t work))\b/i;
const DESTRUCTIVE_CLAIM_RE = /\b(charged|released|paid|refunded|voided|payment (?:recorded|made|processed))\b/i;
const CONFIRM_ASK_RE =
  /\b(confirm|are you sure|please confirm|shall i|should i|do you want|would you like|proceed|go ahead|okay to)\b|\?/i;
const OFFER_OR_CONDITIONAL_RE =
  /\b(would|could|shall|can i|i can|if you|once you|after you|to proceed|do you want|let me know|ready to)\b/i;
const HONEST_FAILURE_RE =
  /\b(can(?:no|')?t|could\s?n['o]?t|not|unable|failed|block|denied|permission|hold|frozen|already|over the cap|capped|no deposit|void)\b/i;
const SELF_NARRATION_RE = /\bthe (?:billing )?(?:agent|assistant|system)\b/i;

// Provenance predicate for quote ids: a qt_ id "exists" only if some tool RESULT returned it this
// conversation (generateQuote / getQuote). Pure — reads the AgentWorld's observable call log only.
const idInToolResults = (world: { toolCalls: Array<{ result?: unknown }> }, label: string): boolean =>
  world.toolCalls.some((c) => JSON.stringify(c.result ?? '').includes(label));

const MONEY_MOVERS = ['chargeDeposit', 'releaseDeposit', 'payInvoice', 'issueRefund'];
const DESTRUCTIVE = ['chargeDeposit', 'releaseDeposit', 'payInvoice', 'issueRefund', 'voidInvoice'];

export class AgentSpecAtBilling extends AgentSpecBase {
  constructor() {
    super({
      id: 'at-billing',
      mode: 'ATLAS_BILLING',
      persona:
        'You are the billing agent for Atlas Equipment Rentals: quotes, invoices, security deposits, payments, and refunds.',
      tools: [
        'generateQuote', 'getQuote', 'generateInvoice', 'listInvoices', 'getInvoice',
        'getDepositBalance', 'chargeDeposit', 'releaseDeposit', 'payInvoice', 'issueRefund', 'voidInvoice',
        // Shared READ-ONLY tool (E1 allows read repeats): added in T iteration 1 — case 21 names an
        // asset ("the CAT 320") without an id; generateQuote needs ast_, and without a lookup the
        // model flails through invoice reads (measured: listInvoices×6, no quote). The T1/listBrands
        // class: absence makes the model fabricate or stall.
        'listAssets',
      ],
      // The 5 money/lifecycle mutators → auto confirmFirst (two-step confirmed flag) + destructiveThrottle
      // (one destructive per turn). Never hand-add those; the constructor owns them.
      destructiveTools: DESTRUCTIVE,
      // Always-on reply-honesty invariant (auto-installs noFalseFailureClaim) + weak-model degeneration
      // self-narration branch, both from business-owned patterns.
      lexicon: { falseFailureClaimRe: FALSE_FAILURE_CLAIM_RE, selfNarrationRe: SELF_NARRATION_RE },
      behavior: [
        'State every quote and invoice number exactly as generateQuote, getQuote, or getInvoice returned it — never estimate, round, or invent a total, a fee, or a qt_/inv_ id.',
        'A NEW price for a prospective rental comes from generateQuote (it computes the breakdown); getQuote only READS a quote that already exists — never hunt through invoices for a price that was never quoted.',
        'When the user names an asset without its ast_ id, resolve it via listAssets first, then quote it — never guess an id and never quote from memory.',
        'Read deposit balances from getDepositBalance before you say a deposit is covered, short, or refundable — never invent a held or required amount.',
        'For any money move (chargeDeposit, releaseDeposit, payInvoice, issueRefund, voidInvoice): first call with confirmed=false to get the amount and the confirmation prompt, relay that to the user, and STOP; only after the user explicitly agrees, call again with confirmed=true — and make at most one money move per turn.',
        'When the acting user lacks billing permission (canMoveMoney is false), refuse the money move and say a billing or owner role is required — never pretend it went through.',
        'Do not release a deposit while an open damage claim, or a legal/compliance hold on the booking, asset, or account, still stands — say it is blocked and never promise the deposit back until the claim is resolved or the hold is lifted.',
        'A refund is capped at what was actually paid (amountPaid) — read getInvoice first and never refund more than that.',
        'Only pay or void an invoice that exists; a paid invoice cannot be voided (issue a refund instead) and a voided invoice cannot be paid — report the limit honestly instead of claiming success.',
        'If a money move is blocked or denied (permission, hold, quota, over-cap, already paid, or already void), report the REAL result plainly — never claim a charge, payment, release, refund, or void happened when it did not.',
        'When a request is ambiguous or an id is missing, ask ONE concrete question (which booking or which invoice) before acting.',
        "Keep replies short and in the user's language.",
      ],
    });

    // ── RUN: permission gate. The world blocks all five money/lifecycle mutators on canMoveMoney;
    // mirror it so the model refuses cleanly instead of attempting and reading back a PERMISSION_DENIED.
    this.addGuard('preTool', DESTRUCTIVE, precondition(
      (w) => (w.projection() as { canMoveMoney?: boolean }).canMoveMoney === true,
      'You lack billing permission (owner/billing) to move money — tell the user this needs a billing or owner role; do NOT retry.',
      'moving money (charge/release/pay/refund/void) needs billing permission — when the acting user lacks it, refuse and explain',
    ), { id: 'agent:canMoveMoney' });

    // ── RUN: a compliance/legal freeze on the account blocks returning money outward.
    this.addGuard('preTool', ['releaseDeposit', 'issueRefund'], precondition(
      (w) => (w.projection() as { accountFrozen?: boolean }).accountFrozen !== true,
      'A compliance/legal hold freezes the account — money cannot be returned until it is lifted.',
      'returning money (release deposit / refund) is blocked while a compliance or legal hold freezes the account — when frozen, say so and move no money',
    ), { id: 'agent:accountFrozen' });

    // ── RUN: releasing a deposit is blocked while the specific booking has an open claim. precondition
    // sees only the world, not args — so this reads BOTH (ctx.args.bookingId + world.bookingHasOpenClaim)
    // as a custom run-dim gate (the honest mechanism; a bare precondition can't key on the bookingId).
    this.addGuard('preTool', ['releaseDeposit'], custom({
      kind: 'releaseBlockedByOpenClaim',
      dim: 'run',
      check: (ctx) => {
        const bookingId = typeof ctx.args.bookingId === 'string' ? ctx.args.bookingId : '';
        if (!bookingId) return null; // no id to key on — let the world report BOOKING_NOT_FOUND
        const hasOpenClaim = ctx.world.bookingHasOpenClaim as (id: string) => boolean;
        return hasOpenClaim(bookingId)
          ? 'An open damage claim stands on this booking — resolve the claim before releasing the deposit; do NOT release it now.'
          : null;
      },
      prose: () => 'releasing a deposit is blocked while an open claim stands on the booking — when one is open, resolve it first',
    }), { id: 'agent:releaseBlockedByOpenClaim' });

    // ── INPUT: a refund needs an explicit amount (schema-required; there is no auto-schema layer). The
    // numeric cap (amountPaid) is world-enforced — this only ensures the amount is present.
    this.addGuard('preTool', ['issueRefund'], argRequired('amount'), { id: 'agent:refundAmountRequired' });

    // ── RUN: one money movement per turn, per mover (scope 'turn', cap 1 — the catalog "at most n OK
    // calls this turn" math for a single money move). Reinforces the auto destructiveThrottle with a
    // money-specific correction; a probe (confirmed:false) is the turn's one OK call, the confirmed
    // execute lands in a LATER turn (confirmFirst), so no legitimate flow double-moves in a turn.
    for (const tool of MONEY_MOVERS) {
      this.addGuard('preTool', [tool], maxCalls(
        tool, 1,
        'Only one money movement per turn — a money move already ran this turn; reply to the user before moving money again.',
        { scope: 'turn' },
      ), { id: `agent:oneMoneyMovePerTurn:${tool}` });
    }

    // ── BEHAVIOR: quote id provenance — the reply may only cite a qt_ id that a tool actually returned
    // (generateQuote/getQuote); an invented qt_ is fabrication. Attempt-independent invented-LABEL branch.
    this.addReplyCheck(noFabricatedSuccess('generateQuote', {
      reason: 'Only cite a quote (qt_) id that generateQuote or getQuote actually returned — never invent a quote id or a total.',
      labelRe: /qt_[a-z0-9]+/i,
      refExists: (world, label) => idInToolResults(world as { toolCalls: Array<{ result?: unknown }> }, label),
    }), { id: 'agent:noFabricatedQuote' });

    // ── BEHAVIOR: never claim a destructive money action happened unless a confirmed call SUCCEEDED this
    // turn — attempt-keyed, exempting confirm-probes (askRe), offers/conditionals (offerRe), and honest
    // failure/negation reports (exemptRe). All patterns business-owned.
    this.addReplyCheck(destructiveClaimRequiresSuccess(DESTRUCTIVE, {
      claimRe: DESTRUCTIVE_CLAIM_RE,
      askRe: CONFIRM_ASK_RE,
      offerRe: OFFER_OR_CONDITIONAL_RE,
      exemptRe: HONEST_FAILURE_RE,
    }), { id: 'agent:destructiveClaimRequiresSuccess' });

    // ── BEHAVIOR: when a money tool returned requiresConfirmation, the reply MUST relay the question
    // (unless it was resolved to a confirmed success this same turn).
    this.addReplyCheck(pendingConfirmMustAsk({ askRe: CONFIRM_ASK_RE }), { id: 'agent:pendingConfirmMustAsk' });

    // ── Egress: scrub internal field jargon to user words before the reply leaves.
    this.addMutator(jargonScrub({
      balanceDue: 'balance due',
      amountPaid: 'amount paid',
      depositHeld: 'deposit held',
      requiredDeposit: 'required deposit',
      securityDeposit: 'security deposit',
      requiresConfirmation: 'confirmation needed',
    }), { id: 'agent:jargonScrub' });
  }
}

export default new AgentSpecAtBilling();
