/**
 * src/agents/inbox-triage/index.ts — the generated domain bundle.
 * SPECS (agent-id → AgentSpec) + CONTRACT, imported by looprun.eval.config.ts.
 */
import type { AgentSpec } from 'looprun';
import inboxTriage from './triage-spec.js';
import { INBOX_TRIAGE_CONTRACT } from './contract.js';

export const SPECS: Record<string, AgentSpec> = {
  [inboxTriage.id]: inboxTriage,
};

export const CONTRACT = INBOX_TRIAGE_CONTRACT;
