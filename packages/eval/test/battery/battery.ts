/**
 * THE BATTERY — the three axes, run against one subject model, folded into one result.
 *
 * ```
 *   CAPACITY   (R2)  real conversations through `runSpecConversation`, against the subject's spec,
 *                    guards and world. Measures: valid-turn rate, redrives per turn, and WHERE the
 *                    shape is missed.
 *   RESISTANCE (R1)  the open red-team residuals as real prompts. Measures: breach per vector.
 *   JUDGMENT         the closed consent question, as an isolated call. Measures: accuracy, and which
 *                    way the model leans on the ambiguous set.
 * ```
 *
 * DEPENDENCY-INJECTED ON PURPOSE. `model` and `judge` are parameters, not lookups, so the ENTIRE
 * battery — every metric, every fold, both report writers — runs against the scripted fake model in
 * the everyday suite. A battery whose measuring code is only ever exercised by the run it measures
 * produces numbers nobody can trust.
 *
 * Scenarios run SEQUENTIALLY. The axes are independent, but a rate-limited subject model turns
 * concurrency into retries and retries into a different measurement.
 */
import { loadSubject, type Subject } from '../../src/subject.js';
import { runScenario } from './run-scenario.js';
import { defectHistogram, totalsOf, type AxisTotals, type ScenarioSheet } from './sheet.js';
import { RESISTANCE_VECTORS, resistanceTotals, type ResistanceTotals, type VectorResult } from './resistance.js';
import { judgmentTotals, runJudgment, type JudgmentResult, type JudgmentTotals } from './judgment.js';

export interface BatteryOptions {
  /** The subject directory — spec, contract, world and the CAPACITY case pack. */
  subjectDir: string;
  /** An AI-SDK LanguageModel: the real subject model, or a scripted fake. */
  model: unknown;
  modelParams?: Record<string, unknown>;
  /** The isolated closed-question call. Absent ⇒ the JUDGMENT axis is skipped and says so. */
  judge?: (prompt: string) => Promise<string>;
  /** Label written into the result — the model id the numbers belong to. */
  modelId: string;
  /** Run only these axes. Default: all three. */
  axes?: ReadonlyArray<'capacity' | 'resistance' | 'judgment'>;
}

export interface BatteryResult {
  /** The schema version of this file. A later run diffs against a baseline of the same version. */
  version: 1;
  modelId: string;
  subjectDir: string;
  axesRun: string[];
  capacity: { sheets: ScenarioSheet[]; totals: AxisTotals; defectsWhere: Record<string, number> } | null;
  resistance: { results: VectorResult[]; totals: ResistanceTotals } | null;
  judgment: { results: JudgmentResult[]; totals: JudgmentTotals } | null;
}

const ALL_AXES = ['capacity', 'resistance', 'judgment'] as const;

export async function runBattery(opts: BatteryOptions): Promise<BatteryResult> {
  const axes = opts.axes ?? ALL_AXES;
  const needsSubject = axes.includes('capacity') || axes.includes('resistance');
  const subject = needsSubject ? await loadSubject(opts.subjectDir) : null;

  return {
    version: 1,
    modelId: opts.modelId,
    subjectDir: opts.subjectDir,
    axesRun: [...axes],
    capacity: axes.includes('capacity') ? await runCapacity(subject!, opts) : null,
    resistance: axes.includes('resistance') ? await runResistance(subject!, opts) : null,
    judgment: axes.includes('judgment') && opts.judge ? await runJudgmentAxis(opts.judge) : null,
  };
}

function depsFor(subject: Subject, opts: BatteryOptions) {
  const specId = Object.keys(subject.specs)[0];
  return {
    spec: subject.specs[specId],
    contract: subject.contract,
    toolDefs: subject.toolDefs,
    makeWorld: subject.makeWorld,
    model: opts.model,
    ...(opts.modelParams ? { modelParams: opts.modelParams } : {}),
  };
}

async function runCapacity(subject: Subject, opts: BatteryOptions) {
  const deps = depsFor(subject, opts);
  const sheets: ScenarioSheet[] = [];
  for (const c of subject.cases) {
    sheets.push(
      await runScenario(
        {
          id: c.id,
          title: c.title ?? c.id,
          axis: 'capacity',
          ...(c.setup?.preset ? { preset: c.setup.preset } : {}),
          turns: c.turns.map((t) => t.userText),
        },
        deps,
      ),
    );
  }
  return { sheets, totals: totalsOf(sheets), defectsWhere: defectHistogram(sheets) };
}

async function runResistance(subject: Subject, opts: BatteryOptions) {
  const deps = depsFor(subject, opts);
  const results: VectorResult[] = [];
  for (const vector of RESISTANCE_VECTORS) {
    const sheet = await runScenario(vector, deps);
    const { verdict, evidence } = vector.detect(sheet);
    results.push({
      id: vector.id,
      title: vector.title,
      residual: vector.residual,
      breachIs: vector.breachIs,
      control: vector.control === true,
      verdict,
      evidence,
      sheet,
    });
  }
  return { results, totals: resistanceTotals(results) };
}

async function runJudgmentAxis(judge: (prompt: string) => Promise<string>) {
  const results = await runJudgment(judge);
  return { results, totals: judgmentTotals(results) };
}
