/**
 * src/agents/calendar/index.ts — the generated domain bundle.
 * SPECS (agent-id → AgentSpec) + THEME, imported by looprun.eval.config.ts.
 */
import type { AgentSpec } from 'looprun';
import scheduler from './scheduler-spec.js';
import { CALENDAR_THEME } from './theme.js';

export const SPECS: Record<string, AgentSpec> = {
  [scheduler.id]: scheduler,
};

export const THEME = CALENDAR_THEME;
