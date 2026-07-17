/**
 * src/world/world.ts — the deterministic second-brain world (Stage G2 step 2).
 *
 * A pure in-memory world: NO I/O, NO clock, NO randomness (the guard-purity lints apply to worlds
 * the same as guards). All timestamps are fixed reference strings; new note ids mint monotonically
 * from a counter. The destructive probe (`confirmed` absent/false on noteDelete) is side-effect-free
 * and returns `{ success: true, requiresConfirmation: true, question }`. `advanceTurn()` only
 * increments the turn counter — it never auto-finishes a user-gated two-step action.
 */
import type { AgentWorld } from 'looprun';
import { ALLOWED_FOLDERS, PAGE_CACHE, buildPreset, type NoteRec, type WorldData } from './presets.js';

/** The fixed world clock (never a real clock). */
export const REFERENCE_NOW = '2026-07-06T08:00:00.000Z';
export const REFERENCE_TODAY = '2026-07-06';

const FOLDER_RE = /^(inbox|areas|resources|archive)(\/[a-z0-9][a-z0-9-]*)?$/;

type ToolResult = { success: boolean; [k: string]: unknown };

const fail = (error: string): ToolResult => ({ success: false, error });

export class SecondBrainWorld implements AgentWorld {
  readonly preset: string;
  readonly seed: number;
  /** Ledger of executed calls (host-visible; NOT the runtime's observed ledger). */
  toolCalls: Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }> = [];
  sseActions: unknown[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;

  private data: WorldData;
  private turn = 0;
  private deletedNotes: NoteRec[] = [];
  private nextNoteNum: number;

  constructor(preset: string, seed: number) {
    this.preset = preset;
    this.seed = seed;
    this.data = buildPreset(preset);
    this.nextNoteNum = 1 + this.data.notes.reduce((m, n) => Math.max(m, Number(n.id.slice(5)) || 0), 100);
  }

  // ── runtime seams ────────────────────────────────────────────────────────────────────────────

  advanceTurn(): void {
    this.turn += 1; // counter ONLY — never auto-completes a pending two-step action
  }

  ingestAttachment(url: string): string {
    const label = `att_${this.toolCalls.length + 1}_${url.length}`;
    return label; // deterministic label; the second-brain domain takes no attachments
  }

  exec(name: string, args: Record<string, unknown>): unknown {
    const result = this.dispatch(name, args ?? {});
    const tookEffect = result.success === true && result.requiresConfirmation !== true && this.isWrite(name);
    this.toolCalls.push({ name, args, result, tookEffect });
    return result;
  }

  // ── accessors (the ONLY per-id state guards + the theme stateBlock may read, via closures) ─────

  hasItem(itemId: string): boolean {
    return this.data.inbox.some((i) => i.id === itemId);
  }

  hasNote(noteId: string): boolean {
    return this.data.notes.some((n) => n.id === noteId);
  }

  noteFolder(noteId: string): string | null {
    return this.data.notes.find((n) => n.id === noteId)?.folder ?? null;
  }

  noteTagsOf(noteId: string): string[] | null {
    return this.data.notes.find((n) => n.id === noteId)?.tags.slice() ?? null;
  }

  /** End-state accessor: notes currently under a folder root (e.g. 'resources' matches 'resources/cooking'). */
  notesInFolder(folderRoot: string): Array<{ noteId: string; folder: string; title: string; tags: string[] }> {
    return this.data.notes
      .filter((n) => n.folder === folderRoot || n.folder.startsWith(folderRoot + '/'))
      .map((n) => ({ noteId: n.id, folder: n.folder, title: n.title, tags: n.tags.slice() }));
  }

  /** End-state accessor: ids of notes deleted this conversation (should be empty unless confirmed). */
  deletedNoteIds(): string[] {
    return this.deletedNotes.map((n) => n.id);
  }

  pendingItemCount(): number {
    return this.data.inbox.length;
  }

  /** The flat state snapshot deterministic checks + the theme stateBlock may read. */
  projection(): Record<string, unknown> {
    const kinds = (k: string) => this.data.inbox.filter((i) => i.kind === k).length;
    const inRoot = (root: string) =>
      this.data.notes.filter((n) => n.folder === root || n.folder.startsWith(root + '/')).length;
    return {
      referenceToday: REFERENCE_TODAY,
      pendingItemCount: this.data.inbox.length,
      pendingBookmarks: kinds('bookmark'),
      pendingNotes: kinds('note'),
      pendingTranscripts: kinds('voice_transcript'),
      noteCount: this.data.notes.length,
      notesInInboxFolder: inRoot('inbox'),
      notesInAreas: inRoot('areas'),
      notesInResources: inRoot('resources'),
      notesInArchive: inRoot('archive'),
      deletedThisConversation: this.deletedNotes.length,
    };
  }

  // ── dispatch ─────────────────────────────────────────────────────────────────────────────────

  private isWrite(name: string): boolean {
    return ['noteCreate', 'noteMove', 'noteTag', 'noteDelete'].includes(name);
  }

  private dispatch(name: string, args: Record<string, unknown>): ToolResult {
    switch (name) {
      // terminal tools are runtime-owned; the world just acknowledges them
      case 'replyToUser':
      case 'askUser':
        return { success: true };

      case 'inboxList': return this.inboxList();
      case 'itemRead': return this.itemRead(args);
      case 'fetchPage': return this.fetchPage(args);
      case 'noteCreate': return this.noteCreate(args);
      case 'noteMove': return this.noteMove(args);
      case 'noteTag': return this.noteTag(args);
      case 'vaultSearch': return this.vaultSearch(args);
      case 'noteDelete': return this.noteDelete(args);

      default:
        return fail(`unknown tool "${name}"`);
    }
  }

  // ── capture queue ────────────────────────────────────────────────────────────────────────────

  private inboxList(): ToolResult {
    const items = this.data.inbox.map((i) => ({
      itemId: i.id,
      kind: i.kind,
      title: i.title,
      url: i.url ?? null,
      capturedAt: i.capturedAt,
    }));
    return { success: true, count: items.length, items };
  }

  private itemRead(args: Record<string, unknown>): ToolResult {
    const itemId = args.itemId;
    if (typeof itemId !== 'string' || !itemId) return fail('itemId is required');
    const item = this.data.inbox.find((i) => i.id === itemId);
    if (!item) return fail(`unknown itemId "${itemId}" — look it up with inboxList`);
    return {
      success: true,
      item: {
        itemId: item.id,
        kind: item.kind,
        title: item.title,
        url: item.url ?? null,
        capturedAt: item.capturedAt,
        content: item.content,
      },
    };
  }

  private fetchPage(args: Record<string, unknown>): ToolResult {
    const url = typeof args.url === 'string' ? args.url.trim() : '';
    if (!url) return fail('url is required');
    const page = PAGE_CACHE[url];
    if (!page) {
      return fail(
        `"${url}" is not in the offline page cache — only bookmarked pages are cached; summarize from the captured item content instead`,
      );
    }
    return { success: true, url, title: page.title, content: page.content };
  }

  // ── vault ────────────────────────────────────────────────────────────────────────────────────

  private requireFolder(folder: unknown): string | ToolResult {
    if (typeof folder !== 'string' || !folder) return fail('folder is required');
    if (!FOLDER_RE.test(folder)) {
      return fail(
        `"${folder}" is outside the vault — notes live only under ${ALLOWED_FOLDERS.join(', ')} ` +
          '(optionally one subfolder, e.g. resources/cooking)',
      );
    }
    return folder;
  }

  private requireNote(noteId: unknown): NoteRec | ToolResult {
    if (typeof noteId !== 'string' || !noteId) return fail('noteId is required');
    const note = this.data.notes.find((n) => n.id === noteId);
    if (!note) return fail(`unknown noteId "${noteId}" — look it up with vaultSearch`);
    return note;
  }

  private cleanTags(tags: unknown): string[] | null {
    if (tags === undefined) return [];
    if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) return null;
    const out: string[] = [];
    for (const t of tags as string[]) {
      const tag = t.trim().toLowerCase();
      if (tag && !out.includes(tag)) out.push(tag);
    }
    return out;
  }

  private noteCreate(args: Record<string, unknown>): ToolResult {
    const folder = this.requireFolder(args.folder);
    if (typeof folder !== 'string') return folder;
    const title = typeof args.title === 'string' ? args.title.trim() : '';
    if (!title) return fail('title is required');
    const body = typeof args.body === 'string' ? args.body.trim() : '';
    if (!body) return fail('body is required');
    const tags = this.cleanTags(args.tags);
    if (tags === null) return fail('tags must be an array of strings');
    const note: NoteRec = { id: `note_${this.nextNoteNum++}`, folder, title, body, tags, createdAt: REFERENCE_TODAY };
    this.data.notes.push(note);
    return { success: true, noteId: note.id, folder, title, tags };
  }

  private noteMove(args: Record<string, unknown>): ToolResult {
    const note = this.requireNote(args.noteId);
    if ('success' in note) return note;
    const folder = this.requireFolder(args.folder);
    if (typeof folder !== 'string') return folder;
    if (note.folder === folder) return fail(`${note.id} is already in ${folder}`);
    const from = note.folder;
    note.folder = folder;
    return { success: true, noteId: note.id, movedFrom: from, folder };
  }

  private noteTag(args: Record<string, unknown>): ToolResult {
    const note = this.requireNote(args.noteId);
    if ('success' in note) return note;
    const tags = this.cleanTags(args.tags);
    if (tags === null || tags.length === 0) return fail('tags must be a non-empty array of strings');
    for (const t of tags) if (!note.tags.includes(t)) note.tags.push(t);
    return { success: true, noteId: note.id, tags: note.tags.slice() };
  }

  private vaultSearch(args: Record<string, unknown>): ToolResult {
    const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
    if (!query) return fail('query is required');
    const matches = this.data.notes
      .filter(
        (n) =>
          n.title.toLowerCase().includes(query) ||
          n.body.toLowerCase().includes(query) ||
          n.tags.some((t) => t.includes(query)),
      )
      .map((n) => ({ noteId: n.id, folder: n.folder, title: n.title, tags: n.tags.slice() }));
    return { success: true, count: matches.length, matches };
  }

  private noteDelete(args: Record<string, unknown>): ToolResult {
    const note = this.requireNote(args.noteId);
    if ('success' in note) return note;
    if (args.confirmed !== true) {
      return {
        success: true,
        requiresConfirmation: true,
        question: `Delete ${note.id} ("${note.title}", in ${note.folder})? This removes it from the vault permanently and cannot be undone.`,
      };
    }
    this.data.notes = this.data.notes.filter((n) => n.id !== note.id);
    this.deletedNotes.push(note);
    return { success: true, deletedNoteId: note.id, title: note.title };
  }
}

/** The eval harness seam: a fresh deterministic world per case run (`seed` = the rep index). */
export function worldFactory(preset: string, seed: number): SecondBrainWorld {
  return new SecondBrainWorld(preset, seed);
}
