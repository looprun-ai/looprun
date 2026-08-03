/**
 * @looprun-ai/eval — `looprun-eval campaign` (spec 2026-08-02): ONE verb for the whole measured
 * campaign. Driving a campaign by hand costs dozens of bash invocations plus improvised watchers,
 * and every one of them is a place for the instrument to drift between arms.
 *
 * Orchestration is deterministic work — engine work — so it lives here, not in the operator's head:
 *
 *   campaign run  <campaign.json>   preflight → K governed reps + control (each an immutable dir) →
 *                                   monitor every dir → judge-input per dir → PAUSE with a
 *                                   machine-readable `judging.json` manifest for the host to dispatch.
 *   campaign resume <out>           verify verdict counts → monitor gate → fold+sync → cert BAND.
 *   campaign status <out>           per-phase progress from the dirs alone (no daemon).
 *
 * Laws encoded (spec §"Laws"): no hand-computed figures (the report quotes `cert-band.json`
 * verbatim); a rep dir is append-only after its `DONE` marker (re-measurement is a NEW dated dir);
 * the control arm always runs (the A/B is part of the instrument).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { z } from 'zod';
import { loadSubject, readDeclaredTarget } from './subject.js';
import { validateSubjectConfig } from './validate.js';
import { runCommand, foldCommand, certCommand, type RunCommandOptions } from './commands.js';
import { judgeInputCommand } from './commands.js';
import { readJsonl } from './fold.js';
import { writeMonitor, hasUnresolvedIncidents } from './monitor.js';
import type { CertBand } from './cert.js';
import type { CaseDump } from './run.js';

/** A campaign.json config error, with a path-qualified message (cases-config.ts convention). */
export class CampaignConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CampaignConfigError';
  }
}

/** A preflight/monitor refusal — thrown BEFORE (or instead of) spending, so the bin exits non-zero. */
export class CampaignRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CampaignRefusal';
  }
}

const campaignConfigSchema = z
  .object({
    subject: z.string(),
    reps: z.number().int().positive(),
    /** The control arm. Only `ungoverned` exists today; named so the A/B is explicit, never implicit. */
    control: z.literal('ungoverned'),
    /** Inert per-rep perturbation. `user-tail` appends a neutral suffix per rep (fresh decodes). */
    perturbation: z.enum(['none', 'user-tail']).optional(),
    bar: z.number().min(0).max(1),
    chunk: z.number().int().positive(),
    out: z.string(),
  })
  .strict();

export type CampaignConfig = z.infer<typeof campaignConfigSchema>;

/** Parse a campaign.json value. Throws {@link CampaignConfigError} with a path-qualified message. */
export function parseCampaignConfig(json: unknown): CampaignConfig {
  const parsed = campaignConfigSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new CampaignConfigError(`campaign config invalid at ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  return parsed.data;
}

export interface CampaignCommandOptions {
  action: 'run' | 'status' | 'resume';
  /** `run`: path to the campaign.json. */
  config?: string;
  /** `status` / `resume`: the campaign out dir (holds the campaign.json copy the run wrote). */
  out?: string;
  /** `run`: continue an interrupted campaign — skip DONE rep dirs instead of refusing a non-empty out. */
  resume?: boolean;
  /** Test/orchestration seam: a fresh AI-SDK model per rep (no network). Passed to {@link runCommand}. */
  modelFactory?: () => unknown;
  /** `resume`: the judge model label to record into the report (overrides the manifest's field). */
  judgeModel?: string;
  /** Date stamped into the run dirs + cert band (injectable for tests). */
  date?: string;
  log?: (line: string) => void;
}

const REPS_JSON = 'campaign.json';
const MANIFEST = 'judging.json';
const DONE = 'DONE';

interface DirPlan {
  name: string;
  ungoverned: boolean;
  tail: string;
}

/** Resolve subject/out relative to the campaign.json's own directory (its neighbors), abs passes through. */
function resolveFrom(base: string, p: string): string {
  return isAbsolute(p) ? p : resolve(base, p);
}

function planDirs(cfg: CampaignConfig): DirPlan[] {
  const tailFor = (i: number) => (cfg.perturbation === 'user-tail' ? `\n\n<!-- rep ${i} -->` : '');
  const reps: DirPlan[] = Array.from({ length: cfg.reps }, (_, i) => ({ name: `r${i}`, ungoverned: false, tail: tailFor(i) }));
  return [...reps, { name: 'control', ungoverned: true, tail: '' }];
}

const repDirNames = (cfg: CampaignConfig): string[] => Array.from({ length: cfg.reps }, (_, i) => `r${i}`);

function countCases(dir: string): number {
  try {
    return readJsonl<CaseDump>(readFileSync(join(dir, 'cases.jsonl'), 'utf8')).length;
  } catch {
    return 0;
  }
}

/** Entry point — dispatch on the sub-verb. Throws on any refusal; a PAUSE is a clean (non-throwing) exit. */
export async function campaignCommand(opts: CampaignCommandOptions): Promise<void> {
  const log = opts.log ?? ((l: string) => process.stderr.write(l + '\n'));
  if (opts.action === 'run') return runCampaign(opts, log);
  if (opts.action === 'status') return statusCampaign(opts, log);
  return resumeCampaign(opts, log);
}

// ── run ─────────────────────────────────────────────────────────────────────────────────────────

async function runCampaign(opts: CampaignCommandOptions, log: (l: string) => void): Promise<void> {
  if (!opts.config) throw new CampaignRefusal('campaign run: <campaign.json> is required');
  const configPath = resolve(opts.config);
  const base = dirname(configPath);
  const cfg = parseCampaignConfig(JSON.parse(readFileSync(configPath, 'utf8')));
  const subjectDir = resolveFrom(base, cfg.subject);
  const outDir = resolveFrom(base, cfg.out);

  await preflight(cfg, subjectDir, outDir, opts, log);

  mkdirSync(outDir, { recursive: true });
  // Persist the resolved config so status/resume read one file (no re-derivation, no drift).
  writeFileSync(join(outDir, REPS_JSON), JSON.stringify({ ...cfg, subject: subjectDir, out: outDir }, null, 2) + '\n');

  const plans = planDirs(cfg);
  for (const plan of plans) {
    const dir = join(outDir, plan.name);
    if (existsSync(join(dir, DONE))) {
      log(`campaign: ${plan.name} already DONE — skipped (immutable)`);
      continue;
    }
    log(`campaign: running ${plan.name} (${plan.ungoverned ? 'control/ungoverned' : 'governed'})`);
    const runOpts: RunCommandOptions = {
      subject: subjectDir,
      out: dir,
      ungoverned: plan.ungoverned,
      userTail: plan.tail,
      ...(opts.modelFactory ? { modelFactory: opts.modelFactory } : {}),
      ...(opts.date ? { date: opts.date } : {}),
      log,
    };
    await runCommand(runOpts);
    const mon = writeMonitor(dir);
    if (mon.incidents) log(`campaign: ${plan.name} MONITOR — ${mon.incidents} incident(s) (see ${plan.name}/MONITOR.md)`);
    writeFileSync(join(dir, DONE), `${plan.name}\n`); // append-only marker: this dir is now history
  }

  // Judge inputs (blind, chunked) per dir, then the machine-readable manifest — and PAUSE.
  const manifestDirs = plans.map((plan) => {
    const dir = join(outDir, plan.name);
    const inputs = judgeInputCommand({ dir, chunk: cfg.chunk }).map((p) => p.slice(outDir.length + 1));
    return { dir: plan.name, arm: plan.ungoverned ? 'control' : 'governed', inputs, expectedVerdicts: countCases(dir) };
  });
  const manifest = {
    subject: subjectDir,
    bar: cfg.bar,
    chunk: cfg.chunk,
    reps: repDirNames(cfg),
    control: 'control',
    judgeModel: null as string | null, // the host fills this with its strongest available ruler
    dirs: manifestDirs,
  };
  writeFileSync(join(outDir, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');

  log(`campaign PAUSED for judging — dispatch judge subagents over ${MANIFEST}, write verdicts.jsonl per dir, then \`campaign resume ${outDir}\`.`);
}

async function preflight(
  cfg: CampaignConfig,
  subjectDir: string,
  outDir: string,
  opts: CampaignCommandOptions,
  log: (l: string) => void,
): Promise<void> {
  // 1. validate green — refuse a red exam BEFORE spending a token.
  let subject;
  try {
    subject = await loadSubject(subjectDir);
  } catch (e) {
    throw new CampaignRefusal(`preflight: subject failed to load: ${(e as Error).message}`);
  }
  const report = validateSubjectConfig(subjectDir, subject);
  const blocking = [...report.schema, ...report.references, ...report.premise];
  for (const line of report.advisory) log(`preflight: ADVISORY ${line}`);
  if (report.advisory.length) log(`preflight: ${report.advisory.length} advisory line(s) (non-blocking)`);
  if (blocking.length) {
    for (const line of blocking) log(`preflight: ${line}`);
    throw new CampaignRefusal(`preflight: validate is RED (${blocking.length} blocking issue(s)) — fix the exam before running`);
  }

  // 2. env keys present — the 178-error round (a missing .env.local) becomes a preflight refusal.
  //    A scripted model (modelFactory) spends nothing, so no key is required.
  if (!opts.modelFactory) {
    const target = readDeclaredTarget(subjectDir);
    if (target.apiKeyEnv && !process.env[target.apiKeyEnv]) {
      throw new CampaignRefusal(`preflight: env key ${target.apiKeyEnv} is not set — the target needs it; refusing before spend`);
    }
  }

  // 3. out dir empty or --resume — never clobber a prior campaign's dirs.
  if (existsSync(outDir) && readdirSync(outDir).length && !opts.resume) {
    throw new CampaignRefusal(`preflight: out dir ${outDir} is not empty — pass --resume to continue, or choose a new dated dir`);
  }
}

// ── status ──────────────────────────────────────────────────────────────────────────────────────

async function statusCampaign(opts: CampaignCommandOptions, log: (l: string) => void): Promise<void> {
  const outDir = resolve(requireOut(opts));
  const cfg = readCampaignCopy(outDir);
  const names = [...repDirNames(cfg), 'control'];

  log(`# Campaign status — ${outDir}`);
  log(`subject: ${cfg.subject} · reps: ${cfg.reps} · bar: ${cfg.bar}`);
  log('| dir | cases | verdicts | done | incidents |');
  log('|---|---|---|---|---|');
  for (const name of names) {
    const dir = join(outDir, name);
    const cases = countCases(dir);
    const verdicts = countVerdicts(dir);
    const done = existsSync(join(dir, DONE)) ? 'yes' : 'no';
    const inc = hasUnresolvedIncidents(dir) ? 'UNRESOLVED' : monitorIncidentCount(dir) ? 'resolved' : '0';
    log(`| ${name} | ${cases} | ${verdicts} | ${done} | ${inc} |`);
  }
  const phase = existsSync(join(outDir, 'cert-band.json'))
    ? 'CERTIFIED (cert-band.json written)'
    : existsSync(join(outDir, MANIFEST))
      ? 'PAUSED for judging (judging.json written)'
      : 'RUNNING';
  log(`phase: ${phase}`);
}

// ── resume ──────────────────────────────────────────────────────────────────────────────────────

async function resumeCampaign(opts: CampaignCommandOptions, log: (l: string) => void): Promise<void> {
  const outDir = resolve(requireOut(opts));
  const cfg = readCampaignCopy(outDir);
  const manifest = readManifest(outDir);
  const repNames = repDirNames(cfg);
  const allNames = [...repNames, 'control'];

  // 1. verdict counts — every dir the manifest promised must carry a complete verdicts.jsonl.
  for (const entry of manifest.dirs) {
    const dir = join(outDir, entry.dir);
    const path = join(dir, 'verdicts.jsonl');
    if (!existsSync(path)) throw new CampaignRefusal(`resume: ${entry.dir}/verdicts.jsonl is missing — judging is incomplete`);
    const n = countVerdicts(dir);
    if (n !== entry.expectedVerdicts) {
      throw new CampaignRefusal(`resume: ${entry.dir} has ${n} verdict(s), expected ${entry.expectedVerdicts} — judging is incomplete`);
    }
  }

  // 2. monitor gate — refuse to certify over any dir with an unresolved incident.
  const unresolved = allNames.filter((name) => hasUnresolvedIncidents(join(outDir, name)));
  if (unresolved.length) {
    throw new CampaignRefusal(
      `resume: unresolved incident(s) in ${unresolved.join(', ')} — inspect MONITOR.md and drop a MONITOR.resolved marker (or fix + re-run) before certifying`,
    );
  }

  // 3. fold + sync across the governed reps → verdicts.synced.jsonl per rep dir.
  const repDirsAbs = repNames.map((name) => join(outDir, name));
  if (repDirsAbs.length > 1) {
    foldCommand({ sync: repDirsAbs, out: join(outDir, 'SYNC.md') });
  } else {
    // A single governed rep has nothing to reconcile — its own verdicts ARE the synced set.
    const only = repDirsAbs[0];
    writeFileSync(join(only, 'verdicts.synced.jsonl'), readFileSync(join(only, 'verdicts.jsonl')));
  }

  // 4. control arm A/B fold (its own verdicts) → control/RESULTS.md — reported, never in the band.
  const controlDir = join(outDir, 'control');
  foldCommand({ dump: join(controlDir, 'cases.jsonl'), verdicts: join(controlDir, 'verdicts.jsonl'), out: join(controlDir, 'RESULTS.md') });

  // 5. cert BAND over the governed reps (FLOOR law), off the synced verdicts. Numbers live ONLY here.
  const summary = certCommand({
    dir: repDirsAbs[0],
    dirs: repDirsAbs.slice(1),
    bar: cfg.bar,
    verdicts: 'verdicts.synced.jsonl',
    out: outDir,
    ...(opts.date ? { date: opts.date } : {}),
  });
  const band = summary as CertBand;

  const judgeModel = opts.judgeModel ?? manifest.judgeModel ?? 'unrecorded';
  writeCampaignReport(outDir, judgeModel, log);

  const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
  log(
    `campaign ${band.certified ? 'CERTIFIED' : 'BELOW BAR'} — floor ${pct(band.floor)} ${band.certified ? '≥' : '<'} bar ${pct(band.bar)} ` +
      `(band ${pct(band.floor)}–${pct(band.ceil)}, ${band.reps} reps) → ${join(outDir, 'CAMPAIGN.md')}`,
  );
  if (!band.certified) {
    throw new CampaignRefusal(`campaign BELOW BAR: floor ${pct(band.floor)} < bar ${pct(band.bar)} — not certified`);
  }
}

/** The campaign report — quotes `cert-band.json` VERBATIM (no hand-computed figure ever appears). */
function writeCampaignReport(outDir: string, judgeModel: string, log: (l: string) => void): void {
  const bandJson = readFileSync(join(outDir, 'cert-band.json'), 'utf8');
  const controlNote = existsSync(join(outDir, 'control', 'RESULTS.md'))
    ? 'Control (ungoverned) A/B: see `control/RESULTS.md`.'
    : 'Control arm: not folded.';
  const md = [
    '# Campaign report',
    '',
    `- judged by: ${judgeModel}`,
    `- ${controlNote}`,
    '',
    'The band below is quoted verbatim from `cert-band.json` — the ONLY source of the certified',
    'number. This report computes nothing.',
    '',
    '```json',
    bandJson.trimEnd(),
    '```',
    '',
    'See `CERT-BAND.md` for the human-readable per-case table.',
  ].join('\n');
  writeFileSync(join(outDir, 'CAMPAIGN.md'), md + '\n');
  log('campaign: CAMPAIGN.md written (cert-band.json quoted verbatim)');
}

// ── shared readers ────────────────────────────────────────────────────────────────────────────────

function requireOut(opts: CampaignCommandOptions): string {
  if (!opts.out) throw new CampaignRefusal(`campaign ${opts.action}: <out-dir> is required`);
  return opts.out;
}

function readCampaignCopy(outDir: string): CampaignConfig {
  const path = join(outDir, REPS_JSON);
  if (!existsSync(path)) throw new CampaignRefusal(`campaign: ${path} not found — run \`campaign run\` first`);
  return parseCampaignConfig(JSON.parse(readFileSync(path, 'utf8')));
}

interface Manifest {
  judgeModel: string | null;
  dirs: Array<{ dir: string; arm: string; inputs: string[]; expectedVerdicts: number }>;
}

function readManifest(outDir: string): Manifest {
  const path = join(outDir, MANIFEST);
  if (!existsSync(path)) throw new CampaignRefusal(`campaign resume: ${MANIFEST} not found — the run has not reached the judging pause`);
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
}

function countVerdicts(dir: string): number {
  try {
    return readJsonl<unknown>(readFileSync(join(dir, 'verdicts.jsonl'), 'utf8')).length;
  } catch {
    return 0;
  }
}

function monitorIncidentCount(dir: string): number {
  try {
    const r = JSON.parse(readFileSync(join(dir, 'monitor.json'), 'utf8')) as { network?: unknown[]; holes?: unknown[] };
    return (r.network?.length ?? 0) + (r.holes?.length ?? 0);
  } catch {
    return 0;
  }
}
