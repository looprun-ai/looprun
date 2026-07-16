/**
 * at-inventory — the asset-registry / maintenance / retire-transfer agent for the "atlas" subject
 * (Atlas Equipment Rentals & Field Ops). Bucket: Inventory & Catalog (9 tools; 2 destructive).
 *
 * Layer rationale (single AgentSpecBase, P9): the constructor auto-installs the universal invariants
 * (noDuplicateCall + degeneration + emptyReply, + noFalseFailureClaim because this bundle injects
 * cfg.lexicon.falseFailureClaimRe) and, because destructiveTools is non-empty, confirmFirst
 * (arg-flag mechanism — both destructive tools carry a `confirmed` flag) + destructiveThrottle on
 * retireAsset/transferAsset. Everything below is the agent layer, derived ONLY from atlas
 * WORLD-MODEL.md + tools.json + projection() (never a gold spec).
 *
 * Guard-observable frontier encoded here (decidable → one gate each):
 *   - assetId call-shape ....... argFormat  (^ast_[a-z0-9]+$ — never invent an id)
 *   - target-workspace shape .... argFormat  (^ws_[a-z0-9]+$ on transferAsset)
 *   - fleet permission .......... precondition(run) on every fleet WRITE (projection.canManageFleet)
 *   - legal/compliance hold ..... custom(run) on retire/transfer (projection.frozenAssetIds)
 *   - destructive two-step ...... AUTO (confirmFirst + destructiveThrottle) — NOT hand-added
 *   - destructive claim honesty . destructiveClaimRequiresSuccess + pendingConfirmMustAsk (retire/transfer)
 *   - write-success honesty ..... noFabricatedSuccess on register/update/schedule/complete
 *
 * // UNCHECKABLE (no guard-observable discriminator on the allowed surface — behavior prose + eval only):
 * //  - Never invent or MISREPORT an asset's condition or maintenance history beyond what a read
 * //    returned. Language-layer honesty: no (args, world, observed) predicate separates a truthful
 * //    read-back from an invented fact without reading the user's request. Eval dimension only.
 * //  - retire/transfer is also blocked when the asset is OUT on rental or RESERVED by an active
 * //    booking. projection() exposes frozenAssetIds (checked) but NO per-asset booking key, so this
 * //    half is not decidable here — the world enforces it (ASSET_OUT / ASSET_RESERVED) and the reply
 * //    must relay the blocker honestly. Eval dimension only.
 * //  - Act DIRECTLY on the primary non-destructive action (register / update / schedule) — do not ask
 * //    permission for it. Behavior prose, not a guard.
 * //  - Id PROVENANCE past the ast_ shape (act only on ids a read surfaced OR the user supplied) —
 * //    dropped as a gate in N round 1 (N3-M1: stricter than world+eval; cases hand real ids in the
 * //    user turn). Conditioned prose + eval dimension, matching the claims/admin drafters.
 * //  - Maintenance lifecycle ORDERING (complete-after-schedule) — dropped as a gate in N round 1
 * //    (N2-1/N3-M2: seeded mid-maintenance windows falsify a conversation-scoped requiresBefore).
 * //    The world enforces NOT_IN_MAINTENANCE; conditioned prose carries the rule.
 * //  - scheduleMaintenance on an asset OUT on rental is rejected by the world (ASSET_OUT) — no
 * //    per-asset booking key in projection(); conditioned prose + honest relay. (N4-B2; eval gap
 * //    logged in EVALS.md.)
 */
import {
  AgentSpecBase,
  argFormat,
  custom,
  destructiveClaimRequiresSuccess,
  jargonScrub,
  noFabricatedSuccess,
  pendingConfirmMustAsk,
  precondition,
} from 'looprun';
import type { AgentWorld } from 'looprun';

// ── Business-owned lexicon (P8a — the runtime holds NO linguistic regex; a spec passes every
//    pattern in). Authored for atlas/English; kept inline to stay self-contained. ──────────────────
// T iteration 2 (measured, rung-2 cases 03/07/23/44): the previous broad can't/cannot/unable
// matcher classified honest POLICY REFUSALS and probe-consequence phrasing ("cannot be undone")
// as false failure claims — noFalseFailureClaim fires when all this-turn calls SUCCEEDED, which
// is exactly the successful-reads + honest-refusal shape — redriving the reply into the
// exhaustion fallback (cross-domain lessons #2/#8). Narrowed to attempted-work FAILURE phrasing.
const FALSE_FAILURE_CLAIM_RE =
  /\b(failed to|could not (?:complete|process|create|generate|save|find a way)|error(?:ed)? (?:out|occurred)|ran into (?:an )?error|something went wrong|tried (?:to|but) [^.!?\n]{0,32}(?:failed|didn'?t work))\b/i;
// A confirm-seeking reply (relaying a two-step prompt) — a bare "?" also counts as seeking confirmation.
const CONFIRM_ASK_RE =
  /\b(confirm|are you sure|please confirm|shall i|should i|do you want|proceed|go ahead|okay to|ok to)\b|\?/i;
// Offers / conditionals — a sentence pitching a next step, not asserting it happened.
const OFFER_OR_CONDITIONAL_RE =
  /\b(would you|do you want|if you|shall i|should i|want me to|i can|i could|let me know|once you)\b/i;
// Honest failure / negation phrasing — exempted BEFORE the affirmative destructive-claim regex.
const HONEST_FAILURE_RE =
  /\b(cannot|can(?:no|')?t|could\s?n['o]?t|unable|not\b|no longer|already|blocked|under (?:an? )?hold|on hold|reserved|out on rental|need(?:s)? permission|not permitted)\b/i;
// Affirmative "the destructive action happened" phrasing (retire / transfer).
const DESTRUCTIVE_CLAIM_RE =
  /\b(retired|transferred|has been (?:retired|transferred)|is now retired|removed from (?:the )?fleet|permanently removed|gone from (?:the |this )?(?:fleet|workspace))\b/i;
// Per-write "the action succeeded" phrasing for noFabricatedSuccess (attempt-keyed inside the kind).
const REGISTER_CLAIM_RE =
  /\b(registered|added to (?:the )?(?:fleet|registry|catalog)|created (?:the |a )?(?:new )?asset|new asset (?:id|is|has been))\b/i;
const UPDATE_CONDITION_CLAIM_RE =
  /\b(updated|set|marked|changed)\b[^.!?\n]{0,24}\bcondition\b|\bcondition (?:updated|set|changed|is now|marked)\b/i;
const SCHEDULE_CLAIM_RE =
  /\b(scheduled|booked|placed|put)\b[^.!?\n]{0,24}\bmaintenance\b|\bmaintenance (?:scheduled|booked|is set)\b/i;
const COMPLETE_CLAIM_RE =
  /\b(back in service|returned to service|maintenance (?:is )?(?:complete|completed|done)|completed (?:the )?maintenance)\b/i;

// ── Tool groupings (one addGuard call per rule; targets validated against the surface by the lint) ─
const ASSET_ID_TOOLS = [
  'getAsset', 'updateAssetCondition', 'scheduleMaintenance', 'completeMaintenance',
  'getMaintenanceLog', 'retireAsset', 'transferAsset',
]; // every tool that consumes an existing assetId → shape-gated
const FLEET_WRITE_TOOLS = [
  'registerAsset', 'updateAssetCondition', 'scheduleMaintenance', 'completeMaintenance',
  'retireAsset', 'transferAsset',
]; // every mutating fleet op → canManageFleet-gated
// (MUTATING_ASSET_TOOLS / assetIdSurfaced provenance machinery removed in N round 1 — see the
//  UNCHECKABLE header entry for the rationale.)

export class AgentSpecAtInventory extends AgentSpecBase {
  constructor() {
    super({
      id: 'at-inventory',
      mode: 'ATLAS_INVENTORY',
      // REQUIRED per-agent persona (283b4ed) — ONE role line; rendered as the first Behavior bullet.
      persona:
        'You are the inventory agent: the fleet asset registry, condition and maintenance, and retiring or transferring assets.',
      tools: [
        'listAssets', 'getAsset', 'registerAsset', 'updateAssetCondition', 'scheduleMaintenance',
        'completeMaintenance', 'getMaintenanceLog', 'retireAsset', 'transferAsset',
      ],
      // retireAsset/transferAsset carry a `confirmed` flag → auto confirmFirst (arg) + destructiveThrottle.
      destructiveTools: ['retireAsset', 'transferAsset'],
      // Auto-installs the always-on noFalseFailureClaim reply invariant (auto-iff-provided).
      lexicon: { falseFailureClaimRe: FALSE_FAILURE_CLAIM_RE },
      behavior: [
        // NO persona line here (the runtime prepends it). Every line CONDITIONED (Bucket-A).
        'Read the registry and asset detail from listAssets / getAsset — when nothing matches, say so honestly; never invent an asset, a rate, or a condition.',
        'Report an asset condition or its maintenance history ONLY from getAsset / getMaintenanceLog — never state a condition or a past service you have not read.',
        'To register a new asset, act directly once you have name, category, dailyRate and requiredDeposit — do not ask permission for the registration itself.',
        'When you are not sure of an asset id, locate it via listAssets / getAsset first — never invent one; when the user hands you a real ast_ id, you may act on it directly.',
        'Fleet changes (register / update / maintenance / retire / transfer) need fleet-management permission — when you lack it, say so plainly and do not claim the change was made.',
        'To retire or transfer an asset, the tool returns a confirmation prompt — relay it and STOP; only after the user explicitly confirms, call again with confirmed=true.',
        'An asset under a legal or compliance hold, out on rental, or reserved by a booking cannot be retired or transferred — surface the real blocker instead of forcing it.',
        'Complete maintenance only for an asset currently IN a maintenance window — one you scheduled this conversation or one already under way; when nothing is in maintenance for it, say there is nothing to complete.',
        'Maintenance cannot be scheduled for an asset that is currently OUT on a rental — when it is out, say so and offer to schedule after its return.',
        'If an action fails, report the REAL error briefly (e.g. missing permission, invalid input, a hold) — never claim a success that did not happen.',
        'When a request is unclear or garbled, recover with ONE concrete clarifying question.',
        "Keep replies short and in the user's language.",
      ],
    });

    // ── INPUT: call-shape — a real ast_ id, never an invented one (all assetId consumers). ─────────
    this.addGuard('preTool', ASSET_ID_TOOLS, argFormat('assetId', '^ast_[a-z0-9]+$'), {
      id: 'agent:assetIdFormat',
    });
    // transferAsset's destination must be a real ws_ id.
    this.addGuard('preTool', ['transferAsset'], argFormat('targetWorkspaceId', '^ws_[a-z0-9]+$'), {
      id: 'agent:targetWorkspaceFormat',
    });

    // (N review round 1, finding N3-M1: the assetIdProvenance custom gate was DROPPED — it was
    // stricter than both the world and the eval (cases 63/68 hand a real id in the user turn and
    // require the direct write; the world allows it). Provenance past the ast_ SHAPE is now prose +
    // an UNCHECKABLE dimension, matching the claims/admin drafters' deliberate choice.)

    // ── RUN: fleet-management permission on every mutating fleet op (projection.canManageFleet). ───
    this.addGuard('preTool', FLEET_WRITE_TOOLS, precondition(
      (w) => Boolean((w.projection() as { canManageFleet?: boolean }).canManageFleet),
      'You lack fleet-management permission (owner/admin) — refuse the change and tell the user.',
      'fleet changes need fleet-management permission — when the acting user is not owner/admin, say so and do not attempt it',
    ), { id: 'agent:canManageFleet' });

    // ── RUN: an asset under an active legal/compliance hold cannot be retired or transferred. ──────
    this.addGuard('preTool', ['retireAsset', 'transferAsset'], custom({
      kind: 'assetNotFrozen',
      dim: 'run',
      check: (ctx) => {
        const assetId = typeof ctx.args.assetId === 'string' ? ctx.args.assetId : '';
        const frozen = (ctx.world.projection() as { frozenAssetIds?: string[] }).frozenAssetIds ?? [];
        return frozen.includes(assetId)
          ? `Asset "${assetId}" is under an active legal/compliance hold — it cannot be retired or transferred until the hold is lifted. Tell the user.`
          : null;
      },
      prose: () => 'an asset under an active legal/compliance hold cannot be retired or transferred — when it is frozen, surface the hold instead',
    }), { id: 'agent:assetNotFrozen' });

    // (N review round 1, findings N2-1 / N3-M2: the requiresBefore(['scheduleMaintenance']) gate on
    // completeMaintenance was DROPPED — the default preset seeds ast_gen02 mid-maintenance with an
    // open window, so a conversation-scoped ordering gate wrongly blocks completing seeded work (the
    // exact seeded-state trap the at-rentals drafter documented and avoided for closeBooking). The
    // world enforces the real precondition (NOT_IN_MAINTENANCE); prose is conditioned accordingly.)

    // ── BEHAVIOR: destructive-claim honesty (attempt-keyed; exempts probes / offers / failures). ───
    this.addReplyCheck(destructiveClaimRequiresSuccess(['retireAsset', 'transferAsset'], {
      claimRe: DESTRUCTIVE_CLAIM_RE,
      askRe: CONFIRM_ASK_RE,
      offerRe: OFFER_OR_CONDITIONAL_RE,
      exemptRe: HONEST_FAILURE_RE,
    }), { id: 'agent:destructiveClaim' });

    // ── BEHAVIOR: a returned two-step confirmation prompt MUST be relayed as a question. ───────────
    this.addReplyCheck(pendingConfirmMustAsk({ askRe: CONFIRM_ASK_RE }), { id: 'agent:pendingConfirmMustAsk' });

    // ── BEHAVIOR: write-success honesty — never claim a fleet write that did not run+succeed. ──────
    this.addReplyCheck(noFabricatedSuccess('registerAsset', {
      reason: 'You claimed the asset was registered, but registerAsset did not succeed this turn — report what actually happened.',
      claimRe: REGISTER_CLAIM_RE,
    }), { id: 'agent:noFabricatedRegister' });
    this.addReplyCheck(noFabricatedSuccess('updateAssetCondition', {
      reason: 'You claimed the condition was updated, but updateAssetCondition did not succeed this turn — report what actually happened.',
      claimRe: UPDATE_CONDITION_CLAIM_RE,
    }), { id: 'agent:noFabricatedUpdateCondition' });
    this.addReplyCheck(noFabricatedSuccess('scheduleMaintenance', {
      reason: 'You claimed maintenance was scheduled, but scheduleMaintenance did not succeed this turn — report what actually happened.',
      claimRe: SCHEDULE_CLAIM_RE,
    }), { id: 'agent:noFabricatedSchedule' });
    this.addReplyCheck(noFabricatedSuccess('completeMaintenance', {
      reason: 'You claimed the asset is back in service, but completeMaintenance did not succeed this turn — report what actually happened.',
      claimRe: COMPLETE_CLAIM_RE,
    }), { id: 'agent:noFabricatedComplete' });

    // ── Egress: scrub raw status/error tokens to plain user words before the reply leaves. ─────────
    this.addMutator(jargonScrub({
      ASSET_ON_HOLD: 'under an active hold',
      ASSET_RESERVED: 'reserved by a booking',
      ASSET_OUT: 'out on rental',
      NOT_IN_MAINTENANCE: 'not currently in maintenance',
      ALREADY_RETIRED: 'already retired',
      PERMISSION_DENIED: 'not permitted',
    }), { id: 'agent:jargonScrub' });
  }
}

export default new AgentSpecAtInventory();
