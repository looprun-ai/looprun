import { test } from 'vitest';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readUsageTotals, resetUsageTotals } from '@looprun-ai/mastra';
import { SubjectLoader } from '../src/subject-loader.js';
import { ExamRunner } from '../src/exam-runner.js';
import { buildJudgeInputs } from '../src/judge-inputs.js';
import { scan } from '../src/monitor.js';

// The phase-5 driver — env-gated, real subject model, never in CI.
//   RUN_ATLAS=<case-id>|all  RUN_ATLAS_REP=rep1  RUN_ATLAS_VARIANT=governed|both
const ATLAS = join(fileURLToPath(import.meta.url),
  '../../../../../../agentspec-bench/subjects/atlas-next');
const MODEL = 'google/gemini-3.1-flash-lite';
const RUN = process.env.RUN_ATLAS ?? '';

test.skipIf(RUN === '' || !existsSync(ATLAS))('atlas run', { timeout: 0 }, async () => {
  const subject = await SubjectLoader.load(ATLAS);
  const stamp = process.env.RUN_ATLAS_STAMP ?? '2026-08-18-atlas';
  const rep = process.env.RUN_ATLAS_REP ?? 'rep1';
  const runDir = join(ATLAS, 'test', stamp, rep);
  mkdirSync(runDir, { recursive: true });
  const asked = process.env.RUN_ATLAS_VARIANT ?? 'governed';
  const variants = asked === 'both' ? (['governed', 'ungoverned'] as const)
    : asked === 'ungoverned' ? (['ungoverned'] as const) : (['governed'] as const);
  const wanted = RUN === 'all' ? subject.cases
    : RUN.startsWith('first:') ? subject.cases.slice(0, Number(RUN.slice(6)))
    : RUN.startsWith('range:')
      ? subject.cases.filter(c => {
          const n = Number.parseInt(c.id, 10);
          return n >= Number(RUN.split(':')[1]) && n <= Number(RUN.split(':')[2]);
        })
    : subject.cases.filter(c => RUN.split(',').includes(c.id));
  const runner = new ExamRunner();
  resetUsageTotals();

  for (const c of wanted) {
    for (const variant of variants) {
      const done = await runner.runCase(subject, c, variant, MODEL, runDir);
      process.stdout.write(`${c.id}.${variant}: turns=${String(done.records.length)}`
        + ` invariants=${String(done.invariantFailures.length)}`
        + ` failure=${done.failure?.kind ?? 'none'}\n`);
    }
  }
  buildJudgeInputs(runDir, id => subject.cases.find(c => c.id === id)?.rubric ?? '');
  process.stdout.write(`monitor clean: ${String(scan(runDir).clean)}\n`);
  const usage = readUsageTotals();
  process.stdout.write(`usage: steps=${String(usage.steps)}`
    + ` in=${String(usage.inputTokens)} out=${String(usage.outputTokens)}\n`);
});
