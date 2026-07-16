/**
 * src/mastra/index.ts — minimal Mastra registration of the generated LoopRunAgents.
 *
 * Each agent = one governed AgentSpec on the deterministic world (fresh world per session).
 * The subject model is the cloud validation default (gemini flash-lite, thinking OFF); when no
 * GOOGLE_GENERATIVE_AI_API_KEY is configured the registry simply starts empty instead of crashing
 * `mastra dev`.
 */
import { Mastra } from '@mastra/core';
import { LoopRunAgent } from 'looprun/mastra';
import { geminiFlashLiteThinkOff } from 'looprun/models';
import { SPECS } from '../agents/atlas/index.js';
import { TOOL_DEFS } from '../world/tools.js';
import { worldFactory } from '../world/world.js';

function buildAgents(): Record<string, LoopRunAgent> {
  try {
    const { model, modelParams } = geminiFlashLiteThinkOff();
    const agents: Record<string, LoopRunAgent> = {};
    for (const [id, spec] of Object.entries(SPECS)) {
      agents[id] = new LoopRunAgent({
        spec,
        world: () => worldFactory('default', 0),
        toolDefs: TOOL_DEFS,
        model,
        modelParams,
      });
    }
    return agents;
  } catch {
    // No API key (or model init failure) — register nothing rather than break local tooling.
    return {};
  }
}

export const mastra = new Mastra({ agents: buildAgents() });
