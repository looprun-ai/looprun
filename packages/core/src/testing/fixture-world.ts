/**
 * A deterministic, domain-NEUTRAL fixture world for the @looprun-ai/core testing kit.
 *
 * `FixtureWorld` implements `AgentWorld` with NO clock, NO RNG, and NO I/O — every id and
 * label is produced by a monotonic in-memory counter, so an identical exec sequence yields identical
 * `toolCalls` (the purity discipline). The strings are generic English ("Fixture Co.", "item",
 * "media") — no business vocabulary — so the kit stays shippable and reusable.
 *
 * The label scheme is business-free: generated media labels are `g\d{3}` (g001, g002, …) produced by
 * `createMedia`/`editMedia`; uploads are `u9\d{2}` (u900, u901, …) produced by `ingestAttachment`. The
 * scheme regexes are exported as {@link FIXTURE_LABEL_SCHEME} for the noFabricatedSuccess proofs. The
 * `hasMediaLabel` method below backs the noFabricatedSuccess `refExists` proof — it is a fixture
 * accessor, no longer a typed `MediaWorld` contract (the runtime carries no media concept). The 11 domain tools + the two runtime terminals are
 * exported as {@link FIXTURE_TOOL_DEFS}; the generic domain + lexicon are {@link FIXTURE_DOMAIN} /
 * {@link FIXTURE_LEXICON}.
 */
import type { AgentWorld } from '../rules.js';
import type { DomainContract } from '../trunk.js';
import type { ToolDef } from '../runtime/types.js';

export type FixturePreset = 'empty' | 'seeded-media' | 'quota-exhausted' | 'has-primary';

/** The business-free label scheme (injected into the noFabricatedSuccess proofs). */
export const FIXTURE_LABEL_SCHEME = {
  /** Uploaded labels: u900, u901, … */
  uploadRe: /^u9\d{2}$/,
  /** Any media label (generated g\d{3} OR uploaded u9\d{2}) — NON-global so no lastIndex leaks; the
   *  noFabricatedSuccess guard builds its own /g copy locally. */
  labelRe: /\b[gu]\d{3}\b/,
  /** Generated labels only. */
  generatedRe: /^g\d{3}$/,
  labelNoun: 'fixture label',
} as const;

const DEFAULT_QUOTA = 100;

/**
 * A deterministic in-memory `AgentWorld`. Pure: all ids/labels come from monotonic
 * counters; there is no clock, RNG, or I/O anywhere.
 */
export class FixtureWorld implements AgentWorld {
  // The AgentWorld index seam (host-injected accessors flow through here). ES #private fields below are
  // excluded from this signature, so internal state stays truly private.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;

  readonly toolCalls: Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }> = [];
  readonly sseActions: unknown[] = [];

  readonly #preset: FixturePreset;
  readonly #labels = new Set<string>();
  #genCount = 0;
  #uploadCount = 0;
  #itemCount = 0;
  #primary = false;
  #quota = DEFAULT_QUOTA;
  #turn = 0;

  constructor(preset: FixturePreset = 'empty') {
    this.#preset = preset;
    if (preset === 'seeded-media') {
      // One uploaded label (u900) and one generated label (g001) already in the registry.
      this.#labels.add('u900');
      this.#uploadCount = 1; // next ingestAttachment → u901
      this.#labels.add('g001');
      this.#genCount = 1; // next createMedia → g002
    }
    if (preset === 'quota-exhausted') this.#quota = 0;
    if (preset === 'has-primary') this.#primary = true;
  }

  // ── label helpers ──────────────────────────────────────────────────────────
  #nextGenLabel(): string {
    this.#genCount += 1;
    const label = `g${String(this.#genCount).padStart(3, '0')}`;
    this.#labels.add(label);
    return label;
  }

  #nextItemId(): string {
    this.#itemCount += 1;
    return `p${String(this.#itemCount).padStart(3, '0')}`;
  }

  #record(name: string, args: Record<string, unknown>, result: unknown, tookEffect = false): unknown {
    this.toolCalls.push({ name, args, result, tookEffect });
    return result;
  }

  // ── media-label accessor (backs the noFabricatedSuccess refExists proof) ──
  hasMediaLabel(label: string): boolean {
    return this.#labels.has(label);
  }

  // ── domain accessors the guards / domain read ─────────────────────────────────
  quotaRemaining(): number {
    return this.#quota;
  }

  hasPrimary(): boolean {
    return this.#primary;
  }

  itemCount(): number {
    return this.#itemCount;
  }

  // ── AgentWorld core seam ─────────────────────────────────────────────────────
  advanceTurn(): void {
    this.#turn += 1;
  }

  ingestAttachment(_url: string): string {
    const label = `u9${String(this.#uploadCount).padStart(2, '0')}`;
    this.#uploadCount += 1;
    this.#labels.add(label);
    return label;
  }

  exec(name: string, args: Record<string, unknown>): unknown {
    switch (name) {
      // Runtime terminals: no world side effect, always ok.
      case 'replyToUser':
      case 'askUser':
        return { success: true };

      case 'createItem': {
        const id = this.#nextItemId();
        return this.#record(name, args, { success: true, id, title: args.title ?? '' }, true);
      }

      case 'updateItem':
        return this.#record(name, args, { success: true }, true);

      case 'deleteItem': {
        if (args.confirmed !== true) {
          // A probe (ok result) — asks for confirmation, no side effect.
          return this.#record(name, args, { requiresConfirmation: true, question: 'Delete item — are you sure?' });
        }
        return this.#record(name, args, { success: true, deleted: args.id }, true);
      }

      case 'purgeAll':
        return this.#record(name, args, { success: true, purged: this.#itemCount }, true);

      case 'searchItem':
        return this.#record(name, args, { success: true, items: [{ id: 'p001', title: 'Alpha' }, { id: 'p002', title: 'Beta' }] });

      case 'listItems':
        return this.#record(name, args, { success: true, items: [{ id: 'p001', title: 'Alpha' }, { id: 'p002', title: 'Beta' }] });

      case 'createMedia': {
        if (this.#quota <= 0) {
          return this.#record(name, args, { success: false, error: 'media quota exhausted' });
        }
        this.#quota -= 1;
        const label = this.#nextGenLabel();
        return this.#record(name, args, { success: true, label }, true);
      }

      case 'editMedia': {
        const label = this.#nextGenLabel();
        return this.#record(name, args, { success: true, label }, true);
      }

      case 'useMedia':
        return this.#record(name, args, { success: true }, true);

      case 'setPrimary': {
        this.#primary = true;
        return this.#record(name, args, { success: true }, true);
      }

      case 'reportStatus':
        return this.#record(name, args, { success: true, status: 'ok', count: this.#itemCount });

      default:
        return this.#record(name, args, { success: false, error: `unknown tool "${name}"` });
    }
  }
}

/** The 11 domain tool names — the agent SURFACE (terminals are runtime-owned, never in the surface). */
export const FIXTURE_TOOL_NAMES = [
  'createItem',
  'updateItem',
  'deleteItem',
  'purgeAll',
  'searchItem',
  'listItems',
  'createMedia',
  'editMedia',
  'useMedia',
  'setPrimary',
  'reportStatus',
] as const;

const obj = (properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
});

/**
 * Tool defs for the 11 domain tools. The runtime terminals (`replyToUser` / `askUser`) are NOT listed
 * here: the Mastra backend auto-builds them from `terminalToolDefs()` when the host's `toolDefs` omit
 * them (see buildWorldTools) — so a turn closes with these 11 defs alone.
 */
export const FIXTURE_TOOL_DEFS: ToolDef[] = [
  { name: 'createItem', description: 'Create a new item.', inputSchema: obj({ title: { type: 'string' } }, ['title']) },
  { name: 'updateItem', description: 'Update an existing item.', inputSchema: obj({ id: { type: 'string' }, title: { type: 'string' } }, ['id']) },
  { name: 'deleteItem', description: 'Delete an item (destructive; confirm first).', inputSchema: obj({ id: { type: 'string' }, confirmed: { type: 'boolean' } }, ['id']) },
  { name: 'purgeAll', description: 'Delete every item (destructive; ask first).', inputSchema: obj({}) },
  { name: 'searchItem', description: 'Search items by query.', inputSchema: obj({ query: { type: 'string' } }, ['query']) },
  { name: 'listItems', description: 'List all items.', inputSchema: obj({}) },
  { name: 'createMedia', description: 'Generate a media asset from a prompt.', inputSchema: obj({ prompt: { type: 'string' } }, ['prompt']) },
  { name: 'editMedia', description: 'Edit an existing generated media asset.', inputSchema: obj({ label: { type: 'string' }, instruction: { type: 'string' } }, ['label', 'instruction']) },
  { name: 'useMedia', description: 'Attach a media asset by label.', inputSchema: obj({ label: { type: 'string' } }, ['label']) },
  { name: 'setPrimary', description: 'Set an item as primary.', inputSchema: obj({ id: { type: 'string' } }, ['id']) },
  { name: 'reportStatus', description: 'Report the current account status.', inputSchema: obj({}) },
];

/** A generic domain skin — no business vocabulary. The stateBlock reads the world accessors. */
export const FIXTURE_DOMAIN: DomainContract = {
  voice: 'You are the assistant of Fixture Co.',
  stateBlock: (world: AgentWorld) =>
    `items=${world.itemCount()} primary=${world.hasPrimary()} mediaQuota=${world.quotaRemaining()}`,
  coreInvariants: ['Never invent data or media labels — only use what the tools return.'],
  languageClause: "## Output language (ABSOLUTE)\nAlways reply in the user's language.",
};

/**
 * Generic-English lexicon regexes for the lexicon-injected guards. All are NON-global (no /g lastIndex to
 * leak between calls). Grouped by the guard family that consumes them.
 */
export const FIXTURE_LEXICON = {
  /** minimal:noFalseFailureClaim — "every call succeeded, do not claim you couldn't". */
  falseFailureClaimRe: /\b(?:can(?:no|')t|unable to|failed to)\b/i,
  /** base:confirmFirstPriorAsk / pendingConfirmMustAsk — "does this reply seek confirmation?". */
  confirmAskRe: /\bare you sure\b/i,
  /** destructiveClaimRequiresSuccess — the deletion claim + offer/exempt qualifiers. */
  destructiveClaim: {
    claimRe: /\b(?:deleted|removed|purged)\b/i,
    offerRe: /\b(?:would you like|should I|do you want)\b/i,
    exemptRe: /\b(?:could not|did not|wasn't)\b/i,
  },
  /** noFabricatedSuccess — the media-creation claim + the verb-first claim. */
  fabricated: {
    claimRe: /\b(?:created|generated) (?:the|a|your) (?:image|media)\b/i,
    verbClaimRe: /\bgenerating\b/i,
  },
  /** noFabricatedSuccess `banRe` — a phrase the assistant may NEVER say (the unconditional-ban mode
   *  that absorbed the former replyNoProductionClaim kind). */
  productionClaimRe: /\bpublished to production\b/i,
  /** degenerationGuard `selfNarrationRe` — the third-person self-narration branch, now lexicon-injected
   *  (generic English; no /g lastIndex to leak). Absent ⇒ the narration branch is OFF. */
  selfNarrationRe: /\b(?:I closed the turn|by calling replyToUser|The assistant (?:confirmed|called|then))\b/i,
} as const;

/** @deprecated Use {@link FIXTURE_DOMAIN}. Compatibility alias from the theme->domain rename. */
export const FIXTURE_THEME = FIXTURE_DOMAIN;
