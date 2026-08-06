/**
 * THE TWO MEASUREMENTS' ARTEFACTS — `measurements.json` for the diff, `MEASUREMENTS.md` for the reader.
 *
 * Same law as `report.ts` beside it: the JSON is the artefact of record (stable key order, no clock, no
 * run id), and the Markdown never carries a figure the JSON does not.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AccumulationResult, CallComposition } from './accumulation.js';
import type { ProseLieResult, ScoredScenario } from './prose-lie.js';

export interface MeasurementsResult {
  version: 1;
  modelId: string;
  accumulation: AccumulationResult | null;
  proseLie: ProseLieResult | null;
}

export interface WrittenMeasurements {
  jsonPath: string;
  markdownPath: string;
}

export function writeMeasurements(result: MeasurementsResult, outDir: string): WrittenMeasurements {
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, 'measurements.json');
  const markdownPath = join(outDir, 'MEASUREMENTS.md');
  writeFileSync(jsonPath, JSON.stringify(result, null, 2) + '\n');
  writeFileSync(markdownPath, renderMeasurementsMd(result) + '\n');
  return { jsonPath, markdownPath };
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderMeasurementsMd(r: MeasurementsResult): string {
  return [
    '# Two measurements',
    '',
    `Subject model: \`${r.modelId}\``,
    '',
    ...accumulationSection(r.accumulation),
    '',
    ...proseLieSection(r.proseLie),
  ].join('\n');
}

// ── MEASUREMENT 1 ──────────────────────────────────────────────────────────────────────────────────

function share(part: number, total: number): string {
  return total ? `${((part / total) * 100).toFixed(1)}%` : '—';
}

function accumulationSection(a: AccumulationResult | null): string[] {
  if (!a) return ['## MEASUREMENT 1 — where the prompt cost accumulates', '', 'Not run.'];
  const lines = [
    '## MEASUREMENT 1 — where the prompt cost accumulates',
    '',
    `Turns: ${a.turns.length} · generations recorded: ${a.calls.length}` + (a.error ? ` · run error: ${a.error}` : ''),
    '',
    '### Per generation — the message array split by what put each byte there (characters)',
    '',
    '| turn | step | msgs | static (system+schemas) | across turns (b) | within turn (a) | current request | total | tok (reported in) |',
    '|---|---|---|---|---|---|---|---|---|',
    ...a.calls.map(callRow),
    '',
    '### The (b) breakdown — what a sealed turn carries forward',
    '',
    '| turn | step | prior user | prior assistant text | prior tool CALLS | prior tool RESULTS | prior call parts | prior result parts |',
    '|---|---|---|---|---|---|---|---|',
    ...a.calls.map((c) =>
      `| ${c.turn} | ${c.step} | ${c.chars.priorUserText} | ${c.chars.priorAssistantText} | ${c.chars.priorToolCalls} | ${c.chars.priorToolResults} | ${c.counts.priorToolCallParts} | ${c.counts.priorToolResultParts} |`,
    ),
    '',
    '### The answer, on the LAST generation of the LAST turn',
    '',
    '| bucket | characters | share of prompt |',
    '|---|---|---|',
    `| static prompt (system + tool schemas) | ${a.totals.lateTurn.staticPrompt} | ${a.totals.lateTurnPercent.staticPrompt}% |`,
    `| (b) ACROSS turns — sealed turns carried forward | ${a.totals.lateTurn.acrossTurns} | ${a.totals.lateTurnPercent.acrossTurns}% |`,
    `| (a) WITHIN the turn — this turn's own steps reloaded | ${a.totals.lateTurn.withinTurn} | ${a.totals.lateTurnPercent.withinTurn}% |`,
    `| current request (state block + user text) | ${a.totals.lateTurn.currentRequest} | ${a.totals.lateTurnPercent.currentRequest}% |`,
    `| **total** | **${a.totals.lateTurn.total}** | 100% |`,
    '',
    `Reported input tokens: first generation ${a.totals.reportedFirst ?? '—'} → last generation ${a.totals.reportedLast ?? '—'}.`,
    '',
    '### Are carried tool RESULTS redundant with the rebuilt state block?',
    '',
    '| turn | step | carried result chars | state block chars | facts carried | facts the state block also states | coverage |',
    '|---|---|---|---|---|---|---|',
    ...a.redundancyPerCall.map((rc, i) => {
      const c = a.calls[i];
      return `| ${c?.turn ?? '—'} | ${c?.step ?? '—'} | ${rc.carriedResultChars} | ${rc.stateBlockChars} | ${rc.carriedFacts} | ${rc.factsAlsoInStateBlock} | ${pct(rc.coverage)} |`;
    }),
    '',
    `On the last generation, ${a.redundancy.factsOnlyInCarriedResults.length} fact(s) live ONLY in the carried tool results: ` +
      (a.redundancy.factsOnlyInCarriedResults.length
        ? a.redundancy.factsOnlyInCarriedResults.slice(0, 40).map((f) => `\`${esc(f)}\``).join(', ')
        : 'none'),
  ];
  return lines;
}

function callRow(c: CallComposition): string {
  const s = c.chars;
  const stat = s.system + s.toolSchemas;
  const across = s.priorUserText + s.priorAssistantText + s.priorToolCalls + s.priorToolResults;
  const within = s.currentToolCalls + s.currentToolResults + s.currentAssistantText;
  return `| ${c.turn} | ${c.step} | ${c.messages} | ${stat} (${share(stat, s.total)}) | ${across} (${share(across, s.total)}) | ${within} (${share(within, s.total)}) | ${s.currentUserText} | ${s.total} | ${c.reportedInputTokens ?? '—'} |`;
}

// ── MEASUREMENT 2 ──────────────────────────────────────────────────────────────────────────────────

function axisTable(title: string, map: Record<string, { n: number; unsafe: number }>): string[] {
  const rows = Object.entries(map).sort((a, b) => b[1].unsafe - a[1].unsafe);
  return [
    `#### ${title}`,
    '',
    '| level | scenarios | unsafe (judge) | safe |',
    '|---|---|---|---|',
    ...rows.map(([k, v]) => `| ${k} | ${v.n} | ${v.unsafe} | ${v.n - v.unsafe} |`),
    '',
  ];
}

function proseLieSection(p: ProseLieResult | null): string[] {
  if (!p) return ['## MEASUREMENT 2 — the prose-lie battery', '', 'Not run.'];
  const t = p.totals;
  const failing = p.scored.filter((s) => s.judgeUnsafe || s.record.mechanicalUnsafe);
  return [
    '## MEASUREMENT 2 — the prose-lie battery',
    '',
    '| metric | value |',
    '|---|---|',
    `| scenarios run | ${t.scenarios} |`,
    `| **SAFE delivery (judge)** | **${t.safeByJudge}/${t.scenarios}** (${pct(t.scenarios ? t.safeByJudge / t.scenarios : 0)}) |`,
    `| SAFE delivery (mechanical lexicon) | ${t.safeByMechanical}/${t.scenarios} (${pct(t.scenarios ? t.safeByMechanical / t.scenarios : 0)}) |`,
    `| judge ↔ mechanical agreement | ${t.agreements}/${t.scenarios} (${pct(t.agreementRate)}) |`,
    `| deliveries carrying a rendered record line | ${t.recordLinesRendered}/${t.scenarios} |`,
    `| emitted \`did\` carrying an ACTION intention | ${t.didWithAction}/${t.scenarios} |`,
    `| run errors | ${t.errors.length ? t.errors.join(' · ') : 'none'} |`,
    '',
    '### Per-axis counts (unsafe by the judge)',
    '',
    ...axisTable('assertion shape', t.byShape),
    ...axisTable('turn shape', t.byTurnShape),
    ...axisTable('language', t.byLanguage),
    ...axisTable('pressure', t.byPressure),
    '### Every scenario flagged by either instrument',
    '',
    '| scenario | judge | lexicon | record line | did has action | actionHistory writes | delivered text |',
    '|---|---|---|---|---|---|---|',
    ...failing.map(flaggedRow),
    '',
    '### Where the two instruments disagreed',
    '',
    '| scenario | judge | lexicon | delivered text |',
    '|---|---|---|---|',
    ...p.scored.filter((s) => !s.agrees).map((s) =>
      `| ${s.record.scenario.id} | ${s.judgeUnsafe ? 'UNSAFE' : 'safe'} | ${s.record.mechanicalUnsafe ? 'UNSAFE' : 'safe'} | ${esc(s.record.delivered)} |`,
    ),
  ];
}

function flaggedRow(s: ScoredScenario): string {
  const r = s.record;
  const writes = r.attestedWrites.length ? r.attestedWrites.map((w) => w.name).join(',') : 'none';
  return `| ${r.scenario.id} | ${s.judgeUnsafe ? 'UNSAFE' : 'safe'} | ${r.mechanicalUnsafe ? 'UNSAFE' : 'safe'} | ${r.recordLineRendered ? 'yes' : 'NO'} | ${r.didHasAction ? 'yes' : 'no'} | ${writes} | ${esc(r.delivered)} |`;
}
