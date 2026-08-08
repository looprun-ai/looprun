---
'@looprun-ai/core': minor
'@looprun-ai/eval': minor
---

The engine states what agreeing to a destructive act would do.

`DomainContract` gains `disclose` — one sentence per destructive tool, printed directly above that
tool's own consent question — and `discloseMissing`, the marker an unresolved slot renders (default
`NA`). A `{readTool.path}` slot is filled from the latest successful call of that read whose result
names the approval's subject, so a second read about a different record cannot rename the act's
target.

`ObservedCall` gains `result`: what a successful call returned, written by the one hook that receives
a tool's output whether a world executed the call or the tool executed itself.

`looprun-eval validate` gains a blocking `disclosure` layer: every slot has to resolve against a real
seeded record in at least one preset, so a path naming a field no result carries fails offline.
