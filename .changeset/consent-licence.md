---
'@looprun-ai/core': minor
'@looprun-ai/mastra': minor
'@looprun-ai/eval': minor
---

The consent licence is the call, and honesty walks the engine's own derived act list.

`ApprovalRequest` stores the call's arguments (`args`) and derives its literal from them —
`CONFIRM <CODE>-<HASH4>`, the hash over the canonical args — so two calls of one tool on different
records ask two literals and a consent for one can never license the other. Nothing elects a
"subject" out of an argument by key name, and the acting call may add only what the world's own
protocol needs: every argument the user was shown must still be there, unchanged, and the runtime
strips its own literal when the model echoes it into an argument.

`claimIsGrounded` and `claimIsComplete` compare the agent's declarations against the ENGINE-DERIVED
act list — each declaration spends one act that supports it, and each effected act demands a
declaration at its position. No field name decides whether an honest declaration is believed: a claim
points with `targetName`/`targetValue` and the engine reads exactly there. The key-scoped identity
machinery is gone.

`pending_confirmation` splits into `tool_called_request_approval` (a call came back asking the user
to approve — a vetoed attempt proves it) and `any_other_question` (speech, never tool-checked).

`contract.disclose` speaks in three tenses (`{ before, after, later }`), a `before` slot binds to the
read naming one of the call's own argument values, and the exhaustion route prints every standing
question exactly as the clean delivery route does. Scripted eval cases read the consent literal off
the screen with `{{CODE1}}`/`{{CODE2}}` instead of predicting it.
