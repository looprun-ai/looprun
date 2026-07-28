---
'@looprun-ai/models': patch
---

Resolve `llama-server` from any `llamacpp-*` build directory in `$HOME` (highest build number first)
instead of a single pinned build path. `$LLAMA_BIN` still wins, `PATH` is still the last resort.
