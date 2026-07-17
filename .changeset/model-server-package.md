---
'@looprun-ai/server': minor
---

New package: `@looprun-ai/server` — expose governed LoopRunAgents behind an OpenAI-compatible
endpoint (`/v1/chat/completions` + `/v1/models`), the "agent-as-model" pattern. Any harness that
points a custom provider at a `base_url` calls a governed agent as if it were a model: the full
governed turn (guards → tools → redrive) runs inside each request and returns one final assistant
message. Facade law: incoming `system` discarded (the spec renders its own trunk), incoming
`tools`/sampling ignored (the spec governs), only the last user message enters the turn; session
continuity via `x-looprun-session` header → `user` field → first-user-message fingerprint;
`stream: true` supported (buffered governed turn, single content delta, keepalive comments);
non-standard `looprun` response field carries the turn metadata for integration assertions.
