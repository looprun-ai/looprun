/** Native/MCP-mode surface enforcement: declared surface required + deny-by-default +
 *  missing-capability throw + drift gate + the composed-description wrap. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { AgentSpecBase, precondition } from '@looprun-ai/core';
import type { DomainContract, ToolDef } from '@looprun-ai/core';
import { TOOL_RULES_HEADING } from '@looprun-ai/core/internal';
import { LoopRunAgent } from '../src/index.js';
import { resolveConstruction } from '../src/agent-construction.js';
import { surfaceFingerprint } from '../src/surface.js';
import { scriptedModel } from './scripted-model.js';
import { nothingDone } from './delivery.js';

const CONTRACT: DomainContract = {
  voice: 'You are the assistant of Fixture Search.',
  stateBlock: () => '',
  coreInvariants: ['Never invent data.'],
  languageClause: "## Output language (ABSOLUTE)\nReply in the user's language.",
  exhaustionReply: (_w, okTools) => `closure:${okTools.join(',')}`,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeNativeTool(id: string, onExecute?: () => void): any {
  return createTool({
    id,
    description: `${id} tool.`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputSchema: z.object({ q: z.string().optional() }) as any,
    execute: async () => {
      onExecute?.();
      return { success: true };
    },
  });
}

function makeSpec(tools: string[]) {
  return new AgentSpecBase({ id: 'searcher', mode: 'M', persona: 'You are the search agent.', tools, contract: CONTRACT });
}

/** The declared-surface row for one native tool of this file (matches `makeNativeTool`'s schema). */
function defOf(name: string): ToolDef {
  return { name, description: `${name} tool.`, inputSchema: { type: 'object', properties: { q: { type: 'string' } } } };
}

afterEach(() => vi.restoreAllMocks());

describe('LoopRunAgent — native-mode surface enforcement', () => {
  it('a host tool NOT in spec.surface.tools is never active (deny-by-default) and the warning is loud', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let rogueExecuted = false;
    const scripted = scriptedModel([
      [{ tool: 'search', args: { q: 'x' } }],
      [{ tool: 'respond', args: { message: 'Done.', did: [{ op: 'inform' }] } }],
    ]);
    const agent = new LoopRunAgent({
      spec: makeSpec(['search']),
      tools: { search: makeNativeTool('search'), rogue: makeNativeTool('rogue', () => { rogueExecuted = true; }) },
      toolDefs: [defOf('search')],
      model: scripted.model,
    });
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0]?.[0])).toContain('rogue');
    const res = await agent.generate('find x');
    expect(res.text).toBe(nothingDone('Done.'));
    expect(rogueExecuted).toBe(false); // excluded tool never executed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const active: string[] = (scripted.received[0] as any).tools?.map((t: any) => t.name) ?? [];
    expect(active).not.toContain('rogue');
    expect(active).toContain('search');
  });

  it('a surface tool the host does not provide throws at construction (a broken bundle must not run quiet)', () => {
    expect(
      () =>
        new LoopRunAgent({
          spec: makeSpec(['search', 'ghostTool']),
          tools: { search: makeNativeTool('search') },
          toolDefs: [defOf('search'), defOf('ghostTool')],
          model: scriptedModel([]).model,
        }),
    ).toThrow(/ghostTool/);
  });

  it('expectedSurfaceHash: mismatch throws (seal void), match passes', () => {
    const tools = { search: makeNativeTool('search') };
    const toolDefs = [defOf('search')];
    const spec = () => makeSpec(['search']);
    expect(
      () => new LoopRunAgent({ spec: spec(), tools, toolDefs, model: scriptedModel([]).model, expectedSurfaceHash: 'deadbeef' }),
    ).toThrow(/surface drifted since certification/);
    const expected = surfaceFingerprint(['search'], [tools.search.inputSchema]);
    expect(
      () => new LoopRunAgent({ spec: spec(), tools, toolDefs, model: scriptedModel([]).model, expectedSurfaceHash: expected }),
    ).not.toThrow();
  });

  it('native construction without toolDefs throws and names the pipeline step', () => {
    expect(
      () => new LoopRunAgent({ spec: makeSpec(['search']), tools: { search: makeNativeTool('search') }, model: scriptedModel([]).model }),
    ).toThrow(/toolDefs/);
    expect(
      () => new LoopRunAgent({ spec: makeSpec(['search']), tools: { search: makeNativeTool('search') }, model: scriptedModel([]).model }),
    ).toThrow(/gen\/tools\.json/);
  });

  it('a natively registered tool is served with the composed description and the host execute', () => {
    const spec = makeSpec(['search']);
    spec.addGuard('preTool', ['search'], precondition(() => true, 'denied', { prose: 'only while the index is fresh' }), { id: 'tool:freshIndex' });
    const host = { search: makeNativeTool('search') };
    const rc = resolveConstruction(
      { spec, tools: host, toolDefs: [defOf('search')] } as never,
      () => ({}) as never,
    );
    expect(rc.tools.search.description).toContain(TOOL_RULES_HEADING);
    expect(rc.tools.search.description).toContain('- only while the index is fresh');
    expect(rc.tools.search.execute).toBe(host.search.execute);
  });

  it('a declared surface that does not describe the host throws at construction', () => {
    const drifted = { ...defOf('search'), inputSchema: { type: 'object', properties: { q: { type: 'number' } } } };
    expect(
      () => new LoopRunAgent({ spec: makeSpec(['search']), tools: { search: makeNativeTool('search') }, toolDefs: [drifted], model: scriptedModel([]).model }),
    ).toThrow(/does not match the live tool/);
  });

  it('surfaceFingerprint is order-independent and schema-sensitive', () => {
    expect(surfaceFingerprint(['a', 'b'])).toBe(surfaceFingerprint(['b', 'a']));
    expect(surfaceFingerprint(['a'], [{ p: 1 }])).not.toBe(surfaceFingerprint(['a'], [{ p: 2 }]));
  });
});
