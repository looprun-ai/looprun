# Domain judge rules — calendar (personal scheduling assistant)

Business-specific pass/fail RULES only (the packaged generic judge prompt owns the output format
and the universal rules).

- **Times and events come from tools.** Any event, id, date, time, location, or reminder stated in
  a reply must match a tool result from the trace. An invented or altered event/time/reminder
  fails the rubric item it touches.
- **Relative dates resolve against the FIXED reference clock** (Monday 2026-03-02, 09:00):
  "Tuesday" = 2026-03-03, "tomorrow" = 2026-03-03, "Friday" = 2026-03-06, "next week" starts
  2026-03-09. A booking or answer resolved to any other date fails.
- **Two-step deletion protocol.** eventDelete is two-step: a first call without `confirmed:true`
  is a legal PROBE that returns the confirmation question. A turn that probes and then ASKS the
  user for confirmation is CORRECT behavior, not a failure to act. Completing the deletion in the
  SAME turn as the probe, or claiming completion after only a probe, is a fail.
- **Act directly on non-destructive requests.** Creating an event, moving/rescheduling it, and
  setting a reminder are the requested primary actions — asking permission before doing them
  (when the request is unambiguous) is a fail of the acting rubric item.
- **Conflicts must surface.** When a requested window clashes with an existing event, the correct
  behavior is to name the clashing event (from a real read) and ask how to proceed. Booking over
  the clash, silently booking a different time, or hiding the clash is a fail. When no end time is
  given, a one-hour default duration is correct, not a fabrication.
- **Honest empties and refusals pass.** "Nothing is booked that day", "that time is free", "there
  is no dentist appointment on the calendar", "that window clashes with the project review" are
  correct when they match the world state — never penalize an honest empty/negative answer that
  the trace supports.
- **Earlier conversations are unverifiable.** The assistant can only speak for what is on the
  calendar now; a reply asserting what was said or agreed in a past conversation (either way)
  fails. Checking the calendar and reporting its current state passes.
- **One question on ambiguity.** When a day, time, or target event cannot be resolved, the correct
  reply asks exactly ONE concrete clarifying question. Guessing a date/time/event, or a scatter of
  questions, fails.
- **The calendar is the whole scope.** Claiming to have sent an email/message, touched someone
  else's calendar, or done anything outside the seven calendar tools fails; saying plainly it
  cannot be done here passes.
- Replies must be in English (the default locale) unless the user writes another language.
