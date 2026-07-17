/** Shared offline fixtures: a governed agent over the FixtureWorld driven by a scripted model. */
import { AgentSpecBase, requiresBefore } from '@looprun-ai/core';
import { FIXTURE_THEME, FIXTURE_TOOL_DEFS, FixtureWorld } from '@looprun-ai/core/testing';
import { LoopRunAgent } from '@looprun-ai/mastra';
import { scriptedModel } from '@looprun-ai/mastra/testing';
import type { ScriptStep } from '@looprun-ai/mastra/testing';

export function makeSpec() {
  const spec = new AgentSpecBase({
    id: 'fixture-agent',
    mode: 'FIXTURE',
    persona: 'You are the fixture agent.',
    tools: ['searchItem', 'updateItem', 'createItem', 'listItems'],
    behavior: ['Operate only on items the tools return.'],
    theme: FIXTURE_THEME,
  });
  spec.addGuard('preTool', ['updateItem'], requiresBefore(['searchItem']), { id: 'agent:updateAfterSearch' });
  return spec;
}

export function makeAgent(script: ScriptStep[]) {
  const scripted = scriptedModel(script);
  const worlds = new Map<string, FixtureWorld>();
  const agent = new LoopRunAgent({
    spec: makeSpec(),
    world: (sessionId: string) => {
      const world = new FixtureWorld('empty');
      worlds.set(sessionId, world);
      return world;
    },
    toolDefs: FIXTURE_TOOL_DEFS,
    model: scripted.model,
  });
  return { agent, scripted, worlds };
}

/** A simple happy-path script: one read, then a terminal reply. */
export const HAPPY_SCRIPT: ScriptStep[] = [
  [{ tool: 'searchItem', args: { query: 'alpha' } }],
  [{ tool: 'replyToUser', args: { text: 'Found alpha.' } }],
];
