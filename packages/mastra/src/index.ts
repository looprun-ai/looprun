/**
 * @looprun-ai/mastra — the public API: ONE facade plus the scripted runner.
 *
 *   new LoopRunAgent({ spec, world, model })  → a genuine Mastra Agent, governed (tutorial 02).
 *   worldFromTools({ stateView })             → native-tools/MCP mode's world seam (tutorial 03).
 *   runSpecConversation(spec, turns, deps)    → scripted multi-turn runs, evals/batch (tutorial 05).
 *
 * These 7 names are the mastra rows of `docs/superpowers/specs/2026-07-28-tutorial-outline-final.md` §4 — the contract, locked by
 * `packages/mastra/test/surface-lock.test.ts`. Everything else in this package (the session store, the tool
 * and hook builders, the JSON-schema→Zod shim, `surfaceFingerprint`, `compileSpec`) is module-local:
 * mastra has NO `/internal` subpath, so in-package code imports those module files directly.
 */
export { LoopRunAgent } from './agent.js';
export type { LoopRunAgentConfig, LoopRunOptions } from './agent.js';
export { runSpecConversation } from './run-conversation.js';
export type { RuntimeDeps } from './run-conversation.js';
export { worldFromTools } from './world-adapters.js';
export type { StateView } from './world-adapters.js';

// Re-exports so `import { AgentSpecBase, precondition, … } from '@looprun-ai/mastra'` works too:
// the tutorial's chapters 02–04 import through the `looprun/mastra` specifier, so core's public
// contract must flow through this barrel (outline §3).
export * from '@looprun-ai/core';
