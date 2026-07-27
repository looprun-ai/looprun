---
'@looprun-ai/eval': minor
---

**BREAKING.** Shipped as a minor: the packages are pre-1.0, where the minor slot is the
breaking-change signal and 1.0.0 is a deliberate stability decision, not a milestone reached by
accumulating removals. The version number will not warn anyone — this line has to.

The seal covers the subject's judge prompt, and the generic ruler leaves the package.

`sealedFiles` now includes `evals/judge-prompt.md`. A certification is a claim about a score, and
rewriting the judge's domain rules changes that score without touching a single case — so the ruler
is under seal with the cases.

Removed: the `judgePromptPath()` export, the `looprun-eval judge-prompt` command, and the packaged
`assets/judge-prompt.md`. No code read that file; the CLI only printed its path. Authoring the judge
prompt belongs to whatever generates a subject bundle, not to the library that runs it.
