---
"@looprun-ai/eval": minor
"@looprun-ai/emit": minor
---

The lane number is a TARGET, and `GateReport` has a third channel for the rows that state one.

```ts
const gate = runGate(subjectDir, subject);
gate.findings;   // every failing row — the gate is red exactly when this is non-empty
gate.seams;      // one warning line per unspoken seam row no case drives into
gate.advisories; // one line per desk past the lane target — printed, and failing nothing
```

Fifteen acts is the width a desk aims at, not a limit the gate enforces: the ask decides how many
acts one agent carries, and a desk holding fifty gets them with `LANE_TOO_WIDE` printed beside a
green run. `cardWeight` is unchanged — `CARD_OVER_WEIGHT` is still a finding, and a card the
factory refuses is still a finding whichever verb read it.

The emitted `check-subject.test.ts` prints every `advisories` line the way it prints the seam
budget, and still asserts `findings` empty, so a stamped gate is regenerated through the emit to
read the new shape.
