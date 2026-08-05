/**
 * A subject that binds a rubric reaches its first turn through the eval package's OWN dependency
 * path — `@looprun-ai/mastra`'s `runSpecConversation`, not a relative import into its `src`. The
 * runner passes no judge; the backend resolves one before the first turn. This is the gate
 * the skill's authoring rule depends on — with it red, every generated subject that binds an
 * `llmCheck` rubric aborts before its first reply.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase, llmCheck } from '@looprun-ai/core';
import type { AgentWorld, DomainContract } from '@looprun-ai/core';
import { runSpecConversation } from '@looprun-ai/mastra';
import { scriptedModel } from '@looprun-ai/mastra/testing';

const CONTRACT: DomainContract = {
  voice: 'You are the assistant of Fixture Bookings.',
  stateBlock: () => 'plan=starter',
  coreInvariants: ['Never invent data.'],
  languageClause: "## Output language (ABSOLUTE)\nReply in the user's language.",
};

function world(): AgentWorld {
  return {
    exec: () => ({ success: true }),
    advanceTurn() {},
    ingestAttachment: () => 'i901',
    toolCalls: [],
    sseActions: [],
  };
}

function rubricBoundSpec(): AgentSpecBase {
  const spec = new AgentSpecBase({ id: 'reachable', mode: 'M', persona: 'You are the agent.', tools: [], contract: CONTRACT });
  spec.addGuard('onReply', 'any', llmCheck({ rubric: 'does the reply overstate the result?' }), { id: 'agent:rubric' });
  return spec;
}

describe('a bound rubric through the eval package own runner path', () => {
  it('does not abort at conversation start with NO judge in deps', async () => {
    const scripted = scriptedModel([[{ tool: 'respond', args: { message: 'hi', did: [{ op: 'inform' }] } }]]);
    const res = await runSpecConversation(rubricBoundSpec(), [{ userText: 'hello' }], {
      model: scripted.model,
      world: world(),
      toolDefs: [],
      // no judge — the backend resolves its own default
    });
    expect(res.errorMsg).toBeUndefined();
    expect(res.turnRecords).toHaveLength(1);
  });
});
