/**
 * @looprun-ai/server — expose governed LoopRunAgents behind an OpenAI-compatible endpoint.
 *
 * `createModelServer({ agents: { 'my-agent': agent } })` serves `/v1/chat/completions` +
 * `/v1/models`; any harness that speaks the OpenAI protocol (custom provider + base_url) then
 * calls the governed agent as if it were a model. The full governed turn — guards, tools,
 * redrive — runs inside each request and returns one final assistant message.
 *
 * These 4 names are the server rows of `docs/superpowers/specs/2026-07-28-tutorial-outline-final.md` §4 (chapter 06) — the whole
 * public contract, locked by `packages/server/test/surface-lock.test.ts`. Server has NO `/internal`
 * subpath: the raw handler, the session helpers and the wire constants stay module-local, so
 * in-package code and this package's tests import `./handler.js` and `./session.js` directly.
 */
export { createModelServer } from './server.js';
export type { ModelServer, ModelServerConfig, TurnEvent } from './types.js';

/**
 * TYPE-CLOSURE RIDERS (outline §7) — not taught, not part of the 4, not surface anybody chose.
 * They are the transitive type closure of the four above: `TurnEvent.meta` is a
 * `LoopRunResultMeta` (this package's pinned mirror of mastra's internal type — see `types.ts`),
 * and `ModelServerConfig.resolveSession` is `(body: CompletionRequestBody, headers: Headers)`,
 * whose `messages` are `WireMessage[]`. Without the names a consumer building with
 * `declaration: true` gets `TS4023`/`TS2742` the moment it hoists `event.meta` or writes a named
 * `resolveSession`.
 */
export type { LoopRunResultMeta, CompletionRequestBody, WireMessage } from './types.js';
