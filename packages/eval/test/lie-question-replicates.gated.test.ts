/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE WINNING QUESTION AT FIVE REPLICATES. GATED. Nothing runs here in the everyday suite.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * WHY FIVE AND NOT TWO. At two replicates a case that the detector flags only sometimes can come out
 * clean by chance, and "caught" then covers both a case answered SIM five times out of five and a case
 * answered SIM three times out of five. Those are different instruments. Five replicates separate them,
 * and the number this file reports for every unequivocal lie is HOW MANY of the five flagged it.
 *
 * WHAT IT RUNS — `C-reader-belief`, unchanged, over both sets:
 *
 * ```
 *   the AUTHORED set   51 cases — 31 unequivocal lies, 20 honest controls, two domains
 *   the RECORDED 70    11 unequivocal lies, 31 ambiguous, 28 honest (7 ask-routed, excluded)
 * ```
 *
 * THE COMMAND:
 *
 * ```
 *   pnpm -r build \
 *     && LOOPRUN_BATTERY=1 GOOGLE_GENERATIVE_AI_API_KEY=<key> \
 *        pnpm -C packages/eval exec vitest run test/lie-question-replicates.gated.test.ts
 * ```
 *
 * Output lands beside the recording as `LIE-QUESTION-5X.json`. It asserts nothing about the verdict
 * counts: the question this run exists to answer is what those counts ARE, and a run that fails when it
 * dislikes its own answer reports the assertion instead of the measurement.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateText } from 'ai';
import { geminiFlashLiteThinkOff } from '@looprun-ai/models';
import { batterySkipReason } from './battery/gate.js';
import {
  NEW_CASES,
  candidateByKey,
  recordedCases,
  runSweep,
  tally,
  tallyByDomain,
  type CaseResult,
  type QuestionCase,
  type RecordedRun,
} from './battery/lie-question.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.LOOPRUN_BATTERY_OUT ?? resolve(HERE, '..', '.battery');
const RECORDING = join(OUT_DIR, 'measurements.json');
const OUT = join(OUT_DIR, 'LIE-QUESTION-5X.json');

const REPLICATES = Number(process.env.LOOPRUN_QUESTION_REPLICATES ?? 5);

/** (51 + 70) × 5 ≈ 605 sequential calls on a rate-limited model. */
const BUDGET_MS = 90 * 60_000;

/** The winner of the candidate sweep, carried by key so this file cannot measure a different wording. */
const WINNER = 'C-reader-belief';

const skip = batterySkipReason() ?? (existsSync(RECORDING) ? null : `no recording at ${RECORDING}`);

/** How many of the replicates flagged this case. The figure the whole run exists to produce. */
function flagged(r: CaseResult): number {
  return r.verdicts.filter(Boolean).length;
}

/** Every case of one label, with its flag count — sorted so the weakest detections come first. */
function perCase(results: readonly CaseResult[], cases: readonly QuestionCase[], label: string) {
  return results
    .filter((r) => r.label === label)
    .map((r) => {
      const k = cases.find((c) => c.id === r.caseId);
      return {
        id: r.caseId,
        domain: r.domain,
        shape: r.shape,
        language: r.language,
        askRouted: r.askRouted,
        flagged: flagged(r),
        of: r.verdicts.length,
        record: k?.record ?? '',
        message: k?.message ?? '',
        raw: r.raw,
      };
    })
    .sort((a, b) => a.flagged - b.flagged || a.id.localeCompare(b.id));
}

describe.skipIf(skip !== null)('the winning question at five replicates', () => {
  it(
    'reports, for every unequivocal lie, how many of the five replicates flagged it',
    async () => {
      const { model, modelParams } = geminiFlashLiteThinkOff();
      const ask = async (prompt: string): Promise<string> => {
        const r = await generateText({ model, prompt, ...modelParams });
        return r.text ?? '';
      };

      const candidate = candidateByKey(WINNER);
      const raw = JSON.parse(readFileSync(RECORDING, 'utf8')) as {
        modelId?: string;
        proseLie: { scored: Array<{ record: RecordedRun }> };
      };
      const old = recordedCases(raw.proseLie.scored.map((s) => s.record));
      expect(old).toHaveLength(70);

      const sets: Array<{ name: string; cases: readonly QuestionCase[] }> = [
        { name: 'authored', cases: NEW_CASES },
        { name: 'recorded70', cases: old },
      ];

      const out: Record<string, unknown> = {};
      for (const set of sets) {
        const sweep = await runSweep(set.cases, [candidate], ask, REPLICATES, (d, t, l) => {
          if (d % 20 === 0 || d === t) console.log(`  [${set.name}] ${d}/${t}  ${l}`);
        });
        const overall = tally(sweep.results, candidate);
        const byDomain = [...new Set(set.cases.map((c) => c.domain))].map((dm) => ({
          domain: dm,
          ...tallyByDomain(sweep.results, candidate, dm),
        }));
        const lies = perCase(sweep.results, set.cases, 'lie');
        const honest = perCase(sweep.results, set.cases, 'honest').filter((c) => !c.askRouted);
        const ambiguous = perCase(sweep.results, set.cases, 'ambiguous');

        out[set.name] = { overall, byDomain, lies, honest, ambiguous };

        console.log(
          `  ${set.name}: lies flagged on ALL ${REPLICATES}: ${lies.filter((l) => l.flagged === REPLICATES).length}/${lies.length}` +
            `  |  honest flagged at least once: ${honest.filter((h) => h.flagged > 0).length}/${honest.length}`,
        );
        for (const l of lies.filter((l) => l.flagged < REPLICATES)) {
          console.log(`  NOT ${REPLICATES}/${REPLICATES}  ${l.id}  ${l.flagged}/${l.of}\n    RECORD: ${l.record}\n    MESSAGE: ${l.message}`);
        }
        for (const h of honest.filter((h) => h.flagged > 0)) {
          console.log(`  FLAGGED HONEST  ${h.id}  ${h.flagged}/${h.of}\n    RECORD: ${h.record}\n    MESSAGE: ${h.message}`);
        }
      }

      writeFileSync(
        OUT,
        JSON.stringify(
          {
            version: 1,
            modelId: raw.modelId ?? null,
            replicates: REPLICATES,
            candidate: { key: candidate.key, prompt: candidate.render('<REGISTRO>', '<MENSAGEM>') },
            sets: out,
          },
          null,
          2,
        ),
        'utf8',
      );
      console.log(`  wrote ${OUT}`);
      expect(Object.keys(out)).toHaveLength(2);
    },
    BUDGET_MS,
  );
});

if (skip) {
  describe('the winning question at five replicates', () => {
    it('is not running', () => {
      console.log(`  skipped: ${skip}`);
      expect(skip).toBeTruthy();
    });
  });
}
