import type { EvalConfig } from '@looprun/eval';
import { SPECS, THEME } from './src/agents/homeservices/index.js';
import { TOOL_DEFS } from './src/world/tools.js';
import { worldFactory } from './src/world/world.js';
import { CASES, CASE_MAP } from './evals/cases.js';

export default {
  domain: 'homeservices',
  specs: SPECS,
  theme: THEME, // every spec also carries spec.theme (same object)
  worldFactory,
  toolDefs: TOOL_DEFS,
  cases: CASES,
  caseMap: CASE_MAP, // agent-id → case ids, every case exactly once
  judgePromptPath: 'evals/judge-prompt.md',
  bar: 0.9,
} satisfies EvalConfig;
