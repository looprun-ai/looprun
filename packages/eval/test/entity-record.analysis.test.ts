/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * EXPERIMENT 1 — THE PER-ENTITY RECORD, EVALUATED OFFLINE. Gated on the RECORDING, not on a key.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * This file spends nothing and calls no model: it reads the 70 scenarios the prose-lie measurement
 * already recorded (`packages/eval/.battery/measurements.json`, git-ignored) and computes what a
 * per-entity record rule WOULD have produced for each of them. With no recording present it reports why
 * it did nothing and passes — the same shape as the money gate, for the same reason: an instrument that
 * fails on a laptop without an artefact is not an instrument.
 *
 * ```
 *   pnpm -C packages/eval exec vitest run test/entity-record.analysis.test.ts
 * ```
 *
 * Output lands beside the recording as `ENTITY-RECORD.json`. The computing code is proved against
 * fixtures, without any recording at all, in `entity-record-metrics.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { surveyRun, surveyTotals, type RecordedRun, type SurveyRow } from './battery/entity-record.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.LOOPRUN_BATTERY_OUT ?? resolve(HERE, '..', '.battery');
const RECORDING = join(OUT_DIR, 'measurements.json');

/** The seven scenarios whose unsafe delivery already carried a rendered operation record line — the set
 *  the rule is aimed at, per the prose-lie report's "a record line was rendered, and CONTRADICTED the
 *  prose" row. */
const THE_SEVEN: readonly string[] = [
  'pl-first-person-past-no-tool-en-push-B',
  'pl-passive-vetoed-write-en-push-A',
  'pl-elliptical-vetoed-write-pt-plain-A',
  'pl-elliptical-vetoed-write-en-push-B',
  'pl-future-as-done-vetoed-write-pt-push-B',
  'pl-future-as-done-ok-false-write-pt-push-A',
  'pl-hedged-read-only-en-push-A',
];

const present = existsSync(RECORDING);

describe.skipIf(!present)('the per-entity record, over the recorded scenarios', () => {
  it('computes the rule’s record for every recorded run and writes the survey', () => {
    const raw = JSON.parse(readFileSync(RECORDING, 'utf8')) as {
      proseLie: { scored: Array<{ record: RecordedRun & { ledger?: RecordedRun['actionHistory'] } }> };
    };
    // A recording is a run taken on a date, and it keeps the key names it was written with. The
    // reader maps them onto the current shape rather than editing the record.
    const runs = raw.proseLie.scored.map((s) => ({ ...s.record, actionHistory: s.record.actionHistory ?? s.record.ledger ?? [] }));
    expect(runs.length).toBeGreaterThan(0);

    const rows: SurveyRow[] = runs.map(surveyRun);
    const seven = rows.filter((r) => THE_SEVEN.includes(r.id));
    const rest = rows.filter((r) => !THE_SEVEN.includes(r.id));

    const survey = {
      version: 1,
      source: RECORDING,
      totals: surveyTotals(rows),
      theSeven: { ids: THE_SEVEN, totals: surveyTotals(seven), rows: seven },
      theRest: { totals: surveyTotals(rest), rows: rest },
    };
    const outPath = join(OUT_DIR, 'ENTITY-RECORD.json');
    writeFileSync(outPath, JSON.stringify(survey, null, 2) + '\n');

    // eslint-disable-next-line no-console
    console.log(
      `\nentity record → ${outPath}\n` +
        `the seven: ${survey.theSeven.totals.closed}/${seven.length} closed · ` +
        `the rest: ${survey.theRest.totals.closed}/${rest.length} closed · ` +
        `lines added over the whole set: ${survey.totals.addedLines} across ${survey.totals.runsWithAddedLines} runs\n`,
    );

    expect(seven).toHaveLength(THE_SEVEN.length);
    expect(survey.totals.runs).toBe(rows.length);
  });
});

describe.skipIf(present)('the per-entity record — no recording', () => {
  it('reports why it did nothing', () => {
    // eslint-disable-next-line no-console
    console.log(`entity record skipped: no recording at ${RECORDING}`);
    expect(present).toBe(false);
  });
});
