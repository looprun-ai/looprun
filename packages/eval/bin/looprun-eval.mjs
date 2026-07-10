#!/usr/bin/env node
/**
 * looprun-eval — the measured loop of a looprun project.
 *
 *   looprun-eval init [--domain <d>]
 *   looprun-eval check
 *   looprun-eval run [--agent id] [--cases csv|full] [--reps N] [--model alias] [--out dir]
 *   looprun-eval certify [...same flags]           (= run --reps 3, '-cert' tagged dir)
 *   looprun-eval judge-prompt
 *   looprun-eval judge-merge <dump.json> <verdicts.jsonl> [autofail.json] [judged.json]
 *   looprun-eval cert <results-dir> [--bar 0.9] [--model label]
 *   looprun-eval lint [paths…] [--spec-laws]
 */
const HELP = `looprun-eval <command>

  init [--domain <d>]        Scaffold looprun.eval.config.ts + evals/ in this project.
  check                      Validate the config + world seams (no LLM calls).
  run [flags]                Run the eval set → dump/autofail/tasks per agent bucket.
                             --agent <id> --cases <csv|full> --reps <N=1> --model <alias> --out <dir>
  certify [flags]            = run --reps 3 into a '-cert' results dir.
  judge-prompt               Print the packaged generic Claude-judge prompt path.
  judge-merge <dump> <verdicts> [autofail] [out]   Fold Claude verdicts → .judged.json.
  cert <dir> [--bar 0.9]     Fold *.judged.json → cert.json + CERT.md.
  lint [paths…] [--spec-laws]  Purity/firewall/theme lint (+ config spec laws).

Quality verdicts come ONLY from the Claude judge — the run's streamed pass/fail lines are the
deterministic invariant gate.
`;

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
function has(name) {
  return process.argv.includes(`--${name}`);
}

const VALUE_FLAGS = new Set(['--domain', '--agent', '--cases', '--reps', '--model', '--out', '--bar']);

function positionals() {
  const argv = process.argv.slice(2);
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      if (VALUE_FLAGS.has(a)) i++;
      continue;
    }
    out.push(a);
  }
  return out;
}

async function main() {
  const api = await import('@looprun-ai/eval');
  const [cmd, ...rest] = positionals();

  if (!cmd || cmd === 'help' || has('help')) {
    console.log(HELP);
    return;
  }

  if (cmd === 'init') {
    const domain = flag('domain', 'my-domain') ?? 'my-domain';
    const { resolve } = await import('node:path');
    const created = api.initProject(resolve(process.env.LOOPRUN_ROOT ?? process.cwd()), domain);
    console.log(created.length ? `created:\n  ${created.join('\n  ')}` : 'nothing to do (config already present)');
    return;
  }

  if (cmd === 'judge-prompt') {
    console.log(api.judgePromptPath());
    return;
  }

  if (cmd === 'judge-merge') {
    const [dump, verdicts, autofail, out] = rest;
    if (!dump || !verdicts) throw new Error('usage: looprun-eval judge-merge <dump.json> <verdicts.jsonl> [autofail.json] [judged.json]');
    api.mergeVerdictFiles(dump, verdicts, autofail, out);
    return;
  }

  if (cmd === 'cert') {
    const [dir] = rest;
    if (!dir) throw new Error('usage: looprun-eval cert <results-dir>');
    const { config } = await api.loadConfig();
    const summary = api.buildCert(dir, {
      domain: config.domain,
      model: flag('model', typeof config.model === 'string' ? config.model : 'gemini-3.1-flash-lite-thinkoff'),
      bar: Number(flag('bar', String(config.bar ?? 0.9))),
    });
    console.log(`overall ${summary.overall.pass}/${summary.overall.total} = ${(summary.overall.rate * 100).toFixed(1)}% → ${summary.certified ? 'CERTIFIED' : 'BELOW BAR'} (bar ${(summary.bar * 100).toFixed(0)}%) → ${dir}/CERT.md`);
    if (!summary.certified) process.exitCode = 1;
    return;
  }

  if (cmd === 'lint') {
    const paths = rest.length ? rest : ['src', 'evals'];
    const violations = api.lintPaths(paths);
    for (const v of violations) console.error(`${v.file}:${v.line} [${v.rule}] ${v.message}`);
    let specLawFails = [];
    if (has('spec-laws')) {
      const { config } = await api.loadConfig();
      specLawFails = api.lintSpecLaws(config);
      for (const m of specLawFails) console.error(`[spec-laws] ${m}`);
    }
    const total = violations.length + specLawFails.length;
    console.log(total ? `lint: ${total} violation(s)` : 'lint: clean');
    if (total) process.exitCode = 1;
    return;
  }

  if (cmd === 'check') {
    const { config, configPath } = await api.loadConfig();
    const issues = api.checkConfig(config);
    for (const i of issues) console[i.level === 'error' ? 'error' : 'warn'](`${i.level.toUpperCase()}: ${i.message}`);
    const errors = issues.filter((i) => i.level === 'error').length;
    console.log(errors ? `check: ${errors} error(s) — ${configPath}` : `check: green — ${configPath}`);
    if (errors) process.exitCode = 1;
    return;
  }

  if (cmd === 'run' || cmd === 'certify') {
    const { config } = await api.loadConfig();
    const issues = api.checkConfig(config).filter((i) => i.level === 'error');
    if (issues.length) {
      for (const i of issues) console.error(`ERROR: ${i.message}`);
      throw new Error('config check failed — fix the errors above (looprun-eval check)');
    }
    const casesArg = flag('cases', 'full') ?? 'full';
    const summary = await api.runEval(config, {
      agent: flag('agent', undefined),
      cases: casesArg === 'full' ? ['full'] : casesArg.split(',').map((s) => s.trim()).filter(Boolean),
      reps: Number(flag('reps', cmd === 'certify' ? '3' : '1')),
      model: flag('model', undefined),
      out: flag('out', undefined),
      certTag: cmd === 'certify',
    });
    console.log(`\nwrote ${summary.perAgent.length} agent bucket(s) → ${summary.outDir}`);
    return;
  }

  console.error(`unknown command: ${cmd}\n`);
  console.log(HELP);
  process.exitCode = 1;
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exitCode = 1;
});
