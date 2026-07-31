/**
 * The scheduler world — state plus tool execution (tutorial 03).
 *
 * Hand-writing an `AgentWorld` is the certified path. It is pure and in-memory: no clock, no I/O,
 * no randomness, so a run is reproducible. `exec` returns `{ success, … }` results; the extra
 * accessors (`clashesWith`, `hasEvent`) are what stateful guards read through `ctx.world`.
 */
import type { AgentWorld } from 'looprun';
import { DATETIME_PATTERN, REFERENCE_NOW } from './contract.ts';

/** Defence in depth: the guards reject a malformed date-time, and so does the world. */
const DATETIME_RE = new RegExp(DATETIME_PATTERN);

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
}

type ToolResult = { success: boolean; [k: string]: unknown };

/** A fixed seed calendar, positioned around {@link REFERENCE_NOW}. */
export const SEED_EVENTS: CalendarEvent[] = [
  { id: 'evt_101', title: 'Standup', start: '2026-03-02T10:00', end: '2026-03-02T10:30' },
  { id: 'evt_102', title: 'Dentist', start: '2026-03-04T15:00', end: '2026-03-04T16:00' },
];

export class SchedulerWorld implements AgentWorld {
  toolCalls: Array<{ name: string; args: unknown; result?: unknown; tookEffect?: boolean }> = [];
  sseActions: unknown[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;

  private events: CalendarEvent[];
  private nextId = 103;

  constructor(events: readonly CalendarEvent[] = SEED_EVENTS) {
    this.events = events.map((e) => ({ ...e }));
  }

  // ── runtime seams ────────────────────────────────────────────────────────────
  advanceTurn(): void {} // no per-turn state to roll
  ingestAttachment(url: string): string {
    return url; // the calendar has no attachment store: hand the url straight back
  }

  exec(name: string, args: Record<string, unknown>): ToolResult {
    const result = this.dispatch(name, args ?? {});
    const tookEffect = result.success === true && result.requiresConfirmation !== true && name !== 'listEvents';
    this.toolCalls.push({ name, args, result, tookEffect });
    return result;
  }

  // ── state reads guards use ───────────────────────────────────────────────────
  hasEvent(eventId: string): boolean {
    return this.events.some((e) => e.id === eventId);
  }

  /** Events overlapping `[start, end)` — the "never double-book" discriminator. */
  clashesWith(start: string, end: string): CalendarEvent[] {
    return this.events.filter((e) => e.start < end && start < e.end);
  }

  snapshot(): CalendarEvent[] {
    return this.events.map((e) => ({ ...e }));
  }

  // ── tools ────────────────────────────────────────────────────────────────────
  private dispatch(name: string, args: Record<string, unknown>): ToolResult {
    const str = (k: string): string => (typeof args[k] === 'string' ? (args[k] as string) : '');
    switch (name) {
      case 'listEvents':
        return { success: true, events: this.snapshot() };

      case 'addEvent': {
        const [title, start, end] = [str('title'), str('start'), str('end')];
        if (!title) return { success: false, error: 'title is required' };
        if (!DATETIME_RE.test(start) || !DATETIME_RE.test(end)) return { success: false, error: 'start and end must be YYYY-MM-DDTHH:mm' };
        if (!(start < end)) return { success: false, error: 'end must be after start' };
        if (start < REFERENCE_NOW) return { success: false, error: `start ${start} is in the past (now is ${REFERENCE_NOW})` };
        const clashes = this.clashesWith(start, end);
        if (clashes.length) return { success: false, error: 'the window clashes with an existing event — not booked', clashes };
        const event: CalendarEvent = { id: `evt_${this.nextId++}`, title, start, end };
        this.events = [...this.events, event];
        return { success: true, ...event };
      }

      case 'cancelEvent': {
        const eventId = str('eventId');
        const event = this.events.find((e) => e.id === eventId);
        if (!event) return { success: false, error: `unknown eventId "${eventId}" — look it up with listEvents` };
        if (args.confirmed !== true) {
          return { success: true, requiresConfirmation: true, question: `Cancel "${event.title}" (${event.id})? This cannot be undone.` };
        }
        this.events = this.events.filter((e) => e.id !== eventId);
        return { success: true, cancelledEventId: event.id, title: event.title };
      }

      default:
        return { success: false, error: `unknown tool "${name}"` };
    }
  }
}
