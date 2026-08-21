---
"@looprun-ai/core": minor
"@looprun-ai/emit": minor
"@looprun-ai/eval": minor
---

A CHOICE is grounded in the words the operator stated it in. `choiceFromUser(tool, arg, terms,
rule)` takes each value the argument may carry and the words a message would say it in, and the
argument may only arrive once one of that value's words appears in the operator's own text —
searched across every message of the conversation, case folded, as plain text. `valueFromUser`
cannot hold a choice: it searches for the argument's own value, and nobody writes `true`. A value
`terms` names no word for refuses, and a call the argument never arrives on passes. The declared
form is `factory: choiceFromUser` with `args.arg` and `args.terms`; `rule` is required, because
that sentence is the whole of what the operator reads when the gate stands.

The justification for a prose rule belongs to its author. A guard with `factory: prose` states
`args.why` — `noSuchAct`, `aboutARead` or `conduct` — and the emitted WHY map carries what it
declared. A prose rule that claims nothing is refused by name, and `measured:<case>` is refused
with it: that licence is bought by a run that judged the case it names, and a declaration judges
nothing. A desk's conduct law still claims `conduct` on its own, being a law about how that desk
answers.
