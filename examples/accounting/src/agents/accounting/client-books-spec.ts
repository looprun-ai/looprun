/**
 * client-books — client records + the append-only books.
 *
 * Bucket: client onboarding/contacts, fiscal regimes, bookkeeping entries (record/reverse/list),
 * account summaries. Layer: AgentSpecBase because reverseEntry carries the confirmed-flag
 * two-step protocol (confirmFirst + destructiveThrottle install from the layer — never re-add).
 *
 * // UNCHECKABLE: when an unknown client is named, never invent contact details or create a
 * //              client unasked — conditioned prose + eval dimension only (case 06).
 * // UNCHECKABLE: never set a fiscal regime the user did not state (the value is user-provided
 * //              knowledge) — conditioned prose + eval dimension only (cases 01/04).
 * // UNCHECKABLE: never execute a books-reshaping request meant to change a tax outcome
 * //              (re-dating/reshaping recorded transactions) — conditioned prose; the eval
 * //              covers the advice side (case 22); the execution-side probe is a logged
 * //              residual gap (REVIEW.md).
 */
import { AgentSpecBase, custom, destructiveClaimRequiresSuccess, jargonScrub, pendingConfirmMustAsk } from 'looprun';
import { CONFIRM_ASK_RE, CONFIRM_LANG_RE, FALSE_FAILURE_CLAIM_RE, OFFER_OR_CONDITIONAL_RE } from './lexicon.js';
import { ACCOUNTING_THEME } from './theme.js';

/** The per-id state reads the reversal gate needs (world accessors via the ctx closure). */
type EntryStateReader = { hasEntry?: (entryId: string) => boolean; entryReversed?: (entryId: string) => boolean };

export class AgentSpecClientBooks extends AgentSpecBase {
  constructor() {
    super({
      id: 'client-books',
      mode: 'CLIENT_BOOKS',
      // REQUIRED per-agent persona (persona-on-spec law) — rendered as the FIRST Behavior bullet.
      persona:
        'You are the client-records and bookkeeping agent: client onboarding and contact details, ' +
        'fiscal regimes, and the append-only books (entries, reversals, account summaries).',
      tools: [
        'listClients',
        'getClient',
        'createClient',
        'updateClient',
        'setFiscalRegime',
        'recordEntry',
        'reverseEntry',
        'listEntries',
        'getAccountSummary',
      ],
      destructiveTools: ['reverseEntry'],
      // Reply-honesty invariant auto-installed as minimal:noFalseFailureClaim (see installMinimal).
      lexicon: { falseFailureClaimRe: FALSE_FAILURE_CLAIM_RE },
      theme: ACCOUNTING_THEME,
      behavior: [
        // Every line CONDITIONED (Bucket-A): "when X, do Y" — never a bare state assertion.
        'When the user names a client in words, resolve the exact client id first (listClients); when no matching client is on record, say so and recover with ONE concrete question (e.g. whether to add them) — never create a client the user did not ask for, and never invent contact details.',
        'When the user asks to add a client and gives the details, create the record directly and confirm the new id; when the fiscal regime was not stated, note that it still needs to be provided — do not guess one.',
        'When the user states a client’s fiscal regime or new contact details, put them on record directly this turn (setFiscalRegime / updateClient need no confirmation round) — but only with the values the user actually stated.',
        'When the user asks to record an entry and the client, kind, amount, and date are clear, record it this turn — do not ask permission for the requested entry itself.',
        'When reporting from the books (entries, summaries), state exactly the figures the tools returned; when a period has no entries, say plainly that nothing is recorded — never fill the gap with estimates.',
        'When a recorded entry is wrong and has not been reversed yet, the only fix is a reversal (reversals are audited — pass the user\'s stated reason): relay the confirmation question reverseEntry returns and stop until the user approves in a later turn; when it was already reversed, say so — an entry is reversed at most once.',
        'When asked to re-date, reshape, or re-record entries so a tax or reporting outcome looks different, decline — recorded transactions keep their real dates and amounts; refer the question to a qualified accountant.',
        'When a request needs invoices, payments, or tax filings, say the billing or tax-filing assistant handles it — do not improvise a substitute with bookkeeping tools.',
        'If a tool fails, report the real error briefly — never claim success that did not happen.',
        'When a message is garbled or missing a needed detail, recover with ONE concrete clarifying question instead of guessing — NEVER infer an amount, date or description from unreadable characters (e.g. "4??" is NOT an amount): if any required field of a write is uncertain, do not call the write at all; ask first.',
      ],
    });

    // Run gate (deterministic, state-keyed): an entry is reversible at most ONCE — decidable from
    // the world before execution. Unknown entry ids fall through to the world's honest error.
    this.addGuard(
      'preTool',
      ['reverseEntry'],
      custom({
        kind: 'entryReversedOnce',
        dim: 'run',
        check: (ctx) => {
          const w = ctx.world as EntryStateReader;
          const id = typeof ctx.args.entryId === 'string' ? ctx.args.entryId : '';
          if (!w.hasEntry?.(id)) return null; // unknown entry → world reports it honestly
          return w.entryReversed?.(id)
            ? `${id} was already reversed — an entry can be reversed only once. Tell the user; do not reverse it again.`
            : null;
        },
        prose: () => 'an entry can be reversed at most once — when it was already reversed, say so instead of reversing again',
      }),
      { id: 'agent:entryReversedOnce' },
    );

    // Reply honesty (behavior dim) — the shared kinds are now attempt-keyed
    // (destructiveClaimRequiresSuccess) and resolution-aware (pendingConfirmMustAsk), subsuming the former
    // local variants. Claim-check probe-relay uses CONFIRM_LANG_RE (no bare `?`); must-ask uses CONFIRM_ASK_RE.
    this.addReplyCheck(pendingConfirmMustAsk({ askRe: CONFIRM_ASK_RE }), { id: 'agent:pendingConfirmMustAsk' });
    this.addReplyCheck(
      destructiveClaimRequiresSuccess(['reverseEntry'], {
        claimRe: /\brevers(?:ed|al (?:was |has been )?(?:made|posted|recorded))\b/i,
        askRe: CONFIRM_LANG_RE,
        offerRe: OFFER_OR_CONDITIONAL_RE,
        exemptRe: /\b(?:already|cannot|can['’]?t|could not|couldn['’]?t|not|unable|hasn['’]?t|haven['’]?t|isn['’]?t|wasn['’]?t|yet|pending)\b/i,
      }),
      { id: 'agent:destructiveClaimRequiresSuccess' },
    );

    // Deterministic egress rewrite of internal enum spellings.
    this.addMutator(jargonScrub({ cash_basis: 'cash basis' }), { id: 'agent:jargonScrub' });
  }
}

export default new AgentSpecClientBooks();
