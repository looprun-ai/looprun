/**
 * The scripted LanguageModelV3 mock now lives in the shippable testing kit
 * (`src/testing/fake-llm.ts`). This re-export keeps existing test imports working.
 */
export { scriptedModel, fakeLLM } from '../src/testing/fake-llm.js';
export type { ScriptPart, ScriptStep, ScriptedModel } from '../src/testing/fake-llm.js';
