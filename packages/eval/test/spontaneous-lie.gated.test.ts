/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE SPONTANEOUS-LIE MEASUREMENT — GATED. This file does nothing in the everyday run.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Same gate as the rest of the battery (`battery/gate.ts`): a real model, a real key.
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
 *        pnpm -C packages/eval exec vitest run test/spontaneous-lie.gated.test.ts
 * ```
 *
 * WHAT IT MEASURES — how often the model asserts an operation the ledger denies when NOTHING in the
 * request invites the claim. 48 conversations, 168 user turns, over eight situations × two languages,
 * in TWO domains (the calendar subject at two variants, the refund desk at one), every turn through
 * the real loop. The three-way verdict is HAND adjudication over the full delivered
 * text and lives in `battery/spontaneous-verdict.ts`; this suite records the text and folds the labels
 * once they exist.
 *
 * Output lands in `packages/eval/.battery/` (git-ignored): `spontaneous.json` + `SPONTANEOUS.md`.
 * Override the directory with `LOOPRUN_BATTERY_OUT`.
 *
 * REPLAY. The three-way verdict is written AFTER the run, against that run's exact text, so re-driving
 * the model would produce different prose under the same turn keys and invalidate the adjudication.
 * Point `LOOPRUN_SPONTANEOUS_REPLAY` at an existing `spontaneous.json` and this suite folds THAT
 * artefact instead of calling the model — no key needed, and the published numbers are reproducible.
 *
 * THIS SUITE ASSERTS THAT THE MEASUREMENT RAN, not that a number cleared a bar. Every metric it
 * reports is proved correct, without a key, in `spontaneous-lie-metrics.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geminiFlashLiteThinkOff } from '@looprun-ai/models';
import { batterySkipReason } from './battery/gate.js';
import { loadSubject } from '../src/subject.js';
import { runSpontaneousBattery, spontaneousScenarios, totalTurns, type SpontaneousRun } from './battery/spontaneous-lie.js';
import { HAND_LABELS, scoreTurns, spontaneousTotals, writeSpontaneous } from './battery/spontaneous-verdict.js';
import type { ScenarioDeps } from './battery/run-scenario.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CALENDAR_DIR = resolve(HERE, 'fixtures/battery-subject');
const ORDERS_DIR = resolve(HERE, 'fixtures/orders-subject');
const OUT_DIR = process.env.LOOPRUN_BATTERY_OUT ?? resolve(HERE, '..', '.battery');

const MODEL_ID = 'gemini-3.1-flash-lite (thinking off)';

/** 168 sequential user turns on a rate-limited subject, several of them multi-step. */
const BUDGET_MS = 120 * 60_000;

/** An artefact to re-fold instead of driving the model — see REPLAY above. */
const REPLAY = process.env.LOOPRUN_SPONTANEOUS_REPLAY;

const skip = REPLAY ? null : batterySkipReason();

describe.skipIf(skip !== null)('the spontaneous-lie measurement — against the subject model', () => {
  it(
    'drives every scenario and writes spontaneous.json + SPONTANEOUS.md',
    async () => {
      const scenarios = spontaneousScenarios();
      if (REPLAY) {
        const runs = (JSON.parse(readFileSync(REPLAY, 'utf8')).runs ?? []) as SpontaneousRun[];
        const totals = spontaneousTotals(runs, scoreTurns(runs, HAND_LABELS));
        const written = writeSpontaneous({ version: 1, modelId: MODEL_ID, runs, totals }, OUT_DIR);
        // eslint-disable-next-line no-console
        console.log(`\nreplayed → ${written.jsonPath}\nreplayed → ${written.markdownPath}\n`);
        expect(totals.turns).toBe(totalTurns(scenarios));
        return;
      }

      const { model, modelParams } = geminiFlashLiteThinkOff();
      const depsOf = async (dir: string): Promise<ScenarioDeps> => {
        const subject = await loadSubject(dir);
        return {
          spec: subject.specs[Object.keys(subject.specs)[0]!]!,
          contract: subject.contract,
          toolDefs: subject.toolDefs,
          makeWorld: subject.makeWorld,
          model,
          modelParams,
        };
      };
      const deps = { calendar: await depsOf(CALENDAR_DIR), orders: await depsOf(ORDERS_DIR) };

      const runs = await runSpontaneousBattery(deps, scenarios, (done, total, id) => {
        // eslint-disable-next-line no-console
        console.log(`  [${done}/${total}] ${id}`);
      });

      // The labels are written AFTER the first run, so the fold is attempted and skipped rather than
      // required: a measurement that cannot write its own raw material until it is adjudicated could
      // never produce the material to adjudicate.
      let totals = null;
      try {
        totals = spontaneousTotals(runs, scoreTurns(runs, HAND_LABELS));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log(`  verdict fold skipped: ${(e as Error).message.slice(0, 200)}`);
      }

      const written = writeSpontaneous({ version: 1, modelId: MODEL_ID, runs, totals }, OUT_DIR);
      // eslint-disable-next-line no-console
      console.log(`\nspontaneous → ${written.jsonPath}\nspontaneous → ${written.markdownPath}\n`);

      expect(runs.length).toBe(scenarios.length);
      const driven = runs.reduce((n, r) => n + r.turns.length, 0);
      expect(driven).toBe(totalTurns(scenarios));
      // A run whose every conversation errored is a transport failure, not a measurement.
      expect(runs.filter((r) => r.error).length).toBeLessThan(runs.length);
    },
    BUDGET_MS,
  );
});

describe.skipIf(skip === null)('the spontaneous-lie measurement — not armed', () => {
  it('reports why it did nothing', () => {
    // eslint-disable-next-line no-console
    console.log(`spontaneous-lie skipped: ${skip}`);
    expect(skip).toBeTruthy();
  });
});
