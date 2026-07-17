/**
 * vault-filing — the single second-brain agent: capture-queue triage + vault filing.
 *
 * Bucket: everything the domain owns (8 tools, one coherent flow: list → read → summarize/tag →
 * file/move/search, plus the two-step delete). One agent by TOOL-NEED — the whole capture-to-vault
 * flow shares state (read content feeds the note body), so splitting it would split a flow the
 * evals need whole. AgentSpecBase installs the confirm-first + throttle protocol on noteDelete
 * (the sole destructive tool); the always-on reply-honesty invariant (noFalseFailureClaim)
 * installs from cfg.lexicon.falseFailureClaimRe — never re-add either.
 *
 * // UNCHECKABLE: WHICH allowed folder fits an item (areas vs resources vs archive) is judgment —
 * //              conditioned prose + eval dimension only (cases 01/02).
 * // UNCHECKABLE: a digest must be grounded in the actually-captured items (no invented items or
 * //              embellished content) — conditioned prose + eval dimension only (case 12).
 * // UNCHECKABLE: the decline WORDING for out-of-vault destinations (the veto itself is the
 * //              argFormat guard; the offer-a-vault-folder-instead half is prose + case 03).
 * // UNCHECKABLE: capabilities outside the tool surface (email, sync, opening apps) must be
 * //              declined honestly, never simulated — conditioned prose + eval dimension (case 13).
 */
import { AgentSpecBase, argFormat, custom, destructiveClaimRequiresSuccess, jargonScrub, noFabricatedSuccess, pendingConfirmMustAsk } from 'looprun';
import {
  CONFIRM_ASK_RE,
  CONFIRM_LANG_RE,
  DELETE_CLAIM_RE,
  FALSE_FAILURE_CLAIM_RE,
  FILING_CLAIM_RE,
  HONEST_FAILURE_RE,
  NOTE_LABEL_RE,
  OFFER_OR_CONDITIONAL_RE,
} from './lexicon.js';
import { SECOND_BRAIN_THEME } from './theme.js';

/** The per-id state the reply-honesty label seam reads (world accessors via the ctx closure). */
type VaultReader = { hasNote?: (noteId: string) => boolean };

/** The vault folder allowlist as ONE regex — the path-scope gate (matches the world's own rule). */
const VAULT_FOLDER_PATTERN = '^(inbox|areas|resources|archive)(/[a-z0-9][a-z0-9-]*)?$';

export class AgentSpecVaultFiling extends AgentSpecBase {
  constructor() {
    super({
      id: 'vault-filing',
      mode: 'VAULT_FILING',
      // REQUIRED per-agent persona (persona-on-spec law) — rendered as the FIRST Behavior bullet.
      persona:
        'You are the vault filing agent: you triage the capture queue (bookmarks, quick notes, voice ' +
        'transcripts), summarize and tag what came in, file it into the note vault, and keep the ' +
        "owner's digests grounded in what was actually captured.",
      tools: [
        'inboxList',
        'itemRead',
        'fetchPage',
        'noteCreate',
        'noteMove',
        'noteTag',
        'vaultSearch',
        'noteDelete',
      ],
      destructiveTools: ['noteDelete'],
      // Auto-installs the always-on noFalseFailureClaim (attempt-context claimRe — see lexicon.ts).
      lexicon: { falseFailureClaimRe: FALSE_FAILURE_CLAIM_RE },
      theme: SECOND_BRAIN_THEME,
      behavior: [
        // Load-bearing lines first (after the runtime-prepended persona). Each SPECIALIZES a theme
        // invariant — it never re-declares one.
        'To file a captured item: look it up (inboxList), read it (itemRead — and fetchPage when a ' +
          "bookmark's saved excerpt is too thin), then create ONE note in the fitting vault folder " +
          'with a short summary body written from the read content and 2–4 lowercase tags. Filing or ' +
          'moving anything needs a prior itemRead or vaultSearch this conversation — the title alone ' +
          'is never enough to summarize from.',
        'Pick the folder by how the owner will look for it: reference material and how-tos go under ' +
          'resources, ongoing responsibilities under areas, finished or stale things under archive, ' +
          'and undecided items under inbox. When the request names a folder, use it (if it is in the ' +
          'vault); when genuinely ambiguous, pick the closest fit and say why — do not ask.',
        'Before filing something that may already be in the vault, run vaultSearch on its topic or ' +
          'source; when a match exists, report the existing note id and offer to tag or update it — ' +
          'creating a twin note is a failure.',
        'To move or tag an existing note, resolve its exact note_ id with vaultSearch first, then act ' +
          'this turn (noteMove / noteTag take no confirmation round) and confirm the real result.',
        'To delete a note: resolve the id, call noteDelete WITHOUT confirmed:true (the probe), relay ' +
          'its exact confirmation question, and STOP. After the user agrees in a LATER turn, call ' +
          'noteDelete AGAIN with confirmed:true — never re-probe after the go-ahead, and one deletion ' +
          'per turn is the hard ceiling: for a bulk delete request, explain the one-at-a-time rule.',
        'When inboxList returns nothing pending, say the capture queue is empty and stop — never ' +
          'invent captured items or file notes with no source.',
        'When asked for a digest of what came in, read the pending items first (itemRead per item) ' +
          'and summarize ONLY what was actually captured, item by item, with real itm_ ids or titles; ' +
          'a digest the user wants kept goes into the vault under resources.',
        'When a message is garbled or a filing request is missing its target, recover with ONE ' +
          'concrete clarifying question — never guess a destination, an item, or a delete target.',
        'When asked for something outside the vault tools — sending email, syncing devices, opening ' +
          'apps, editing files on disk — say plainly that you cannot do it here and name what you CAN ' +
          'do instead; never claim it was done.',
      ],
    });

    // Input gate (PATH SCOPE): noteCreate/noteMove land ONLY inside the vault folder allowlist —
    // decidable from the args alone, denied before execution. The world enforces it too (defense
    // in depth); the guard catches it pre-execution and feeds the correction back.
    this.addGuard(
      'preTool',
      ['noteCreate', 'noteMove'],
      argFormat(
        'folder',
        VAULT_FOLDER_PATTERN,
        undefined,
        'That folder is outside the vault. Notes live only under inbox, areas, resources, or archive ' +
          '(one subfolder segment like resources/cooking is fine) — pick a vault folder.',
      ),
      { id: 'agent:vaultFolderScope' },
    );

    // Spatial gate (READ BEFORE FILING): a note is created or moved ONLY once a source read ran OK
    // this conversation — itemRead (a captured item) or vaultSearch (an existing note). The two
    // reads are alternatives, so this is one custom gate rather than requiresBefore (which would
    // demand BOTH).
    this.addGuard(
      'preTool',
      ['noteCreate', 'noteMove'],
      custom({
        kind: 'readBeforeFiling',
        dim: 'spatial',
        check: (ctx) => {
          const read = ctx.observed.some((o) => o.ok && (o.name === 'itemRead' || o.name === 'vaultSearch'));
          return read
            ? null
            : 'Read the source first — run itemRead (for a captured item) or vaultSearch (for an ' +
                'existing note) before filing or moving anything.';
        },
        prose: () =>
          'a note is created or moved ONLY once itemRead or vaultSearch has run this conversation — ' +
          'filing without reading the source is a failure',
      }),
      { id: 'agent:readBeforeFiling' },
    );

    // Reply honesty (behavior dim). pendingConfirmMustAsk relays a pending delete probe (askRe
    // accepts a bare `?`); destructiveClaimRequiresSuccess is attempt-keyed — it fires only when
    // noteDelete was tried this turn and did not take effect, and exempts confirm-language relays
    // (CONFIRM_LANG_RE, no bare `?`), offers, and honest failure/negation reports.
    // noFalseFailureClaim auto-installed via cfg.lexicon.
    this.addReplyCheck(pendingConfirmMustAsk({ askRe: CONFIRM_ASK_RE }), { id: 'agent:pendingConfirmMustAsk' });
    this.addReplyCheck(
      destructiveClaimRequiresSuccess(['noteDelete'], {
        claimRe: DELETE_CLAIM_RE,
        askRe: CONFIRM_LANG_RE,
        offerRe: OFFER_OR_CONDITIONAL_RE,
        exemptRe: HONEST_FAILURE_RE,
      }),
      { id: 'agent:destructiveClaimRequiresSuccess' },
    );

    // Fabricated-filing gate: two seams. The LABEL seam (NOTE_LABEL_RE + refExists) is
    // attempt-independent — a note_ id in the reply must be a real vault note or minted this turn;
    // the CLAIM seam (FILING_CLAIM_RE) is attempt-keyed — a vetoed/failed noteCreate cannot be
    // reported as a filing.
    this.addReplyCheck(
      noFabricatedSuccess('noteCreate', {
        reason:
          'Only claim a note was filed/saved when the tool succeeded this turn, and only cite note_ ' +
          'ids that exist in the vault or were created this turn — state what actually happened.',
        claimRe: FILING_CLAIM_RE,
        labelRe: NOTE_LABEL_RE,
        refExists: (world, label) => (world as VaultReader).hasNote?.(label) ?? false,
      }),
      { id: 'agent:noFabricatedFiling' },
    );

    // Deterministic egress rewrite of the internal kind enum spelling.
    this.addMutator(jargonScrub({ voice_transcript: 'voice transcript' }), { id: 'agent:jargonScrub' });
  }
}

export default new AgentSpecVaultFiling();
