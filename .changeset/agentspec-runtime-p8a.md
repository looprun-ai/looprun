---
'@looprun-ai/core': minor
'@looprun-ai/mastra': minor
'@looprun-ai/models': minor
'@looprun-ai/eval': minor
'@looprun-ai/vercel': minor
'looprun': minor
---

Domain-neutrality, a single spec class, and three new governed-turn mechanisms.

**Breaking API**

- **Domain-neutral guards (P8a).** Reply/label guards no longer carry any built-in linguistic or
  label-scheme default — every language-specific pattern is now a REQUIRED injected param, so the
  runtime is truly multi-language. Migrate:
  - `labelProvenance(field, expect)` → `labelProvenance(field, expect, { uploadRe, labelNoun?, reason? })` (the `isUploadLabel` helper is removed)
  - `noFabricatedSuccess(tool, { claimRe, reason })` → `noFabricatedSuccess(tool, { claimRe, labelRe, verbClaimRe, reason })`
  - `pendingConfirmMustAsk()` → `pendingConfirmMustAsk({ askRe })`
  - `destructiveClaimRequiresSuccess(tools, claimRe?, exemptRe?)` → `destructiveClaimRequiresSuccess(tools, { claimRe, askRe, offerRe, exemptRe? })` (now sentence-scoped + offer-aware)
  - `noFalseFailureClaim()` → `noFalseFailureClaim({ claimRe })`
- **Single spec class.** `AgentSpecMinimal` and `AgentSpecFull` are removed; there is ONE
  `AgentSpecBase` (universal invariants + the destructive-safety pair iff `destructiveTools`).
  Extend `AgentSpecBase`. The schema-auto layer is gone — author `argRequired` / `argFormat`
  explicitly.

**New**

- `noActAfterAskSameTurn(tools)` guard — deny acting in the same turn as an `askUser` question.
- `controls.sampling` — per-agent `temperature` / `topP` / `maxOutputTokens` / `seed`, merged
  OVER the conversation `modelParams` (the agent wins) via `resolveModelSettings`.
- `controls.chains` — declarative flowChain completion (`direct` | `llm`) that deterministically
  fills a required follow-up call, on the same guard-checked path.
- postTool (OUTPUT-dim) enforcement is now live: failing `resultInvariant` guards are relayed
  through the bounded no-tools redrive (a report/repair, never a veto).
- Experimental micro-loop backend for tiny local models (`runSpecConversationMicroLoop`) — not a
  default anywhere.

Forcing note: every forced-tool site uses single-`activeTools` + `toolChoice:'required'`, since
`llama-server` ignores the named `{ type:'tool', toolName }` form and degrades to free text.
