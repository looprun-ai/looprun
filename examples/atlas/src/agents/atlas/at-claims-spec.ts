/**
 * atlas — `at-claims` AgentSpec (Claims & Compliance bucket).
 *
 * BUCKET: damage/incident claims, legal & compliance holds, customer records, policy lookup
 * (12 tools; 2 destructive: resolveClaim, releaseHold).
 *
 * LAYER RATIONALE — one AgentSpecBase (P9). The constructor auto-installs the universal invariants
 * (noDuplicateCall + degenerationGuard + emptyReply) and, because `cfg.lexicon.falseFailureClaimRe`
 * is provided, the always-on reply-honesty invariant (noFalseFailureClaim); because `destructiveTools`
 * is non-empty it also installs the destructive-safety protocol (confirmFirst + destructiveThrottle)
 * on exactly resolveClaim/releaseHold. Everything below is AGENT-layer, authored explicitly, each a
 * prose+check pair keyed only on args / world projection / observed calls (never the user text — the
 * S-1 firewall). All language patterns are inlined here to keep the file self-contained (P8a: the
 * runtime carries no linguistic regex; a real bundle would share one atlas EN lexicon module).
 *
 * // UNCHECKABLE (eval dimension only — no observable discriminator on the guard surface):
 * //  - CLAIM-REF PROVENANCE beyond id SHAPE: that a filed claim references an id genuinely surfaced
 * //    from a read/create this conversation (not a well-shaped guess). The observed ledger carries
 * //    no tool RESULTS, so existence/provenance past the bk_/ast_ shape check cannot be decided
 * //    here — conditioned prose only. (N round 1 / N4-T1: getBooking + getAsset read tools were
 * //    ADDED to the surface so the model can verify instead of accept/fabricate; still no gate —
 * //    forcing a read would deny the user-supplied-real-id sibling, the N3-M1 lesson.)
 * //  - PII MINIMIZATION: surface only what the user needs from a customer record, keep contact
 * //    masked as returned, and NEVER disclose one customer's record while acting for another —
 * //    request-dependent wording; no check may read the user's context.
 * //  - POLICY GROUNDING / PROFESSIONAL BOUNDARY: every policy statement grounded in a lookupPolicy
 * //    result, never a rule/number invented, never advice beyond the returned text (not a lawyer) —
 * //    reply-content judgement, language-layer.
 * //  - HOLD↔CLAIM LINK PRECISION: that the hold being released is the one linked to the still-open
 * //    claim. The projection exposes openClaimCount but no hold→claim edge, so the releaseHold
 * //    precondition below approximates it coarsely (any open claim blocks a release); the exact
 * //    linkage is eval-only.
 */
import { AgentSpecBase } from 'looprun';
import {
  argFormat,
  custom,
  destructiveClaimRequiresSuccess,
  jargonScrub,
  pendingConfirmMustAsk,
  precondition,
} from 'looprun';

// ── Business-owned EN lexicon (inlined for self-containment; P8a) ──────────────────────────────────
/** A false "I couldn't do X" claim about an at-claims action that actually ran. Feeds the always-on
 *  minimal:noFalseFailureClaim via cfg.lexicon. */
// T iteration 2 (measured, rung-2 cases 03/07/23/44): the previous broad can't/cannot/unable
// matcher classified honest POLICY REFUSALS and probe-consequence phrasing ("cannot be undone")
// as false failure claims — noFalseFailureClaim fires when all this-turn calls SUCCEEDED, which
// is exactly the successful-reads + honest-refusal shape — redriving the reply into the
// exhaustion fallback (cross-domain lessons #2/#8). Narrowed to attempted-work FAILURE phrasing.
const FALSE_FAILURE_CLAIM_RE =
  /\b(failed to|could not (?:complete|process|create|generate|save|find a way)|error(?:ed)? (?:out|occurred)|ran into (?:an )?error|something went wrong|tried (?:to|but) [^.!?\n]{0,32}(?:failed|didn'?t work))\b/i;
/** Reply "seeks confirmation" — a question OR EN confirm-language (relaying a pending two-step probe). */
const CONFIRM_ASK_RE =
  /\?|\b(confirm|are you sure|do you want|would you like|shall i|please confirm|go ahead|proceed)\b/i;
/** A reply CLAIMS a hold was lifted/released (the destructive verb for releaseHold). */
const HOLD_RELEASED_CLAIM_RE =
  /\b(released|lifted|un-?frozen|unfroze|removed the hold|hold (?:is )?(?:now )?(?:lifted|released|removed))\b/i;
/** An OFFER/conditional wrapping the action ("I can lift it", "would you like…") — offers, not reports. */
const OFFER_OR_CONDITIONAL_RE =
  /\b(would you like|do you want|if you(?:'d| would)? like|i can|i could|shall i|let me know|just say|want me to)\b/i;
/** Honest inability/blocked phrasing to exempt BEFORE the affirmative claim regex. */
const RELEASE_EXEMPT_RE =
  /\b(cannot|can'?t|could\s?n['o]?t|unable|won'?t|blocked|not able|need(?:s)? to|must first|still (?:open|under)|before (?:releasing|i can))\b/i;

export class AgentSpecAtlasClaims extends AgentSpecBase {
  constructor() {
    super({
      id: 'at-claims',
      mode: 'ATLAS_CLAIMS',
      persona:
        'You are the claims & compliance agent: you handle damage and incident claims, legal and compliance holds, customer records, and policy lookups for the workspace.',
      tools: [
        'listClaims', 'getClaim', 'fileClaim', 'addClaimEvidence', 'resolveClaim',
        'listHolds', 'placeHold', 'releaseHold',
        'listCustomers', 'getCustomer', 'createCustomer', 'lookupPolicy',
        // Shared READ-ONLY tools (E1 allows read repeats): added in N round 1 (N4-T1, the listBrands
        // lesson) — a claim references a bk_/ast_ id; without these reads the agent could only accept
        // or fabricate a well-shaped id it cannot verify.
        'getBooking', 'getAsset',
      ],
      // resolveClaim + releaseHold carry the two-step confirmed flag → auto confirmFirst (arg mechanism)
      // + destructiveThrottle. placeHold is deliberately NOT here: it is protective/additive (see prose).
      destructiveTools: ['resolveClaim', 'releaseHold'],
      // Enables the always-on minimal:noFalseFailureClaim honesty invariant.
      lexicon: { falseFailureClaimRe: FALSE_FAILURE_CLAIM_RE },
      behavior: [
        // NO persona line here — persona is the config field above. Every line is CONDITIONED (Bucket-A).
        'To file a claim, reference a REAL booking (bk_) or asset (ast_) id — pass at least one and never invent an id; when you are unsure the id is real, verify it with getBooking / getAsset first. Filing automatically freezes the asset under an investigatory hold, so never promise the deposit back while the claim is open.',
        'Add evidence only while a claim is still open (submitted or under review); once a claim is resolved, say so honestly instead of attaching.',
        'Resolving a claim moves money (approve/settle) and is two-step: call resolveClaim with confirmed=false first to get the settlement prompt, relay it to the user, and STOP; confirm only after the user agrees in a LATER turn. Resolve only a claim that is open, and remember resolving lifts its investigatory hold.',
        'placeHold is protective and additive — when a hold is needed, place it directly; it needs no confirmation.',
        'releaseHold is destructive and high-risk: verify the reason (lookupPolicy "hold_release") first, and use the two-step confirm (confirmed=false first, then confirmed=true only after the user agrees). Never lift a hold while a claim is still open — resolve the claim instead, which clears its investigatory hold automatically.',
        'Customer records are PII-sensitive: surface only what the user needs, report contact exactly as masked, never reveal one customer\'s record while acting for another, and never fabricate customer details.',
        'Answer policy questions ONLY from lookupPolicy results — you are not a lawyer. Never invent a rule or a number, and never advise beyond the returned policy text.',
        'When a tool returns a confirmation prompt, relay that exact question to the user and STOP — act only after they confirm in a later turn.',
        'If an action fails, report the REAL error briefly; never claim a success that did not happen, and never claim you could not do something your tools actually did.',
        'When a message is garbled or ambiguous, recover with ONE concrete clarifying question.',
        "Keep replies short and in the user's language.",
      ],
    });

    // ── fileClaim id provenance — the claim must reference a real booking/asset (input dim) ──────────
    // Cross-field presence (at least one of bookingId/assetId): no catalog kind expresses "one-of", so a
    // custom input guard mirrors the world's INVALID_ARGS rule. reviewers read code.
    this.addGuard('preTool', ['fileClaim'], custom({
      kind: 'claimRefRequired',
      dim: 'input',
      check(ctx) {
        const has = (v: unknown) => typeof v === 'string' && v.trim() !== '';
        return has(ctx.args.bookingId) || has(ctx.args.assetId)
          ? null
          : 'A claim must reference a REAL booking (bk_) or asset (ast_) — pass at least one of bookingId/assetId that you surfaced this conversation. Do NOT invent an id.';
      },
      prose: () => 'file a claim only against a real booking (bk_) or asset (ast_) id you have on hand — pass at least one, never invent one',
    }), { id: 'agent:claimRefRequired' });
    // A PRESENT id must be a REAL-shaped id (never a fabricated free-text reference).
    this.addGuard('preTool', ['fileClaim'], argFormat(
      'bookingId', '^bk_[a-z0-9]+$', 'i',
      'bookingId must be a real bk_ id you have on hand — never invent one.',
    ), { id: 'agent:fileClaimBookingFormat' });
    this.addGuard('preTool', ['fileClaim'], argFormat(
      'assetId', '^ast_[a-z0-9]+$', 'i',
      'assetId must be a real ast_ id you have on hand — never invent one.',
    ), { id: 'agent:fileClaimAssetFormat' });

    // ── addClaimEvidence — evidence attaches only to an existing OPEN claim (run dim) ────────────────
    this.addGuard('preTool', ['addClaimEvidence'], precondition(
      (w) => (w.projection().openClaimCount as number) > 0,
      'No claim is open to attach evidence to — evidence attaches only to a claim that is still submitted or under review.',
      'evidence attaches only to a claim still open (submitted/under review) — when none is open, say there is nothing to attach to',
    ), { id: 'agent:evidenceNeedsOpenClaim' });

    // ── resolveClaim — resolve only from a reviewable/open state (run dim); two-step is auto ─────────
    this.addGuard('preTool', ['resolveClaim'], precondition(
      (w) => (w.projection().openClaimCount as number) > 0,
      'No claim is open to resolve — only a submitted/under-review claim can be resolved.',
      'resolve only a claim that is open (submitted/under review) — when none is open, say so instead',
    ), { id: 'agent:resolveNeedsOpenClaim' });

    // ── releaseHold — never lift a hold while a claim is still open (run dim); two-step is auto ──────
    // Coarse by projection (openClaimCount has no hold→claim edge): any open claim blocks a release, so
    // the investigatory hold clears via resolveClaim rather than a manual lift. See UNCHECKABLE header.
    this.addGuard('preTool', ['releaseHold'], precondition(
      (w) => (w.projection().openClaimCount as number) === 0,
      'A claim is still open — do not lift a hold now; resolve the claim first (resolving clears its investigatory hold automatically).',
      'never lift a hold while a claim is still open — resolve the claim instead, which clears its investigatory hold',
    ), { id: 'agent:noReleaseWhileClaimOpen' });

    // ── Reply honesty (behavior dim) ────────────────────────────────────────────────────────────────
    // A pending two-step probe (resolveClaim/releaseHold with requiresConfirmation) must be relayed.
    this.addReplyCheck(pendingConfirmMustAsk({ askRe: CONFIRM_ASK_RE }), { id: 'agent:pendingConfirmMustAsk' });
    // Don't claim a hold was released/lifted unless releaseHold actually succeeded this turn.
    // (Scoped to releaseHold only: a legal resolveClaim "deny" succeeds WITHOUT confirmed:true, which
    // would read as a false "nothing succeeded" — releaseHold has no non-confirmed success path.)
    this.addReplyCheck(destructiveClaimRequiresSuccess(['releaseHold'], {
      claimRe: HOLD_RELEASED_CLAIM_RE,
      askRe: CONFIRM_ASK_RE,
      offerRe: OFFER_OR_CONDITIONAL_RE,
      exemptRe: RELEASE_EXEMPT_RE,
    }), { id: 'agent:noPhantomHoldRelease' });

    // ── Egress jargon scrub (mutator) ───────────────────────────────────────────────────────────────
    this.addMutator(jargonScrub({ under_review: 'under review' }), { id: 'agent:jargonScrub' });
  }
}

export default new AgentSpecAtlasClaims();
