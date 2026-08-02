/** Campaign fixture whose premise layer emits an ADVISORY-ONLY line: one single-turn rubric case
 *  (reached) plus one multi-turn rubric case (SKIPPED LOUDLY by the replayer). The reached ratio
 *  (1/2 = 0.50) meets the default floor, so preflight is GREEN — proving a premise SKIP no longer
 *  over-blocks a campaign (defect 1). Rubric-only, so a reply-only scripted model passes the gate. */
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

export const CASE_AGENT: Record<string, string> = { '01-greet': 'assistant', '02-followup': 'assistant' };
