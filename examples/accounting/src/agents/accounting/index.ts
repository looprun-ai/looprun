/**
 * src/agents/accounting/index.ts — the generated domain bundle.
 * SPECS (agent-id → AgentSpec) + THEME, imported by looprun.eval.config.ts.
 */
import type { AgentSpec } from 'looprun';
import clientBooks from './client-books-spec.js';
import billing from './billing-spec.js';
import taxFiling from './tax-filing-spec.js';
import { ACCOUNTING_THEME } from './theme.js';

export const SPECS: Record<string, AgentSpec> = {
  [clientBooks.id]: clientBooks,
  [billing.id]: billing,
  [taxFiling.id]: taxFiling,
};

export const THEME = ACCOUNTING_THEME;
