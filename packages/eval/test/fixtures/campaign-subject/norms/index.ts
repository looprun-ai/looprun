/** Minimal campaign fixture subject: a one-agent, one-case Fact Desk. Rubric-only (no invariants), so
 *  a reply-only scripted model passes the deterministic gate and the campaign's cert band is exercised
 *  end-to-end without a network. Self-contained: no external data. */
import { AgentSpecBase } from '@looprun-ai/core';
import type { AgentSpec, AgentWorld, DomainContract } from '@looprun-ai/core';

export const CONTRACT: DomainContract = {
  voice:
    'You are the Fact Desk assistant. You answer questions grounded strictly in what the tools ' +
    'returned. You are precise, friendly and concise.',
  stateBlock: (_world: AgentWorld) => `## State\n- ready`,
  coreInvariants: ['Never invent facts — only report what a tool returned.'],
  languageClause: '## Output language (ABSOLUTE)\nReply in the language the user wrote in.',
};

const assistant: AgentSpec = new AgentSpecBase({
  id: 'assistant',
  mode: 'ASSISTANT',
  persona: 'You are the Fact Desk assistant.',
  tools: ['lookupFact'],
  contract: CONTRACT,
});

export const SPECS: Record<string, AgentSpec> = { assistant };

export const CASE_AGENT: Record<string, string> = { '01-greet': 'assistant' };
