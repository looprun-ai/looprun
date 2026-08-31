/** The public surface of @looprun-ai/core: the contract leaf, the author door
 *  (cards + world), and the engine. Facade packages import from here by name. */
export * from './contract/vocabulary.js';
export * from './contract/ports.js';
export { RETIRED_NAMES } from './contract/rename-register.js';
export { world, mcpWorld, liveWorld } from './world/world.js';
export { WorldBuilder, BuiltWorld } from './world/world-builder.js';
export { AgentFactory } from './cards/agent-factory.js';
export { factsFromWorld } from './cards/facts.js';
export { SurfaceGate } from './cards/surface-gate.js';
export type { LiveTool, SurfaceReport } from './cards/surface-gate.js';
export type {
  AgentSpec, DomainContract, CompiledAgent, CompiledGuard, Guard, GuardCtx,
  JudgedGuard, Limits, Disclosure, DisclosureBinding, MaskKey, Wording, PromptParts
} from './cards/cards.js';
export { onlyAfter, precondition, valueFromUser, checkResult,
         mustAccountFor, argMatchesFormat, argForbidden, blockPattern, purgePattern, maskPattern,
         swapTerms, maxCalls, injectionCheck,
         carriedIds, isIdShaped, argCondition, valueFromUserOrRecord, argMatchesRecord,
         onlyAfterWhen }
  from './cards/catalog.js';
export { label } from './run/label.js';
export { Engine } from './run/engine.js';
export type { EngineConfig } from './run/engine.js';
export { Rulebook } from './run/rulebook.js';
export { ModelSeat } from './run/model-seat.js';
export { PromptWriter } from './run/prompt-writer.js';
export { ScriptedModel, payingDesk } from './run/scripted-model.js';
export { composeWindow, readDecision } from './run/front-desk.js';
export type { FrontDeskCfg } from './run/front-desk.js';
