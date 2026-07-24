/**
 * The generated homeservices bundle: SPECS (agent-id → AgentSpec) + the domain CONTRACT.
 * `looprun.eval.config.ts` imports these; each spec also carries `contract` itself.
 */
import type { AgentSpec } from 'looprun';
import intakeQuoting from './intake-quoting-spec.js';
import scheduling from './scheduling-spec.js';
import { HOMESERVICES_CONTRACT } from './contract.js';

export const SPECS: Record<string, AgentSpec> = {
  'intake-quoting': intakeQuoting,
  scheduling,
};

export const CONTRACT = HOMESERVICES_CONTRACT;
