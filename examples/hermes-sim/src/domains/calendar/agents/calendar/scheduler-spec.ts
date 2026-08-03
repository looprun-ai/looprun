/**
 * scheduler — the whole personal calendar: add, check, reschedule, cancel, remind.
 *
 * Bucket: ONE agent (7 tools, well under the ≤15 decomposition bound — no split is warranted).
 * AgentSpecBase installs the confirm-first + throttle protocol on eventDelete (the sole destructive
 * tool); the always-on reply-honesty invariant (noFalseFailureClaim) installs from
 * cfg.lexicon.falseFailureClaimRe — never re-add either.
 *
 * // UNCHECKABLE: never book, move, or delete from a guessed/unresolvable day or time — when the
 * //              message plus the fixed reference date cannot resolve it, ask ONE concrete question
 * //              (conditioned prose + eval dimension only; cases 07/12).
 * // UNCHECKABLE: claims about EARLIER conversations ("the appointment we talked about yesterday")
 * //              are unverifiable — only the calendar's current state is known; the reply must say
 * //              so (conditioned prose + eval dimension only; case 09).
 * // UNCHECKABLE: nothing beyond this calendar — no emails/messages to other people, no other
 * //              people's calendars, no video links; say plainly it cannot be done here and never
 * //              claim it was (conditioned prose + eval dimension only; case 13).
 */
// NOTE (no-regex law, 2026-08-02): the former regex-param honesty guards (noFabricatedSuccess,
// destructiveClaimRequiresSuccess) and the lexicon-fed noFalseFailureClaim are DELETED — text judgment is
// now llmCheck's job. This EXAMPLE bundle is not re-authored here (porting bundles is out of scope for the
// purge); it keeps only the structural guards so it compiles on the new surface.
import { AgentSpecBase, custom, jargonScrub, pendingConfirmMustAsk, requiresBefore } from 'looprun';
import { CALENDAR_CONTRACT } from './contract.js';

/** The per-id state reads the calendar gates need (world accessors via the ctx closure). */
type CalendarStateReader = {
  hasEvent?: (eventId: string) => boolean;
  knownEventId?: (eventId: string) => boolean;
  knownReminderId?: (reminderId: string) => boolean;
  eventWindow?: (eventId: string) => { start: string; end: string } | null;
  conflictsFor?: (start: string, end: string, excludeId?: string) => Array<{ eventId: string; title: string; start: string; end: string }>;
};

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const describeClash = (conflicts: Array<{ eventId: string; title: string; start: string; end: string }>): string =>
  conflicts.map((c) => `"${c.title}" (${c.eventId}, ${c.start}–${c.end.slice(11)})`).join(', ');

export class AgentSpecScheduler extends AgentSpecBase {
  constructor() {
    super({
      id: 'scheduler',
      mode: 'CALENDAR',
      // REQUIRED per-agent persona (persona-on-spec law) — rendered as the FIRST Behavior bullet.
      persona:
        'You are the scheduling agent: the personal calendar — adding, checking, and rescheduling ' +
        'events, cancelling them, and setting reminders.',
      tools: [
        'eventsList',
        'eventGet',
        'eventCreate',
        'eventUpdate',
        'eventDelete',
        'reminderSet',
        'availabilityCheck',
      ],
      destructiveTools: ['eventDelete'],
      contract: CALENDAR_CONTRACT,
      behavior: [
        // Load-bearing lines first (after the runtime-prepended persona). Each SPECIALIZES a contract
        // invariant — it never re-declares one.
        'When the user gives an event and a resolvable day and time, book it this turn: check the window with availabilityCheck, then call eventCreate; when no end time is given, book one hour.',
        'When the requested window clashes, do not book anything this turn — name the clashing event exactly (real evt_ id, title, time) and ask whether to pick another time or move the existing event; never book a different slot the user did not ask for.',
        'To reschedule or cancel, resolve the exact evt_ id from eventsList first; when nothing on the calendar matches the description, say so plainly — never move or delete a guessed event, and never invent one to act on.',
        'When moving an event to a new time, keep its recorded duration unless the user says otherwise, and when the new window clashes, report the clash instead of moving it.',
        'A reminder belongs to a real event: call reminderSet with the exact evt_ id from the calendar and the offset in minutes ("the day before" = 1440, "an hour before" = 60), and confirm with the event title and the exact time the reminder fires.',
        'When asked about the schedule, read eventsList for the requested range and report exactly what it returns — an empty day is reported as free, never filled in; reminders are read per event with eventGet.',
        'When asked whether something was arranged in an earlier conversation, check the calendar and report what is ON it now — you cannot verify what was said before this conversation, so say that plainly; never claim an earlier request was or was not carried out.',
        'When a request needs anything beyond this calendar — emails or messages to other people, someone else\'s calendar, video links — say plainly you cannot do that here and never claim it was done.',
        'When the day, time, or target event of a request cannot be resolved, ask ONE concrete question before calling any write.',
      ],
    });

    // Spatial gate: booking requires having checked the window this conversation (the
    // availability-before-booking law; the world also rejects a conflicting create — defense in depth).
    this.addGuard('preTool', ['eventCreate'], requiresBefore(['availabilityCheck']), { id: 'agent:availabilityBeforeCreate' });

    // Run gate (deterministic, state-keyed): a clashing window is decidable from the world BEFORE
    // execution — deny with a surface-the-clash correction instead of executing into a world error.
    this.addGuard(
      'preTool',
      ['eventCreate'],
      custom({
        kind: 'noDoubleBook',
        dim: 'run',
        check: (ctx) => {
          const w = ctx.world as CalendarStateReader;
          const start = typeof ctx.args.start === 'string' ? ctx.args.start : '';
          const end = typeof ctx.args.end === 'string' ? ctx.args.end : '';
          if (!DATETIME_RE.test(start) || !DATETIME_RE.test(end)) return null; // malformed → world reports it honestly
          const conflicts = w.conflictsFor?.(start, end) ?? [];
          return conflicts.length
            ? `The requested window clashes with ${describeClash(conflicts)} — do NOT book it. Tell the user about the clash and ask whether to pick another time or move the existing event.`
            : null;
        },
        prose: () => 'a window that clashes with an existing event is never booked — surface the clashing event to the user and ask how to proceed',
      }),
      { id: 'agent:noDoubleBook' },
    );

    // Run gate: moving an event into a clashing window is equally decidable — same law, self-excluded.
    this.addGuard(
      'preTool',
      ['eventUpdate'],
      custom({
        kind: 'noDoubleBookOnMove',
        dim: 'run',
        check: (ctx) => {
          const w = ctx.world as CalendarStateReader;
          if (ctx.args.start === undefined && ctx.args.end === undefined) return null; // title/location edit — no window change
          const id = typeof ctx.args.eventId === 'string' ? ctx.args.eventId : '';
          const current = w.eventWindow?.(id) ?? null;
          if (!current) return null; // unknown event → world reports it honestly
          const start = typeof ctx.args.start === 'string' ? ctx.args.start : current.start;
          const end = typeof ctx.args.end === 'string' ? ctx.args.end : current.end;
          if (!DATETIME_RE.test(start) || !DATETIME_RE.test(end)) return null;
          const conflicts = w.conflictsFor?.(start, end, id) ?? [];
          return conflicts.length
            ? `The new window clashes with ${describeClash(conflicts)} — do NOT move it. Tell the user about the clash and ask how to proceed.`
            : null;
        },
        prose: () => 'an event is never moved into a window that clashes with another event — surface the clash and ask how to proceed',
      }),
      { id: 'agent:noDoubleBookOnMove' },
    );

    // Input gate (the label-exists pattern): a reminder attaches only to a REAL event id read this
    // conversation — never a guessed one.
    this.addGuard(
      'preTool',
      ['reminderSet'],
      custom({
        kind: 'reminderNeedsRealEvent',
        dim: 'input',
        check: (ctx) => {
          const w = ctx.world as CalendarStateReader;
          const id = typeof ctx.args.eventId === 'string' ? ctx.args.eventId : '';
          return w.hasEvent?.(id)
            ? null
            : `Unknown eventId "${id}" — a reminder attaches to a REAL event. Look the event up with eventsList first; when nothing matches, tell the user instead of guessing.`;
        },
        prose: () => 'a reminder is set only on a real evt_ id read from the calendar — when the event cannot be found, say so instead of guessing an id',
      }),
      { id: 'agent:reminderNeedsRealEvent' },
    );

    // Reply honesty (structural): relay a pending confirmation as an `ask` intention in the turn's `did`.
    this.addReplyCheck(pendingConfirmMustAsk(), { id: 'agent:pendingConfirmMustAsk' });
    // The former honesty reply-checks (destructiveClaimRequiresSuccess, noFabricatedSuccess ×2) were
    // regex-param text judgments — deleted with the no-regex law. In a re-authored bundle those become
    // llmCheck rubrics; this example drops them rather than porting.

    // Egress scrub: internal field jargon → user words.
    this.addMutator(
      jargonScrub({
        eventId: 'event ID',
        offsetMinutes: 'minutes before',
      }),
      { id: 'agent:jargonScrub' },
    );
  }
}

export default new AgentSpecScheduler();
