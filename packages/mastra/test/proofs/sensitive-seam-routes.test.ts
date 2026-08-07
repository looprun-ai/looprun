/**
 * THE EXECUTOR SEAM of the sensitive-data filter, over a governed turn.
 *
 * Both crossings of one tool call are governed on our side of the boundary. The ARGUMENT a call
 * carries is scrubbed after the guards admit it and before the world receives it, so the value the
 * executor STORES and the value the action history RECORDS are the same clean text; the RESULT is
 * filtered before the model reads it. A contract that declared neither gets the raw value, and that
 * absence is the authored acceptance.
 *
 * ```
 *   fileClaim({ claim: { description: 'boom cracked — call +1 415 555 0199' } })
 *   → the world stores      { claim: { description: 'boom cracked — call •••' } }
 *   → the record holds      { claim: { description: 'boom cracked — call •••' } }
 * ```
 */
import { describe, expect, it } from 'vitest';
import { AgentSpecBase } from '@looprun-ai/core';
import type { AgentWorld, DomainContract } from '@looprun-ai/core';
import { LoopRunAgent } from '../../src/index.js';
import { scriptedModel } from '../scripted-model.js';

const CONTRACT: DomainContract = {
  voice: 'You are the claims agent of Fixture Co.',
  stateBlock: () => '',
  coreInvariants: ['Never invent data.'],
  languageClause: "## Output language (ABSOLUTE)\nReply in the user's language.",
  sensitiveFields: { phone: 'omit', email: 'mask' },
  scrubTextFields: ['claim.description'],
};
/** The same domain with nothing declared — the reference for what an undeclared field still carries. */
const PLAIN: DomainContract = { ...CONTRACT, sensitiveFields: undefined, scrubTextFields: undefined };

const TOOL_DEFS = [
  { name: 'getCustomer', description: 'Read a customer.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'fileClaim',
    description: 'File a claim.',
    inputSchema: {
      type: 'object',
      properties: { claim: { type: 'object', properties: { description: { type: 'string' } } } },
    },
  },
];

interface SeamWorld extends AgentWorld {
  /** The arguments the executor actually received — the proof the scrub ran before dispatch. */
  received: Record<string, unknown>[];
}

function seamWorld(): SeamWorld {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calls: any[] = [];
  const received: Record<string, unknown>[] = [];
  return {
    exec(name: string, args: Record<string, unknown>) {
      received.push(structuredClone(args));
      const result = name === 'getCustomer' ? { id: 'c1', phone: '555-0199', email: 'ops@x.example' } : { success: true };
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
    mode: 'PROOF',
    persona: 'You are the claims agent.',
    tools: ['getCustomer', 'fileClaim'],
    contract,
    behavior: ['Read the customer, then file the claim they describe.'],
  });

/** One governed turn: the scripted call, then the terminal reply. */
async function runTurn(contract: DomainContract, call: { tool: string; args: Record<string, unknown> }) {
  const scripted = scriptedModel([
    [call],
    [{ tool: 'respond', args: { message: 'That is handled.', did: [{ op: 'inform' }] } }],
  ]);
  const world = seamWorld();
  const agent = new LoopRunAgent({ spec: claimsSpec(contract), world, toolDefs: TOOL_DEFS, model: scripted.model });
  await agent.generate('handle it');
  return { world, scripted, observed: agent.getSession().actionHistory.observed };
}

const RAW = 'boom cracked — call +1 415 555 0199';
const CLEAN = 'boom cracked — call •••';

describe('a declared free-text argument, on its way out', () => {
  it('positive — the world stores the clean text and the record holds the same text', async () => {
    const { world, observed } = await runTurn(CONTRACT, { tool: 'fileClaim', args: { claim: { description: RAW } } });

    expect(world.received[0]).toEqual({ claim: { description: CLEAN } });
    const filed = observed.find((o) => o.name === 'fileClaim');
    expect(filed?.args).toEqual({ claim: { description: CLEAN } });
    // Recorded against the SAME argument object the world received, so the call still pairs with the
    // world's own row and keeps its attested effect.
    expect(filed?.tookEffect).toBe(true);
  });

  it('negative — a contract that declared no free-text field hands the world the raw text', async () => {
    const { world } = await runTurn(PLAIN, { tool: 'fileClaim', args: { claim: { description: RAW } } });
    expect(world.received[0]).toEqual({ claim: { description: RAW } });
  });

  it('neutral — an argument outside the declared path is left alone', async () => {
    const { world } = await runTurn(CONTRACT, { tool: 'fileClaim', args: { claim: { reference: RAW } } });
    expect(world.received[0]).toEqual({ claim: { reference: RAW } });
  });
});

describe('a result, on its way back', () => {
  it('positive — the declared fields are gone before the model reads the result', async () => {
    const { scripted } = await runTurn(CONTRACT, { tool: 'getCustomer', args: {} });

    const seenByModel = JSON.stringify(scripted.received[1]);
    expect(seenByModel).not.toContain('555-0199');
    expect(seenByModel).toContain('o•••@x.example');
  });

  it('negative — an undeclared contract lets the raw result through', async () => {
    const { scripted } = await runTurn(PLAIN, { tool: 'getCustomer', args: {} });
    expect(JSON.stringify(scripted.received[1])).toContain('555-0199');
  });

  it('neutral — a field the contract never named keeps its content', async () => {
    const { scripted } = await runTurn(CONTRACT, { tool: 'getCustomer', args: {} });
    expect(JSON.stringify(scripted.received[1])).toContain('c1');
  });
});
