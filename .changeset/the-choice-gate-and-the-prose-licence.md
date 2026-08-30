---
"@looprun-ai/core": minor
"@looprun-ai/emit": minor
"@looprun-ai/eval": minor
---

A CHOICE is licensed by the operator's own ANSWER to a question that is OPEN.
`choiceFromUser(tool, arg, options, rule)` takes the two or more values the argument may carry.
Until an answer stands, the call is refused and the refusal OPENS a question on the session's
`ChoiceDesk`: the engine mints six digits for it and hands the desk the declared options beside
them. The desk puts that question to the operator in the operator's own language, and the
licence is the reply carrying one option token — the option's place in the declared order, or
its literal case folded — and that question's code, those two and nothing else.

A question is answered once. The act that runs on the answer consumes it — an act whose outcome
is unclear consumes it too, because the write may have landed — so a later call on the same
argument opens a fresh question under a code the operator has not seen; an echo arriving
against no open question licenses nothing, and a spent code licenses nothing. One question
stands per act and argument at a time — a re-ask restates the standing question rather than
minting a second live code — and while a question is open the latest answer replaces the one
before it. The engine matches the declared options, the code it minted and the shape of the
message — never a word of any language, so an operator writing Portuguese or Japanese is served
exactly as an English one is.

`valueFromUser` cannot hold a choice: it searches for the argument's own value, and nobody
writes `true`. A value outside the declared options refuses, and a call the gated argument never
arrives on refuses too. The declared form is `factory: choiceFromUser` with `args.arg` and
`args.options`; `rule` is required, because that sentence is the whole of what the operator reads
when the gate stands.

The justification for a prose rule belongs to its author. A guard with `factory: prose` states
`args.why` — `noSuchAct`, `aboutARead` or `conduct` — and the emitted WHY map carries what it
declared. A prose rule that claims nothing is refused by name, and `measured:<case>` is refused
with it: that licence is bought by a run that judged the case it names, and a declaration judges
nothing. A desk's conduct law still claims `conduct` on its own, being a law about how that desk
answers.
