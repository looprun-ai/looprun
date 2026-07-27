---
'@looprun-ai/core': major
'@looprun-ai/mastra': major
---

The three residuals on the governed runtime are closed.

- A terminal tool's definition is now the PROTOCOL's, never the host's: `normalizeTerminalToolDef`
  rewrites a host-supplied `replyToUser` / `askUser` to the runtime contract (single `text`
  argument, no brand-language pin, no unread required fields) and returns domain defs by identity.
- The experimental micro-loop driver is REMOVED, with its exports
  (`runSpecConversationMicroLoop`, `renderStructuredReply`, `stripThinkBlocks`,
  `recordTerminalReply`, `assembleAnswerText`, `scrubSteeringEcho`, `ingestStructuredObject`,
  `commitFinalReply`, `digestTurnToolResults`, `buildForceCloseMessages`, `STEERING_SENTINEL`).
  It was never a default, never certified, and carried none of the turn-safety mechanics.
- The proof runner counts its own coverage ratchet again (see the repo's governance tooling).
