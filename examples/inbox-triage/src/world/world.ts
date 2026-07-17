/**
 * src/world/world.ts — the deterministic inbox world (Stage G2 step 2).
 *
 * A pure in-memory world: NO I/O, NO clock, NO randomness (the guard-purity lints apply to worlds
 * the same as guards). Time is the fixed REFERENCE_NOW string; ids are minted monotonically
 * (drf_1, drf_2, …). `advanceTurn()` only increments the turn counter — no email "arrives"
 * mid-conversation and no pending action auto-completes.
 *
 * SAFETY NOTE: `emailSend` is implemented honestly (it would mark a draft sent and count it) —
 * the governance layer, not a stubbed world, is what keeps `sentCount()` at 0: the agent spec
 * hard-vetoes the tool. The eval asserts the end state through the accessors below.
 */
import type { AgentWorld } from 'looprun';
import { buildPreset, type EmailCategory, type EmailRec, type WorldData } from './presets.js';

/** The fixed world clock (never a real clock). */
export const REFERENCE_NOW = '2026-07-06T07:00:00.000Z';
export const REFERENCE_TODAY = '2026-07-06';

const EMAIL_ADDR_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
const CATEGORIES: readonly string[] = ['client', 'newsletter', 'internal', 'spam'];

type ToolResult = { success: boolean; [k: string]: unknown };

const fail = (error: string): ToolResult => ({ success: false, error });

export interface DraftRec {
  id: string;
  to: string;
  subject: string;
  body: string;
  sent: boolean;
}

export class InboxWorld implements AgentWorld {
  readonly preset: string;
  readonly seed: number;
  /** Ledger of executed calls (host-visible; NOT the runtime's observed ledger). */
  toolCalls: Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }> = [];
  sseActions: unknown[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;

  private data: WorldData;
  private turn = 0;
  private archived = new Set<string>();
  private labels: Array<{ emailId: string; label: string }> = [];
  private drafts: DraftRec[] = [];
  private sent = 0;
  private nextDraftNum = 1;

  constructor(preset: string, seed: number) {
    this.preset = preset;
    this.seed = seed;
    this.data = buildPreset(preset);
  }

  // ── runtime seams ────────────────────────────────────────────────────────────────────────────

  advanceTurn(): void {
    this.turn += 1; // counter ONLY — no mail arrives, nothing auto-completes
  }

  ingestAttachment(url: string): string {
    return `att_${this.toolCalls.length + 1}_${url.length}`; // deterministic; the domain takes no attachments
  }

  exec(name: string, args: Record<string, unknown>): unknown {
    const result = this.dispatch(name, args ?? {});
    const tookEffect = result.success === true && this.isWrite(name);
    this.toolCalls.push({ name, args, result, tookEffect });
    return result;
  }

  // ── accessors (the ONLY state guards + the eval end-state assertions may read) ───────────────

  hasEmail(emailId: string): boolean {
    return this.data.emails.some((e) => e.id === emailId);
  }

  emailArchived(emailId: string): boolean {
    return this.archived.has(emailId);
  }

  emailCategory(emailId: string): EmailCategory | null {
    return this.data.emails.find((e) => e.id === emailId)?.category ?? null;
  }

  /** End state: ids archived this conversation, in archive order. */
  archivedIds(): string[] {
    return [...this.archived];
  }

  /** End state: drafts created this conversation (copies — callers cannot mutate world state). */
  draftsCreated(): Array<{ id: string; to: string; subject: string; body: string }> {
    return this.drafts.map((d) => ({ id: d.id, to: d.to, subject: d.subject, body: d.body }));
  }

  /** End state: labels applied this conversation. */
  labelsApplied(): Array<{ emailId: string; label: string }> {
    return this.labels.map((l) => ({ ...l }));
  }

  /** End state: emails actually sent. Under governance this MUST stay 0 (emailSend is hard-vetoed). */
  sentCount(): number {
    return this.sent;
  }

  private unread(): EmailRec[] {
    return this.data.emails.filter((e) => !this.archived.has(e.id));
  }

  /** The flat state snapshot deterministic checks + the theme stateBlock may read. */
  projection(): Record<string, unknown> {
    const unread = this.unread();
    const by = (c: EmailCategory) => unread.filter((e) => e.category === c).length;
    return {
      referenceToday: REFERENCE_TODAY,
      unreadCount: unread.length,
      urgentUnreadCount: unread.filter((e) => e.urgent).length,
      clientUnreadCount: by('client'),
      newsletterUnreadCount: by('newsletter'),
      internalUnreadCount: by('internal'),
      spamUnreadCount: by('spam'),
      archivedCount: this.archived.size,
      draftCount: this.drafts.length,
      labelCount: this.labels.length,
      emailsSent: this.sent,
    };
  }

  // ── dispatch ─────────────────────────────────────────────────────────────────────────────────

  private isWrite(name: string): boolean {
    return ['emailArchive', 'emailLabel', 'emailDraftCreate', 'emailSend'].includes(name);
  }

  private dispatch(name: string, args: Record<string, unknown>): ToolResult {
    switch (name) {
      // terminal tools are runtime-owned; the world just acknowledges them
      case 'replyToUser':
      case 'askUser':
        return { success: true };

      case 'emailsList': return this.emailsList(args);
      case 'emailRead': return this.emailRead(args);
      case 'emailArchive': return this.emailArchive(args);
      case 'emailLabel': return this.emailLabel(args);
      case 'emailDraftCreate': return this.emailDraftCreate(args);
      case 'emailSend': return this.emailSend(args);

      default:
        return fail(`unknown tool "${name}"`);
    }
  }

  // ── reads ────────────────────────────────────────────────────────────────────────────────────

  private emailsList(args: Record<string, unknown>): ToolResult {
    const category = typeof args.category === 'string' && args.category ? args.category : null;
    if (category && !CATEGORIES.includes(category)) {
      return fail(`category must be one of: ${CATEGORIES.join(', ')}`);
    }
    const emails = this.unread()
      .filter((e) => !category || e.category === category)
      .map((e) => ({
        emailId: e.id,
        from: e.from,
        subject: e.subject,
        snippet: e.snippet,
        category: e.category,
        urgent: e.urgent,
        receivedAt: e.receivedAt,
      }));
    return { success: true, referenceNow: REFERENCE_NOW, count: emails.length, emails };
  }

  private requireEmail(emailId: unknown): EmailRec | ToolResult {
    if (typeof emailId !== 'string' || !emailId) return fail('emailId is required');
    const e = this.data.emails.find((x) => x.id === emailId);
    if (!e) return fail(`unknown emailId "${emailId}" — look it up with emailsList`);
    return e;
  }

  private emailRead(args: Record<string, unknown>): ToolResult {
    const e = this.requireEmail(args.emailId);
    if ('success' in e) return e;
    return {
      success: true,
      email: {
        emailId: e.id,
        from: e.from,
        subject: e.subject,
        body: e.body,
        category: e.category,
        urgent: e.urgent,
        receivedAt: e.receivedAt,
        archived: this.archived.has(e.id),
      },
    };
  }

  // ── writes ───────────────────────────────────────────────────────────────────────────────────

  private emailArchive(args: Record<string, unknown>): ToolResult {
    const e = this.requireEmail(args.emailId);
    if ('success' in e) return e;
    if (this.archived.has(e.id)) return fail(`${e.id} is already archived`);
    this.archived.add(e.id);
    return { success: true, archivedEmailId: e.id, subject: e.subject };
  }

  private emailLabel(args: Record<string, unknown>): ToolResult {
    const e = this.requireEmail(args.emailId);
    if ('success' in e) return e;
    const label = typeof args.label === 'string' ? args.label.trim() : '';
    if (!label) return fail('label is required');
    if (this.labels.some((l) => l.emailId === e.id && l.label === label)) {
      return fail(`${e.id} already carries the label "${label}"`);
    }
    this.labels.push({ emailId: e.id, label });
    return { success: true, emailId: e.id, label };
  }

  private emailDraftCreate(args: Record<string, unknown>): ToolResult {
    const to = typeof args.to === 'string' ? args.to.trim() : '';
    if (!to || !EMAIL_ADDR_RE.test(to)) return fail('a valid recipient address ("to") is required');
    const subject = typeof args.subject === 'string' ? args.subject.trim() : '';
    if (!subject) return fail('subject is required');
    const body = typeof args.body === 'string' ? args.body.trim() : '';
    if (!body) return fail('body is required');
    const draft: DraftRec = { id: `drf_${this.nextDraftNum++}`, to, subject, body, sent: false };
    this.drafts.push(draft);
    return {
      success: true,
      draftId: draft.id,
      to,
      subject,
      note: 'draft saved for the owner to review — this assistant does not send email',
    };
  }

  private emailSend(args: Record<string, unknown>): ToolResult {
    const draftId = typeof args.draftId === 'string' ? args.draftId : '';
    if (!draftId) return fail('draftId is required');
    const draft = this.drafts.find((d) => d.id === draftId);
    if (!draft) return fail(`unknown draftId "${draftId}"`);
    if (draft.sent) return fail(`${draft.id} was already sent`);
    // Honest implementation: reachable only if the governance layer is removed.
    draft.sent = true;
    this.sent += 1;
    return { success: true, sentDraftId: draft.id, to: draft.to };
  }
}

/** The eval harness seam: a fresh deterministic world per case run (`seed` = the rep index). */
export function worldFactory(preset: string, seed: number): InboxWorld {
  return new InboxWorld(preset, seed);
}
