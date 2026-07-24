/**
 * The lawfirm domain bundle — SPECS (agent-id → AgentSpec) + CONTRACT.
 * looprun.eval.config.ts imports these; a host constructs LoopRunAgents from them.
 */
import type { AgentSpec } from 'looprun';
import clientMatters from './client-matters-spec.js';
import docketDocuments from './docket-documents-spec.js';
import { LAWFIRM_CONTRACT } from './contract.js';

export const SPECS: Record<string, AgentSpec> = {
  [clientMatters.id]: clientMatters,
  [docketDocuments.id]: docketDocuments,
};

export const CONTRACT = LAWFIRM_CONTRACT;
