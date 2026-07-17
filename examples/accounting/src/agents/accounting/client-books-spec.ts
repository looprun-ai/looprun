/**
 * client-books — client records + the append-only books.
 *
 * Bucket: client onboarding/contacts, fiscal regimes, bookkeeping entries (record/reverse/list),
 * account summaries. AgentSpecBase installs the confirm-first + throttle protocol on reverseEntry
 * (the sole destructive tool); the always-on reply-honesty invariant (noFalseFailureClaim) installs
 * from cfg.lexicon.falseFailureClaimRe — never re-add either.
 *
 * // UNCHECKABLE: when an unknown client is named, never invent contact details or create a client
 * //              unasked — conditioned prose + eval dimension only (case 06).
 * // UNCHECKABLE: never set a fiscal regime the user did not state (the value is user-provided
 * //              knowledge) — conditioned prose + eval dimension only (cases 01/04).
 * // UNCHECKABLE: never execute a books-reshaping request meant to change a tax outcome (re-dating/
 * //              reshaping recorded transactions) — conditioned prose; the eval covers the advice
 * //              side (case 22); the execution-side probe is a logged residual gap (REVIEW.md).
 */
import { AgentSpecBase, custom, destructiveClaimRequiresSuccess, jargonScrub, pendingConfirmMustAsk } from 'looprun';
import { CONFIRM_ASK_RE, CONFIRM_LANG_RE, FALSE_FAILURE_CLAIM_RE, HONEST_FAILURE_RE, OFFER_OR_CONDITIONAL_RE } from './lexicon.js';
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
      // Auto-installs the always-on noFalseFailureClaim (attempt-context claimRe — see lexicon.ts).
      lexicon: { falseFailureClaimRe: FALSE_FAILURE_CLAIM_RE },
      theme: ACCOUNTING_THEME,
      behavior: [
        // Load-bearing lines first (after the runtime-prepended persona). Each SPECIALIZES a theme
        // invariant — it never re-declares one.
        'To fix a wrong entry the only tool is reverseEntry, and it needs the reason the user gives (reversals are audited); if the entry was already reversed, say so and stop — an entry reverses at most once.',
        'When a write is missing or has a garbled required field, ask ONE concrete question first — never infer an amount, date, or description from unreadable characters ("4??" is a question to ask, not an amount). Calling a write with a guessed field is a failure.',
        'When the user names a client in words, resolve the exact id with listClients before acting; if none matches, say so and ask ONE concrete question (e.g. whether to add them) — do not create a client unasked and do not invent contact details.',
        'When the user asks to add a client and gives the details, call createClient directly and confirm the new cli_ id; if they did not state a fiscal regime, note it still needs to be provided and do not set one.',
        "When the user states a client's new contact details or fiscal regime, put them on record this turn (updateClient / setFiscalRegime take no confirmation round) — using only the values the user actually stated.",
        'When the client, kind (income or expense), amount, and date of an entry are all clear, call recordEntry this turn.',
        'When reporting entries or an account summary, quote exactly the figures listEntries / getAccountSummary return; if a period has none, say plainly that nothing is recorded.',
        'When asked to re-date, reshape, or re-record entries so a tax or reporting outcome looks different, decline and refer the question to a qualified accountant.',
        'When a request needs invoices, payments, or tax filings, say the billing or tax-filing assistant handles it — do not improvise with bookkeeping tools.',
      ],
    });

    // Run gate (deterministic, state-keyed): an entry is reversible at most ONCE — decidable from the
    // world before execution. Unknown entry ids fall through to the world's own honest error.
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

    // Reply honesty (behavior dim). pendingConfirmMustAsk relays a pending probe (askRe accepts a bare
    // `?`); destructiveClaimRequiresSuccess is attempt-keyed — it fires only when reverseEntry was tried
    // this turn and did not take effect, and exempts confirm-language relays (CONFIRM_LANG_RE, no bare
    // `?`), offers, and honest failure/negation reports. noFalseFailureClaim auto-installed via cfg.lexicon.
    this.addReplyCheck(pendingConfirmMustAsk({ askRe: CONFIRM_ASK_RE }), { id: 'agent:pendingConfirmMustAsk' });
    this.addReplyCheck(
      destructiveClaimRequiresSuccess(['reverseEntry'], {
        claimRe: /\brevers(?:ed|al (?:was |has been )?(?:made|posted|recorded))\b/i,
        askRe: CONFIRM_LANG_RE,
        offerRe: OFFER_OR_CONDITIONAL_RE,
        exemptRe: HONEST_FAILURE_RE,
      }),
      { id: 'agent:destructiveClaimRequiresSuccess' },
    );

    // Deterministic egress rewrite of internal enum spellings.
    this.addMutator(jargonScrub({ cash_basis: 'cash basis' }), { id: 'agent:jargonScrub' });
  }
}

export default new AgentSpecClientBooks();
