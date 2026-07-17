/**
 * src/world/world.ts — the deterministic calendar world (Stage G2 step 2).
 *
 * A pure in-memory world: NO I/O, NO clock, NO randomness (the guard-purity lints apply to worlds
 * the same as guards). The fixed REFERENCE_NOW constant (a Monday, 09:00) drives ALL relative-date
 * resolution; datetimes are naive ISO `YYYY-MM-DDTHH:mm` strings compared lexicographically, and
 * the only datetime arithmetic (reminder fire times) is pure integer civil-date math. Destructive
 * probes (`confirmed` absent/false) are side-effect-free and return
 * `{ success: true, requiresConfirmation: true, question }`. `advanceTurn()` only increments the
 * turn counter — it never auto-finishes a user-gated two-step action.
 */
import type { AgentWorld } from 'looprun';
import { buildPreset, type EventRec, type ReminderRec, type WorldData } from './presets.js';

/** The fixed world clock (never a real clock). A Monday, 09:00. */
export const REFERENCE_NOW = '2026-03-02T09:00';
export const REFERENCE_TODAY = '2026-03-02';
export const REFERENCE_WEEKDAY = 'Monday';
/** The week around the reference day — the resolution table for relative dates ("Tuesday", "Friday"). */
export const WEEK_MAP =
  'Mon 2026-03-02 · Tue 2026-03-03 · Wed 2026-03-04 · Thu 2026-03-05 · Fri 2026-03-06 · ' +
  'Sat 2026-03-07 · Sun 2026-03-08 (next week starts Mon 2026-03-09)';

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

type ToolResult = { success: boolean; [k: string]: unknown };

const fail = (error: string): ToolResult => ({ success: false, error });

// ── pure civil-date minute arithmetic (no Date, no clock) ────────────────────────────────────────

/** Days since 1970-01-01 for a civil date (Howard Hinnant's algorithm — pure integer math). */
function daysFromCivil(y: number, m: number, d: number): number {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(z: number): { y: number; m: number; d: number } {
  z += 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: y + (m <= 2 ? 1 : 0), m, d };
}

/** `YYYY-MM-DDTHH:mm` → minutes since 1970-01-01T00:00 (naive, timezone-free). */
function toMinutes(dt: string): number {
  const y = Number(dt.slice(0, 4));
  const m = Number(dt.slice(5, 7));
  const d = Number(dt.slice(8, 10));
  const hh = Number(dt.slice(11, 13));
  const mm = Number(dt.slice(14, 16));
  return daysFromCivil(y, m, d) * 1440 + hh * 60 + mm;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Minutes since 1970-01-01T00:00 → `YYYY-MM-DDTHH:mm`. */
function fromMinutes(total: number): string {
  const days = Math.floor(total / 1440);
  const rem = total - days * 1440;
  const { y, m, d } = civilFromDays(days);
  return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}T${pad(Math.floor(rem / 60))}:${pad(rem % 60)}`;
}

export class CalendarWorld implements AgentWorld {
  readonly preset: string;
  readonly seed: number;
  /** Ledger of executed calls (host-visible; NOT the runtime's observed ledger). */
  toolCalls: Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }> = [];
  sseActions: unknown[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;

  private data: WorldData;
  private turn = 0;
  private deletedEvents: EventRec[] = [];
  private removedReminders: string[] = [];
  private nextEventNum: number;
  private nextReminderNum: number;

  constructor(preset: string, seed: number) {
    this.preset = preset;
    this.seed = seed;
    this.data = buildPreset(preset);
    this.nextEventNum = 1 + this.data.events.reduce((m, e) => Math.max(m, Number(e.id.slice(4)) || 0), 100);
    this.nextReminderNum = 1 + this.data.reminders.reduce((m, r) => Math.max(m, Number(r.id.slice(4)) || 0), 0);
  }

  // ── runtime seams ──────────────────────────────────────────────────────────────────────────────

  advanceTurn(): void {
    this.turn += 1; // counter ONLY — never auto-completes a pending two-step action
  }

  ingestAttachment(url: string): string {
    const label = `att_${this.toolCalls.length + 1}_${url.length}`;
    return label; // deterministic label; the calendar domain takes no attachments
  }

  exec(name: string, args: Record<string, unknown>): unknown {
    const result = this.dispatch(name, args ?? {});
    const tookEffect = result.success === true && result.requiresConfirmation !== true && this.isWrite(name);
    this.toolCalls.push({ name, args, result, tookEffect });
    return result;
  }

  // ── accessors (the ONLY per-id state guards may read, via closures) ────────────────────────────

  hasEvent(eventId: string): boolean {
    return this.data.events.some((e) => e.id === eventId);
  }

  hasReminder(reminderId: string): boolean {
    return this.data.reminders.some((r) => r.id === reminderId);
  }

  /** An evt_ id that was ever real: on the calendar now, or deleted THIS conversation.
   *  The reply guards' `refExists` seam — an honest "deleted evt_103" must not read as invented. */
  knownEventId(eventId: string): boolean {
    return this.hasEvent(eventId) || this.deletedEvents.some((e) => e.id === eventId);
  }

  /** A rem_ id that was ever real: set now, or removed with its event THIS conversation. */
  knownReminderId(reminderId: string): boolean {
    return this.hasReminder(reminderId) || this.removedReminders.includes(reminderId);
  }

  eventWindow(eventId: string): { start: string; end: string } | null {
    const e = this.data.events.find((x) => x.id === eventId);
    return e ? { start: e.start, end: e.end } : null;
  }

  /** Events overlapping the window [start, end) — the double-booking discriminator. */
  conflictsFor(start: string, end: string, excludeId?: string): Array<{ eventId: string; title: string; start: string; end: string }> {
    return this.data.events
      .filter((e) => e.id !== excludeId && e.start < end && start < e.end)
      .map((e) => ({ eventId: e.id, title: e.title, start: e.start, end: e.end }));
  }

  // ── deterministic end-state accessors (eval harness ground truth) ──────────────────────────────

  eventsSnapshot(): EventRec[] {
    return this.data.events.map((e) => ({ ...e }));
  }

  remindersSnapshot(): ReminderRec[] {
    return this.data.reminders.map((r) => ({ ...r }));
  }

  deletedEventIds(): string[] {
    return this.deletedEvents.map((e) => e.id);
  }

  /** The flat state snapshot deterministic checks + the theme stateBlock may read. */
  projection(): Record<string, unknown> {
    return {
      referenceNow: REFERENCE_NOW,
      referenceToday: REFERENCE_TODAY,
      referenceWeekday: REFERENCE_WEEKDAY,
      weekMap: WEEK_MAP,
      eventCount: this.data.events.length,
      eventsTodayCount: this.data.events.filter((e) => e.start.slice(0, 10) === REFERENCE_TODAY).length,
      reminderCount: this.data.reminders.length,
      eventsDeletedThisConversation: this.deletedEvents.length,
    };
  }

  // ── dispatch ───────────────────────────────────────────────────────────────────────────────────

  private isWrite(name: string): boolean {
    return ['eventCreate', 'eventUpdate', 'eventDelete', 'reminderSet'].includes(name);
  }

  private dispatch(name: string, args: Record<string, unknown>): ToolResult {
    switch (name) {
      // terminal tools are runtime-owned; the world just acknowledges them
      case 'replyToUser':
      case 'askUser':
        return { success: true };

      case 'eventsList': return this.eventsList(args);
      case 'eventGet': return this.eventGet(args);
      case 'eventCreate': return this.eventCreate(args);
      case 'eventUpdate': return this.eventUpdate(args);
      case 'eventDelete': return this.eventDelete(args);
      case 'reminderSet': return this.reminderSet(args);
      case 'availabilityCheck': return this.availabilityCheck(args);

      default:
        return fail(`unknown tool "${name}"`);
    }
  }

  // ── shared validation ──────────────────────────────────────────────────────────────────────────

  private requireEvent(eventId: unknown): EventRec | ToolResult {
    if (typeof eventId !== 'string' || !eventId) return fail('eventId is required');
    const e = this.data.events.find((x) => x.id === eventId);
    if (!e) return fail(`unknown eventId "${eventId}" — look it up with eventsList`);
    return e;
  }

  private validWindow(start: unknown, end: unknown): { start: string; end: string } | ToolResult {
    if (typeof start !== 'string' || !DATETIME_RE.test(start)) return fail('start must be YYYY-MM-DDTHH:mm');
    if (typeof end !== 'string' || !DATETIME_RE.test(end)) return fail('end must be YYYY-MM-DDTHH:mm');
    if (!(start < end)) return fail('end must be after start');
    return { start, end };
  }

  private eventView(e: EventRec) {
    return { eventId: e.id, title: e.title, start: e.start, end: e.end, location: e.location ?? null };
  }

  private reminderView(r: ReminderRec) {
    const event = this.data.events.find((e) => e.id === r.eventId);
    return {
      reminderId: r.id,
      eventId: r.eventId,
      offsetMinutes: r.offsetMinutes,
      firesAt: event ? fromMinutes(toMinutes(event.start) - r.offsetMinutes) : null,
    };
  }

  // ── events ─────────────────────────────────────────────────────────────────────────────────────

  private eventsList(args: Record<string, unknown>): ToolResult {
    const from = typeof args.from === 'string' && args.from ? args.from : null;
    const to = typeof args.to === 'string' && args.to ? args.to : null;
    if (from && !DATETIME_RE.test(from)) return fail('from must be YYYY-MM-DDTHH:mm');
    if (to && !DATETIME_RE.test(to)) return fail('to must be YYYY-MM-DDTHH:mm');
    const events = this.data.events
      .filter((e) => (!from || e.start >= from) && (!to || e.start <= to))
      .slice()
      .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
      .map((e) => this.eventView(e));
    return { success: true, referenceNow: REFERENCE_NOW, count: events.length, events };
  }

  private eventGet(args: Record<string, unknown>): ToolResult {
    const e = this.requireEvent(args.eventId);
    if ('success' in e) return e;
    const reminders = this.data.reminders.filter((r) => r.eventId === e.id).map((r) => this.reminderView(r));
    return { success: true, event: this.eventView(e), reminders };
  }

  private eventCreate(args: Record<string, unknown>): ToolResult {
    const title = typeof args.title === 'string' ? args.title.trim() : '';
    if (!title) return fail('title is required');
    const win = this.validWindow(args.start, args.end);
    if ('success' in win) return win;
    if (win.start < REFERENCE_NOW) return fail(`start ${win.start} is in the past (now is ${REFERENCE_NOW}) — events cannot be created in the past`);
    const conflicts = this.conflictsFor(win.start, win.end);
    if (conflicts.length) {
      return { success: false, error: 'the requested window clashes with an existing event — not booked', conflicts };
    }
    const e: EventRec = {
      id: `evt_${this.nextEventNum++}`,
      title,
      start: win.start,
      end: win.end,
      ...(typeof args.location === 'string' && args.location.trim() ? { location: args.location.trim() } : {}),
    };
    this.data.events.push(e);
    return { success: true, ...this.eventView(e) };
  }

  private eventUpdate(args: Record<string, unknown>): ToolResult {
    const e = this.requireEvent(args.eventId);
    if ('success' in e) return e;
    const changed: string[] = [];
    let start = e.start;
    let end = e.end;
    if (args.start !== undefined) {
      if (typeof args.start !== 'string' || !DATETIME_RE.test(args.start)) return fail('start must be YYYY-MM-DDTHH:mm');
      start = args.start;
      changed.push('start');
    }
    if (args.end !== undefined) {
      if (typeof args.end !== 'string' || !DATETIME_RE.test(args.end)) return fail('end must be YYYY-MM-DDTHH:mm');
      end = args.end;
      changed.push('end');
    }
    if (!(start < end)) return fail('end must be after start');
    if (changed.length && start < REFERENCE_NOW) return fail(`start ${start} is in the past (now is ${REFERENCE_NOW}) — events cannot be moved into the past`);
    const conflicts = changed.length ? this.conflictsFor(start, end, e.id) : [];
    if (conflicts.length) {
      return { success: false, error: 'the new window clashes with an existing event — not moved', conflicts };
    }
    if (typeof args.title === 'string' && args.title.trim()) { e.title = args.title.trim(); changed.push('title'); }
    if (typeof args.location === 'string' && args.location.trim()) { e.location = args.location.trim(); changed.push('location'); }
    if (!changed.length) return fail('nothing to update — pass title, start, end, or location');
    e.start = start;
    e.end = end;
    return { success: true, updated: changed, ...this.eventView(e) };
  }

  private eventDelete(args: Record<string, unknown>): ToolResult {
    const e = this.requireEvent(args.eventId);
    if ('success' in e) return e;
    if (args.confirmed !== true) {
      return {
        success: true,
        requiresConfirmation: true,
        question: `Delete "${e.title}" (${e.id}, ${e.start}–${e.end.slice(11)})? This removes it from the calendar and cannot be undone.`,
      };
    }
    const removedReminderIds = this.data.reminders.filter((r) => r.eventId === e.id).map((r) => r.id);
    this.removedReminders.push(...removedReminderIds);
    this.data.reminders = this.data.reminders.filter((r) => r.eventId !== e.id);
    this.data.events = this.data.events.filter((x) => x.id !== e.id);
    this.deletedEvents.push(e);
    return { success: true, deletedEventId: e.id, title: e.title, removedReminderIds };
  }

  // ── reminders ──────────────────────────────────────────────────────────────────────────────────

  private reminderSet(args: Record<string, unknown>): ToolResult {
    const e = this.requireEvent(args.eventId);
    if ('success' in e) return e;
    const offset = args.offsetMinutes;
    if (typeof offset !== 'number' || !Number.isInteger(offset) || offset <= 0) {
      return fail('offsetMinutes must be a positive integer (minutes before the event start)');
    }
    const dup = this.data.reminders.find((r) => r.eventId === e.id && r.offsetMinutes === offset);
    if (dup) return fail(`a reminder ${offset} minutes before ${e.id} already exists (${dup.id}) — duplicates are rejected`);
    const r: ReminderRec = { id: `rem_${String(this.nextReminderNum++).padStart(3, '0')}`, eventId: e.id, offsetMinutes: offset };
    this.data.reminders.push(r);
    return { success: true, ...this.reminderView(r), eventTitle: e.title };
  }

  // ── availability ───────────────────────────────────────────────────────────────────────────────

  private availabilityCheck(args: Record<string, unknown>): ToolResult {
    const win = this.validWindow(args.start, args.end);
    if ('success' in win) return win;
    const conflicts = this.conflictsFor(win.start, win.end);
    return { success: true, start: win.start, end: win.end, available: conflicts.length === 0, conflicts };
  }
}

/** The eval harness seam: a fresh deterministic world per case run (`seed` = the rep index). */
export function worldFactory(preset: string, seed: number): CalendarWorld {
  return new CalendarWorld(preset, seed);
}
