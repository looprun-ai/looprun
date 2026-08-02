/**
 * postTool ctx THREADING (SCG-T2 review follow-up) — the OUTPUT-dim guard ctx built in hooks.ts
 * carries the turn's structured declaration seam (`did` / `asked`), so a postTool guard sees the same
 * declaration fields the onReply cross-check guards do. This pins that they are present (an array + a
 * boolean), not silently dropped from the ctx the postTool hook assembles.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, custom } from '@looprun-ai/core';
import type { GuardCtx } from '@looprun-ai/core';
import { FIXTURE_DOMAIN, FIXTURE_TOOL_DEFS, FIXTURE_TOOL_NAMES, FixtureWorld } from '@looprun-ai/core/testing';
import { fakeLLM } from '../../src/testing/fake-llm.js';
import { runSpecConversation } from '../../src/run-conversation.js';

describe('postTool ctx carries the did/asked declaration seam', () => {
  it('threads did (array) and asked (boolean) into the OUTPUT-dim guard ctx', async () => {
    let seen: Pick<GuardCtx, 'did' | 'asked'> | undefined;
    const spec = new AgentSpecBase({
      id: 'posttool-ctx',
      mode: 'PROOF',
      persona: 'You are the proof agent.',
      tools: [...FIXTURE_TOOL_NAMES],
      contract: FIXTURE_DOMAIN,
    });
    // A postTool guard that only OBSERVES the ctx (never denies) — it records the declaration fields.
    spec.addGuard(
      'postTool',
      ['reportStatus'],
      custom({
        kind: 'captureCtx',
        dim: 'output',
        check: (ctx) => {
          seen = { did: ctx.did, asked: ctx.asked };
          return null;
        },
        prose: () => '',
      }),
      { id: 'agent:captureCtx' },
    );

    const res = await runSpecConversation(spec, [{ userText: 'check the status' }], {
      model: fakeLLM([
        [{ tool: 'reportStatus', args: {} }],
        [{ tool: 'respond', args: { message: 'The status was checked.', did: [] } }],
      ]).model,
      modelParams: {},
      world: new FixtureWorld('seeded-media'),
      toolDefs: FIXTURE_TOOL_DEFS,
      contract: FIXTURE_DOMAIN,
    });

    expect(res.errorMsg).toBeUndefined();
    expect(seen).toBeDefined();
    expect(Array.isArray(seen!.did)).toBe(true);
    expect(typeof seen!.asked).toBe('boolean');
  });
});
