/**
 * src/agents/second-brain/index.ts — the generated domain bundle.
 * SPECS (agent-id → AgentSpec) + CONTRACT, imported by looprun.eval.config.ts.
 */
import type { AgentSpec } from 'looprun';
import vaultFiling from './vault-filing-spec.js';
import { SECOND_BRAIN_CONTRACT } from './contract.js';

export const SPECS: Record<string, AgentSpec> = {
  [vaultFiling.id]: vaultFiling,
};

export const CONTRACT = SECOND_BRAIN_CONTRACT;
