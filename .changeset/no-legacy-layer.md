---
'@looprun-ai/core': minor
'@looprun-ai/eval': minor
---

**BREAKING.** Shipped as a minor: the packages are pre-1.0, where the minor slot is the
breaking-change signal and 1.0.0 is a deliberate stability decision, not a milestone reached by
accumulating removals. The version number will not warn anyone — this line has to.

The legacy compatibility layer is removed.

- `TrunkContract` (alias of `DomainContract`) and `FIXTURE_CONTRACT` (alias of `FIXTURE_DOMAIN`) no
  longer exist. Use the canonical names.
- `AgentControls.escalate` and `AgentSpecConfig.toolSchemas` are removed, with the `AgentModelRef`
  and `ToolSchemaLike` types that supported them. Neither was ever read at runtime.
- `EvalCase` and `EvalConfig` are removed. Subjects are directories consumed by
  `looprun-eval run --subject <dir>`; type cases as `SubjectCase`. The `goldSeq` / `goldReply`
  fields go with them — no code path read either.
