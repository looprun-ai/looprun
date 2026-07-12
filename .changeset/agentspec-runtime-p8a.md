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
  default anywhere. It decomposes a turn into forced single-tool micro-steps and closes it with a
  **grammar-guaranteed structured close**: the forced terminal and the onReply redrive call
  `generateObject` with the `replyStructured` schema as `response_format: json_schema` — a NON-lazy
  whole-output grammar llama-server enforces (its TOOL grammar is LAZY even under
  `toolChoice:'required'`, so the model free-wrote past it and no terminal ever landed). The system
  prompt is reconstructed for the bypass, and BOTH the tool execute and the object close route
  through one shared candidate path (`ingestStructuredObject` = scrub ∘ render). That close runs on a
  **minimal context** (`buildForceCloseMessages`) — the turn's user tail (incl. the account-state
  block) + a compact digest of THIS turn's fresh successful tool results (`digestTurnToolResults`,
  resultOk-filtered, terminals skipped, capped 600/2400 chars) + the steering line — not the whole
  transcript, the probe-proven short-context regime for a tiny model. New pure exports:
  `ingestStructuredObject`, `digestTurnToolResults`, `buildForceCloseMessages`.

Forcing note: the terminal close/redrive now use `generateObject` (`response_format: json_schema`);
the remaining forced-tool sites (the micro-steps, flowChain completion) use single-`activeTools` +
`toolChoice:'required'`, since `llama-server` ignores the named `{ type:'tool', toolName }` form and
degrades to free text.
