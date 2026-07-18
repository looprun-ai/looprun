/**
 * @looprun-ai/eval — `looprun-eval init`: scaffold the eval contract in a user project.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CONFIG_STUB = (domain: string) => `import type { EvalConfig } from '@looprun-ai/eval';
// Wire the GENERATED bundle here (the agentspec skill fills these in):
//   src/agents/${domain}/index.ts   → SPECS + THEME
//   src/world/                      → world.ts (worldFactory) + tools.ts (TOOL_DEFS)
//   evals/cases.ts                  → CASES (the generated eval set)
// import { SPECS, THEME } from './src/agents/${domain}/index.js';
// import { TOOL_DEFS } from './src/world/tools.js';
// import { worldFactory } from './src/world/world.js';
// import { CASES, CASE_MAP } from './evals/cases.js';

export default {
  domain: '${domain}',
  specs: {},            // SPECS
  // theme: THEME,      // optional when every spec sets spec.theme
  worldFactory: () => {
    throw new Error('wire src/world/world.ts');
  },
  toolDefs: [],         // TOOL_DEFS
  cases: [],            // CASES
  caseMap: {},          // CASE_MAP (agent-id → case ids, every case exactly once)
  judgePromptPath: 'evals/judge-prompt.md',
  bar: 0.9,
} satisfies EvalConfig;
`;

const JUDGE_RULES_STUB = `# Domain judge rules

Business-specific pass/fail RULES for the LLM judge (the generic prompt owns the output
format — put only rules here, never an output format).

- (the agentspec skill fills these in from the domain docs)
`;

const GITIGNORE_LINES = `
# looprun eval scratch (committed artifacts: *.judged.json, cert.json, CERT.md)
eval-results/**/*.dump.json
eval-results/**/*.tasks.jsonl
eval-results/**/*.autofail.json
eval-results/**/*.verdicts.jsonl
`;

export function initProject(root: string, domain: string): string[] {
  const created: string[] = [];
  const configPath = join(root, 'looprun.eval.config.ts');
  if (!existsSync(configPath)) {
    writeFileSync(configPath, CONFIG_STUB(domain));
    created.push(configPath);
  }
  const evalsDir = join(root, 'evals');
  if (!existsSync(evalsDir)) {
    mkdirSync(evalsDir, { recursive: true });
    created.push(evalsDir);
  }
  const judgeRules = join(evalsDir, 'judge-prompt.md');
  if (!existsSync(judgeRules)) {
    writeFileSync(judgeRules, JUDGE_RULES_STUB);
    created.push(judgeRules);
  }
  const gi = join(root, '.gitignore');
  if (existsSync(gi)) {
    const cur = readFileSafe(gi);
    if (!cur.includes('eval-results/**/*.dump.json')) {
      appendFileSync(gi, GITIGNORE_LINES);
      created.push(`${gi} (appended)`);
    }
  } else {
    writeFileSync(gi, GITIGNORE_LINES.trimStart());
    created.push(gi);
  }
  return created;
}

function readFileSafe(p: string): string {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}
