/**
 * postTool ctx THREADING — the OUTPUT-dim guard ctx built in
 * hooks.ts carries the turn's structured declaration (`did`), so a postTool guard sees the same
 * declaration the onReply cross-check guards do — the turn's ask included, since asking is an `ask`
 * INTENTION inside `did`. This pins that it is present (an array), not silently dropped from the
 * ctx the postTool hook assembles.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, custom } from '@looprun-ai/core';
import type { GuardCtx } from '@looprun-ai/core';
import { FIXTURE_DOMAIN, FIXTURE_TOOL_DEFS, FIXTURE_TOOL_NAMES, FixtureWorld } from '@looprun-ai/core/testing';
import { fakeLLM } from '../../src/testing/fake-llm.js';
import { runSpecConversation } from '../../src/run-conversation.js';

describe('postTool ctx carries the did declaration seam', () => {
  it('threads did (array) into the OUTPUT-dim guard ctx', async () => {
    let seen: Pick<GuardCtx, 'did'> | undefined;
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
          seen = { did: ctx.did };
          return null;
        },
        prose: () => '',
      }),
      { id: 'agent:captureCtx' },
    );

    const res = await runSpecConversation(spec, [{ userText: 'check the status' }], {
      model: fakeLLM([
        [{ tool: 'reportStatus', args: {} }],
        [{ tool: 'respond', args: { message: 'The status was checked.', did: [{ op: 'inform' }] } }],
      ]).model,
      modelParams: {},
      world: new FixtureWorld('seeded-media'),
      toolDefs: FIXTURE_TOOL_DEFS,
      contract: FIXTURE_DOMAIN,
    });

    expect(res.errorMsg).toBeUndefined();
    expect(seen).toBeDefined();
    expect(Array.isArray(seen!.did)).toBe(true);
  });
});
