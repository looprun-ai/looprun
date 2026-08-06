/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * EXPERIMENT 2 — THE REFUSAL CLAUSE, GATED. This file does nothing in the everyday run.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Same gate as the two measurements (it shares `battery/gate.ts`): a real model, a real key.
 *
 * ```
 *   LOOPRUN_BATTERY=1                 the arming flag
 *   GOOGLE_GENERATIVE_AI_API_KEY=…    the subject model's key
 * ```
 *
 * THE COMMAND:
 *
 * ```
 *   pnpm -r build \
 *     && LOOPRUN_BATTERY=1 GOOGLE_GENERATIVE_AI_API_KEY=<key> \
 *        pnpm -C packages/eval exec vitest run test/refusal-clause.gated.test.ts
 * ```
 *
 * WHAT IT VARIES: one bullet under `## Reply rules`, and nothing else. The clause enters as a
 * prose-only reply guard (`refusal-clause.ts`), so no shipped package changes and no deterministic
 * check is added — the variant differs from the control by the system prompt alone.
 *
 * WHAT IT RUNS: the 30 scenarios the baseline adjudicated unsafe, and 12 it adjudicated safe (the
 * over-refusal check), each in BOTH variants, each variant twice — so a flip is distinguishable from the
 * subject's own run-to-run variation.
 *
 * Output lands in `packages/eval/.battery/` (git-ignored): `refusal-clause.json`. THIS SUITE ASSERTS
 * THAT THE EXPERIMENT RAN, not that a number cleared a bar. Every fold it reports is proved without a
 * key in `refusal-clause-metrics.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateText } from 'ai';
import { geminiFlashLiteThinkOff } from '@looprun-ai/models';
import { batterySkipReason } from './battery/gate.js';
import { loadSubject } from '../src/subject.js';
import {
  BASELINE_UNSAFE_IDS,
  OVER_REFUSAL_IDS,
  REFUSAL_CLAUSE,
  runClauseExperiment,
  scenariosByIds,
} from './battery/refusal-clause.js';
import type { ScenarioDeps } from './battery/run-scenario.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUBJECT_DIR = resolve(HERE, 'fixtures/battery-subject');
const OUT_DIR = process.env.LOOPRUN_BATTERY_OUT ?? resolve(HERE, '..', '.battery');

const MODEL_ID = 'gemini-3.1-flash-lite (thinking off)';

/** 42 scenarios × 2 variants × 2 replicates, each a two-to-three-turn conversation plus a judge call, all
 *  sequential on a rate-limited subject. */
const BUDGET_MS = 240 * 60_000;

/** How many times each scenario runs in each variant. Two is the minimum that separates a flip from noise. */
const REPLICATES = Number(process.env.LOOPRUN_CLAUSE_REPLICATES ?? 2);

const skip = batterySkipReason();

describe.skipIf(skip !== null)('the refusal clause — against the subject model', () => {
  it(
    'runs the failing scenarios and the over-refusal sample in both variants, and writes the artefact',
    async () => {
      const { model, modelParams } = geminiFlashLiteThinkOff();
      const subject = await loadSubject(SUBJECT_DIR);
      const deps: ScenarioDeps = {
        spec: subject.specs[Object.keys(subject.specs)[0]!]!,
        contract: subject.contract,
        toolDefs: subject.toolDefs,
        makeWorld: subject.makeWorld,
        model,
        modelParams,
      };

      // The SAME isolated judge the baseline used — one prompt, no system message, no tools, no
      // history, no knowledge of which variant it is scoring.
      const judge = async (prompt: string): Promise<string> => {
        const r = await generateText({ model, prompt, ...modelParams });
        return r.text ?? '';
      };

      const experiment = await runClauseExperiment(
        [
          { name: 'baseline-unsafe', scenarios: scenariosByIds(BASELINE_UNSAFE_IDS) },
          { name: 'over-refusal', scenarios: scenariosByIds(OVER_REFUSAL_IDS) },
        ],
        deps,
        judge,
        REPLICATES,
        (done, total, label) => {
          // eslint-disable-next-line no-console
          console.log(`  clause ${done}/${total} — ${label}`);
        },
      );

      mkdirSync(OUT_DIR, { recursive: true });
      const jsonPath = join(OUT_DIR, 'refusal-clause.json');
      writeFileSync(
        jsonPath,
        JSON.stringify({ version: 1, modelId: MODEL_ID, replicates: REPLICATES, ...experiment }, null, 2) + '\n',
      );
      // eslint-disable-next-line no-console
      console.log(
        `\nrefusal clause → ${jsonPath}\n` +
          experiment.totals
            .map(
              (t) =>
                `${t.set}: control unsafe(judge) ${t.byVariant.control.unsafeByJudge}/${t.byVariant.control.runs} · ` +
                `clause unsafe(judge) ${t.byVariant.clause.unsafeByJudge}/${t.byVariant.clause.runs}`,
            )
            .join('\n') +
          '\n',
      );

      expect(experiment.clause).toBe(REFUSAL_CLAUSE);
      expect(experiment.runs.length).toBe((BASELINE_UNSAFE_IDS.length + OVER_REFUSAL_IDS.length) * REPLICATES * 2);
      // A run whose every scenario errored is a transport failure, not a measurement.
      expect(experiment.totals.every((t) => t.errors.length < t.byVariant.clause.runs + t.byVariant.control.runs)).toBe(true);
    },
    BUDGET_MS,
  );
});

describe.skipIf(skip === null)('the refusal clause — not armed', () => {
  it('reports why it did nothing', () => {
    // eslint-disable-next-line no-console
    console.log(`refusal clause skipped: ${skip}`);
    expect(skip).toBeTruthy();
  });
});
