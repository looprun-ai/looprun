/**
 * src/agents/calendar/index.ts — the generated domain bundle.
 * SPECS (agent-id → AgentSpec) + CONTRACT, imported by looprun.eval.config.ts.
 */
import type { AgentSpec } from 'looprun';
import scheduler from './scheduler-spec.js';
import { CALENDAR_CONTRACT } from './contract.js';

export const SPECS: Record<string, AgentSpec> = {
  [scheduler.id]: scheduler,
};

export const CONTRACT = CALENDAR_CONTRACT;
