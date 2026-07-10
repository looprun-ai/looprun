/**
 * The lawfirm domain bundle — SPECS (agent-id → AgentSpec) + THEME.
 * looprun.eval.config.ts imports these; a host constructs LoopRunAgents from them.
 */
import type { AgentSpec } from 'looprun';
import clientMatters from './client-matters-spec.js';
import docketDocuments from './docket-documents-spec.js';
import { LAWFIRM_THEME } from './theme.js';

export const SPECS: Record<string, AgentSpec> = {
  [clientMatters.id]: clientMatters,
  [docketDocuments.id]: docketDocuments,
};

export const THEME = LAWFIRM_THEME;
