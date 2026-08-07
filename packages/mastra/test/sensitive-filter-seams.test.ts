/**
 * THE EXECUTOR SEAMS of the sensitive-data filter, over a governed turn.
 *
 * The executor is not trusted to hide anything, so a raw value never crosses INTO the runtime and a
 * raw note never crosses OUT of it:
 *
 *   · the RESULT a tool returns is filtered before the model reads it;
 *   · the free-text ARGUMENT a call carries is scrubbed before the world stores it, and the action
 *     history records the same clean text the world received.
 *
 * The scripted model's `received` is the prompt the LLM was actually given — the tool-result message
 * included — so "what the model saw" is asserted against the real bytes, not against a stand-in.
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase } from '@looprun-ai/core';
import type { AgentWorld, DomainContract } from '@looprun-ai/core';
import { LoopRunAgent } from '../src/index.js';
import { scriptedModel } from './scripted-model.js';

const CONTRACT: DomainContract = {
  voice: 'You are the claims agent of Fixture Co.',
  stateBlock: () => '',
  coreInvariants: ['Never invent data.'],
  languageClause: "## Output language (ABSOLUTE)\nReply in the user's language.",
  sensitiveFields: { phone: 'omit', email: 'mask' },
  scrubTextFields: ['fileClaim.description', 'getClaim.notes', 'getClaim.report'],
};

/** The same domain with nothing declared — the reference for what an undeclared field still carries. */
const PLAIN: DomainContract = { ...CONTRACT, sensitiveFields: undefined, scrubTextFields: undefined };

const TOOL_DEFS = [
  { name: 'getCustomer', description: 'Read a customer.', inputSchema: { type: 'object', properties: {} } },
  { name: 'getClaim', description: 'Read a claim.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'fileClaim',
    description: 'File a claim.',
    inputSchema: { type: 'object', properties: { description: { type: 'string' } } },
  },
];

interface FixtureWorld extends AgentWorld {
  /** The arguments the executor actually received — the proof the scrub ran before dispatch. */
  received: Record<string, unknown>[];
}

function fixtureWorld(): FixtureWorld {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calls: any[] = [];
  const received: Record<string, unknown>[] = [];
  return {
    exec(name: string, args: Record<string, unknown>) {
      received.push({ ...args });
      const result =
        name === 'getCustomer'
          ? { id: 'c1', phone: '555-0199', email: 'ops@x.example' }
          : name === 'getClaim'
            ? {
                id: 'CL-1',
                notes: 'reached them at ops@x.example',
                report: 'Read CL-1, logged for ops@x.example.',
                reference: 'audit@y.example',
              }
            : { success: true };
      calls.push({ name, args, result, tookEffect: name !== 'getCustomer' });
      return result;
    },
    advanceTurn() {},
    ingestAttachment: (u: string) => u,
    toolCalls: calls,
    sseActions: [],
    received,
  };
}

const claimsSpec = (contract: DomainContract) =>
  new AgentSpecBase({
    id: 'claims',
    mode: 'M',
    persona: 'You are the claims agent.',
    tools: ['getCustomer', 'getClaim', 'fileClaim'],
    contract,
    behavior: ['Read the customer, then file the claim.'],
  });

describe('a raw executor result never reaches the model', () => {
  it('omits the declared field and masks the declared address before the model reads the result', async () => {
    const scripted = scriptedModel([
      [{ tool: 'getCustomer', args: {} }],
      [{ tool: 'respond', args: { message: 'I found the customer.', did: [{ op: 'inform' }] } }],
    ]);
    const agent = new LoopRunAgent({ spec: claimsSpec(CONTRACT), world: fixtureWorld(), toolDefs: TOOL_DEFS, model: scripted.model });
    await agent.generate('who is c1');

    const seenByModel = JSON.stringify(scripted.received[1]);
    expect(seenByModel).not.toContain('555-0199');
    expect(seenByModel).toContain('o•••@x.example');
  });

  it('scrubs the free text inside a declared result field, for the model and for the record', async () => {
    const scripted = scriptedModel([
      [{ tool: 'getClaim', args: {} }],
      [{ tool: 'respond', args: { message: 'I read the claim.', did: [{ op: 'inform' }] } }],
    ]);
    const agent = new LoopRunAgent({ spec: claimsSpec(CONTRACT), world: fixtureWorld(), toolDefs: TOOL_DEFS, model: scripted.model });
    await agent.generate('read CL-1');

    const seenByModel = JSON.stringify(scripted.received[1]);
    expect(seenByModel).not.toContain('ops@x.example');
    expect(seenByModel).toContain('reached them at •••');
    // `report` is the result's own sentence, and it is the part of a result the action history KEEPS
    // and the closure can deliver — so the record holds the scrubbed form.
    const read = agent.getSession().actionHistory.observed.find((o) => o.name === 'getClaim');
    expect(read?.report).toBe('Read CL-1, logged for •••.');
    // A field the contract never named keeps its content: the acceptance is authored, and it is this
    // absence.
    expect(seenByModel).toContain('audit@y.example');
  });

  it('carries the whole result when the contract declares no sensitive field', async () => {
    const scripted = scriptedModel([
      [{ tool: 'getCustomer', args: {} }],
      [{ tool: 'respond', args: { message: 'I found the customer.', did: [{ op: 'inform' }] } }],
    ]);
    const agent = new LoopRunAgent({ spec: claimsSpec(PLAIN), world: fixtureWorld(), toolDefs: TOOL_DEFS, model: scripted.model });
    await agent.generate('who is c1');

    expect(JSON.stringify(scripted.received[1])).toContain('555-0199');
  });
});

describe('a declared free-text argument is scrubbed before the executor', () => {
  it('hands the world the clean text and records that same text', async () => {
    const scripted = scriptedModel([
      [{ tool: 'fileClaim', args: { description: 'boom cracked — call +1 415 555 0199' } }],
      [{ tool: 'respond', args: { message: 'I filed the claim.', did: [{ op: 'inform' }] } }],
    ]);
    const world = fixtureWorld();
    const agent = new LoopRunAgent({ spec: claimsSpec(CONTRACT), world, toolDefs: TOOL_DEFS, model: scripted.model });
    await agent.generate('file it');

    expect(world.received[0]).toEqual({ description: 'boom cracked — call •••' });
    const filed = agent.getSession().actionHistory.observed.find((o) => o.name === 'fileClaim');
    expect(filed?.args).toEqual({ description: 'boom cracked — call •••' });
    // Recorded against the SAME arguments the world stored, so the call still pairs with the world's
    // own row and keeps its attested effect.
    expect(filed?.tookEffect).toBe(true);
  });

  it('leaves an argument the contract never declared untouched', async () => {
    const scripted = scriptedModel([
      [{ tool: 'fileClaim', args: { description: 'call +1 415 555 0199' } }],
      [{ tool: 'respond', args: { message: 'I filed the claim.', did: [{ op: 'inform' }] } }],
    ]);
    const world = fixtureWorld();
    const agent = new LoopRunAgent({ spec: claimsSpec(PLAIN), world, toolDefs: TOOL_DEFS, model: scripted.model });
    await agent.generate('file it');

    expect(world.received[0]).toEqual({ description: 'call +1 415 555 0199' });
  });
});

describe('the delivered text is the last net', () => {
  it('scrubs an address the prose carried out of the turn', async () => {
    const scripted = scriptedModel([
      [{ tool: 'respond', args: { message: 'I will write to ops@x.example about it.', did: [{ op: 'inform' }] } }],
    ]);
    const agent = new LoopRunAgent({ spec: claimsSpec(CONTRACT), world: fixtureWorld(), toolDefs: TOOL_DEFS, model: scripted.model });
    const res = await agent.generate('email them');

    expect(res.text).not.toMatch(/@x\.example/);
    expect(res.text).toContain('I will write to ••• about it.');
  });
});
