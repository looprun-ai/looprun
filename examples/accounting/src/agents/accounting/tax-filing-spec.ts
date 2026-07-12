/**
 * tax-filing — the compliance calendar and filings.
 *
 * Bucket: tax deadlines (list/register), preparing filings from the books, submitting prepared
 * filings, deadline reminders. Layer: AgentSpecBase — submitFiling carries the confirmed-flag
 * two-step protocol (confirmFirst + destructiveThrottle install from the layer).
 *
 * NOTE (gate design): the fiscal-regime gate's enabling tool (setFiscalRegime) deliberately lives
 * in the client-records agent, NOT here — this agent cannot satisfy its own precondition, so the
 * deny prose routes the USER instead of inviting the model to fabricate a regime.
 *
 * // UNCHECKABLE: no tax-planning/evasion advice (never recommend shifting/re-dating recorded
 * //              transactions); defer to a qualified accountant — conditioned prose + eval
 * //              dimension only (case 22).
 * // UNCHECKABLE: claims about PAST reminders are unverifiable (there is no reminder log) — the
 * //              reply must say it cannot verify them — conditioned prose; the eval dimension is
 * //              exercised in the billing bucket (case 15).
 */
import { AgentSpecBase, custom, jargonScrub, noFalseFailureClaim } from 'looprun';
import { FALSE_FAILURE_CLAIM_RE, destructiveClaimRequiresAttemptedSuccess, pendingConfirmUnlessResolved } from './guards.js';
import { ACCOUNTING_THEME } from './theme.js';

/** The per-id state reads the tax gates need (world accessors via the ctx closure). */
type TaxStateReader = {
  deadlineClient?: (deadlineId: string) => string | null;
  clientRegime?: (clientId: string) => string | null;
  filingStatus?: (deadlineId: string) => string | null;
};

export class AgentSpecTaxFiling extends AgentSpecBase {
  constructor() {
    super({
      id: 'tax-filing',
      mode: 'TAX_FILING',
      persona:
        'You are the tax-filing agent: the compliance calendar of deadlines, preparing filings ' +
        'from the recorded books, and submitting prepared filings to the tax authority.',
      tools: [
        'listClients',
        'getClient',
        'listTaxDeadlines',
        'createTaxDeadline',
        'cancelTaxDeadline',
        'prepareFiling',
        'submitFiling',
        'sendClientNotification',
      ],
      destructiveTools: ['submitFiling', 'cancelTaxDeadline'],
      theme: ACCOUNTING_THEME,
      behavior: [
        'When asked about deadlines or filing status, read listTaxDeadlines first and report exactly what it returns — flag overdue deadlines plainly; never soften or invent a status.',
        'When the user asks to prepare a filing, the deadline is identifiable, and the filing is not yet prepared or submitted, prepare it directly this turn (preparation is not destructive) and report the computed figures exactly as returned; when it is already prepared, say so and ask whether to submit; when it was already submitted, cite the receipt — never re-prepare it.',
        'When a filing is prepared and the user asks to submit, relay the submission-confirmation question and stop — submission is final and happens ONLY after the user agrees in a later turn.',
        "When tax work is blocked because the client's fiscal regime is not on record, tell the user the regime must be provided and put on record through the client-records workflow first — never guess a regime, and never present the filing as prepared or submitted.",
        'When a filing was already submitted, say so and cite the receipt on record — a filing can never be submitted twice.',
        'When the user asks to register a new deadline and gives tax, period, and due date, register it directly and confirm the new deadline id; when a deadline for the same client, tax, and period already exists, report the duplicate instead.',
        'When the user asks to cancel a mis-registered deadline and its filing has not been started, relay the cancellation-confirmation question and stop until the user approves in a later turn; when the filing is already prepared or submitted, say the deadline can no longer be cancelled.',
        'When sending a deadline reminder, read listTaxDeadlines first and quote only the real deadline, due date, and filing status in the message.',
        'When asked whether a reminder was already sent before this conversation, say that past reminders cannot be verified (there is no reminder log) — never claim one was or was not sent.',
        'When asked for tax-planning or tax-minimization advice, decline and defer to a qualified accountant — the recorded books keep their real dates and amounts.',
        'When a request needs bookkeeping entries, client onboarding, or invoices, say the client-records or billing assistant handles it.',
        'If a tool fails, report the real error briefly — never claim success that did not happen.',
        'When a message is garbled or missing a needed detail, recover with ONE concrete clarifying question.',
      ],
    });

    // Run gate: tax work needs the client's fiscal regime on record. The deny routes the USER
    // (the enabling tool lives in another agent — see the header note). Unknown deadline ids fall
    // through to the world's honest error.
    this.addGuard(
      'preTool',
      ['prepareFiling', 'submitFiling'],
      custom({
        kind: 'regimeOnRecord',
        dim: 'run',
        check: (ctx) => {
          const w = ctx.world as TaxStateReader;
          const deadlineId = typeof ctx.args.deadlineId === 'string' ? ctx.args.deadlineId : '';
          const clientId = w.deadlineClient?.(deadlineId) ?? null;
          if (!clientId) return null; // unknown deadline → world reports it honestly
          const regime = w.clientRegime?.(clientId) ?? null;
          if (regime !== null) return null;
          return (
            `Client ${clientId} has NO fiscal regime on record, so tax work on ${deadlineId} is blocked. ` +
            'Tell the user the regime must be provided and put on record via the client-records workflow first — do NOT guess a regime.'
          );
        },
        prose: () => "preparing or submitting needs the client's fiscal regime on record — when it is missing, ask the user to provide it and have it put on record via the client-records workflow (never guess one)",
      }),
      { id: 'agent:regimeOnRecord' },
    );

    // Run gate: a submitted filing is FINAL — it can be neither re-prepared nor re-submitted.
    this.addGuard(
      'preTool',
      ['prepareFiling'],
      custom({
        kind: 'noRePrepareSubmitted',
        dim: 'run',
        check: (ctx) => {
          const w = ctx.world as TaxStateReader;
          const deadlineId = typeof ctx.args.deadlineId === 'string' ? ctx.args.deadlineId : '';
          const status = w.filingStatus?.(deadlineId) ?? null;
          return status === 'submitted'
            ? `${deadlineId} was ALREADY submitted — a submitted filing can never be re-prepared. Tell the user, citing the receipt from listTaxDeadlines.`
            : null;
        },
        prose: () => 'a submitted filing can never be re-prepared — when it was already submitted, say so and cite the receipt',
      }),
      { id: 'agent:noRePrepareSubmitted' },
    );

    // Run gate: a deadline is cancellable ONLY while its filing is not started.
    this.addGuard(
      'preTool',
      ['cancelTaxDeadline'],
      custom({
        kind: 'cancelOnlyUnstarted',
        dim: 'run',
        check: (ctx) => {
          const w = ctx.world as TaxStateReader;
          const deadlineId = typeof ctx.args.deadlineId === 'string' ? ctx.args.deadlineId : '';
          const status = w.filingStatus?.(deadlineId) ?? null;
          if (status === null || status === 'not_started') return null; // unknown → world reports honestly
          return `${deadlineId} cannot be cancelled — its filing is already ${status === 'submitted' ? 'submitted' : 'prepared'}. Tell the user the deadline can no longer be cancelled.`;
        },
        prose: () => 'a deadline can be cancelled only while its filing is not started — once prepared or submitted, say it can no longer be cancelled',
      }),
      { id: 'agent:cancelOnlyUnstarted' },
    );

    // Run gate: only a PREPARED filing can be submitted.
    this.addGuard(
      'preTool',
      ['submitFiling'],
      custom({
        kind: 'filingMustBePrepared',
        dim: 'run',
        check: (ctx) => {
          const w = ctx.world as TaxStateReader;
          const deadlineId = typeof ctx.args.deadlineId === 'string' ? ctx.args.deadlineId : '';
          const status = w.filingStatus?.(deadlineId) ?? null;
          if (status === 'submitted') {
            return `${deadlineId} was ALREADY submitted — tell the user, citing the receipt from listTaxDeadlines; a filing can never be submitted twice.`;
          }
          if (status === 'not_started') {
            return `${deadlineId} is not prepared yet — prepare the filing first (prepareFiling), then relay the submission confirmation.`;
          }
          return null;
        },
        prose: () => 'only a prepared filing can be submitted — when it was already submitted, say so and cite the receipt instead',
      }),
      { id: 'agent:filingMustBePrepared' },
    );

    // Reply honesty — attempt-keyed + resolution-aware local factories (see ./guards.ts).
    this.addReplyCheck(pendingConfirmUnlessResolved(), { id: 'agent:pendingConfirmUnlessResolved' });
    this.addReplyCheck(
      destructiveClaimRequiresAttemptedSuccess(
        ['submitFiling', 'cancelTaxDeadline'],
        /\b(?:submitted|filed|cancell?ed)\b/i,
        /\b(?:already|cannot|can['’]?t|could not|couldn['’]?t|not|unable|hasn['’]?t|haven['’]?t|isn['’]?t|wasn['’]?t|yet|pending|overdue)\b/i,
      ),
      { id: 'agent:destructiveClaimRequiresAttemptedSuccess' },
    );
    this.addReplyCheck(noFalseFailureClaim({ claimRe: FALSE_FAILURE_CLAIM_RE }), { id: 'agent:noFalseFailureClaim' });

    this.addMutator(jargonScrub({ not_started: 'not started' }), { id: 'agent:jargonScrub' });
  }
}

export default new AgentSpecTaxFiling();
