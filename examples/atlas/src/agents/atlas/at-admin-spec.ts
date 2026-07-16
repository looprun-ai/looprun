/**
 * atlas — at-admin AgentSpec (Workspace Admin bucket).
 *
 * Bucket rationale (E1, tool-need): workspace/tenant admin, members & roles, and plan/quota — the 9
 * tools that read or mutate the tenant itself (getWorkspace, getPlanUsage, listMembers, getMember,
 * inviteMember, updateMemberRole, removeMember, changePlan, getAuditLog). Two carry a two-step
 * `confirmed` protocol (removeMember, changePlan) → passed as destructiveTools, so the constructor
 * auto-installs confirmFirst + destructiveThrottle on exactly those.
 *
 * Layer rationale: ONE AgentSpecBase. The constructor owns the always-on invariants (noDuplicateCall,
 * degenerationGuard, emptyReply) and, from destructiveTools, the destructive-safety protocol — never
 * hand-added here. The agent layer adds the decidable frontier this bucket exposes over projection():
 * privilege preconditions (member ops need canManageMembers; changePlan is owner-only), the seat-cap
 * gate on inviteMember, member-id shape, and the reply-honesty guards keyed on attempt/success.
 *
 * UNCHECKABLE (no observable predicate over the guard surface — projection() keys + observed calls;
 * left to conditioned prose + an eval dimension so N4/G3 can still measure the miss):
 *  - Tenant isolation: every op is scoped to the active workspace by the world; no projection key
 *    exposes cross-tenant identity for a check to gate on.
 *  - Member-id provenance: "use mem_ ids that came from listMembers/getMember this conversation, never
 *    invent one" — GuardCtx.observed carries no prior-result ids and projection() lists no member ids,
 *    so provenance-to-a-real-read cannot be decided. (argFormat still enforces the mem_ SHAPE.)
 *  - Sole-owner protection: "cannot remove or demote the last owner / self-demote" — projection()
 *    exposes no owner count nor the target member's role; the world enforces it, the reply reports it.
 *  - Quota/usage anti-fabrication: state seat/booking/quota numbers only from getPlanUsage — an
 *    arbitrary numeric claim is not a decidable predicate over projection().
 *  - Audit grounding: answer "did X happen / when" only from getAuditLog — a free-text history claim
 *    is not decidable from the guard surface.
 *  - Plan DOWNGRADE below current usage is rejected by the world (DOWNGRADE_BELOW_USAGE): the target
 *    plan's caps are world constants not exposed in projection(), so the compare is not decidable
 *    here; conditioned prose carries the rule and the reply must relay the rejection honestly.
 *    (N4-A2, N round 1; eval gap logged in EVALS.md.)
 */
import {
  AgentSpecBase,
  argFormat,
  destructiveClaimRequiresSuccess,
  noFabricatedSuccess,
  noFalseFailureClaim,
  pendingConfirmMustAsk,
  precondition,
} from 'looprun';

// Guard-readable snapshot accessor — checks read ONLY the dotted scalars projection() exposes.
type AdminProjection = {
  onboarded: boolean;
  actingRole: string;
  canManageMembers: boolean;
  atSeatCap: boolean;
};
const proj = (w: unknown): AdminProjection =>
  (w as { projection(): AdminProjection }).projection();

// Business-owned reply lexicon (P8a — the runtime holds no linguistic regex; a drafter passes it in).
// Inlined to keep this spec self-contained; a mature bundle would keep these in one lexicon module.
const CONFIRM_ASK_RE =
  /\?|\bconfirm\b|\bare you sure\b|\bplease confirm\b|\bproceed\b|\bshall i\b|\bshould i\b|\bdo you want\b|\bwould you like\b/i;
const OFFER_OR_CONDITIONAL_RE = /\b(would|could|can|i can|if you|want me to|do you want|shall i)\b/i;
// A member removal or a plan change is being asserted as DONE.
const ADMIN_DESTRUCTIVE_CLAIM_RE =
  /\b(removed|took .{0,20}off|off the workspace|no longer a member|plan (?:is )?(?:now|changed|switched|updated|upgraded|downgraded))\b/i;
// Honest failure / negation — exempted before the affirmative claim fires.
const ADMIN_FAILURE_EXEMPT_RE = /\b(cannot|can'?t|could\s?n['o]?t|unable|won'?t|not|no longer able|already)\b/i;
// An invite is being asserted as DONE.
const INVITE_CLAIM_RE = /\b(invited|invitation sent|sent (?:an|the) invite|added .{0,20}as|is now a member)\b/i;
// A role change is being asserted as DONE.
const ROLE_CLAIM_RE =
  /\b(role (?:is now|updated|changed|set to)|promoted|demoted|now (?:an? )?(?:owner|admin|dispatcher|billing|viewer))\b/i;
// Explaining a FAILURE of an admin write when nothing failed this turn.
// T iteration 2 (measured, rung-2 cases 03/07/23/44): the previous broad can't/cannot/unable
// matcher classified honest POLICY REFUSALS and probe-consequence phrasing ("cannot be undone")
// as false failure claims — noFalseFailureClaim fires when all this-turn calls SUCCEEDED, which
// is exactly the successful-reads + honest-refusal shape — redriving the reply into the
// exhaustion fallback (cross-domain lessons #2/#8). Narrowed to attempted-work FAILURE phrasing.
const FALSE_FAILURE_CLAIM_RE =
  /\b(failed to|could not (?:complete|process|create|generate|save|find a way)|error(?:ed)? (?:out|occurred)|ran into (?:an )?error|something went wrong|tried (?:to|but) [^.!?\n]{0,32}(?:failed|didn'?t work))\b/i;

export class AgentSpecAtAdmin extends AgentSpecBase {
  constructor() {
    super({
      id: 'at-admin',
      mode: 'ATLAS_ADMIN',
      persona:
        'You are the workspace-admin agent: the tenant workspace, its members and roles, and the plan and its quotas.',
      // 9 tools; no terminal tools (replyToUser/askUser are the runner's).
      tools: [
        'getWorkspace',
        'getPlanUsage',
        'listMembers',
        'getMember',
        'inviteMember',
        'updateMemberRole',
        'removeMember',
        'changePlan',
        'getAuditLog',
      ],
      // removeMember + changePlan carry the two-step confirmed protocol → confirmFirst + throttle
      // auto-install on exactly these (default 'arg' mechanism = the confirmed flag).
      destructiveTools: ['removeMember', 'changePlan'],
      behavior: [
        // Every line CONDITIONED (Bucket-A); persona is the config field above, not repeated here.
        'Every action is scoped to the active workspace — read it with getWorkspace when tenancy matters, and never reference or mix another workspace’s data.',
        'Report seat, booking, and quota numbers only from getPlanUsage — when you have not read it this turn, say you need to check rather than estimate a figure.',
        'Inviting a member, changing a role, and removing a member are privileged (member-management permission); changing the plan is owner-only — when the acting user lacks permission or a tool returns PERMISSION_DENIED, relay that honestly and never claim the action happened.',
        'Inviting a member consumes a seat — when the workspace is at its seat cap, say so and offer the fix paths (upgrade the plan or remove a member) instead of inviting.',
        'To remove a member or change the plan, the tool returns a confirmation prompt first — relay it to the user and STOP; only call again with confirmed=true after they explicitly approve.',
        'You cannot remove or demote the sole remaining owner — if the tool rejects for that reason, explain it plainly instead of retrying.',
        'A plan downgrade below what the workspace currently uses (seats or active bookings) is rejected — when that happens, relay the rejection and name what must shrink first; never claim the plan changed.',
        'Answer "did X happen / when" questions only from getAuditLog — never invent workspace history or a timestamp.',
        'If a write fails, report the real error briefly; never claim an invite, role change, removal, or plan change that did not actually succeed.',
        'When a request is ambiguous, recover with ONE concrete clarifying question, and keep replies short and in the user’s language.',
      ],
    });

    // ── Privilege preconditions (run dim; read ONLY projection() scalars) ────────────────────────
    // Member ops require canManageMembers (owner/admin).
    this.addGuard('preTool', ['inviteMember'], precondition(
      (w) => proj(w).canManageMembers === true,
      'PERMISSION_DENIED: inviting a member needs member-management permission (owner/admin).',
      'inviting a member needs member-management permission (owner/admin) — when the acting user lacks it, say so and do not attempt the invite',
    ));
    this.addGuard('preTool', ['updateMemberRole'], precondition(
      (w) => proj(w).canManageMembers === true,
      'PERMISSION_DENIED: changing a member’s role needs member-management permission (owner/admin).',
      'changing a member’s role needs member-management permission (owner/admin) — when the acting user lacks it, refuse honestly',
    ));
    this.addGuard('preTool', ['removeMember'], precondition(
      (w) => proj(w).canManageMembers === true,
      'PERMISSION_DENIED: removing a member needs member-management permission (owner/admin).',
      'removing a member needs member-management permission (owner/admin) — when the acting user lacks it, refuse honestly',
    ));
    // changePlan is OWNER-only (admin has canManageMembers but may NOT change the plan).
    this.addGuard('preTool', ['changePlan'], precondition(
      (w) => proj(w).actingRole === 'owner',
      'PERMISSION_DENIED: changing the plan is owner-only.',
      'changing the workspace plan is owner-only — when the acting user is not the owner, say so and do not attempt it',
    ));

    // ── Seat-cap gate on inviteMember (run dim; the quota-exhausted refusal path) ─────────────────
    this.addGuard('preTool', ['inviteMember'], precondition(
      (w) => proj(w).atSeatCap !== true,
      'SEAT_QUOTA_REACHED: at the seat cap — upgrade the plan or remove a member before inviting.',
      'inviting consumes a seat — when the workspace is at its seat cap, say it is full and offer the fix (upgrade the plan or remove a member) instead of inviting',
    ));

    // ── Member-id SHAPE (input dim; provenance-to-a-real-read stays UNCHECKABLE, see header) ───────
    this.addGuard('preTool', ['updateMemberRole'], argFormat(
      'memberId', '^mem_[a-z0-9]+$', undefined,
      'memberId must be a real mem_ id from listMembers/getMember — this one is malformed.',
    ));
    this.addGuard('preTool', ['removeMember'], argFormat(
      'memberId', '^mem_[a-z0-9]+$', undefined,
      'memberId must be a real mem_ id from listMembers/getMember — this one is malformed.',
    ));

    // ── Reply honesty (behavior dim) ─────────────────────────────────────────────────────────────
    // Non-destructive writes: no phantom invite / role change unless the tool succeeded this turn.
    this.addReplyCheck(noFabricatedSuccess('inviteMember', {
      claimRe: INVITE_CLAIM_RE,
      reason: 'You claimed a member was invited, but inviteMember did not succeed this turn — state what actually happened.',
    }), { id: 'agent:noFabricatedInvite' });
    this.addReplyCheck(noFabricatedSuccess('updateMemberRole', {
      claimRe: ROLE_CLAIM_RE,
      reason: 'You claimed a role was changed, but updateMemberRole did not succeed this turn — state what actually happened.',
    }), { id: 'agent:noFabricatedRoleChange' });

    // Destructive writes (attempt-keyed; exempts confirm-probes, offers, and honest failures).
    this.addReplyCheck(destructiveClaimRequiresSuccess(['removeMember', 'changePlan'], {
      claimRe: ADMIN_DESTRUCTIVE_CLAIM_RE,
      askRe: CONFIRM_ASK_RE,
      offerRe: OFFER_OR_CONDITIONAL_RE,
      exemptRe: ADMIN_FAILURE_EXEMPT_RE,
    }), { id: 'agent:destructiveClaimRequiresSuccess' });

    // A pending two-step confirm MUST be relayed as a question, not summarized as done.
    this.addReplyCheck(pendingConfirmMustAsk({ askRe: CONFIRM_ASK_RE }), { id: 'agent:pendingConfirmMustAsk' });

    // Do not explain an admin-write FAILURE when nothing failed this turn (agent-layer; no cfg.lexicon).
    this.addReplyCheck(noFalseFailureClaim({ claimRe: FALSE_FAILURE_CLAIM_RE }), { id: 'agent:noFalseFailureClaim' });
  }
}

export default new AgentSpecAtAdmin();
