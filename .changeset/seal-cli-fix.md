---
'@looprun-ai/eval': patch
---

`looprun-eval seal` works. The command referenced an undeclared variable on its first line, so both
minting and `--verify` failed with `ReferenceError: args is not defined` — the seal, which is what
voids a certification when an artifact changes, could never be stamped from the CLI.

The library functions were covered; the argv plumbing around them was not. The CLI is now exercised
as a process, so a command that cannot resolve its own arguments fails the suite.
