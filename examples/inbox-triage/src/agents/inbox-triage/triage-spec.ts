/**
 * inbox-triage — the single triage agent: summarize what matters, archive noise, label, and
 * draft replies for the owner to review.
 *
 * Bucket: the whole 6-tool surface (one agent — the tools form one end-to-end triage flow, well
 * under the 15-tool wall, so decomposition would only split a flow the evals need whole).
 * `destructiveTools` is EMPTY on purpose: nothing here uses the confirmed-flag two-step protocol —
 * triage runs unattended (often from a schedule), so archiving is bounded by a per-turn cap
 * instead of a confirm gate, and the genuinely irreversible action (sending email) is not
 * confirm-gated but HARD-VETOED: `emailSend` stays on the surface and is denied unconditionally
 * (the draft-only safety line this example exists to demonstrate). The always-on
 * noFalseFailureClaim installs from cfg.lexicon.falseFailureClaimRe.
 *
 * // UNCHECKABLE: whether mail was archived, answered, or otherwise handled BEFORE this
 * //             conversation is unverifiable (there is no history/sent-log tool) — the reply must
 * //             say it cannot verify that, never assert it either way (cases 07, 14). A behavior
 * //             line specializes the theme's honesty invariant to this missing accessor.
 * // UNCHECKABLE: whether a draft's wording faithfully carries the owner's instruction (and only
 * //             facts from the read body) is language-layer — eval dimension only (cases 03, 10).
 */
import { AgentSpecBase, custom, forbidThisTurn, jargonScrub, maxCalls, noFabricatedSuccess, requiresBefore } from 'looprun';
import { ARCHIVE_CLAIM_RE, FALSE_FAILURE_CLAIM_RE, SENT_CLAIM_RE } from './lexicon.js';
import { INBOX_TRIAGE_THEME } from './theme.js';

/** The per-id reads the archive gate needs (world accessors via the ctx closure). */
type MailboxReader = {
  hasEmail?: (emailId: string) => boolean;
  emailArchived?: (emailId: string) => boolean;
};

export class AgentSpecInboxTriage extends AgentSpecBase {
  constructor() {
    super({
      id: 'inbox-triage',
      mode: 'INBOX_TRIAGE',
      persona:
        'You are the inbox-triage agent: you list and summarize the unread inbox, archive noise, ' +
        'label what needs attention, and draft replies that the owner reviews and sends personally.',
      tools: ['emailsList', 'emailRead', 'emailArchive', 'emailLabel', 'emailDraftCreate', 'emailSend'],
      lexicon: { falseFailureClaimRe: FALSE_FAILURE_CLAIM_RE },
      theme: INBOX_TRIAGE_THEME,
      behavior: [
        // Load-bearing lines first. Each SPECIALIZES a theme invariant — none re-declares one.
        'A triage pass runs emailsList → emailRead → emailDraftCreate: list first, read the full body of anything you summarize in detail or answer, then draft. Acting on an inbox you have not listed this conversation is a failure.',
        'When the owner asks you to reply or to "just send it": read the message, create the draft with emailDraftCreate, and state plainly that the draft is saved for their review because sending is disabled for this assistant. That policy line is the real answer — do not dress it up as a technical error, and do not claim the reply went out.',
        'At most 10 emails can be archived per turn. When more qualify, archive up to the cap, then report the REAL counts — how many were archived and how many remain — and continue in the next turn if the owner wants. Claiming everything was archived while some remain is a failure.',
        'When an email is urgent or from a client, keep it in the inbox, surface it near the top of the summary, and — when a reply is warranted — draft one grounded ONLY in what the real body from emailRead says. A draft that invents facts, figures, or commitments the body and the owner did not give is fabrication.',
        'When emailsList returns no unread email, say the inbox is clear and stop — no invented senders, no "probably arrived" messages, no busywork calls.',
        'Whether mail was archived, replied to, or otherwise handled BEFORE this conversation CANNOT be verified — there is no history log. Answer such questions by saying exactly that, plus what the current tools DO show; never assert a past action either way.',
        'When a load-bearing value is garbled or missing (which email, which label, what the reply should say), ask ONE concrete question naming exactly what you need — guessing an email id or inventing reply content the owner did not give is fabrication, not helpfulness.',
      ],
    });

    // ── THE SAFETY LINE (spatial, unconditional): emailSend never runs. The deny message doubles
    // as the always-rendered prose, steering to the legal path instead of just blocking.
    this.addGuard(
      'preTool',
      ['emailSend'],
      forbidThisTurn(
        "emailSend is disabled: this assistant is draft-only by the owner's standing policy. " +
          'Create the reply with emailDraftCreate and tell the owner the draft awaits their ' +
          'review — never call emailSend and never claim a message was sent.',
      ),
      { id: 'agent:sendDisabled' },
    );

    // Spatial gates: ids exist only in emailsList output, so every per-email action needs the list
    // first (this conversation); a draft additionally needs the real body it answers.
    this.addGuard('preTool', ['emailRead', 'emailArchive', 'emailLabel'], requiresBefore(['emailsList']), {
      id: 'agent:listBeforeActing',
    });
    this.addGuard('preTool', ['emailDraftCreate'], requiresBefore(['emailsList', 'emailRead']), {
      id: 'agent:readBeforeDrafting',
    });

    // Run gate: the per-turn archive budget (bulk cap — triage runs unattended, so the cap, not a
    // confirm gate, is what bounds the blast radius).
    this.addGuard(
      'preTool',
      ['emailArchive'],
      maxCalls(
        'emailArchive',
        10,
        'At most 10 emails may be archived per turn — when more qualify, stop at the cap, report ' +
          'the real archived/remaining counts, and continue in the next turn.',
        { scope: 'turn' },
      ),
      { id: 'agent:archiveTurnCap' },
    );

    // Run gate: archive only real, still-unread mail — deny with a routing correction instead of
    // executing into a world error (fabricated or stale ids are the observable discriminator).
    this.addGuard(
      'preTool',
      ['emailArchive'],
      custom({
        kind: 'archiveRealEmailOnly',
        dim: 'run',
        check: (ctx) => {
          const id = typeof ctx.args.emailId === 'string' ? ctx.args.emailId : '';
          const world = ctx.world as MailboxReader;
          if (id && world.hasEmail && !world.hasEmail(id)) {
            return `${id} is not in this mailbox — archive only ids read from emailsList this conversation. Tell the owner it is not there; never pretend it was archived.`;
          }
          if (id && world.emailArchived?.(id)) {
            return `${id} is already archived — tell the owner it is already out of the inbox; do not archive it again.`;
          }
          return null;
        },
        prose: () =>
          'archive only emails whose id came from emailsList this conversation — when an id is not in the mailbox (or already archived), say so instead',
      }),
      { id: 'agent:archiveRealEmailOnly' },
    );

    // Reply honesty. Send-claims are banned UNCONDITIONALLY (banRe): emailSend is hard-vetoed, so
    // "it was sent" can never be true here. Archive-claims are attempt-keyed (claimRe): they fire
    // only when emailArchive was attempted this turn and none succeeded.
    this.addReplyCheck(
      noFabricatedSuccess('emailSend', {
        reason:
          'No email was sent — this assistant cannot send (drafts only). Say the draft, if any, ' +
          'is saved for the owner to review; never claim a reply was sent or delivered.',
        banRe: SENT_CLAIM_RE,
      }),
      { id: 'agent:noPhantomSend' },
    );
    this.addReplyCheck(
      noFabricatedSuccess('emailArchive', {
        reason:
          'No archive succeeded this turn — do not claim mail was archived or the inbox cleared. ' +
          'Report what actually happened.',
        claimRe: ARCHIVE_CLAIM_RE,
      }),
      { id: 'agent:noPhantomArchive' },
    );

    this.addMutator(jargonScrub({ draftId: 'draft id' }), { id: 'agent:jargonScrub' });
  }
}

export default new AgentSpecInboxTriage();
