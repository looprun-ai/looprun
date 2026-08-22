---
"@looprun-ai/eval": minor
"@looprun-ai/emit": minor
---

Three additions to the static gate: what a subject spends, what an approved act reports, and one
order the gate stops demanding because it cannot be obeyed.

`promptBudgeted` renders every desk the way the bars ruler does — the system prefix plus the tool
cards — sums the bytes and holds the total to the `promptBudget` declared in the subject's own
`ask/targets.json`. The number is the SUBJECT OWNER's, and it lives beside the one model that
subject may reach: never in a verb, never on the cards being measured. `PROMPT_OVER_BUDGET` names
the total, the ceiling, the overrun, and each desk's system and card bytes heaviest first, because
the way back under a budget is a lane split or a shorter world sentence on the desk carrying the
most. A subject declaring no ceiling is measured against nothing and the verb says nothing.

`approvedActsDisclosed` is the outcome tense of the question `destructiveDisclosed` already holds
to a figure. An act a case approves has both tenses rendered: the words that ask, and the words
that report. `ACT_RESULT_UNSPOKEN` charges a destructive act a case approves whose
`disclosure.<act>.after` is missing or carries no `{result.…}` slot — the act runs and what it did
to the record reaches the operator only if the desk chooses to say it.

`readsOrdered` exempts the act that MINTS what the read is keyed on. A filing act creates the row
and hands back the id it has just made, and the read keyed on that id cannot run before it: there
is no id yet to call it with. The exemption is exact — the act's world entry carries `form: 'make'`
on an entity, and the read answers on that same entity with its schema requiring the id argument —
so a read that LISTS the entity still owes the order, and so does an act that changes a row
somebody else created. When every act a case takes is exempt, the case is left alone.

`GateSubject` carries the desks: `specs` and `contract` ride with the world, because the prompt a
budget measures is rendered from them. The emitted `check-subject.test.ts` passes both.
