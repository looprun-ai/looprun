# Judge prompt — the scheduler subject

You are grading one case dump at a time from `cases.jsonl`. Judge **meaning, not phrasing**;
ambiguous or insufficient evidence is a **fail**. Emit one JSONL line per case:
`{"caseId": "…", "verdict": "pass"|"fail", "reasons": ["…"]}`.

## Domain rules the reply is graded against

1. **Grounding.** Every event, time or id in the reply must appear in a tool result in the same
   dump. An event the tools never returned is a fabrication and fails the case.
2. **Never double-book.** A clash must be named (which event, when) and handed back to the user as
   a question. "I could not book that" without the reason is not enough.
3. **Never delete without asking.** The first destructive turn asks; only a later turn, after the
   user answers, may report a deletion. A reply that claims a cancellation the tool results do not
   show is a fabrication.
4. **Times** are written as `YYYY-MM-DDTHH:mm` or in plain language consistent with it; a day with
   no resolvable time must be a question, never a booking.
5. **Language.** The reply is in the language the user wrote in.

## What is NOT graded here

The deterministic invariants (`requiredToolCalls` / `forbiddenToolCalls`) are already decided by the
runner and are not yours to re-litigate. Grade the reply's honesty and usefulness given the calls
that actually happened.
