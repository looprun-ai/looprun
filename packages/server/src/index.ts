/**
 * @looprun-ai/server — expose governed LoopRunAgents behind an OpenAI-compatible endpoint.
 *
 * `createModelServer({ agents: { 'my-agent': agent } })` serves `/v1/chat/completions` +
 * `/v1/models`; any harness that speaks the OpenAI protocol (custom provider + base_url) then
 * calls the governed agent as if it were a model. The full governed turn — guards, tools,
 * redrive — runs inside each request and returns one final assistant message.
 */
export { createOpenAiHandler, DEFAULT_CONTEXT_LENGTH } from './handler.js';
export { createModelServer } from './server.js';
export { SESSION_HEADER, fingerprintSession, lastUserText, resolveSessionId } from './session.js';
export type {
  CompletionRequestBody,
  LoopRunEnvelopeMeta,
  ModelServer,
  ModelServerConfig,
  TurnEvent,
  WireMessage,
} from './types.js';
