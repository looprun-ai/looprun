/**
 * The three governed agents the sim exposes as "models", built from the sibling example bundles.
 * Backing model: OPENROUTER_API_KEY selects OpenRouter (SIM_MODEL, default nemotron-3-ultra free);
 * otherwise the cloud validation model (gemini-3.1-flash-lite, thinking off).
 */
import { createOpenAI } from '@ai-sdk/openai';
import { LoopRunAgent } from 'looprun/mastra';
import { geminiFlashLiteThinkOff } from 'looprun/models';

const OPENROUTER_DEFAULT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';
/**
 * OpenRouter-native fallback (`models` array, tried in order server-side; HARD LIMIT: 3 entries
 * total) — free-tier capacity is flaky (e.g. Nvidia "ResourceExhausted" 502s), so back the
 * primary with tool-capable free models on OTHER providers. Override with SIM_MODEL=a,b,c.
 */
const OPENROUTER_FALLBACKS = ['qwen/qwen3-coder:free', 'meta-llama/llama-3.3-70b-instruct:free'];

function backingModel(): { model: any; modelParams: Record<string, unknown> } {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return geminiFlashLiteThinkOff();
  const chain = (process.env.SIM_MODEL?.split(',').map((s) => s.trim()).filter(Boolean)) ?? [
    OPENROUTER_DEFAULT_MODEL,
    ...OPENROUTER_FALLBACKS,
  ];
  const openrouter = createOpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    fetch: (async (input: any, init?: any) => {
      const isCompletion = init?.body && String(input).endsWith('/chat/completions');
      // Inject the fallback chain into chat-completion bodies; OpenRouter walks it on upstream errors.
      if (isCompletion && chain.length > 1) {
        try {
          const body = JSON.parse(init.body as string);
          init = { ...init, body: JSON.stringify({ ...body, models: chain }) };
        } catch {
          /* non-JSON body: send unchanged */
        }
      }
      if (!isCompletion) return fetch(input, init);
      // Free-tier flakiness the chain can't catch: 5xx, whitespace-only 200 bodies (keep-alive
      // padding with no final JSON), and {"error":...} bodies inside a 200. Retry those here.
      let res: Response = await fetch(input, init);
      for (let attempt = 0; attempt < 3; attempt++) {
        // 429 free-models-per-min: the window is a minute — anything shorter than that re-trips it.
        let delayMs = res.status === 429 ? 65_000 : 2000 * (attempt + 1);
        let retry = res.status >= 500 || res.status === 429;
        if (!retry && res.ok) {
          const text = await res.clone().text();
          const trimmed = text.trim();
          retry = trimmed === '' || trimmed.startsWith('{"error"');
        }
        if (!retry) return res;
        await new Promise((r) => setTimeout(r, delayMs));
        res = await fetch(input, init);
      }
      return res;
    }) as typeof fetch,
  });
  return { model: openrouter.chat(chain[0]!), modelParams: {} };
}

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
  const { model, modelParams } = backingModel();
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
