---
'@looprun-ai/core': minor
'@looprun-ai/mastra': patch
---

One owner for the bytes a turn sends: `renderTurnPrompt`.

The assembly was duplicated across the two drivers — each folded `trunk + terminal protocol` into
the instructions and `state block + uploads + user text` into the message tail. Two copies of one
law is a drift hazard, and this one is worse than ordinary duplication because the drift is
invisible: a wrong prompt does not crash, it answers.

New in core: `renderTurnPrompt(input) => { instructions, userContent, replyOnly, uploadDisplay }`,
plus `uploadDisplayLabels` and `isReplyOnly`. Pure — no clock, no entropy, no I/O, no model.
Attachment ingestion stays in the caller because it mutates the world. `replyOnly` accepts an
override for the two callers that are not governed turns: the static instructions a host shows in a
studio (rendered against a stub world the terminal policy must never be asked about), and an offline
replay pinning the decision a recorded run took.

The backend now renders through it in all four places (`generate`, `stream`, the static constructor
prompt, and the conversation driver). Byte-identical output — `prompt-identity.test.ts` runs a real
governed turn and compares both halves against what the function returns, so a driver that
reassembles the prompt again fails the suite.

This exists for the offline instruments as much as for the drivers. The previous generation of the
margin probe carried its own replica of this assembly; a refactor moved the runtime, the replica
diverged silently, and the instrument kept reporting — about a prompt nothing ran. There is now
nothing to replicate.
