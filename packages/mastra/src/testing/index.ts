/**
 * @looprun-ai/mastra `/testing` — the backend half of the shippable, domain-NEUTRAL testing kit.
 *
 * The fake LLM (scripted model) + the full-loop (L3) proof runners that drive a real
 * runSpecConversation. Pair with `@looprun-ai/core/testing` (the fixture world + proof format + L1
 * runner + spec builders) for the complete guard-proof harness.
 */
export * from './fake-llm.js';
export * from './proof-loop.js';
