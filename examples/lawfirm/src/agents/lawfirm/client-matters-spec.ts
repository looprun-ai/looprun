/**
 * client-matters — clients, conflict checks, matter lifecycle (open/close) and billable time.
 *
 * Bucket: intake (conflict check → register → open), matter reads, record/bill time, and the
 * destructive close-matter flow (bill → close stays whole inside THIS agent — flow-in-one-agent).
 * Layer: AgentSpecBase because closeMatter carries the confirmed-flag protocol (confirmFirst +
 * destructiveThrottle install from `destructiveTools`).
 *
 * // UNCHECKABLE: legal-advice/strategy requests → decline & defer to the responsible attorney
 * //              (no observable key; theme invariant + conditioned prose + eval dimension).
 * // UNCHECKABLE: deadline/notification requests belong to the docket-documents agent → say so
 * //              (routing keys on user intent, firewalled; conditioned prose + eval case 10).
 * // UNCHECKABLE: out-of-scope asks — editing client contact records (office manager) and
 * //              deleting/correcting time entries (billing partner) → honest refusal + routing
 * //              (intent-keyed; conditioned prose + eval dimension, cases 09/18 rubric items).
 */
import { AgentSpecBase, custom, destructiveClaimRequiresSuccess, jargonScrub, pendingConfirmMustAsk, requiresBefore } from 'looprun';
import type { GuardCtx } from 'looprun';
import { LAWFIRM_THEME } from './theme.js';
import { CONFIRM_ASK_RE, FALSE_FAILURE_CLAIM_RE, OFFER_OR_CONDITIONAL_RE } from './lexicon.js';

export class AgentSpecClientMatters extends AgentSpecBase {
  constructor() {
    super({
      id: 'client-matters',
      mode: 'CLIENT_MATTERS',
      // REQUIRED per-agent persona (persona-on-spec law) — rendered as the FIRST Behavior bullet.
      persona:
        'You are the clients & matters agent: client intake with conflict checks, the matter ' +
        'lifecycle (open and close), and billable time on matters.',
      tools: [
        'createClient',
        'listClients',
        'getClient',
        'runConflictCheck',
        'openMatter',
        'closeMatter',
        'listMatters',
        'getMatter',
        'recordTimeEntry',
        'listTimeEntries',
        'markTimeEntriesBilled',
      ],
      destructiveTools: ['closeMatter'],
      flow: [{ from: 'runConflictCheck', to: 'openMatter' }],
      // Reply-honesty invariant auto-installed as minimal:noFalseFailureClaim (see installMinimal).
      lexicon: { falseFailureClaimRe: FALSE_FAILURE_CLAIM_RE },
      theme: LAWFIRM_THEME,
      behavior: [
        // NO persona line here — the runtime prepends the persona field above.
        'Act directly on the requested non-destructive action (register a client, open a matter ' +
          'after the conflict check, record time, bill hours the user asked to bill) — never ask ' +
          'permission for what the user already requested.',
        'Before opening any matter, run runConflictCheck for the parties involved; when it finds ' +
          'adversity, decline the engagement honestly, name the conflicting record, and open nothing.',
        'To close a matter: when the exact matterId is not given, locate it first (listMatters or ' +
          'getMatter); when the close tool returns a confirmation question, relay it to the user ' +
          'and STOP until they explicitly agree in a later turn.',
        'When closing is blocked by unbilled hours, report the exact unbilled amount and ASK the ' +
          'user whether to bill the entries first — never mark time billed unless the user asked for it.',
        'When asked to bill a matter, review its entries first (listTimeEntries), then mark them ' +
          'billed and report the exact hours total.',
        'When a client or matter the user names does not exist or is closed, read the records, say ' +
          'so plainly, and never act on a DIFFERENT record than the one the user named.',
        'When a read comes back empty (no clients, matters or time entries match), say "none ' +
          'found" honestly — never pad the answer with invented records.',
        "Court/filing deadlines, documents and client notifications are the docket & documents " +
          "assistant's job — when asked for those, say so and point the user there instead of improvising.",
        'This assistant cannot edit client contact records or delete/correct time entries — when ' +
          'asked, say so and route the user to the office manager (contacts) or the billing ' +
          'partner (time entries).',
        'When a message is garbled or a name matches nothing on record, recover with ONE concrete ' +
          'clarifying question.',
        'If an action fails, report the REAL error briefly — never claim success that did not happen.',
      ],
    });

    // Spatial gate (firm policy the world does not enforce): every matter opening is preceded by
    // a conflict check THIS conversation.
    this.addGuard('preTool', ['openMatter'], requiresBefore(['runConflictCheck']));

    // Spatial gate: billing reviews the entries first (the tool description's protocol).
    this.addGuard('preTool', ['markTimeEntriesBilled'], requiresBefore(['listTimeEntries']));

    // Input gate: hours must be inside the world's valid range (mirrors the schema bounds).
    this.addGuard(
      'preTool',
      ['recordTimeEntry'],
      custom({
        kind: 'hoursInRange',
        dim: 'input',
        check: (ctx: GuardCtx) => {
          const hours = ctx.args.hours;
          if (typeof hours !== 'number' || !Number.isFinite(hours)) return null; // arg shape is the schema's job
          return hours < 0.1 || hours > 24
            ? `hours must be between 0.1 and 24 (got ${hours}) — ask the user for the correct amount; record nothing yet`
            : null;
        },
        prose: () => 'a time entry needs hours between 0.1 and 24 — when the amount is outside that range, ask for the correct one',
      }),
      { id: 'agent:hoursInRange' },
    );

    // Anti-laundering gate (run dim): when a close of THIS matter was just blocked (failed
    // closeMatter this turn, same matterId), billing is a USER decision — deny the same-turn
    // self-service billing and route the question to the user. An explicit "bill then close"
    // request bills FIRST (no failed close yet this turn), so the legal sibling flow is untouched.
    this.addGuard(
      'preTool',
      ['markTimeEntriesBilled'],
      custom({
        kind: 'billingIsUserDecision',
        dim: 'run',
        check: (ctx: GuardCtx) => {
          const matterId = typeof ctx.args.matterId === 'string' ? ctx.args.matterId : '';
          const closeBlockedThisTurn = ctx.observed.some(
            (o) =>
              o.turnIndex === ctx.turnIndex &&
              o.name === 'closeMatter' &&
              !o.ok &&
              (o.args as { matterId?: unknown } | undefined)?.matterId === matterId,
          );
          return closeBlockedThisTurn
            ? "A close attempt for this matter was just denied this turn — billing is the user's " +
                'decision. Report why the close did not go through and ASK before billing; once ' +
                'the user approves billing, bill FIRST and only then re-attempt the close. Do ' +
                'not bill on your own to clear the close gate.'
            : null;
        },
        prose: () =>
          'when a close attempt was blocked by unbilled hours this turn, ask the user before billing — never bill just to clear the gate',
      }),
      { id: 'agent:billingIsUserDecision' },
    );

    // Reply honesty: a pending confirmation must be relayed; "closed" claims need a confirmed
    // success this turn (confirm-probe and honest-failure phrasings exempt).
    this.addReplyCheck(pendingConfirmMustAsk({ askRe: CONFIRM_ASK_RE }), { id: 'agent:pendingConfirmMustAsk' });
    this.addReplyCheck(
      destructiveClaimRequiresSuccess(['closeMatter'], {
        claimRe: /\bmatter\b[^.!?\n]{0,60}\bclosed\b|\bclosed\b[^.!?\n]{0,60}\bmatter\b/i,
        askRe: CONFIRM_ASK_RE,
        offerRe: OFFER_OR_CONDITIONAL_RE,
        // Exempt honest failures/negations AND truthful STATUS reports ("m_4001 is closed") —
        // fresh-action claims ("is now closed", "has been closed") stay guarded.
        exemptRe: /\b(cannot|can't|could not|couldn't|not|no|already|unable|blocked|before|must)\b|\b(is|was|remains)\s+(already\s+)?closed\b|\?/i,
      }),
      { id: 'agent:destructiveClaimRequiresSuccess' },
    );

    // Egress scrub: internal result vocabulary never reaches the user verbatim.
    this.addMutator(jargonScrub({ requiresConfirmation: 'awaiting your confirmation' }), {
      id: 'agent:jargonScrub',
    });
  }
}

export default new AgentSpecClientMatters();
