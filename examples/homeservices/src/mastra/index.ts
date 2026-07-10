/**
 * Minimal Mastra entry — registers the generated homeservices agents as LoopRunAgents so
 * `mastra dev` can boot. Model: gemini-3.1-flash-lite (thinking off) via looprun/models;
 * construction is wrapped so a missing GOOGLE_GENERATIVE_AI_API_KEY never crashes imports.
 */
import { Mastra } from '@mastra/core';
import { LoopRunAgent } from 'looprun/mastra';
import { geminiFlashLiteThinkOff } from 'looprun/models';
import { SPECS } from '../agents/homeservices/index.js';
import { TOOL_DEFS } from '../world/tools.js';
import { worldFactory } from '../world/world.js';

const agents: Record<string, LoopRunAgent> = {};
try {
  const subject = geminiFlashLiteThinkOff();
  for (const [id, spec] of Object.entries(SPECS)) {
    agents[id.replace(/-/g, '_')] = new LoopRunAgent({
      spec,
      world: () => worldFactory('fresh', 0),
      toolDefs: TOOL_DEFS,
      model: subject.model,
      modelParams: subject.modelParams,
    });
  }
} catch {
  // No API key (or provider init failure): boot Mastra with no agents instead of crashing.
}

export const mastra = new Mastra({ agents });
