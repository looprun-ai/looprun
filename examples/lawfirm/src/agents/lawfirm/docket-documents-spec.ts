/**
 * docket-documents — court/filing deadlines, matter documents, and client notifications.
 *
 * Bucket: the docket lifecycle (create → file / cancel), document register/list, the reminder job
 * (read the window → notify the right client), and notification reads. Shared read-only tools
 * (listClients, listMatters, getMatter, getClient) repeat from the client-matters agent by design.
 * Layer: AgentSpecBase because cancelDeadline carries the confirmed-flag protocol.
 *
 * // UNCHECKABLE: client intake / matter opening / time & billing requests belong to the
 * //              client-matters agent → say so (intent routing is firewalled; prose + eval).
 * // UNCHECKABLE: the notification's WORDING must stay factual and professional (language layer;
 * //              the cross-client leak itself IS checked deterministically below).
 * // UNCHECKABLE: out-of-scope asks — editing client contact records (office manager) and
 * //              rescheduling a deadline in place (the legal path is cancel-with-confirm +
 * //              create-new) → honest refusal/explanation (intent-keyed; conditioned prose + eval).
 */
import { AgentSpecBase, custom, destructiveClaimRequiresSuccess, jargonScrub, maxCallsPerTurn, noFalseFailureClaim, pendingConfirmMustAsk, requiresBefore } from 'looprun';
import type { GuardCtx } from 'looprun';
import { LAWFIRM_THEME } from './theme.js';
import { CONFIRM_ASK_RE, FALSE_FAILURE_CLAIM_RE, OFFER_OR_CONDITIONAL_RE } from './lexicon.js';

export class AgentSpecDocketDocuments extends AgentSpecBase {
  constructor() {
    super({
      id: 'docket-documents',
      mode: 'DOCKET_DOCUMENTS',
      // REQUIRED per-agent persona (persona-on-spec law) — rendered as the FIRST Behavior bullet.
      persona:
        'You are the docket & documents agent: court/filing deadlines (create, list, mark filed, ' +
        'cancel), matter documents, and client notifications.',
      tools: [
        'createDeadline',
        'listDeadlines',
        'markDeadlineFiled',
        'cancelDeadline',
        'registerDocument',
        'listDocuments',
        'notifyClient',
        'listNotifications',
        'listClients',
        'listMatters',
        'getMatter',
        'getClient',
      ],
      destructiveTools: ['cancelDeadline'],
      flow: [{ from: 'listDeadlines', to: 'cancelDeadline' }],
      theme: LAWFIRM_THEME,
      behavior: [
        // NO persona line here — the runtime prepends the persona field above.
        'Act directly on the requested non-destructive action (create a valid deadline, register a ' +
          'document, mark a completed filing, send a requested compliant notification) — never ask ' +
          'permission for what the user already requested.',
        'To cancel a deadline: read the docket first (listDeadlines) to verify the exact id and its ' +
          'status; when the cancel tool returns a confirmation question, relay it to the user and ' +
          'STOP until they explicitly agree in a later turn; cancel at most one deadline per turn.',
        'When a deadline is FILED, it is immutable — refuse the cancellation, explain why, and ' +
          'leave every other deadline untouched.',
        'There is no in-place reschedule: when asked to move a deadline\'s date, explain that the ' +
          'pending deadline must be cancelled (two-step confirmation) and a new one created with ' +
          'the new date — and proceed only with the user\'s agreement.',
        'When a requested due date is before today, create nothing — tell the user the date is in ' +
          'the past and ask for a today-or-later date.',
        'When the matter a write names is CLOSED or unknown, say so after reading the records and ' +
          'never divert the write to a different matter.',
        "A notification may contain ONLY the recipient's own matter information — when the user's " +
          'draft includes another client or their case, flag the confidentiality problem and send ' +
          "at most a version limited to the recipient's own matters.",
        'When a read comes back empty (no deadlines, documents or notifications), say "none found" ' +
          'honestly — never pad the answer with invented records.',
        'Client intake, opening/closing matters, and billable time are the clients & matters ' +
          "assistant's job — when asked for those, say so and point the user there.",
        'This assistant cannot edit client contact records — when contact info is missing or ' +
          'wrong (e.g. a notification fails for lack of contact), say so and route the user to ' +
          'the office manager.',
        'If an action fails (e.g. no contact on file), report the REAL error briefly — never claim ' +
          'a notification was sent or a record was created when it was not.',
      ],
    });

    // Spatial gates: locate-and-verify before acting on a deadline id (both one-way ops).
    this.addGuard('preTool', ['cancelDeadline'], requiresBefore(['listDeadlines']));
    this.addGuard('preTool', ['markDeadlineFiled'], requiresBefore(['listDeadlines']));

    // Run gate: filed/cancelled deadlines are immutable — deny BEFORE the destructive attempt
    // executes (the world would reject it too; the gate keeps the attempt out of the trace).
    this.addGuard(
      'preTool',
      ['cancelDeadline'],
      custom({
        kind: 'filedIsImmutable',
        dim: 'run',
        check: (ctx: GuardCtx) => {
          const w = ctx.world as { deadlineStatus?: (id: string) => string };
          const id = typeof ctx.args.deadlineId === 'string' ? ctx.args.deadlineId : '';
          if (!id || typeof w.deadlineStatus !== 'function') return null;
          const status = w.deadlineStatus(id);
          if (status === 'filed') {
            return `deadline ${id} is FILED — court deadlines are immutable once filed. Tell the user it cannot be cancelled.`;
          }
          if (status === 'cancelled') {
            return `deadline ${id} is already cancelled — tell the user; nothing to do.`;
          }
          return null;
        },
        prose: () => 'a FILED (or already-cancelled) deadline can never be cancelled — when asked, refuse and explain',
      }),
      { id: 'agent:filedIsImmutable' },
    );

    // Run gate: marking filed is one-way — deny re-filing or filing a cancelled deadline.
    this.addGuard(
      'preTool',
      ['markDeadlineFiled'],
      custom({
        kind: 'fileOnlyPending',
        dim: 'run',
        check: (ctx: GuardCtx) => {
          const w = ctx.world as { deadlineStatus?: (id: string) => string };
          const id = typeof ctx.args.deadlineId === 'string' ? ctx.args.deadlineId : '';
          if (!id || typeof w.deadlineStatus !== 'function') return null;
          const status = w.deadlineStatus(id);
          if (status === 'filed') return `deadline ${id} is already filed — tell the user; nothing to do.`;
          if (status === 'cancelled') {
            return `deadline ${id} was cancelled — a cancelled deadline cannot be marked filed. Tell the user.`;
          }
          return null;
        },
        prose: () => 'only a PENDING deadline can be marked filed — when it is already filed or was cancelled, say so',
      }),
      { id: 'agent:fileOnlyPending' },
    );

    // Input gate: past due dates are invalid — deny before execution and route to ONE question.
    this.addGuard(
      'preTool',
      ['createDeadline'],
      custom({
        kind: 'noPastDueDate',
        dim: 'input',
        check: (ctx: GuardCtx) => {
          const w = ctx.world as { todayStr?: () => string };
          const due = typeof ctx.args.dueDate === 'string' ? ctx.args.dueDate : '';
          if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || typeof w.todayStr !== 'function') return null;
          const today = w.todayStr();
          return due < today
            ? `the due date ${due} is in the past (today is ${today}) — ask the user for a today-or-later date; create nothing yet`
            : null;
        },
        prose: () => 'a new deadline needs a due date of today or later — when the requested date is past, ask for a valid one',
      }),
      { id: 'agent:noPastDueDate' },
    );

    // Input gate (confidentiality, deterministic half): a notification naming ANOTHER client —
    // or referencing a matter the recipient does not own — is denied before it sends.
    this.addGuard(
      'preTool',
      ['notifyClient'],
      custom({
        kind: 'confidentialNotification',
        dim: 'input',
        check: (ctx: GuardCtx) => {
          const w = ctx.world as {
            clientDirectory?: () => Array<{ id: string; name: string }>;
            matterClient?: (matterId: string) => string | null;
          };
          const recipient = typeof ctx.args.clientId === 'string' ? ctx.args.clientId : '';
          const raw = typeof ctx.args.message === 'string' ? ctx.args.message : '';
          const message = raw.toLowerCase();
          if (!recipient || !message) return null;
          if (typeof w.clientDirectory === 'function') {
            for (const c of w.clientDirectory()) {
              if (c.id !== recipient && message.includes(c.name.toLowerCase())) {
                return `confidentiality: the message names another client (${c.name}) — a notification may contain only the recipient's own matters. Rewrite it without any other client's information.`;
              }
            }
          }
          if (typeof w.matterClient === 'function') {
            for (const mid of raw.match(/\bm_\d+\b/gi) ?? []) {
              const owner = w.matterClient(mid.toLowerCase());
              if (owner !== null && owner !== recipient) {
                return `confidentiality: the message references matter ${mid.toLowerCase()}, which belongs to a different client — a notification may contain only the recipient's own matters.`;
              }
            }
          }
          return null;
        },
        prose: () =>
          "a notification may reference no client or matter other than the recipient's own — one client's information never reaches another",
      }),
      { id: 'agent:confidentialNotification' },
    );

    // Run gate: one notification per turn (anti-spam; batch content into one message).
    this.addGuard(
      'preTool',
      ['notifyClient'],
      maxCallsPerTurn('notifyClient', 1, 'send at most one notification per turn — batch the content for a client into ONE message'),
      { id: 'agent:oneNotificationPerTurn' },
    );

    // Reply honesty: relay pending confirmations; "cancelled" claims need a confirmed success
    // (confirm-probe + honest-failure exemptions); no phantom "sent" on a failed notification.
    this.addReplyCheck(pendingConfirmMustAsk({ askRe: CONFIRM_ASK_RE }), { id: 'agent:pendingConfirmMustAsk' });
    this.addReplyCheck(
      destructiveClaimRequiresSuccess(['cancelDeadline'], {
        claimRe: /\bcancel(?:led|ed)\b/i,
        askRe: CONFIRM_ASK_RE,
        offerRe: OFFER_OR_CONDITIONAL_RE,
        // Exempt honest failures/negations AND truthful STATUS reports ("dl_602 is cancelled") —
        // fresh-action claims ("has been cancelled", "I cancelled") stay guarded.
        exemptRe: /\b(cannot|can't|could not|couldn't|not|no|already|unable|immutable|filed)\b|\b(is|was|remains)\s+(already\s+)?cancelled\b|\?/i,
      }),
      { id: 'agent:destructiveClaimRequiresSuccess' },
    );
    this.addReplyCheck(
      custom({
        kind: 'noPhantomNotification',
        dim: 'behavior',
        check: (ctx: GuardCtx) => {
          const sentOk = ctx.observed.some(
            (o) => o.turnIndex === ctx.turnIndex && o.ok && o.name === 'notifyClient',
          );
          if (sentOk) return null;
          // Reporting notification HISTORY read this turn is honest past-tense, not a claim.
          const readHistory = ctx.observed.some(
            (o) => o.turnIndex === ctx.turnIndex && o.ok && o.name === 'listNotifications',
          );
          if (readHistory) return null;
          const reply = ctx.reply ?? '';
          // Honest failure/negation exemption BEFORE the affirmative claim regex.
          if (/\b(not|cannot|can't|could not|couldn't|unable|fail(?:ed|ure)?|no)\b/i.test(reply)) return null;
          return /\b(sent|notified|texted|emailed)\b/i.test(reply)
            ? 'You claimed a notification was sent but notifyClient did not succeed this turn — state what actually happened.'
            : null;
        },
        prose: () => 'only claim a notification was sent when notifyClient succeeded this turn',
      }),
      { id: 'agent:noPhantomNotification' },
    );
    this.addReplyCheck(noFalseFailureClaim({ claimRe: FALSE_FAILURE_CLAIM_RE }), { id: 'agent:noFalseFailureClaim' });

    // Egress scrub: internal result vocabulary never reaches the user verbatim.
    this.addMutator(jargonScrub({ requiresConfirmation: 'awaiting your confirmation' }), {
      id: 'agent:jargonScrub',
    });
  }
}

export default new AgentSpecDocketDocuments();
