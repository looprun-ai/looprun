/** Native/MCP-mode surface enforcement: deny-by-default + missing-capability throw + drift gate. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { AgentSpecBase } from '@looprun-ai/core';
import type { DomainContract } from '@looprun-ai/core';
import { LoopRunAgent } from '../src/index.js';
import { surfaceFingerprint } from '../src/surface.js';
import { scriptedModel } from './scripted-model.js';

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

afterEach(() => vi.restoreAllMocks());

describe('LoopRunAgent — native-mode surface enforcement', () => {
  it('a host tool NOT in spec.surface.tools is never active (deny-by-default) and the warning is loud', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let rogueExecuted = false;
    const scripted = scriptedModel([
      [{ tool: 'search', args: { q: 'x' } }],
      [{ tool: 'respond', args: { message: 'Done.', did: [] } }],
    ]);
    const agent = new LoopRunAgent({
      spec: makeSpec(['search']),
      tools: { search: makeNativeTool('search'), rogue: makeNativeTool('rogue', () => { rogueExecuted = true; }) },
      model: scripted.model,
    });
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0]?.[0])).toContain('rogue');
    const res = await agent.generate('find x');
    expect(res.text).toBe('Done.');
    expect(rogueExecuted).toBe(false); // excluded tool never executed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const active: string[] = (scripted.received[0] as any).tools?.map((t: any) => t.name) ?? [];
    expect(active).not.toContain('rogue');
    expect(active).toContain('search');
  });

  it('a surface tool the host does not provide throws at construction (a broken bundle must not run quiet)', () => {
    expect(
      () => new LoopRunAgent({ spec: makeSpec(['search', 'ghostTool']), tools: { search: makeNativeTool('search') }, model: scriptedModel([]).model }),
    ).toThrow(/ghostTool/);
  });

  it('expectedSurfaceHash: mismatch throws (seal void), match passes', () => {
    const tools = { search: makeNativeTool('search') };
    const spec = () => makeSpec(['search']);
    expect(
      () => new LoopRunAgent({ spec: spec(), tools, model: scriptedModel([]).model, expectedSurfaceHash: 'deadbeef' }),
    ).toThrow(/surface drifted since certification/);
    const expected = surfaceFingerprint(['search'], [tools.search.inputSchema]);
    expect(
      () => new LoopRunAgent({ spec: spec(), tools, model: scriptedModel([]).model, expectedSurfaceHash: expected }),
    ).not.toThrow();
  });

  it('surfaceFingerprint is order-independent and schema-sensitive', () => {
    expect(surfaceFingerprint(['a', 'b'])).toBe(surfaceFingerprint(['b', 'a']));
    expect(surfaceFingerprint(['a'], [{ p: 1 }])).not.toBe(surfaceFingerprint(['a'], [{ p: 2 }]));
  });
});
