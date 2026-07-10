/**
 * The generated homeservices bundle: SPECS (agent-id → AgentSpec) + the domain THEME.
 * `looprun.eval.config.ts` imports these; each spec also carries `theme` itself.
 */
import type { AgentSpec } from 'looprun';
import intakeQuoting from './intake-quoting-spec.js';
import scheduling from './scheduling-spec.js';
import { HOMESERVICES_THEME } from './theme.js';

export const SPECS: Record<string, AgentSpec> = {
  'intake-quoting': intakeQuoting,
  scheduling,
};

export const THEME = HOMESERVICES_THEME;
