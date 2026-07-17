/**
 * tax-filing — the compliance calendar and filings.
 *
 * Bucket: tax deadlines (list/register/cancel), preparing filings from the books, submitting prepared
 * filings, deadline reminders. AgentSpecBase installs the confirm-first + throttle protocol on
 * submitFiling and cancelTaxDeadline; noFalseFailureClaim installs from cfg.lexicon.falseFailureClaimRe.
 *
 * NOTE (gate design): the fiscal-regime gate's enabling tool (setFiscalRegime) deliberately lives in
 * the client-records agent, NOT here — this agent cannot satisfy its own precondition, so the deny
 * prose routes the USER instead of inviting the model to fabricate a regime.
 *
 * // UNCHECKABLE: no tax-planning/evasion advice (never recommend shifting/re-dating recorded
 * //              transactions); defer to a qualified accountant — theme invariant + eval dimension
 * //              only (case 22).
 * // UNCHECKABLE: claims about reminders sent before this conversation are unverifiable (no reminder
 * //              log) — theme invariant + eval dimension (exercised in the billing bucket, case 15).
 */
import { AgentSpecBase, custom, destructiveClaimRequiresSuccess, jargonScrub, pendingConfirmMustAsk } from 'looprun';
import { CONFIRM_ASK_RE, CONFIRM_LANG_RE, FALSE_FAILURE_CLAIM_RE, HONEST_FAILURE_RE, OFFER_OR_CONDITIONAL_RE } from './lexicon.js';
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
      lexicon: { falseFailureClaimRe: FALSE_FAILURE_CLAIM_RE },
      theme: ACCOUNTING_THEME,
      behavior: [
        // Load-bearing lifecycle-law lines first. Each SPECIALIZES a theme invariant — none re-declares one.
        'A filing moves from not started, to prepared, to submitted, and submission is FINAL: a submitted filing can never be re-prepared or submitted again — cite its receipt instead.',
        'A registered deadline can be cancelled ONLY while its filing is not started; once the filing is prepared or submitted, say the deadline can no longer be cancelled.',
        "When tax work is blocked because the client's fiscal regime is not on record, tell the user the regime must be provided and put on record through the client-records workflow first — never guess one, and never present the filing as prepared or submitted.",
        'When a deadline is identifiable and its filing is not yet prepared or submitted, prepare it this turn with prepareFiling (preparation is not destructive) and report the computed figures exactly as returned; when it is already prepared, say so and ask whether to submit.',
        'When a filing is prepared and the user asks to submit, probe submitFiling, relay the submission-confirmation question, and stop — submission happens only after the user agrees in a later turn.',
        'When the user asks to register a deadline and gives tax, period, and due date, call createTaxDeadline directly and confirm the new tax_ id; when one for the same client, tax, and period already exists, report the duplicate instead.',
        'When the user asks to cancel a mis-registered deadline whose filing is not started, probe cancelTaxDeadline, relay the confirmation question, and stop.',
        'When asked about deadlines, filing status, or a deadline reminder, read listTaxDeadlines first: report exactly what it returns, flag overdue deadlines plainly, and quote only the real deadline, due date, and filing status in a reminder (a reminder is single-step).',
        'When a request needs bookkeeping entries, client onboarding, or invoices, say the client-records or billing assistant handles it.',
        'When a required detail is missing or garbled, ask ONE concrete question before calling any write.',
      ],
    });

    // Run gate: tax work needs the client's fiscal regime on record. The deny routes the USER (the
    // enabling tool lives in another agent — see the header note). Unknown deadline ids fall through
    // to the world's honest error.
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

    // Reply honesty — attempt-keyed, confirm-probe / offer / honest-failure aware. noFalseFailureClaim
    // auto-installed via cfg.lexicon.
    this.addReplyCheck(pendingConfirmMustAsk({ askRe: CONFIRM_ASK_RE }), { id: 'agent:pendingConfirmMustAsk' });
    this.addReplyCheck(
      destructiveClaimRequiresSuccess(['submitFiling', 'cancelTaxDeadline'], {
        claimRe: /\b(?:submitted|filed|cancell?ed)\b/i,
        askRe: CONFIRM_LANG_RE,
        offerRe: OFFER_OR_CONDITIONAL_RE,
        exemptRe: HONEST_FAILURE_RE,
      }),
      { id: 'agent:destructiveClaimRequiresSuccess' },
    );

    this.addMutator(jargonScrub({ not_started: 'not started' }), { id: 'agent:jargonScrub' });
  }
}

export default new AgentSpecTaxFiling();
