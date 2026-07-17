/**
 * client-matters — clients, conflict checks, matter lifecycle (open/close) and billable time.
 *
 * Bucket: intake (conflict check → register → open), matter reads, record/bill time, and the
 * destructive close-matter flow. The full close flow (review → bill → close) stays whole inside THIS
 * agent (flow-in-one-agent), so a gate is never split across agents.
 * Layer: the one AgentSpecBase — closeMatter is listed in `destructiveTools`, so the constructor
 * auto-installs confirmFirst + destructiveThrottle on it (and, from `lexicon`, noFalseFailureClaim).
 *
 * PROFILES (convention): RULES + GUARDS are the single source of truth and never fork per model. The
 * DEFAULT profile is this certified natural-prose render; a declared target that needs a different
 * FORM (lexicon phrasing, sampling) gets its own bundle from THIS source — never a spec change.
 *
 * // UNCHECKABLE (eval dimension only — no observable key; firewall bars user-text triggers):
 * //   legal-advice/strategy → decline & defer to the responsible attorney (theme invariant + prose).
 * //   deadline/document/notification requests → route to the docket-documents agent (intent-keyed).
 * //   editing client contacts (office manager) / deleting-correcting time entries (billing partner)
 * //   → honest refusal + routing (intent-keyed; conditioned prose + eval rubric).
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
      // Renders the ordered "## Flow" hint; the requiresBefore guard below enforces it.
      flow: [{ from: 'runConflictCheck', to: 'openMatter' }],
      // Auto-installs noFalseFailureClaim({ claimRe }) as minimal:noFalseFailureClaim.
      lexicon: { falseFailureClaimRe: FALSE_FAILURE_CLAIM_RE },
      theme: LAWFIRM_THEME,
      // SPECIALIZES the theme — the domain-common floor (anti-fabrication, id/name→id, two-step,
      // act-directly, confidentiality, walls, state-wins, honesty) is NOT re-stated here. Load-bearing
      // protocol lines first; iron-rule blunt, each anti-pattern named as a failure.
      behavior: [
        'Before opening ANY matter, run runConflictCheck for the parties FIRST — firm policy, every ' +
          'time. When it reports adversity, decline the engagement, name the conflicting matter or ' +
          'client, and open nothing; opening anyway is a failure. A clear check is what unlocks openMatter.',
        'To close a matter: resolve the exact matterId first (listMatters / getMatter) when it was ' +
          'named loosely, then call closeMatter confirmed=false and relay the question it returns — ' +
          'do not report the matter closed until a confirmed=true call succeeds.',
        'When a close is blocked by unbilled hours, report the exact unbilled amount and ASK whether ' +
          'to bill first — billing is the user’s decision. Billing time yourself just to clear your ' +
          'own close gate is a failure; bill only when the user asked, and only then re-attempt the close.',
        'When the user asks to bill a matter, review its entries first (listTimeEntries), then ' +
          'markTimeEntriesBilled and report the exact hours total.',
        'Lifecycle law: a matter is OPEN or CLOSED — a CLOSED matter is terminal here (no new time, ' +
          'and it cannot be re-opened); a time entry goes recorded → billed, and billing is ONE-WAY ' +
          '(un-billing and corrections go through the billing partner).',
        'Deadlines, documents and client notifications belong to the docket & documents assistant; ' +
          'editing client contact records is the office manager’s job and deleting/correcting time ' +
          'entries is the billing partner’s — when asked for any of these, say so plainly and point ' +
          'the user there instead of improvising.',
        'When a named client or matter matches nothing on record, or a message is garbled, recover ' +
          'with ONE concrete clarifying question — never act on a DIFFERENT record than the one named.',
      ],
    });

    // Spatial gate (firm policy the world does not enforce): a matter opening is preceded by a
    // conflict check THIS conversation. Paired with the rendered Flow hint above.
    this.addGuard('preTool', ['openMatter'], requiresBefore(['runConflictCheck']));

    // Spatial gate: billing reviews the entries first (the tool description's protocol).
    this.addGuard('preTool', ['markTimeEntriesBilled'], requiresBefore(['listTimeEntries']));

    // Input gate (args-keyed): hours must be inside the world's valid range — pre-empt with ONE
    // question rather than round-trip a rejected write.
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
        prose: () =>
          'a time entry needs hours between 0.1 and 24 — when the amount is outside that range, ask for the correct one',
      }),
      { id: 'agent:hoursInRange' },
    );

    // Run gate (args + observed accessor): when a close of THIS matter was just blocked (failed
    // closeMatter this turn, same matterId), billing is a USER decision — deny same-turn self-service
    // billing and route the question to the user. An explicit "bill then close" bills FIRST (no failed
    // close yet this turn), so the legitimate sibling flow is untouched.
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
            ? 'A close attempt for this matter was just denied this turn — billing is the user’s ' +
                'decision. Report why the close did not go through and ASK before billing; once the ' +
                'user approves, bill FIRST and only then re-attempt the close. Do not bill on your own ' +
                'to clear the close gate.'
            : null;
        },
        prose: () =>
          'when a close was just blocked by unbilled hours this turn, ask the user before billing — never bill only to clear the gate',
      }),
      { id: 'agent:billingIsUserDecision' },
    );

    // Reply honesty: relay any pending confirmation; a "closed" claim needs a confirmed success this
    // turn (confirm-probe + honest-failure/status phrasings exempt). noFalseFailureClaim auto-installs
    // from the lexicon above.
    this.addReplyCheck(pendingConfirmMustAsk({ askRe: CONFIRM_ASK_RE }), { id: 'agent:pendingConfirmMustAsk' });
    this.addReplyCheck(
      destructiveClaimRequiresSuccess(['closeMatter'], {
        claimRe: /\bmatter\b[^.!?\n]{0,60}\bclosed\b|\bclosed\b[^.!?\n]{0,60}\bmatter\b/i,
        askRe: CONFIRM_ASK_RE,
        offerRe: OFFER_OR_CONDITIONAL_RE,
        // Exempt honest failures/negations AND truthful STATUS reports ("m_4001 is closed"); fresh
        // action claims ("is now closed", "has been closed") stay guarded.
        exemptRe:
          /\b(cannot|can't|could not|couldn't|not|no|already|unable|blocked|before|must)\b|\b(is|was|remains)\s+(already\s+)?closed\b|\?/i,
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
