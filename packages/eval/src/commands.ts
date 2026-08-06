/**
 * @looprun-ai/eval — the CLI verbs (`looprun-eval run|fold|cert`), exported as functions so the
 * thin bin dispatcher (and tests) can call them directly.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import process from 'node:process';
import { checkPromptStatic, loadSubject, readDeclaredTarget, validateSubject } from './subject.js';
import { validateSubjectConfig, type ValidateReport } from './validate.js';
import { runCase, type CaseDump } from './run.js';
import { PROVIDER_ENDPOINTS, selectModel } from './provider.js';
import { foldVerdicts, readJsonl, renderResultsMd, syncVerdicts, renderSyncMd, type SyncInput, type VerdictLine } from './fold.js';
import { writeJudgeInput } from './judge-input.js';
import { buildCert, buildCertRange, type CertRange, type CertSummary } from './cert.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface RunCommandOptions {
  subject: string;
  model?: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  /** Comma-separated case ids (already split). */
  cases?: string[];
  ungoverned?: boolean;
  out?: string;
  /** Re-enable thinking for gemini targets. */
  thinking?: boolean;
  /** Date used in the default out-dir name (injectable for tests). */
  date?: string;
  /**
   * Test/orchestration seam: a factory for a fresh AI-SDK model per run, bypassing provider
   * selection and the network. When set, the run spends no tokens on any endpoint — the campaign's
   * CI end-to-end lane drives the real governed loop with a scripted model this way.
   */
  modelFactory?: () => unknown;
  /**
   * An inert per-run suffix appended to every turn's `userText`. Semantically neutral — it changes the
   * prompt bytes (a fresh decode / cache-miss per rep) without changing what the model is asked, so
   * transcripts stay identical across reps (the sync fingerprint keys on replies + tool calls, never
   * the user text). This is the campaign's `perturbation: "user-tail"` lever.
   */
  userTail?: string;
  log?: (line: string) => void;
}

/** Execute all/selected cases N=1 → `cases.jsonl` (one CaseDump per line) + `SUMMARY.md`. */
export async function runCommand(opts: RunCommandOptions): Promise<string> {
  const log = opts.log ?? ((l: string) => process.stderr.write(l + '\n'));
  // Transparent default: the subject's ASK phase records the declared target in
  // ask/targets.json — flags/env only OVERRIDE it.
  const target = readDeclaredTarget(opts.subject);
  // An injected model (test/orchestration seam) carries its own identity — no target id needed.
  const modelId = opts.model ?? process.env.MODEL ?? target.model ?? (opts.modelFactory ? 'scripted' : undefined);
  if (!modelId) throw new Error('run: no target — pass --model or record ask/targets.json');
  const explicitBaseUrl = opts.baseUrl;
  const providerDefault = target.provider ? PROVIDER_ENDPOINTS[target.provider] ?? undefined : undefined;
  const baseUrl = explicitBaseUrl ?? target.baseUrl ?? providerDefault ?? process.env.MODEL_BASE_URL ?? 'http://localhost:8081/v1';
  const apiKeyEnv = opts.apiKeyEnv ?? target.apiKeyEnv;
  const apiKey = (apiKeyEnv ? process.env[apiKeyEnv] : process.env.MODEL_API_KEY) ?? 'local';
  const ungoverned = opts.ungoverned === true;
  const variant = ungoverned ? 'ungoverned' : 'governed';

  const subject = await loadSubject(opts.subject);
  // ASSEMBLED PROMPT-STATIC gate (fundamental for local prefix-cache reuse): fail loud, do not run cold.
  const presetPair = [...new Set(subject.cases.map((c) => c.setup?.preset ?? 'default'))].slice(0, 2);
  if (presetPair.length === 2) {
    const tf = checkPromptStatic(subject, presetPair as [string, string]);
    for (const f of tf) log(`ASSEMBLED PROMPT-STATIC: ${f}`);
    if (tf.length) throw new Error('shared-prefix gate failed — fix the spec/contract before running');
  }
  for (const issue of validateSubject(subject)) log(`WARN subject: ${issue}`);
  const only = opts.cases?.length ? opts.cases : undefined;
  const selected = only ? subject.cases.filter((c) => only.includes(c.id)) : subject.cases;
  if (!selected.length) throw new Error(`run: no cases matched ${only?.join(',') ?? '(all)'}`);
  // Inert per-run perturbation: append the tail to each turn's user text (fresh decode, same ask).
  const tail = opts.userTail ?? '';
  const cases = tail
    ? selected.map((c) => ({ ...c, turns: c.turns.map((t) => ({ ...t, userText: t.userText + tail })) }))
    : selected;

  const date = opts.date ?? today();
  const modelSlug = modelId.replace(/[^a-zA-Z0-9.-]+/g, '_');
  const outDir = resolve(opts.out ?? join(subject.dir, 'test', `${date}-${modelSlug}-${variant}`));
  mkdirSync(outDir, { recursive: true });

  const { model, modelParams, isLocal } = opts.modelFactory
    ? { model: opts.modelFactory(), modelParams: {} as Record<string, unknown>, isLocal: false }
    : selectModel({
        modelId,
        explicitBaseUrl,
        baseUrl,
        apiKey,
        thinking: opts.thinking === true || target.thinking === true,
      });

  const dumps: CaseDump[] = [];
  for (const c of cases) {
    try {
      const dump = await runCase(subject, c, { model, modelId, ungoverned, modelParams, stopOnRepeatedToolCall: isLocal });
      dumps.push(dump);
      log(`${variant} ${c.id} ... ${dump.invariantVerdict.pass ? 'unjudged (invariants clean)' : 'invariant-FAIL'}`);
    } catch (e) {
      dumps.push({
        caseId: c.id,
        agent: '?',
        variant,
        model: modelId,
        turns: [],
        invariantVerdict: { pass: false, violations: [`run error: ${(e as Error).message}`] },
        rubric: c.expectations?.rubric ?? [],
        targets: c.targets ?? [],
        tokensIn: 0,
        tokensOut: 0,
        error: (e as Error).message,
      });
      log(`${variant} ${c.id} ... ERROR ${(e as Error).message}`);
    }
  }

  writeFileSync(join(outDir, 'cases.jsonl'), dumps.map((d) => JSON.stringify(d)).join('\n') + '\n');

  const rows = dumps.map((d) => {
    const needsJudge = d.rubric.length > 0 ? 'yes' : 'no';
    const inv = d.invariantVerdict.pass ? 'unjudged' : `invariant-FAIL (${d.invariantVerdict.violations.join('; ')})`;
    return `| ${d.caseId} | ${inv} | ${needsJudge} |`;
  });
  const summary = [
    `# Run summary — ${modelId} · ${variant} · ${date}`,
    '',
    `Subject: ${subject.dir}`,
    `Cases: ${dumps.length} · unjudged (invariants clean): ${dumps.filter((d) => d.invariantVerdict.pass).length} · invariant-FAIL: ${dumps.filter((d) => !d.invariantVerdict.pass).length}`,
    `STATUS TAXONOMY: 'unjudged' is NOT 'pass' — the judge decides quality (fold); invariant-FAIL is deterministic.`,
    `Tokens: in ${dumps.reduce((n, d) => n + (d.tokensIn ?? 0), 0)} · out ${dumps.reduce((n, d) => n + (d.tokensOut ?? 0), 0)}`,
    '',
    '| case | status | needs-judge |',
    '|---|---|---|',
    ...rows,
    '',
    'Invariants are the deterministic gate only — the quality verdict comes from the judge over cases.jsonl.',
  ].join('\n');
  writeFileSync(join(outDir, 'SUMMARY.md'), summary + '\n');
  return outDir;
}

export interface ValidateCommandOptions {
  subject: string;
  /** Reached-verdict floor for the premise layer (ratio). */
  reachedFloor?: number;
  log?: (line: string) => void;
}

/**
 * `looprun-eval validate` — schema + references + premise coherence over a subject, offline (no
 * model, no spend). Returns the full report; a non-empty schema / references / premise layer means
 * the subject is not fit to run. Advisory lines (reverse-coverage) are reported but never blocking.
 */
export async function validateCommand(opts: ValidateCommandOptions): Promise<ValidateReport & { ok: boolean }> {
  const log = opts.log ?? ((l: string) => process.stderr.write(l + '\n'));
  const subject = await loadSubject(opts.subject);
  const report = validateSubjectConfig(opts.subject, subject, { reachedFloor: opts.reachedFloor });
  for (const layer of ['schema', 'references', 'premise', 'world'] as const) {
    for (const line of report[layer]) log(line);
  }
  for (const line of report.advisory) log(`ADVISORY ${line}`);
  const blocking = report.schema.length + report.references.length + report.premise.length + report.world.length;
  log(blocking ? `validate: ${blocking} blocking issue(s) · ${report.advisory.length} advisory` : `validate: clean · ${report.advisory.length} advisory`);
  return { ...report, ok: blocking === 0 };
}

export interface FoldCommandOptions {
  /** Merge mode: the run's `cases.jsonl`. */
  dump?: string;
  /** Merge mode: the judge's `verdicts.jsonl`. */
  verdicts?: string;
  out?: string;
  /** SYNC mode (spec §4): run dirs whose byte-identical transcripts must share one verdict. */
  sync?: string[];
}

/**
 * `looprun-eval fold`. Two modes:
 *   - MERGE (default): fold judge verdicts (`{caseId, verdict|overall, reasons}` jsonl) into
 *     `RESULTS.md` (final pass = invariants AND judge).
 *   - SYNC (`--sync <dirA> <dirB> …`): force one verdict per byte-identical transcript class across
 *     run dirs, mechanically (no judge). Writes `verdicts.synced.jsonl` into each dir (drop-in for
 *     `cert`) plus a `SYNC.md` provenance report. Returns the SYNC.md path.
 */
export function foldCommand(opts: FoldCommandOptions): string {
  if (opts.sync?.length) return foldSync(opts.sync, opts.out);

  if (!opts.dump || !opts.verdicts) throw new Error('fold: --dump and --verdicts are required (or --sync <dir> …)');
  const dumps = readJsonl<CaseDump>(readFileSync(opts.dump, 'utf8'));
  const verdicts = readJsonl<VerdictLine>(readFileSync(opts.verdicts, 'utf8'));
  const fold = foldVerdicts(dumps, verdicts);
  // A missing verdict is a FAIL, loudly — never a silent skip.
  if (fold.missing) {
    process.stderr.write(`[looprun-eval] WARN ${fold.missing} case(s) had NO verdict (counted FAIL) — re-judge those caseIds\n`);
  }
  const out = opts.out ?? join(dirname(resolve(opts.dump)), 'RESULTS.md');
  writeFileSync(out, renderResultsMd(dumps, fold) + '\n');
  return out;
}

/** SYNC-mode fold: read each dir's dumps + verdicts, reconcile byte-identical transcripts, and
 *  persist per-dir `verdicts.synced.jsonl` + a shared `SYNC.md`. */
function foldSync(dirs: string[], out?: string): string {
  const inputs: SyncInput[] = dirs.map((dir) => ({
    dir: resolve(dir),
    dumps: readJsonl<CaseDump>(readFileSync(join(dir, 'cases.jsonl'), 'utf8')),
    verdicts: readJsonl<VerdictLine>(readFileSync(join(dir, 'verdicts.jsonl'), 'utf8')),
  }));
  const result = syncVerdicts(inputs);
  for (const line of result.provenance) process.stderr.write(`[looprun-eval] ${line}\n`);

  // Drop-in synced verdicts per dir (feed straight into `cert`).
  const byDir = new Map<string, Array<{ caseId: string; verdict: string }>>();
  for (const s of result.synced) {
    const list = byDir.get(s.dir) ?? [];
    list.push({ caseId: s.caseId, verdict: s.verdict });
    byDir.set(s.dir, list);
  }
  for (const [dir, rows] of byDir) {
    writeFileSync(join(dir, 'verdicts.synced.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  }

  const syncMd = out ?? join(resolve(dirs[0]), '..', 'SYNC.md');
  writeFileSync(syncMd, renderSyncMd(result) + '\n');
  return syncMd;
}

export interface JudgeInputCommandOptions {
  /** The run dir (holds `cases.jsonl`). */
  dir: string;
  /** Split into `judge-input.partK.jsonl` of at most N cases each. Absent = one file. */
  chunk?: number;
}

/**
 * `looprun-eval judge-input` — build the blind, per-case JSONL the judge reads (spec §3). The ONLY
 * sanctioned path to the judge: turn boundaries preserved, no variant/rep/model labels, deterministic
 * case order. Returns the paths written into the run dir.
 */
export function judgeInputCommand(opts: JudgeInputCommandOptions): string[] {
  return writeJudgeInput(opts.dir, { chunk: opts.chunk });
}

export interface CertCommandOptions {
  dir: string;
  /** Additional run dirs — 2+ total dirs certify as a multi-rep BAND (floor law). */
  dirs?: string[];
  model?: string;
  bar?: number;
  date?: string;
  note?: string;
  /** Range only: where cert-range.json + CERT-RANGE.md land (default: parent of the first dir). */
  out?: string;
  /** Verdicts filename inside each run dir (default `verdicts.jsonl`). Use `verdicts.synced.jsonl`
   *  to certify off `fold --sync` output — the real drop-in wiring, no manual rename. */
  verdicts?: string;
}

/**
 * Fold + certify. One run dir → `cert.json` + `CERT.md` (reps=1, stated). Multiple dirs →
 * per-rep certs PLUS `cert-range.json` + `CERT-RANGE.md`, certified only if the FLOOR clears the bar.
 */
export function certCommand(opts: CertCommandOptions): CertSummary | CertRange {
  const shared = { model: opts.model, bar: opts.bar, generatedAt: opts.date, artifactNote: opts.note, verdictsFile: opts.verdicts };
  const dirs = [opts.dir, ...(opts.dirs ?? [])];
  if (dirs.length > 1) return buildCertRange(dirs, { ...shared, out: opts.out });
  return buildCert(opts.dir, shared);
}
