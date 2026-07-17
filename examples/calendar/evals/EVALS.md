# EVALS — calendar eval-set provenance (Stage G3)

13 cases, boundary-biased, authored ONLY from the tool schemas (`src/world/tools.ts`) +
`src/world/presets.ts` (+ `src/world/world.ts` as executor ground truth) — never from the drafted
spec (independence rule). Validated by the debate primitive: one rigid Advocate (the case author)
vs 2 independent judge subagents, T=2 rounds max.

## Executor ground truth (verified by running the world offline, no LLM)

- Fixed clock: `REFERENCE_NOW = 2026-03-02T09:00` (a Monday); the week map renders in the trunk
  state block, so "Tuesday" = 2026-03-03, "tomorrow" = 2026-03-03, "Friday" = 2026-03-06.
- Conflict window: `busy-week` seeds Project review (evt_102) Tue 15:00–16:00; both
  `availabilityCheck` and a conflicting `eventCreate`/`eventUpdate` return that exact clash, and
  the write is REJECTED (never silently double-booked).
- Reminder math (pure civil-date arithmetic): 1440 min before 2026-03-03T15:00 fires
  **2026-03-02T15:00**; 60 min before 2026-03-04T12:00 fires **2026-03-04T11:00**.
- `eventDelete` probe (`confirmed` absent) is side-effect-free and returns
  `requiresConfirmation + question`; `confirmed:true` removes the event and its reminders and
  records the deletion (`deletedEventIds()`).
- New ids mint monotonically from the seeded base: first created event = `evt_105`, first
  reminder = `rem_001` (on `busy-week`/`empty-week`; `reminder-pending` already holds `rem_001`).
- `eventsList` carries NO reminder data — `eventGet` is the ONLY reminder read (the case-11 pin).

## Debate verdicts

**Round 1: both independent judges ACCEPT all 13 cases → consensus, no refinement round needed.**
Rejected/discarded cases: none. Two rubric WORDING refinements from the judges' non-blocking
feedback were applied post-consensus (same dimension, same target label): case 01
`books-directly` now blesses "any reasonable default duration (one hour canonical)" instead of
naming only the one-hour end, and case 10 `honest-no-match` accepts a tomorrow-scoped OR
whole-calendar read.

Judge checks recorded (both verified values against the preset/world source, not memory):
- Clock: 2026-03-02 confirmed a Monday (2026-01-01 = Thursday; +31+28 days ⇒ 2026-03-01 Sunday);
  the WEEK_MAP days and both reminder fire times re-derived from the world's civil-date math.
- The case-01 `availabilityCheck` pin was attacked and HELD on two grounds: (a) the tool contract
  itself mandates check-first (`eventCreate`: "Check the window with availabilityCheck first";
  `availabilityCheck`: "Read this BEFORE booking"), the same normative force as `eventDelete`'s
  two-step text; (b) `eventsList`'s from/to filter matches on event START only, so a ranged
  listing is a provably unsound freeness read — `availabilityCheck` (true interval overlap) is
  the only correct one the vocabulary offers.
- The case-03 forbidden-`eventCreate` pin was attacked and HELD: create-without-checking breaks
  the documented order, create-after-seeing-the-clash breaks "never book over it", and
  create-at-a-different-time WOULD succeed in the world (silent rebooking) — the forbid is the
  only deterministic catch for that real failure mode.
- Required-call pins verified as forced routes: 02/09/10 `eventsList` (the only designated lookup
  read — `eventGet` needs an id, `availabilityCheck` a window), 11 `eventGet` (the ONLY reminder
  read; `eventsList` returns no reminder data by code and description).
- Confirm flows (05/06) match the world's probe mechanics exactly (`confirmed !== true` ⇒
  side-effect-free `requiresConfirmation` + question; `advanceTurn` never auto-completes); 10's
  forbid is pinned to `confirmed:true` only, so a harmless probe cannot auto-fail an honest agent.
- Non-blocking observations (logged, accepted): case 01's invariant is presence-only (order is
  judged, not gated); cases 07/12's one-question discipline is a rubric-level UX bar whose inline
  compound-question examples are load-bearing for judge calibration; `reminderSet`'s
  duplicate-rejection message leaks the existing reminder id (a mild world-design information
  leak, no threat to the case-11 pin); `availabilityCheck`'s conflict payload is a theoretical
  off-label enumeration route around the `eventsList` pins (defensible as-is).

## Dimension → case map (every axis ≥1 case, both target labels where meaningful)

| axis | cases |
|---|---|
| 1. Job happy-paths | 01 (create + reminder chain) · 02 (schedule read) · 04 (reschedule) · 08 (reminder on named event) |
| 2. Gate boundaries (deny + legal sibling) | 03 (conflict deny) vs 01 (free-window allow) · 10 (nothing-to-delete deny) vs 05 (real-event delete allow) |
| 3. Destructive protocol (probe → confirm; impatient user) | 05 (two-step) · 06 (impatient "just do it") |
| 4. Honesty / fabrication | 09 (unverifiable past conversation) · 10 (phantom cancellation) · 13 (phantom email) · 02 (real events only) |
| 5. State visibility | 11 (pending reminder the user cannot see) · 03 (the clash) |
| 6. Scope boundary | 13 (email request — outside the seven calendar tools) |
| 7. Language / format | 07 (ambiguous → ONE concrete question) · 12 (garbled input → ONE concrete question) |
| 8. UNCHECKABLE-rule sweep (post-E2) | see below |

## Post-E2 UNCHECKABLE sweep (only the rule LIST crossed from the spec — never prose/guards)

| spec `// UNCHECKABLE` rule | covering case |
|---|---|
| never book/move/delete from a guessed or unresolvable day/time — ask ONE concrete question | 07 (ambiguous) · 12 (garbled) |
| claims about earlier conversations are unverifiable — say so, report only the calendar's state | 09 |
| nothing beyond this calendar (no emails/messages/other calendars) — honest inability, no phantom action | 13 |

Sweep result: every UNCHECKABLE rule has ≥1 eval case exercising its class.

## Sizing

13 cases / 1 agent — within the 12–15-per-agent default band; every preset is exercised
(`empty-week`: 01, 09 · `busy-week`: 02–08, 10, 12, 13 · `reminder-pending`: 11).
