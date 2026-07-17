/**
 * src/agents/inbox-triage/index.ts — the generated domain bundle.
 * SPECS (agent-id → AgentSpec) + THEME, imported by looprun.eval.config.ts.
 */
import type { AgentSpec } from 'looprun';
import inboxTriage from './triage-spec.js';
import { INBOX_TRIAGE_THEME } from './theme.js';

export const SPECS: Record<string, AgentSpec> = {
  [inboxTriage.id]: inboxTriage,
};

export const THEME = INBOX_TRIAGE_THEME;
