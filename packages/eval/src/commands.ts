/**
 * @looprun-ai/eval — the CLI verbs (`looprun-eval run|fold|cert`), exported as functions so the
 * thin bin dispatcher (and tests) can call them directly.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import process from 'node:process';
import { checkTrunkStatic, loadSubject, readDeclaredTarget, validateSubject } from './subject.js';
import { runCase, type CaseDump } from './run.js';
import { selectModel } from './provider.js';
import { foldVerdicts, readJsonl, renderResultsMd, type VerdictLine } from './fold.js';
import { buildCert, type CertSummary } from './cert.js';

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
  log?: (line: string) => void;
}

/** Execute all/selected cases N=1 → `cases.jsonl` (one CaseDump per line) + `SUMMARY.md`. */
export async function runCommand(opts: RunCommandOptions): Promise<string> {
  const log = opts.log ?? ((l: string) => process.stderr.write(l + '\n'));
  // Transparent default: the subject's ASK phase records the declared target in
  // ask/targets.json — flags/env only OVERRIDE it.
  const target = readDeclaredTarget(opts.subject);
  const modelId = opts.model ?? process.env.MODEL ?? target.model;
  if (!modelId) throw new Error('run: no target — pass --model or record ask/targets.json');
  const explicitBaseUrl = opts.baseUrl;
  const baseUrl = explicitBaseUrl ?? target.baseUrl ?? process.env.MODEL_BASE_URL ?? 'http://localhost:8081/v1';
  const apiKeyEnv = opts.apiKeyEnv ?? target.apiKeyEnv;
  const apiKey = (apiKeyEnv ? process.env[apiKeyEnv] : process.env.MODEL_API_KEY) ?? 'local';
  const ungoverned = opts.ungoverned === true;
  const arm = ungoverned ? 'ungoverned' : 'governed';

  const subject = await loadSubject(opts.subject);
  // TRUNK-STATIC gate (fundamental for local prefix-cache reuse): fail loud, do not run cold.
  const presetPair = [...new Set(subject.cases.map((c) => c.setup?.preset ?? 'default'))].slice(0, 2);
  if (presetPair.length === 2) {
    const tf = checkTrunkStatic(subject, presetPair as [string, string]);
    for (const f of tf) log(`TRUNK-STATIC: ${f}`);
    if (tf.length) throw new Error('trunk-static gate failed — fix the spec/contract before running');
  }
  for (const issue of validateSubject(subject)) log(`WARN subject: ${issue}`);
  const only = opts.cases?.length ? opts.cases : undefined;
  const cases = only ? subject.cases.filter((c) => only.includes(c.id)) : subject.cases;
  if (!cases.length) throw new Error(`run: no cases matched ${only?.join(',') ?? '(all)'}`);

  const date = opts.date ?? today();
  const modelSlug = modelId.replace(/[^a-zA-Z0-9.-]+/g, '_');
  const outDir = resolve(opts.out ?? join(subject.dir, 'test', `${date}-${modelSlug}-${arm}`));
  mkdirSync(outDir, { recursive: true });

  const { model, modelParams, isLocal } = selectModel({
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
      log(`${arm} ${c.id} ... invariants ${dump.invariantVerdict.pass ? 'pass' : 'FAIL'}`);
    } catch (e) {
      dumps.push({
        caseId: c.id,
        agent: '?',
        arm,
        model: modelId,
        turns: [],
        invariantVerdict: { pass: false, violations: [`run error: ${(e as Error).message}`] },
        rubric: c.expectations?.rubric ?? [],
        targets: c.targets ?? [],
        tokensIn: 0,
        tokensOut: 0,
        error: (e as Error).message,
      });
      log(`${arm} ${c.id} ... ERROR ${(e as Error).message}`);
    }
  }

  writeFileSync(join(outDir, 'cases.jsonl'), dumps.map((d) => JSON.stringify(d)).join('\n') + '\n');

  const rows = dumps.map((d) => {
    const needsJudge = d.rubric.length > 0 ? 'yes' : 'no';
    const inv = d.invariantVerdict.pass ? 'pass' : `FAIL (${d.invariantVerdict.violations.join('; ')})`;
    return `| ${d.caseId} | ${inv} | ${needsJudge} |`;
  });
  const summary = [
    `# Run summary — ${modelId} · ${arm} · ${date}`,
    '',
    `Subject: ${subject.dir}`,
    `Cases: ${dumps.length} · invariant pass: ${dumps.filter((d) => d.invariantVerdict.pass).length}`,
    `Tokens: in ${dumps.reduce((n, d) => n + (d.tokensIn ?? 0), 0)} · out ${dumps.reduce((n, d) => n + (d.tokensOut ?? 0), 0)}`,
    '',
    '| case | invariants | needs-judge |',
    '|---|---|---|',
    ...rows,
    '',
    'Invariants are the deterministic gate only — the quality verdict comes from the judge over cases.jsonl.',
  ].join('\n');
  writeFileSync(join(outDir, 'SUMMARY.md'), summary + '\n');
  return outDir;
}

export interface FoldCommandOptions {
  dump: string;
  verdicts: string;
  out?: string;
}

/** Merge judge verdicts (`{caseId, verdict|overall, reasons}` jsonl) into `RESULTS.md`. */
export function foldCommand(opts: FoldCommandOptions): string {
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

export interface CertCommandOptions {
  dir: string;
  model?: string;
  bar?: number;
  date?: string;
  note?: string;
}

/** Fold + certify one run dir (`cases.jsonl` + `verdicts.jsonl`) → `cert.json` + `CERT.md`. */
export function certCommand(opts: CertCommandOptions): CertSummary {
  return buildCert(opts.dir, {
    model: opts.model,
    bar: opts.bar,
    generatedAt: opts.date,
    artifactNote: opts.note,
  });
}
