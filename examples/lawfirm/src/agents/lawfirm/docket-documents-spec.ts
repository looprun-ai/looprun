/**
 * docket-documents — court/filing deadlines, matter documents, and client notifications.
 *
 * Bucket: the docket lifecycle (create → file / cancel), document register/list, the reminder job
 * (read the window → notify the right client), and notification reads. Shared read-only tools
 * (listClients, listMatters, getMatter, getClient) repeat from the client-matters agent by design —
 * every id this agent's tools consume (matterId, deadlineId, clientId) has a name→id read here.
 * Layer: the one AgentSpecBase — cancelDeadline is in `destructiveTools` (auto confirmFirst +
 * destructiveThrottle); noFalseFailureClaim auto-installs from `lexicon`.
 *
 * PROFILES (convention): RULES + GUARDS are the single source of truth and never fork per model. The
 * DEFAULT profile is this certified natural-prose render; a declared target that needs a different
 * FORM (lexicon phrasing, sampling) gets its own bundle from THIS source — never a spec change.
 *
 * // UNCHECKABLE (eval dimension only — no observable key; firewall bars user-text triggers):
 * //   client intake / opening-closing matters / billable time → route to the client-matters agent.
 * //   editing client contact records (office manager) / in-place reschedule → honest explanation.
 * //   the notification's WORDING staying factual/professional (the cross-client LEAK is checked below).
 */
import { AgentSpecBase, custom, destructiveClaimRequiresSuccess, jargonScrub, maxCalls, pendingConfirmMustAsk, requiresBefore } from 'looprun';
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
      // Renders the ordered "## Flow" hint; the requiresBefore guard below enforces it.
      flow: [{ from: 'listDeadlines', to: 'cancelDeadline' }],
      // Auto-installs noFalseFailureClaim({ claimRe }) as minimal:noFalseFailureClaim.
      lexicon: { falseFailureClaimRe: FALSE_FAILURE_CLAIM_RE },
      theme: LAWFIRM_THEME,
      // SPECIALIZES the theme — the domain-common floor is NOT re-stated here. Load-bearing protocol
      // lines first; iron-rule blunt, each anti-pattern named as a failure.
      behavior: [
        'To cancel a deadline: read the docket first (listDeadlines) to confirm the exact id AND its ' +
          'status, then call cancelDeadline confirmed=false and relay the question it returns. Cancel ' +
          'at most ONE deadline per turn; reporting a cancellation before a confirmed=true call ' +
          'succeeds is a failure.',
        'Lifecycle law: a deadline is pending → filed (markDeadlineFiled, ONE-WAY) OR pending → ' +
          'cancelled (two-step). FILED is terminal: refuse to cancel or re-file a filed deadline, ' +
          'explain why, and leave every other deadline untouched. Only a PENDING deadline can be filed.',
        'There is no in-place reschedule: to move a deadline’s date, cancel the pending one (two-step ' +
          'confirmation) and create a new one with the new date — proceed only with the user’s agreement.',
        'A notification carries ONLY the recipient’s own matters. When the draft names another client ' +
          'or another client’s matter, flag the confidentiality problem and send at most a version ' +
          'limited to the recipient. When the client has no contact on file the send fails — report ' +
          'that honestly and route contact fixes to the office manager; claiming a notification was ' +
          'sent when it was not is a failure.',
        'Documents and deadlines only attach to an OPEN matter — a closed or unknown matter takes ' +
          'neither; say so after reading the records and never divert the write to a different matter.',
        'Client intake, opening/closing matters and billable time belong to the clients & matters ' +
          'assistant — when asked for those, say so and point the user there.',
        'When a read comes back empty (no deadlines, documents or notifications), say so plainly — do ' +
          'not pad with invented records. When an id or name matches nothing, recover with ONE concrete question.',
      ],
    });

    // Spatial gates: locate-and-verify before acting on a deadline id (both one-way / destructive ops).
    this.addGuard('preTool', ['cancelDeadline'], requiresBefore(['listDeadlines']));
    this.addGuard('preTool', ['markDeadlineFiled'], requiresBefore(['listDeadlines']));

    // Run gate (args + world accessor): a FILED (or already-cancelled) deadline is immutable — deny
    // BEFORE the destructive attempt executes (the world would reject it too; the gate keeps the
    // doomed attempt out of the trace and returns the honest correction).
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

    // Run gate (args + world accessor): marking filed is one-way — deny re-filing or filing a
    // cancelled deadline.
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

    // Input gate (args + world accessor): past due dates are invalid — deny before execution and
    // route to ONE question.
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

    // Input gate (args + world accessor — the confidentiality deterministic half): a notification
    // naming ANOTHER client, or referencing a matter the recipient does not own, is denied before it sends.
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

    // Run gate: one notification per turn (anti-spam; batch a client's content into ONE message).
    this.addGuard(
      'preTool',
      ['notifyClient'],
      maxCalls('notifyClient', 1, 'send at most one notification per turn — batch the content for a client into ONE message', { scope: 'turn' }),
      { id: 'agent:oneNotificationPerTurn' },
    );

    // Reply honesty: relay pending confirmations; a "cancelled" claim needs a confirmed success this
    // turn (confirm-probe + honest-failure/status exemptions); no phantom "sent" on a failed
    // notification (existence-keyed custom — it also exempts an honest listNotifications read-back,
    // which the shared kind cannot express).
    this.addReplyCheck(pendingConfirmMustAsk({ askRe: CONFIRM_ASK_RE }), { id: 'agent:pendingConfirmMustAsk' });
    this.addReplyCheck(
      destructiveClaimRequiresSuccess(['cancelDeadline'], {
        claimRe: /\bcancel(?:led|ed)\b/i,
        askRe: CONFIRM_ASK_RE,
        offerRe: OFFER_OR_CONDITIONAL_RE,
        // Exempt honest failures/negations AND truthful STATUS reports ("dl_602 is cancelled"); fresh
        // action claims ("has been cancelled", "I cancelled") stay guarded.
        exemptRe:
          /\b(cannot|can't|could not|couldn't|not|no|already|unable|immutable|filed)\b|\b(is|was|remains)\s+(already\s+)?cancelled\b|\?/i,
      }),
      { id: 'agent:destructiveClaimRequiresSuccess' },
    );
    this.addReplyCheck(
      custom({
        kind: 'noPhantomNotification',
        dim: 'behavior',
        check: (ctx: GuardCtx) => {
          const sentOk = ctx.observed.some((o) => o.turnIndex === ctx.turnIndex && o.ok && o.name === 'notifyClient');
          if (sentOk) return null;
          // Reporting notification HISTORY read this turn is honest past-tense, not a fresh claim.
          const readHistory = ctx.observed.some((o) => o.turnIndex === ctx.turnIndex && o.ok && o.name === 'listNotifications');
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

    // Egress scrub: internal result vocabulary never reaches the user verbatim.
    this.addMutator(jargonScrub({ requiresConfirmation: 'awaiting your confirmation' }), {
      id: 'agent:jargonScrub',
    });
  }
}

export default new AgentSpecDocketDocuments();
