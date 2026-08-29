---
"@looprun-ai/eval": minor
"@looprun-ai/emit": minor
---

`runGate` answers with a `GateReport`, not a bare list.

```ts
const gate = runGate(subjectDir, subject);
gate.findings; // every failing row — the gate is red exactly when this is non-empty
gate.seams;    // the seam budget: one warning line per unspoken row no case drives into
```

`findings` carries every failing verb's rows, `SEAM_UNSPOKEN` among them; `seams` carries one
`SEAM_UNREACHED` line per row of the seam table that no case drives into and no seam law names —
they print with the run and fail nothing. The emitted `check-subject.test.ts` prints every
`seams` line and asserts `findings` empty, so a stamped gate is regenerated through the emit to
read the new shape.

`censusFor` walks past a desk whose card does not compile: the desk contributes no guard names
and the census still answers, so the gate called in the emitted shape returns the card's problems
as findings — beside the `COVERS_UNRESOLVED` rows the missing names produce — instead of
unwinding on the first refused card.
