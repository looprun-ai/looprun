/**
 * src/agents/second-brain/index.ts — the generated domain bundle.
 * SPECS (agent-id → AgentSpec) + THEME, imported by looprun.eval.config.ts.
 */
import type { AgentSpec } from 'looprun';
import vaultFiling from './vault-filing-spec.js';
import { SECOND_BRAIN_THEME } from './theme.js';

export const SPECS: Record<string, AgentSpec> = {
  [vaultFiling.id]: vaultFiling,
};

export const THEME = SECOND_BRAIN_THEME;
