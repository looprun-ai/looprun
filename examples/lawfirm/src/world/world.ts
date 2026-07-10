/**
 * LawFirmWorld — the deterministic in-memory world of Hartwell & Vega Legal (G2).
 *
 * Purity laws: NO I/O, NO clock (fixed REFERENCE_NOW), NO randomness. Every failure returns
 * `{ success:false, error }` — never throws. Destructive tools (closeMatter, cancelDeadline) are
 * two-step: `confirmed` absent/false ⇒ a side-effect-free PROBE returning
 * `{ success:true, requiresConfirmation:true, question }`; validation PRECEDES the probe (a call
 * that would fail with confirmed:true fails identically as a probe). `advanceTurn()` increments
 * the turn counter only — it never auto-completes a user-gated two-turn action.
 */
import type { AgentWorld } from 'looprun';
import { buildPreset } from './presets.js';
import type {
  SeedClient,
  SeedDeadline,
  SeedDocument,
  SeedMatter,
  SeedNotification,
  SeedTimeEntry,
} from './presets.js';

/** The one fixed clock of the world — never a real clock. */
export const REFERENCE_NOW = '2026-07-01T09:00:00.000Z';
const TODAY = REFERENCE_NOW.slice(0, 10); // '2026-07-01'

type ToolResult = Record<string, unknown> & { success: boolean };

/** Civil date → day number (days since 1970-01-01), pure integer math — no Date object. */
function dayNumber(iso: string): number {
  const y0 = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

const norm = (s: unknown): string => String(s ?? '').trim().toLowerCase();

export class LawFirmWorld implements AgentWorld {
  // AgentWorld's index signature (domain accessors flow through it).
  [k: string]: unknown;

  readonly preset: string;
  readonly seed: number;

  toolCalls: Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }> = [];
  sseActions: unknown[] = [];

  private turn = 0;
  private attachmentSeq = 900;

  private clients: SeedClient[];
  private matters: SeedMatter[];
  private documents: SeedDocument[];
  private deadlines: SeedDeadline[];
  private timeEntries: SeedTimeEntry[];
  private notifications: SeedNotification[];

  private counters: Record<string, number>;

  constructor(preset: string, seed: number) {
    this.preset = preset;
    this.seed = seed;
    const s = buildPreset(preset);
    this.clients = s.clients.map((c) => ({ ...c }));
    this.matters = s.matters.map((m) => ({ ...m }));
    this.documents = s.documents.map((d) => ({ ...d }));
    this.deadlines = s.deadlines.map((d) => ({ ...d }));
    this.timeEntries = s.timeEntries.map((t) => ({ ...t }));
    this.notifications = s.notifications.map((n) => ({ ...n }));
    const nextNum = (ids: string[], fallback: number): number =>
      ids.length ? Math.max(...ids.map((id) => Number(id.replace(/^[a-z]+_/, '')) || 0)) + 1 : fallback;
    this.counters = {
      m: nextNum(this.matters.map((m) => m.id), 1001),
      doc: nextNum(this.documents.map((d) => d.id), 301),
      dl: nextNum(this.deadlines.map((d) => d.id), 501),
      te: nextNum(this.timeEntries.map((t) => t.id), 701),
      ntf: nextNum(this.notifications.map((n) => n.id), 801),
    };
  }

  // ── runtime seams ───────────────────────────────────────────────────────────────────────────

  advanceTurn(): void {
    this.turn += 1; // NOTHING else flips between turns (no auto-fill of confirm flows).
  }

  ingestAttachment(_url: string): string {
    this.attachmentSeq += 1;
    return `att_${this.attachmentSeq}`;
  }

  exec(name: string, args: Record<string, unknown>): Record<string, unknown> {
    const a = args ?? {};
    // Terminal tools are runtime-owned; the world just acknowledges them (not recorded as domain calls).
    if (name === 'replyToUser' || name === 'askUser') return { success: true };
    const { result, tookEffect } = this.dispatch(name, a);
    this.toolCalls.push({ name, args: a, result, tookEffect });
    return result;
  }

  // ── deterministic accessors (the ONLY world surface guards may read) ─────────────────────────

  todayStr(): string {
    return TODAY;
  }

  matterExists(matterId: string): boolean {
    return this.matters.some((m) => m.id === matterId);
  }

  isMatterOpen(matterId: string): boolean {
    return this.matters.some((m) => m.id === matterId && m.status === 'open');
  }

  deadlineStatus(deadlineId: string): 'pending' | 'filed' | 'cancelled' | 'unknown' {
    return this.deadlines.find((d) => d.id === deadlineId)?.status ?? 'unknown';
  }

  matterUnbilledHours(matterId: string): number {
    return this.timeEntries.filter((t) => t.matterId === matterId && !t.billed).reduce((s, t) => s + t.hours, 0);
  }

  /** Read-only client directory (id + name) — the confidentiality guard's discriminator. */
  clientDirectory(): Array<{ id: string; name: string }> {
    return this.clients.map((c) => ({ id: c.id, name: c.name }));
  }

  /** The client a matter belongs to (null when unknown) — the matter-ownership discriminator. */
  matterClient(matterId: string): string | null {
    return this.matters.find((m) => m.id === matterId)?.clientId ?? null;
  }

  projection(): Record<string, unknown> {
    const pending = this.deadlines.filter((d) => d.status === 'pending');
    const today = dayNumber(TODAY);
    const imminent = pending.filter((d) => {
      const diff = dayNumber(d.dueDate) - today;
      return diff >= 0 && diff <= 7;
    });
    const next = [...pending].sort((x, y) => x.dueDate.localeCompare(y.dueDate) || x.id.localeCompare(y.id))[0];
    return {
      today: TODAY,
      clientCount: this.clients.length,
      openMatterCount: this.matters.filter((m) => m.status === 'open').length,
      closedMatterCount: this.matters.filter((m) => m.status === 'closed').length,
      pendingDeadlineCount: pending.length,
      imminentDeadlineCount: imminent.length,
      nextDeadline: next ? `${next.id} ${next.description} due ${next.dueDate} (matter ${next.matterId})` : 'none',
      unbilledHoursTotal: this.timeEntries.filter((t) => !t.billed).reduce((s, t) => s + t.hours, 0),
      adversePartyCount: new Set(this.matters.map((m) => norm(m.opposingParty)).filter((p) => p.length > 0)).size,
    };
  }

  // ── tool dispatch ─────────────────────────────────────────────────────────────────────────────

  private dispatch(name: string, a: Record<string, unknown>): { result: ToolResult; tookEffect: boolean } {
    const fail = (error: string): { result: ToolResult; tookEffect: boolean } => ({
      result: { success: false, error },
      tookEffect: false,
    });
    const read = (result: Record<string, unknown>): { result: ToolResult; tookEffect: boolean } => ({
      result: { success: true, ...result },
      tookEffect: false,
    });
    const write = (result: Record<string, unknown>): { result: ToolResult; tookEffect: boolean } => ({
      result: { success: true, ...result },
      tookEffect: true,
    });

    switch (name) {
      case 'createClient': {
        const cname = String(a.name ?? '').trim();
        if (!cname) return fail('name is required');
        const base = `cl_${cname.split(/\s+/)[0]!.toLowerCase().replace(/[^a-z0-9]/g, '') || 'client'}`;
        let id = base;
        for (let i = 2; this.clients.some((c) => c.id === id); i++) id = `${base}_${i}`; // deterministic collision suffix
        const client: SeedClient = { id, name: cname };
        if (typeof a.email === 'string' && a.email) client.email = a.email;
        if (typeof a.phone === 'string' && a.phone) client.phone = a.phone;
        this.clients.push(client);
        return write({ clientId: id, name: cname });
      }

      case 'listClients':
        return read({
          clients: this.clients.map((c) => ({
            clientId: c.id,
            name: c.name,
            openMatters: this.matters.filter((m) => m.clientId === c.id && m.status === 'open').length,
          })),
        });

      case 'getClient': {
        const c = this.clients.find((x) => x.id === a.clientId);
        if (!c) return fail(`unknown client "${String(a.clientId)}" — use listClients to find the exact id`);
        return read({
          client: {
            clientId: c.id,
            name: c.name,
            email: c.email ?? null,
            phone: c.phone ?? null,
            matters: this.matters
              .filter((m) => m.clientId === c.id)
              .map((m) => ({ matterId: m.id, title: m.title, status: m.status })),
          },
        });
      }

      case 'runConflictCheck': {
        const party = norm(a.partyName);
        if (!party) return fail('partyName is required');
        const opposing = norm(a.opposingParty);
        const matches: string[] = [];
        for (const m of this.matters) {
          if (norm(m.opposingParty) === party) {
            matches.push(`"${String(a.partyName)}" is the opposing party on matter ${m.id} (${m.title})`);
          }
        }
        const existing = this.clients.find((c) => norm(c.name) === party);
        if (existing) matches.push(`"${String(a.partyName)}" is already a client (${existing.id})`);
        if (opposing) {
          const oppClient = this.clients.find((c) => norm(c.name) === opposing);
          if (oppClient) {
            matches.push(`prospective opposing party "${String(a.opposingParty)}" is an existing client (${oppClient.id})`);
          }
        }
        // A hit against an EXISTING CLIENT record alone is not adverse — conflict means adversity.
        const conflictFound = matches.some((s) => s.includes('opposing party'));
        return read({ conflictFound, matches });
      }

      case 'openMatter': {
        const client = this.clients.find((c) => c.id === a.clientId);
        if (!client) return fail(`unknown client "${String(a.clientId)}" — register them first (createClient) or use listClients`);
        const title = String(a.title ?? '').trim();
        if (!title) return fail('title is required');
        // Conflict derivation (same rule runConflictCheck reads):
        if (this.matters.some((m) => norm(m.opposingParty) === norm(client.name))) {
          return fail(
            `conflict of interest: ${client.name} is the opposing party on another of the firm's matters — the engagement cannot be opened`,
          );
        }
        const opposing = norm(a.opposingParty);
        if (opposing && this.clients.some((c) => norm(c.name) === opposing)) {
          return fail(
            `conflict of interest: the opposing party "${String(a.opposingParty)}" is an existing client of the firm — the engagement cannot be opened`,
          );
        }
        const id = `m_${this.counters.m!++}`;
        const matter: SeedMatter = { id, clientId: client.id, title, status: 'open' };
        if (typeof a.practiceArea === 'string' && a.practiceArea) matter.practiceArea = a.practiceArea;
        if (typeof a.opposingParty === 'string' && a.opposingParty) matter.opposingParty = a.opposingParty;
        this.matters.push(matter);
        return write({ matterId: id, title, clientId: client.id });
      }

      case 'closeMatter': {
        const m = this.matters.find((x) => x.id === a.matterId);
        // Validation PRECEDES the probe — a probe never asks a question the confirm could not honor.
        if (!m) return fail(`unknown matter "${String(a.matterId)}" — use listMatters to find the exact id`);
        if (m.status === 'closed') return fail(`matter ${m.id} is already closed`);
        const unbilled = this.matterUnbilledHours(m.id);
        if (unbilled > 0) {
          // Deny-prose routes the USER (billing is a user decision) — it must not instruct the
          // agent to clear the gate itself.
          return fail(
            `matter ${m.id} has ${unbilled} unbilled hours that must be billed before closing — ask the user how to proceed`,
          );
        }
        if (a.confirmed !== true) {
          return {
            result: {
              success: true,
              requiresConfirmation: true,
              question: `Close matter ${m.id} ("${m.title}")? This ends all work on it and cannot be undone.`,
            },
            tookEffect: false, // side-effect-free probe
          };
        }
        m.status = 'closed';
        return write({ matterId: m.id, status: 'closed' });
      }

      case 'listMatters': {
        let items = this.matters;
        if (a.clientId != null) {
          if (!this.clients.some((c) => c.id === a.clientId)) {
            return fail(`unknown client "${String(a.clientId)}" — use listClients to find the exact id`);
          }
          items = items.filter((m) => m.clientId === a.clientId);
        }
        return read({
          matters: items.map((m) => ({
            matterId: m.id,
            title: m.title,
            clientId: m.clientId,
            status: m.status,
            practiceArea: m.practiceArea ?? null,
            opposingParty: m.opposingParty ?? null,
          })),
        });
      }

      case 'getMatter': {
        const m = this.matters.find((x) => x.id === a.matterId);
        if (!m) return fail(`unknown matter "${String(a.matterId)}" — use listMatters to find the exact id`);
        const client = this.clients.find((c) => c.id === m.clientId);
        return read({
          matter: {
            matterId: m.id,
            title: m.title,
            status: m.status,
            clientId: m.clientId,
            clientName: client?.name ?? null,
            practiceArea: m.practiceArea ?? null,
            opposingParty: m.opposingParty ?? null,
            deadlines: this.deadlines
              .filter((d) => d.matterId === m.id)
              .map((d) => ({ deadlineId: d.id, description: d.description, dueDate: d.dueDate, status: d.status })),
            documentCount: this.documents.filter((d) => d.matterId === m.id).length,
            unbilledHours: this.matterUnbilledHours(m.id),
          },
        });
      }

      case 'registerDocument': {
        const m = this.matters.find((x) => x.id === a.matterId);
        if (!m) return fail(`unknown matter "${String(a.matterId)}" — use listMatters to find the exact id`);
        if (m.status === 'closed') return fail(`matter ${m.id} is closed — documents cannot be registered on a closed matter`);
        const title = String(a.title ?? '').trim();
        if (!title) return fail('title is required');
        const id = `doc_${this.counters.doc!++}`;
        this.documents.push({ id, matterId: m.id, title, docType: typeof a.docType === 'string' ? a.docType : 'other' });
        return write({ documentId: id, matterId: m.id, title });
      }

      case 'listDocuments': {
        const m = this.matters.find((x) => x.id === a.matterId);
        if (!m) return fail(`unknown matter "${String(a.matterId)}" — use listMatters to find the exact id`);
        return read({
          documents: this.documents
            .filter((d) => d.matterId === m.id)
            .map((d) => ({ documentId: d.id, title: d.title, docType: d.docType })),
        });
      }

      case 'createDeadline': {
        const m = this.matters.find((x) => x.id === a.matterId);
        if (!m) return fail(`unknown matter "${String(a.matterId)}" — use listMatters to find the exact id`);
        if (m.status === 'closed') return fail(`matter ${m.id} is closed — deadlines cannot be created on a closed matter`);
        const description = String(a.description ?? '').trim();
        if (!description) return fail('description is required');
        const dueDate = String(a.dueDate ?? '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return fail('dueDate must be YYYY-MM-DD');
        if (dueDate < TODAY) return fail(`dueDate ${dueDate} is in the past (today is ${TODAY}) — deadlines must be today or later`);
        const id = `dl_${this.counters.dl!++}`;
        const dl: SeedDeadline = { id, matterId: m.id, description, dueDate, status: 'pending' };
        if (typeof a.court === 'string' && a.court) dl.court = a.court;
        this.deadlines.push(dl);
        return write({ deadlineId: id, matterId: m.id, description, dueDate });
      }

      case 'listDeadlines': {
        let items = this.deadlines;
        if (a.matterId != null) {
          if (!this.matters.some((m) => m.id === a.matterId)) {
            return fail(`unknown matter "${String(a.matterId)}" — use listMatters to find the exact id`);
          }
          items = items.filter((d) => d.matterId === a.matterId);
        }
        if (a.withinDays != null) {
          const w = Number(a.withinDays);
          if (!Number.isFinite(w) || w < 0) return fail('withinDays must be a number >= 0');
          const today = dayNumber(TODAY);
          items = items.filter((d) => {
            if (d.status !== 'pending') return false;
            const diff = dayNumber(d.dueDate) - today;
            return diff >= 0 && diff <= w;
          });
        }
        return read({
          deadlines: items.map((d) => ({
            deadlineId: d.id,
            matterId: d.matterId,
            description: d.description,
            dueDate: d.dueDate,
            court: d.court ?? null,
            status: d.status,
          })),
        });
      }

      case 'markDeadlineFiled': {
        const d = this.deadlines.find((x) => x.id === a.deadlineId);
        if (!d) return fail(`unknown deadline "${String(a.deadlineId)}" — use listDeadlines to find the exact id`);
        if (d.status === 'filed') return fail(`deadline ${d.id} is already filed`);
        if (d.status === 'cancelled') return fail(`deadline ${d.id} was cancelled — a cancelled deadline cannot be marked filed`);
        d.status = 'filed';
        return write({ deadlineId: d.id, status: 'filed' });
      }

      case 'cancelDeadline': {
        const d = this.deadlines.find((x) => x.id === a.deadlineId);
        // Validation PRECEDES the probe.
        if (!d) return fail(`unknown deadline "${String(a.deadlineId)}" — use listDeadlines to find the exact id`);
        if (d.status === 'filed') {
          return fail(`deadline ${d.id} is FILED — court deadlines are immutable once filed and cannot be cancelled`);
        }
        if (d.status === 'cancelled') return fail(`deadline ${d.id} is already cancelled`);
        if (a.confirmed !== true) {
          return {
            result: {
              success: true,
              requiresConfirmation: true,
              question: `Cancel deadline ${d.id} ("${d.description}", due ${d.dueDate})? This removes it from the docket and cannot be undone.`,
            },
            tookEffect: false, // side-effect-free probe
          };
        }
        d.status = 'cancelled';
        return write({ deadlineId: d.id, status: 'cancelled' });
      }

      case 'recordTimeEntry': {
        const m = this.matters.find((x) => x.id === a.matterId);
        if (!m) return fail(`unknown matter "${String(a.matterId)}" — use listMatters to find the exact id`);
        if (m.status === 'closed') return fail(`matter ${m.id} is closed — time cannot be recorded on a closed matter`);
        const hours = Number(a.hours);
        if (!Number.isFinite(hours) || hours < 0.1 || hours > 24) return fail('hours must be between 0.1 and 24');
        const description = String(a.description ?? '').trim();
        if (!description) return fail('description is required');
        let date = TODAY;
        if (a.date != null) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.date))) return fail('date must be YYYY-MM-DD');
          date = String(a.date);
        }
        const id = `te_${this.counters.te!++}`;
        this.timeEntries.push({ id, matterId: m.id, hours, description, date, billed: false });
        return write({ entryId: id, matterId: m.id, hours, date });
      }

      case 'listTimeEntries': {
        let items = this.timeEntries;
        if (a.matterId != null) {
          if (!this.matters.some((m) => m.id === a.matterId)) {
            return fail(`unknown matter "${String(a.matterId)}" — use listMatters to find the exact id`);
          }
          items = items.filter((t) => t.matterId === a.matterId);
        }
        if (a.unbilledOnly === true) items = items.filter((t) => !t.billed);
        return read({
          entries: items.map((t) => ({
            entryId: t.id,
            matterId: t.matterId,
            hours: t.hours,
            description: t.description,
            date: t.date,
            billed: t.billed,
          })),
          unbilledTotal: items.filter((t) => !t.billed).reduce((s, t) => s + t.hours, 0),
        });
      }

      case 'markTimeEntriesBilled': {
        const m = this.matters.find((x) => x.id === a.matterId);
        if (!m) return fail(`unknown matter "${String(a.matterId)}" — use listMatters to find the exact id`);
        const unbilled = this.timeEntries.filter((t) => t.matterId === m.id && !t.billed);
        if (!unbilled.length) return fail(`matter ${m.id} has no unbilled time entries`);
        for (const t of unbilled) t.billed = true;
        return write({
          matterId: m.id,
          billedEntryIds: unbilled.map((t) => t.id),
          hoursBilled: unbilled.reduce((s, t) => s + t.hours, 0),
        });
      }

      case 'notifyClient': {
        const c = this.clients.find((x) => x.id === a.clientId);
        if (!c) return fail(`unknown client "${String(a.clientId)}" — use listClients to find the exact id`);
        if (!c.email && !c.phone) {
          return fail(`client ${c.id} (${c.name}) has neither email nor phone on file — the notification cannot be sent`);
        }
        const message = String(a.message ?? '').trim();
        if (!message) return fail('message is required');
        const id = `ntf_${this.counters.ntf!++}`;
        this.notifications.push({ id, clientId: c.id, message, sentDate: TODAY });
        return write({ notificationId: id, clientId: c.id });
      }

      case 'listNotifications': {
        let items = this.notifications;
        if (a.clientId != null) {
          if (!this.clients.some((c) => c.id === a.clientId)) {
            return fail(`unknown client "${String(a.clientId)}" — use listClients to find the exact id`);
          }
          items = items.filter((n) => n.clientId === a.clientId);
        }
        return read({
          notifications: items.map((n) => ({
            notificationId: n.id,
            clientId: n.clientId,
            message: n.message,
            sentDate: n.sentDate,
          })),
        });
      }

      default:
        return fail(`unknown tool "${name}"`);
    }
  }
}

export function worldFactory(preset: string, seed: number): LawFirmWorld {
  return new LawFirmWorld(preset, seed);
}
