/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE TWO MEASUREMENTS — GATED. This file does nothing in the everyday run.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Same gate as `battery.gated.test.ts` (it shares `battery/gate.ts`): a real model, a real key.
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
 *        pnpm -C packages/eval exec vitest run test/measurements.gated.test.ts
 * ```
 *
 * WHAT IT MEASURES — the engine AS IT IS. Nothing here changes any shipped package's behaviour.
 *
 * ```
 *   1  where the per-turn prompt cost accumulates: within a turn (steps reloading their own tool
 *      calls and results) vs across turns (sealed turns carried forward) vs the static prompt
 *   2  the prose-lie case: 70 scenarios over assertion shape × turn shape × language × pressure,
 *      each through the real loop, scored by a deterministic lexicon AND an isolated eval judge
 * ```
 *
 * Output lands in `packages/eval/.battery/` (git-ignored): `measurements.json` and `MEASUREMENTS.md`.
 * Override the directory with `LOOPRUN_BATTERY_OUT`.
 *
 * THIS SUITE ASSERTS THAT THE MEASUREMENT RAN, not that a number cleared a bar. There is no bar yet —
 * this run IS the baseline. Every metric it reports is proved correct, without a key, in
 * `measurements-metrics.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateText } from 'ai';
import { geminiFlashLiteThinkOff } from '@looprun-ai/models';
import { batterySkipReason } from './battery/gate.js';
import { loadSubject } from '../src/subject.js';
import { runAccumulation } from './battery/accumulation.js';
import { proseLieScenarios, runProseLieBattery } from './battery/prose-lie.js';
import { writeMeasurements } from './battery/measure-report.js';
import type { ScenarioDeps } from './battery/run-scenario.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUBJECT_DIR = resolve(HERE, 'fixtures/battery-subject');
const OUT_DIR = process.env.LOOPRUN_BATTERY_OUT ?? resolve(HERE, '..', '.battery');

const MODEL_ID = 'gemini-3.1-flash-lite (thinking off)';

/** 70 scenarios of two to three turns each, plus a judge call apiece — sequential, on a rate-limited
 *  subject. Vitest's default 5 s would abort the first one. */
const BUDGET_MS = 90 * 60_000;

const skip = batterySkipReason();

describe.skipIf(skip !== null)('the two measurements — against the subject model', () => {
  it(
    'measures prompt accumulation and the prose-lie case, and writes both artefacts',
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

      // THE EVAL JUDGE — isolated by construction: one prompt, no system message, no tools, no history,
      // no knowledge of which scenario it is scoring. Same model and settings as the subject, because
      // the question is whether a second call on the SAME backend can read the delivered text.
      const judge = async (prompt: string): Promise<string> => {
        const r = await generateText({ model, prompt, ...modelParams });
        return r.text ?? '';
      };

      const accumulation = await runAccumulation(deps);
      // eslint-disable-next-line no-console
      console.log(`\naccumulation: ${accumulation.calls.length} generations over ${accumulation.turns.length} turns`);

      const scenarios = proseLieScenarios();
      const proseLie = await runProseLieBattery(deps, judge, scenarios, (done, total, id) => {
        // eslint-disable-next-line no-console
        console.log(`  prose-lie ${done}/${total} — ${id}`);
      });

      const written = writeMeasurements({ version: 1, modelId: MODEL_ID, accumulation, proseLie }, OUT_DIR);
      // eslint-disable-next-line no-console
      console.log(
        `\nmeasurements → ${written.jsonPath}\nmeasurements → ${written.markdownPath}\n` +
          `SAFE (judge): ${proseLie.totals.safeByJudge}/${proseLie.totals.scenarios} · ` +
          `SAFE (lexicon): ${proseLie.totals.safeByMechanical}/${proseLie.totals.scenarios} · ` +
          `agreement: ${proseLie.totals.agreements}/${proseLie.totals.scenarios}\n`,
      );

      expect(accumulation.calls.length).toBeGreaterThan(accumulation.turns.length);
      expect(proseLie.totals.scenarios).toBe(scenarios.length);
      // A run whose every scenario errored is a transport failure, not a measurement.
      expect(proseLie.totals.errors.length).toBeLessThan(proseLie.totals.scenarios);
    },
    BUDGET_MS,
  );
});

describe.skipIf(skip === null)('the two measurements — not armed', () => {
  it('reports why it did nothing', () => {
    // eslint-disable-next-line no-console
    console.log(`measurements skipped: ${skip}`);
    expect(skip).toBeTruthy();
  });
});
