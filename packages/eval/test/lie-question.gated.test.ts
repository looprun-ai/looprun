/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE DETECTOR'S QUESTION — TWO MEASUREMENTS. GATED. This file does nothing in the everyday run.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * THREE gates, because this run needs three things: a real model, its key, and the prose-lie recording
 * measurement 1 is computed over.
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
 *        pnpm -C packages/eval exec vitest run test/lie-question.gated.test.ts
 * ```
 *
 * WHAT IT RUNS.
 *
 * ```
 *   MEASUREMENT 1   5 candidate questions × 70 recorded runs × 2 replicates
 *   MEASUREMENT 2   the WINNER × the independently authored set × 2 replicates
 * ```
 *
 * The standing question runs as one of the five rather than being read off a remembered number: a
 * candidate compared against a figure from another session is not compared at all.
 *
 * Output lands beside the recording as `LIE-QUESTION.json`. The computing code is proved without a key
 * and without a recording in `lie-question-metrics.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateText } from 'ai';
import { geminiFlashLiteThinkOff } from '@looprun-ai/models';
import { batterySkipReason } from './battery/gate.js';
import {
  CANDIDATES,
  NEW_CASES,
  pickWinner,
  recordedCases,
  runSweep,
  tally,
  tallyByDomain,
  type RecordedRun,
} from './battery/lie-question.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.LOOPRUN_BATTERY_OUT ?? resolve(HERE, '..', '.battery');
const RECORDING = join(OUT_DIR, 'measurements.json');
const OUT = join(OUT_DIR, 'LIE-QUESTION.json');

const REPLICATES = Number(process.env.LOOPRUN_QUESTION_REPLICATES ?? 2);

/** 5 × 70 × 2 + 1 × 51 × 2 ≈ 800 sequential calls on a rate-limited model. */
const BUDGET_MS = 180 * 60_000;

const skip = batterySkipReason() ?? (existsSync(RECORDING) ? null : `no recording at ${RECORDING}`);

describe.skipIf(skip !== null)('the prose-lie detector question', () => {
  it(
    'measures every candidate over the recorded 70, then the winner over an independently authored set',
    async () => {
      const { model, modelParams } = geminiFlashLiteThinkOff();
      const ask = async (prompt: string): Promise<string> => {
        const r = await generateText({ model, prompt, ...modelParams });
        return r.text ?? '';
      };

      const raw = JSON.parse(readFileSync(RECORDING, 'utf8')) as {
        modelId?: string;
        proseLie: { scored: Array<{ record: RecordedRun }> };
      };
      const recorded = recordedCases(raw.proseLie.scored.map((s) => s.record));
      expect(recorded).toHaveLength(70);
      expect(recorded.filter((c) => c.label === 'lie')).toHaveLength(11);
      expect(recorded.filter((c) => c.label === 'ambiguous')).toHaveLength(31);

      // ── Measurement 1 ────────────────────────────────────────────────────────────────────────────
      const m1 = await runSweep(recorded, CANDIDATES, ask, REPLICATES, (done, total, label) => {
        if (done % 25 === 0 || done === total) console.log(`  [m1] ${done}/${total}  ${label}`);
      });

      for (const t of m1.tallies) {
        console.log(
          `  ${t.candidate.padEnd(18)} lies ${t.liesCaught}/${t.liesTotal}  ` +
            `false positives ${t.honestFlagged}/${t.honestTotal}  ` +
            `ambiguous ${t.ambiguousFlagged}/${t.ambiguousTotal}  unstable ${t.unstable.length}`,
        );
      }

      const winner = pickWinner(m1.tallies);
      // Every candidate missing a lie is a reportable outcome, not a crash: the file is written first
      // so the numbers survive, and the assertion below is what fails.
      const winnerKey = winner?.candidate ?? null;
      console.log(`  winner: ${winnerKey ?? '(none — every candidate missed a lie)'}`);

      // ── Measurement 2 ────────────────────────────────────────────────────────────────────────────
      const chosen = CANDIDATES.find((c) => c.key === winnerKey) ?? null;
      const m2 = chosen
        ? await runSweep(NEW_CASES, [chosen], ask, REPLICATES, (done, total, label) => {
            if (done % 10 === 0 || done === total) console.log(`  [m2] ${done}/${total}  ${label}`);
          })
        : null;

      const m2Overall = chosen && m2 ? tally(m2.results, chosen) : null;
      const m2ByDomain =
        chosen && m2
          ? ['orders', 'calendar-new'].map((d) => ({ domain: d, ...tallyByDomain(m2.results, chosen, d) }))
          : [];

      if (m2Overall) {
        console.log(
          `  [m2] lies ${m2Overall.liesCaught}/${m2Overall.liesTotal}  ` +
            `false positives ${m2Overall.honestFlagged}/${m2Overall.honestTotal}  unstable ${m2Overall.unstable.length}`,
        );
        for (const miss of m2Overall.missedLies) {
          const kase = NEW_CASES.find((c) => c.id === miss);
          console.log(`  MISS ${miss}\n    RECORD: ${kase?.record}\n    MESSAGE: ${kase?.message}`);
        }
      }

      writeFileSync(
        OUT,
        JSON.stringify(
          {
            version: 1,
            modelId: raw.modelId ?? null,
            replicates: REPLICATES,
            candidates: CANDIDATES.map((c) => ({
              key: c.key,
              premise: c.premise,
              reading: c.reading,
              prompt: c.render('<REGISTRO>', '<MENSAGEM>'),
            })),
            measurement1: { tallies: m1.tallies, results: m1.results },
            winner: winnerKey,
            newCases: NEW_CASES,
            measurement2: m2 ? { overall: m2Overall, byDomain: m2ByDomain, results: m2.results } : null,
          },
          null,
          2,
        ),
        'utf8',
      );
      console.log(`  wrote ${OUT}`);

      // The one thing this measurement is not allowed to be silent about.
      expect(winnerKey, 'every candidate let an unequivocal lie through').not.toBeNull();
      expect(m2Overall).not.toBeNull();
    },
    BUDGET_MS,
  );
});

if (skip) {
  describe('the prose-lie detector question', () => {
    it('is not running', () => {
      console.log(`  skipped: ${skip}`);
      expect(skip).toBeTruthy();
    });
  });
}
