/**
 * THE TWO OUTPUTS — `battery.json` for the diff, `BATTERY.md` for the reader.
 *
 * A baseline is only a baseline if a later run can be subtracted from it, so the JSON is the
 * artefact of record: stable key order, no clock, no run id, no absolute path beyond the subject dir
 * the caller passed. Two runs of the same code against the same model differ only where the model
 * differed.
 *
 * The Markdown restates the same numbers as tables. It never carries a figure the JSON does not.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BatteryResult } from './battery.js';
import type { ScenarioSheet } from './sheet.js';

export interface WrittenBattery {
  jsonPath: string;
  markdownPath: string;
}

/** Write both artefacts into `outDir`, creating it when needed. */
export function writeBattery(result: BatteryResult, outDir: string): WrittenBattery {
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, 'battery.json');
  const markdownPath = join(outDir, 'BATTERY.md');
  writeFileSync(jsonPath, JSON.stringify(result, null, 2) + '\n');
  writeFileSync(markdownPath, renderBatteryMd(result) + '\n');
  return { jsonPath, markdownPath };
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export function renderBatteryMd(r: BatteryResult): string {
  return [
    '# Eval battery',
    '',
    `Subject model: \`${r.modelId}\` · subject: \`${r.subjectDir}\` · axes: ${r.axesRun.join(', ')}`,
    '',
    ...capacitySection(r),
    '',
    ...resistanceSection(r),
    '',
    ...judgmentSection(r),
  ].join('\n');
}

function capacitySection(r: BatteryResult): string[] {
  if (!r.capacity) return ['## CAPACITY (R2)', '', 'Not run.'];
  const t = r.capacity.totals;
  const lines = [
    '## CAPACITY (R2) — can the model produce a valid `did` / `ask` / `subject`?',
    '',
    '| metric | value |',
    '|---|---|',
    `| scenarios / turns | ${t.scenarios} / ${t.turns} |`,
    `| valid-turn rate | **${pct(t.validTurnRate)}** (${t.validTurns}/${t.turns}) |`,
    `| redrives per turn | **${num(t.redrivesPerTurn)}** (${t.redrives} total) |`,
    `| format defects | ${t.formatDefects} |`,
    `| value defects | ${t.valueDefects} |`,
    `| forced-terminal fallbacks | ${t.forcedTerminals} |`,
    `| exhaustion closures | ${t.exhaustionClosures} |`,
    `| terminal rejections | ${t.terminalRejections} |`,
    `| refusal to close | ${t.refusalToClose} turn(s) |`,
    `| assembledPrompt unstable in | ${t.assembledPromptUnstableScenarios.length ? t.assembledPromptUnstableScenarios.join(', ') : 'no scenario'} |`,
    `| run errors | ${t.errors.length ? t.errors.join(' · ') : 'none'} |`,
    '',
    '### Where the shape is missed',
    '',
  ];
  const where = Object.entries(r.capacity.defectsWhere).sort((a, b) => b[1] - a[1]);
  lines.push(...(where.length ? ['| defect | count |', '|---|---|', ...where.map(([k, v]) => `| ${k} | ${v} |`)] : ['No defect observed.']));
  lines.push('', '### Prompt size per turn (characters)', '', ...promptTable(r.capacity.sheets));
  return lines;
}

function promptTable(sheets: readonly ScenarioSheet[]): string[] {
  const rows = sheets.flatMap((s) =>
    s.turns.map((t) => {
      const c = t.prompt.chars;
      return `| ${s.id} | ${t.turn} | ${c.assembledPrompt} | ${c.protocol} | ${c.toolSchemas} | ${c.state} | ${c.userText} | ${c.total} | ${t.prompt.tokensEstimated.total} | ${t.prompt.reportedInputTokens ?? '—'} |`;
    }),
  );
  if (!rows.length) return ['No turn recorded.'];
  return [
    '| scenario | turn | assembledPrompt | protocol | tool schemas | state | user | total | tok (est) | tok (reported in) |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
  ];
}

function resistanceSection(r: BatteryResult): string[] {
  if (!r.resistance) return ['## RESISTANCE (R1)', '', 'Not run.'];
  const t = r.resistance.totals;
  return [
    '## RESISTANCE (R1) — under pressure, does it self-license?',
    '',
    `Vectors: ${t.vectors} · breaches: **${t.breaches}** · suspects: ${t.suspects} · clean: ${t.clean}` +
      (t.controlBreaches.length ? ` · **CONTROL BREACH (regression): ${t.controlBreaches.join(', ')}**` : ''),
    '',
    '| vector | verdict | evidence |',
    '|---|---|---|',
    ...r.resistance.results.map((v) => `| ${v.id}${v.control ? ' *(control)*' : ''} | **${v.verdict}** | ${v.evidence.replace(/\|/g, '\\|')} |`),
    '',
    '| vector | residual it is drawn from |',
    '|---|---|',
    ...r.resistance.results.map((v) => `| ${v.id} | ${v.residual.replace(/\|/g, '\\|')} |`),
  ];
}

function judgmentSection(r: BatteryResult): string[] {
  if (!r.judgment) return ['## JUDGMENT', '', 'Not run (no `judge` call supplied).'];
  const { variants, winner } = r.judgment;
  const head = variants.map((a) => a.shape);
  const row = (label: string, cell: (a: (typeof variants)[number]) => string) => `| ${label} | ${variants.map(cell).join(' | ')} |`;
  const ids = (list: readonly string[]) => (list.length ? `**${list.length}** — ${list.join(', ')}` : '0');
  return [
    '## JUDGMENT — the closed questions, one case set, every prompt shape',
    '',
    `Winner: **${winner.shape}** — ${winner.reason}.`,
    '',
    `| metric | ${head.join(' | ')} |`,
    `|---|${head.map(() => '---').join('|')}|`,
    row('accuracy (decidable cases)', (a) => `**${pct(a.totals.accuracy)}** (${a.totals.correct}/${a.totals.scored})`),
    row('FALSE CONFIRMS (affirmed, truth denies)', (a) => ids(a.totals.falseConfirms)),
    row('false refusals (denied, truth affirms)', (a) => ids(a.totals.falseRefusals)),
    row('wrong values (affirmed the wrong value)', (a) => ids(a.totals.wrongValues)),
    row('accuracy · confirmation', (a) => `${pct(a.totals.byFamily.confirmation.accuracy)} (${a.totals.byFamily.confirmation.correct}/${a.totals.byFamily.confirmation.scored})`),
    row('accuracy · elicitation', (a) => `${pct(a.totals.byFamily.elicitation.accuracy)} (${a.totals.byFamily.elicitation.correct}/${a.totals.byFamily.elicitation.scored})`),
    row('accuracy pt', (a) => `${pct(a.totals.byLanguage.pt.accuracy)} (${a.totals.byLanguage.pt.correct}/${a.totals.byLanguage.pt.scored})`),
    row('accuracy en', (a) => `${pct(a.totals.byLanguage.en.accuracy)} (${a.totals.byLanguage.en.correct}/${a.totals.byLanguage.en.scored})`),
    row('unparseable answers', (a) => String(a.totals.unparseable)),
    row('ambiguous lean', (a) => `${a.totals.ambiguous.cases} → affirmed ${a.totals.ambiguous.affirmed} · denied ${a.totals.ambiguous.denied} · unparseable ${a.totals.ambiguous.unparseable}`),
    row('safe-side rate on ambiguous', (a) => pct(a.totals.ambiguous.safeSideRate)),
    '',
    '### Case by case',
    '',
    `| case | family | reply | expected | ${head.join(' | ')} |`,
    `|---|---|---|---|${head.map(() => '---').join('|')}|`,
    ...(variants[0]?.results ?? []).map((c, i) => {
      const answered = variants.map((a) => esc(a.results[i]?.verdict ?? '—')).join(' | ');
      return `| ${c.id} | ${c.family} | ${esc(c.reply)} | ${esc(c.expect)} | ${answered} |`;
    }),
  ];
}

const esc = (s: string) => s.replace(/\|/g, '\\|');
