/**
 * The three governed agents the sim exposes as "models", built from the sibling example bundles
 * and backed by the cloud validation model (gemini-3.1-flash-lite, thinking off).
 */
import { LoopRunAgent } from 'looprun/mastra';
import { geminiFlashLiteThinkOff } from 'looprun/models';

import { SPECS as INBOX_SPECS, THEME as INBOX_THEME } from '../../inbox-triage/src/agents/inbox-triage/index.js';
import { TOOL_DEFS as INBOX_TOOLS } from '../../inbox-triage/src/world/tools.js';
import { worldFactory as inboxWorld } from '../../inbox-triage/src/world/world.js';

import { SPECS as BRAIN_SPECS, THEME as BRAIN_THEME } from '../../second-brain/src/agents/second-brain/index.js';
import { TOOL_DEFS as BRAIN_TOOLS } from '../../second-brain/src/world/tools.js';
import { worldFactory as brainWorld } from '../../second-brain/src/world/world.js';

import { SPECS as CAL_SPECS, THEME as CAL_THEME } from '../../calendar/src/agents/calendar/index.js';
import { TOOL_DEFS as CAL_TOOLS } from '../../calendar/src/world/tools.js';
import { worldFactory as calendarWorld } from '../../calendar/src/world/world.js';

function onlySpec(specs: Record<string, unknown>): any {
  const all = Object.values(specs);
  if (all.length !== 1) throw new Error(`expected exactly one spec, got ${all.length}`);
  return all[0];
}

/** model id → { agent, preset } — the preset names the world every session of that agent gets. */
export function buildAgents() {
  const { model, modelParams } = geminiFlashLiteThinkOff();
  return {
    'inbox-triage': {
      preset: 'mixed',
      agent: new LoopRunAgent({
        spec: onlySpec(INBOX_SPECS),
        theme: INBOX_THEME,
        world: () => inboxWorld('mixed', 0),
        toolDefs: INBOX_TOOLS,
        model,
        modelParams,
      }),
    },
    'second-brain': {
      preset: 'capture-heavy',
      agent: new LoopRunAgent({
        spec: onlySpec(BRAIN_SPECS),
        theme: BRAIN_THEME,
        world: () => brainWorld('capture-heavy', 0),
        toolDefs: BRAIN_TOOLS,
        model,
        modelParams,
      }),
    },
    calendar: {
      preset: 'empty-week',
      agent: new LoopRunAgent({
        spec: onlySpec(CAL_SPECS),
        theme: CAL_THEME,
        world: () => calendarWorld('empty-week', 0),
        toolDefs: CAL_TOOLS,
        model,
        modelParams,
      }),
    },
    'calendar-busy': {
      preset: 'busy-week',
      agent: new LoopRunAgent({
        spec: onlySpec(CAL_SPECS),
        theme: CAL_THEME,
        world: () => calendarWorld('busy-week', 0),
        toolDefs: CAL_TOOLS,
        model,
        modelParams,
        id: 'calendar-busy',
        name: 'calendar-busy',
      }),
    },
  } as const;
}

export type AgentRegistry = ReturnType<typeof buildAgents>;
