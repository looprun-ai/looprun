/**
 * @looprun-ai/mastra — public API.
 *
 *   new LoopRunAgent({ spec, world, model })  → a genuine Mastra Agent, governed.
 *   runSpecConversation(spec, turns, deps)    → scripted multi-turn runs (evals/batch).
 *   compileSpec(spec, opts)                   → DIY primitives for your own `new Agent({...})`.
 */
export { LoopRunAgent, createLoopRunAgent } from './agent.js';
export type { LoopRunAgentConfig, LoopRunOptions, LoopRunResultMeta } from './agent.js';
export { runSpecConversation, DEFAULT_MAX_STEPS, DEFAULT_REDRIVES } from './run-conversation.js';
export type { RuntimeDeps } from './run-conversation.js';
export { compileSpec } from './compile.js';
export type { CompiledSpec } from './compile.js';
export { SessionStore } from './session.js';
export type { LoopRunSession, WorldFactory } from './session.js';
export { worldFromTools } from './world-adapters.js';
export type { StateView } from './world-adapters.js';
export { buildWorldTools, buildTerminalTools } from './tools.js';
export { makeGuardHooks, makeInputProcessors, repeatedToolCallStop } from './hooks.js';
export type { GuardHooks } from './hooks.js';
export { jsonSchemaToZodObject, jsonTypeToZod } from './json-schema-zod.js';

// Re-exports so `import { AgentSpecBase, precondition, … } from '@looprun-ai/mastra'` works too.
export * from '@looprun-ai/core';
