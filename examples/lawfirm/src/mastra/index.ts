/**
 * Minimal Mastra registration — the two governed lawfirm agents as LoopRunAgents.
 * The subject model is the cloud validation model (gemini flash-lite, thinking OFF); when the
 * key/model is unavailable the registration degrades gracefully to an empty agent map so
 * `mastra dev` still boots.
 */
import { Mastra } from '@mastra/core';
import { LoopRunAgent } from 'looprun/mastra';
import { SPECS, THEME } from '../agents/lawfirm/index.js';
import { worldFactory } from '../world/world.js';
import { TOOL_DEFS } from '../world/tools.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const agents: Record<string, any> = {};

try {
  const { geminiFlashLiteThinkOff } = await import('looprun/models');
  const subject = geminiFlashLiteThinkOff();
  for (const [id, spec] of Object.entries(SPECS)) {
    agents[id] = new LoopRunAgent({
      spec,
      theme: THEME,
      world: () => worldFactory('busy-docket', 0),
      toolDefs: TOOL_DEFS,
      model: subject.model,
      modelParams: subject.modelParams,
    });
  }
} catch {
  // No GOOGLE_GENERATIVE_AI_API_KEY (or model init failed) — boot with no agents registered.
}

export const mastra = new Mastra({ agents });
