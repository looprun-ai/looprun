/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * EXPERIMENT 3 — THE CLOSED RECORD AND THE REWRITE. GATED. This file does nothing in the everyday run.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * TWO gates, because this run needs two things: a real model, and the prose-lie recording it simulates
 * the design over.
 *
 * ```
 *   LOOPRUN_BATTERY=1                 the arming flag           (battery/gate.ts)
 *   GOOGLE_GENERATIVE_AI_API_KEY=…    the model's key           (battery/gate.ts)
 *   .battery/measurements.json        the 70 recorded runs
 * ```
 *
 * THE COMMAND:
 *
 * ```
 *   pnpm -r build \
 *     && LOOPRUN_BATTERY=1 GOOGLE_GENERATIVE_AI_API_KEY=<key> \
 *        pnpm -C packages/eval exec vitest run test/closed-record.gated.test.ts
 * ```
 *
 * WHAT IT RUNS. All 70 scenarios, not only the 26 the baseline flagged: the design would run
 * unconditionally, so the honest turns are where its damage would show. Per scenario — one closed record
 * (deterministic), one judge call on Part A alone, then `LOOPRUN_REWRITE_REPLICATES` rewrites (2 by
 * default) each with its own judge call.
 *
 * NO SHIPPED PACKAGE SOURCE CHANGES. The design is not approved; this is a measurement harness that
 * simulates it over recorded data plus new model calls. Output lands beside the recording as
 * `CLOSED-RECORD.json`. The computing code is proved against fixtures, without a key and without a
 * recording, in `closed-record-metrics.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateText } from 'ai';
import { geminiFlashLiteThinkOff } from '@looprun-ai/models';
import { batterySkipReason } from './battery/gate.js';
import { assertsCompletion, judgePrompt } from './battery/prose-lie.js';
import type { ProseLieRecord } from './battery/prose-lie.js';
import { runClosedRecordExperiment, type RecordedProseLieRun } from './battery/closed-record.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.LOOPRUN_BATTERY_OUT ?? resolve(HERE, '..', '.battery');
const RECORDING = join(OUT_DIR, 'measurements.json');

const REPLICATES = Number(process.env.LOOPRUN_REWRITE_REPLICATES ?? 2);

/** 70 scenarios × (1 judge + 2 × (rewrite + judge)) = 350 sequential calls on a rate-limited model. */
const BUDGET_MS = 120 * 60_000;

const skip = batterySkipReason() ?? (existsSync(RECORDING) ? null : `no recording at ${RECORDING}`);

describe.skipIf(skip !== null)('the closed record and the rewrite — over the 70 recorded runs', () => {
  it(
    'computes Part A for every run, rewrites under it, and scores both halves',
    async () => {
      const { model, modelParams } = geminiFlashLiteThinkOff();
      const call = async (prompt: string): Promise<string> => {
        const r = await generateText({ model, prompt, ...modelParams });
        return r.text ?? '';
      };

      const raw = JSON.parse(readFileSync(RECORDING, 'utf8')) as {
        proseLie: { scored: Array<{ record: RecordedProseLieRun }> };
      };
      const recorded = raw.proseLie.scored.map((s) => s.record);
      expect(recorded.length).toBeGreaterThan(0);

      const experiment = await runClosedRecordExperiment(
        recorded,
        {
          rewrite: call,
          // The eval judge is the battery's own — same closed question, same isolation, same parse — so
          // the number it produces is comparable to the one the baseline measurement reported. Its
          // prompt reads exactly two fields off the run, `action history` and `delivered`, and this is the pair
          // it is handed: the run's real action history, and the delivery the design would have shipped.
          judge: call,
          judgePromptFor: (run, delivered) =>
            judgePrompt({ actionHistory: run.actionHistory, delivered } as unknown as ProseLieRecord),
          mechanicalUnsafe: (delivered, language, target) => assertsCompletion(delivered, language, target),
          replicates: REPLICATES,
        },
        (done, total, id) => {
          // eslint-disable-next-line no-console
          console.log(`  closed-record ${done}/${total} — ${id}`);
        },
      );

      const outPath = join(OUT_DIR, 'CLOSED-RECORD.json');
      writeFileSync(outPath, JSON.stringify({ version: 1, source: RECORDING, replicates: REPLICATES, ...experiment }, null, 2) + '\n');

      // eslint-disable-next-line no-console
      console.log(
        `\nclosed record → ${outPath}\n` +
          `A alone (record contradicts), of the ${experiment.baselineUnsafe.scenarios} baseline-unsafe: ` +
          `${experiment.baselineUnsafe.contradictedByA}\n` +
          `A+B safe, of the same ${experiment.baselineUnsafe.scenarios}: ${experiment.baselineUnsafe.safeAfterAB} ` +
          `(judge ${experiment.baselineUnsafe.safeAfterABJudge})\n` +
          `A+B still safe, of the ${experiment.baselineSafe.scenarios} baseline-safe: ${experiment.baselineSafe.safeAfterAB} ` +
          `(judge ${experiment.baselineSafe.safeAfterABJudge})\n` +
          `overall: ${experiment.overall.safeAfterAB}/${experiment.overall.scenarios} · ` +
          `leak candidates: ${experiment.overall.leakCandidates} · copies: ${experiment.overall.copies}\n` +
          `failing: ${experiment.overall.failing.join(', ') || '(none)'}\n`,
      );

      expect(experiment.overall.scenarios).toBe(recorded.length);
      // A run whose every replicate errored is a transport failure, not a measurement.
      expect(experiment.overall.errors.length).toBeLessThan(recorded.length * REPLICATES);
    },
    BUDGET_MS,
  );
});

describe.skipIf(skip === null)('the closed record and the rewrite — not armed', () => {
  it('reports why it did nothing', () => {
    // eslint-disable-next-line no-console
    console.log(`closed record skipped: ${skip}`);
    expect(skip).toBeTruthy();
  });
});
