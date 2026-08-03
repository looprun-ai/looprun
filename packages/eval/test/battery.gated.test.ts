/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE EVAL BATTERY — GATED. This file does nothing in the everyday run.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * It hits a real model and bills a real key, so it runs only when BOTH are true:
 *
 * ```
 *   LOOPRUN_BATTERY=1                 the arming flag — nothing else turns this suite on
 *   GOOGLE_GENERATIVE_AI_API_KEY=…    the subject model's key
 * ```
 *
 * THE COMMAND that produces the baseline:
 *
 * ```
 *   pnpm -r build \
 *     && LOOPRUN_BATTERY=1 GOOGLE_GENERATIVE_AI_API_KEY=<key> \
 *        pnpm -C packages/eval exec vitest run test/battery.gated.test.ts
 * ```
 *
 * `pnpm -r build` is not optional: this package resolves its siblings through their published
 * `exports`, which point at `dist/`. A battery run over a stale `dist` measures the engine as it was
 * built, not as it is.
 *
 * Output lands in `packages/eval/.battery/` (git-ignored): `battery.json` — the artefact a later run
 * is diffed against — and `BATTERY.md`. Override the directory with `LOOPRUN_BATTERY_OUT`.
 *
 * THE SUBJECT MODEL is `geminiFlashLiteThinkOff()` — `gemini-3.1-flash-lite` with the numeric
 * `thinkingBudget: 0`. One model, one setting: the target is the FLOOR the engine must work on, not
 * an average across tiers. Nothing here selects a model by flag, because a baseline whose subject can
 * be swapped from the command line is not a baseline.
 *
 * WHAT THIS SUITE ASSERTS: that the battery RAN and produced its artefacts. It does NOT assert a
 * threshold. There is no bar to clear yet — this run IS the bar, and a later change is judged by
 * diffing `battery.json` against it. Turning a first measurement into a pass/fail would invent a
 * number nobody measured.
 *
 * Every metric this suite reports is proved correct, without a key, in `battery-metrics.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateText } from 'ai';
import { geminiFlashLiteThinkOff } from '@looprun-ai/models';
import { batterySkipReason } from './battery/gate.js';
import { runBattery } from './battery/battery.js';
import { writeBattery } from './battery/report.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUBJECT_DIR = resolve(HERE, 'fixtures/battery-subject');
const OUT_DIR = process.env.LOOPRUN_BATTERY_OUT ?? resolve(HERE, '..', '.battery');

/** The subject model id the numbers belong to — written into `battery.json`. */
const MODEL_ID = 'gemini-3.1-flash-lite (thinking off)';

/** A whole battery is dozens of sequential real calls; vitest's default 5 s would abort it. */
const BUDGET_MS = 30 * 60_000;

const skip = batterySkipReason();

describe.skipIf(skip !== null)('eval battery — baseline against the subject model', () => {
  it(
    'runs all three axes and writes battery.json + BATTERY.md',
    async () => {
      const { model, modelParams } = geminiFlashLiteThinkOff();

      // THE JUDGMENT AXIS'S CALL — isolated by construction: one prompt, no system message, no
      // tools, no history, no knowledge that an act is pending. Same model, same settings as the
      // subject, because the seam this axis measures is a second call on the SAME backend.
      const judge = async (prompt: string): Promise<string> => {
        const r = await generateText({ model, prompt, ...modelParams });
        return r.text ?? '';
      };

      const result = await runBattery({ subjectDir: SUBJECT_DIR, model, modelParams, modelId: MODEL_ID, judge });
      const written = writeBattery(result, OUT_DIR);

      // eslint-disable-next-line no-console
      console.log(`\nbattery → ${written.jsonPath}\nbattery → ${written.markdownPath}\n`);

      expect(result.capacity!.totals.turns).toBeGreaterThan(0);
      expect(result.resistance!.totals.vectors).toBeGreaterThan(0);
      expect(result.judgment!.arms.length).toBeGreaterThan(1); // the A/B needs both prompt shapes
      expect(result.judgment!.arms.every((a) => a.totals.cases > 0)).toBe(true);
      // A run whose every scenario errored is a transport failure, not a measurement.
      expect(result.capacity!.totals.errors.length).toBeLessThan(result.capacity!.totals.scenarios);
    },
    BUDGET_MS,
  );
});

describe.skipIf(skip === null)('eval battery — not armed', () => {
  it('reports why it did nothing', () => {
    // eslint-disable-next-line no-console
    console.log(`battery skipped: ${skip}`);
    expect(skip).toBeTruthy();
  });
});
