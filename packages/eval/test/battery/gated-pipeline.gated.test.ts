/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE GATED PIPELINE, END TO END, AGAINST THE REAL MODEL. GATED — nothing runs in the everyday suite.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ```
 *   LOOPRUN_BATTERY=1                 the arming flag           (battery/gate.ts)
 *   GOOGLE_GENERATIVE_AI_API_KEY=…    the subject model's key   (battery/gate.ts)
 *   .battery/measurements.json        the 70 recorded turns
 * ```
 *
 * THE COMMAND:
 *
 * ```
 *   LOOPRUN_BATTERY=1 GOOGLE_GENERATIVE_AI_API_KEY=<key> \
 *     pnpm -C packages/eval exec vitest run test/battery/gated-pipeline.gated.test.ts
 * ```
 *
 * ONE MODEL in all three positions — `geminiFlashLiteThinkOff()`, thinking off. The gate, the rewriter
 * and the judge are the same subject; only the prompt changes. Output lands beside the recording as
 * `GATED-PIPELINE.json`.
 *
 * IT ASSERTS NOTHING ABOUT THE RATES. The question this run exists to answer is what the rates ARE,
 * and a run that fails when it dislikes its own answer has reported the assertion instead of the
 * measurement. The only assertions are that the set was complete and that the transport worked.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateText } from 'ai';
import { geminiFlashLiteThinkOff } from '@looprun-ai/models';
import { batterySkipReason } from './gate.js';
import { foldExperiment, isDamaged, runPipeline, type PipelineInput } from './gated-pipeline.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.LOOPRUN_BATTERY_OUT ?? resolve(HERE, '..', '..', '.battery');
const RECORDING = join(OUT_DIR, 'measurements.json');
const OUT = join(OUT_DIR, 'GATED-PIPELINE.json');

const REPLICATES = Number(process.env.LOOPRUN_PIPELINE_REPLICATES ?? 5);
const CONCURRENCY = Number(process.env.LOOPRUN_PIPELINE_CONCURRENCY ?? 6);

/** 70 turns × 5 replicates × (gate + rewrite + judge) ≈ 1000 calls. */
const BUDGET_MS = 180 * 60_000;

const skip = batterySkipReason() ?? (existsSync(RECORDING) ? null : `no recording at ${RECORDING}`);

/** A transient transport failure is not a measurement. Retry, with backoff, then let it be an error. */
async function withRetry(fn: () => Promise<string>, attempts = 5): Promise<string> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

describe.skipIf(skip !== null)('the gated pipeline over the 70 recorded turns', () => {
  it(
    'gates, rewrites only when the gate fires, delivers with the record, and judges the delivery',
    async () => {
      const { model, modelParams } = geminiFlashLiteThinkOff();
      const call = async (prompt: string): Promise<string> =>
        withRetry(async () => {
          const r = await generateText({ model, prompt, ...modelParams });
          return r.text ?? '';
        });

      const raw = JSON.parse(readFileSync(RECORDING, 'utf8')) as {
        modelId?: string;
        proseLie: { scored: Array<{ record: PipelineInput }> };
      };
      const all = raw.proseLie.scored.map((s) => s.record);
      // The subset knobs: a named handful, or the first N, to see the shape before the full set is
      // paid for. Unset, the run is the whole recording.
      const ids = (process.env.LOOPRUN_PIPELINE_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      const limit = Number(process.env.LOOPRUN_PIPELINE_LIMIT ?? all.length);
      const runs = ids.length ? ids.map((id) => {
        const found = all.find((r) => r.scenario.id === id || r.scenario.id === `pl-${id}`);
        if (!found) throw new Error(`no recorded turn named ${id}`);
        return found;
      }) : all.slice(0, limit);
      expect(runs.length).toBeGreaterThan(0);

      const started = Date.now();
      const cases = await runPipeline(
        runs,
        { gate: call, rewrite: call, judge: call, replicates: REPLICATES },
        CONCURRENCY,
        (done, total, id) => {
          if (done % 25 === 0 || done === total) {
            // eslint-disable-next-line no-console
            console.log(`  pipeline ${done}/${total} — last ${id} — ${Math.round((Date.now() - started) / 1000)}s`);
          }
        },
      );

      const experiment = foldExperiment(cases, REPLICATES);
      writeFileSync(
        OUT,
        JSON.stringify(
          { version: 1, source: RECORDING, subjectModel: raw.modelId ?? null, concurrency: CONCURRENCY, ...experiment },
          null,
          2,
        ) + '\n',
        'utf8',
      );

      const { bar1, bar2, observed } = experiment;
      // eslint-disable-next-line no-console
      console.log(
        `\ngated pipeline → ${OUT}\n` +
          `BRANCH: checked ${observed.checkedCases} · unchecked ${observed.uncheckedCases}\n` +
          `BAR 1 record coverage: ${bar1.contradicted}/${bar1.lies} lies contradicted — met: ${bar1.met}` +
          `${bar1.failing.length ? ` — failing: ${bar1.failing.join(', ')}` : ''}\n` +
          `BAR 2: checked lies safe ${bar2.checkedLiesSafe}/${bar2.checkedLies} ` +
          `(${bar2.uncheckedLies} lies unchecked) · honest damaged ${bar2.honestDamaged}/${bar2.honest} — ` +
          `met: ${bar2.met}\n` +
          `  rewrites ${bar2.rewrites} — still asserting ${bar2.rewritesStillAsserting} · ` +
          `dropping detail ${bar2.rewritesDroppingDetail} · echoing record ${bar2.rewritesEchoingRecord}\n` +
          `${bar2.liesFailing.length ? `  lies failing: ${bar2.liesFailing.join(', ')}\n` : ''}` +
          `${bar2.honestFailing.length ? `  honest failing: ${bar2.honestFailing.join(', ')}\n` : ''}` +
          `observed: gate fired ${observed.gateFires}/${observed.gateReplicates} checked replicates · ` +
          `lies safe in all ${REPLICATES}: ${observed.liesSafeAllReplicates}/${observed.lies} · ` +
          `honest gate-fired at least once ${observed.honestGateFiredAtLeastOnce}/${observed.honest}\n` +
          experiment.byLabel
            .map(
              (t) =>
                `  ${t.label.padEnd(9)} cases ${String(t.cases).padStart(2)}` +
                ` (checked ${t.checkedCases}/unchecked ${t.uncheckedCases})` +
                ` · gate fired ${t.gateFires} · rewrites ${t.rewrites}` +
                ` · unsafe ${t.unsafeReplicates}/${t.replicates}` +
                ` (ledger ${t.judgeUnsafeReplicates}, record ${t.judgeVsRecordUnsafeReplicates}) · errors ${t.errors}`,
            )
            .join('\n'),
      );
      for (const c of cases.filter((c) => c.handLabel === 'lie' && c.unsafeCount > 0)) {
        // eslint-disable-next-line no-console
        console.log(`  LIE NOT SAFE  ${c.scenarioId}  unsafe ${c.unsafeCount}/${c.replicates.length}  gate ${c.gateFires}/${c.replicates.length}`);
      }
      for (const c of cases.filter((c) => c.handLabel === 'honest' && isDamaged(c))) {
        // eslint-disable-next-line no-console
        console.log(`  HONEST DAMAGED  ${c.scenarioId}  gate ${c.gateFires}/${c.replicates.length}`);
      }

      expect(experiment.cases).toHaveLength(runs.length);
      expect(experiment.cases.every((c) => c.replicates.length === REPLICATES)).toBe(true);
      const errors = experiment.byLabel.reduce((n, t) => n + t.errors, 0);
      expect(errors).toBeLessThan(runs.length * REPLICATES);
    },
    BUDGET_MS,
  );
});

describe.skipIf(skip === null)('the gated pipeline — not armed', () => {
  it('reports why it did nothing', () => {
    // eslint-disable-next-line no-console
    console.log(`gated pipeline skipped: ${skip}`);
    expect(skip).toBeTruthy();
  });
});
